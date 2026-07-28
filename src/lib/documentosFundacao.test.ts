// D7 — a tela do projeto oferece os documentos que EXISTEM.
import { describe, expect, it } from "vitest";
import {
  chaveStorageDocumento,
  documentosDoContrato,
  documentosParaExibir,
  DOCUMENTOS_LEGADO,
} from "./documentosFundacao";

describe("lista de documentos da fundação na interface", () => {
  it("sem índice (livro V1) cai na lista legada, que a V1 de fato escreve", () => {
    expect(documentosParaExibir(undefined)).toEqual(DOCUMENTOS_LEGADO);
    expect(documentosParaExibir({})).toEqual(DOCUMENTOS_LEGADO);
    expect(documentosParaExibir({ documentos: [] })).toEqual(DOCUMENTOS_LEGADO);
  });

  it("com índice do worker V2, usa os caminhos REAIS (o bug: nomes da V1 em livro V2)", () => {
    const docs = documentosParaExibir({
      documentos: [
        { titulo: "Bíblia da obra", caminho: "fundacao/biblia-da-obra.md", origem: "nucleo" },
        { titulo: "Estrutura do livro", caminho: "estrutura.json", origem: "nucleo" },
        { titulo: "dossie factual", caminho: "fundacao/dossie-factual.md", origem: "contrato" },
      ],
    });
    expect(docs.map((d) => d.caminho)).toEqual([
      "fundacao/biblia-da-obra.md",
      "estrutura.json",
      "fundacao/dossie-factual.md",
    ]);
    // Nenhum nome da V1 sobrou.
    expect(docs.some((d) => d.caminho.includes("Biblia-da-Obra"))).toBe(false);
  });

  it("documentos exigidos pelo contrato aparecem e são identificáveis", () => {
    const docs = documentosParaExibir({
      documentos: [
        { titulo: "Bíblia", caminho: "fundacao/biblia-da-obra.md", origem: "nucleo" },
        { titulo: "matriz de relogios", caminho: "fundacao/matriz-de-relogios.md", origem: "contrato" },
      ],
    });
    expect(documentosDoContrato(docs).map((d) => d.caminho)).toEqual(["fundacao/matriz-de-relogios.md"]);
  });

  it("entrada malformada é descartada — a tela nunca oferece botão que não abre", () => {
    const docs = documentosParaExibir({
      documentos: [
        { titulo: "ok", caminho: "estrutura.json", origem: "nucleo" },
        { titulo: "sem caminho" },
        { caminho: "   " },
        null,
      ],
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].caminho).toBe("estrutura.json");
  });

  it("índice só com lixo cai no legado em vez de mostrar lista vazia", () => {
    expect(documentosParaExibir({ documentos: [{ titulo: "x" }] })).toEqual(DOCUMENTOS_LEGADO);
  });

  it("sem título, o caminho vira o rótulo (nunca um botão sem nome)", () => {
    const docs = documentosParaExibir({ documentos: [{ caminho: "fundacao/x.md", origem: "contrato" }] });
    expect(docs[0].titulo).toBe("fundacao/x.md");
  });

  it("a chave do Storage é a mesma que o worker usa ao subir", () => {
    expect(chaveStorageDocumento("dono", "proj", "fundacao/biblia-da-obra.md")).toBe(
      "dono/proj/fundacao/biblia-da-obra.md"
    );
  });
});
