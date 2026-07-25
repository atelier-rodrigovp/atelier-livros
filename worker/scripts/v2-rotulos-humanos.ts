// Exporta e importa a revisão humana dos detectores sem exigir edição manual
// dos JSONs versionados. A importação é apenas validação, salvo com --apply.
//
// Exemplos:
//   npx tsx scripts/v2-rotulos-humanos.ts --export rotulos.csv
//   npx tsx scripts/v2-rotulos-humanos.ts --import rotulos.csv --revisor "Nome"
//   npx tsx scripts/v2-rotulos-humanos.ts --import rotulos.csv --revisor "Nome" --apply

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aplicarRotulosValidados,
  exportarRotulosCsv,
  validarRotulosCsv,
} from "../src/v2/rotulagem-csv.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(aqui, "..");

function arg(nome: string): string | undefined {
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function flag(nome: string): boolean {
  return process.argv.includes(nome);
}

const dirCorpus = path.resolve(arg("--corpus") ?? path.join(workerDir, "calibration", "v1"));
const exportar = arg("--export");
const importar = arg("--import");

if (Boolean(exportar) === Boolean(importar)) {
  throw new Error("informe exatamente uma operação: --export <csv> ou --import <csv>");
}

if (exportar) {
  const destino = path.resolve(exportar);
  const resultado = exportarRotulosCsv(dirCorpus, {
    amostra: arg("--amostra"),
    skill: arg("--skill"),
    incluirValidadas: flag("--incluir-validadas"),
  });
  writeFileSync(destino, resultado.csv, "utf8");
  console.log(
    `planilha exportada: ${destino}\n` +
    `${resultado.amostras} amostra(s), ${resultado.ocorrencias} ocorrência(s), ${resultado.atestacoes} atestação(ões)`
  );
} else {
  const revisor = arg("--revisor");
  if (!revisor) throw new Error("--revisor é obrigatório na importação");
  const origem = path.resolve(importar!);
  const resultado = validarRotulosCsv(dirCorpus, readFileSync(origem, "utf8"), revisor);
  console.log(
    `planilha válida: ${resultado.amostras.length} amostra(s), ` +
    `${resultado.ocorrencias} ocorrência(s), ${resultado.falsasNegativas} falsa(s) negativa(s), ` +
    `${resultado.atestacoes} atestação(ões)`
  );
  if (flag("--apply")) {
    aplicarRotulosValidados(dirCorpus, resultado);
    console.log(`rótulos aplicados ao corpus por ${resultado.revisor} em ${resultado.revisadoEm}`);
  } else {
    console.log("dry-run concluído; use --apply somente após revisar o resumo acima");
  }
}
