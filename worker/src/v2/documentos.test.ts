// D7 — documentos da fundação: uma lista canônica alimenta disco, Storage,
// hashes do estado e a lista que a interface abre.
import { describe, expect, it } from "vitest";
import {
  chaveStorage,
  docsExigidosFaltando,
  documentosDaFundacao,
  hashesDosDocumentos,
  indiceDeDocumentos,
  nomeSeguroDeDoc,
} from "./documentos.js";
import type { FundacaoV2 } from "./fundacao.js";

function fundacao(over: Partial<FundacaoV2> = {}): FundacaoV2 {
  return {
    perfil_voz: "Voz seca, frase curta, sem ornamento. ".repeat(4),
    biblia: "Marina cuida do farol. Helena comanda o TPEA. Cânone e linha do tempo definidos. ".repeat(4),
    mapa_personagens: [
      { nome: "Marina", papel: "protagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "a" },
    ],
    estrutura: [{ capitulo: 1, fio: "investigacao", resumo_estrutural: "Marina encontra a gravura" }],
    fios: ["investigacao"],
    promessa_editorial: "um thriller de enigma marítimo",
    ...over,
  };
}

describe("lista canônica de documentos", () => {
  it("os quatro documentos de núcleo sempre existem", () => {
    const caminhos = documentosDaFundacao(fundacao()).map((d) => d.caminho);
    expect(caminhos).toEqual([
      "perfil-de-voz.md",
      "fundacao/biblia-da-obra.md",
      "fundacao/mapa-personagens.json",
      "estrutura.json",
    ]);
  });

  it("documentos exigidos pelo contrato entram na MESMA lista", () => {
    const docs = documentosDaFundacao(
      fundacao({ docs_exigidos: { "dossie-factual.md": "fatos", "matriz-de-relogios.md": "relógios" } })
    );
    const doContrato = docs.filter((d) => d.origem === "contrato").map((d) => d.caminho);
    expect(doContrato).toEqual(["fundacao/dossie-factual.md", "fundacao/matriz-de-relogios.md"]);
  });

  it("o mapa de personagens mantém o formato {personagens: [...]} dos livros em produção", () => {
    const mapa = documentosDaFundacao(fundacao()).find((d) => d.caminho.endsWith("mapa-personagens.json"))!;
    expect(JSON.parse(mapa.conteudo)).toHaveProperty("personagens");
  });

  it("estrutura.json carrega estrutura, fios, promessa e (quando existe) o arco", () => {
    const semArco = JSON.parse(documentosDaFundacao(fundacao()).find((d) => d.caminho === "estrutura.json")!.conteudo);
    expect(semArco).toMatchObject({ fios: ["investigacao"], promessa: "um thriller de enigma marítimo" });
    expect(semArco.arco).toBeUndefined();
  });
});

describe("nome de documento vindo do modelo é sanitizado", () => {
  it("aceita basename simples", () => {
    expect(nomeSeguroDeDoc("dossie-factual.md")).toBe("dossie-factual.md");
  });
  it("rejeita path traversal e ocultos", () => {
    expect(nomeSeguroDeDoc("../../etc/passwd")).toBeNull();
    expect(nomeSeguroDeDoc(".env")).toBeNull();
    expect(nomeSeguroDeDoc("")).toBeNull();
    expect(nomeSeguroDeDoc("   ")).toBeNull();
  });
  it("documento com path traversal não entra na lista canônica", () => {
    const docs = documentosDaFundacao(fundacao({ docs_exigidos: { "../fora.md": "x" } }));
    expect(docs.some((d) => d.caminho.includes(".."))).toBe(false);
  });
});

describe("hashes e índice", () => {
  it("os hashes cobrem TODOS os documentos, inclusive os do contrato", () => {
    const docs = documentosDaFundacao(fundacao({ docs_exigidos: { "dossie-factual.md": "fatos secos do livro" } }));
    const hashes = hashesDosDocumentos(docs);
    expect(Object.keys(hashes)).toContain("fundacao/dossie-factual.md");
    expect(Object.keys(hashes)).toHaveLength(docs.length);
  });

  it("mudar o conteúdo de um documento muda o hash (detecção de substituição)", () => {
    const a = hashesDosDocumentos(documentosDaFundacao(fundacao()));
    const b = hashesDosDocumentos(documentosDaFundacao(fundacao({ biblia: "outra bíblia bem diferente. ".repeat(12) })));
    expect(a["fundacao/biblia-da-obra.md"]).not.toBe(b["fundacao/biblia-da-obra.md"]);
    expect(a["perfil-de-voz.md"]).toBe(b["perfil-de-voz.md"]);
  });

  it("o índice traz título, caminho, origem e hash de cada documento", () => {
    const docs = documentosDaFundacao(fundacao({ docs_exigidos: { "dossie-factual.md": "fatos" } }));
    const idx = indiceDeDocumentos(docs, "2026-07-28T00:00:00.000Z");
    expect(idx.documentos).toHaveLength(docs.length);
    for (const d of idx.documentos) {
      expect(d.titulo).toBeTruthy();
      expect(d.caminho).toBeTruthy();
      expect(d.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("chave do Storage bate com a que a interface pede", () => {
  it("é <owner>/<projeto>/<caminho relativo>", () => {
    expect(chaveStorage("dono", "proj", "fundacao/biblia-da-obra.md")).toBe("dono/proj/fundacao/biblia-da-obra.md");
    expect(chaveStorage("dono", "proj", "estrutura.json")).toBe("dono/proj/estrutura.json");
  });
});

describe("documento exigido e não produzido não é engolido", () => {
  it("aponta o que falta", () => {
    expect(docsExigidosFaltando(fundacao(), ["dossie-factual.md"])).toEqual(["dossie-factual.md"]);
  });
  it("nada falta quando o contrato foi cumprido", () => {
    const f = fundacao({ docs_exigidos: { "dossie-factual.md": "fatos" } });
    expect(docsExigidosFaltando(f, ["dossie-factual.md"])).toEqual([]);
  });
});
