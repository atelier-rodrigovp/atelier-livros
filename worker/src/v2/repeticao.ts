// Engine V2 — repetição em TRÊS camadas (fatia I).
//
// O que existia: um gate de repetição quase-literal que comparava o capítulo
// atual com o anterior. Isso pega copiar-e-colar entre vizinhos e mais nada. A
// mesma revelação parafraseada dez capítulos depois passava; o mesmo maneirismo
// em vinte capítulos passava.
//
// As três camadas têm políticas DIFERENTES de propósito:
//
// 1. LITERAL — determinística, contra todos os capítulos aprovados, limiar alto.
//    BLOQUEIA: texto quase idêntico à distância não tem defesa editorial.
// 2. SEMÂNTICA — mesma revelação/beat reapresentado com outras palavras. Cruza
//    ledger e memória da prosa. BLOQUEIA quando a equivalência está comprovada
//    por evidência nos DOIS pontos.
// 3. MANEIRISMO — padrão retórico recorrente ao longo do livro. SINAL
//    ACUMULATIVO. Só bloqueia com limiar calibrado por humano ou decisão humana
//    explícita — detector de estilo sem calibração reprova voz autoral legítima,
//    e essa é a lição permanente da auditoria de estilo deste repositório.

import type { RevelacaoLedger } from "./tipos.js";
import type { EntradaMemoria } from "./memoria-prosa.js";

// ---------------------------------------------------------------------------
// Camada 1 — repetição LITERAL contra todos os capítulos
// ---------------------------------------------------------------------------

/** Frases longas o bastante para que a coincidência não seja acidente. */
const MIN_PALAVRAS_FRASE = 8;
/** Jaccard de shingles acima disso = quase-literal. Alto de propósito. */
export const LIMIAR_LITERAL = 0.72;
const TAMANHO_SHINGLE = 4;

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function frasesDe(texto: string): string[] {
  return texto
    .split(/\n|(?<=[.!?…])\s+/)
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith("#"))
    .filter((f) => normalizar(f).split(" ").length >= MIN_PALAVRAS_FRASE);
}

function shingles(t: string): Set<string> {
  const p = normalizar(t).split(" ").filter(Boolean);
  const s = new Set<string>();
  for (let i = 0; i + TAMANHO_SHINGLE <= p.length; i++) s.add(p.slice(i, i + TAMANHO_SHINGLE).join(" "));
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface AchadoLiteral {
  capituloAnterior: number;
  trechoAtual: string;
  trechoAnterior: string;
  similaridade: number;
}

/**
 * Compara contra TODOS os capítulos aprovados, não só o anterior.
 *
 * Custo controlado por índice invertido de shingles: só entram na comparação
 * cara os pares que compartilham ao menos um shingle. Sem isso, 40 capítulos ×
 * 40 capítulos × centenas de frases seria proibitivo.
 */
export function detectarRepeticaoLiteral(
  textoAtual: string,
  anteriores: { numero: number; texto: string }[],
  limiar = LIMIAR_LITERAL
): AchadoLiteral[] {
  const frasesAtuais = frasesDe(textoAtual).map((f) => ({ f, sh: shingles(f) }));
  if (!frasesAtuais.length) return [];

  // Índice: shingle → (capítulo, índice da frase)
  const indice = new Map<string, { cap: number; i: number }[]>();
  const frasesAnteriores: { cap: number; f: string; sh: Set<string> }[] = [];
  for (const a of anteriores) {
    for (const f of frasesDe(a.texto)) {
      const sh = shingles(f);
      const i = frasesAnteriores.length;
      frasesAnteriores.push({ cap: a.numero, f, sh });
      for (const s of sh) {
        const lista = indice.get(s) ?? [];
        lista.push({ cap: a.numero, i });
        indice.set(s, lista);
      }
    }
  }

  const achados: AchadoLiteral[] = [];
  for (const atual of frasesAtuais) {
    const candidatos = new Set<number>();
    for (const s of atual.sh) for (const c of indice.get(s) ?? []) candidatos.add(c.i);
    for (const i of candidatos) {
      const ant = frasesAnteriores[i];
      const sim = jaccard(atual.sh, ant.sh);
      if (sim >= limiar) {
        achados.push({
          capituloAnterior: ant.cap,
          trechoAtual: atual.f,
          trechoAnterior: ant.f,
          similaridade: Number(sim.toFixed(3)),
        });
      }
    }
  }
  return achados.sort((a, b) => b.similaridade - a.similaridade);
}

// ---------------------------------------------------------------------------
// Camada 2 — repetição SEMÂNTICA (mesma revelação, outras palavras)
// ---------------------------------------------------------------------------

export const LIMIAR_SEMANTICO = 0.5;

function tokensConteudo(t: string): Set<string> {
  const vazias = new Set([
    "que", "com", "por", "para", "uma", "dos", "das", "nas", "nos", "ele", "ela", "seu", "sua",
    "mas", "como", "quando", "porque", "sobre", "entre", "ainda", "depois", "antes", "the", "and",
  ]);
  return new Set(normalizar(t).split(" ").filter((x) => x.length > 3 && !vazias.has(x)));
}

/**
 * Localiza no texto atual a frase que melhor sustenta o enunciado da ficha.
 * Sem qualquer sobreposição de conteúdo devolve vazio: ausência de evidência
 * nunca pode virar bloqueio semântico.
 */
export function localizarTrechoSemantico(texto: string, enunciado: string): string {
  const alvo = tokensConteudo(enunciado);
  if (!alvo.size) return "";
  let melhor = "";
  let maior = 0;
  for (const frase of frasesDe(texto)) {
    const similaridade = jaccard(alvo, tokensConteudo(frase));
    if (similaridade > maior) {
      melhor = frase;
      maior = similaridade;
    }
  }
  return maior > 0 ? melhor.slice(0, 240) : "";
}

export interface AchadoSemantico {
  capituloAnterior: number;
  /** O que está sendo reapresentado. */
  enunciadoAnterior: string;
  enunciadoAtual: string;
  /** Evidência nos DOIS pontos — sem isso não bloqueia. */
  trechoAnterior: string;
  trechoAtual: string;
  similaridade: number;
}

/**
 * A mesma informação entregue de novo como se fosse nova. Cruza o que o LEDGER
 * registrou (plano) com o que a MEMÓRIA DA PROSA registrou (página).
 *
 * Só entra como achado quando há evidência LOCALIZÁVEL dos dois lados — a regra
 * do repositório: afirmação sem trecho não sustenta bloqueio.
 */
export function detectarRepeticaoSemantica(entrada: {
  capitulo: number;
  /** O que este capítulo declara entregar de novo. */
  novoEnunciado: string;
  /** Trecho do capítulo atual que entrega. */
  trechoAtual: string;
  ledger: RevelacaoLedger[];
  memoria: EntradaMemoria[];
  limiar?: number;
}): AchadoSemantico[] {
  const limiar = entrada.limiar ?? LIMIAR_SEMANTICO;
  const alvo = tokensConteudo(entrada.novoEnunciado);
  if (!alvo.size) return [];
  const achados: AchadoSemantico[] = [];

  for (const r of entrada.ledger) {
    if (r.capitulo >= entrada.capitulo) continue;
    const sim = jaccard(alvo, tokensConteudo(r.enunciado));
    if (sim < limiar) continue;
    // O ledger guarda enunciado, não trecho: a evidência do lado antigo vem da
    // memória da prosa daquele capítulo, quando existe.
    const daMemoria = entrada.memoria.find(
      (m) => m.capitulo === r.capitulo && jaccard(tokensConteudo(m.enunciado), alvo) >= limiar
    );
    achados.push({
      capituloAnterior: r.capitulo,
      enunciadoAnterior: r.enunciado,
      enunciadoAtual: entrada.novoEnunciado,
      trechoAnterior: daMemoria?.trecho ?? "",
      trechoAtual: entrada.trechoAtual,
      similaridade: Number(sim.toFixed(3)),
    });
  }

  for (const m of entrada.memoria) {
    if (m.capitulo >= entrada.capitulo) continue;
    if (m.tipo !== "revelacao" && m.tipo !== "fato") continue;
    const sim = jaccard(alvo, tokensConteudo(m.enunciado));
    if (sim < limiar) continue;
    if (achados.some((a) => a.capituloAnterior === m.capitulo)) continue;
    achados.push({
      capituloAnterior: m.capitulo,
      enunciadoAnterior: m.enunciado,
      enunciadoAtual: entrada.novoEnunciado,
      trechoAnterior: m.trecho,
      trechoAtual: entrada.trechoAtual,
      similaridade: Number(sim.toFixed(3)),
    });
  }

  return achados.sort((a, b) => b.similaridade - a.similaridade);
}

/** Só bloqueia com evidência dos DOIS lados. Sem isso, é sinal para o revisor. */
export function repeticaoSemanticaBloqueia(a: AchadoSemantico): boolean {
  return Boolean(a.trechoAnterior?.trim() && a.trechoAtual?.trim());
}

// ---------------------------------------------------------------------------
// Camada 3 — MANEIRISMO ao longo do livro (sinal acumulativo)
// ---------------------------------------------------------------------------

export interface PadraoManeirismo {
  id: string;
  descricao: string;
  detectar: (texto: string) => string[];
}

/** Padrões medidos ao longo do livro. Cada um devolve as ocorrências citáveis. */
export const PADROES_MANEIRISMO: PadraoManeirismo[] = [
  {
    id: "nao_era_a_era_b",
    descricao: '"não era A, era B" e equivalentes',
    detectar: (t) => [...t.matchAll(/[^.!?\n]*\bn[ãa]o era\b[^.!?\n]*\bera\b[^.!?\n]*/gi)].map((m) => m[0].trim()),
  },
  {
    id: "corpo_antes_da_vontade",
    descricao: "o corpo reage antes da vontade",
    detectar: (t) =>
      [...t.matchAll(/[^.!?\n]*\b(as m[ãa]os|o corpo|os p[ée]s|os dedos|a garganta|o peito)\b[^.!?\n]*\b(antes que|antes de ela|antes de ele|sem que)\b[^.!?\n]*/gi)].map((m) => m[0].trim()),
  },
  {
    id: "contagem_de_segundos",
    descricao: "contagem de segundos",
    detectar: (t) => [...t.matchAll(/[^.!?\n]*\b(contou|contando|passaram-se|levou)\s+\w*\s*segundos?\b[^.!?\n]*/gi)].map((m) => m[0].trim()),
  },
  {
    id: "fecho_com_reticencias",
    descricao: "mesma cadência de encerramento",
    detectar: (t) => {
      const ultimas = t.trim().split(/\n{2,}/).slice(-1)[0] ?? "";
      return /[.!?]\s*$/.test(ultimas) && /\b(e (ent[ãa]o|foi (a[ií]|assim))|nada mais|s[óo] isso)\b\.?\s*$/i.test(ultimas)
        ? [ultimas.slice(-90)]
        : [];
    },
  },
  {
    id: "aforismo_de_fecho",
    descricao: "aforismo/máxima recorrente",
    detectar: (t) =>
      [...t.matchAll(/[^.!?\n]*\b(sempre|nunca|toda|todo|ningu[ée]m)\b[^.!?\n]*\b([ée]|era|s[ãa]o|eram)\b[^.!?\n]*/gi)]
        .map((m) => m[0].trim())
        .filter((f) => f.split(/\s+/).length <= 14),
  },
];

export interface OcorrenciaManeirismo {
  capitulo: number;
  trecho: string;
}

export interface SinalManeirismoLivro {
  padrao: string;
  descricao: string;
  /** Em quantos capítulos DISTINTOS o padrão aparece. */
  capitulos: number;
  total: number;
  ocorrencias: OcorrenciaManeirismo[];
}

/** Mede os padrões ao longo do livro inteiro. Nunca bloqueia por si. */
export function medirManeirismosDoLivro(
  capitulos: { numero: number; texto: string }[],
  padroes = PADROES_MANEIRISMO
): SinalManeirismoLivro[] {
  const out: SinalManeirismoLivro[] = [];
  for (const p of padroes) {
    const ocorrencias: OcorrenciaManeirismo[] = [];
    for (const c of capitulos) {
      for (const trecho of p.detectar(c.texto)) ocorrencias.push({ capitulo: c.numero, trecho: trecho.slice(0, 160) });
    }
    if (!ocorrencias.length) continue;
    out.push({
      padrao: p.id,
      descricao: p.descricao,
      capitulos: new Set(ocorrencias.map((o) => o.capitulo)).size,
      total: ocorrencias.length,
      ocorrencias: ocorrencias.slice(0, 12),
    });
  }
  return out.sort((a, b) => b.capitulos - a.capitulos);
}

/** Em quantos capítulos um padrão precisa aparecer para virar sinal acumulativo. */
export const CAPITULOS_PARA_SINAL = 5;

export interface PoliticaManeirismo {
  /** Padrões com limiar congelado no contrato versionado e auditado pelo laboratório. */
  calibrados: Record<string, { limiarCapitulos: number; corpus_hash: string }>;
  /** Exceções de voz autoral: o autor aceitou este padrão nesta obra. */
  excecoesDoAutor: { padrao: string; justificativa: string; em: string }[];
}

export type DecisaoManeirismo =
  | { acao: "ignorar" }
  | { acao: "sinalizar"; motivo: string }
  | { acao: "bloquear"; motivo: string };

/**
 * Política da camada 3. O default é SINALIZAR — bloquear exige limiar calibrado
 * por humano. Um detector de estilo sem calibração reprova a voz do autor.
 */
export function decidirManeirismo(
  sinal: SinalManeirismoLivro,
  politica: PoliticaManeirismo
): DecisaoManeirismo {
  const excecao = politica.excecoesDoAutor.find((e) => e.padrao === sinal.padrao);
  if (excecao) {
    return { acao: "ignorar" };
  }
  if (sinal.capitulos < CAPITULOS_PARA_SINAL) return { acao: "ignorar" };
  const calibrado = politica.calibrados[sinal.padrao];
  if (calibrado && sinal.capitulos >= calibrado.limiarCapitulos) {
    return {
      acao: "bloquear",
      motivo: `"${sinal.descricao}" em ${sinal.capitulos} capítulos (limiar calibrado: ${calibrado.limiarCapitulos}, corpus ${calibrado.corpus_hash.slice(0, 12)})`,
    };
  }
  return {
    acao: "sinalizar",
    motivo: `"${sinal.descricao}" em ${sinal.capitulos} capítulos (${sinal.total} ocorrências) — sinal acumulativo, sem limiar calibrado`,
  };
}

/** Comparação ENTRE LIVROS do mesmo autor: diagnóstico, nunca bloqueio. */
export function diagnosticoEntreLivros(
  livroAtual: SinalManeirismoLivro[],
  outrosLivros: { titulo: string; sinais: SinalManeirismoLivro[] }[]
): { padrao: string; descricao: string; livros: string[] }[] {
  const out: { padrao: string; descricao: string; livros: string[] }[] = [];
  for (const s of livroAtual) {
    const tambemEm = outrosLivros
      .filter((l) => l.sinais.some((x) => x.padrao === s.padrao && x.capitulos >= CAPITULOS_PARA_SINAL))
      .map((l) => l.titulo);
    if (tambemEm.length) out.push({ padrao: s.padrao, descricao: s.descricao, livros: tambemEm });
  }
  return out;
}
