// Evidência por ÍNDICE — fatia 2.
//
// O revisor transcrevia cada ocorrência julgada. Era a maior parte da sua saída
// (22.711 tokens médios contra 7.295 do escritor) e a maior classe de falha:
// `citação não corresponde a nenhuma ocorrência medida`, porque o modelo não
// reproduz texto caractere a caractere.
//
// Agora ele cita o número que o detector já imprime no prompt. A verificação
// deixa de ser casamento aproximado de texto e vira igualdade de inteiro contra
// o intervalo medido — mais rígida, não menos. E o sistema HIDRATA o índice
// antes de gravar, porque `engine_reviews` não guarda a medição: índice sozinho
// no arquivo é ponteiro solto.

import { describe, expect, it } from "vitest";
import {
  exigirDisposicaoCompleta,
  hidratarOcorrenciasCitadas,
  validarParecer,
} from "./revisor.js";
import { medirSinais } from "./sinais.js";
import { carregarContrato } from "./contrato.js";
import type { SinalMedido } from "./sinais.js";
import type { Parecer } from "./tipos.js";

const EXEMPLOS = [
  "quem espera sempre alcança",
  "a memória é uma casa de portas trocadas",
  "toda espera é uma forma de fé",
  "o silêncio decide antes da boca",
  "guardar é uma forma de lembrar",
  "a pressa é filha do medo",
];

const medido = (over: Partial<SinalMedido> = {}): SinalMedido =>
  ({ sinal: "gnomico", valor: 6, cota: { max: 1 }, fora_da_cota: true, exemplos: EXEMPLOS, ...over }) as SinalMedido;

const eixo = { nota: 4, evidencia: "a virada muda o rumo da cena" };
const parecer = (sinais: unknown[]): unknown => ({
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

/** Violação confirmada citando índices, com a conta fechada. */
const comIndices = (indices: number[], falsos = 6 - indices.length) =>
  parecer([
    {
      sinal: "gnomico",
      valor: 6,
      disposicao: "violacao_confirmada",
      evidencia: "máximas empilhadas",
      ocorrencias_citadas: indices.map((indice) => ({ indice })),
      falsos_positivos: falsos,
    },
  ]);

const conferir = (p: unknown, m = [medido()]) => exigirDisposicaoCompleta(validarParecer(p), m);

/** Contrato REAL: `medirSinais` lê cotas e regras dele. */
const CONTRATO = carregarContrato("dan-brown").contrato;

describe("o índice é estável", () => {
  const texto = [
    "Quem espera sempre alcança. A porta rangeu.",
    "A memória é uma casa de portas trocadas. Ele desceu.",
    "Toda espera é uma forma de fé. O vento entrou.",
  ].join("\n\n");

  it("medir o MESMO texto duas vezes produz a mesma numeração", () => {
    // É o que torna citar por índice defensável: se a numeração variasse entre
    // a medição e a conferência, o índice seria pior que a transcrição.
    const a = medirSinais(texto, CONTRATO);
    const b = medirSinais(texto, CONTRATO);
    expect(a.map((s) => [s.sinal, s.valor, s.exemplos])).toEqual(b.map((s) => [s.sinal, s.valor, s.exemplos]));
  });

  it("a medição não depende de relógio nem de sorteio", () => {
    const a = medirSinais(texto, CONTRATO);
    const b = medirSinais(texto, CONTRATO);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("citar índice válido funciona", () => {
  it("aceita violacao_confirmada citando #3", () => {
    expect(() => conferir(comIndices([3]))).not.toThrow();
  });

  it("aceita vários índices, com a conta fechada", () => {
    expect(() => conferir(comIndices([1, 3, 5], 3))).not.toThrow();
  });

  it("a ocorrência citada é a que o detector mediu naquela posição", () => {
    const hid = hidratarOcorrenciasCitadas(conferir(comIndices([3])) as Parecer, [medido()]);
    expect(hid.sinais[0].ocorrencias_citadas?.[0]).toEqual({ indice: 3, trecho: EXEMPLOS[2] });
  });
});

describe("índice inválido REPROVA", () => {
  it("índice 99 com 6 ocorrências medidas é rejeitado", () => {
    expect(() => conferir(comIndices([99], 5))).toThrow(/índice 99 fora do medido/);
  });

  it("índice 0 é rejeitado na validação estrutural (1-based)", () => {
    expect(() => conferir(comIndices([0], 5))).toThrow(/indice deve ser inteiro/);
  });

  it("índice negativo é rejeitado", () => {
    expect(() => conferir(comIndices([-1], 5))).toThrow(/indice deve ser inteiro/);
  });

  it("índice fracionário é rejeitado", () => {
    expect(() => conferir(comIndices([2.5], 5))).toThrow(/indice deve ser inteiro/);
  });

  it("o mesmo índice citado duas vezes é duplicidade", () => {
    expect(() => conferir(comIndices([3, 3], 4))).toThrow(/duplicidade/);
  });
});

describe("as regras que não mudaram", () => {
  it("violacao_confirmada SEM ocorrencias_citadas continua rejeitada", () => {
    const p = parecer([
      { sinal: "gnomico", valor: 6, disposicao: "violacao_confirmada", evidencia: "muitas máximas" },
    ]);
    expect(() => conferir(p)).toThrow(/exige "ocorrencias_citadas"/);
  });

  it("ocorrência sem índice E sem trecho é rejeitada", () => {
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 6,
        disposicao: "violacao_confirmada",
        evidencia: "x",
        ocorrencias_citadas: [{ posicao: "L12" }],
        falsos_positivos: 5,
      },
    ]);
    expect(() => conferir(p)).toThrow(/exige "indice".*ou "trecho"/);
  });

  it("conta fechada: citadas + falsos ≠ valor continua reprovando", () => {
    expect(() => conferir(comIndices([1, 2], 1))).toThrow();
  });

  it("valor divergente da medição continua reprovando", () => {
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 7,
        disposicao: "violacao_confirmada",
        evidencia: "x",
        ocorrencias_citadas: [{ indice: 1 }],
        falsos_positivos: 6,
      },
    ]);
    expect(() => conferir(p)).toThrow(/difere da medição/);
  });
});

describe("formato antigo continua legível (sem migrar dado)", () => {
  const antigo = parecer([
    {
      sinal: "gnomico",
      valor: 6,
      disposicao: "violacao_confirmada",
      evidencia: "máximas",
      ocorrencias_citadas: [{ trecho: EXEMPLOS[0], posicao: "L4" }],
      falsos_positivos: 5,
    },
  ]);

  it("parecer só com trecho continua válido", () => {
    expect(() => conferir(antigo)).not.toThrow();
  });

  it("hidratar não altera parecer que já traz trecho", () => {
    const hid = hidratarOcorrenciasCitadas(conferir(antigo) as Parecer, [medido()]);
    expect(hid.sinais[0].ocorrencias_citadas?.[0]).toEqual({ trecho: EXEMPLOS[0], posicao: "L4" });
  });

  it("trecho inventado continua reprovando", () => {
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 6,
        disposicao: "violacao_confirmada",
        evidencia: "x",
        ocorrencias_citadas: [{ trecho: "frase que o detector nunca mediu" }],
        falsos_positivos: 5,
      },
    ]);
    expect(() => conferir(p)).toThrow(/não corresponde a nenhuma ocorrência medida/);
  });
});

describe("item misto: índice e trecho juntos", () => {
  it("aceito quando os dois apontam a mesma ocorrência", () => {
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 6,
        disposicao: "violacao_confirmada",
        evidencia: "x",
        ocorrencias_citadas: [{ indice: 2, trecho: EXEMPLOS[1] }],
        falsos_positivos: 5,
      },
    ]);
    expect(() => conferir(p)).not.toThrow();
  });

  it("REPROVA quando apontam ocorrências diferentes", () => {
    // Citar #2 e transcrever a ocorrência 5 é contradição, não erro de digitação.
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 6,
        disposicao: "violacao_confirmada",
        evidencia: "x",
        ocorrencias_citadas: [{ indice: 2, trecho: EXEMPLOS[4] }],
        falsos_positivos: 5,
      },
    ]);
    expect(() => conferir(p)).toThrow(/apontam ocorrências diferentes/);
  });
});

describe("hidratação: o arquivo nunca guarda ponteiro solto", () => {
  it("índice que não resolve LANÇA em vez de gravar trecho vazio", () => {
    // Só chega aqui se escapar da conferência; ainda assim não grava vazio.
    const p = { ...(comIndices([3]) as Record<string, unknown>) } as Parecer;
    (p.sinais[0].ocorrencias_citadas as { indice: number }[])[0].indice = 99;
    expect(() => hidratarOcorrenciasCitadas(p, [medido()])).toThrow(/não resolve/);
  });

  it("mantém o índice ao lado do trecho, para auditoria", () => {
    const hid = hidratarOcorrenciasCitadas(conferir(comIndices([1, 6], 4)) as Parecer, [medido()]);
    expect(hid.sinais[0].ocorrencias_citadas).toEqual([
      { indice: 1, trecho: EXEMPLOS[0] },
      { indice: 6, trecho: EXEMPLOS[5] },
    ]);
  });

  it("não toca em sinal sem ocorrências citadas", () => {
    const p = conferir(parecer([{ sinal: "gnomico", valor: 6, disposicao: "falso_positivo", evidencia: "supercontou" }]));
    expect(hidratarOcorrenciasCitadas(p as Parecer, [medido()]).sinais[0].ocorrencias_citadas).toBeUndefined();
  });
});
