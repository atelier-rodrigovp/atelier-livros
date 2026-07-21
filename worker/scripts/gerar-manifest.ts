// Caminho OFICIAL de atualização do manifest de skills (ETAPA 0b da rodada
// final): recomputa o sha256 de cada arquivo listado a partir de
// worker/skill-patches e bumpa a versão patch. Editou arquivo coberto pelo
// manifest ⇒ rode isto (o teste de regressão em skill-manifest.test.ts falha
// a suíte se esquecer).
// Uso: npx tsx worker/scripts/gerar-manifest.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Skill } from "../src/skill-manifest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "..", "skill-patches");
const manifestPath = path.join(raiz, "manifest.json");
const man = JSON.parse(readFileSync(manifestPath, "utf8"));

let mudanças = 0;
for (const f of man.files) {
  const alvo = path.join(raiz, ...f.path.split("/"));
  // MESMA canonicalização do verificador (LF) — hash sobre CRLF bruto gerava
  // manifests que reprovavam o próprio arquivo fonte (caso 1.0.9).
  const atual = sha256Skill(readFileSync(alvo), f.path);
  if (atual !== f.sha256) {
    console.log(`~ ${f.path}\n  ${f.sha256.slice(0, 16)}… -> ${atual.slice(0, 16)}…`);
    f.sha256 = atual;
    mudanças++;
  }
}
if (!mudanças) {
  console.log("manifest já corresponde aos arquivos — nada a fazer.");
  process.exit(0);
}
const [maj, min, pat] = String(man.manifestVersion).split(".").map(Number);
man.manifestVersion = `${maj}.${min}.${pat + 1}`;
man.generatedAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(man, null, 2) + "\n", "utf8");
console.log(`manifest ${man.manifestVersion} gravado (${mudanças} arquivo(s) atualizado(s)).`);
