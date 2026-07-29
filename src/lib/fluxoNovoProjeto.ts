export type FaseNovoProjeto = "ideia" | "canario" | "entrevista";

export interface PlanoAposCriacao {
  fase: "entrevista";
  primeiroJob: "entrevistar";
}

/**
 * Um projeto novo começa pela entrevista, inclusive na Engine V2.
 *
 * A prova literária só pode existir depois que banco, worker, interface,
 * fundação e gates estiverem comprovados. Colocar `canario_voz` aqui criava
 * prosa antes de a própria engine estar pronta para julgá-la.
 */
export function planoAposCriacao(): PlanoAposCriacao {
  return {
    fase: "entrevista",
    primeiroJob: "entrevistar",
  };
}

export const ETAPAS_CRIACAO = [
  { id: "ideia", label: "Projeto e skill" },
  { id: "entrevista", label: "Entrevista" },
  { id: "fundacao", label: "Revisão e fundação" },
] as const;
