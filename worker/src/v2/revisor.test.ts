// Regra auditável dos sinais de contagem (adendo 2): violacao_confirmada exige as
// ocorrências citadas uma a uma; disposição parcial exige a conta fechada. A regra
// vive em validarParecer (parse → retry técnico do revisor), verificável por código.
import { describe, expect, it } from "vitest";
import { exigirDisposicaoCompleta, validarParecer } from "./revisor.js";
import type { SinalMedido } from "./sinais.js";
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

  // Caso real do canário romantasy: o revisor dispôs "palavras" 2263 como
  // violacao_confirmada e o parse exigiu "cite as ocorrências" — mas palavras é
  // um escalar (contagem total), não tem ocorrências. Isso queimava tentativas.
  it("sinal ESCALAR (palavras/percentual/run) como violacao_confirmada NÃO exige citações", () => {
    for (const sinal of ["palavras", "declarativas_pct", "dialogo_pct", "interioridade_run"]) {
      expect(() =>
        validarParecer(base([{ sinal, valor: 2263, disposicao: "violacao_confirmada", evidencia: "abaixo do piso / fora do perfil" }]))
      ).not.toThrow();
    }
  });

  it("detector de OCORRÊNCIA (incl. tique de cadência) mantém a exigência de citação", () => {
    expect(() =>
      validarParecer(base([{ sinal: "cadencia.staccato (frases curtas)", valor: 42, disposicao: "violacao_confirmada", evidencia: "e" }]))
    ).toThrow(/ocorrencias_citadas/);
  });
});

// Parecer incompleto = falha de PROTOCOLO do revisor → retry técnico no parse
// (caso real do canário hoover: 18 sinais dispostos, 1 fora da cota omitido
// reprovava o capítulo inteiro em vez de re-pedir o parecer).
describe("exigirDisposicaoCompleta — sinal fora da cota omitido aciona retry do revisor", () => {
  const medido = (sinal: string, valor: number, fora: boolean): SinalMedido =>
    ({ sinal, valor, fora_da_cota: fora } as SinalMedido);

  const parecerCom = (sinais: unknown[]): Parecer =>
    validarParecer(base(sinais)) as Parecer;

  it("lança nomeando o sinal omitido (mensagem vira instrução corretiva do retry)", () => {
    const p = parecerCom([{ sinal: "sanfona", valor: 7, disposicao: "falso_positivo", evidencia: "e" }]);
    expect(() =>
      exigirDisposicaoCompleta(p, [medido("sanfona", 7, true), medido("cadencia.fragmentos colados (≤4 palavras)", 10, true)])
    ).toThrow(/cadencia\.fragmentos colados .* \(valor 10\)/);
  });

  it("passa quando todo sinal fora da cota está disposto", () => {
    const p = parecerCom([{ sinal: "sanfona", valor: 7, disposicao: "falso_positivo", evidencia: "e" }]);
    expect(exigirDisposicaoCompleta(p, [medido("sanfona", 7, true), medido("gnomico", 1, false)])).toBe(p);
  });

  it("sinal DENTRO da cota não exige disposição", () => {
    const p = parecerCom([]);
    expect(() => exigirDisposicaoCompleta(p, [medido("gnomico", 1, false)])).not.toThrow();
  });

  // Caso real do canário romantasy: o rótulo medido carrega acento, ponto e
  // parêntese de glosa; exigir a string exata queimou as 2 tentativas do papel.
  it("casa o nome do sinal com grafia tolerante (acento/ponto/parêntese)", () => {
    const rotulo = "cadencia.anáfora (frases coladas, mesmo início)";
    for (const escrito of [rotulo, "cadencia.anafora", "anáfora", "Cadencia Anafora"]) {
      const p = parecerCom([{ sinal: escrito, valor: 3, disposicao: "excecao_valida", evidencia: "batidas distintas" }]);
      expect(() => exigirDisposicaoCompleta(p, [medido(rotulo, 3, true)])).not.toThrow();
    }
  });

  it("nome ambíguo NÃO casa (fail-closed)", () => {
    const p = parecerCom([
      { sinal: "cadencia.fragmento de ênfase", valor: 3, disposicao: "excecao_valida", evidencia: "e" },
      { sinal: "cadencia.fragmentos de ênfase COLADOS", valor: 2, disposicao: "excecao_valida", evidencia: "e" },
    ]);
    // "cadencia enfase" é subcadeia de ambos os dispostos → ambíguo → segue omitido
    expect(() => exigirDisposicaoCompleta(p, [medido("cadencia.enfase", 9, true)])).toThrow(/cadencia\.enfase/);
  });
});
