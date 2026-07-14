// Contrato de progresso S9/1.6 — escada de correção econômica (sem enfraquecer gate).
// Decisão do Portão 1: o degrau 1 DETERMINÍSTICO só toca o mecanicamente seguro
// (meta-texto, espaçamento) — NUNCA reescreve prosa. Muleta lexical ("coisa") e
// problemas narrativos começam no degrau 2 (editor focado + recontagem). Este
// módulo implementa o degrau 1 e MEDE quanto cada degrau resolve (dado que decide
// se um dia vale mexer no runner). Os degraus 2–6 são o contrato (delegados).
import { sanitizarCapitulo } from "./sanitize.js";

export type CategoriaBlocker = "mecanico_seguro" | "lexical_prosa" | "narrativo";

// Degrau em que cada categoria PODE começar a ser resolvida.
export const DEGRAU_MINIMO: Record<CategoriaBlocker, number> = {
  mecanico_seguro: 1, // determinístico seguro
  lexical_prosa: 2, // editor focado + recontagem (nunca degrau 1)
  narrativo: 5, // revisor completo (impacto narrativo)
};

// Classifica um blocker pela sua categoria a partir do code e/ou mensagem do gate.
export function classificarBlocker(codeOuMsg: string): CategoriaBlocker {
  const s = codeOuMsg.toLowerCase();
  if (/(meta-?texto|meta_text|espac|spacing|whitespace|espaç)/.test(s)) return "mecanico_seguro";
  if (/(muleta|coisa|\balgo\b|lexico|léxico|lexical)/.test(s)) return "lexical_prosa";
  return "narrativo";
}

// Degrau 1 — correção determinística SEGURA. Remove meta-texto e normaliza
// espaçamento. NÃO altera palavras da prosa (preserva sentido e voz por construção).
export function degrau1Deterministico(texto: string): { texto: string; mudancas: string[] } {
  const mudancas: string[] = [];
  // (a) meta-texto (comentários, fences, chatter) — reusa o sanitizador oficial.
  const san = sanitizarCapitulo(texto);
  let out = san.texto;
  if (san.removidos.length) mudancas.push(`meta-texto: ${san.removidos.join("; ")}`);
  // (b) espaçamento mecânico: espaços/tabs à direita, runs de espaço, 3+ linhas em branco.
  const antes = out;
  out = out
    .replace(/[ \t]+$/gm, "") // trailing whitespace
    .replace(/[ \t]{2,}/g, " ") // runs de espaço/tab → 1 (dentro da linha)
    .replace(/\n{3,}/g, "\n\n"); // 3+ quebras → parágrafo único
  if (out !== antes) mudancas.push("espaçamento normalizado");
  return { texto: out, mudancas };
}

export interface BlockerLite {
  code: string;
  message?: string;
}
export interface RelatorioEscada {
  blockersAntes: number;
  categorias: Record<CategoriaBlocker, number>;
  degrau1: { aplicou: string[]; resolvidos: number; blockersDepois: number };
  restantes: { code: string; categoria: CategoriaBlocker; degrauMinimo: number }[];
  proximoDegrau: number | null; // menor degrau que ainda precisa rodar (>=2), ou null se limpo
  recomendacao: string;
}

// Mede a escada: aplica o degrau 1 e RECONTA (via `recount` injetado — o mesmo
// detector do gate) para dizer, honestamente, quanto o degrau 1 resolveu e o que
// sobra para o degrau 2+. Não aprova nada: só mede e classifica.
export function medirEscada(
  texto: string,
  blockersAntes: BlockerLite[],
  recount: (texto: string) => BlockerLite[]
): RelatorioEscada {
  const categorias: Record<CategoriaBlocker, number> = { mecanico_seguro: 0, lexical_prosa: 0, narrativo: 0 };
  for (const b of blockersAntes) categorias[classificarBlocker(b.code + " " + (b.message ?? ""))]++;

  const d1 = degrau1Deterministico(texto);
  const blockersDepois = recount(d1.texto);
  const resolvidos = Math.max(0, blockersAntes.length - blockersDepois.length);

  const restantes = blockersDepois.map((b) => {
    const categoria = classificarBlocker(b.code + " " + (b.message ?? ""));
    return { code: b.code, categoria, degrauMinimo: DEGRAU_MINIMO[categoria] };
  });
  const proximoDegrau = restantes.length ? Math.min(...restantes.map((r) => r.degrauMinimo)) : null;

  const recomendacao = !restantes.length
    ? "Degrau 1 (determinístico) resolveu tudo — nenhum custo de LLM."
    : proximoDegrau === 2
      ? `Degrau 1 não resolve muleta lexical em prosa (${restantes.filter((r) => r.categoria === "lexical_prosa").length}) — escalar para o degrau 2 (editor focado + recontagem).`
      : `Restam ${restantes.length} blocker(s) narrativo(s) — escalar para o degrau ${proximoDegrau} (revisor completo).`;

  return { blockersAntes: blockersAntes.length, categorias, degrau1: { aplicou: d1.mudancas, resolvidos, blockersDepois: blockersDepois.length }, restantes, proximoDegrau, recomendacao };
}
