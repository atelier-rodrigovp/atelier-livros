// Cascata no pipeline — contagem de chamadas por modelo e a emenda do gate.
//
// Duas coisas que só se provam com o pipeline inteiro rodando:
//   1. sem gatilho, o modelo caro NÃO é chamado;
//   2. `veredito_sugerido` é sugestão — gate universal reprova por cima.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import { MODELO_POR_PAPEL, resolverModelo } from "./config.js";
import { conformidadeOk } from "./fixtures-teste.js";
import type { SceneSpec, SkillContract } from "./tipos.js";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Teste",
  familia_editorial: "thriller",
  motor_narrativo: "pergunta → virada",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: { alvo: 60 },
  ritmo: { descricao: "médio" },
  acao_interioridade: { relacao: "equilibrio", descricao: "eq" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "funcional" },
  politica_metafora: { descricao: "rara" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  estruturas_exigidas: { docs: [], campos_spec: [] },
  referencias: [],
  modelos_positivos: [],
};

const ficha = (): SceneSpec => ({
  schema: "scene-spec/v1",
  capitulo: 1,
  pov: "Marina",
  local: "farol",
  tempo: "Dia 1",
  objetivo: "abrir o alçapão",
  obstaculo: "fechadura emperrada",
  acao_fisica: "força a dobradiça",
  informacao_nova: "o alçapão esconde um arquivo",
  virada: "o alçapão cede",
  mudanca_estado: "de curiosa a comprometida",
  gancho: { tipo: "ameaca", descricao: "passos no cais" },
  fatos_obrigatorios: [],
  conhecimentos_proibidos: [],
  fios_avancados: [],
  fios_ausentes: [],
});

const prosa = [
  "## Capítulo 1",
  "",
  "Marina encostou o ombro na porta do farol e sentiu o ferro ceder um dedo.",
  "Ela forçou a dobradiça com a chave de fenda até o alçapão abrir sobre degraus.",
  "No cais, alguém caminhava devagar.",
].join("\n");

const eixo = { nota: 4, evidencia: "o alçapão que cede muda o rumo da cena" };
const parecerBase = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "reprovado",
    evidencias: [
      { local: "L5", trecho: "No cais, alguém caminhava devagar", observacao: "gancho de ameaça localizado" },
    ],
    sinais: [],
    correcoes: [{ local: "L3", problema: "ritmo", instrucao: "encurte" }],
    ...over,
  });

const CTX = JSON.stringify({ fatos: [], continuidade: [], repeticoes_recentes: [] });
const AUDITOR_LIMPO = JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } });
const AUDITOR_CONTRADIZ = JSON.stringify({
  contradicoes: [{ fato_estabelecido: "o farol é automatizado desde 1987", trecho_do_capitulo: "o faroleiro acendeu a lâmpada", gravidade: "bloqueante" }],
  conhecimento_indevido: [],
  pov_violado: { ha: false, detalhe: "" },
});

let dir: string;
let deps: DepsPipeline;
let provedor: ProvedorMock;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cascata-"));
  const disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  deps = {
    gravador: new Gravador({ persistencia: disco, projectId: "p1" }),
    persistencia: disco,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: { contrato, hash: "h", origem: "x" },
    perfil: { texto: "Voz seca. ".repeat(8), skillId: "teste", hash: "hp", validado: true },
    dirManuscrito: path.join(dir, "m"),
    projectId: "p1",
    idioma: "pt-BR",
    fundacao: { biblia: "Bíblia. ".repeat(8), mapaPersonagens: "[]", estrutura: [{ capitulo: 1, fio: "a", resumo_estrutural: "x" }] },
  } as DepsPipeline;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Enfileira um ciclo completo; `parecer` decide se haverá escalada. */
function enfileirarCiclo(parecer: string, auditor = AUDITOR_LIMPO) {
  provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
  provedor.enfileirar("contextualizador", CTX);
  provedor.enfileirar("escritor", prosa);
  provedor.enfileirar("revisor_literario", parecer);
  provedor.enfileirar("auditor_factual", auditor);
  provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(), prosa));
}

const chamadasDe = (papel: string) => provedor.chamadas.filter((c) => c.papel === papel).length;

describe("escalada só quando há o que decidir", () => {
  it("SEM gatilho, o modelo de decisão NÃO é chamado", async () => {
    // Reprovado intermediário, sem sinal: será corrigido de qualquer forma.
    enfileirarCiclo(parecerBase());
    // Segunda volta do micro-laço (o capítulo reprova e tenta de novo).
    provedor.enfileirar("escritor", prosa);
    provedor.enfileirar("revisor_literario", parecerBase());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(), prosa));
    await escreverCapitulo(deps, 1).catch(() => undefined);
    expect(chamadasDe("revisor_decisao")).toBe(0);
  });

  it("COM gatilho (d), o modelo de decisão é chamado exatamente uma vez", async () => {
    enfileirarCiclo(parecerBase({ verdict: "aprovado", correcoes: [] }));
    provedor.enfileirar("revisor_decisao", JSON.stringify({
      schema: "delta-decisao/v1", derrubar: [], acrescentar: [],
      veredito_sugerido: "aprovado", observacao: "eixos conferem com o texto",
    }));
    provedor.enfileirar("extrator_memoria", JSON.stringify({ entradas: [], divergencias: [] }));
    const r = await escreverCapitulo(deps, 1);
    expect(chamadasDe("revisor_decisao")).toBe(1);
    expect(r.status).toBe("aprovado");
  });

  it("pedido humano da triagem é adjudicado pela decisão e nunca pausa o autor", async () => {
    enfileirarCiclo(parecerBase({
      verdict: "necessita_decisao_humana",
      sinais: [{
        sinal: "fato_extra_nao_verificado_no_dossie",
        valor: "n/a",
        disposicao: "necessita_decisao_humana",
        evidencia: "o revisor literário levantou uma dúvida factual",
      }],
      correcoes: [],
    }));
    provedor.enfileirar("revisor_decisao", JSON.stringify({
      schema: "delta-decisao/v1", derrubar: [], acrescentar: [],
      veredito_sugerido: "aprovado", observacao: "a dúvida pertence ao auditor factual, não ao autor",
    }));
    provedor.enfileirar("extrator_memoria", JSON.stringify({ entradas: [], divergencias: [] }));

    const r = await escreverCapitulo(deps, 1);

    expect(r.status).toBe("aprovado");
    expect(r.status).not.toBe("necessita_decisao_humana");
    expect(r.problemas.join(" ")).not.toMatch(/decisão humana|anotação \(sem pausa\)/i);
    expect(chamadasDe("revisor_decisao")).toBe(1);
    expect(chamadasDe("auditor_factual")).toBe(1);
  });
});

describe("veredito_sugerido é SUGESTÃO — gate universal reprova por cima", () => {
  it("[DOD:R-02] delta sugerindo aprovado NÃO salva capítulo com contradição bloqueante", async () => {
    // A emenda: a decisão ajusta sinais e sugere veredito; contradição factual,
    // POV, conhecimento indevido e idioma decidem depois e por cima.
    enfileirarCiclo(parecerBase({ verdict: "aprovado", correcoes: [] }), AUDITOR_CONTRADIZ);
    provedor.enfileirar("revisor_decisao", JSON.stringify({
      schema: "delta-decisao/v1", derrubar: [], acrescentar: [],
      veredito_sugerido: "aprovado", observacao: "para mim está aprovado",
    }));
    // Voltas seguintes: o capítulo reprovou pelo gate e o laço tenta corrigir.
    // A decisão insiste em "aprovado" em todas — e a contradição continua de pé.
    for (let i = 0; i < 4; i++) {
      provedor.enfileirar("escritor", prosa);
      provedor.enfileirar("revisor_literario", parecerBase({ verdict: "aprovado", correcoes: [] }));
      provedor.enfileirar("auditor_factual", AUDITOR_CONTRADIZ);
      provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(), prosa));
      provedor.enfileirar("revisor_decisao", JSON.stringify({
        schema: "delta-decisao/v1", derrubar: [], acrescentar: [],
        veredito_sugerido: "aprovado", observacao: "continuo achando que está aprovado",
      }));
    }
    const r = await escreverCapitulo(deps, 1);
    // O que o sistema garante: o capítulo NÃO é aprovado, e o motivo é a
    // contradição — não a opinião da decisão. (O texto vai ao disco antes do
    // julgamento, por retenção; isso não é aprovação.)
    expect(r.status).not.toBe("aprovado");
    expect(JSON.stringify((r as { problemas?: string[] }).problemas ?? [])).toMatch(/contradição factual/);
  });
});

describe("MODELO_POR_PAPEL é conjunto FECHADO", () => {
  it("[DOD:R-03] as exceções são exatamente estas três", () => {
    // Acrescentar uma quarta sem justificar quebra aqui, de propósito.
    expect(Object.keys(MODELO_POR_PAPEL).sort()).toEqual(["auditor_factual", "extrator_memoria", "revisor_decisao"]);
  });

  it("a exceção vence a classe, e quem não é exceção cai no mapa", () => {
    const mapa = { raciocinio: "R", fatos: "F", prosa: "P", julgamento: "J" };
    expect(resolverModelo("revisor_decisao", mapa).modelo).toBe("claude-opus-5");
    expect(resolverModelo("auditor_factual", mapa).modelo).toBe("claude-sonnet-5");
    expect(resolverModelo("extrator_memoria", mapa).modelo).toBe("claude-sonnet-5");
    // Mesma classe do auditor, e permanece no mapa: só seleciona contexto já escrito.
    expect(resolverModelo("contextualizador", mapa).modelo).toBe("F");
    expect(resolverModelo("revisor_literario", mapa).modelo).toBe("J");
    expect(resolverModelo("escritor", mapa).modelo).toBe("P");
  });

  it("triagem e decisão são a mesma classe com modelos diferentes", () => {
    const mapa = { raciocinio: "R", fatos: "F", prosa: "P", julgamento: "J" };
    const t = resolverModelo("revisor_literario", mapa);
    const d = resolverModelo("revisor_decisao", mapa);
    expect(t.capacidade).toBe(d.capacidade);
    expect(t.modelo).not.toBe(d.modelo);
  });
});
