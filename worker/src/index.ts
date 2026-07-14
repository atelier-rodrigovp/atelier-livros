// Agent-worker: loop de polling + lock atômico + dispatch + reentrância + heartbeat.
// Roda na máquina onde o Claude Code (MAX) está logado. NÃO publicar.
import "dotenv/config";
import { sb, OWNER } from "./supabase.js";
import { executarJob, type Job } from "./jobs.js";
import { LimiteMaxError, deveRecuperar } from "./limite-max.js";
import { escolherProximo, normalizarMaxParalelo, type ProjInfo } from "./fila.js";
import { aguardarConexao } from "./espera-conexao.js";
import { comRetrySb, ehErroDeRede } from "./retry.js";
import { instalarTimestampsISO } from "./log-iso.js";
import { recuperarOrfaos as recuperarOrfaosCore } from "./orfaos.js";
import { InfrastructureBlockedError, InfrastructureRetryError, QualityBlockedError } from "./job-errors.js";
import { tratarBloqueioQualidade } from "./correcao-fluxo.js";
import { decideInfrastructureRetry, registrarErroRepetido, type ErroRepetidoEstado, type InfrastructureRetryState } from "./retry-policy.js";
import { verifySkillManifest, type SkillManifest } from "./skill-manifest.js";
import manifest from "../skill-patches/manifest.json";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNNER_PATH } from "./lib.js";
import { claimJobAtomic } from "./claim.js";

// SPEC-12: todo console.log/warn/error do worker ganha [ISO] (o log não tinha
// relógio próprio — instalar ANTES de qualquer log).
instalarTimestampsISO();

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

// Runner python spawnado com pipe herda o encoding do locale no Windows (cp1252,
// errors=strict): um ✓/→/emoji vindo do resumo do Claude matava o print() com
// UnicodeEncodeError — a "morte silenciosa" entre o retorno da call e o log do rc
// (31/44 calls sem rc no diagnóstico). UTF-8 em todos os I/O do python resolve na
// raiz (as leituras/escritas de arquivo do runner já são utf-8 explícito).
if (!process.env.PYTHONUTF8) {
  process.env.PYTHONUTF8 = "1";
}

const WORKER_ID = process.env.WORKER_ID || "worker-local";
const POLL = Number(process.env.POLL_INTERVAL_MS || 5000);
const STALE_MIN = Number(process.env.HEARTBEAT_STALE_MIN || 15);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Heartbeat: registra presença para o painel mostrar worker online/offline.
// Falha de rede: 1 retry curto; falhas seguidas viram contador AGREGADO logado a
// cada ~5min (numa outage de 83min o log tinha 166 linhas idênticas — ruído).
let hbFalhasSeguidas = 0;
let hbUltimoAviso = 0;
async function heartbeat(extra: Record<string, unknown> = {}) {
  const { error } = await comRetrySb(
    () =>
      sb.from("worker_heartbeats").upsert(
        {
          worker_id: WORKER_ID,
          owner: OWNER,
          last_seen: new Date().toISOString(),
          status: { ...extra },
        },
        { onConflict: "owner,worker_id" }
      ),
    { tentativas: 2, baseMs: 2000 }
  );
  if (error) {
    hbFalhasSeguidas++;
    const agora = Date.now();
    if (hbFalhasSeguidas === 1 || agora - hbUltimoAviso > 5 * 60_000) {
      hbUltimoAviso = agora;
      console.error(
        `[heartbeat] erro: ${error.message}` +
          (hbFalhasSeguidas > 1 ? ` (falhando há ${hbFalhasSeguidas} tentativas seguidas)` : "")
      );
    }
  } else if (hbFalhasSeguidas > 0) {
    console.log(`[heartbeat] voltou após ${hbFalhasSeguidas} falha(s).`);
    hbFalhasSeguidas = 0;
  }
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
      .eq("owner", OWNER)
      .eq("id", (j as any).id)
      .eq("status", "error");
    if (!upErr) {
      if (pid) jaAberto.add(pid);
      console.log(`[recuperação] ${(j as any).tipo} ${(j as any).id} (proj ${pid}) era 'error' por Max/interrupção → re-enfileirado.`);
    }
  }
}

// Recupera jobs 'running' órfãos (worker caiu) -> volta para 'queued'.
// Lógica em ./orfaos.ts (testável com cliente injetado).
async function recuperarOrfaos() {
  await recuperarOrfaosCore(sb, OWNER, STALE_MIN);
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
  return claimJobAtomic(sb as any, escolhido.id, OWNER, WORKER_ID);
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
  return claimJobAtomic(sb as any, job.id, OWNER, WORKER_ID);
}

// Gravação do status final (done/queued/error) — update idempotente, com retry:
// perder esta escrita por blip de rede deixava o job 'running' órfão por 15min
// até o recuperarOrfaos (que segue como rede de segurança ao esgotar).
async function finalizar(jobId: string, patch: Record<string, unknown>) {
  const { error } = await comRetrySb(
    () => sb.from("jobs").update(patch).eq("owner", OWNER).eq("id", jobId).eq("locked_by", WORKER_ID),
    { tentativas: 5, rotulo: `finalizar ${jobId}` }
  );
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
  // Startup resiliente: rede indisponível no boot NÃO derruba o daemon (espera
  // logando ~1×/min); erro de config (URL/credencial) fica visível no mesmo log.
  await aguardarConexao(verificarConexao);
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
    sb.from("jobs").update({ locked_at: new Date().toISOString() }).eq("owner", OWNER).eq("id", job.id).eq("locked_by", WORKER_ID).then(() => {});
  }, 60_000);
  keepalive.unref?.();
  try {
    await executarJob(job, heartbeat);
    await finalizar(job.id, { status: "done", erro: null, locked_by: null, locked_at: null });
    console.log(`[job ${job.id}] done`);
  } catch (e: any) {
    if (e instanceof QualityBlockedError || e?.name === "QualityBlockedError") {
      const err = e as QualityBlockedError;
      // MERGE, nunca substituição (Bug B / S4): preserva cap_atual/total/fase/
      // palavras/nota/continua do progresso vigente.
      const { data: cur } = await sb.from("jobs").select("progresso,payload").eq("owner", OWNER).eq("id", job.id).single();
      const progressoAtual = (cur?.progresso as Record<string, unknown>) ?? {};
      // Correção automática (goal correcao-sem-clique): bloqueio de qualidade
      // RECUPERÁVEL reagenda o próprio job (queued + retry_at) com escada de
      // correção, orçamento e ledger persistente — o picker retoma sozinho, sem
      // clique. Só decisão autoral, fundação e circuit breaker pausam. Fail-safe:
      // erro no fluxo de correção cai no comportamento anterior (paused explícito).
      let resultado: Awaited<ReturnType<typeof tratarBloqueioQualidade>> | null = null;
      try {
        resultado = await tratarBloqueioQualidade({
          jobId: job.id,
          jobTipo: job.tipo,
          projectId: job.project_id ?? null,
          payload: ((cur as any)?.payload as Record<string, any>) ?? (job as any).payload,
          stage: err.stage,
          blockers: err.blockers,
          mensagem: err.message,
          progressoAtual,
        });
      } catch (fluxoErr: any) {
        console.error(
          `[job ${job.id}] fluxo de correção automática falhou (${String(fluxoErr?.message ?? fluxoErr).slice(0, 200)}) — pausando por segurança.`
        );
      }
      const patch = resultado?.patch ?? {
        status: "paused" as const,
        erro: err.message,
        progresso: {
          ...progressoAtual,
          quality_status: "blocked_quality",
          quality_stage: err.stage,
          quality_blockers: err.blockers,
          resumo: "Bloqueado por qualidade",
        },
      };
      await finalizar(job.id, { ...patch, locked_by: null, locked_at: null });
      const linha = resultado?.log ?? `bloqueado por qualidade em ${err.stage}: ${err.blockers.join("; ")}`;
      if (patch.status === "queued") console.log(`[job ${job.id}] ${linha}`);
      else console.error(`[job ${job.id}] ${linha}`);
      return;
    }
    if (e instanceof InfrastructureBlockedError || e?.name === "InfrastructureBlockedError") {
      const err = e as InfrastructureBlockedError;
      // MERGE, nunca substituição (Bug B / S4): idem QualityBlockedError.
      const { data: cur } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", job.id).single();
      const progressoAtual = (cur?.progresso as Record<string, unknown>) ?? {};
      await finalizar(job.id, {
        status: "paused",
        erro: err.message,
        progresso: {
          ...progressoAtual,
          quality_status: "blocked_infrastructure",
          dependency: err.dependency,
          resumo: "Bloqueado por infraestrutura",
        },
        locked_by: null,
        locked_at: null,
      });
      return;
    }
    // Limite do plano Max = throttle temporário, NÃO erro: pausa o job (mantém
    // 'queued' com retry_at no progresso) e NÃO consome max_attempts. O picker o
    // re-dispara sozinho quando retry_at passar (retoma do disco).
    if (e instanceof LimiteMaxError || e?.name === "LimiteMaxError") {
      const err = e as LimiteMaxError;
      const { data: cur } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", job.id).single();
      const progresso = { ...((cur?.progresso as Record<string, unknown>) ?? {}), aguardando_reset: err.aguardandoReset, retry_at: err.retryAt, motivo: err.motivo };
      await finalizar(job.id, { status: "queued", erro: null, progresso, locked_by: null, locked_at: null });
      console.log(`[job ${job.id}] ${err.motivo} — retoma ${err.retryAt} (não conta tentativa)`);
      return;
    }
    // Rede caiu além dos retries: o trabalho no disco está íntegro; re-tenta em
    // ~2min SEM queimar tentativa e com rótulo honesto (não é limite do Max nem
    // bug — antes isso consumia attempts e 3 blips matavam o job como 'error').
    if (e instanceof InfrastructureRetryError || e?.name === "InfrastructureRetryError" || ehErroDeRede(e)) {
      const dependency = e instanceof InfrastructureRetryError || e?.name === "InfrastructureRetryError"
        ? String((e as InfrastructureRetryError).dependency)
        : "supabase-network";
      const { data: cur } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", job.id).single();
      const progressoAtual = (cur?.progresso as Record<string, unknown>) ?? {};
      // H6: erro DETERMINÍSTICO idêntico N vezes seguidas não recicla retries —
      // para com mensagem legível (o breaker por janela não pega bug estável).
      const rep = registrarErroRepetido(progressoAtual as ErroRepetidoEstado, String(e?.message ?? e));
      if (rep.bloquear) {
        await finalizar(job.id, {
          status: "paused",
          erro: rep.motivo,
          progresso: {
            ...progressoAtual,
            ...rep.estado,
            quality_status: "blocked_infrastructure",
            motivo: rep.motivo,
            resumo: "Bloqueado: erro determinístico repetido",
          },
          locked_by: null,
          locked_at: null,
        });
        console.error(`[job ${job.id}] ${rep.motivo}`);
        return;
      }
      const anterior = (progressoAtual.infrastructure_retry ?? null) as InfrastructureRetryState | null;
      const decisao = decideInfrastructureRetry(anterior, dependency);
      if (decisao.action === "blocked") {
        await finalizar(job.id, {
          status: "paused",
          erro: decisao.reason,
          progresso: {
            ...((cur?.progresso as Record<string, unknown>) ?? {}),
            quality_status: "blocked_infrastructure",
            infrastructure_retry: decisao.state,
            motivo: decisao.reason,
            resumo: "Bloqueado por infraestrutura",
          },
          locked_by: null,
          locked_at: null,
        });
        console.error(`[job ${job.id}] ${decisao.reason}`);
        return;
      }
      const progresso = {
        ...progressoAtual,
        ...rep.estado, // H6: contagem de erro idêntico persiste entre retries
        aguardando_reset: false,
        retry_at: decisao.retryAt,
        infrastructure_retry: decisao.state,
        motivo: `${dependency} indisponível — tentativa ${decisao.state.count}, backoff ${Math.round(decisao.delayMs / 1000)}s`,
      };
      await finalizar(job.id, { status: "queued", erro: null, progresso, locked_by: null, locked_at: null });
      console.log(`[job ${job.id}] ${dependency} indisponível — retry ${decisao.state.count} em ${Math.round(decisao.delayMs / 1000)}s`);
      return;
    }
    const msg = String(e?.message ?? e).slice(0, 2000);
    const { data } = await sb.from("jobs").select("attempts,max_attempts").eq("owner", OWNER).eq("id", job.id).single();
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

async function preflightSkills() {
  if (!RUNNER_PATH) throw new Error("RUNNER_PATH ausente: impossível verificar a versão da skill em produção.");
  const sourceRoot = fileURLToPath(new URL("../skill-patches/", import.meta.url));
  const installedRoot = path.dirname(path.dirname(path.dirname(RUNNER_PATH)));
  const result = await verifySkillManifest(manifest as SkillManifest, sourceRoot, installedRoot);
  if (!result.ok) {
    const resumo = result.differences.map((d) => `${d.reason}:${d.path}`).join(", ");
    throw new Error(`SKILL_DRIFT manifest ${result.manifestVersion}: ${resumo}. Produção bloqueada; compare e aplique patches explicitamente.`);
  }
  console.log(`[preflight] skills conferem com manifest ${result.manifestVersion} (${result.checked} arquivos).`);
}

preflightSkills().then(() => loop()).catch((e) => {
  console.error(e);
  process.exit(1);
});
