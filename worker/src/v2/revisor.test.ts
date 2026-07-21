// Regra auditável dos sinais de contagem (adendo 2): violacao_confirmada exige as
// ocorrências citadas uma a uma; disposição parcial exige a conta fechada. A regra
// vive em validarParecer (parse → retry técnico do revisor), verificável por código.
import { describe, expect, it } from "vitest";
import { validarParecer } from "./revisor.js";
import type { Parecer } from "./tipos.js";

function base(sinais: unknown[]): unknown {
  const eixo = { nota: 4, evidencia: "evidência" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "reprovado",
    evidencias: [],
    sinais,
    correcoes: [{ local: "L:1", problema: "p", instrucao: "i" }],
  };
}

describe("validarParecer — auditabilidade dos sinais de contagem", () => {
  it("violacao_confirmada SEM ocorrencias_citadas é rejeitada (o número nunca confirma sozinho)", () => {
    expect(() =>
      validarParecer(base([{ sinal: "sanfona", valor: 9, disposicao: "violacao_confirmada", evidencia: "e" }]))
    ).toThrow(/ocorrencias_citadas/);
  });

  it("disposição parcial com conta ABERTA é rejeitada (citadas + falsos_positivos ≠ valor)", () => {
    expect(() =>
      validarParecer(
        base([
          {
            sinal: "sanfona",
            valor: 9,
            disposicao: "violacao_confirmada",
            evidencia: "e",
            ocorrencias_citadas: [{ trecho: "trecho real" }],
            falsos_positivos: 3, // 1 + 3 ≠ 9
          },
        ])
      )
    ).toThrow(/falsos_positivos/);
  });

  it("citação sem trecho literal é rejeitada", () => {
    expect(() =>
      validarParecer(
        base([
          {
            sinal: "gnomico",
            valor: 1,
            disposicao: "violacao_confirmada",
            evidencia: "e",
            ocorrencias_citadas: [{ trecho: "  " }],
          },
        ])
      )
    ).toThrow(/trecho/);
  });

  it("disposição completa (todas citadas) e parcial com conta fechada passam", () => {
    const completa = validarParecer(
      base([
        {
          sinal: "gnomico",
          valor: 2,
          disposicao: "violacao_confirmada",
          evidencia: "e",
          ocorrencias_citadas: [{ trecho: "máxima um" }, { trecho: "máxima dois", posicao: "L:40" }],
        },
      ])
    ) as Parecer;
    expect(completa.sinais[0].ocorrencias_citadas).toHaveLength(2);

    const parcial = validarParecer(
      base([
        {
          sinal: "sanfona",
          valor: 9,
          disposicao: "violacao_confirmada",
          evidencia: "e",
          ocorrencias_citadas: [{ trecho: "reformulação real" }],
          falsos_positivos: 8,
        },
      ])
    ) as Parecer;
    expect(parcial.sinais[0].falsos_positivos).toBe(8);
  });

  it("falso_positivo e excecao_valida não exigem citações", () => {
    expect(() =>
      validarParecer(base([{ sinal: "sanfona", valor: 13, disposicao: "falso_positivo", evidencia: "descrição concreta por acúmulo, não reformulação" }]))
    ).not.toThrow();
  });
});
