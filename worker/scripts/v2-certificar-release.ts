// Gera o único artefato que libera fundação/escrita V2 no worker.
//
// Uso (worker/):
// npx tsx scripts/v2-certificar-release.ts `
//   --canarios <canario-v2-resumo.json> `
//   --lab-dir <diretorio-da-execucao-do-lab> `
//   --por "Nome do autor/revisor" `
//   --commit <sha-git-completo>

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analisarCalibracao } from "../src/v2/calibracao.js";
import {
  criarCertificadoRelease,
  estadoAtualRelease,
} from "../src/v2/release.js";
import type { AvaliacaoCega } from "../src/v2/lab/avaliar.js";
import type { RelatorioLab } from "../src/v2/lab/relatorio.js";
import type { ExecucaoLab } from "../src/v2/lab/rodar.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(aqui, "..");

function arg(nome: string): string | undefined {
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function lerJson<T>(arquivo: string): { valor: T; hash: string } {
  const conteudo = readFileSync(arquivo, "utf8");
  return {
    valor: JSON.parse(conteudo) as T,
    hash: createHash("sha256").update(conteudo, "utf8").digest("hex"),
  };
}

const canariosArg = arg("--canarios");
const labDirArg = arg("--lab-dir");
const emitidoPor = arg("--por") ?? "";
const codigoCommit = arg("--commit") ?? "";
if (!canariosArg || !labDirArg || !emitidoPor || !codigoCommit) {
  throw new Error("uso: --canarios <json> --lab-dir <dir> --por <nome> --commit <sha-completo>");
}

const canariosPath = path.resolve(canariosArg);
const labDir = path.resolve(labDirArg);
const saida = path.resolve(arg("--output") ?? path.join(workerDir, "release", "engine-v2.json"));
if (existsSync(saida)) {
  throw new Error(`certificado já existe em ${saida}; preserve-o no Git e remova/substitua somente por decisão explícita`);
}

const canarios = lerJson<unknown>(canariosPath);
const execucao = lerJson<ExecucaoLab>(path.join(labDir, "execucao.json"));
const automatica = lerJson<AvaliacaoCega>(path.join(labDir, "avaliacao-cega.json"));
const relatorio = lerJson<RelatorioLab>(path.join(labDir, "relatorio.json"));
const calibracao = analisarCalibracao(path.join(workerDir, "calibration", "v1"));
const skills = ["dan-brown", "hoover-mcfadden", "romantasy"];
const estado = estadoAtualRelease(skills, calibracao);
const certificado = criarCertificadoRelease({
  canarios: canarios.valor,
  execucaoLab: execucao.valor,
  avaliacaoAutomatica: automatica.valor,
  relatorioLab: relatorio.valor,
  calibracao,
  emitidoPor,
  emitidoEm: new Date().toISOString(),
  codigoCommit,
  hashes: {
    canarios: canarios.hash,
    execucaoLab: execucao.hash,
    avaliacaoAutomatica: automatica.hash,
    relatorioLab: relatorio.hash,
  },
}, estado);

const temporario = `${saida}.tmp`;
writeFileSync(temporario, JSON.stringify(certificado, null, 2) + "\n", "utf8");
renameSync(temporario, saida);
console.log(`release V2 certificada: ${saida}`);
console.log(`engine ${certificado.engine_version} · commit ${certificado.codigo_commit}`);
console.log(`runtime ${certificado.runtime_hash}`);
console.log(`corpus ${certificado.calibracao.corpus_versao} · ${certificado.calibracao.corpus_hash}`);
console.log(`skills: ${certificado.skills.map((skill) => `${skill.id}@${skill.versao}`).join(" · ")}`);
