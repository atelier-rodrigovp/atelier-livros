// Varre TODOS os projetos em WORK_DIR e garante a política de CADÊNCIA (Regra 4)
// no perfil-de-voz.md + Estrutura-do-Livro.md (cota numérica de tiques + anti-"coisa").
// Idempotente: só injeta onde falta. Corrige fundações nascidas antes do passo durável.
//
// Uso (a partir de worker/):  npx tsx scripts/normalizar-voz-regra4.ts [<project_id>]
import { readdir } from "node:fs/promises";
import path from "node:path";
import { normalizarVozRegra4 } from "../src/voz-regra4.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function main() {
  const alvo = process.argv[2];
  let projetos: string[];
  if (alvo) {
    projetos = [alvo];
  } else {
    try {
      projetos = await readdir(WORK_DIR);
    } catch {
      console.error(`WORK_DIR não encontrado: ${WORK_DIR}`);
      process.exit(1);
    }
  }
  let totalMudou = 0;
  for (const p of projetos.sort()) {
    const ajustes = await normalizarVozRegra4(path.join(WORK_DIR, p));
    if (!ajustes.length) continue; // projeto sem fundação de voz/estrutura
    const mudados = ajustes.filter((a) => a.mudou);
    const resumo = ajustes.map((a) => `${a.arquivo}${a.mudou ? " [injetado]" : " ok"}`).join("  ");
    console.log(`${mudados.length ? "✏ " : "✓ "}${p}\n   ${resumo}`);
    totalMudou += mudados.length;
  }
  console.log(`\nConcluído. ${totalMudou} arquivo(s) com Regra 4 injetada.`);
}

main();
