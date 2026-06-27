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

// Hora curta "HH:MM" a partir de ISO (apresentação). null se inválida.
export function horaCurta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Job pausado aguardando o reset do plano Max (status='queued' +
// progresso.aguardando_reset). NÃO é erro — throttle temporário.
export function aguardandoResetMax(
  status: string,
  progresso?: Record<string, unknown> | null
): { retryAt: string | null } | null {
  if (status !== "queued") return null;
  const p = progresso as any;
  if (p && p.aguardando_reset) return { retryAt: (p.retry_at as string) ?? null };
  return null;
}

// Badge de job ciente do progresso: mostra "Aguardando reset do Max — retoma
// ~HH:MM" (âmbar) em vez de vermelho/erro. Reaproproveita jobStatusBadge.
export function jobStatusBadgeEx(job: {
  status: JobStatus;
  progresso?: Record<string, unknown> | null;
}): { label: string; variant: BadgeVariant } {
  const esp = aguardandoResetMax(job.status, job.progresso);
  if (esp) {
    const h = horaCurta(esp.retryAt);
    return { label: h ? `Aguardando reset do Max — retoma ~${h}` : "Aguardando reset do Max", variant: "warning" };
  }
  return jobStatusBadge(job.status);
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

// Status de EXIBIÇÃO de um projeto, coerente com o worker.
// "Escrevendo" só aparece se o worker estiver online (offline = nada processa,
// então rotulamos como pausado, nunca com o estado animado de escrita ativa).
export function displayProjectStatus(args: {
  projectStatus: ProjectStatus;
  hasActiveJob: boolean;
  workerOnline: boolean;
}): { label: string; variant: BadgeVariant; pulse: boolean } {
  const { projectStatus, hasActiveJob, workerOnline } = args;
  const emEscrita = hasActiveJob || projectStatus === "escrevendo";
  if (emEscrita && !workerOnline) {
    return { label: "Escrita pausada (worker offline)", variant: "warning", pulse: false };
  }
  if (hasActiveJob && workerOnline) {
    return { label: "Escrevendo", variant: "warning", pulse: true };
  }
  const base = projectStatusBadge(projectStatus);
  return { ...base, pulse: false };
}

// Um job está REALMENTE rodando? running + worker online + lock fresco (< staleMin).
// Cobre o caso do job órfão: status='running' mas o worker caiu (offline/lock velho).
export function jobAtivoReal(args: {
  status: string;
  workerOnline: boolean;
  lockedAt?: string | null;
  now?: Date;
  staleMin?: number;
}): boolean {
  const { status, workerOnline, lockedAt, now = new Date(), staleMin = 5 } = args;
  if (status !== "running") return false;
  if (!workerOnline) return false;
  if (!lockedAt) return true; // running + online, recém-reivindicado (sem lock ainda)
  const t = new Date(lockedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t < staleMin * 60_000;
}

// Rótulo amigável por tipo de job (apresentação).
const TIPO_LABEL: Record<string, string> = {
  escrever_livro: "Escrita",
  gerar_capa: "Capas",
  gerar_capas: "Capas",
  gerar_epub: "EPUB",
  traduzir: "Tradução",
  avaliar: "Avaliação",
  revisar: "Revisão",
  gerar_post_social: "Post social",
  criar_fundacao: "Fundação",
  refinar_fundacao: "Fundação",
  criar_volumes: "Volumes da saga",
  gerar_pacote: "Pacote KDP",
  importar_vendas: "Vendas",
  entrevistar: "Entrevista",
  ping: "Teste",
};
export function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo;
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
