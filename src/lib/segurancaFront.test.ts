// Guarda de segurança do bundle da interface.
//
// A auditoria da fase 2 pedia "nenhuma chave administrativa alcançável pela
// interface". Conferir isso uma vez não vale: a próxima pessoa que precisar de
// um `delete` que a RLS barra vai ser tentada a trazer o service role para cá.
// Este teste torna a tentativa uma falha de build.
//
// Varre o FONTE, não o bundle: o bundle é gerado a partir daqui, e apontar o
// arquivo exato é mais útil do que dizer "tem um segredo no dist".

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR_SRC = path.resolve(AQUI, "..");

function arquivosFonte(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivosFonte(p));
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** O que jamais pode aparecer no código que vai para o navegador. */
const PROIBIDO: { nome: string; re: RegExp }[] = [
  { nome: "chave de service role (nome da variável)", re: /SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|service_role/ },
  { nome: "chave secreta do Supabase", re: /\bsb_secret_[A-Za-z0-9_-]{8,}/ },
  { nome: "JWT literal", re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./ },
  { nome: "chave da Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{10,}/ },
];

describe("nenhuma credencial administrativa alcança o navegador", () => {
  const fontes = arquivosFonte(DIR_SRC);

  it("encontrou arquivos para varrer (a varredura não pode passar por vacuidade)", () => {
    expect(fontes.length).toBeGreaterThan(20);
  });

  for (const { nome, re } of PROIBIDO) {
    it(`nenhum arquivo de src/ contém ${nome}`, () => {
      const culpados = fontes.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => path.relative(DIR_SRC, f));
      expect(culpados, `remova de: ${culpados.join(", ")}`).toEqual([]);
    });
  }

  it("o cliente do Supabase é criado com a chave ANÔNIMA", () => {
    const cliente = readFileSync(path.join(DIR_SRC, "lib", "supabase.ts"), "utf8");
    expect(cliente).toContain("VITE_SUPABASE_ANON_KEY");
    expect(cliente).not.toMatch(/SERVICE_ROLE/);
  });

  it("o front não lê variável de ambiente fora do prefixo VITE_ (o resto não é público por acidente)", () => {
    // `import.meta.env` só expõe o que começa com VITE_; qualquer `process.env`
    // no front é sinal de que alguém tentou puxar segredo do worker para cá.
    const culpados = fontes
      .filter((f) => /\bprocess\.env\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(DIR_SRC, f));
    expect(culpados).toEqual([]);
  });
});
