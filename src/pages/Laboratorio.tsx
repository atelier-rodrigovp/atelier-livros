// Laboratório de skills (Engine V2, F7): roda os canários (laboratorio_v2),
// mostra o relatório (métricas × skill, regressões, matriz de confusão) e a
// avaliação cega HUMANA — o gabarito só é consultado depois do palpite.
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, Play, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import type { Job } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

interface LabRelatorio {
  execucaoId?: string;
  anterior?: string;
  metricas: Record<string, { porSkill: Record<string, number> }>;
  distinguibilidade?: number;
  matrizConfusao?: Record<string, Record<string, number>>;
  regressoes: string[];
  vazamentos: string[];
  decisao: "aprovar" | "rejeitar" | "pendente";
}

interface LabCega {
  amostraId: string;
  hash: string;
  categoria: string;
  texto: string;
}

interface ProgressoLab {
  fase?: string;
  etapa?: string;
  lab_relatorio?: LabRelatorio;
  lab_execucao_id?: string;
  lab_cegas?: LabCega[];
  lab_gabarito?: Record<string, string>;
}

const DECISAO: Record<string, { label: string; variant: BadgeVariant }> = {
  aprovar: { label: "aprovar", variant: "success" },
  rejeitar: { label: "rejeitar", variant: "destructive" },
  pendente: { label: "pendente", variant: "warning" },
};

const JOB_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  queued: { label: "na fila", variant: "secondary" },
  running: { label: "executando", variant: "default" },
  done: { label: "concluído", variant: "success" },
  error: { label: "erro", variant: "destructive" },
  paused: { label: "pausado", variant: "warning" },
  canceled: { label: "cancelado", variant: "outline" },
};

function fmtNum(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtData(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function pct(v?: number): string {
  return v == null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`;
}

function progressoDe(j: Job): ProgressoLab {
  return (j.progresso ?? {}) as ProgressoLab;
}

function skillsDoRelatorio(rel?: LabRelatorio, gabarito?: Record<string, string>): string[] {
  const doRel = rel
    ? Array.from(new Set(Object.values(rel.metricas ?? {}).flatMap((m) => Object.keys(m.porSkill ?? {}))))
    : [];
  if (doRel.length) return doRel;
  return gabarito ? Array.from(new Set(Object.values(gabarito))) : [];
}

function Relatorio({ rel }: { rel: LabRelatorio }) {
  const skills = skillsDoRelatorio(rel);
  const dec = DECISAO[rel.decisao] ?? { label: rel.decisao, variant: "outline" as BadgeVariant };
  const matriz = rel.matrizConfusao;
  const colunas = matriz
    ? Array.from(new Set(Object.values(matriz).flatMap((linha) => Object.keys(linha))))
    : [];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Decisão de release:</span>
        <Badge variant={dec.variant}>{dec.label}</Badge>
        <span className="text-xs text-muted-foreground">
          · distinguibilidade da máquina: <span className="tabular-nums">{pct(rel.distinguibilidade)}</span>
        </span>
        {rel.execucaoId && <span className="text-xs text-muted-foreground">· execução {rel.execucaoId}</span>}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">Métrica</th>
              {skills.map((s) => (
                <th key={s} className="px-3 py-2 font-medium">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(rel.metricas ?? {}).map(([m, v]) => (
              <tr key={m} className="border-b last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{m}</td>
                {skills.map((s) => (
                  <td key={s} className="px-3 py-2 tabular-nums">{fmtNum(v.porSkill?.[s])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!!rel.regressoes?.length && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Regressões</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
            {rel.regressoes.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {!!rel.vazamentos?.length && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vazamentos</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
            {rel.vazamentos.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      )}

      {matriz && colunas.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Matriz de confusão (real × palpite)
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium">real \ palpite</th>
                  {colunas.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(matriz).map(([real, linha]) => (
                  <tr key={real} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{real}</td>
                    {colunas.map((c) => (
                      <td key={c} className="px-3 py-2 tabular-nums">{fmtNum(linha[c] ?? 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AvaliacaoCega({
  jobId,
  cegas,
  gabarito,
  skills,
  distinguibilidade,
}: {
  jobId: string;
  cegas: LabCega[];
  gabarito: Record<string, string>;
  skills: string[];
  distinguibilidade?: number;
}) {
  const chave = `lab-cego-${jobId}`;
  const [palpites, setPalpites] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(chave) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });

  const pendentes = cegas.filter((c) => !palpites[c.amostraId]);
  const atual = pendentes[0];
  const respondidas = cegas.length - pendentes.length;

  function registrar(skillId: string) {
    if (!atual) return;
    const novo = { ...palpites, [atual.amostraId]: skillId };
    setPalpites(novo);
    localStorage.setItem(chave, JSON.stringify(novo));
  }

  if (!atual) {
    const acertos = cegas.filter((c) => palpites[c.amostraId] === gabarito[c.hash]).length;
    const humano = cegas.length ? acertos / cegas.length : 0;
    return (
      <div className="space-y-2 text-sm">
        <p>
          Você acertou <span className="font-semibold tabular-nums">{acertos}</span> de{" "}
          <span className="tabular-nums">{cegas.length}</span> amostras —{" "}
          <span className="font-semibold tabular-nums">{pct(humano)}</span> de acerto humano.
        </p>
        <p className="text-muted-foreground">
          Distinguibilidade da máquina: <span className="tabular-nums">{pct(distinguibilidade)}</span>.
          {distinguibilidade != null &&
            (humano >= distinguibilidade
              ? " Você distinguiu as vozes tão bem ou melhor que o avaliador cego automático."
              : " O avaliador cego automático distinguiu as vozes melhor que você nesta rodada.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Amostra <span className="tabular-nums">{respondidas + 1}</span> de{" "}
          <span className="tabular-nums">{cegas.length}</span>
        </span>
        <Badge variant="outline">{atual.categoria}</Badge>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/20 p-4">
        <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed">{atual.texto}</p>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Qual skill escreveu este trecho?</p>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => registrar(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Laboratorio() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("tipo", "laboratorio_v2")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }
    setJobs((data as Job[]) ?? []);
    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    const ch = supabase
      .channel("laboratorio")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregar]);

  async function executar() {
    setExecutando(true);
    try {
      await enqueueJob("laboratorio_v2", {});
      toast.success("Canários enfileirados — o worker executa em seguida.");
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExecutando(false);
    }
  }

  const atual = jobs[0];
  const pgAtual = atual ? progressoDe(atual) : undefined;
  const jobRelatorio = jobs.find((j) => j.status === "done" && progressoDe(j).lab_relatorio);
  const pgRelatorio = jobRelatorio ? progressoDe(jobRelatorio) : undefined;
  const emAndamento = atual?.status === "queued" || atual?.status === "running";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Laboratório</h1>
          <p className="mt-1 text-muted-foreground">
            Canários das skills V2: métricas por voz, regressões e avaliação cega.
          </p>
        </div>
        <Button onClick={executar} disabled={executando || emAndamento}>
          {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Executar canários
        </Button>
      </div>

      {erro ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">Falha ao carregar o laboratório: {erro}</p>
          <Button size="sm" variant="outline" onClick={() => { setCarregando(true); carregar(); }}>
            <RotateCw className="h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      ) : carregando ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <FlaskConical className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhuma execução do laboratório ainda.</p>
          <Button size="sm" onClick={executar} disabled={executando}>
            {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar canários
          </Button>
        </div>
      ) : (
        <>
          {atual && emAndamento && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>
                  {atual.status === "queued"
                    ? "Na fila — aguardando o worker."
                    : `${pgAtual?.fase ?? "LAB"}${pgAtual?.etapa ? ` · ${pgAtual.etapa}` : ""}`}
                </p>
              </CardContent>
            </Card>
          )}

          {atual && atual.status === "error" && (
            <Card>
              <CardContent className="space-y-3 py-6">
                <p className="text-sm text-destructive">
                  A última execução falhou: {atual.erro ?? "erro sem mensagem"}
                </p>
                <Button size="sm" variant="outline" onClick={executar} disabled={executando}>
                  <Play className="h-3.5 w-3.5" /> Executar de novo
                </Button>
              </CardContent>
            </Card>
          )}

          {pgRelatorio?.lab_relatorio && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Relatório</CardTitle>
                <CardDescription>
                  Última execução concluída · {fmtData(jobRelatorio?.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Relatorio rel={pgRelatorio.lab_relatorio} />
              </CardContent>
            </Card>
          )}

          {jobRelatorio && !!pgRelatorio?.lab_cegas?.length && pgRelatorio.lab_gabarito && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Avaliação cega humana</CardTitle>
                <CardDescription>
                  Leia cada trecho e diga qual skill o escreveu — o gabarito só é revelado no fim.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AvaliacaoCega
                  key={jobRelatorio.id}
                  jobId={jobRelatorio.id}
                  cegas={pgRelatorio.lab_cegas}
                  gabarito={pgRelatorio.lab_gabarito}
                  skills={skillsDoRelatorio(pgRelatorio.lab_relatorio, pgRelatorio.lab_gabarito)}
                  distinguibilidade={pgRelatorio.lab_relatorio?.distinguibilidade}
                />
              </CardContent>
            </Card>
          )}

          <details className="rounded-md border">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
              Execuções anteriores ({jobs.length})
            </summary>
            <ul className="space-y-1 border-t px-3 py-2 text-xs">
              {jobs.map((j) => {
                const b = JOB_BADGE[j.status] ?? { label: j.status, variant: "outline" as BadgeVariant };
                const rel = progressoDe(j).lab_relatorio;
                return (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 py-1">
                    <span className="tabular-nums text-muted-foreground">{fmtData(j.created_at)}</span>
                    <Badge variant={b.variant}>{b.label}</Badge>
                    {rel && (
                      <span className="text-muted-foreground">
                        decisão: {rel.decisao} · distinguibilidade {pct(rel.distinguibilidade)}
                      </span>
                    )}
                    {j.status === "error" && j.erro && (
                      <span className="max-w-full truncate text-destructive" title={j.erro}>{j.erro}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
