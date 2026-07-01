import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coins, Gauge, RotateCcw, Timer, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

// Espelha worker/src/telemetria.ts (payload da linha jobs tipo='telemetria').
type Usage = { input: number; cache_creation: number; cache_read: number; output: number; msgs: number };
type UsageCusto = Usage & { custo_usd: number };
interface Telemetria {
  gerado_em: string;
  transcripts: number;
  totais: Usage;
  custo_proxy_usd: number;
  por_modelo: Record<string, UsageCusto>;
  por_papel: Record<string, UsageCusto>;
  spawns: Record<string, number>;
  cache: { read: number; creation: number; fresco: number };
  throughput: {
    restarts: number; calls: number; rc0: number; rc1: number;
    sem_rc: number; hard_fail_32k: number; pausas_falso_limite: number;
  };
  gargalo: { papel: string; custo_usd: number; pct_output: number } | null;
}
type Row = { projectId: string; titulo: string; tel: Telemetria };

const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));
const rotuloPapel = (p: string) =>
  p.replace("orquestrador/inline:", "orquestrador ").replace("subagente:", "subagente ")
    .replace("livro-", "").replace(/:/g, " ");

function Kpi({ label, valor, sub, Icon, tone }: { label: string; valor: string; sub?: string; Icon: typeof Gauge; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone === "danger" ? "text-red-500/70" : tone === "warn" ? "text-amber-500/70" : "text-muted-foreground/50"}`} />
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Observabilidade() {
  const [rows, setRows] = useState<Row[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [{ data: tels }, { data: projs }] = await Promise.all([
      supabase.from("jobs").select("project_id,payload").eq("tipo", "telemetria"),
      supabase.from("projects").select("id,titulo"),
    ]);
    const titulo: Record<string, string> = {};
    for (const p of (projs as { id: string; titulo: string }[]) ?? []) titulo[p.id] = p.titulo;
    const out: Row[] = [];
    for (const t of (tels as { project_id: string; payload: Telemetria }[]) ?? []) {
      if (t.payload?.totais) out.push({ projectId: t.project_id, titulo: titulo[t.project_id] ?? "—", tel: t.payload });
    }
    out.sort((a, b) => b.tel.custo_proxy_usd - a.tel.custo_proxy_usd);
    setRows(out);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    const ch = supabase.channel("observabilidade")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  const global = useMemo(() => {
    const g = { custo: 0, output: 0, cacheRead: 0, cacheCreation: 0, restarts: 0, hardFail: 0, semRc: 0, pausas: 0, calls: 0 };
    for (const r of rows) {
      g.custo += r.tel.custo_proxy_usd;
      g.output += r.tel.totais.output;
      g.cacheRead += r.tel.cache.read;
      g.cacheCreation += r.tel.cache.creation;
      g.restarts += r.tel.throughput.restarts;
      g.hardFail += r.tel.throughput.hard_fail_32k;
      g.semRc += r.tel.throughput.sem_rc;
      g.pausas += r.tel.throughput.pausas_falso_limite;
      g.calls += r.tel.throughput.calls;
    }
    return g;
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Observabilidade</h1>
        <p className="mt-1 text-muted-foreground">
          Quem consome a cota (token) e quem serializa a produção (throughput). Verdade do disco: agregado dos transcripts + runner.log.
        </p>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando telemetria…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          Sem telemetria ainda. Rode <code className="rounded bg-muted px-1">npx tsx scripts/backfill-telemetria.ts</code> no worker, ou escreva um capítulo.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Custo-proxy total" valor={`$${global.custo.toFixed(0)}`} sub="ranque relativo, não fatura" Icon={Coins} />
            <Kpi label="Output (cota)" valor={fmtTok(global.output)} sub={`cache_read ${fmtTok(global.cacheRead)}`} Icon={Zap} />
            <Kpi label="Restarts do runner" valor={String(global.restarts)} sub={`${global.semRc} calls mortas s/ rc`} Icon={RotateCcw} tone={global.restarts > 20 ? "danger" : undefined} />
            <Kpi label="Falso limite / 32k-fail" valor={`${global.pausas} / ${global.hardFail}`} sub="pausas desperdiçadas / hard-fails" Icon={AlertTriangle} tone={global.pausas + global.hardFail > 0 ? "warn" : undefined} />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Por projeto — gargalo destacado</h2>
            {rows.map((r) => {
              const papeis = Object.entries(r.tel.por_papel).sort((a, b) => b[1].custo_usd - a[1].custo_usd);
              const maxCusto = papeis[0]?.[1].custo_usd || 1;
              const tp = r.tel.throughput;
              return (
                <div key={r.projectId} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{r.titulo}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">${r.tel.custo_proxy_usd.toFixed(0)}</Badge>
                      <span className="tabular-nums">out {fmtTok(r.tel.totais.output)}</span>
                      <span className="flex items-center gap-1 tabular-nums"><RotateCcw className="h-3 w-3" />{tp.restarts}</span>
                      <span className="flex items-center gap-1 tabular-nums"><Timer className="h-3 w-3" />{tp.pausas_falso_limite} pausas</span>
                    </div>
                  </div>

                  {r.tel.gargalo && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs">
                      <Gauge className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-muted-foreground">Gargalo de token:</span>
                      <span className="font-medium">{rotuloPapel(r.tel.gargalo.papel)}</span>
                      <span className="text-muted-foreground">consome {r.tel.gargalo.pct_output}% do output.</span>
                    </p>
                  )}

                  <div className="mt-3 space-y-1.5">
                    {papeis.map(([papel, u]) => (
                      <div key={papel} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-xs">{rotuloPapel(papel)}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${papel === r.tel.gargalo?.papel ? "bg-red-500/70" : "bg-primary/50"}`}
                            style={{ width: `${Math.max(2, (u.custo_usd / maxCusto) * 100)}%` }} />
                        </div>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">${u.custo_usd.toFixed(0)}</span>
                        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{fmtTok(u.output)}</span>
                      </div>
                    ))}
                  </div>

                  {(tp.hard_fail_32k > 0 || tp.sem_rc > 0) && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{tp.calls} chamadas · {tp.rc0} ok · {tp.rc1} rc=1</span>
                      {tp.sem_rc > 0 && <span className="text-amber-600 dark:text-amber-500">{tp.sem_rc} mortas sem rc (~{Math.round((tp.sem_rc / Math.max(1, tp.calls)) * 100)}%)</span>}
                      {tp.hard_fail_32k > 0 && <span className="text-red-600 dark:text-red-500">{tp.hard_fail_32k} hard-fail 32k</span>}
                      {Object.keys(r.tel.spawns).length > 0 && (
                        <span>spawns: {Object.entries(r.tel.spawns).map(([k, v]) => `${k.replace("livro-", "")} ${v}`).join(" · ")}</span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Custo-proxy pondera opus/sonnet/haiku só para ranquear papéis (não é fatura). Paralelizar (max_paralelo) aumenta throughput, não a cota semanal.
          </p>
        </>
      )}
    </div>
  );
}
