import { supabase } from "./supabase";

// Gera uma URL assinada para baixar/ver um objeto privado (RLS por owner permite).
export async function signedUrl(
  bucket: string,
  key: string,
  expiresSec = 3600
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, expiresSec);
  return data?.signedUrl ?? null;
}

// Baixa um objeto de texto (ex.: markdown da fundação) como string.
export async function downloadText(
  bucket: string,
  key: string
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error || !data) return "";
  return await data.text();
}
