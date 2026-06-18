// Agent-worker: loop de polling + lock atômico + dispatch + reentrância + heartbeat.
// Roda na máquina onde o Claude Code (MAX) está logado. NÃO publicar.
import "dotenv/config";
import { sb, OWNER } from "./supabase.js";
import { executarJob, type Job } from "./jobs.js";

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

// Flag de controle (a web liga/pausa o processamento). Default: ativo.
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

// Jobs interativos rodam numa faixa PARALELA (não esperam atrás de jobs pesados).
const INTERATIVOS = ["entrevistar", "ping"];

// Lock: pega 1 job queued (filtrável por tipo) e marca running atomicamente.
async function pegarProximo(opts: { incluir?: string[]; excluir?: string[] } = {}): Promise<Job | null> {
  let q = sb.from("jobs").select("*").eq("owner", OWNER).eq("status", "queued");
  if (opts.incluir) q = q.in("tipo", opts.incluir);
  if (opts.excluir) q = q.not("tipo", "in", `(${opts.excluir.join(",")})`);
  const { data: cand } = await q.order("created_at", { ascending: true }).limit(1);
  const job = cand?.[0];
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

// Faixa pesada: 1 job por vez (escrita, tradução, capa, epub, pacote, fundação).
async function loopPesado() {
  for (;;) {
    try {
      await recuperarOrfaos();
      if (!(await processamentoAtivo())) {
        await heartbeat({ estado: "paused" });
        await sleep(POLL);
        continue;
      }
      const job = await pegarProximo({ excluir: INTERATIVOS });
      if (!job) {
        await sleep(POLL);
        continue;
      }
      await processarJob(job);
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
