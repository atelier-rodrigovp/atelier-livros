// REVIEW incremental — decide, por iteração de REVIEW, QUAIS capítulos são relidos
// em profundidade e quais têm a avaliação anterior carregada (não relidos).
//
// PORQUÊ: hoje toda iteração de REVIEW roda `book-bestseller-review` sobre o
// MANUSCRITO-MESTRE INTEIRO. Como a REESCRITA é cirúrgica (só as pendências), a
// iteração 2+ relê o livro todo para conferir 2-3 capítulos — o input escala com o
// tamanho do livro a cada iteração. Este módulo recorta o ESCOPO das iterações 2+.
//
// SALVAGUARDA (por que isto NÃO mascara regressão): o sinal PRIMÁRIO do escopo é a
// VERDADE DO DISCO — o conjunto de capítulos cujo conteúdo mudou desde a última
// review (diff de hash), NÃO a lista de pendências auto-relatada. Um capítulo fora
// das pendências que tenha regredido necessariamente MUDOU no disco → entra no
// escopo → é relido. Um capítulo fora do escopo é, por definição, byte-a-byte
// idêntico ao que já foi avaliado → não pode ter regredido em silêncio. A nota final
// continua sendo o veredito HOLÍSTICO do livro inteiro: os capítulos não relidos
// entram ancorados na nota da review anterior (texto inalterado = avaliação válida),
// os relidos entram com avaliação fresca. Não redefinimos o que a nota SIGNIFICA —
// só reduzimos quanta prosa é relida para chegar nela.
//
// Este módulo é PURO/determinístico (sem IO): recebe mapas de hash já lidos do disco
// e devolve o recorte. A mesma lógica é ESPELHADA em livro_runner.py
// (escopo_review_incremental / capitulos_alterados) — o runner Python é quem roda de
// fato; este módulo é a especificação testável (padrão já usado com maneirismo.ts).

export type EscopoReview = {
  /** true na iteração 1: varredura completa (acha os problemas iniciais). */
  livroInteiro: boolean;
  /** capítulos a RELER em profundidade nesta iteração (ordenado, sem repetição). */
  escopo: number[];
  /** capítulos NÃO relidos (avaliação da review anterior continua valendo). */
  carregados: number[];
};

/**
 * Capítulos cujo conteúdo mudou entre dois snapshots de hash (verdade do disco).
 * Um capítulo conta como alterado se o hash difere OU se surgiu/sumiu entre os
 * snapshots. As chaves dos snapshots são o número do capítulo como string.
 */
export function capitulosAlterados(
  antes: Record<string, string> | null | undefined,
  depois: Record<string, string> | null | undefined,
): number[] {
  const a = antes || {};
  const d = depois || {};
  const nums = new Set<number>();
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (a[k] !== d[k]) {
      const n = Number(k);
      if (Number.isInteger(n) && n > 0) nums.add(n);
    }
  }
  return [...nums].sort((x, y) => x - y);
}

/**
 * Escopo da iteração de REVIEW.
 * - Iteração 1: SEMPRE o livro inteiro (varredura completa é insubstituível para
 *   achar os problemas iniciais — isto não muda).
 * - Iteração 2+: (capítulos alterados no disco ∪ capítulos com pendência anterior)
 *   + os vizinhos imediatos (continuidade), recortado a [1, total].
 *
 * O disco é o sinal primário; as pendências são só reforço (re-conferir o que se
 * pediu para corrigir, mesmo que a REESCRITA não tenha mudado o arquivo). Se nada
 * mudou no disco e não há pendência, cai conservadoramente para o livro inteiro
 * (nunca sub-avalia).
 */
export function escopoReview(input: {
  iteracao: number;
  total: number;
  capitulosAlterados: number[];
  capitulosPendencias?: number[];
  vizinhanca?: number;
}): EscopoReview {
  const total = Math.max(0, Math.floor(input.total || 0));
  const todos = Array.from({ length: total }, (_, i) => i + 1);

  if (input.iteracao <= 1) {
    return { livroInteiro: true, escopo: todos, carregados: [] };
  }

  const viz = input.vizinhanca ?? 1;
  const semente = new Set<number>();
  const dentro = (c: number) => Number.isInteger(c) && c >= 1 && c <= total;
  for (const c of input.capitulosAlterados || []) if (dentro(c)) semente.add(c);
  for (const c of input.capitulosPendencias || []) if (dentro(c)) semente.add(c);

  if (semente.size === 0) {
    // Nada verificável mudou → conservador: livro inteiro (não arrisca sub-avaliar).
    return { livroInteiro: true, escopo: todos, carregados: [] };
  }

  const esc = new Set<number>();
  for (const c of semente) {
    for (let d = -viz; d <= viz; d++) {
      const v = c + d;
      if (dentro(v)) esc.add(v);
    }
  }
  const escopo = [...esc].sort((x, y) => x - y);
  const escSet = new Set(escopo);
  const carregados = todos.filter((c) => !escSet.has(c));
  return { livroInteiro: false, escopo, carregados };
}
