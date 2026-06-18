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

// Lock: pega 1 job queued e marca running de forma atômica (condicional no status).
async function pegarProximo(): Promise<Job | null> {
  const { data: cand } = await sb
    .from("jobs")
    .select("*")
    .eq("owner", OWNER)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
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
  await sb.from("jobs").update(patch).eq("id", jobId);
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

  for (;;) {
    try {
      await recuperarOrfaos();
      const job = await pegarProximo();
      if (!job) {
        await sleep(POLL);
        continue;
      }
      console.log(`[job ${job.id}] ${job.tipo} — iniciando`);
      await heartbeat({ estado: "busy", job: job.id, tipo: job.tipo });
      try {
        await executarJob(job, heartbeat);
        await finalizar(job.id, {
          status: "done",
          erro: null,
          locked_by: null,
          locked_at: null,
        });
        console.log(`[job ${job.id}] done`);
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 2000);
        const { data } = await sb
          .from("jobs")
          .select("attempts,max_attempts")
          .eq("id", job.id)
          .single();
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
      }
    } catch (outer) {
      console.error("[worker] erro no loop:", outer);
      await sleep(POLL);
    }
  }
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
