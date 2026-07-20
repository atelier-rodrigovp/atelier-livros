// Engine V2 — camada de dados do frontend.
// Lê o estado canônico (engine_state), execuções (engine_runs), pareceres
// (engine_reviews) e fichas (engine_scene_specs). Enquanto a migração de banco
// (supabase/engine_v2.sql) não foi aplicada, as consultas retornam
// { migracaoPendente: true } — a UI mostra o estado honesto, nunca inventa dados.

import { supabase } from "./supabase";

export interface CapituloEstadoV2 {
  status: string;
  text_hash?: string;
  palavras?: number;
  spec_versao?: number;
  review_id?: string;
  aprovacao?: { review_id: string; text_hash: string; em: string };
  bloqueio?: { codigo: string; detalhe: string; desde: string };
}

export interface EstadoCanonicoV2 {
  project_id: string;
  engine_version: string;
  versao: number;
  updated_at?: string;
  doc: {
    schema: string;
    fase: string;
    skill?: { id: string; versao: string; hash: string };
    fundacao?: { versao: string; hash: string; docs: Record<string, string> };
    total_capitulos?: number;
    capitulos: Record<string, CapituloEstadoV2>;
    bloqueios: { codigo: string; alvo: string; detalhe: string; desde: string }[];
    migracao?: { origem: string; em: string; divergencias?: number };
  };
}

export interface RunV2 {
  id: string;
  papel: string;
  capacidade?: string;
  model_provider?: string;
  model_name?: string;
  alvo?: string;
  status: string;
  attempt: number;
  parent_run_id?: string;
  engine_version: string;
  skill_id?: string;
  skill_version?: string;
  input_bundle_hash?: string;
  output_hash?: string;
  started_at: string;
  finished_at?: string;
  tokens_in?: number;
  tokens_out?: number;
  erro?: { codigo: string; classe: string; mensagem: string } | null;
  evidencias?: unknown[];
}

export interface ReviewV2 {
  id: string;
  capitulo: number | null;
  text_hash: string;
  verdict: string;
  created_at: string;
  run_id?: string;
  parecer: {
    dramatic_progression?: { nota: number; evidencia: string };
    skill_adherence?: { nota: number; evidencia: string };
    clarity?: { nota: number; evidencia: string };
    emotional_effect?: { nota: number; evidencia: string };
    continuity?: { nota: number; evidencia: string };
    hook_effectiveness?: { nota: number; evidencia: string };
    evidencias?: { local: string; trecho: string; observacao: string }[];
    sinais?: { sinal: string; valor: number | string; disposicao: string; evidencia: string }[];
    correcoes?: { local: string; problema: string; instrucao: string }[];
  };
}

export type ConsultaV2<T> =
  | { migracaoPendente: false; dados: T }
  | { migracaoPendente: true; dados: null };

export function tabelaAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export async function lerEstadoV2(projectId: string): Promise<ConsultaV2<EstadoCanonicoV2 | null>> {
  const { data, error } = await supabase
    .from("engine_state")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { migracaoPendente: true, dados: null };
    throw error;
  }
  return { migracaoPendente: false, dados: (data as EstadoCanonicoV2 | null) ?? null };
}

export async function listarRunsV2(projectId: string, limite = 50): Promise<ConsultaV2<RunV2[]>> {
  const { data, error } = await supabase
    .from("engine_runs")
    .select(
      "id,papel,capacidade,model_provider,model_name,alvo,status,attempt,parent_run_id,engine_version,skill_id,skill_version,input_bundle_hash,output_hash,started_at,finished_at,tokens_in,tokens_out,erro"
    )
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limite);
  if (error) {
    if (tabelaAusente(error)) return { migracaoPendente: true, dados: null };
    throw error;
  }
  return { migracaoPendente: false, dados: (data as RunV2[]) ?? [] };
}

export async function listarReviewsV2(projectId: string, capitulo?: number): Promise<ConsultaV2<ReviewV2[]>> {
  let q = supabase
    .from("engine_reviews")
    .select("id,capitulo,text_hash,verdict,created_at,run_id,parecer")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (capitulo != null) q = q.eq("capitulo", capitulo);
  const { data, error } = await q;
  if (error) {
    if (tabelaAusente(error)) return { migracaoPendente: true, dados: null };
    throw error;
  }
  return { migracaoPendente: false, dados: (data as ReviewV2[]) ?? [] };
}

export async function listarSpecsV2(projectId: string): Promise<ConsultaV2<{ id: string; capitulo: number; versao: number; status: string; hash: string; ficha: Record<string, unknown>; created_at: string }[]>> {
  const { data, error } = await supabase
    .from("engine_scene_specs")
    .select("id,capitulo,versao,status,hash,ficha,created_at")
    .eq("project_id", projectId)
    .order("capitulo", { ascending: true })
    .order("versao", { ascending: false });
  if (error) {
    if (tabelaAusente(error)) return { migracaoPendente: true, dados: null };
    throw error;
  }
  return { migracaoPendente: false, dados: (data ?? []) as never };
}
