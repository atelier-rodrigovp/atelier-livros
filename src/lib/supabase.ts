import { createClient } from "@supabase/supabase-js";
import type { Job, JobTipo } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Falha cedo e claro: o front precisa apenas das chaves PÚBLICAS.
  console.warn("Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});

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
