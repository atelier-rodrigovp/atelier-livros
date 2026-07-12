import type { Job } from "./jobs.js";

export async function claimJobAtomic(
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> },
  jobId: string,
  owner: string,
  workerId: string
): Promise<Job | null> {
  const { data, error } = await client.rpc("claim_job", { p_job_id: jobId, p_owner: owner, p_worker: workerId });
  if (error) throw new Error(`claim_job indisponível: ${error.message ?? String(error)}. Aplique supabase/reliability.sql; fallback local é proibido.`);
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.length ? rows[0] as Job : null;
}
