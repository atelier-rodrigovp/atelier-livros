// Funções puras de apresentação de status (testáveis sem rede).
import type { JobStatus, ProjectStatus, WorkerHeartbeat } from "./types";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

export function jobStatusBadge(status: JobStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case "queued":
      return { label: "Na fila", variant: "secondary" };
    case "running":
      return { label: "Executando", variant: "warning" };
    case "paused":
      return { label: "Pausado", variant: "outline" };
    case "done":
      return { label: "Concluído", variant: "success" };
    case "error":
      return { label: "Erro", variant: "destructive" };
    case "canceled":
      return { label: "Cancelado", variant: "outline" };
  }
}

export function projectStatusBadge(status: ProjectStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case "rascunho":
      return { label: "Rascunho", variant: "outline" };
    case "fundacao":
      return { label: "Fundação", variant: "secondary" };
    case "escrevendo":
      return { label: "Escrevendo", variant: "warning" };
    case "revisao":
      return { label: "Revisão", variant: "warning" };
    case "pronto":
      return { label: "Pronto", variant: "success" };
    case "publicado":
      return { label: "Publicado", variant: "default" };
  }
}

// Worker é considerado online se o último heartbeat foi há menos de staleMin minutos.
export function workerOnline(
  hb: Pick<WorkerHeartbeat, "last_seen"> | null | undefined,
  staleMin = 2,
  now: Date = new Date()
): boolean {
  if (!hb?.last_seen) return false;
  const last = new Date(hb.last_seen).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < staleMin * 60_000;
}
