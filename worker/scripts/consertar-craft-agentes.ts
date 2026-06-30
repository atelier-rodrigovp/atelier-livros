// Aplica nos AGENTES JÁ GERADOS dos projetos vivos: o escritor lê a craft por capítulo
// (não o digest p/ voz) e o revisor reprova "competente e chato" (veredito de propulsão).
// Idempotente — os livros em andamento passam a escrever da craft do PRÓXIMO capítulo
// em diante (não reescreve os já feitos).
//
// Uso (a partir de worker/):  npx tsx scripts/consertar-craft-agentes.ts [<project_id>]
import { readdir } from "node:fs/promises";
import path from "node:path";
import { normalizarCraftNosAgentes } from "../src/craft-agentes.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function main() {
  const alvo = process.argv[2];
  let projetos: string[];
  if (alvo) projetos = [alvo];
  else {
    try {
      projetos = await readdir(WORK_DIR);
    } catch {
      console.error(`WORK_DIR não encontrado: ${WORK_DIR}`);
      process.exit(1);
    }
  }
  let mudados = 0;
  for (const p of projetos.sort()) {
    const a = await normalizarCraftNosAgentes(path.join(WORK_DIR, p, ".claude", "agents"));
    if (a.escritor || a.revisor) {
      console.log(`✏ ${p} — ${[a.escritor && "escritor:craft", a.revisor && "revisor:propulsão"].filter(Boolean).join(" ")}`);
      mudados++;
    }
  }
  console.log(`\nConcluído. ${mudados} projeto(s) com agentes consertados.`);
}

main();
