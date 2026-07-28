// Engine V2 — ledger de revelações (memória de longo alcance).
//
// Uma revelação é o que o LEITOR passa a saber. Quem declara é o arquiteto de
// cena, na ficha (`informacao_nova` + `revelacoes[]`); a entrada no ledger é
// DETERMINÍSTICA e acontece na aprovação do capítulo — nenhuma chamada de modelo
// nova, custo zero de cota.
//
// Tamanho (decisão de spec, §1): o pacote entregue ao arquiteto degrada para uma
// JANELA acima de TETO_LEDGER_NO_PACOTE entradas, e registra o que omitiu. O GATE
// nunca degrada: roda sempre contra o ledger inteiro, porque gate é código e não
// tem limite de contexto. Prevenção cabe no pacote; garantia não depende dele.
//
// Adendo do autor ao §1: quando o gate reprova por uma entrada FORA da janela, a
// mensagem de erro carrega a entrada literal — `executarPapel` reinjeta essa
// mensagem no prompt do retry (papeis.ts), então o arquiteto nunca retenta cego.

import type { RevelacaoLedger, ResultadoGate, SceneSpec } from "./tipos.js";

export const MAX_REVELACOES_EXTRAS = 2;
export const MAX_PALAVRAS_REVELACAO = 25;
/** Acima disto o pacote entrega janela em vez do ledger inteiro (o gate não degrada). */
export const TETO_LEDGER_NO_PACOTE = 120;
/** Entradas recentes sempre presentes na janela. */
export const JANELA_RECENTES = 40;
/** Entradas mais similares à ficha atual, acrescidas à janela. */
export const JANELA_SIMILARES = 20;

// Limiar do casamento (spec §6), CALIBRADO em dado real de O Farol Cego
// (engine_scene_specs do projeto 5ac9d614; ver ledger.test.ts § "calibração").
//
// O que a medição mostrou, e que delimita honestamente este gate:
//   - revelações DISTINTAS do mesmo livro (cap 1 × cap 2): Jaccard 0,000 (9 pares);
//   - mesma revelação REORDENADA: ≈0,70;
//   - mesma revelação com verbo trocado por sinônimo: 0,50;
//   - mesma revelação REESCRITA a fundo (as 4 versões da ficha do cap 1, produzidas
//     pelo próprio loop de correção): 0,043–0,158.
//
// Ou seja: reescrita profunda tem overlap lexical no chão do ruído — NENHUM limiar
// lexical a separa de uma revelação nova. Este gate é, por construção, o detector
// do caso LÉXICO (repetição literal, reordenada ou com sinônimo trocado), e 0,45
// captura esses com margem de 0,45 sobre o maior negativo medido.
// A repetição SEMÂNTICA (mesma informação, texto refeito) é responsabilidade do
// revisor literário, que passa a receber o ledger e dispõe o sinal `revelacao_ja_no_ledger`
// — mesma divisão de trabalho que a engine já usa: detector para o inequívoco,
// julgamento do revisor para o semântico (lição do adendo de transparência).
export const LIMIAR_JACCARD = 0.45;
export const TAMANHO_SHINGLE = 8;

// Stopwords PT-BR: palavras sem carga informativa que inflam o Jaccard e fariam
// duas revelações distintas parecerem a mesma.
const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "por", "para", "pra", "com", "sem", "sob", "sobre",
  "e", "ou", "mas", "que", "se", "ao", "aos", "à", "às", "pelo", "pela", "pelos", "pelas",
  "ele", "ela", "eles", "elas", "seu", "sua", "seus", "suas", "dele", "dela",
  "este", "esta", "esse", "essa", "isso", "isto", "aquele", "aquela", "aquilo",
  "ser", "e_", "foi", "era", "sao", "eh", "ter", "tem", "tinha", "ja", "nao",
  "quando", "onde", "como", "porque", "entao", "ainda", "mais", "muito", "so",
]);

/** minúscula, sem acento, sem pontuação, sem stopword. */
export function tokenizar(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // Letra solta é ruído; DÍGITO solto não é — "cais 3" e "cais 1" são revelações
    // diferentes, e descartá-los fazia as duas casarem com similaridade 1,00.
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOPWORDS.has(t));
}

function bigramas(tokens: string[]): Set<string> {
  const out = new Set<string>();
  // Unigramas entram junto: revelações curtas (3–5 tokens úteis) geram poucos
  // bigramas, e só com bigramas o Jaccard fica instável em enunciado curto.
  for (const t of tokens) out.add(t);
  for (let i = 0; i + 1 < tokens.length; i++) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function shingles(tokens: string[], n = TAMANHO_SHINGLE): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

/** Um enunciado contém uma sequência de 8 tokens do outro (cópia quase literal). */
function contencaoShingle(a: string[], b: string[]): boolean {
  const sa = shingles(a);
  if (sa.size === 0) return false;
  const sb = shingles(b);
  for (const s of sa) if (sb.has(s)) return true;
  return false;
}

export interface Similaridade {
  jaccard: number;
  contencao: boolean;
  casa: boolean;
}

function numeros(tokens: string[]): Set<string> {
  return new Set(tokens.filter((t) => /^\d+$/.test(t)));
}

export function compararEnunciados(a: string, b: string): Similaridade {
  const ta = tokenizar(a);
  const tb = tokenizar(b);
  const j = jaccard(bigramas(ta), bigramas(tb));
  const c = contencaoShingle(ta, tb);
  // Números são traço DURO neste domínio (cais 3, coordenada, ano, hora): dois
  // enunciados que citam números e não têm nenhum em comum falam de coisas
  // diferentes, por mais parecidos que sejam no resto. Sem esta regra,
  // "o corpo estava no cais 3" e "…no cais 1" casavam a 0,56 — falso positivo, e
  // detector com falso positivo não pode bloquear.
  // Assimetria deliberada: se um lado não cita número, a regra não se aplica
  // (a paráfrase pode ter omitido o número, e aí o Jaccard decide).
  const na = numeros(ta);
  const nb = numeros(tb);
  if (na.size > 0 && nb.size > 0) {
    let comum = false;
    for (const n of na) if (nb.has(n)) comum = true;
    if (!comum) return { jaccard: j, contencao: c, casa: false };
  }
  return { jaccard: j, contencao: c, casa: j >= LIMIAR_JACCARD || c };
}

// ---------------------------------------------------------------------------
// Derivação: ficha → entradas do ledger
// ---------------------------------------------------------------------------

function truncarPalavras(s: string, max: number): string {
  const p = s.trim().split(/\s+/).filter(Boolean);
  return p.length <= max ? p.join(" ") : `${p.slice(0, max).join(" ")}…`;
}

/**
 * Revelações declaradas por uma ficha: `informacao_nova` (principal, sempre) +
 * `revelacoes[]` (≤2 extras). Vazias e duplicatas internas são descartadas.
 */
export function revelacoesDaFicha(ficha: SceneSpec): string[] {
  const brutas = [ficha.informacao_nova, ...(ficha.revelacoes ?? []).slice(0, MAX_REVELACOES_EXTRAS)];
  const out: string[] = [];
  for (const r of brutas) {
    if (typeof r !== "string" || !r.trim()) continue;
    const texto = truncarPalavras(r, MAX_PALAVRAS_REVELACAO);
    // Duplicata dentro da própria ficha não vira duas entradas.
    if (out.some((j) => compararEnunciados(j, texto).casa)) continue;
    out.push(texto);
  }
  return out;
}

/** Entradas de ledger de um capítulo, com id estável e citável ("R07.1"). */
export function entradasDaFicha(capitulo: number, ficha: SceneSpec): RevelacaoLedger[] {
  return revelacoesDaFicha(ficha).map((enunciado, i) => ({
    id: `R${String(capitulo).padStart(2, "0")}.${i + 1}`,
    capitulo,
    enunciado,
  }));
}

/**
 * Funde as entradas de um capítulo no ledger, SUBSTITUINDO as entradas antigas
 * do mesmo capítulo. Idempotente: reaprovar (reescrita, meta-nota) não duplica.
 */
export function fundirNoLedger(ledger: RevelacaoLedger[], novas: RevelacaoLedger[]): RevelacaoLedger[] {
  if (novas.length === 0) return ledger;
  const caps = new Set(novas.map((n) => n.capitulo));
  return [...ledger.filter((r) => !caps.has(r.capitulo)), ...novas].sort(
    (a, b) => a.capitulo - b.capitulo || a.id.localeCompare(b.id)
  );
}

/**
 * Reconstrói o ledger a partir das fichas já persistidas — para livros começados
 * ANTES desta versão (O Farol Cego, os canários), que têm capítulos aprovados e
 * nenhum ledger. É derivação pura das mesmas fichas que a aprovação usaria, então
 * o resultado é idêntico ao que teria sido gravado na época. Só capítulos
 * aprovados entram: ficha de capítulo reprovado não revelou nada ao leitor.
 */
export function reconstruirLedger(
  fichas: { capitulo: number; ficha: SceneSpec }[],
  aprovado: (capitulo: number) => boolean
): RevelacaoLedger[] {
  let ledger: RevelacaoLedger[] = [];
  for (const { capitulo, ficha } of [...fichas].sort((a, b) => a.capitulo - b.capitulo)) {
    if (!aprovado(capitulo)) continue;
    ledger = fundirNoLedger(ledger, entradasDaFicha(capitulo, ficha));
  }
  return ledger;
}

// ---------------------------------------------------------------------------
// Gate: revelação repetida
// ---------------------------------------------------------------------------

export interface ColisaoRevelacao {
  enunciado: string;
  anterior: RevelacaoLedger;
  similaridade: Similaridade;
}

/**
 * Procura, no ledger INTEIRO, uma revelação anterior que já diga o mesmo.
 * Só considera capítulos ANTERIORES ao da ficha (reaprovar o próprio capítulo
 * não pode colidir com a versão anterior dele mesmo).
 */
export function colisoesDeRevelacao(
  capitulo: number,
  ficha: SceneSpec,
  ledger: RevelacaoLedger[]
): ColisaoRevelacao[] {
  const anteriores = ledger.filter((r) => r.capitulo < capitulo);
  const out: ColisaoRevelacao[] = [];
  for (const enunciado of revelacoesDaFicha(ficha)) {
    for (const anterior of anteriores) {
      const s = compararEnunciados(enunciado, anterior.enunciado);
      if (s.casa) {
        out.push({ enunciado, anterior, similaridade: s });
        break; // uma colisão por revelação basta para reprovar
      }
    }
  }
  return out;
}

/**
 * Evidência citável de uma colisão. É ESTE texto que vai para a mensagem de erro
 * do retry (adendo §1): carrega o enunciado anterior LITERAL, mesmo que a entrada
 * esteja fora da janela que o arquiteto viu.
 */
export function evidenciaColisao(c: ColisaoRevelacao): string {
  return (
    `"${c.enunciado}" já foi revelada no capítulo ${c.anterior.capitulo} ` +
    `(${c.anterior.id}: "${c.anterior.enunciado}") — similaridade ${c.similaridade.jaccard.toFixed(2)}` +
    `${c.similaridade.contencao ? ", trecho quase literal" : ""}`
  );
}

export function gateRevelacaoRepetida(
  capitulo: number,
  ficha: SceneSpec,
  ledger: RevelacaoLedger[]
): ResultadoGate {
  const colisoes = colisoesDeRevelacao(capitulo, ficha, ledger);
  return {
    gate: "revelacao_repetida",
    passou: colisoes.length === 0,
    evidencia: colisoes.length ? colisoes.map(evidenciaColisao).join(" · ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Entrega no pacote: ledger inteiro, ou janela + registro do que foi omitido
// ---------------------------------------------------------------------------

export interface LedgerRenderizado {
  texto: string;
  /** Entradas deixadas de fora da janela (0 quando o ledger inteiro coube). */
  omitidas: number;
  /** true = degradou para janela; a UI/log registra (nenhum corte silencioso). */
  degradado: boolean;
}

/**
 * Renderiza o ledger para o pacote. Até TETO_LEDGER_NO_PACOTE entradas vai
 * inteiro. Acima disso: as JANELA_RECENTES últimas + as JANELA_SIMILARES mais
 * próximas da ficha em curso (é onde o risco de repetir se concentra).
 */
export function renderizarLedger(
  ledger: RevelacaoLedger[],
  fichaAtual?: SceneSpec
): LedgerRenderizado {
  const linha = (r: RevelacaoLedger) => `- [${r.id} · cap ${r.capitulo}] ${r.enunciado}`;
  if (ledger.length <= TETO_LEDGER_NO_PACOTE) {
    return {
      texto: ledger.length ? ledger.map(linha).join("\n") : "(nenhuma revelação registrada ainda)",
      omitidas: 0,
      degradado: false,
    };
  }
  const ordenado = [...ledger].sort((a, b) => a.capitulo - b.capitulo || a.id.localeCompare(b.id));
  const recentes = ordenado.slice(-JANELA_RECENTES);
  const escolhidas = new Set(recentes.map((r) => r.id));
  if (fichaAtual) {
    const alvo = revelacoesDaFicha(fichaAtual).join(" ");
    const candidatos = ordenado
      .filter((r) => !escolhidas.has(r.id))
      .map((r) => ({ r, s: compararEnunciados(alvo, r.enunciado).jaccard }))
      .sort((a, b) => b.s - a.s)
      .slice(0, JANELA_SIMILARES);
    for (const c of candidatos) escolhidas.add(c.r.id);
  }
  const janela = ordenado.filter((r) => escolhidas.has(r.id));
  return {
    texto: [
      janela.map(linha).join("\n"),
      "",
      `(janela: ${janela.length} de ${ledger.length} revelações; ${ledger.length - janela.length} omitidas por tamanho. ` +
        `O gate de repetição roda contra o ledger INTEIRO — se você planejar algo já revelado fora desta janela, ` +
        `a reprovação citará a entrada exata.)`,
    ].join("\n"),
    omitidas: ledger.length - janela.length,
    degradado: true,
  };
}
