// Injeta o RESUMO DE CRAFT da skill no perfil-de-voz.md de cada projeto vivo, conforme
// a skill_escrita do projeto. Idempotente. Os livros em andamento passam a escrever com
// o DNA da skill do PRÓXIMO capítulo em diante (não reescreve os já feitos).
//
// Uso (a partir de worker/):  npx tsx scripts/aplicar-craft-skill.ts [<project_id>]
import "dotenv/config";
import path from "node:path";
import { sb } from "../src/supabase.js";
import { normalizarCraftSkill } from "../src/craft-skill.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function main() {
  const alvo = process.argv[2];
  let q = sb.from("projects").select("id,titulo,skill_escrita").order("titulo");
  if (alvo) q = q.eq("id", alvo);
  const { data } = await q;
  let mudados = 0;
  const semBloco = new Set<string>();
  for (const p of (data ?? []) as { id: string; titulo: string; skill_escrita: string | null }[]) {
    const r = await normalizarCraftSkill(path.join(WORK_DIR, p.id), p.skill_escrita);
    if (r.mudou) {
      console.log(`✏ ${p.titulo} — craft '${r.skill}' injetada`);
      mudados++;
    } else if (r.skill && !r.reconhecida) {
      semBloco.add(r.skill);
      console.log(`· ${p.titulo} — skill '${r.skill}' sem bloco de craft (pulado)`);
    } else {
      console.log(`✓ ${p.titulo} — já tem (ou sem perfil/sem skill)`);
    }
  }
  console.log(`\nConcluído. ${mudados} perfil(is) com craft injetada.` + (semBloco.size ? ` Skills sem bloco: ${[...semBloco].join(", ")}.` : ""));
}

main();
