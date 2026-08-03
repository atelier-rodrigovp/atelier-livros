// Fingerprints do código — a régua pela qual a evidência externa caduca.
//
// Dois defeitos que este arquivo trava:
//
// 1. FIM DE LINHA. O hash lia os BYTES DO DISCO. Como `.gitattributes` só
//    protegia `worker/calibration/**`, a normalização de CRLF no checkout
//    mudava os bytes de 4 dos 11 `.sql` SEM que `git status` acusasse nada e sem
//    que uma linha de SQL mudasse — e `migrations_source_hash` acendia sozinho,
//    invalidando evidência boa. Isso não é rigor, é falso positivo.
//
// 2. CAMINHO ABSOLUTO. O hash misturava o caminho completo do arquivo, então o
//    mesmo código em outro diretório (worktree, clone, outra máquina) produzia
//    outro hash. Um gate que reprova por causa de ONDE o repo está não mede o
//    código.
//
// O que continua valendo: mudou o CONTEÚDO, muda o hash. É isso que o gate
// precisa detectar, e só isso.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDeArquivos, listarArquivos } from "./fingerprints.js";

const SQL = [
  "-- migração de teste",
  "create table if not exists public.exemplo (",
  "  id uuid primary key,",
  "  nome text not null",
  ");",
].join("\n");

let raiz: string;

beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), "fingerprints-"));
  mkdirSync(path.join(raiz, "supabase"), { recursive: true });
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

function escrever(nome: string, conteudo: string): void {
  writeFileSync(path.join(raiz, "supabase", nome), conteudo, "utf8");
}

describe("hashDeArquivos é determinístico quanto ao fim de linha", () => {
  it("LF e CRLF do MESMO conteúdo produzem o MESMO hash", () => {
    escrever("a.sql", SQL);
    const comLf = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));

    escrever("a.sql", SQL.replace(/\n/g, "\r\n"));
    const comCrlf = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));

    expect(comCrlf).toBe(comLf);
  });

  it("CR sozinho (Mac clássico) também não muda o hash", () => {
    escrever("a.sql", SQL);
    const comLf = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));
    escrever("a.sql", SQL.replace(/\n/g, "\r"));
    expect(hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/))).toBe(comLf);
  });

  it("mudar UMA LINHA de conteúdo MUDA o hash — o gate continua valendo", () => {
    escrever("a.sql", SQL);
    const antes = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));
    escrever("a.sql", SQL.replace("nome text not null", "nome text"));
    expect(hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/))).not.toBe(antes);
  });

  it("acrescentar um arquivo MUDA o hash", () => {
    escrever("a.sql", SQL);
    const antes = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));
    escrever("b.sql", "select 1;");
    expect(hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/))).not.toBe(antes);
  });

  it("renomear MUDA o hash (o nome faz parte da identidade da migração)", () => {
    escrever("a.sql", SQL);
    const antes = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));
    rmSync(path.join(raiz, "supabase", "a.sql"));
    escrever("z.sql", SQL);
    expect(hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/))).not.toBe(antes);
  });
});

describe("hashDeArquivos não depende de ONDE o repositório está", () => {
  it("o mesmo conteúdo em outra raiz produz o mesmo hash", () => {
    escrever("a.sql", SQL);
    escrever("b.sql", "select 2;");
    const aqui = hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/));

    const outra = mkdtempSync(path.join(tmpdir(), "fingerprints-outra-"));
    try {
      mkdirSync(path.join(outra, "supabase"), { recursive: true });
      writeFileSync(path.join(outra, "supabase", "a.sql"), SQL, "utf8");
      writeFileSync(path.join(outra, "supabase", "b.sql"), "select 2;", "utf8");
      const la = hashDeArquivos(outra, listarArquivos(path.join(outra, "supabase"), /\.sql$/));
      expect(la).toBe(aqui);
    } finally {
      rmSync(outra, { recursive: true, force: true });
    }
  });
});
