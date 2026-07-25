import { describe, expect, it } from "vitest";
import { podeAprovarReleaseLab } from "./laboratorioV2";

describe("podeAprovarReleaseLab", () => {
  it("exige aprovação automática e leitura humana persistida ≥80%", () => {
    expect(podeAprovarReleaseLab({ decisaoAutomatica: "aprovar", calibracaoPronta: true, resultadoHumano: { acertos: 8, total: 10 } })).toBe(true);
    expect(podeAprovarReleaseLab({ decisaoAutomatica: "rejeitar", calibracaoPronta: true, resultadoHumano: { acertos: 10, total: 10 } })).toBe(false);
    expect(podeAprovarReleaseLab({ decisaoAutomatica: "aprovar", calibracaoPronta: true, resultadoHumano: { acertos: 7, total: 10 } })).toBe(false);
    expect(podeAprovarReleaseLab({ decisaoAutomatica: "aprovar", calibracaoPronta: true, resultadoHumano: null })).toBe(false);
  });

  it("rejeita relatório legado ou corpus ainda não calibrado", () => {
    expect(podeAprovarReleaseLab({
      decisaoAutomatica: "aprovar",
      resultadoHumano: { acertos: 10, total: 10 },
    })).toBe(false);
    expect(podeAprovarReleaseLab({
      decisaoAutomatica: "aprovar",
      calibracaoPronta: false,
      resultadoHumano: { acertos: 10, total: 10 },
    })).toBe(false);
  });
});
