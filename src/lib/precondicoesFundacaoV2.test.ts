import { describe, expect, it } from "vitest";
import { avaliarPrecondicoesFundacao } from "./precondicoesFundacaoV2";

describe("portões da fundação na interface", () => {
  it("[DOD:O-03] V2 exige entrevista, aprovação e autorização", () => {
    const base = {
      engineMode: "v2",
      entrevistaCompleta: true,
      briefingAprovadoAtual: true,
      projetoAutorizado: true,
      releaseCertificado: true,
    };
    expect(avaliarPrecondicoesFundacao(base)).toEqual({
      podeGerar: true,
      pendencias: [],
      modo: "release_certificada",
    });

    for (const campo of [
      "entrevistaCompleta",
      "briefingAprovadoAtual",
      "projetoAutorizado",
    ] as const) {
      const resultado = avaliarPrecondicoesFundacao({ ...base, [campo]: false });
      expect(resultado.podeGerar, campo).toBe(false);
      expect(resultado.pendencias, campo).toHaveLength(1);
    }
  });

  it("certificado ausente permite só a fundação pré-canário, não finge release", () => {
    expect(avaliarPrecondicoesFundacao({
      engineMode: "v2",
      entrevistaCompleta: true,
      briefingAprovadoAtual: true,
      projetoAutorizado: true,
      releaseCertificado: false,
    })).toEqual({
      podeGerar: true,
      pendencias: [],
      modo: "pre_canario",
    });
  });

  it("não altera o encadeamento legado da V1", () => {
    expect(avaliarPrecondicoesFundacao({
      engineMode: "v1",
      entrevistaCompleta: false,
      briefingAprovadoAtual: false,
      projetoAutorizado: false,
      releaseCertificado: false,
    })).toEqual({ podeGerar: true, pendencias: [], modo: "release_certificada" });
  });
});
