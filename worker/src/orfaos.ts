// Recuperação de jobs 'running' órfãos (worker caiu): volta para 'queued'.
// Extraída do index.ts para ser testável com cliente injetado (auditoria A16).
export async function recuperarOrfaos(
  sb: { from(table: string): any },
  owner: string,
  staleMin: number,
  now: () => number = Date.now
): Promise<void> {
  const limite = new Date(now() - staleMin * 60_000).toISOString();
  await sb
    .from("jobs")
    .update({ status: "queued", locked_by: null, locked_at: null })
    .eq("owner", owner)
    .eq("status", "running")
    .lt("locked_at", limite);
}
