// Varre os perfis-de-voz dos projetos no WORK_DIR e injeta MODELO-FLAG quando os
// parágrafos-modelo §2 contêm tique de ornamento (gnômico/personificação/sanfona/
// metáfora/eco-negação). NUNCA reescreve prosa: proveniência incerta = decisão do
// autor (regra aprovada 2026-07-17; ver AUDITORIA-ESTILO-DANBROWN.md). Idempotente.
//
// Uso (a partir de worker/):  npx tsx scripts/desornamentar-perfis.ts [<project_id>]
import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { desornamentarModelosPerfil } from "../src/modelos-perfil.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function main() {
  const alvo = process.argv[2];
  const dirs = alvo ? [alvo] : (await readdir(WORK_DIR)).filter((d) => !d.startsWith("_"));
  let flagados = 0;
  for (const d of dirs) {
    const proj = path.join(WORK_DIR, d);
    try {
      if (!(await stat(proj)).isDirectory()) continue;
    } catch {
      continue;
    }
    const r = await desornamentarModelosPerfil(proj);
    if (r.mudou) {
      console.log(`✏ ${d} — MODELO-FLAG injetado (${r.flags.join(", ")})`);
      flagados++;
    } else {
      console.log(`✓ ${d} — modelos limpos, sem perfil, ou flag já presente`);
    }
  }
  console.log(`\nConcluído. ${flagados} perfil(is) flagrado(s).`);
}

main();
