// Engine V2 — executor de UM job específico da fila (claim atômico por id).
// Serve para processar um job V2 (canario_voz, laboratorio_v2, escrever_livro
// de projeto engine_mode='v2') com o worker parado ou pausado, sem tocar em
// NENHUM outro job da fila. Usa exatamente o mesmo roteador do worker
// (executarJobRoteado); jobs que caíssem na V1 são recusados por segurança.
//
// Uso (de worker/): npx tsx scripts/v2-executar-job.ts <job_id>

import "dotenv/config";
import { executarJobRoteado } from "../src/v2/integracao.js";
import type { Job } from "../src/jobs.js";

async function main(): Promise<void> {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("uso: npx tsx scripts/v2-executar-job.ts <job_id>");
    process.exit(2);
  }
  const { sb, OWNER } = await import("../src/supabase.js");
  const WORKER_ID = `v2-executor-${process.pid}`;

  // Claim atômico: só vence se o job ainda está queued.
  const { data: claimed, error } = await sb
    .from("jobs")
    .update({ status: "running", locked_by: WORKER_ID, started_at: new Date().toISOString() })
    .eq("owner", OWNER)
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!claimed) {
    console.error(`job ${jobId} não está 'queued' (já reivindicado ou inexistente) — nada a fazer.`);
    process.exit(1);
  }
  const job = claimed as unknown as Job;
  console.log(`job ${job.id} (${job.tipo}) reivindicado por ${WORKER_ID}`);

  const finalizar = async (patch: Record<string, unknown>) => {
    await sb.from("jobs").update(patch).eq("owner", OWNER).eq("id", jobId).eq("locked_by", WORKER_ID);
  };

  try {
    await executarJobRoteado(job, async () => {}, async () => {
      throw new Error(`job ${job.tipo} rotearia para a V1 — este executor só processa jobs V2`);
    });
    await finalizar({ status: "done", finished_at: new Date().toISOString() });
    console.log(`job ${jobId} concluído (done).`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizar({ status: "error", erro: msg.slice(0, 900), finished_at: new Date().toISOString() });
    console.error(`job ${jobId} terminou em erro: ${msg}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("EXECUTOR FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
