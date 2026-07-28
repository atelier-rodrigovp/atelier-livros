// Fatia J — gate de idioma e variante.
import { describe, expect, it } from "vitest";
import {
  decidirIdioma,
  medirIdioma,
  medirVariante,
  mesmaVariante,
  resumoIdioma,
  validarParecerIdioma,
  type ParecerIdioma,
} from "./idioma.js";

// Amostra dan-brown em pt-PT (a fixture obrigatória do prompt).
const DAN_BROWN_PT_PT = [
  "## Capítulo 3",
  "",
  "Marina estava a olhar para o ecrã do telemóvel quando o comboio parou.",
  "Saiu para a casa de banho da estação e viu o autocarro a partir sem ela.",
  "A rapariga do balcão disse que o pequeno-almoço já tinha acabado.",
].join("\n");

const DAN_BROWN_PT_BR = [
  "## Capítulo 3",
  "",
  "Marina estava olhando para a tela do celular quando o trem parou.",
  "Saiu para o banheiro da estação e viu o ônibus partir sem ela.",
  "A moça do balcão disse que o café da manhã já tinha acabado.",
].join("\n");

// Hoover: narradora em primeira pessoa, pt-BR correto.
const HOOVER_PT_BR = [
  "## Capítulo 7",
  "",
  "Eu guardei o celular no bolso e fui até a geladeira sem acender a luz.",
  "O café da manhã dele continuava intacto na bancada, como se ninguém tivesse passado por ali.",
].join("\n");

// Romantasy: pt-BR correto, registro alto.
const ROMANTASY_PT_BR = [
  "## Capítulo 2",
  "",
  "A corte inteira estava olhando quando ela cruzou o salão de sal e vidro.",
  "Nenhum deles sabia que o sobrenome dela valia mais do que a coroa.",
].join("\n");

// Diálogo INTENCIONAL em pt-PT dentro de um livro pt-BR.
const DIALOGO_INTENCIONAL = [
  "## Capítulo 5",
  "",
  "Marina guardou o celular e olhou para o homem de Lisboa.",
  "— Estás a ver aquele comboio? — perguntou ele, apontando para a estação.",
  "Ela respondeu que sim e seguiu andando até o ônibus.",
].join("\n");

describe("comparação de variantes", () => {
  it("pt-BR e pt-PT são variantes distintas", () => {
    expect(mesmaVariante("pt-BR", "pt-PT")).toBe(false);
  });
  it("a base casa com a variante declarada", () => {
    expect(mesmaVariante("pt-BR", "pt-BR")).toBe(true);
    expect(mesmaVariante("pt", "pt")).toBe(true);
  });
});

describe("detector separa narração de diálogo", () => {
  it("marca de pt-PT na NARRAÇÃO é registrada como narração", () => {
    const s = medirIdioma(DAN_BROWN_PT_PT, "pt-BR");
    expect(s.divergentesNarracao.length).toBeGreaterThan(0);
    expect(s.divergentesDialogo).toEqual([]);
  });

  it("marca de pt-PT em DIÁLOGO é registrada como diálogo", () => {
    const s = medirIdioma(DIALOGO_INTENCIONAL, "pt-BR");
    expect(s.divergentesDialogo.length).toBeGreaterThan(0);
    expect(s.divergentesNarracao).toEqual([]);
  });

  it("título de capítulo não conta", () => {
    expect(medirVariante("## Capítulo 3").length).toBe(0);
  });

  it("o resumo cita os trechos para quem julga", () => {
    const r = resumoIdioma(medirIdioma(DAN_BROWN_PT_PT, "pt-BR"));
    expect(r).toContain("NARRAÇÃO");
    expect(r).toContain("telemóvel");
  });
});

describe("fixtures obrigatórias", () => {
  it("amostra dan-brown em pt-PT REPROVA num projeto pt-BR", () => {
    const sinal = medirIdioma(DAN_BROWN_PT_PT, "pt-BR");
    const parecer: ParecerIdioma = {
      schema: "parecer-idioma/v1",
      narracao_conforme: false,
      intencionais: [],
      injustificadas: [
        { trecho: "estava a olhar para o ecrã do telemóvel", detalhe: "construção e léxico de pt-PT na narração" },
      ],
    };
    const v = decidirIdioma(sinal, parecer);
    expect(v.passou).toBe(false);
    expect(v).toMatchObject({ evidencia: expect.stringContaining("telemóvel") });
  });

  it("amostra dan-brown em pt-BR PASSA", () => {
    const sinal = medirIdioma(DAN_BROWN_PT_BR, "pt-BR");
    expect(sinal.divergentesNarracao).toEqual([]);
    const v = decidirIdioma(sinal, {
      schema: "parecer-idioma/v1",
      narracao_conforme: true,
      intencionais: [],
      injustificadas: [],
    });
    expect(v.passou).toBe(true);
  });

  it("amostra hoover correta PASSA", () => {
    const sinal = medirIdioma(HOOVER_PT_BR, "pt-BR");
    expect(sinal.divergentesNarracao).toEqual([]);
    expect(decidirIdioma(sinal, { schema: "parecer-idioma/v1", narracao_conforme: true, intencionais: [], injustificadas: [] }).passou).toBe(true);
  });

  it("amostra romantasy correta PASSA", () => {
    const sinal = medirIdioma(ROMANTASY_PT_BR, "pt-BR");
    expect(sinal.divergentesNarracao).toEqual([]);
    expect(decidirIdioma(sinal, { schema: "parecer-idioma/v1", narracao_conforme: true, intencionais: [], injustificadas: [] }).passou).toBe(true);
  });

  it("DIÁLOGO INTENCIONAL em outra variante NÃO reprova sozinho", () => {
    const sinal = medirIdioma(DIALOGO_INTENCIONAL, "pt-BR");
    const parecer: ParecerIdioma = {
      schema: "parecer-idioma/v1",
      narracao_conforme: true,
      intencionais: [{ trecho: "— Estás a ver aquele comboio?", motivo: "personagem português; a fala é caracterização" }],
      injustificadas: [],
    };
    const v = decidirIdioma(sinal, parecer);
    expect(v.passou).toBe(true);
    expect(v).toMatchObject({ observacao: expect.stringContaining("intencionais") });
  });
});

describe("o detector é SINAL, nunca juiz único", () => {
  it("divergência na narração SEM julgamento que a condene não reprova", () => {
    const sinal = medirIdioma(DAN_BROWN_PT_PT, "pt-BR");
    expect(sinal.divergentesNarracao.length).toBeGreaterThan(0);
    const v = decidirIdioma(sinal, {
      schema: "parecer-idioma/v1",
      narracao_conforme: true, // o julgamento viu contexto que o detector não vê
      intencionais: [{ trecho: "ecrã", motivo: "citação de documento português reproduzido no capítulo" }],
      injustificadas: [],
    });
    expect(v.passou).toBe(true);
  });

  it("julgamento que acusa SEM trecho não reprova por essa via (mas a narração fora do alvo reprova)", () => {
    const sinal = medirIdioma(DAN_BROWN_PT_BR, "pt-BR");
    const v = decidirIdioma(sinal, {
      schema: "parecer-idioma/v1",
      narracao_conforme: true,
      intencionais: [],
      injustificadas: [{ trecho: "", detalhe: "achei estranho" }],
    });
    expect(v.passou).toBe(true);
  });

  it("narração declarada fora do alvo reprova citando o que o detector viu", () => {
    const sinal = medirIdioma(DAN_BROWN_PT_PT, "pt-BR");
    const v = decidirIdioma(sinal, {
      schema: "parecer-idioma/v1",
      narracao_conforme: false,
      intencionais: [],
      injustificadas: [],
    });
    expect(v.passou).toBe(false);
    expect(v).toMatchObject({ evidencia: expect.stringContaining("pt-PT") });
  });
});

describe("validação do parecer de idioma", () => {
  it("aceita parecer bem formado", () => {
    const p = validarParecerIdioma({ narracao_conforme: true, intencionais: [], injustificadas: [] });
    expect(p.schema).toBe("parecer-idioma/v1");
  });
  it("rejeita narracao_conforme ausente", () => {
    expect(() => validarParecerIdioma({ intencionais: [] })).toThrow(/narracao_conforme/);
  });
  it("rejeita item sem trecho", () => {
    expect(() => validarParecerIdioma({ narracao_conforme: false, injustificadas: [{ detalhe: "x" }] })).toThrow(/trecho/);
  });
  it("listas ausentes viram vazias", () => {
    expect(validarParecerIdioma({ narracao_conforme: true }).intencionais).toEqual([]);
  });
});
