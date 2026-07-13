// Harness da auditoria E2E (FASE 11): executa UM job específico de um projeto
// EFÊMERO marcado (título AUDIT-*), sem ligar a fila de produção (worker_control
// permanece intocado — nenhum outro job queued roda). Claim honesto via RPC
// claim_job (exclusividade por projeto preservada).
// Uso: npx tsx worker/scripts/audit-run-job.ts <job_id>
import { sb, OWNER } from "../src/supabase.js";
import { executarJob, type Job } from "../src/jobs.js";
import { claimJobAtomic } from "../src/claim.js";

async function main() {
  const jobId = process.argv[2];
  if (!jobId) throw new Error("uso: audit-run-job.ts <job_id>");

  const { data: row, error } = await sb.from("jobs").select("*").eq("owner", OWNER).eq("id", jobId).single();
  if (error || !row) throw new Error("job não encontrado: " + (error?.message ?? jobId));
  if (!row.project_id) throw new Error("job sem projeto — fora do escopo da auditoria");

  const { data: proj } = await sb.from("projects").select("titulo").eq("owner", OWNER).eq("id", row.project_id).single();
  if (!proj?.titulo?.startsWith("AUDIT-")) {
    throw new Error(`recusado: projeto '${proj?.titulo}' não é efêmero (título precisa começar com AUDIT-)`);
  }
  if (row.status !== "queued") throw new Error(`job não está queued (status=${row.status})`);

  const claimed = await claimJobAtomic(sb, jobId, OWNER, "audit-harness");
  if (!claimed) throw new Error("claim falhou (outro processo pegou o job?)");

  const job: Job = { id: row.id, tipo: row.tipo, payload: row.payload ?? {}, project_id: row.project_id, edition_id: row.edition_id ?? null };
  console.log(`[audit-harness] executando ${job.tipo} (${job.id}) do projeto ${proj.titulo}`);
  try {
    await executarJob(job);
    await sb.from("jobs").update({ status: "done", erro: null, locked_by: null, locked_at: null }).eq("owner", OWNER).eq("id", jobId);
    console.log("[audit-harness] done");
  } catch (e: any) {
    await sb.from("jobs").update({ status: "error", erro: String(e?.message ?? e).slice(0, 800), locked_by: null, locked_at: null }).eq("owner", OWNER).eq("id", jobId);
    console.error("[audit-harness] error:", e?.message ?? e);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
