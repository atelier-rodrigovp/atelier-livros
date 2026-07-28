// Publica o resumo do `npm run prontidao` para a interface.
//
// ESCREVE NO SUPABASE. Por isso exige `--confirmar` explícito: nenhuma rodada de
// verificação deve tocar o remoto por engano.
//
//   npx tsx scripts/publicar-prontidao.ts            (mostra o que publicaria)
//   npx tsx scripts/publicar-prontidao.ts --confirmar (publica)

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { payloadDaProntidao, TIPO_JOB_PRONTIDAO } from "../src/v2/publicacao-prontidao.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const ARQUIVO = path.join(RAIZ, ".prontidao", "prontidao.json");

if (!existsSync(ARQUIVO)) {
  console.error(`sem relatório em ${ARQUIVO} — rode \`npm run prontidao\` antes`);
  process.exit(1);
}

const payload = payloadDaProntidao(JSON.parse(readFileSync(ARQUIVO, "utf8")));
console.log("payload que seria publicado:\n", JSON.stringify(payload, null, 2));

if (!process.argv.includes("--confirmar")) {
  console.log("\nnada foi escrito. Use --confirmar para publicar em `jobs`.");
  process.exit(0);
}

const { sb, OWNER } = await import("../src/supabase.js");
// Linha única e global (sem project_id): a prontidão é do CÓDIGO, não do livro.
await sb.from("jobs").delete().eq("owner", OWNER).eq("tipo", TIPO_JOB_PRONTIDAO);
const { error } = await sb.from("jobs").insert({ owner: OWNER, tipo: TIPO_JOB_PRONTIDAO, status: "done", payload });
if (error) {
  console.error(`falha ao publicar: ${error.message}`);
  process.exit(1);
}
console.log(`publicado em jobs(tipo='${TIPO_JOB_PRONTIDAO}') para o commit ${payload.head.slice(0, 7)}`);
