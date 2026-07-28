import { describe, expect, it } from "vitest";
import {
  gateFichaContraArco,
  gatePromessaNaoPaga,
  gateRotacaoPov,
  parsearArco,
  promessasNaoPagas,
  renderizarArcoParaCapitulo,
  validarArco,
  validarArcosPersonagem,
  validarAtos,
  validarFios,
  validarPromessas,
} from "./arco.js";
import type { ArcoFundacao, SceneSpec, SkillContract } from "./tipos.js";

function ficha(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 1,
    pov: "Marina",
    local: "farol",
    tempo: "Dia 1",
    objetivo: "o",
    obstaculo: "o",
    acao_fisica: "a",
    informacao_nova: "i",
    virada: "v",
    mudanca_estado: "m",
    gancho: { tipo: "ameaca", descricao: "d" },
    fatos_obrigatorios: [],
    conhecimentos_proibidos: [],
    fios_avancados: [],
    fios_ausentes: [],
    ...over,
  };
}

const contratoRot: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "T",
  familia_editorial: "thriller",
  motor_narrativo: "m",
  unidade_dramatica: "cena",
  pov: {
    pessoa: "terceira_multipla",
    rotacao: { fios_min: 2, fios_max: 4, max_caps_mesmo_fio: 3, janela: 10, max_caps_fio_ausente: 3 },
  },
  temporalidade: "linear",
  faixa_palavras: {},
  ritmo: { descricao: "m" },
  acao_interioridade: { relacao: "equilibrio", descricao: "d" },
  politica_exposicao: "d",
  politica_dialogo: { descricao: "d" },
  politica_metafora: { descricao: "d" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

const arcoOk: ArcoFundacao = {
  atos: [
    { numero: 1, cap_inicio: 1, cap_fim: 4, funcao: "instala o enigma", tensao_alvo: 2 },
    { numero: 2, cap_inicio: 5, cap_fim: 9, funcao: "escala a ameaça", tensao_alvo: 4 },
    { numero: 3, cap_inicio: 10, cap_fim: 12, funcao: "paga e fecha", tensao_alvo: 5 },
  ],
  promessas: [
    { id: "P1", enunciado: "a gravura aponta um lugar real", plantada_em: 1, reforcada_em: [5], paga_em: 10 },
    { id: "P2", enunciado: "o sobrenome Renner liga Caio ao naufrágio", plantada_em: 2, reforcada_em: [], paga_em: 11 },
  ],
  fios: [
    { id: "investigacao", nome: "Marina e a gravura", abre: 1, escalada: [4, 7], climax: 10, fecha: 12 },
    { id: "conspiracao", nome: "Helena e o TPEA", abre: 2, escalada: [6], climax: 9, fecha: 11 },
  ],
  arcos: [
    {
      personagem: "Marina",
      marcos: [
        { capitulo: 1, estado: "acomodada na rotina do farol" },
        { capitulo: 6, estado: "assume o risco de investigar" },
        { capitulo: 12, estado: "escolhe expor a verdade" },
      ],
    },
  ],
};

describe("parse tolerante", () => {
  it("fundação v2 (sem seção arco) devolve null, não erro", () => {
    expect(parsearArco({ estrutura: [], fios: ["a", "b"], promessa: "x" })).toBeNull();
    expect(parsearArco(null)).toBeNull();
    expect(parsearArco({ arco: {} })).toBeNull();
  });

  it("lê a seção arco completa", () => {
    const a = parsearArco({ arco: arcoOk });
    expect(a?.atos).toHaveLength(3);
    expect(a?.promessas.map((p) => p.id)).toEqual(["P1", "P2"]);
    expect(a?.fios.map((f) => f.id)).toEqual(["investigacao", "conspiracao"]);
    expect(a?.arcos[0].marcos).toHaveLength(3);
  });
});

describe("invariantes de atos", () => {
  it("grade correta não viola nada", () => {
    expect(validarAtos(arcoOk.atos, 12)).toEqual([]);
  });

  it("furo entre atos reprova", () => {
    const atos = [
      { numero: 1, cap_inicio: 1, cap_fim: 4, funcao: "f", tensao_alvo: 2 },
      { numero: 2, cap_inicio: 6, cap_fim: 12, funcao: "f", tensao_alvo: 4 },
    ];
    const v = validarAtos(atos, 12);
    expect(v).toHaveLength(1);
    expect(v[0].detalhe).toContain("começa no capítulo 6");
  });

  it("grade que não chega ao fim do livro reprova", () => {
    const v = validarAtos([{ numero: 1, cap_inicio: 1, cap_fim: 8, funcao: "f", tensao_alvo: 3 }], 12);
    expect(v.some((x) => x.detalhe.includes("termina no capítulo 8"))).toBe(true);
  });

  it("tensão fora de 1–5 reprova", () => {
    const v = validarAtos([{ numero: 1, cap_inicio: 1, cap_fim: 12, funcao: "f", tensao_alvo: 9 }], 12);
    expect(v.some((x) => x.invariante.includes("tensao_alvo"))).toBe(true);
  });
});

describe("invariantes de promessas", () => {
  it("promessas coerentes não violam nada", () => {
    expect(validarPromessas(arcoOk.promessas, 12)).toEqual([]);
  });

  it("promessa sem pagamento reprova citando o id", () => {
    const v = validarPromessas(
      [{ id: "P9", enunciado: "o irmão volta", plantada_em: 3, reforcada_em: [], paga_em: 0 }],
      12
    );
    expect(v).toHaveLength(1);
    expect(v[0].alvo).toBe("promessa:P9");
    expect(v[0].detalhe).toContain("nunca paga");
  });

  it("pagamento antes do plantio reprova", () => {
    const v = validarPromessas(
      [{ id: "P9", enunciado: "x", plantada_em: 8, reforcada_em: [], paga_em: 3 }],
      12
    );
    expect(v.some((x) => x.invariante === "plantio antes do pagamento")).toBe(true);
  });

  it("reforço fora da janela plantio→pagamento reprova", () => {
    const v = validarPromessas(
      [{ id: "P9", enunciado: "x", plantada_em: 3, reforcada_em: [11], paga_em: 8 }],
      12
    );
    expect(v.some((x) => x.invariante.includes("reforço"))).toBe(true);
  });
});

describe("invariantes de fios", () => {
  it("fios coerentes não violam nada", () => {
    expect(validarFios(arcoOk.fios, 12)).toEqual([]);
  });

  it("fio sem fechamento reprova", () => {
    const v = validarFios([{ id: "f1", nome: "x", abre: 1, escalada: [3], climax: 5, fecha: 0 }], 12);
    expect(v[0].invariante).toBe("todo fio tem fechamento");
  });

  it("clímax antes da escalada reprova", () => {
    const v = validarFios([{ id: "f1", nome: "x", abre: 1, escalada: [8], climax: 4, fecha: 10 }], 12);
    expect(v.some((x) => x.invariante.includes("abre <= escalada"))).toBe(true);
  });
});

describe("invariantes de arco de personagem", () => {
  it("três marcos cobrindo início/miolo/fim não violam nada", () => {
    expect(validarArcosPersonagem(arcoOk.arcos, 12)).toEqual([]);
  });

  it("menos de 3 marcos reprova", () => {
    const v = validarArcosPersonagem(
      [{ personagem: "Helena", marcos: [{ capitulo: 1, estado: "a" }, { capitulo: 12, estado: "b" }] }],
      12
    );
    expect(v[0].invariante).toContain("3 marcos");
  });

  it("arco que não chega ao fim do livro reprova", () => {
    const v = validarArcosPersonagem(
      [{
        personagem: "Helena",
        marcos: [{ capitulo: 1, estado: "a" }, { capitulo: 4, estado: "b" }, { capitulo: 6, estado: "c" }],
      }],
      12
    );
    expect(v.some((x) => x.invariante.includes("último quinto"))).toBe(true);
  });

  it("arco sem marco no miolo reprova", () => {
    const v = validarArcosPersonagem(
      [{
        personagem: "Helena",
        marcos: [{ capitulo: 1, estado: "a" }, { capitulo: 2, estado: "b" }, { capitulo: 12, estado: "c" }],
      }],
      12
    );
    expect(v.some((x) => x.invariante.includes("miolo"))).toBe(true);
  });
});

describe("validarArco (tudo junto)", () => {
  it("arco íntegro passa", () => {
    expect(validarArco(arcoOk, 12)).toEqual([]);
  });
});

describe("gate de promessa não paga", () => {
  const aprovadas = (caps: number[], pagas: Record<number, string[]> = {}) =>
    caps.map((c) => ({
      capitulo: c,
      ficha: ficha({
        capitulo: c,
        promessas_tocadas: (pagas[c] ?? []).map((id) => ({ id, acao: "paga" as const })),
      }),
    }));

  it("promessa plantada e nunca paga é detectada com o id", () => {
    const g = gatePromessaNaoPaga(
      [{ id: "P7", enunciado: "o farol volta a funcionar", plantada_em: 2, reforcada_em: [], paga_em: 0 }],
      aprovadas([1, 2, 3])
    );
    expect(g.passou).toBe(false);
    expect(g.gate).toBe("promessa_nao_paga");
    expect(g.evidencia).toContain("P7");
    expect(g.evidencia).toContain("o farol volta a funcionar");
    expect(g.evidencia).toContain("sem_pagamento_declarado");
  });

  it("capítulo de pagamento não aprovado deixa a promessa pendente", () => {
    const g = gatePromessaNaoPaga(arcoOk.promessas, aprovadas([1, 2, 3, 4, 5]));
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("capitulo_de_pagamento_nao_aprovado");
  });

  it("promessa declarada paga mas que nenhuma ficha pagou é detectada", () => {
    const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const g = gatePromessaNaoPaga(arcoOk.promessas, aprovadas(todos, { 10: ["P1"] }));
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("P2");
    expect(g.evidencia).toContain("nenhuma_ficha_paga");
  });

  it("todas pagas na fundação E nas fichas = passa", () => {
    const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const g = gatePromessaNaoPaga(arcoOk.promessas, aprovadas(todos, { 10: ["P1"], 11: ["P2"] }));
    expect(g.passou).toBe(true);
  });

  it("livro sem nenhuma marcação de ficha não é punido (fundação v2)", () => {
    const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(promessasNaoPagas(arcoOk.promessas, aprovadas(todos))).toEqual([]);
  });
});

describe("gate de rotação de POV", () => {
  const serie = (fios: string[][], ausentes: string[][] = []) =>
    fios.map((f, i) => ({
      capitulo: i + 1,
      ficha: ficha({ capitulo: i + 1, fios_avancados: f, fios_ausentes: ausentes[i] ?? [] }),
    }));

  it("contrato sem rotacao é no-op (hoover, narradora única)", () => {
    const semRot = { ...contratoRot, pov: { pessoa: "primeira" as const } };
    const g = gateRotacaoPov(5, ficha({ fios_avancados: ["a"] }), serie([["a"], ["a"], ["a"], ["a"]]), semRot);
    expect(g.passou).toBe(true);
  });

  it("rotação respeitada passa", () => {
    const anteriores = serie([["investigacao"], ["conspiracao"], ["investigacao"]]);
    const g = gateRotacaoPov(4, ficha({ capitulo: 4, fios_avancados: ["conspiracao"] }), anteriores, contratoRot);
    expect(g.passou).toBe(true);
  });

  it("mesmo fio além do máximo de capítulos seguidos reprova", () => {
    // max_caps_mesmo_fio = 3; este é o 4º seguido.
    const anteriores = serie([["investigacao"], ["investigacao"], ["investigacao"]]);
    const g = gateRotacaoPov(4, ficha({ capitulo: 4, fios_avancados: ["investigacao"] }), anteriores, contratoRot);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("4 capítulos seguidos");
    expect(g.evidencia).toContain("máx 3");
  });

  it("[DOD:N-01] fio ausente por mais capítulos que o contrato permite reprova", () => {
    // "conspiracao" avança no cap 1 e some nos capítulos 2..6 (5 > máx 3).
    const anteriores = serie(
      [["conspiracao"], ["investigacao"], ["investigacao"], ["investigacao"], ["investigacao"]],
      [[], ["conspiracao"], ["conspiracao"], ["conspiracao"], ["conspiracao"]]
    );
    const g = gateRotacaoPov(
      6,
      ficha({ capitulo: 6, fios_avancados: ["investigacao"], fios_ausentes: ["conspiracao"] }),
      anteriores,
      contratoRot
    );
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain('fio "conspiracao" ausente há 5 capítulos');
  });

  it("fio que ainda não abriu não conta como abandonado", () => {
    const anteriores = serie([["investigacao"], ["investigacao"]], [["romance"], ["romance"]]);
    const g = gateRotacaoPov(
      3,
      ficha({ capitulo: 3, fios_avancados: ["investigacao"], fios_ausentes: ["romance"] }),
      anteriores,
      contratoRot
    );
    // "investigacao" está no 3º seguido (dentro do máx 3) e "romance" nunca abriu.
    expect(g.passou).toBe(true);
  });
});

describe("recorte do arco para o capítulo", () => {
  it("entrega ato, promessas em aberto, fios vivos e marcos do capítulo", () => {
    const t = renderizarArcoParaCapitulo(arcoOk, 6);
    expect(t).toContain("ATO 2");
    expect(t).toContain("tensão-alvo: 4/5");
    expect(t).toContain("[P1]");
    expect(t).toContain("[P2]");
    expect(t).toContain("conspiracao");
    expect(t).toContain("Marina: assume o risco de investigar");
  });

  it("marca o capítulo em que a promessa é paga e o fio fecha", () => {
    const t10 = renderizarArcoParaCapitulo(arcoOk, 10);
    expect(t10).toContain("PAGA NESTE CAPÍTULO");
    expect(t10).toContain("CLÍMAX AQUI");
    const t12 = renderizarArcoParaCapitulo(arcoOk, 12);
    expect(t12).toContain("FECHA AQUI");
  });

  it("promessa já paga sai do recorte", () => {
    expect(renderizarArcoParaCapitulo(arcoOk, 12)).not.toContain("[P1]");
  });
});

// ---------------------------------------------------------------------------
// Fatia N — a ficha declarava ato/tensao_alvo/marcos_arco e NADA conferia
// ---------------------------------------------------------------------------

describe("gateFichaContraArco", () => {
  const arco: ArcoFundacao = {
    atos: [
      { numero: 1, cap_inicio: 1, cap_fim: 4, funcao: "instala", tensao_alvo: 2 },
      { numero: 2, cap_inicio: 5, cap_fim: 9, funcao: "escala", tensao_alvo: 4 },
      { numero: 3, cap_inicio: 10, cap_fim: 12, funcao: "paga", tensao_alvo: 5 },
    ],
    promessas: [{ id: "P1", enunciado: "o farol volta a funcionar", plantada_em: 2, reforcada_em: [6], paga_em: 11 }],
    fios: [],
    arcos: [{ personagem: "Marina", marcos: [{ capitulo: 3, estado: "decide agir" }] }],
  };

  it("fundação sem grade de arco = no-op", () => {
    expect(gateFichaContraArco(6, ficha({ ato: 99, tensao_alvo: 1 }), undefined).passou).toBe(true);
  });

  it("ficha coerente com a grade passa", () => {
    const f = ficha({
      capitulo: 6, ato: 2, tensao_alvo: 4,
      promessas_tocadas: [{ id: "P1", acao: "reforca" }],
    });
    expect(gateFichaContraArco(6, f, arco).passou).toBe(true);
  });

  it("[DOD:N-01] ato errado reprova citando o ato da grade", () => {
    const g = gateFichaContraArco(6, ficha({ capitulo: 6, ato: 1, tensao_alvo: 4 }), arco);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("ato 2");
  });

  it("[DOD:N-01] tensão-alvo divergente do ato reprova", () => {
    const g = gateFichaContraArco(6, ficha({ capitulo: 6, ato: 2, tensao_alvo: 2 }), arco);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("tensao_alvo");
  });

  it("[DOD:N-01] promessa inexistente na grade reprova", () => {
    const f = ficha({ capitulo: 6, ato: 2, tensao_alvo: 4, promessas_tocadas: [{ id: "P9", acao: "planta" }] });
    const g = gateFichaContraArco(6, f, arco);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("P9");
  });

  it("pagar no capítulo errado reprova citando onde a grade prevê o pagamento", () => {
    const f = ficha({ capitulo: 6, ato: 2, tensao_alvo: 4, promessas_tocadas: [{ id: "P1", acao: "paga" }] });
    const g = gateFichaContraArco(6, f, arco);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("pagamento previsto no capítulo 11");
  });

  it("[DOD:N-01] marco de arco fora do capítulo previsto reprova", () => {
    const f = ficha({ capitulo: 6, ato: 2, tensao_alvo: 4, marcos_arco: [{ personagem: "Marina", marco: "decide agir" }] });
    const g = gateFichaContraArco(6, f, arco);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("prevê marcos em [3]");
  });
});
