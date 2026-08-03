// A impressão do código tem UMA implementação — e este arquivo existe para que
// continue tendo.
//
// O que aconteceu: `fingerprints.ts` nasceu no PASSO 1 como régua nova (caminho
// RELATIVO à raiz, conteúdo com EOL NORMALIZADO) e passou a ser usada pelos dois
// LEITORES — `prontidao.ts` e o gate do CI. Mas o ESCRITOR
// (`scripts/gerar-evidencia.ts`, "a única forma legítima de escrever em
// .evidencias/") ficou com a cópia velha: caminho ABSOLUTO e bytes CRUS. O
// comentário dela dizia "Mesma receita do prontidao.ts" — verdade antes do
// PASSO 1, mentira depois.
//
// Medido antes do conserto: 0 dos 4 campos batiam entre escritor e leitor. Toda
// evidência gerada nasceria inválida nos quatro, com a mensagem
// "fingerprints.* mudou desde a verificação" — exatamente o que se vê quando o
// código mudou de verdade. O diagnóstico errado era quase garantido.
//
// Por que o teste olha o FONTE e não só os números: dois números que batem hoje
// não impedem alguém de recriar uma receita local amanhã. O que precisa ser
// impossível é a EXISTÊNCIA de uma segunda implementação.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprintsAtuais } from "./fingerprints.js";

const DIR_V2 = import.meta.dirname;
const DIR_WORKER = path.resolve(DIR_V2, "..", "..");
const RAIZ = path.resolve(DIR_WORKER, "..");

/** Todos os .ts/.tsx do repo que podem conter código (sem node_modules/dist). */
function fontesDoRepo(): string[] {
  const raizes = [path.join(DIR_WORKER, "src"), path.join(DIR_WORKER, "scripts"), path.join(RAIZ, "src")];
  const out: string[] = [];
  const anda = (dir: string) => {
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const nome of entradas) {
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) {
        if (nome === "node_modules" || nome === "dist" || nome === ".tmp") continue;
        anda(p);
      } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
        out.push(p);
      }
    }
  };
  for (const r of raizes) anda(r);
  return out;
}

const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join("/");

describe("a impressão do código tem UMA implementação", () => {
  // Um arquivo que MONTA o objeto das quatro impressões está implementando a
  // regra. Só `fingerprints.ts` pode. Isto pega uma segunda cópia em QUALQUER
  // lugar — inclusive uma terceira, que o conserto de hoje não previu.
  it("só `fingerprints.ts` monta o objeto das quatro impressões", () => {
    const implementadores = fontesDoRepo().filter((f) => {
      const texto = readFileSync(f, "utf8");
      // A assinatura de quem IMPLEMENTA: atribui os quatro campos.
      return (
        /migrations_source_hash\s*:/.test(texto) &&
        /contratos_hash\s*:/.test(texto) &&
        /worker_hash\s*:/.test(texto) &&
        /interface_hash\s*:/.test(texto) &&
        // A declaração do TIPO (evidencia-externa.ts) não implementa nada.
        !/interface FingerprintsCodigo/.test(texto)
      );
    });
    expect(implementadores.map(rel)).toEqual(["worker/src/v2/fingerprints.ts"]);
  });

  // O escritor de evidência é o ponto sensível: é ele quem carimba o que os
  // leitores vão conferir. Se ele voltar a ter receita própria, a evidência
  // nasce inválida e o erro se disfarça de "o código mudou".
  it("o ESCRITOR de evidência importa a função única e não tem receita própria", () => {
    const escritor = path.join(DIR_WORKER, "scripts", "gerar-evidencia.ts");
    const texto = readFileSync(escritor, "utf8");

    expect(texto).toMatch(/import\s*\{[^}]*fingerprintsAtuais[^}]*\}\s*from\s*"\.\.\/src\/v2\/fingerprints\.js"/);
    expect(texto).toContain("fingerprintsAtuais(");

    // Nenhum ingrediente de uma receita local pode reaparecer aqui.
    expect(texto).not.toContain("createHash");
    expect(texto).not.toContain("readdirSync");
    expect(texto).not.toMatch(/function\s+hashDe\b/);
    expect(texto).not.toMatch(/function\s+listar\b/);
    expect(texto).not.toMatch(/function\s+fingerprints\b/);
  });

  // Os dois leitores também precisam continuar na função única — foi por eles
  // terem migrado sozinhos que o escritor ficou para trás.
  it("os LEITORES (prontidão e gate do CI) usam a mesma função única", () => {
    for (const script of ["prontidao.ts", "v2-verificar-release.ts"]) {
      const texto = readFileSync(path.join(DIR_WORKER, "scripts", script), "utf8");
      expect(texto, `${script} deve importar de fingerprints.js`).toMatch(
        /from\s*"\.\.\/src\/v2\/fingerprints\.js"/
      );
      expect(texto, `${script} não pode ter createHash próprio`).not.toContain("createHash");
    }
  });

  // Prova funcional: a função é determinística para a mesma raiz. Duas chamadas
  // não podem divergir — se divergirem, alguém tornou o cálculo dependente de
  // estado (cwd, relógio, ordem de leitura).
  it("a função única devolve o mesmo resultado para a mesma raiz", () => {
    const a = fingerprintsAtuais(RAIZ, DIR_WORKER);
    const b = fingerprintsAtuais(RAIZ, DIR_WORKER);
    expect(b).toEqual(a);
    for (const v of Object.values(a)) expect(v).toMatch(/^[0-9a-f]{16}$/);
  });
});
