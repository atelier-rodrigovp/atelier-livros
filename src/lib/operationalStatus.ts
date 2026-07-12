export type WritingProgress = {
  retry_at?: string | null;
  motivo?: string;
  quality_status?: "blocked_quality" | "blocked_infrastructure";
  quality_stage?: string;
  quality_blockers?: string[];
};

export type WritingJobOperational = { status: string; progresso?: WritingProgress | null };

export function deriveWritingStatus(job: WritingJobOperational | undefined, workerOnline: boolean, now = Date.now()) {
  const pg = job?.progresso ?? {};
  const retry = pg.retry_at ? Date.parse(pg.retry_at) : NaN;
  if (pg.quality_status === "blocked_quality") return { label: "Bloqueado por qualidade", tone: "danger" as const, detail: `${pg.quality_stage ?? "gate"}: ${(pg.quality_blockers ?? []).join("; ")}` };
  if (pg.quality_status === "blocked_infrastructure") return { label: "Bloqueado por infraestrutura", tone: "danger" as const, detail: pg.motivo };
  if (job?.status === "running" && !workerOnline) return { label: "Órfão / worker offline", tone: "danger" as const, detail: "O banco ainda registra execução, mas não há heartbeat ativo." };
  const retryFuture = !Number.isNaN(retry) && retry > now;
  if (job?.status === "queued" && retryFuture) return { label: "Pausado", tone: "warning" as const, detail: pg.motivo ?? "aguardando retry" };
  if (job?.status === "queued" && pg.retry_at && !retryFuture) return { label: "Retomada vencida", tone: "warning" as const, detail: workerOnline ? "O horário passou; aguardando novo ciclo do worker." : "O horário passou, mas o worker está offline." };
  if (job?.status === "running") return { label: "Executando agora", tone: "success" as const };
  if (job?.status === "queued") return { label: "Na fila", tone: "queued" as const };
  return { label: "Aguardando", tone: "neutral" as const };
}
