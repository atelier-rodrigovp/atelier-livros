// Tipos do domínio espelhando o schema (Seção 5 do spec). Expanda por fase.

export const IDIOMAS = [
  "pt-BR",
  "en-US",
  "en-GB",
  "es-ES",
  "it-IT",
  "de-DE",
  "fr-FR",
] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const PROJECT_STATUS = [
  "rascunho",
  "fundacao",
  "escrevendo",
  "revisao",
  "pronto",
  "publicado",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const JOB_STATUS = [
  "queued",
  "running",
  "paused",
  "done",
  "error",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const JOB_TIPOS = [
  "ping",
  "criar_fundacao",
  "escrever_livro",
  "gerar_epub",
  "traduzir",
  "gerar_capa",
  "gerar_pacote",
  "importar_vendas",
] as const;
export type JobTipo = (typeof JOB_TIPOS)[number];

export interface Project {
  id: string;
  owner: string;
  titulo: string;
  serie: string | null;
  volume: number;
  genero: string | null;
  idioma_origem: string;
  status: ProjectStatus;
  briefing: Record<string, unknown>;
  skill_escrita: string | null;
  paginas_alvo: number | null;
  total_capitulos: number | null;
  piso_palavras: number;
  meta_nota: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  owner: string;
  tipo: JobTipo;
  status: JobStatus;
  progresso: Record<string, unknown>;
  payload: Record<string, unknown>;
  project_id: string | null;
  edition_id: string | null;
  log: string | null;
  erro: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface WorkerHeartbeat {
  worker_id: string;
  owner: string;
  status: Record<string, unknown>;
  last_seen: string;
}
