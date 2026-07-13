// Backfill de Quality State por capítulo para projetos ANTIGOS (F-09).
// Uso: npx tsx worker/scripts/backfill-quality-caps.ts [<project_id>]
// Re-idempotente: nunca sobrescreve quality/capitulo-NN.json existente e nunca
// grava "approved" (aprovação só pelo loop do runner ou exceção humana).
import path from "node:path";
import { readdir } from "node:fs/promises";
import { sb, OWNER } from "../src/supabase.js";
import { WORK_DIR } from "../src/lib.js";
import { backfillQualityProjeto } from "../src/backfill-quality.js";

async function main() {
  const alvo = process.argv[2] || null;
  let ids: string[] = [];
  if (alvo) {
    ids = [alvo];
  } else {
    ids = (await readdir(WORK_DIR).catch(() => [])).filter((d) => /^[0-9a-f-]{36}$/.test(d));
  }
  for (const id of ids) {
    const { data: proj } = await sb
      .from("projects")
      .select("id,titulo,skill_escrita")
      .eq("owner", OWNER)
      .eq("id", id)
      .maybeSingle();
    if (!proj) {
      console.log(`- ${id}: sem projeto no banco (pulado)`);
      continue;
    }
    const r = await backfillQualityProjeto(path.join(WORK_DIR, id), proj.skill_escrita ?? null);
    const gravados = r.filter((x) => x.acao === "gravado");
    console.log(
      `- ${id} (${proj.titulo}): ${gravados.length} estado(s) gravado(s), ` +
        `${r.length - gravados.length} preservado(s)` +
        (gravados.length ? ` [${gravados.map((g) => `${g.capitulo}:${g.status}`).join(", ")}]` : "")
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
