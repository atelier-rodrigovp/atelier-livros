import { describe, expect, it } from "vitest";
import { montarEvidenciaHumanaRelease, podeAprovarReleaseLab } from "./laboratorioV2";

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

  it("monta evidência humana hash-bound e rejeita amostra incompleta", () => {
    const base = {
      jobId: "job-1",
      execucaoId: "lab-1",
      humana: {
        por: "autor",
        em: "2026-07-25T12:00:00.000Z",
        palpites: { "A-01-abc": "dan-brown", "A-02-def": "romantasy" },
      },
      amostras: [
        { amostraId: "A-01-abc", hash: "hash-1" },
        { amostraId: "A-02-def", hash: "hash-2" },
      ],
      gabaritoPorHash: { "hash-1": "dan-brown", "hash-2": "romantasy" },
    };
    expect(montarEvidenciaHumanaRelease(base)).toMatchObject({
      schema: "human-blind-evaluation/v1",
      lab_execucao_id: "lab-1",
      gabarito: { "A-01-abc": "dan-brown", "A-02-def": "romantasy" },
    });
    expect(() => montarEvidenciaHumanaRelease({
      ...base,
      humana: { ...base.humana, palpites: { "A-01-abc": "dan-brown" } },
    })).toThrow(/não cobre todas/);
  });
});
