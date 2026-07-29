// Gate não mutante usado pelo CI e antes de iniciar o worker publicado.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decidirGateReleaseCI } from "../src/v2/gate-release-ci.js";
import { verificarReleaseAtual } from "../src/v2/release.js";

const resultado = verificarReleaseAtual();
const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arquivoCertificadoExiste = existsSync(path.join(workerDir, "release", "engine-v2.json"));
const decisao = decidirGateReleaseCI({
  modoPreCanario: process.argv.includes("--pre-canary"),
  arquivoCertificadoExiste,
  releaseOk: resultado.ok,
  certificado: resultado.certificado,
  erros: resultado.erros,
});

if (!decisao.ok) {
  console.error("RELEASE V2 NÃO CERTIFICADA");
  for (const erro of resultado.erros) console.error(`- ${erro}`);
  process.exitCode = 2;
} else if (decisao.estado === "PRE_CANARY_RELEASE_BLOQUEADA") {
  console.log("PRE-CANÁRIO: DEPLOY TÉCNICO APROVADO");
  console.log(decisao.mensagem);
  for (const erro of resultado.erros) console.log(`- bloqueio preservado: ${erro}`);
} else {
  const certificado = resultado.certificado!;
  console.log(`release V2 certificada em ${certificado.codigo_commit}`);
  console.log(`runtime ${certificado.runtime_hash}`);
  console.log(
    certificado.skills
      .map((skill) => `${skill.id}@${skill.versao} ${skill.hash.slice(0, 12)}`)
      .join("\n")
  );
  console.log(`corpus ${certificado.calibracao.corpus_versao} ${certificado.calibracao.corpus_hash}`);
}
