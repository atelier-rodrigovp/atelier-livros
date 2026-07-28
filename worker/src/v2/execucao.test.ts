// Teste de INTEGRAÇÃO de propósito: a captura do HEAD roda `git` de verdade.
// Um mock aqui não provaria nada — o defeito original era exatamente o spawn
// falhando no Windows por causa do sufixo `.cmd`, algo que só o processo real
// revela.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { capturarHead, ErroHead, nomeExecutavel, rodarComando, worktreeLimpa } from "./execucao.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..", "..");

describe("resolução do executável", () => {
  it("no Windows, npm e npx são shims .cmd", () => {
    expect(nomeExecutavel("npm", "win32")).toBe("npm.cmd");
    expect(nomeExecutavel("npx", "win32")).toBe("npx.cmd");
  });

  it("no Windows, git NÃO leva .cmd (é .exe — era o bug)", () => {
    expect(nomeExecutavel("git", "win32")).toBe("git");
  });

  it("fora do Windows nada ganha sufixo", () => {
    expect(nomeExecutavel("npm", "linux")).toBe("npm");
    expect(nomeExecutavel("git", "darwin")).toBe("git");
  });
});

describe("captura do HEAD (git real)", () => {
  it("devolve EXATAMENTE `git rev-parse HEAD`", () => {
    const esperado = execFileSync("git", ["rev-parse", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).trim();
    expect(capturarHead(RAIZ)).toBe(esperado);
  });

  it("o SHA tem 40 hexadígitos, não um rótulo qualquer", () => {
    expect(capturarHead(RAIZ)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("fora de um repositório, LANÇA — nunca devolve 'desconhecido'", () => {
    // O defeito original: falha do git virava a string "desconhecido", que
    // seguia adiante carimbada num documento de certificação.
    const fora = path.parse(RAIZ).root;
    let erro: unknown;
    try {
      capturarHead(fora);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroHead);
    expect(String((erro as Error).message)).not.toContain("desconhecido");
  });
});

describe("código de saída não é descartado", () => {
  it("comando que falha devolve ok:false com código", () => {
    const r = rodarComando(RAIZ, "git", ["rev-parse", "--verify", "nao-existe-esta-ref"]);
    expect(r.ok).toBe(false);
    expect(r.code).not.toBe(0);
  });

  it("comando que passa devolve ok:true e código 0", () => {
    const r = rodarComando(RAIZ, "git", ["--version"]);
    expect(r.ok).toBe(true);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("git version");
  });

  it("executável inexistente não vira sucesso", () => {
    const r = rodarComando(RAIZ, "comando-que-nao-existe-mesmo", ["--x"]);
    expect(r.ok).toBe(false);
  });
});

describe("worktree", () => {
  it("responde sobre os caminhos pedidos sem quebrar", () => {
    const r = worktreeLimpa(RAIZ, ["worker/src/v2/execucao.ts"]);
    expect(typeof r.limpa).toBe("boolean");
    expect(Array.isArray(r.sujos)).toBe(true);
  });

  it("caminho inexistente conta como limpo (não há alteração pendente)", () => {
    expect(worktreeLimpa(RAIZ, ["caminho/que/nao/existe"]).limpa).toBe(true);
  });
});
