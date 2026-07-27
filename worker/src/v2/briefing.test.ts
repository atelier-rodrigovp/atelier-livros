import { describe, expect, it } from "vitest";
import {
  briefingParaFundacao,
  decisoesAvulsas,
  instrucoesDoBriefing,
  nomeIdioma,
  preferenciasDoBriefing,
  resolverIdioma,
  type BriefingAutor,
} from "./briefing.js";
import { compilarPacote, renderizarPacote } from "./compilador.js";
import { tarefaCanarioVoz, tarefaEscritor } from "./tarefas.js";
import type { ContratoCompilado, SceneSpec, SkillContract } from "./tipos.js";

const contratoBase: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Skill de Teste",
  familia_editorial: "thriller_enigma",
  motor_narrativo: "pergunta → obstáculo → revelação → corte",
  unidade_dramatica: "cena com virada",
  pov: { pessoa: "terceira_multipla" },
  temporalidade: "relógio comprimido",
  faixa_palavras: { min: 900, alvo: 1200, max: 1600 },
  ritmo: { descricao: "curto e propulsivo" },
  acao_interioridade: { relacao: "acao_dominante", descricao: "interioridade funcional" },
  politica_exposicao: "dramatizada, nunca em bloco",
  politica_dialogo: { descricao: "diálogo avança a cena" },
  politica_metafora: { descricao: "rara e concreta", cota_por_capitulo: 1 },
  tipos_gancho: ["revelacao", "ameaca"],
  regras: [
    { id: "r1", texto: "Feche cada cena com consequência concreta", tipo: "alvo_positivo", papeis: ["escritor"] },
  ],
  testes_positivos: ["transparência"],
  sinais_negativos: ["gnomico"],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};
const contrato: ContratoCompilado = { contrato: contratoBase, hash: "h".repeat(64), origem: "teste" };
const perfil = { texto: "Perfil de voz validado do livro.", skillId: "teste", hash: "p".repeat(64), validado: true };

const briefingCompleto: BriefingAutor = {
  ideia_central: "Um cofre lacrado em Alcobaça guarda a prova de uma fraude histórica.",
  genero: "thriller de conspiração",
  protagonista: { nome: "Marina Vasques", ferida: "perdeu o irmão", segredo: "falsificou o laudo", desejo: "provar a fraude" },
  antagonista: "O arquivista-chefe da Ordem",
  personagens: { protagonistas: 1, antagonistas: 1, apoio: 3 },
  tom: "sombrio e acelerado",
  pdv: "terceira pessoa próxima",
  tempo_verbal: "passado",
  linha_tempo: "72 horas em Lisboa",
  final: "a fraude é exposta, a um custo pessoal",
  canone: "o cofre foi lacrado em 1911",
  proibido: "violência gráfica contra crianças",
  idioma: "pt-BR",
  decisoes_autor: [{ texto: "Nunca matar o cão da protagonista.", em: "2026-07-27" }],
  preferencias: [{ texto: "Prefiro capítulos que abrem em movimento.", em: "2026-07-27" }],
};

describe("briefing → pacote compilado (DoD: o briefing chega à fundação e ao escritor)", () => {
  it("protagonista, antagonista, tom, PdV e proibições aparecem no pacote do escritor", () => {
    const r = compilarPacote({
      papel: "escritor",
      alvo: "capitulo:1",
      contrato,
      perfil,
      instrucoesAutor: [...instrucoesDoBriefing(briefingCompleto), ...decisoesAvulsas(briefingCompleto)],
      preferencias: preferenciasDoBriefing(briefingCompleto),
    });
    expect(r.ok).toBe(true);
    const texto = renderizarPacote(r.pacote!);
    expect(texto).toContain("Marina Vasques");
    expect(texto).toContain("arquivista-chefe");
    expect(texto).toContain("sombrio e acelerado");
    expect(texto).toContain("terceira pessoa próxima");
    expect(texto).toContain("violência gráfica contra crianças");
    expect(texto).toContain("o cofre foi lacrado em 1911");
    // decisão avulsa (camada 3) e preferência (camada 7) também chegam
    expect(texto).toContain("Nunca matar o cão da protagonista.");
    expect(texto).toContain("Prefiro capítulos que abrem em movimento.");
  });

  it("decisão do autor (camada 3) vence preferência (camada 7) na mesma chave", () => {
    const r = compilarPacote({
      papel: "escritor",
      alvo: "capitulo:1",
      contrato,
      perfil,
      instrucoesAutor: [{ texto: "Tom: sombrio.", camada: "decisao_autor", fonte: "autor", chave: "tom" }],
      preferencias: [{ texto: "Tom: leve.", camada: "preferencia", fonte: "autor", chave: "tom" }],
    });
    expect(r.ok).toBe(true);
    expect(r.pacote!.instrucoes.map((i) => i.texto)).toContain("Tom: sombrio.");
    expect(r.pacote!.instrucoes.map((i) => i.texto)).not.toContain("Tom: leve.");
    expect(r.pacote!.contradicoes).toHaveLength(1);
  });

  it("briefingParaFundacao entrega premissa, idioma e o bloco de detalhes completo", () => {
    const b = briefingParaFundacao({
      titulo: "O Cofre",
      total_capitulos: 12,
      idioma_origem: null,
      briefing: briefingCompleto,
    });
    expect(b.premissa).toContain("Alcobaça");
    expect(b.idioma).toBe("pt-BR");
    expect(b.totalCapitulos).toBe(12);
    for (const trecho of ["Marina Vasques", "Tom: sombrio e acelerado", "Linha do tempo: 72 horas", "Final planejado", "Proibições"]) {
      expect(b.detalhes).toContain(trecho);
    }
  });
});

describe("idioma (DoD: precedência e fim do hardcode)", () => {
  it("precedência: idioma_origem > briefing.idioma > pt-BR", () => {
    expect(resolverIdioma({ idioma_origem: "en", briefing: { idioma: "pt-BR" } })).toBe("en");
    expect(resolverIdioma({ idioma_origem: null, briefing: { idioma: "es-ES" } })).toBe("es-ES");
    expect(resolverIdioma({ idioma_origem: "", briefing: {} })).toBe("pt-BR");
  });

  it("projeto en + skill dan-brown-like: tarefa do escritor sai em inglês", () => {
    const ficha: SceneSpec = {
      schema: "scene-spec/v1",
      capitulo: 1,
      pov: "Marina",
      local: "arquivo",
      tempo: "Dia 1",
      objetivo: "obter o registro",
      obstaculo: "arquivista",
      acao_fisica: "fotografa o livro",
      informacao_nova: "nome do irmão",
      virada: "página arrancada",
      mudanca_estado: "confiante → exposta",
      gancho: { tipo: "revelacao", descricao: "página arrancada" },
      fatos_obrigatorios: [],
      conhecimentos_proibidos: [],
      fios_avancados: [],
      fios_ausentes: [],
    };
    const idioma = resolverIdioma({ idioma_origem: "en", briefing: briefingCompleto });
    const tarefa = tarefaEscritor(ficha, contratoBase, idioma);
    expect(tarefa).toContain("em inglês");
    expect(tarefa).not.toContain("português brasileiro");
    const canario = tarefaCanarioVoz("uma ideia", contratoBase, undefined, idioma);
    expect(canario).toContain("em inglês");
    expect(canario).not.toContain("português brasileiro");
  });

  it("default preserva o comportamento atual (pt-BR)", () => {
    expect(nomeIdioma("pt-BR")).toBe("português brasileiro");
    const canario = tarefaCanarioVoz("uma ideia", contratoBase);
    expect(canario).toContain("português brasileiro");
  });
});
