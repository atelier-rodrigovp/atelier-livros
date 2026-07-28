// Smoke TÉCNICO do provedor — sem uma linha de prosa.
//
// O que se quer saber é se o canal funciona: autentica, responde, devolve JSON
// que casa com um schema, respeita timeout, classifica erro e contabiliza cota.
// Nada disso precisa de literatura, e por isso a tarefa é um eco estruturado.
//
// NÃO chama o papel `escritor`, não usa contrato de skill e não toca projeto
// nenhum. Escreve o resultado como entrada para o harness de evidência.
//
//   npx tsx scripts/smoke-provedor.ts --saida <arquivo.json>

import "dotenv/config"; // CLAUDE_BIN vive no .env do worker
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProvedorClaudeCli } from "../src/v2/provedor.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Passo {
  nome: string;
  comando?: string;
  exit_code: number | null;
  saida: string;
}

const passos: Passo[] = [];
const registrar = (nome: string, ok: boolean, saida: string, comando?: string) => {
  passos.push({ nome, comando, exit_code: ok ? 0 : 1, saida: saida.slice(0, 400) });
  console.log(`[${ok ? "OK" : "FALHA"}] ${nome} — ${saida.slice(0, 120)}`);
};

// `contextualizador` e o papel explicitamente PROIBIDO de gerar prosa — a
// escolha honesta para um smoke que nao pode escrever literatura.
const PAPEL = "contextualizador" as const;
const provedor = new ProvedorClaudeCli(process.env.CLAUDE_BIN ?? "claude");
// Modelo de RACIOCÍNIO, nunca o de prosa: o smoke mede o canal, não a escrita.
const MODELO = process.env.SMOKE_MODELO ?? "claude-sonnet-5";

// 1. Autenticação + disponibilidade + resposta estruturada mínima.
const t0 = Date.now();
let bruto = "";
try {
  const r = await provedor.chamar({
    papel: PAPEL,
    capacidade: "raciocinio",
    modelo: MODELO,
    prompt:
      'Responda APENAS com este JSON, sem texto ao redor e sem markdown: ' +
      '{"ok":true,"eco":"prontidao"}',
    timeoutMs: 120_000,
  });
  bruto = r.texto ?? "";
  registrar("autenticacao e disponibilidade do provedor", true, `respondeu em ${Date.now() - t0}ms`, `${MODELO} (raciocinio)`);
  registrar(
    "modelo executado e o solicitado",
    r.modeloExecutado === MODELO,
    `solicitado=${MODELO} executado=${r.modeloExecutado ?? "nao informado"}`
  );
} catch (e) {
  registrar("autenticacao e disponibilidade do provedor", false, e instanceof Error ? e.message : String(e));
}

// 2. Schema: a resposta precisa ser JSON com as chaves pedidas.
try {
  const m = /\{[\s\S]*\}/.exec(bruto);
  const obj = JSON.parse(m?.[0] ?? "null") as { ok?: boolean; eco?: string };
  registrar(
    "resposta estruturada valida contra schema minimo",
    obj?.ok === true && obj?.eco === "prontidao",
    `ok=${String(obj?.ok)} eco=${String(obj?.eco)}`
  );
} catch (e) {
  registrar("resposta estruturada valida contra schema minimo", false, `JSON invalido: ${e instanceof Error ? e.message : String(e)}`);
}

// 3. Timeout: um limite impossível tem de ABORTAR, não pendurar.
const t1 = Date.now();
try {
  await provedor.chamar({ papel: PAPEL, capacidade: "raciocinio", modelo: MODELO, prompt: "diga ok", timeoutMs: 1 });
  registrar("timeout aborta a chamada", false, "a chamada retornou apesar do timeout de 1ms");
} catch {
  registrar("timeout aborta a chamada", true, `abortou em ${Date.now() - t1}ms`);
}

// 4. Erro de configuração é classificado, não engolido.
try {
  await provedor.chamar({
    papel: PAPEL,
    capacidade: "raciocinio",
    modelo: "modelo-que-nao-existe-xyz",
    prompt: "ok",
    timeoutMs: 60_000,
  });
  registrar("modelo invalido e recusado", false, "a chamada passou com modelo inexistente");
} catch (e) {
  registrar("modelo invalido e recusado", true, `classificado: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
}

const saida = arg("--saida");
if (saida) {
  writeFileSync(
    saida,
    JSON.stringify(
      {
        tipo: "provedor_real",
        ambiente: "producao",
        supabase_project_ref: process.env.SUPABASE_PROJECT_REF ?? "dzgbatsecbkjmucmigjv",
        project_id: "nenhum-smoke-tecnico",
        executor_ref: "owner-atelier-livros",
        caminhosLimpeza: ["worker/src/v2"],
        passos,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nentrada para o harness: ${path.relative(path.resolve(AQUI, "..", ".."), saida)}`);
}

const falhas = passos.filter((p) => p.exit_code !== 0).length;
console.log(`\n${passos.length - falhas}/${passos.length} passos aprovados`);
process.exit(falhas ? 1 : 0);
