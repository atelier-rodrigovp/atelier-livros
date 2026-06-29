import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Loader2, Power, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { enqueueJob, supabase } from "@/lib/supabase";
import { jobAtivoReal, jobStatusBadgeEx, tipoLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";

interface ProjInfo { titulo: string; serie: string | null; volume: number | null; autor: string | null; }
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Configuracoes() {
  const { session } = useSession();
  const { heartbeat, online } = useWorkerStatus(10_000);
  const [enviando, setEnviando] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [salvandoCtl, setSalvandoCtl] = useState(false);
  const [maxPar, setMaxPar] = useState(1); // projetos simultâneos (concorrência)
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projetos, setProjetos] = useState<Record<string, ProjInfo>>({});

  const carregarProjetos = useCallback(async () => {
    const { data } = await supabase.from("projects").select("id,titulo,serie,volume,briefing");
    const m: Record<string, ProjInfo> = {};
    for (const p of (data as { id: string; titulo: string; serie: string | null; volume: number | null; briefing: any }[]) ?? [])
      m[p.id] = { titulo: p.titulo, serie: p.serie, volume: p.volume, autor: p.briefing?.autor ?? null };
    setProjetos(m);
  }, []);

  const carregarControle = useCallback(async () => {
    const { data } = await supabase
      .from("worker_control")
      .select("enabled")
      .maybeSingle();
    setAtivo(data ? data.enabled !== false : true);
    // concorrência (linha de config em jobs; schema-free)
    const { data: cfg } = await supabase
      .from("jobs")
      .select("payload")
      .eq("tipo", "config_producao")
      .limit(1)
      .maybeSingle();
    const n = Number((cfg?.payload as any)?.max_paralelo ?? 1);
    setMaxPar(Number.isFinite(n) ? Math.max(1, Math.min(4, Math.floor(n))) : 1);
  }, []);

  async function definirConcorrencia(n: number) {
    setMaxPar(n); // otimista
    const { data: existente } = await supabase.from("jobs").select("id").eq("tipo", "config_producao").limit(1).maybeSingle();
    if (existente?.id) {
      await supabase.from("jobs").update({ payload: { max_paralelo: n } }).eq("id", existente.id);
    } else {
      await supabase.from("jobs").insert({ owner: session?.user?.id, tipo: "config_producao", status: "paused", payload: { max_paralelo: n } });
    }
    toast.success(`Produção simultânea: ${n} projeto${n > 1 ? "s" : ""} ao mesmo tempo.`);
  }

  const carregarJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .not("tipo", "in", "(controle_escrita,config_producao)")
      .order("created_at", { ascending: false })
      .limit(30);
    setJobs((data as Job[]) ?? []);
  }, []);

  useEffect(() => {
    carregarControle();
    carregarJobs();
    carregarProjetos();
    const ch = supabase
      .channel("config-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_control" }, () => carregarControle())
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => carregarJobs())
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => carregarProjetos())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarControle, carregarJobs, carregarProjetos]);

  // Rótulo do projeto de um job (título + série/volume).
  function projLabel(pid: string | null): string | null {
    const p = pid ? projetos[pid] : null;
    if (!p) return null;
    return `${p.titulo}${p.serie ? ` · ${p.serie}${p.volume ? ` (Vol. ${p.volume})` : ""}` : ""}`;
  }

  // Detalhe de progresso de um job (cap X/Y, fase, palavras, nota…).
  function detalheProgresso(j: Job): string {
    const p: any = j.progresso || {};
    const partes: string[] = [tipoLabel(j.tipo)];
    if (p.cap_atual != null && p.total != null) partes.push(`cap ${p.cap_atual}/${p.total}`);
    if (p.fase) partes.push(`fase ${p.fase}`);
    if (p.etapa && !p.cap_atual) partes.push(String(p.etapa));
    if (p.palavras) partes.push(`${Number(p.palavras).toLocaleString("pt-BR")} palavras`);
    if (p.nota != null) partes.push(`nota ${p.nota}`);
    return partes.join(" · ");
  }

  // Descrição específica para a linha de atividade: prefere o `resumo` humano
  // gravado pelo worker; sem ele, monta de `detalheProgresso` (que cai para tipoLabel).
  function descricaoJob(j: Job): string {
    const r = (j.progresso as any)?.resumo;
    return typeof r === "string" && r.trim() ? r : detalheProgresso(j);
  }

  // Campos crus para tooltip (fase, cap, palavras, nota, retry_at, tentativas).
  function dicaProgresso(j: Job): string {
    const p: any = j.progresso || {};
    const linhas: string[] = [];
    if (p.fase) linhas.push(`fase ${p.fase}`);
    if (p.cap_atual != null && p.total != null) linhas.push(`cap ${p.cap_atual}/${p.total}`);
    if (p.palavras) linhas.push(`${Number(p.palavras).toLocaleString("pt-BR")} palavras`);
    if (p.nota != null) linhas.push(`nota ${p.nota}`);
    if (p.retry_at) linhas.push(`aguarda reset ${new Date(p.retry_at).toLocaleString()}`);
    if (j.attempts) linhas.push(`tentativa ${j.attempts}/${j.max_attempts}`);
    return linhas.join("\n");
  }

  async function reenfileirar(j: Job) {
    const { error } = await supabase
      .from("jobs")
      .update({ status: "queued", locked_by: null, locked_at: null })
      .eq("id", j.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Job reenfileirado — volta para a fila.");
    carregarJobs();
  }

  async function alternarProducao(novo: boolean) {
    setSalvandoCtl(true);
    setAtivo(novo); // otimista
    const { error } = await supabase
      .from("worker_control")
      .upsert(
        { enabled: novo, updated_at: new Date().toISOString() },
        { onConflict: "owner" }
      );
    setSalvandoCtl(false);
    if (error) {
      setAtivo(!novo);
      toast.error(error.message);
    } else {
      toast.success(novo ? "Produção ligada — o worker vai processar a fila." : "Produção desligada — o worker fica ocioso.");
    }
  }

  async function testarWorker() {
    setEnviando(true);
    try {
      await enqueueJob("ping", { origem: "configuracoes" });
      toast.success("Job de teste enfileirado. O worker deve concluí-lo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Job realmente em execução agora (running + worker online + lock fresco).
  const jobRodando = jobs.find((j) => j.status === "running");
  const trabalhando = !!jobRodando && jobAtivoReal({ status: jobRodando.status, workerOnline: online, lockedAt: jobRodando.locked_at });

  // Produção ligada (controla o botão Ligar/Desligar): fila habilitada e worker vivo.
  const produzindo = online && ativo;

  // Badge do worker: parado / pausado / ocioso (ligado, sem tarefa) / produzindo (com tarefa real).
  const estado = !online ? "parado" : !ativo ? "pausado" : trabalhando ? "produzindo" : "ocioso";
  const cfg = {
    produzindo: { cor: "bg-emerald-500", texto: "Produzindo", pulse: true },
    ocioso: { cor: "bg-emerald-500/60", texto: "Ocioso", pulse: false },
    pausado: { cor: "bg-amber-500", texto: "Pausado", pulse: false },
    parado: { cor: "bg-muted-foreground/40", texto: "Parado", pulse: false },
  }[estado];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-muted-foreground">Perfil, worker e atividade.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Conta</CardTitle>
          <CardDescription>Usuário autenticado (single-user).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">E-mail: </span>
            {session?.user?.email}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">UID: </span>
            {session?.user?.id}
          </p>
        </CardContent>
      </Card>

      {/* A) Worker = o PROCESSO na máquina. Só status; o app não inicia processo. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Worker</CardTitle>
          <CardDescription>
            O programa que roda a IA na sua máquina. O app acompanha o status; não inicia o processo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className={cn("inline-block h-3 w-3 rounded-full", cfg.cor, cfg.pulse && "animate-pulse")} />
            <span className="text-lg font-medium">{cfg.texto}</span>
            {heartbeat?.last_seen && (
              <span className="text-sm text-muted-foreground">
                · último sinal {new Date(heartbeat.last_seen).toLocaleString()}
              </span>
            )}
          </div>

          {estado === "parado" && (
            <>
              <p className="text-sm text-muted-foreground">
                O worker não está em execução nesta máquina. O app só controla a produção quando ele está rodando.
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
                  Como iniciar o worker
                </summary>
                <p className="mt-2 text-muted-foreground">
                  Rode o worker uma vez na sua máquina:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run dev</code> na pasta{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">worker/</code>. Depois disso,
                  a produção é controlada aqui.
                </p>
              </details>
            </>
          )}

          {online && (
            trabalhando && jobRodando ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Trabalhando agora</p>
                {jobRodando.project_id && projLabel(jobRodando.project_id) ? (
                  <Link to={`/projeto/${jobRodando.project_id}`} className="font-medium hover:underline">
                    {projLabel(jobRodando.project_id)}
                  </Link>
                ) : (
                  <span className="font-medium">{tipoLabel(jobRodando.tipo)}</span>
                )}
                <p className="mt-0.5 text-sm text-muted-foreground" title={dicaProgresso(jobRodando) || undefined}>{descricaoJob(jobRodando)}</p>
                {(() => {
                  const p: any = jobRodando.progresso || {};
                  if (p.cap_atual == null || !p.total) return null;
                  const pct = Math.min(100, Math.round((Number(p.cap_atual) / Number(p.total)) * 100));
                  return (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Worker ocioso — sem tarefa no momento.</p>
            )
          )}
        </CardContent>
      </Card>

      {/* B) Produção = a FILA de jobs. Isto o app controla (worker_control.enabled). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Produção</CardTitle>
          <CardDescription>Liga e pausa o processamento da fila de jobs pelo worker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(!online && "cursor-not-allowed")}
              title={!online ? "Disponível quando o worker estiver em execução." : undefined}
            >
              <Button
                size="lg"
                variant={produzindo ? "outline" : "default"}
                disabled={salvandoCtl || !online}
                onClick={() => alternarProducao(!produzindo)}
              >
                {salvandoCtl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                {produzindo ? "Desligar produção" : "Ligar produção"}
              </Button>
            </span>
            <span
              className={cn(!online && "cursor-not-allowed")}
              title={!online ? "Disponível quando o worker estiver em execução." : undefined}
            >
              <Button onClick={testarWorker} disabled={enviando || !online} variant="ghost">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Rodar teste (ping)
              </Button>
            </span>
          </div>
          {!online ? (
            <p className="text-xs text-muted-foreground">Disponível quando o worker estiver em execução.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {produzindo
                ? "O worker está processando a fila. Desligar pausa a produção — ele fica ocioso, sem fechar."
                : "Produção pausada: o worker está rodando, mas não processa a fila. Religue para retomar."}
            </p>
          )}

          {/* Concorrência: nº de projetos pesados ao mesmo tempo. */}
          <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 pr-3">
                <p className="text-sm font-medium">Projetos simultâneos</p>
                <p className="text-xs text-muted-foreground">Quantos livros o worker produz ao mesmo tempo (sempre projetos distintos).</p>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((n) => (
                  <Button key={n} size="sm" variant={maxPar === n ? "default" : "outline"} className="h-8 w-8 p-0" onClick={() => definirConcorrencia(n)}>
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Cada projeto simultâneo consome sua cota do plano Max <strong>em paralelo</strong>: 2 livros gastam a janela ~2× mais rápido e podem causar mais pausas “aguardando reset”. A auto-retomada cobre (ninguém vira Erro), mas o throughput não dobra de graça.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Atividade técnica (histórico de jobs). */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Atividade
          </CardTitle>
          <CardDescription>Últimos jobs processados pelo worker.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem atividade ainda.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Tarefa · Projeto</span>
                <span>Atualizado · Status</span>
              </div>
              <ul className="divide-y text-sm">
              {jobs.map((j) => {
                const orfao = j.status === "running" && !jobAtivoReal({ status: j.status, workerOnline: online, lockedAt: j.locked_at });
                const b = orfao ? { label: "Interrompido", variant: "warning" as const } : jobStatusBadgeEx(j);
                const pl = projLabel(j.project_id);
                const dica = orfao ? "O worker caiu durante esta tarefa. Religue o worker para retomar." : undefined;
                const inner = (
                  <>
                    <div className="min-w-0">
                      <span className="font-medium" title={dicaProgresso(j) || undefined}>{descricaoJob(j)}</span>
                      {pl ? <span className="text-muted-foreground"> · {pl}</span> : null}
                      {orfao && <p className="text-xs text-amber-600 dark:text-amber-400">{dica}</p>}
                      {j.erro && !orfao && <p className="truncate text-xs text-destructive" title={j.erro}>{j.erro}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {orfao && (
                        <Button
                          size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={(e) => { e.preventDefault(); reenfileirar(j); }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reenfileirar
                        </Button>
                      )}
                      <span
                        className="hidden text-xs text-muted-foreground sm:inline"
                        title={`Iniciado em ${new Date(j.created_at).toLocaleString()}${j.updated_at ? `\nAtualizado em ${new Date(j.updated_at).toLocaleString()}` : ""}`}
                      >
                        {new Date(j.updated_at ?? j.created_at).toLocaleString()}
                      </span>
                      <Badge variant={b.variant} title={dica}>{b.label}</Badge>
                    </div>
                  </>
                );
                return (
                  <li key={j.id}>
                    {j.project_id ? (
                      <Link to={`/projeto/${j.project_id}`} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-muted/50">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 py-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
