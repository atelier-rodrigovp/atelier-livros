import { describe, expect, it } from "vitest";
import type { FundacaoV2 } from "./fundacao.js";
import { avaliarFundacaoV2, correcaoParaRetry, gateFundacao } from "./portao-fundacao.js";
import type { ArcoFundacao, SkillContract } from "./tipos.js";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "dan-brown",
  versao: "1.0.0",
  nome: "T",
  familia_editorial: "thriller_enigma",
  motor_narrativo: "m",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_multipla", rotacao: { fios_min: 2, fios_max: 4, max_caps_mesmo_fio: 3 } },
  temporalidade: "linear",
  faixa_palavras: { min: 1300, max: 2200 },
  ritmo: { descricao: "m" },
  acao_interioridade: { relacao: "acao_dominante", descricao: "d" },
  politica_exposicao: "d",
  politica_dialogo: { descricao: "d" },
  politica_metafora: { descricao: "d" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  estruturas_exigidas: { docs: ["dossie-factual.md"], campos_spec: [] },
  referencias: [],
  modelos_positivos: [],
};

function estruturaDe(n: number, fio = "investigacao") {
  return Array.from({ length: n }, (_, i) => ({
    capitulo: i + 1,
    fio,
    resumo_estrutural: `objetivo e virada do capítulo ${i + 1}, distintos dos demais`,
  }));
}

const arcoOk = (total: number): ArcoFundacao => ({
  atos: [
    { numero: 1, cap_inicio: 1, cap_fim: Math.floor(total / 3), funcao: "instala", tensao_alvo: 2 },
    { numero: 2, cap_inicio: Math.floor(total / 3) + 1, cap_fim: Math.floor((2 * total) / 3), funcao: "escala", tensao_alvo: 4 },
    { numero: 3, cap_inicio: Math.floor((2 * total) / 3) + 1, cap_fim: total, funcao: "paga", tensao_alvo: 5 },
  ],
  promessas: [{ id: "P1", enunciado: "a gravura aponta um lugar real", plantada_em: 1, reforcada_em: [], paga_em: total - 1 }],
  fios: [
    { id: "investigacao", nome: "investigacao", abre: 1, escalada: [3], climax: total - 2, fecha: total },
    { id: "conspiracao", nome: "conspiracao", abre: 2, escalada: [5], climax: total - 3, fecha: total - 1 },
  ],
  arcos: [
    {
      personagem: "Marina",
      marcos: [
        { capitulo: 1, estado: "acomodada" },
        { capitulo: Math.floor(total / 2), estado: "assume o risco" },
        { capitulo: total, estado: "expõe a verdade" },
      ],
    },
  ],
});

function fundacao(over: Partial<FundacaoV2> = {}): FundacaoV2 {
  return {
    perfil_voz: "Voz seca, transparente, frase curta. ".repeat(4),
    biblia:
      "Marina Alencar é a faroleira de Ponta Rasa. Helena Duarte comanda a conspiração do TPEA. " +
      "A obra tem uma virada no meio: a gravura aponta coordenadas reais. Cânone factual e linha do tempo definidos. ".repeat(2),
    mapa_personagens: [
      { nome: "Marina Alencar", papel: "protagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "a" },
      { nome: "Helena Duarte", papel: "antagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "a" },
    ],
    estrutura: estruturaDe(12),
    fios: ["investigacao", "conspiracao"],
    promessa_editorial: "um thriller de enigma marítimo com pagamento honesto",
    ...over,
  };
}

describe("portão da fundação — estrutura x total de capítulos", () => {
  it("fundação íntegra passa", () => {
    const av = avaliarFundacaoV2(fundacao(), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios).toEqual([]);
    expect(gateFundacao(av).passou).toBe(true);
  });

  it("ESTRUTURA DE 12 NUM LIVRO DE 40 REPROVA (o caso mais barato e mais grave)", () => {
    const av = avaliarFundacaoV2(fundacao(), contrato, 40, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "ESTRUTURA_CAPITULOS_INCOERENTES");
    expect(b).toBeDefined();
    expect(b!.severidade).toBe("critical");
    expect(b!.mensagem).toContain("declarados: 12");
    expect(b!.mensagem).toContain("previstos: 40");
    expect(b!.mensagem).toContain("faltantes: 13, 14");
    expect(gateFundacao(av).passou).toBe(false);
  });

  it("furo no meio da estrutura reprova", () => {
    const e = estruturaDe(12).filter((x) => x.capitulo !== 7);
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios[0].mensagem).toContain("faltantes: 7");
  });

  it("capítulo duplicado reprova", () => {
    const e = [...estruturaDe(12), { capitulo: 5, fio: "investigacao", resumo_estrutural: "outro resumo qualquer aqui" }];
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios[0].mensagem).toContain("duplicados: 5");
  });

  it("capítulo fora da faixa reprova", () => {
    const e = [...estruturaDe(11), { capitulo: 99, fio: "investigacao", resumo_estrutural: "resumo do capítulo noventa e nove" }];
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios[0].mensagem).toContain("fora da faixa: 99");
  });
});

describe("portão da fundação — demais critérios portados da V1", () => {
  it("doc exigido pelo contrato e não gerado reprova", () => {
    const av = avaliarFundacaoV2(fundacao(), contrato, 12, []);
    const b = av.bloqueios.find((x) => x.codigo === "DOC_EXIGIDO_AUSENTE");
    expect(b?.mensagem).toContain("dossie-factual.md");
  });

  it("bíblia rasa reprova", () => {
    const av = avaliarFundacaoV2(fundacao({ biblia: "curta" }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "BIBLIA_RASA")).toBe(true);
  });

  it("capítulo apontando fio não declarado reprova", () => {
    const e = estruturaDe(12);
    e[3].fio = "romance";
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "FIO_DESCONHECIDO");
    expect(b?.mensagem).toContain('cap 4: "romance"');
  });

  it("número de fios fora do contrato reprova", () => {
    const av = avaliarFundacaoV2(fundacao({ fios: ["um"] }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "FIOS_FORA_DO_CONTRATO");
    expect(b?.mensagem).toContain("entre 2 e 4");
  });

  it("protagonista do mapa ausente da bíblia reprova", () => {
    const mapa = [
      { nome: "Zoraide Peçanha", papel: "protagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "a" },
    ];
    const av = avaliarFundacaoV2(fundacao({ mapa_personagens: mapa }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "PROTAGONISTA_INCOERENTE");
    expect(b?.mensagem).toContain("Zoraide Peçanha");
  });

  it("contrato sem docs exigidos não cobra doc nenhum", () => {
    const semDocs = { ...contrato, estruturas_exigidas: undefined };
    const av = avaliarFundacaoV2(fundacao(), semDocs, 12, []);
    expect(av.bloqueios.some((x) => x.codigo === "DOC_EXIGIDO_AUSENTE")).toBe(false);
  });
});

describe("portão da fundação — arco (v3) e compatibilidade (v2)", () => {
  it("fundação v2 (sem arco) NÃO reprova; avisa que os gates de arco ficam inativos", () => {
    const av = avaliarFundacaoV2(fundacao(), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios).toEqual([]);
    expect(av.avisos.some((a) => a.includes("schema v2"))).toBe(true);
  });

  it("fundação v3 com arco íntegro passa", () => {
    const av = avaliarFundacaoV2(fundacao({ arco: arcoOk(12) }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios).toEqual([]);
  });

  it("promessa nunca paga reprova a FUNDAÇÃO, citando o id", () => {
    const arco = arcoOk(12);
    arco.promessas.push({ id: "P2", enunciado: "o irmão de Marina reaparece", plantada_em: 3, reforcada_em: [], paga_em: 0 });
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "ARCO_INCOMPLETO" && x.mensagem.includes("P2"));
    expect(b).toBeDefined();
    expect(b!.mensagem).toContain("nunca paga");
    expect(gateFundacao(av).gate).toBe("fundacao_arco_incompleto");
  });

  it("grade de atos com furo reprova a fundação", () => {
    const arco = arcoOk(12);
    arco.atos[1].cap_inicio = 6; // ato 1 termina em 4, ato 2 começa em 6
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "ARCO_INCOMPLETO")).toBe(true);
  });
});

describe("avisos (sinalizam, não bloqueiam)", () => {
  it("resumos repetidos viram aviso, não bloqueio", () => {
    const e = estruturaDe(12).map((x) => ({ ...x, resumo_estrutural: "o mesmo resumo estrutural em todos os capítulos" }));
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios).toEqual([]);
    expect(av.avisos.some((a) => a.includes("repetido"))).toBe(true);
  });

  it("promessa editorial vazia vira aviso", () => {
    const av = avaliarFundacaoV2(fundacao({ promessa_editorial: "  " }), contrato, 12, ["dossie-factual.md"]);
    expect(av.avisos.some((a) => a.includes("promessa_editorial"))).toBe(true);
  });
});

describe("instrução de correção para o retry", () => {
  it("lista os bloqueios com código e mensagem", () => {
    const av = avaliarFundacaoV2(fundacao(), contrato, 40, []);
    const c = correcaoParaRetry(av);
    expect(c).toContain("REPROVADA");
    expect(c).toContain("ESTRUTURA_CAPITULOS_INCOERENTES");
    expect(c).toContain("DOC_EXIGIDO_AUSENTE");
    expect(c).toContain("fundação COMPLETA");
  });
});
