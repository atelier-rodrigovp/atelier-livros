// Varre TODOS os projetos em WORK_DIR e pina o MODELO POR PAPEL dos agentes
// .claude/agents/livro-*.md (escritor=opus, revisor=sonnet, editor=haiku,
// contextualizador=haiku, arquiteto-comercial=sonnet). Idempotente: só reescreve
// o que estiver fora da política. Corrige projetos vivos cujos agentes nasceram
// com model: errado/herdado (ex.: editor em opus).
//
// Uso (a partir de worker/):  npx tsx scripts/normalizar-modelos-agentes.ts
import { readdir } from "node:fs/promises";
import path from "node:path";
import { normalizarModelosAgentes, MODELO_POR_AGENTE } from "../src/modelos-agentes.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function main() {
  let projetos: string[] = [];
  try {
    projetos = await readdir(WORK_DIR);
  } catch {
    console.error(`WORK_DIR não encontrado: ${WORK_DIR}`);
    process.exit(1);
  }
  console.log("Política:", MODELO_POR_AGENTE);
  let totalMudou = 0;
  for (const p of projetos.sort()) {
    const agentsDir = path.join(WORK_DIR, p, ".claude", "agents");
    const ajustes = await normalizarModelosAgentes(agentsDir);
    if (!ajustes.length) continue; // projeto sem agentes
    const mudados = ajustes.filter((a) => a.mudou);
    const resumo = ajustes.map((a) => `${a.agente.replace("livro-", "")}=${a.para}${a.mudou ? `(era ${a.de ?? "—"})` : ""}`).join("  ");
    console.log(`${mudados.length ? "✏ " : "✓ "}${p}\n   ${resumo}`);
    totalMudou += mudados.length;
  }
  console.log(`\nConcluído. ${totalMudou} agente(s) corrigido(s).`);
}

main();
