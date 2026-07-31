import { describe, expect, it } from "vitest";
import {
  avaliarPrecondicoesEscrita,
  avaliarPrecondicoesFundacao,
  proximaAcaoAntesDaEscrita,
} from "./precondicoesFundacaoV2";

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

describe("portões da escrita na interface", () => {
  it("[DOD:O-03] não deixa a exceção pré-canário vazar para a prosa", () => {
    const base = {
      engineMode: "v2",
      fundacaoConcluida: true,
      projetoAutorizado: true,
      releaseCertificado: true,
    };
    expect(avaliarPrecondicoesEscrita(base)).toEqual({ podeEscrever: true, pendencias: [] });

    for (const campo of ["fundacaoConcluida", "projetoAutorizado", "releaseCertificado"] as const) {
      const resultado = avaliarPrecondicoesEscrita({ ...base, [campo]: false });
      expect(resultado.podeEscrever, campo).toBe(false);
      expect(resultado.pendencias, campo).toHaveLength(1);
    }
  });

  it("explica cumulativamente tudo que falta antes da primeira linha de prosa", () => {
    expect(avaliarPrecondicoesEscrita({
      engineMode: "v2",
      fundacaoConcluida: false,
      projetoAutorizado: false,
      releaseCertificado: false,
    })).toEqual({
      podeEscrever: false,
      pendencias: [
        "concluir a fundação",
        "autorizar este projeto",
        "obter o certificado final de release",
      ],
    });
  });

  it("não muda o fluxo legado da V1", () => {
    expect(avaliarPrecondicoesEscrita({
      engineMode: "v1",
      fundacaoConcluida: false,
      projetoAutorizado: false,
      releaseCertificado: false,
    })).toEqual({ podeEscrever: true, pendencias: [] });
  });

  it("a próxima ação não contradiz um botão de escrita bloqueado", () => {
    expect(proximaAcaoAntesDaEscrita([
      "concluir a fundação",
      "obter o certificado final de release",
    ])).toBe("Resolver antes da escrita: concluir a fundação");
    expect(proximaAcaoAntesDaEscrita([])).toBeNull();
  });
});
