import { describe, expect, it } from "vitest";
import { ETAPAS_CRIACAO, planoAposCriacao } from "./fluxoNovoProjeto";

describe("ordem fail-closed de um projeto novo", () => {
  it("começa pela entrevista, nunca por geração de prosa", () => {
    expect(planoAposCriacao()).toEqual({
      fase: "entrevista",
      primeiroJob: "entrevistar",
    });
  });

  it("a trilha visível põe revisão e fundação antes de qualquer prova literária", () => {
    expect(ETAPAS_CRIACAO.map((etapa) => etapa.id)).toEqual([
      "ideia",
      "entrevista",
      "fundacao",
    ]);
    expect(ETAPAS_CRIACAO.map((etapa) => etapa.id)).not.toContain("canario");
  });
});
