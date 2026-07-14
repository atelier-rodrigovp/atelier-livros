import { describe, it, expect } from "vitest";
import { classificarBlocker, degrau1Deterministico, medirEscada, DEGRAU_MINIMO } from "./escada-correcao.js";
import type { BlockerLite } from "./escada-correcao.js";

// Recontagem de "coisa" (mesmo detector do gate, simplificado para teste).
const recontarCoisa = (t: string): BlockerLite[] => {
  const n = (t.match(/\bcoisas?\b/gi) ?? []).length;
  return n > 1 ? [{ code: "MULETA_COISA", message: `coisa ${n}x` }] : [];
};

describe("escada de correção (S9/1.6)", () => {
  it("classifica: meta/espaço = mecânico seguro; muleta = lexical; cadência = narrativo", () => {
    expect(classificarBlocker("META_TEXTO residual")).toBe("mecanico_seguro");
    expect(classificarBlocker("espaçamento duplo")).toBe("mecanico_seguro");
    expect(classificarBlocker("muleta coisa/coisas 2x")).toBe("lexical_prosa");
    expect(classificarBlocker("MULETA_COISA")).toBe("lexical_prosa");
    expect(classificarBlocker("cadencia anafora frases coladas")).toBe("narrativo");
  });

  it("degrau 1 remove meta-texto e normaliza espaço, SEM tocar palavras da prosa", () => {
    const entrada = "# Cap\n\n\n\nEle  correu   até   a porta.   \n<!-- nota interna -->\nFim.";
    const { texto, mudancas } = degrau1Deterministico(entrada);
    expect(texto).not.toContain("<!-- nota interna -->");
    expect(texto).not.toMatch(/ {2,}/); // sem runs de espaço
    expect(texto).not.toMatch(/\n{3,}/); // sem 3+ quebras
    expect(texto).toContain("Ele correu até a porta."); // prosa preservada (só espaçamento)
    expect(mudancas.length).toBeGreaterThan(0);
  });

  it("muleta lexical em prosa: degrau 1 resolve 0 → próximo degrau = 2 (editor focado)", () => {
    const texto = "Ele viu uma coisa. Depois outra coisa apareceu.";
    const rel = medirEscada(texto, [{ code: "MULETA_COISA", message: "coisa 2x" }], recontarCoisa);
    expect(rel.categorias.lexical_prosa).toBe(1);
    expect(rel.degrau1.resolvidos).toBe(0); // determinístico não mexe em prosa
    expect(rel.degrau1.blockersDepois).toBe(1);
    expect(rel.proximoDegrau).toBe(2);
    expect(DEGRAU_MINIMO.lexical_prosa).toBe(2);
    expect(rel.recomendacao).toMatch(/degrau 2/);
  });

  it("blocker mecânico: degrau 1 resolve e a escada fica limpa (custo zero de LLM)", () => {
    // recount que só reclama de espaço duplo — degrau 1 normaliza e some.
    const recontarEspaco = (t: string): BlockerLite[] => (/ {2,}/.test(t) ? [{ code: "ESPACO_DUPLO" }] : []);
    const rel = medirEscada("Ele  correu.", [{ code: "ESPACO_DUPLO", message: "espaçamento" }], recontarEspaco);
    expect(rel.degrau1.resolvidos).toBe(1);
    expect(rel.proximoDegrau).toBeNull();
    expect(rel.recomendacao).toMatch(/resolveu tudo/);
  });
});
