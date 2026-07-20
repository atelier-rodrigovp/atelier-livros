// Engine V2 — configuração de classes de capacidade (F3).
// A engine acopla-se a CLASSES, nunca a nomes de modelo. Os nomes concretos vêm do
// ambiente (ou de engine_configs no futuro) com defaults sensatos para o plano MAX.

import type { ClasseCapacidade, MapaModelos, Papel } from "./tipos.js";
import { CLASSE_POR_PAPEL } from "./tipos.js";

const DEFAULTS: MapaModelos = {
  raciocinio: "sonnet",
  fatos: "haiku",
  prosa: "opus",
  julgamento: "sonnet",
};

/** Lê o mapa classe→modelo do ambiente (V2_MODEL_<CLASSE>), com defaults. */
export function mapaModelosDoAmbiente(env: NodeJS.ProcessEnv = process.env): MapaModelos {
  return {
    raciocinio: env.V2_MODEL_RACIOCINIO || DEFAULTS.raciocinio,
    fatos: env.V2_MODEL_FATOS || DEFAULTS.fatos,
    prosa: env.V2_MODEL_PROSA || DEFAULTS.prosa,
    julgamento: env.V2_MODEL_JULGAMENTO || DEFAULTS.julgamento,
  };
}

export function resolverModelo(papel: Papel, mapa: MapaModelos): { capacidade: ClasseCapacidade; modelo: string } {
  const capacidade = CLASSE_POR_PAPEL[papel];
  return { capacidade, modelo: mapa[capacidade] };
}
