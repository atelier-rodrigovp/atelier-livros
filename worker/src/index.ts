// Agent-worker: loop de polling + lock atômico + dispatch + reentrância + heartbeat.
// Roda na máquina onde o Claude Code (MAX) está logado. NÃO publicar.
import "dotenv/config";
import { sb, OWNER } from "./supabase.js";
import { executarJob, type Job } from "./jobs.js";
import { LimiteMaxError, deveRecuperar } from "./limite-max.js";
import { escolherProximo, normalizarMaxParalelo, type ProjInfo } from "./fila.js";

// Usar a assinatura MAX (login OAuth do Claude Code), não créditos de API.
// Se ANTHROPIC_API_KEY estiver no ambiente, o `claude` headless a prioriza e
// cobra da API (créditos avulsos). Removendo do processo, ele cai no OAuth.
delete process.env.ANTHROPIC_API_KEY;

// Teto de tokens de SAÍDA por mensagem do `claude` headless. Sem isto, o default
// (32000) faz o micro-loop de revisão — que o orquestrador tende a renderizar inline
// — estourar com "API Error: response exceeded the 32000 output token maximum" (rc=1),
// jogando fora ~40min de sessão e disparando um restart caro. 64000 dá folga sem
// custo em regime normal (só cobra o que de fato gerar). Override explícito vence.
if (!process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) {
  process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = "64000";
}

const WORKER_ID = process.env.WORKER_ID || "worker-local";
const POLL = Number(process.env.POLL_INTERVAL_MS || 5000);
const STALE_MIN = Number(process.env.HEARTBEAT_STALE_MIN || 15);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Heartbeat: registra presença para o painel mostrar worker online/offline.
async function heartbeat(extra: Record<string, unknown> = {}) {
  const { error } = await sb.from("worker_heartbeats").upsert(
    {
      worker_id: WORKER_ID,
      owner: OWNER,
      last_seen: new Date().toISOString(),
      status: { ...extra },
    },
    { onConflict: "owner,worker_id" }
  );
  if (error) console.error("[heartbeat] erro:", error.message);
}

// Recupera jobs que morreram como 'error' por LIMITE DO MAX ou por "não avançou
// em N/total" (N>0) num livro longo íntegro — throttle/interrupção, não travamento.
// Volta para 'queued', limpa o erro, zera attempts. NÃO toca em erros reais
// (fundação ausente, crédito, disco). Dedupe: 1 recuperado por projeto (e pula se
// o projeto já tem um job queued aberto) — mata os "2× Na fila".
async function recuperarLimiteMax() {
  const { data, error } = await sb
    .from("jobs")
    .select("id,tipo,project_id,erro,progresso")
    .eq("owner", OWNER)
    .eq("status", "error")
    .not("erro", "is", null);
  if (error) return;
  // projetos que já têm escrever_livro queued aberto → não recuperar (evita duplicar)
  const { data: abertos } = await sb.from("jobs").select("project_id")
    .eq("owner", OWNER).eq("tipo", "escrever_livro").eq("status", "queued");
  const jaAberto = new Set((abertos ?? []).map((a: any) => a.project_id));
  for (const j of data ?? []) {
    if (!deveRecuperar(String((j as any).erro ?? ""))) continue;
    const pid = (j as any).project_id;
    if (pid && jaAberto.has(pid)) continue; // dedupe por projeto
    const progresso = { ...(((j as any).progresso as Record<string, unknown>) ?? {}), aguardando_reset: false, retry_at: null, motivo: "limite/interrupção do Max (recuperado)" };
    const { error: upErr } = await sb
      .from("jobs")
      .update({ status: "queued", erro: null, attempts: 0, progresso, locked_by: null, locked_at: null })
      .eq("id", (j as any).id)
      .eq("status", "error");
    if (!upErr) {
      if (pid) jaAberto.add(pid);
      console.log(`[recuperação] ${(j as any).tipo} ${(j as any).id} (proj ${pid}) era 'error' por Max/interrupção → re-enfileirado.`);
    }
  }
}

// Recupera jobs 'running' órfãos (worker caiu) -> volta para 'queued'.
async function recuperarOrfaos() {
  const limite = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  await sb
    .from("jobs")
    .update({ status: "queued", locked_by: null, locked_at: null })
    .eq("owner", OWNER)
    .eq("status", "running")
    .lt("locked_at", limite);
}

// Flag de controle global (a web liga/pausa TODO o processamento). Default: ativo.
// Fail-open: erro transitório não derruba o worker.
async function processamentoAtivo(): Promise<boolean> {
  const { data, error } = await sb
    .from("worker_control")
    .select("enabled")
    .eq("owner", OWNER)
    .maybeSingle();
  if (error) return true;
  return data ? data.enabled !== false : true;
}

// Pausa SÓ a escrita de livros (economiza tokens sem parar entrevistas/capas/etc).
// Implementada sem alterar o schema: uma linha de controle em `jobs`
// (tipo='controle_escrita', status='paused') que nenhum picker reivindica.
// Existir essa linha = escrita pausada. Fail-open em erro transitório.
async function escritaPausada(): Promise<boolean> {
  const { data, error } = await sb
    .from("jobs")
    .select("id")
    .eq("owner", OWNER)
    .eq("tipo", "controle_escrita")
    .eq("status", "paused")
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

// Jobs interativos rodam numa faixa PARALELA (não esperam atrás de jobs pesados).
const INTERATIVOS = ["entrevistar", "ping"];
// Linhas de controle (nunca reivindicadas como trabalho).
const CONTROLE = ["controle_escrita", "config_producao"];

// Concorrência: nº de projetos pesados simultâneos (schema-free: linha de config em
// `jobs` tipo='config_producao'; fallback env MAX_PARALLEL_HEAVY; default 1).
async function maxParalelo(): Promise<number> {
  const { data, error } = await sb.from("jobs").select("payload")
    .eq("owner", OWNER).eq("tipo", "config_producao").eq("status", "paused").limit(1);
  const bruto = error ? undefined : (data?.[0]?.payload as any)?.max_paralelo;
  return normalizarMaxParalelo(bruto ?? process.env.MAX_PARALLEL_HEAVY ?? 1);
}

// Picker da faixa PESADA com prioridade/pausa por projeto e exclusão de concorrência
// (nunca 2 jobs do mesmo project_id). Schema-free: lê prioridade/pausa de
// projects.briefing (degrade gracioso: chaves ausentes → defaults). Lock atômico.
async function pegarProximoPesado(excluir: string[], projetosRodando: Set<string>): Promise<Job | null> {
  const { data: cand } = await sb.from("jobs").select("*").eq("owner", OWNER).eq("status", "queued")
    .not("tipo", "in", `(${excluir.join(",")})`).order("created_at", { ascending: true }).limit(40);
  if (!cand?.length) return null;
  const pids = [...new Set((cand as any[]).map((j) => j.project_id).filter(Boolean))] as string[];
  const proj = new Map<string, ProjInfo>();
  if (pids.length) {
    const { data: ps } = await sb.from("projects").select("id,briefing").eq("owner", OWNER).in("id", pids);
    for (const p of ps ?? []) {
      const b: any = (p as any).briefing ?? {};
      proj.set((p as any).id, { prioridade: Number(b?.prioridade ?? 0) || 0, pausada: b?.producao_pausada === true });
    }
  }
  const escolhido = escolherProximo(cand as any[], proj, projetosRodando);
  if (!escolhido) return null;
  const { data: claimed } = await sb.from("jobs")
    .update({ status: "running", locked_by: WORKER_ID, locked_at: new Date().toISOString() })
    .eq("id", escolhido.id).eq("status", "queued").select();
  return claimed && claimed.length ? (claimed[0] as Job) : null;
}

// Lock: pega 1 job queued (filtrável por tipo) e marca running atomicamente.
async function pegarProximo(opts: { incluir?: string[]; excluir?: string[] } = {}): Promise<Job | null> {
  let q = sb.from("jobs").select("*").eq("owner", OWNER).eq("status", "queued");
  if (opts.incluir) q = q.in("tipo", opts.incluir);
  if (opts.excluir) q = q.not("tipo", "in", `(${opts.excluir.join(",")})`);
  const { data: cand } = await q.order("created_at", { ascending: true }).limit(10);
  // Pula jobs aguardando o reset do Max (progresso.retry_at no futuro). Pega o
  // mais antigo elegível — jobs em espera não bloqueiam a fila.
  const agora = Date.now();
  const job = (cand ?? []).find((j: any) => {
    const ra = j.progresso?.retry_at;
    return !ra || Number.isNaN(Date.parse(ra)) || Date.parse(ra) <= agora;
  });
  if (!job) return null;
  // claim condicional: só vence quem ainda vê status='queued'
  const { data: claimed } = await sb
    .from("jobs")
    .update({
      status: "running",
      locked_by: WORKER_ID,
      locked_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select();
  return claimed && claimed.length ? (claimed[0] as Job) : null;
}

async function finalizar(jobId: string, patch: Record<string, unknown>) {
  const { error } = await sb.from("jobs").update(patch).eq("id", jobId);
  if (error) console.error(`[job ${jobId}] falha ao gravar status final: ${error.message}`);
}

async function verificarConexao() {
  const { error } = await sb
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner", OWNER);
  if (error) {
    throw new Error(
      `Falha ao conectar no Supabase (verifique URL/service_role/OWNER_USER_ID): ${error.message}`
    );
  }
}

async function loop() {
  if (!OWNER) throw new Error("OWNER_USER_ID não configurado no worker/.env");
  await verificarConexao();
  await recuperarLimiteMax(); // na inicialização: ressuscita jobs mortos por limite do Max
  await heartbeat({ estado: "online" });
  console.log(
    `[worker ${WORKER_ID}] conectado. owner=${OWNER} poll=${POLL}ms stale=${STALE_MIN}min`
  );

  const hb = setInterval(() => heartbeat({ estado: "idle" }), 30_000);
  hb.unref?.();

  // Duas faixas concorrentes: pesados em série + interativos em paralelo.
  await Promise.all([loopPesado(), loopInterativo()]);
}

// Executa um job com keepalive de locked_at (evita recuperação indevida de órfão)
// e tratamento de erro com backoff/reenfileiramento.
async function processarJob(job: Job) {
  console.log(`[job ${job.id}] ${job.tipo} — iniciando`);
  await heartbeat({ estado: "busy", job: job.id, tipo: job.tipo });
  const keepalive = setInterval(() => {
    sb.from("jobs").update({ locked_at: new Date().toISOString() }).eq("id", job.id).then(() => {});
  }, 60_000);
  keepalive.unref?.();
  try {
    await executarJob(job, heartbeat);
    await finalizar(job.id, { status: "done", erro: null, locked_by: null, locked_at: null });
    console.log(`[job ${job.id}] done`);
  } catch (e: any) {
    // Limite do plano Max = throttle temporário, NÃO erro: pausa o job (mantém
    // 'queued' com retry_at no progresso) e NÃO consome max_attempts. O picker o
    // re-dispara sozinho quando retry_at passar (retoma do disco).
    if (e instanceof LimiteMaxError || e?.name === "LimiteMaxError") {
      const retryAt = (e as LimiteMaxError).retryAt;
      const { data: cur } = await sb.from("jobs").select("progresso").eq("id", job.id).single();
      const progresso = { ...((cur?.progresso as Record<string, unknown>) ?? {}), aguardando_reset: true, retry_at: retryAt, motivo: "limite do plano Max" };
      await finalizar(job.id, { status: "queued", erro: null, progresso, locked_by: null, locked_at: null });
      console.log(`[job ${job.id}] limite do Max — aguardando reset até ${retryAt} (não conta tentativa)`);
      return;
    }
    const msg = String(e?.message ?? e).slice(0, 2000);
    const { data } = await sb.from("jobs").select("attempts,max_attempts").eq("id", job.id).single();
    const attempts = (data?.attempts ?? 0) + 1;
    const reenfileira = attempts < (data?.max_attempts ?? 3);
    await finalizar(job.id, {
      status: reenfileira ? "queued" : "error",
      attempts,
      erro: msg,
      locked_by: null,
      locked_at: null,
    });
    console.error(`[job ${job.id}] erro (tentativa ${attempts}): ${msg}`);
  } finally {
    clearInterval(keepalive);
  }
}

// Faixa pesada: até `max_paralelo` jobs simultâneos, SEMPRE de projetos distintos
// (o runner escreve em WORK_DIR/<project_id> e o estado.json não é concorrente-seguro).
let _ultimaRecupLimite = 0;
async function loopPesado() {
  const ativos = new Map<string, Promise<void>>();  // jobId -> execução em andamento
  const projetosRodando = new Set<string>();        // exclusão de concorrência por projeto
  for (;;) {
    try {
      await recuperarOrfaos();
      // Periodicamente (~60s): ressuscita jobs mortos por limite do Max.
      if (Date.now() - _ultimaRecupLimite > 60_000) {
        _ultimaRecupLimite = Date.now();
        await recuperarLimiteMax();
      }
      if (!(await processamentoAtivo())) {
        await heartbeat({ estado: "paused" });
        await sleep(POLL);
        continue;
      }
      const maxP = await maxParalelo();
      // Preenche os slots livres com jobs de projetos DISTINTOS (e não pausados),
      // ordenando por prioridade. A escrita pausada (global) exclui escrever_livro.
      while (ativos.size < maxP) {
        const excluir = [...INTERATIVOS, ...CONTROLE, ...((await escritaPausada()) ? ["escrever_livro"] : [])];
        const job = await pegarProximoPesado(excluir, projetosRodando);
        if (!job) break;
        if (job.project_id) projetosRodando.add(job.project_id);
        const exec = processarJob(job)
          .catch((e) => console.error(`[job ${job.id}] exceção não tratada:`, e))
          .finally(() => {
            ativos.delete(job.id);
            if (job.project_id) projetosRodando.delete(job.project_id);
          });
        ativos.set(job.id, exec);
      }
      if (ativos.size === 0) {
        await sleep(POLL);
        continue;
      }
      // Espera ALGUM job terminar (ou um poll curto) para reavaliar slots/prioridade.
      await Promise.race([...ativos.values(), sleep(POLL)]);
    } catch (outer) {
      console.error("[worker] erro no loop pesado:", outer);
      await sleep(POLL);
    }
  }
}

// Faixa interativa: entrevista/ping rodam em paralelo, sem esperar jobs pesados.
async function loopInterativo() {
  for (;;) {
    try {
      if (!(await processamentoAtivo())) {
        await sleep(POLL);
        continue;
      }
      const job = await pegarProximo({ incluir: INTERATIVOS });
      if (!job) {
        await sleep(2000);
        continue;
      }
      await processarJob(job);
    } catch (outer) {
      console.error("[worker] erro no loop interativo:", outer);
      await sleep(2000);
    }
  }
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
