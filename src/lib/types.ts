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
  "entrevistar",
  "criar_fundacao",
  "refinar_fundacao",
  "criar_volumes",
  "escrever_livro",
  "gerar_epub",
  "traduzir",
  "avaliar",
  "revisar",
  "gerar_capa",
  "gerar_capas",
  "gerar_capas_opcoes",
  "compor_capas",
  "gerar_pacote",
  "importar_vendas",
  "gerar_post_social",
  "aceitar_excecao_qualidade",
  "laboratorio_v2",
  "canario_voz",
] as const;
export type JobTipo = (typeof JOB_TIPOS)[number];

export const REDES = ["instagram", "x", "tiktok", "threads", "youtube", "site"] as const;
export type Rede = (typeof REDES)[number];

export interface Author {
  id: string;
  owner: string;
  nome: string;
  slug: string | null;
  estilo: string | null;
  genero: string | null;
  bio: string | null;
  personalidade: string | null;
  referencias: string | null;
  avatar_path: string | null;
  social: Partial<Record<Rede, string>>;
  created_at: string;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  owner: string;
  author_id: string;
  project_id: string | null;
  rede: Rede;
  objetivo: string | null;
  tema: string | null;
  conteudo: string | null;
  variantes: string[];
  hashtags: string[] | null;
  status: "rascunho" | "aprovado" | "arquivado";
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  owner: string;
  titulo: string;
  serie: string | null;
  volume: number;
  author_id: string | null;
  genero: string | null;
  idioma_origem: string;
  status: ProjectStatus;
  briefing: Record<string, unknown>;
  skill_escrita: string | null;
  engine_mode: string | null;
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
  locked_at?: string | null;
  locked_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerHeartbeat {
  worker_id: string;
  owner: string;
  status: Record<string, unknown>;
  last_seen: string;
}
