// Custo por papel e por CAPÍTULO na V2.
//
// Por que este arquivo existe: não havia nenhuma estimativa de custo por
// capítulo na V2. O único número era da V1 (323k tokens/capítulo, medido em
// transcripts do runner Python). Sem isto, "o sistema escreve um livro" é
// indecidível mesmo com qualidade boa — pode ser capaz e inviável.
//
// O teste de agregação é puro, mas o teste que importa é o de INTEGRAÇÃO com o
// MOLDE: `executarPapel` grava os tokens no run, e a agregação lê o ledger. Se
// alguém parar de instrumentar o molde, o teste do molde fica vermelho.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agregarCusto,
  capituloDoAlvoCusto,
  projetarCustoLivro,
  type RunCusto,
} from "./custo.js";
import { Gravador } from "./gravador.js";
import { executarPapel } from "./papeis.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ProvedorMock } from "./provedor.js";
import type { MapaModelos } from "./tipos.js";

const MAPA: MapaModelos = {
  raciocinio: "claude-sonnet-5",
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
  julgamento: "claude-sonnet-5",
};

function pacote(alvo: string, papel: string) {
  return {
    hash: "bundle",
    papel,
    alvo,
    skill: { id: "teste", versao: "1.0.0", hash: "skill" },
    instrucoes: [],
    repeticoesRecentes: [],
    secoes: [],
  } as never;
}

function run(over: Partial<RunCusto> = {}): RunCusto {
  return {
    papel: "escritor",
    alvo: "capitulo:1",
    status: "ok",
    model_name: "claude-opus-5",
    tokens_in: 100,
    tokens_out: 50,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Extração do capítulo
// ---------------------------------------------------------------------------

describe("capituloDoAlvoCusto", () => {
  it("reconhece o alvo do capítulo e o da ficha — os dois são custo do MESMO capítulo", () => {
    expect(capituloDoAlvoCusto("capitulo:3")).toBe(3);
    // A ficha (`spec:N`) é trabalho gasto para produzir o capítulo N. Deixá-la
    // fora subestimaria o custo real de cada capítulo.
    expect(capituloDoAlvoCusto("spec:3")).toBe(3);
  });

  it("alvos que não são de capítulo não viram capítulo", () => {
    expect(capituloDoAlvoCusto("livro")).toBeNull();
    expect(capituloDoAlvoCusto("fundacao")).toBeNull();
    expect(capituloDoAlvoCusto("ato:2")).toBeNull();
    expect(capituloDoAlvoCusto("canario-voz")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

describe("agregarCusto", () => {
  it("soma por papel, por capítulo e por modelo, com entrada, saída e total", () => {
    const c = agregarCusto([
      run({ papel: "escritor", alvo: "capitulo:1", tokens_in: 1000, tokens_out: 500, model_name: "claude-opus-5" }),
      run({ papel: "revisor_literario", alvo: "capitulo:1", tokens_in: 300, tokens_out: 100, model_name: "claude-sonnet-5" }),
      run({ papel: "escritor", alvo: "capitulo:2", tokens_in: 900, tokens_out: 400, model_name: "claude-opus-5" }),
    ]);

    expect(c.totais).toEqual({ entrada: 2200, saida: 1000, total: 3200 });
    expect(c.por_papel.escritor).toEqual({ entrada: 1900, saida: 900, total: 2800, runs: 2 });
    expect(c.por_papel.revisor_literario).toEqual({ entrada: 300, saida: 100, total: 400, runs: 1 });
    expect(c.por_capitulo["1"]).toEqual({ entrada: 1300, saida: 600, total: 1900, runs: 2 });
    expect(c.por_capitulo["2"]).toEqual({ entrada: 900, saida: 400, total: 1300, runs: 1 });
    expect(c.por_modelo["claude-opus-5"].total).toBe(2800);
  });

  it("mede só o que foi medido: run sem token não inventa zero nem infla a média", () => {
    const c = agregarCusto([
      run({ alvo: "capitulo:1", tokens_in: 1000, tokens_out: 500 }),
      run({ alvo: "capitulo:2", tokens_in: undefined, tokens_out: undefined }),
    ]);
    // O capítulo 2 não tem medição: não entra na contagem de capítulos medidos.
    expect(c.capitulos_medidos).toBe(1);
    expect(c.media_por_capitulo.total).toBe(1500);
    expect(c.runs_sem_medicao).toBe(1);
  });

  it("run que falhou não conta como custo de capítulo produzido", () => {
    const c = agregarCusto([
      run({ alvo: "capitulo:1", status: "ok", tokens_in: 1000, tokens_out: 500 }),
      run({ alvo: "capitulo:1", status: "falha", tokens_in: 800, tokens_out: 0 }),
    ]);
    expect(c.por_capitulo["1"].total).toBe(1500);
    expect(c.runs_falhos).toBe(1);
  });

  it("trabalho fora de capítulo (livro, fundação) fica visível, não sumido", () => {
    const c = agregarCusto([
      run({ alvo: "capitulo:1", tokens_in: 100, tokens_out: 100 }),
      run({ papel: "arquiteto_enredo", alvo: "fundacao", tokens_in: 900, tokens_out: 900 }),
    ]);
    expect(c.por_capitulo["1"].total).toBe(200);
    expect(c.sem_capitulo.total).toBe(1800);
    // A média por capítulo NÃO pode absorver o custo de fundação.
    expect(c.media_por_capitulo.total).toBe(200);
  });

  it("sem nenhum run medido, a média é zero e nada é projetável", () => {
    const c = agregarCusto([]);
    expect(c.capitulos_medidos).toBe(0);
    expect(c.media_por_capitulo.total).toBe(0);
    expect(projetarCustoLivro(c, 40)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Projeção (B2) — sempre rotulada, nunca confundida com medida
// ---------------------------------------------------------------------------

describe("projetarCustoLivro", () => {
  it("projeta média medida × total de capítulos e declara a base da conta", () => {
    const c = agregarCusto([
      run({ alvo: "capitulo:1", tokens_in: 1000, tokens_out: 500 }),
      run({ alvo: "capitulo:2", tokens_in: 1000, tokens_out: 500 }),
    ]);
    const p = projetarCustoLivro(c, 40)!;
    expect(p.base_capitulos_medidos).toBe(2);
    expect(p.total_capitulos).toBe(40);
    expect(p.media_por_capitulo.total).toBe(1500);
    expect(p.projetado.total).toBe(60000);
    // O rótulo é parte do dado: quem consome não pode confundir com medição.
    expect(p.natureza).toBe("PROJECAO");
  });

  it("sem total de capítulos não há projeção (não inventa denominador)", () => {
    const c = agregarCusto([run({ alvo: "capitulo:1", tokens_in: 10, tokens_out: 10 })]);
    expect(projetarCustoLivro(c, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// INTEGRAÇÃO COM O MOLDE — o que prova que a instrumentação existe
// ---------------------------------------------------------------------------

describe("o molde `executarPapel` registra tokens no ledger", () => {
  let dir: string;
  let disco: DiscoPersistencia;
  let gravador: Gravador;
  let provedor: ProvedorMock;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "engine-v2-custo-"));
    disco = new DiscoPersistencia(dir);
    gravador = new Gravador({ persistencia: disco, projectId: "proj-1" });
    provedor = new ProvedorMock();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("um papel executado deixa tokens_in/tokens_out no run, e a agregação os encontra por papel e por capítulo", async () => {
    provedor.enfileirar("escritor", { texto: "prosa do capítulo 1", tokensIn: 1200, tokensOut: 800 });
    provedor.enfileirar("revisor_literario", { texto: "parecer", tokensIn: 400, tokensOut: 150 });

    await executarPapel<string>({
      papel: "escritor",
      alvo: "capitulo:1",
      pacote: pacote("capitulo:1", "escritor"),
      tarefa: "escreva",
      parse: (t) => t,
      gravador,
      provedor,
      mapa: MAPA,
    });
    await executarPapel<string>({
      papel: "revisor_literario",
      alvo: "capitulo:1",
      pacote: pacote("capitulo:1", "revisor_literario"),
      tarefa: "revise",
      parse: (t) => t,
      gravador,
      provedor,
      mapa: MAPA,
    });

    const runs = await disco.lerRuns();
    const concluidos = runs.filter((r) => r.status === "ok");
    expect(concluidos.length).toBe(2);
    // A instrumentação está no MOLDE: nenhum call-site precisou passar tokens.
    expect(concluidos.every((r) => typeof r.tokens_in === "number" && typeof r.tokens_out === "number")).toBe(true);

    const custo = agregarCusto(
      runs.map((r) => ({
        papel: String(r.papel),
        alvo: String(r.alvo),
        status: String(r.status),
        model_name: String(r.model_name ?? ""),
        tokens_in: r.tokens_in ?? undefined,
        tokens_out: r.tokens_out ?? undefined,
      }))
    );

    expect(custo.por_papel.escritor.total).toBe(2000);
    expect(custo.por_papel.revisor_literario.total).toBe(550);
    expect(custo.por_capitulo["1"].total).toBe(2550);
    expect(custo.por_modelo["claude-opus-5"].total).toBe(2000);
    expect(custo.capitulos_medidos).toBe(1);
    expect(custo.media_por_capitulo.total).toBe(2550);
  });
});
