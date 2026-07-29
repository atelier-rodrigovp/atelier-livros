// Engine V2 — configuração de classes de capacidade (F3).
// A engine acopla-se a CLASSES, mas o release literário fixa o modelo concreto:
// trocar pesos no meio de um corpus invalida calibração, canários e voz.

import type { ClasseCapacidade, MapaModelos, Papel } from "./tipos.js";
import { CLASSE_POR_PAPEL } from "./tipos.js";

export const MODELOS_V2_FIXOS: Readonly<MapaModelos> = Object.freeze({
  // Raciocinio (arquiteto_enredo, arquiteto_cena, editor_estrutural): o que se
  // decide aqui e a arquitetura da cena, e um erro de estrutura nao se conserta
  // com revisao de frase — reescreve o capitulo. Sobe para opus.
  raciocinio: "claude-opus-5",
  // Fatos: piso barato para quem so SELECIONA contexto ja escrito
  // (contextualizador). Os dois papeis de fatos que ERRAM CARO —
  // auditor_factual e extrator_memoria — sobem para sonnet por MODELO_POR_PAPEL.
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
  // Julgamento: triagem barata. A 2a passada cara e o `revisor_decisao`, que
  // vem por MODELO_POR_PAPEL e so roda quando ha o que decidir.
  julgamento: "claude-sonnet-5",
});

/**
 * Retorna o mapa fixo do release. Variáveis antigas continuam sendo lidas apenas
 * para falhar com diagnóstico claro: um override divergente não pode trocar o
 * escritor ou o avaliador sem novo código, canários e certificado.
 */
export function mapaModelosDoAmbiente(env: NodeJS.ProcessEnv = process.env): MapaModelos {
  const variaveis: Record<keyof MapaModelos, string> = {
    raciocinio: "V2_MODEL_RACIOCINIO",
    fatos: "V2_MODEL_FATOS",
    prosa: "V2_MODEL_PROSA",
    julgamento: "V2_MODEL_JULGAMENTO",
  };
  for (const [classe, nome] of Object.entries(variaveis) as [keyof MapaModelos, string][]) {
    const configurado = env[nome]?.trim();
    if (configurado && configurado !== MODELOS_V2_FIXOS[classe]) {
      throw new Error(
        `${nome}=${configurado} diverge do release fixo (${MODELOS_V2_FIXOS[classe]}); ` +
        "mude o pin em código e refaça calibração/canários/certificação"
      );
    }
  }
  return { ...MODELOS_V2_FIXOS };
}

/**
 * EXCECOES ao mapa classe -> modelo. CONJUNTO FECHADO: cada entrada carrega a
 * razao de existir, e um teste afirma o conjunto exato — acrescentar uma quarta
 * excecao sem justificar quebra o teste, de proposito.
 *
 * Por que precisa existir: o mapa e por CLASSE, e tres papeis da mesma classe
 * precisam de modelos diferentes. Sem esta tabela, a cascata teria de ser
 * forcada dentro do enum de classes, que e o que o autor proibiu.
 */
export const MODELO_POR_PAPEL: Readonly<Partial<Record<Papel, string>>> = Object.freeze({
  // Cascata: a 2a passada julga o que a triagem (sonnet) nao viu ou viu demais.
  // Mesma classe "julgamento", modelo deliberadamente diferente da triagem.
  revisor_decisao: "claude-opus-5",
  // Auditoria factual erra caro: contradicao que passa vira furo no livro. Sobe
  // de haiku para sonnet, enquanto contextualizador — que so seleciona contexto
  // ja escrito — permanece em haiku.
  auditor_factual: "claude-sonnet-5",
  // Extrair o que a prosa APROVADA estabeleceu alimenta o ledger de promessas:
  // erro aqui contamina todos os capitulos seguintes.
  extrator_memoria: "claude-sonnet-5",
});

export function resolverModelo(papel: Papel, mapa: MapaModelos): { capacidade: ClasseCapacidade; modelo: string } {
  const capacidade = CLASSE_POR_PAPEL[papel];
  // Excecao por papel vence a classe; ausencia cai no mapa, como sempre.
  return { capacidade, modelo: MODELO_POR_PAPEL[papel] ?? mapa[capacidade] };
}
