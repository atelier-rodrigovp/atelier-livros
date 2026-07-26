// Engine V2 — configuração de classes de capacidade (F3).
// A engine acopla-se a CLASSES, mas o release literário fixa o modelo concreto:
// trocar pesos no meio de um corpus invalida calibração, canários e voz.

import type { ClasseCapacidade, MapaModelos, Papel } from "./tipos.js";
import { CLASSE_POR_PAPEL } from "./tipos.js";

export const MODELOS_V2_FIXOS: Readonly<MapaModelos> = Object.freeze({
  raciocinio: "claude-sonnet-5",
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
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

export function resolverModelo(papel: Papel, mapa: MapaModelos): { capacidade: ClasseCapacidade; modelo: string } {
  const capacidade = CLASSE_POR_PAPEL[papel];
  return { capacidade, modelo: mapa[capacidade] };
}
