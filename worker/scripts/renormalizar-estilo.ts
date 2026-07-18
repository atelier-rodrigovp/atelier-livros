// Re-normalização de ESTILO (AUDITORIA-ESTILO-DANBROWN.md) — aplica a cadeia
// idempotente de remédios de transparência à FUNDAÇÃO de um projeto (perfil-de-voz.md
// + .claude/agents/livro-revisor.md). NÃO toca capítulos nem ESTADO_LIVRO.json.
//
// Efeito (tudo idempotente por marcador/conteúdo):
//   - voz-regra4: cota deixa de pedir "funda frases curtas" (indutor de sanfona);
//   - craft-skill: Regra 4 de dan-brown vira "prosa transparente"; guarda §2 ganha
//     a cláusula anti-ornamento;
//   - modelos-perfil: parágrafos-modelo com tique ganham MODELO-FLAG (nunca reescreve);
//   - craft-agentes: revisor ganha o 2º eixo do veredito (ADENDO_TRANSPARENCIA).
//
// Uso (offline, a partir de worker/):
//   npx tsx scripts/renormalizar-estilo.ts <caminho-do-projeto> [<skill>]
// (skill default = lê de ESTADO_LIVRO.json)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizarVozRegra4 } from "../src/voz-regra4.js";
import { normalizarCraftSkill } from "../src/craft-skill.js";
import { desornamentarModelosPerfil } from "../src/modelos-perfil.js";
import { normalizarCraftNosAgentes } from "../src/craft-agentes.js";

async function skillDoProjeto(dir: string): Promise<string | null> {
  try {
    const est = JSON.parse(await readFile(path.join(dir, "ESTADO_LIVRO.json"), "utf8"));
    return typeof est.skill_escrita === "string" ? est.skill_escrita : null;
  } catch {
    return null;
  }
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("uso: npx tsx scripts/renormalizar-estilo.ts <caminho-do-projeto> [<skill>]");
    process.exit(2);
  }
  const skill = process.argv[3] || (await skillDoProjeto(dir));
  const v = await normalizarVozRegra4(dir);
  const c = await normalizarCraftSkill(dir, skill);
  const f = await desornamentarModelosPerfil(dir);
  const a = await normalizarCraftNosAgentes(path.join(dir, ".claude", "agents"));
  const vozMud = v.filter((x) => x.mudou).map((x) => x.arquivo);
  console.log(`[renorm-estilo] ${path.basename(dir)} (skill=${skill}):`);
  console.log(`  voz-regra4: ${vozMud.length ? vozMud.join(", ") : "(no-op)"}`);
  console.log(`  craft-skill (Regra 4 + guarda): ${c.mudou ? "atualizado" : "(no-op)"}`);
  console.log(`  modelos §2: ${f.mudou ? `MODELO-FLAG (${f.flags.join(", ")})` : "(limpos / já flagrado)"}`);
  console.log(`  revisor (2º eixo): ${a.revisor ? "ADENDO_TRANSPARENCIA injetado" : "(no-op)"}`);
}

main();
