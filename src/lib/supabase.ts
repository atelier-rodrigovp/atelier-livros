import { createClient } from "@supabase/supabase-js";
import type { Job, JobTipo } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabaseConfigured = Boolean(url && anon);

if (!supabaseConfigured) {
  // Falha cedo e claro: o front precisa apenas das chaves PÚBLICAS.
  console.warn("Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
}

// O SDK rejeita URL vazia no import e derrubava a aplicação antes que a UI
// pudesse explicar a configuração ausente. O cliente inerte nunca é usado
// enquanto `supabaseConfigured` for false (App mostra o estado acionável).
export const supabase = createClient(
  url || "http://127.0.0.1:54321",
  anon || "supabase-public-key-not-configured",
  {
  auth: { persistSession: true, autoRefreshToken: true },
  }
);

// Helper para enfileirar um job a partir do front (RLS garante owner = você).
export async function enqueueJob(
  tipo: JobTipo,
  payload: Record<string, unknown> = {},
  refs: { project_id?: string; edition_id?: string } = {}
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({ tipo, payload, ...refs })
    .select()
    .single();
  if (error) throw error;
  return data as Job;
}

export type { Job, JobTipo };
