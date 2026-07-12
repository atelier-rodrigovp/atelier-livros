import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Coins, Gauge, PauseCircle, RotateCcw, Timer, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { deriveWritingStatus } from "@/lib/operationalStatus";

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

// Progresso que o worker grava em jobs.progresso (setProgress).
type Progresso = {
  fase?: string; cap_atual?: number; total?: number; nota?: number | null; palavras?: number;
  retry_at?: string | null; aguardando_reset?: boolean; motivo?: string; continua?: boolean;
  quality_status?: "blocked_quality" | "blocked_infrastructure"; quality_stage?: string;
  quality_blockers?: string[];
};
type JobAtivo = { project_id: string; status: string; progresso: Progresso | null; created_at: string };
// Projeto EM PRODUÇÃO agora: escrevendo/revisão OU com job escrever_livro ativo.
type Vivo = { projectId: string; titulo: string; projStatus: string; workerOnline: boolean; job?: JobAtivo; tel?: Telemetria };

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

// Estado derivado do job ativo: rodando / na fila / pausado (limite do Max).
function statusVivo(v: Vivo): { label: string; dot: string; detail?: string } {
  const s = deriveWritingStatus(v.job, v.workerOnline);
  const dot = s.tone === "danger" ? "bg-red-500" : s.tone === "warning" ? "bg-amber-500" : s.tone === "success" ? "bg-emerald-500 animate-pulse" : s.tone === "queued" ? "bg-sky-500" : "bg-muted-foreground/40";
  return { label: s.label, dot, detail: s.detail };
}

// Seção "Em produção agora": comportamento de consumo AO VIVO dos projetos escrevendo.
function ProducaoAgora({ vivos }: { vivos: Vivo[] }) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Activity className="h-4 w-4 text-emerald-500" /> Estado operacional da escrita
        <span className="text-sm font-normal text-muted-foreground">({vivos.length})</span>
      </h2>
      {vivos.length === 0 ? (
        <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum projeto escrevendo no momento.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {vivos.map((v) => {
            const st = statusVivo(v);
            const pg = v.job?.progresso ?? {};
            const cap = Number(pg.cap_atual ?? 0);
            const total = Number(pg.total ?? 0);
            const tel = v.tel;
            const tp = tel?.throughput;
            const tokCap = tel && cap > 0 ? tel.totais.output / cap : 0;
            const projTotal = tel && cap > 0 && total > 0 ? (tel.totais.output / cap) * total : 0;
            return (
              <div key={v.projectId} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{v.titulo}</h3>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`inline-block h-2 w-2 rounded-full ${st.dot}`} /> {st.label}
                  </span>
                </div>
                {st.detail && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
                    <PauseCircle className="h-3 w-3" /> {st.detail}
                  </p>
                )}

                {/* Progresso */}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>{pg.fase ?? "—"}{cap || total ? ` · ${cap}/${total || "?"} cap` : ""}</span>
                    {pg.palavras ? <span className="tabular-nums">{fmtTok(pg.palavras)} palavras</span> : null}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-emerald-500/70" style={{ width: `${total ? Math.min(100, (cap / total) * 100) : 0}%` }} />
                  </div>
                </div>

                {/* Consumo */}
                {tel && tp ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div><div className="text-muted-foreground">output</div><div className="font-medium tabular-nums">{fmtTok(tel.totais.output)}</div></div>
                      <div><div className="text-muted-foreground">tokens/cap</div><div className="font-medium tabular-nums">{tokCap ? fmtTok(Math.round(tokCap)) : "—"}</div></div>
                      <div><div className="text-muted-foreground">custo-proxy</div><div className="font-medium tabular-nums">${tel.custo_proxy_usd.toFixed(0)}</div></div>
                      <div><div className="text-muted-foreground">proj. p/ livro</div><div className="font-medium tabular-nums">{projTotal ? fmtTok(Math.round(projTotal)) : "—"}</div></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span className={`flex items-center gap-1 tabular-nums ${tp.restarts > 15 ? "text-red-600 dark:text-red-500" : "text-muted-foreground"}`}>
                        <RotateCcw className="h-3 w-3" />{tp.restarts} restarts
                      </span>
                      <span className={`flex items-center gap-1 tabular-nums ${tp.pausas_falso_limite > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>
                        <Timer className="h-3 w-3" />{tp.pausas_falso_limite} falso-limite
                      </span>
                      {tp.hard_fail_32k > 0 && <span className="text-red-600 dark:text-red-500">{tp.hard_fail_32k} 32k-fail</span>}
                      {tel.gargalo && <span className="text-muted-foreground">gargalo: <span className="font-medium text-foreground">{rotuloPapel(tel.gargalo.papel)}</span> {tel.gargalo.pct_output}%</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">medido ao fim de cada run · última: {new Date(tel.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ) : (
                  <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">Consumo ainda não medido — grava ao fim do 1º run do runner.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Observabilidade() {
  const { online } = useWorkerStatus();
  const [rows, setRows] = useState<Row[]>([]);
  const [vivos, setVivos] = useState<Vivo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [{ data: tels }, { data: projs }, { data: ativos }] = await Promise.all([
      supabase.from("jobs").select("project_id,payload").eq("tipo", "telemetria"),
      supabase.from("projects").select("id,titulo,status"),
      supabase.from("jobs").select("project_id,status,progresso,created_at")
        .eq("tipo", "escrever_livro").in("status", ["running", "queued", "paused"]).order("created_at", { ascending: false }),
    ]);
    const titulo: Record<string, string> = {};
    const projStatus: Record<string, string> = {};
    for (const p of (projs as { id: string; titulo: string; status: string }[]) ?? []) {
      titulo[p.id] = p.titulo; projStatus[p.id] = p.status;
    }
    const telOf: Record<string, Telemetria> = {};
    const out: Row[] = [];
    for (const t of (tels as { project_id: string; payload: Telemetria }[]) ?? []) {
      if (t.payload?.totais) { telOf[t.project_id] = t.payload; out.push({ projectId: t.project_id, titulo: titulo[t.project_id] ?? "—", tel: t.payload }); }
    }
    out.sort((a, b) => b.tel.custo_proxy_usd - a.tel.custo_proxy_usd);
    setRows(out);

    // Job ativo por projeto (running vence queued; o mais recente).
    const jobOf: Record<string, JobAtivo> = {};
    for (const j of (ativos as JobAtivo[]) ?? []) {
      if (j.status === "paused" && !j.progresso?.quality_status) continue;
      const cur = jobOf[j.project_id];
      if (!cur || (j.status === "running" && cur.status !== "running")) jobOf[j.project_id] = j;
    }
    const idsVivos = new Set<string>(Object.keys(jobOf));
    const rank = (v: Vivo) => (v.job?.status === "running" ? 0 : v.job?.status === "queued" ? 1 : 2);
    const vv: Vivo[] = [...idsVivos].map((id) => ({
      projectId: id, titulo: titulo[id] ?? "—", projStatus: projStatus[id] ?? "—", workerOnline: online, job: jobOf[id], tel: telOf[id],
    })).sort((a, b) => rank(a) - rank(b));
    setVivos(vv);
    setCarregando(false);
  }, [online]);

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

      {!carregando && <ProducaoAgora vivos={vivos} />}

      {carregando ? (
        <p className="text-muted-foreground">Carregando telemetria…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          Sem telemetria histórica ainda — ela é gravada ao fim de cada run do runner (ou rode <code className="rounded bg-muted px-1">npx tsx scripts/backfill-telemetria.ts</code>).
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
            <h2 className="text-lg font-semibold tracking-tight">Histórico por projeto — gargalo destacado</h2>
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
