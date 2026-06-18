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

const BUCKETS = ["manuscritos", "epubs", "capas", "pacotes"];

// Remove (best-effort) os arquivos do projeto nos 4 buckets (path <owner>/<projeto>/...).
export async function purgeProjectStorage(owner: string, projectId: string) {
  const prefix = `${owner}/${projectId}`;
  for (const b of BUCKETS) {
    const { data: subs } = await supabase.storage.from(b).list(prefix, { limit: 1000 });
    const paths: string[] = [];
    for (const item of subs ?? []) {
      if ((item as any).id == null) {
        // pasta -> lista os arquivos dentro
        const { data: files } = await supabase.storage.from(b).list(`${prefix}/${item.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`${prefix}/${item.name}/${f.name}`);
      } else {
        paths.push(`${prefix}/${item.name}`);
      }
    }
    if (paths.length) await supabase.storage.from(b).remove(paths);
  }
}

// Apaga o projeto: purga Storage + remove a linha (cascata apaga edições/capítulos/
// artefatos/pacotes/jobs por FK on delete cascade).
export async function deleteProject(projectId: string) {
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    try { await purgeProjectStorage(data.user.id, projectId); } catch { /* best-effort */ }
  }
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}
