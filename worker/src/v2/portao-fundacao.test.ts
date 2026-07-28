import { describe, expect, it } from "vitest";
import type { FundacaoV2 } from "./fundacao.js";
import {
  avaliarFundacaoV2,
  avaliarMacroFundacao,
  correcaoParaRetry,
  gateFundacao,
  gateMacroMicroCoerentes,
} from "./portao-fundacao.js";
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

// Resumos com FUNÇÃO distinta de verdade: o portão agora reprova capítulos
// intercambiáveis, e uma fixture que só troca o número seria exatamente isso.
const FUNCOES_CAP = [
  "Marina encontra a gravura no farol e não entende o símbolo",
  "o inventário do arquivo revela um registro rasurado de 1987",
  "Helena aparece na ilha alegando inspeção do patrimônio",
  "a lancha do continente some do cais durante a noite",
  "Marina fotografa o livro de bordo antes de o arquivista voltar",
  "o mergulhador confirma que há uma estrutura submersa",
  "a rádio do farol capta uma transmissão em código",
  "Helena confronta Marina e oferece dinheiro pelo silêncio",
  "o irmão desaparecido reaparece no vídeo de vigilância",
  "a maré descobre a entrada do túnel sob a rocha",
  "Marina desce ao túnel e encontra o arquivo do TPEA",
  "a verdade sobre 1987 vai a público e Helena é presa",
];

function estruturaDe(n: number, fio = "investigacao") {
  return Array.from({ length: n }, (_, i) => ({
    capitulo: i + 1,
    fio,
    resumo_estrutural: FUNCOES_CAP[i % FUNCOES_CAP.length] + (i >= FUNCOES_CAP.length ? ` (desdobramento ${i})` : ""),
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
      personagem: "Marina Alencar",
      marcos: [
        { capitulo: 1, estado: "acomodada" },
        { capitulo: Math.floor(total / 2), estado: "assume o risco" },
        { capitulo: total, estado: "expõe a verdade" },
      ],
    },
    {
      personagem: "Helena Duarte",
      marcos: [
        { capitulo: 2, estado: "controla a narrativa oficial" },
        { capitulo: Math.floor(total / 2) + 1, estado: "perde o controle do arquivo" },
        { capitulo: total, estado: "é exposta" },
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
      {
        nome: "Marina Alencar",
        papel: "protagonista",
        ferida: "f", segredo: "s", desejo: "d", voz: "v",
        arco: "de guardiã acomodada a denunciante: assume o risco no meio e expõe a verdade no fim",
      },
      {
        nome: "Helena Duarte",
        papel: "antagonista",
        ferida: "f", segredo: "s", desejo: "d", voz: "v",
        arco: "de controladora da versão oficial a exposta publicamente",
      },
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

// Fatia F: o que antes só avisava agora BLOQUEIA. Warnings ficam reservados ao
// que é de fato não-bloqueante — uma promessa editorial vazia ou um livro sem
// antagonista não são disso.
describe("o que virou bloqueante (antes: aviso)", () => {
  it("capítulos com função intercambiável reprovam a fundação", () => {
    const e = estruturaDe(12).map((x) => ({ ...x, resumo_estrutural: "o mesmo resumo estrutural em todos os capítulos" }));
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "FUNCOES_CAPITULO_REPETIDAS");
    expect(b).toBeDefined();
    expect(b!.severidade).toBe("critical");
  });

  it("paráfrase também conta: resumos quase iguais reprovam", () => {
    const e = estruturaDe(12);
    e[4].resumo_estrutural = "Marina fotografa o livro de bordo antes do arquivista voltar";
    e[5].resumo_estrutural = "Marina fotografa o livro de bordo antes de o arquivista voltar";
    const av = avaliarFundacaoV2(fundacao({ estrutura: e }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "FUNCOES_CAPITULO_REPETIDAS")).toBe(true);
  });

  it("promessa editorial vazia reprova a fundação", () => {
    const av = avaliarFundacaoV2(fundacao({ promessa_editorial: "  " }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "PROMESSA_EDITORIAL_VAZIA");
    expect(b).toBeDefined();
    expect(b!.severidade).toBe("critical");
  });

  it("livro sem antagonista nem força antagônica reprova", () => {
    const av = avaliarFundacaoV2(
      fundacao({
        biblia: "Marina Alencar cuida do farol de Ponta Rasa. A obra tem uma virada no meio. ".repeat(6),
        mapa_personagens: [
          {
            nome: "Marina Alencar", papel: "protagonista",
            ferida: "f", segredo: "s", desejo: "d", voz: "v",
            arco: "de guardiã acomodada a denunciante, com marcos claros no meio e no fim",
          },
        ],
      }),
      contrato, 12, ["dossie-factual.md"]
    );
    expect(av.bloqueios.some((x) => x.codigo === "ANTAGONISTA_AUSENTE")).toBe(true);
  });

  it("personagem central sem arco e sem invariância explícita reprova", () => {
    const mapa = fundacao().mapa_personagens.map((p) => ({ ...p, arco: "" }));
    const av = avaliarFundacaoV2(fundacao({ mapa_personagens: mapa }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "ARCO_PERSONAGEM_AUSENTE");
    expect(b).toBeDefined();
    expect(b!.mensagem).toContain("Marina Alencar");
  });

  it("com grade v3, personagem central fora dela reprova mesmo com arco em texto", () => {
    const arco = arcoOk(12);
    arco.arcos = arco.arcos.filter((a) => a.personagem !== "Helena Duarte");
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "ARCO_PERSONAGEM_AUSENTE");
    expect(b).toBeDefined();
    expect(b!.mensagem).toContain("Helena Duarte");
  });

  it("invariância DECLARADA e justificada é aceita — o silêncio é que não", () => {
    const arco = arcoOk(12);
    arco.arcos = arco.arcos.filter((a) => a.personagem !== "Helena Duarte");
    const mapa = fundacao().mapa_personagens.map((p) =>
      p.papel === "antagonista"
        ? { ...p, arco: "personagem invariante por desenho: Helena não muda; é o mundo em volta dela que se altera" }
        : p
    );
    const av = avaliarFundacaoV2(fundacao({ arco, mapa_personagens: mapa }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "ARCO_PERSONAGEM_AUSENTE")).toBe(false);
  });

  it("tensão plana entre os atos reprova (estar na faixa 1–5 não basta)", () => {
    const arco = arcoOk(12);
    arco.atos = arco.atos.map((a) => ({ ...a, tensao_alvo: 3 }));
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    const b = av.bloqueios.find((x) => x.codigo === "TENSAO_SEM_PROGRESSAO");
    expect(b).toBeDefined();
    expect(b!.mensagem).toContain("plana");
  });

  it("fio sem nenhum passo de escalada reprova", () => {
    const arco = arcoOk(12);
    arco.fios[0].escalada = [];
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "ARCO_INCOMPLETO" && /escalada n[aã]o vazia/.test(x.mensagem))).toBe(true);
  });

  it("arco v3 sem nenhuma promessa concreta reprova", () => {
    const arco = arcoOk(12);
    arco.promessas = [];
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "PROMESSA_NARRATIVA_AUSENTE")).toBe(true);
  });

  it("promessa central paga antes do último ato deixa o desfecho vazio", () => {
    const arco = arcoOk(12);
    arco.promessas[0].paga_em = 5; // último ato começa no 9
    const av = avaliarFundacaoV2(fundacao({ arco }), contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((x) => x.codigo === "CLIMAX_NAO_PAGA_PROMESSAS")).toBe(true);
  });

  it("documento exigido que é placeholder reprova", () => {
    const av = avaliarFundacaoV2(
      fundacao({ docs_exigidos: { "dossie-factual.md": "# Dossiê factual\n\nTODO: preencher com os fatos do livro." } }),
      contrato, 12, ["dossie-factual.md"]
    );
    const b = av.bloqueios.find((x) => x.codigo === "DOC_PLACEHOLDER");
    expect(b).toBeDefined();
    expect(b!.mensagem).toContain("dossie-factual.md");
  });

  it("documento exigido substantivo passa", () => {
    const av = avaliarFundacaoV2(
      fundacao({
        arco: arcoOk(12),
        docs_exigidos: {
          "dossie-factual.md":
            "# Dossiê factual\n\n" +
            "O farol de Ponta Rasa foi construído em 1911 e automatizado em 1987. " +
            "O registro de entrada do consulado existe em duas vias, uma delas arquivada em Lisboa. " +
            "A maré de sizígia descobre a entrada do túnel duas vezes por ano, em março e setembro. " +
            "O TPEA operou entre 1984 e 1991 sob supervisão do ministério.",
        },
      }),
      contrato, 12, ["dossie-factual.md"]
    );
    expect(av.bloqueios.some((x) => x.codigo === "DOC_PLACEHOLDER")).toBe(false);
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

// ---------------------------------------------------------------------------
// Fatia F — duas passadas: macro validada ANTES da micro
// ---------------------------------------------------------------------------

describe("fundação em duas passadas", () => {
  it("a MACRO é julgada sem a estrutura: falta de capítulo não reprova a passada 1", () => {
    const { estrutura: _ignorada, ...macro } = fundacao({ arco: arcoOk(12) });
    const av = avaliarMacroFundacao(macro, contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios).toEqual([]);
  });

  it("a MACRO reprova por defeito de arco antes de gastar a geração da estrutura", () => {
    const arco = arcoOk(12);
    arco.promessas[0].paga_em = 0; // promessa que nasce quebrada
    const { estrutura: _ignorada, ...macro } = fundacao({ arco });
    const av = avaliarMacroFundacao(macro, contrato, 12, ["dossie-factual.md"]);
    expect(av.bloqueios.some((b) => b.codigo === "ARCO_INCOMPLETO")).toBe(true);
  });

  it("micro que aponta capítulo inexistente na macro é contradição bloqueante", () => {
    const arco = arcoOk(12);
    arco.promessas[0].paga_em = 11;
    const f = fundacao({ arco, estrutura: estruturaDe(12).filter((e) => e.capitulo !== 11) });
    const b = gateMacroMicroCoerentes(f);
    expect(b.some((x) => x.codigo === "MACRO_MICRO_CONTRADIZEM")).toBe(true);
    expect(b.map((x) => x.mensagem).join(" ")).toContain("paga no capítulo 11");
  });

  it("fio da macro sem um único capítulo na micro é contradição bloqueante", () => {
    const arco = arcoOk(12);
    const f = fundacao({ arco, estrutura: estruturaDe(12, "investigacao") }); // conspiracao nunca aparece
    const b = gateMacroMicroCoerentes(f);
    expect(b.some((x) => x.mensagem.includes("conspiracao"))).toBe(true);
  });

  it("macro e micro coerentes não geram bloqueio", () => {
    const arco = arcoOk(12);
    const estrutura = estruturaDe(12).map((e, i) => ({ ...e, fio: i % 2 === 0 ? "investigacao" : "conspiracao" }));
    expect(gateMacroMicroCoerentes(fundacao({ arco, estrutura }))).toEqual([]);
  });
});
