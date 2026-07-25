// Laboratório V2 isolado: gera as mesmas cenas com as três skills, executa a
// avaliação cega e grava artefatos reproduzíveis sem tocar Supabase/produção.
//
// Uso (worker/):
//   CLAUDE_BIN=<executável> npx tsx scripts/v2-lab-isolado.ts --dir <saída>

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiscoPersistencia } from "../src/v2/persistencia.js";
import { analisarCalibracao } from "../src/v2/calibracao.js";
import { mapaModelosDoAmbiente } from "../src/v2/config.js";
import { ProvedorClaudeCli } from "../src/v2/provedor.js";
import { rodarLab } from "../src/v2/lab/rodar.js";
import { avaliarCego, gravarAvaliacaoCega, lerAvaliacaoCega } from "../src/v2/lab/avaliar.js";
import { compararExecucoes, execucaoAnterior, gravarRelatorio, resumirCalibracao } from "../src/v2/lab/relatorio.js";

async function main(): Promise<void> {
  const dirIdx = process.argv.indexOf("--dir");
  const dirArg = dirIdx >= 0 ? process.argv[dirIdx + 1] : undefined;
  const dirSaida = dirArg ? path.resolve(dirArg) : undefined;
  const claudeBin = process.env.CLAUDE_BIN;
  if (!dirSaida || !claudeBin) {
    throw new Error("uso: defina CLAUDE_BIN e informe --dir <diretório-de-saída>");
  }

  const skills = ["dan-brown", "hoover-mcfadden", "romantasy"];
  const provedor = new ProvedorClaudeCli(claudeBin);
  const mapa = mapaModelosDoAmbiente();
  const persistencia = new DiscoPersistencia(dirSaida);
  const anterior = await execucaoAnterior(dirSaida);
  const calibracao = resumirCalibracao(
    analisarCalibracao(path.resolve(workerDir(), "calibration", "v1")),
    skills
  );

  console.log(`laboratório isolado: ${dirSaida}`);
  console.log(`skills: ${skills.join(", ")} · escritor: ${mapa.prosa} · avaliador: ${mapa.julgamento}`);
  const exec = await rodarLab({ skills, provedor, mapa, dirSaida, persistencia });
  console.log(`amostras geradas: ${exec.amostras.length} · execução ${exec.id}`);

  const avaliacao = await avaliarCego(exec, { provedor, mapa, persistencia });
  const avaliacaoPath = await gravarAvaliacaoCega(dirSaida, avaliacao);
  const anteriorValido = anterior && anterior.id !== exec.id ? anterior : null;
  const avaliacaoAnterior = anteriorValido ? await lerAvaliacaoCega(dirSaida, anteriorValido.id) : null;
  const relatorio = compararExecucoes(exec, avaliacao, anteriorValido, avaliacaoAnterior, calibracao);
  const relatorioPath = await gravarRelatorio(dirSaida, relatorio);

  console.log(`distinguibilidade: ${(avaliacao.distinguibilidade * 100).toFixed(1)}%`);
  console.log(`decisão: ${relatorio.decisao}`);
  if (relatorio.falhasDistincao.length) {
    for (const falha of relatorio.falhasDistincao) console.log(`  - ${falha}`);
  }
  if (relatorio.falhasCalibracao.length) {
    console.log("calibração pendente:");
    for (const falha of relatorio.falhasCalibracao) console.log(`  - ${falha}`);
  }
  console.log(`avaliação bruta: ${avaliacaoPath}`);
  console.log(`relatório: ${relatorioPath}`);
  if (relatorio.decisao !== "aprovar") process.exitCode = 2;
}

function workerDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

main().catch((erro) => {
  console.error("LAB ISOLADO FALHOU:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
