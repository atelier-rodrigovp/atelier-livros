// Normalização determinística do parecer — item 1 da fila de custo.
//
// A regra que estes testes existem para fixar: normalizar é reinterpretar a
// ESCRITA, nunca o julgamento. Se um caso aqui começar a exigir que uma medição
// mude ou que uma disposição vire outra, a normalização passou do ponto.

import { describe, expect, it } from "vitest";
import { exigirDisposicaoCompleta, normalizarParecerBruto, validarParecer } from "./revisor.js";
import type { SinalMedido } from "./sinais.js";

const medido = (over: Partial<SinalMedido> = {}): SinalMedido =>
  ({
    sinal: "gnomico",
    valor: 6,
    cota: 1,
    fora_da_cota: true,
    exemplos: [],
    ...over,
  }) as SinalMedido;

const eixo = { nota: 4, evidencia: "a virada muda o rumo da cena" };
const parecer = (sinais: unknown[]) => ({
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
  correcoes: [],
});

const sinaisDe = (p: unknown) => (p as { sinais: Record<string, unknown>[] }).sinais;

describe("valor escrito como texto vira número", () => {
  it('"6 (cota máx 1)" com medição 6 é ACEITO', () => {
    const bruto = parecer([
      { sinal: "gnomico", valor: "6 (cota máx 1)", disposicao: "falso_positivo", evidencia: "enumeração legítima" },
    ]);
    const norm = normalizarParecerBruto(bruto, [medido()]);
    expect(sinaisDe(norm)[0].valor).toBe(6);
    expect(() => validarParecer(norm)).not.toThrow();
  });

  it('"7 (cota máx 1)" com medição 6 continua REPROVANDO', () => {
    // O número normaliza, mas a divergência com a medição permanece: é a régua,
    // e a régua não é assunto da normalização.
    const bruto = parecer([
      {
        sinal: "gnomico",
        valor: "7 (cota máx 1)",
        disposicao: "violacao_confirmada",
        evidencia: "máximas",
        ocorrencias_citadas: [{ trecho: "quem espera sempre alcança" }],
        falsos_positivos: 6, // fecha a conta 1 + 6 = 7 para chegar à comparação com a medição
      },
    ]);
    const norm = normalizarParecerBruto(bruto, [medido()]);
    expect(sinaisDe(norm)[0].valor).toBe(7);
    // O valor 7 ≠ medição 6 é pego por `problemasDeCitacao` via exigirDisposicaoCompleta.
    expect(() => exigirDisposicaoCompleta(validarParecer(norm), [medido()])).toThrow(/difere da medição/);
  });

  it("valor que não começa com número é deixado como está (e reprovado adiante)", () => {
    const norm = normalizarParecerBruto(
      parecer([{ sinal: "gnomico", valor: "muitos", disposicao: "falso_positivo", evidencia: "x" }]),
      [medido()]
    );
    expect(sinaisDe(norm)[0].valor).toBe("muitos");
  });
});

describe('rótulos de "dentro da cota"', () => {
  it("entrada supérflua sobre sinal DENTRO da cota é descartada", () => {
    // O protocolo manda não listar sinal dentro da cota. Listar com rótulo fora
    // do enum era retry inteiro por uma linha que não devia existir.
    const norm = normalizarParecerBruto(
      parecer([{ sinal: "gnomico", valor: 1, disposicao: "dentro_da_cota", evidencia: "na cota" }]),
      [medido({ valor: 1, fora_da_cota: false })]
    );
    expect(sinaisDe(norm)).toHaveLength(0);
    expect(() => validarParecer(norm)).not.toThrow();
  });

  it.each(["conforme", "ok", "DENTRO_DA_COTA", " dentro da cota "])("descarta o rótulo %s", (rotulo) => {
    const norm = normalizarParecerBruto(
      parecer([{ sinal: "gnomico", valor: 1, disposicao: rotulo, evidencia: "x" }]),
      [medido({ valor: 1, fora_da_cota: false })]
    );
    expect(sinaisDe(norm)).toHaveLength(0);
  });

  it('"dentro_da_cota" sobre sinal FORA DA COTA continua INVÁLIDO', () => {
    // Aqui o modelo contradiz o detector — isso é julgamento, não formato, e a
    // normalização não tem autoridade para resolver.
    const norm = normalizarParecerBruto(
      parecer([{ sinal: "gnomico", valor: 6, disposicao: "dentro_da_cota", evidencia: "x" }]),
      [medido()]
    );
    expect(sinaisDe(norm)).toHaveLength(1);
    expect(() => validarParecer(norm)).toThrow(/indisposto ou inválido/);
  });
});

describe("o que a normalização NÃO faz", () => {
  it("não inventa disposição para sinal fora da cota omitido", () => {
    const norm = normalizarParecerBruto(parecer([]), [medido()]);
    expect(() => exigirDisposicaoCompleta(validarParecer(norm), [medido()])).toThrow(/parecer incompleto/);
  });

  it("não converte uma disposição válida em outra", () => {
    const norm = normalizarParecerBruto(
      parecer([{ sinal: "gnomico", valor: 6, disposicao: "falso_positivo", evidencia: "detector supercontou" }]),
      [medido()]
    );
    expect(sinaisDe(norm)[0].disposicao).toBe("falso_positivo");
  });

  it("ocorrência citada como string vira {trecho} sem perder o conteúdo", () => {
    const norm = normalizarParecerBruto(
      parecer([
        {
          sinal: "gnomico",
          valor: 6,
          disposicao: "violacao_confirmada",
          evidencia: "x",
          ocorrencias_citadas: ["quem espera sempre alcança"],
        },
      ]),
      [medido()]
    );
    expect(sinaisDe(norm)[0].ocorrencias_citadas).toEqual([{ trecho: "quem espera sempre alcança" }]);
  });

  it("parecer sem lista de sinais atravessa intacto", () => {
    const bruto = { schema: "parecer/v1", sinais: undefined };
    expect(normalizarParecerBruto(bruto, [medido()])).toEqual(bruto);
  });
});
