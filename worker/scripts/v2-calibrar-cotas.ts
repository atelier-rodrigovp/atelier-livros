// Executa a calibração reproduzível. Não altera contratos: produz somente um
// relatório candidato, que ainda precisa passar pelo holdout e laboratório cego.
//
// Uso:
//   npx tsx worker/scripts/v2-calibrar-cotas.ts
//   npx tsx worker/scripts/v2-calibrar-cotas.ts --corpus <dir> --json <saida>

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analisarCalibracao } from "../src/v2/calibracao.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(aqui, "..");
const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const dirCorpus = path.resolve(arg("--corpus") ?? path.join(workerDir, "calibration", "v1"));
const resultado = analisarCalibracao(dirCorpus);
const json = JSON.stringify(resultado, null, 2) + "\n";
const saida = arg("--json");
if (saida) {
  writeFileSync(path.resolve(saida), json, "utf8");
  console.log(`resultado gravado em ${path.resolve(saida)}`);
} else {
  process.stdout.write(json);
}

if (resultado.pendencias.length > 0) {
  console.error(`calibração incompleta: ${resultado.pendencias.join(" · ")}`);
  process.exitCode = 2;
}
