// Gate não mutante usado pelo CI e antes de iniciar o worker publicado.

import { verificarReleaseAtual } from "../src/v2/release.js";

const resultado = verificarReleaseAtual();
if (!resultado.ok || !resultado.certificado) {
  console.error("RELEASE V2 NÃO CERTIFICADA");
  for (const erro of resultado.erros) console.error(`- ${erro}`);
  process.exitCode = 2;
} else {
  console.log(`release V2 certificada em ${resultado.certificado.codigo_commit}`);
  console.log(`runtime ${resultado.certificado.runtime_hash}`);
  console.log(
    resultado.certificado.skills
      .map((skill) => `${skill.id}@${skill.versao} ${skill.hash.slice(0, 12)}`)
      .join("\n")
  );
  console.log(`corpus ${resultado.certificado.calibracao.corpus_versao} ${resultado.certificado.calibracao.corpus_hash}`);
}
