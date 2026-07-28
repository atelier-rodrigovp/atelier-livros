// "Saída incompleta de papel não pode virar aprovação" — POR PAPEL, não em geral.
//
// A auditoria anterior verificou que existe validação; não verificou que ela
// cobre cada papel. Um único papel sem guarda basta: o modelo devolve JSON
// truncado, o campo que faltava é justamente o que decidiria, e a ausência
// silenciosa é lida como "nada a apontar" — que é indistinguível de aprovação.
//
// Cada bloco aqui é um papel do pipeline e a sua porta de entrada real.

import { describe, expect, it } from "vitest";
import { validarParecerConformidade } from "./conformidade.js";
import { validarParecerIdioma } from "./idioma.js";
import { validarExtracaoProsa } from "./memoria-prosa.js";
import { parseProsa, validarSaidaAuditor, validarSaidaContextualizador } from "./pipeline.js";
import { validarParecer } from "./revisor.js";

const eixo = { nota: 4, evidencia: "o alçapão que cede muda o rumo da cena" };
const parecerOk = {
  schema: "parecer/v1",
  dramatic_progression: eixo,
  skill_adherence: eixo,
  clarity: eixo,
  emotional_effect: eixo,
  continuity: eixo,
  hook_effectiveness: eixo,
  verdict: "aprovado",
  evidencias: [{ local: "L:4", trecho: "passos no cais", observacao: "gancho" }],
  sinais: [],
  correcoes: [],
};

describe("escritor", () => {
  it("prosa vazia não passa", () => {
    expect(() => parseProsa("   \n  ")).toThrow(/vazia/);
  });

  it("prosa com conteúdo passa e vem aparada", () => {
    expect(parseProsa("  texto do capítulo  ")).toBe("texto do capítulo");
  });
});

describe("contextualizador", () => {
  it("saída que não é objeto não passa", () => {
    expect(() => validarSaidaContextualizador(null)).toThrow();
    expect(() => validarSaidaContextualizador("texto solto")).toThrow();
  });

  it("saída bem formada passa", () => {
    expect(validarSaidaContextualizador({ fatos: [], continuidade: [], repeticoes_recentes: [] })).toBeTruthy();
  });
});

describe("auditor factual", () => {
  const ok = { contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } };

  it("saída sem `pov_violado` não passa — o campo é decisório", () => {
    const { pov_violado, ...semPov } = ok;
    void pov_violado;
    expect(() => validarSaidaAuditor(semPov)).toThrow();
  });

  it("saída não-objeto não passa", () => {
    expect(() => validarSaidaAuditor(null)).toThrow();
  });

  it("saída completa passa", () => {
    expect(validarSaidaAuditor(ok)).toBeTruthy();
  });
});

describe("revisor literário", () => {
  it("parecer sem um dos seis eixos não passa", () => {
    for (const eixoFaltante of [
      "dramatic_progression",
      "skill_adherence",
      "clarity",
      "emotional_effect",
      "continuity",
      "hook_effectiveness",
    ]) {
      const p = { ...parecerOk } as Record<string, unknown>;
      delete p[eixoFaltante];
      expect(() => validarParecer(p), `faltando ${eixoFaltante}`).toThrow();
    }
  });

  it("parecer sem veredito não passa", () => {
    const p = { ...parecerOk } as Record<string, unknown>;
    delete p.verdict;
    expect(() => validarParecer(p)).toThrow();
  });

  it("parecer completo passa", () => {
    expect(validarParecer(parecerOk)).toBeTruthy();
  });
});

describe("conformidade ficha → prosa", () => {
  it("saída vazia não passa", () => {
    expect(() => validarParecerConformidade(null)).toThrow();
    expect(() => validarParecerConformidade({})).toThrow();
  });

  it("afirmação sem campo obrigatório não passa", () => {
    expect(() => validarParecerConformidade({ afirmacoes: [{ item: "virada" }] })).toThrow();
  });
});

describe("julgamento de idioma", () => {
  it("saída sem `narracao_conforme` não passa", () => {
    expect(() => validarParecerIdioma({ trechos_divergentes: [] })).toThrow();
  });

  it("saída vazia não passa", () => {
    expect(() => validarParecerIdioma(null)).toThrow();
  });
});

describe("extrator de memória", () => {
  it("entrada sem trecho não passa", () => {
    expect(() =>
      validarExtracaoProsa({ entradas: [{ tipo: "pista", enunciado: "algo", confianca: "alta", origem: "prosa" }] })
    ).toThrow();
  });

  it("tipo fora do vocabulário não passa", () => {
    expect(() =>
      validarExtracaoProsa({
        entradas: [{ tipo: "invencao", enunciado: "algo", trecho: "trecho literal aqui", confianca: "alta", origem: "prosa" }],
      })
    ).toThrow();
  });

  it("saída não-objeto não passa", () => {
    expect(() => validarExtracaoProsa(null)).toThrow();
  });
});

describe("cobertura: todo papel julgador tem porta de entrada validada", () => {
  it("os seis papéis que decidem passam por um validador exportado", () => {
    // Se um papel novo entrar no pipeline sem validador, este teste não quebra
    // sozinho — mas a lista aqui é o lugar onde a omissão fica visível na revisão.
    const validadores = [
      parseProsa,
      validarSaidaContextualizador,
      validarSaidaAuditor,
      validarParecer,
      validarParecerConformidade,
      validarParecerIdioma,
      validarExtracaoProsa,
    ];
    expect(validadores.every((f) => typeof f === "function")).toBe(true);
    expect(validadores).toHaveLength(7);
  });
});
