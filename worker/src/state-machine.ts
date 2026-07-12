export type EditionStatus = "pendente" | "escrevendo" | "traduzindo" | "revisao" | "pronto";

export function advanceEditionStatus(current: EditionStatus, requested: EditionStatus, viaPublicationGate = false): EditionStatus {
  if (requested === "pronto" && !viaPublicationGate) throw new Error("status pronto só pode ser promovido pelo gate transacional de publicação");
  if (current === "pronto") return current;
  const rank: Record<EditionStatus, number> = { pendente: 0, escrevendo: 1, traduzindo: 1, revisao: 2, pronto: 3 };
  return rank[requested] > rank[current] ? requested : current;
}
