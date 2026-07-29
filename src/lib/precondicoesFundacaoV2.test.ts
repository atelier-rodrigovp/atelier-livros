import { describe, expect, it } from "vitest";
import { avaliarPrecondicoesFundacao } from "./precondicoesFundacaoV2";

describe("portões da fundação na interface", () => {
  it("[DOD:O-03] V2 só habilita a fundação quando os quatro portões estão verdes", () => {
    const base = {
      engineMode: "v2",
      entrevistaCompleta: true,
      briefingAprovadoAtual: true,
      projetoAutorizado: true,
      releaseCertificado: true,
    };
    expect(avaliarPrecondicoesFundacao(base)).toEqual({ podeGerar: true, pendencias: [] });

    for (const campo of [
      "entrevistaCompleta",
      "briefingAprovadoAtual",
      "projetoAutorizado",
      "releaseCertificado",
    ] as const) {
      const resultado = avaliarPrecondicoesFundacao({ ...base, [campo]: false });
      expect(resultado.podeGerar, campo).toBe(false);
      expect(resultado.pendencias, campo).toHaveLength(1);
    }
  });

  it("não altera o encadeamento legado da V1", () => {
    expect(avaliarPrecondicoesFundacao({
      engineMode: "v1",
      entrevistaCompleta: false,
      briefingAprovadoAtual: false,
      projetoAutorizado: false,
      releaseCertificado: false,
    })).toEqual({ podeGerar: true, pendencias: [] });
  });
});
