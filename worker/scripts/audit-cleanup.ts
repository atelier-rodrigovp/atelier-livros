// Limpeza dos objetos EFÊMEROS da auditoria (FASE 11): remove apenas projetos
// cujo título começa com AUDIT- (jobs, edições, capítulos, artefatos, Storage e
// WORK_DIR). Lista antes de apagar; exige --confirm para executar.
// Uso: npx tsx worker/scripts/audit-cleanup.ts [--confirm]
import path from "node:path";
import { rm } from "node:fs/promises";
import { sb, OWNER } from "../src/supabase.js";
import { WORK_DIR } from "../src/lib.js";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const { data: projs } = await sb
    .from("projects")
    .select("id,titulo")
    .eq("owner", OWNER)
    .like("titulo", "AUDIT-%");
  if (!projs?.length) {
    console.log("nenhum projeto AUDIT-* encontrado — nada a limpar.");
    return;
  }
  for (const p of projs) {
    console.log(`${confirm ? "REMOVENDO" : "[dry-run]"} ${p.id} ${p.titulo}`);
    if (!confirm) continue;
    const { data: eds } = await sb.from("editions").select("id").eq("owner", OWNER).eq("project_id", p.id);
    for (const e of eds ?? []) {
      await sb.from("chapters").delete().eq("owner", OWNER).eq("edition_id", e.id);
      await sb.from("artifacts").delete().eq("owner", OWNER).eq("edition_id", e.id);
      await sb.from("publishing_packages").delete().eq("owner", OWNER).eq("edition_id", e.id);
    }
    await sb.from("editions").delete().eq("owner", OWNER).eq("project_id", p.id);
    await sb.from("jobs").delete().eq("owner", OWNER).eq("project_id", p.id);
    // Storage: prefixos do projeto nos buckets usados pelo worker
    for (const bucket of ["manuscritos", "epubs", "capas", "pacotes"]) {
      const prefix = `${OWNER}/${p.id}`;
      const { data: files } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
      // list é raso; varre também subpastas conhecidas
      const alvos: string[] = [];
      const varrer = async (pfx: string) => {
        const { data: fs } = await sb.storage.from(bucket).list(pfx, { limit: 1000 });
        for (const f of fs ?? []) {
          if (f.id) alvos.push(`${pfx}/${f.name}`);
          else await varrer(`${pfx}/${f.name}`);
        }
      };
      if (files?.length) await varrer(prefix);
      if (alvos.length) await sb.storage.from(bucket).remove(alvos);
    }
    await sb.from("projects").delete().eq("owner", OWNER).eq("id", p.id);
    await rm(path.join(WORK_DIR, p.id), { recursive: true, force: true });
  }
  if (!confirm) console.log("\nnada foi removido — rode com --confirm para executar.");
  else console.log("\nlimpeza concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
