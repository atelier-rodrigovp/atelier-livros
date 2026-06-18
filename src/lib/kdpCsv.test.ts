import { describe, expect, it } from "vitest";
import { normalizaData, parseKdpCsv } from "./kdpCsv";

describe("parseKdpCsv", () => {
  it("parseia CSV com vírgula e cabeçalhos KDP em inglês", () => {
    const csv = [
      "Royalty Date,Title,Marketplace,Net Units Sold,Royalty,Currency",
      "2026-05-01,O Farol,Amazon.com,12,30.50,USD",
      "2026-05-02,O Farol,Amazon.com.br,3,9.90,BRL",
    ].join("\n");
    const rows = parseKdpCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ marketplace: "Amazon.com", unidades: 12, royalty: 30.5, moeda: "USD" });
    expect(rows[1].royalty).toBe(9.9);
  });

  it("suporta separador ponto-e-vírgula e decimal com vírgula (pt-BR)", () => {
    const csv = [
      "Data;Marketplace;Unidades;Royalty;Moeda",
      "01/05/2026;Amazon.com.br;5;12,34;BRL",
    ].join("\n");
    const rows = parseKdpCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].unidades).toBe(5);
    expect(rows[0].royalty).toBe(12.34);
  });

  it("ignora linhas sem unidades nem royalty", () => {
    const csv = "Date,Marketplace,Units,Royalty\n2026-01-01,X,,\n2026-01-02,Y,1,2.0";
    expect(parseKdpCsv(csv)).toHaveLength(1);
  });

  it("respeita aspas com separador interno", () => {
    const csv = 'Title,Marketplace,Units,Royalty\n"Farol, O",Amazon.com,2,4.00';
    const rows = parseKdpCsv(csv);
    expect(rows[0].titulo).toBe("Farol, O");
    expect(rows[0].unidades).toBe(2);
  });
});

describe("normalizaData", () => {
  it("normaliza ISO e BR para YYYY-MM-DD", () => {
    expect(normalizaData("2026-05-01")).toBe("2026-05-01");
    expect(normalizaData("01/05/2026")).toBe("2026-05-01");
    expect(normalizaData("lixo")).toBeNull();
  });
});
