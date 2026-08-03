// Gate não mutante usado pelo CI e antes de iniciar o worker publicado.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decidirGateReleaseCI } from "../src/v2/gate-release-ci.js";
import { avaliarEvidenciasExternas } from "../src/v2/fingerprints.js";
import { verificarReleaseAtual } from "../src/v2/release.js";

const resultado = verificarReleaseAtual();
const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raiz = path.resolve(workerDir, "..");
const arquivoCertificadoExiste = existsSync(path.join(workerDir, "release", "engine-v2.json"));

// O gate era CEGO para prova vencida: lia só o certificado e nunca `.evidencias/`.
// Foi assim que o CI passou verde em 2026-08-01 com as cinco evidências caducas.
// Mesma régua da prontidão (`avaliarEvidenciasExternas` → `validarEvidencia`).
const evidencias = avaliarEvidenciasExternas({
  raiz,
  dirWorker: workerDir,
  ambiente: "producao",
  supabaseProjectRef: process.env.SUPABASE_PROJECT_REF ?? "dzgbatsecbkjmucmigjv",
});

const decisao = decidirGateReleaseCI({
  modoPreCanario: process.argv.includes("--pre-canary"),
  arquivoCertificadoExiste,
  releaseOk: resultado.ok,
  certificado: resultado.certificado,
  erros: resultado.erros,
  evidencias,
});

if (decisao.estado === "EVIDENCIA_EXTERNA_VENCIDA") {
  console.error("EVIDÊNCIA EXTERNA VENCIDA — o código mudou desde a verificação");
  for (const e of evidencias) {
    if (e.valida === false) {
      console.error(`- ${e.tipo} (testou ${String(e.testouCommit ?? "?").slice(0, 7)}): ${e.motivos.join(" · ")}`);
    }
  }
  console.error("");
  console.error("Regenere as evidências com o harness contra o HEAD atual. Nenhum atalho:");
  console.error("prova que não vale mais para este código não certifica este código.");
  process.exitCode = 2;
} else if (!decisao.ok) {
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
