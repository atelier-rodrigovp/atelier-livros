// Detector de repetição de prosa: tiques MECÂNICOS e cross-capítulo que a IA
// repete porque cada capítulo é contexto fresco. Determinístico (conta, não pede)
// e GENÉRICO (pega qualquer molde sobre-representado, não só uma lista fixa).
// Puro/testável. NÃO altera texto.

// ---------------------------------------------------------------------------
// 1) Moldes NOMEADOS (com orçamento por 10k palavras) — os tiques conhecidos.
// ---------------------------------------------------------------------------
export interface Molde { nome: string; re: RegExp; orc10k: number }

const MOLDES: Molde[] = [
  // antítese por negação, em todas as formas
  { nome: 'antítese "não era X. Era Y."', re: /\bn[ãa]o\s+(?:era|foi|fora|é|seria)\b[^.!?\n]{0,60}[.!?]\s+(?:era|foi|fora|é|seria)\b/gi, orc10k: 1.5 },
  { nome: 'aposto antitético ("não era pergunta; era…")', re: /\bn[ãa]o\s+(?:era|foi|é)\s+[^.,;:!?\n]{1,30}[;:,]\s*(?:era|foi|é|mas|e\s+sim)\b/gi, orc10k: 1.0 },
  { nome: 'antítese "não X, mas/e sim Y"', re: /\bn[ãa]o\s+\w[^.,;!?\n]{0,50}[,;]\s*(?:mas|e\s+sim|sen[ãa]o)\s+/gi, orc10k: 1.5 },
  { nome: 'fragmento antitético curto ("Não X. Y.")', re: /(?:^|[.!?]\s)N[ãa]o\s+[^.!?\n]{1,45}[.!?]\s+[A-ZÀ-Ý]/g, orc10k: 1.5 },
  // "do jeito que / do jeito de / do jeito como"
  { nome: '"do jeito que/de"', re: /\bdo\s+jeito\s+(?:que|de|como)\b/gi, orc10k: 2.5 },
  // clichês recorrentes
  { nome: "clichê recorrente", re: /\b(mar de chumbo|clareza fria|sil[êe]ncio ensurdecedor|frio na espinha|cora[çc][ãa]o disparad[oa]|sangue gelad[oa]|n[óo] na garganta)\b/gi, orc10k: 1.0 },
];

export interface PadraoContagem {
  nome: string;
  n: number;
  por10k: number;
  alvo: number;        // contagem-alvo dado o tamanho do texto (orc10k convertido)
  acima: boolean;      // n acima do alvo?
  exemplos: string[];
}

export interface ResultadoManeirismo {
  total: number;
  palavras: number;
  por10k: number;
  acimaDoOrcamento: boolean;   // algum molde acima do alvo
  padroes: PadraoContagem[];   // ordenado por n desc (só os com n>0)
}

// Orçamento agregado (compat. com o resumo/alcançabilidade): tiques/10k acima do
// qual a prosa "estoura" no agregado.
export const ORCAMENTO_POR_10K = 6;

function contarPalavras(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

export function contarManeirismos(texto: string, _orc = ORCAMENTO_POR_10K): ResultadoManeirismo {
  const t = texto ?? "";
  const palavras = contarPalavras(t);
  const por = (n: number) => (palavras > 0 ? Math.round((n / palavras) * 10_000 * 10) / 10 : 0);
  const padroes: PadraoContagem[] = MOLDES.map(({ nome, re, orc10k }) => {
    const ms = [...t.matchAll(re)];
    const n = ms.length;
    const alvo = Math.max(1, Math.round((orc10k * palavras) / 10_000));
    return {
      nome, n, por10k: por(n), alvo, acima: n > alvo,
      exemplos: ms.slice(0, 3).map((m) => m[0].replace(/\s+/g, " ").trim().slice(0, 70)),
    };
  }).filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
  const total = padroes.reduce((s, p) => s + p.n, 0);
  return { total, palavras, por10k: por(total), acimaDoOrcamento: padroes.some((p) => p.acima), padroes };
}

// ---------------------------------------------------------------------------
// 2) Fecho EPIGRAMÁTICO isolado: última linha curta (≤ maxPalavras) como remate
//    de capítulo. Flag se ocorre em mais de ~1/3 dos capítulos.
// ---------------------------------------------------------------------------
export interface FechoResultado { n: number; total: number; fracao: number; capitulos: number[] }

export function fechoEpigramatico(capitulos: string[], maxPalavras = 8, fracaoFlag = 1 / 3): FechoResultado & { acima: boolean } {
  const idx: number[] = [];
  capitulos.forEach((cap, i) => {
    const linhas = (cap ?? "").trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const ultima = linhas[linhas.length - 1] ?? "";
    const pal = (ultima.match(/\S+/g) ?? []).length;
    // remate epigramático: frase curta, terminada em pontuação, não um título (#)
    if (pal > 0 && pal <= maxPalavras && !ultima.startsWith("#") && /[.!?…]["'”’)]?$/.test(ultima)) idx.push(i + 1);
  });
  const total = capitulos.length;
  const fracao = total ? idx.length / total : 0;
  return { n: idx.length, total, fracao: Math.round(fracao * 100) / 100, capitulos: idx, acima: fracao > fracaoFlag };
}

// ---------------------------------------------------------------------------
// 3) Detector GENÉRICO: n-gramas de 3–5 palavras SOBRE-REPRESENTADOS. Pega tiques
//    NOVOS automaticamente (não só os nomeados). Pula n-gramas quase-só stopword.
// ---------------------------------------------------------------------------
export interface NgramHit { gram: string; n: number; por10k: number }

const STOP = new Set(
  ("a o as os um uma uns umas de da do das dos e em no na nos nas que se com por para " +
   "ao à às aos seu sua seus suas é era foi fora ele ela eles elas isso isto lhe lhes me te " +
   "mas como mais já não sim ou nem entre sobre sem até onde quando quem qual cada todo toda " +
   "o a os as dele dela deles delas num numa pelo pela pelos pelas").split(/\s+/));

export function ngramasSobrerepresentados(
  texto: string,
  opts: { ns?: number[]; min?: number; limiarPor10k?: number; top?: number } = {}
): NgramHit[] {
  const { ns = [4, 5], min = 4, limiarPor10k = 3, top = 12 } = opts;
  const palavras = (texto ?? "").toLowerCase().match(/[a-zà-ÿ’'-]+/gi) ?? [];
  const total = palavras.length;
  const freq = new Map<string, number>();
  for (const n of ns) {
    for (let i = 0; i + n <= palavras.length; i++) {
      const slice = palavras.slice(i, i + n);
      if (slice.filter((w) => !STOP.has(w)).length < 2) continue; // quase-só stopword: pula
      const g = slice.join(" ");
      freq.set(g, (freq.get(g) ?? 0) + 1);
    }
  }
  const hits: NgramHit[] = [];
  for (const [gram, n] of freq) {
    if (n < min) continue;
    const por10k = total > 0 ? Math.round((n / total) * 10_000 * 10) / 10 : 0;
    if (por10k >= limiarPor10k) hits.push({ gram, n, por10k });
  }
  return hits.sort((a, b) => b.n - a.n).slice(0, top);
}

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------
export function resumoManeirismo(r: ResultadoManeirismo): string {
  if (!r.total) return "Maneirismo: nenhum tique mecânico detectado.";
  const top = r.padroes.slice(0, 4).map((p) => `${p.nome} (${p.n}×${p.acima ? ` >alvo ${p.alvo}` : ""})`).join("; ");
  return `Maneirismo: ${r.total} tiques (${r.por10k}/10k${r.acimaDoOrcamento ? ", ACIMA do orçamento" : ""}). Principais: ${top}.`;
}

// Diagnóstico completo (book-wide): moldes + fecho + n-gramas genéricos acima do alvo.
export interface DiagnosticoRepeticao {
  moldes: PadraoContagem[];           // só os ACIMA do alvo
  fecho: FechoResultado & { acima: boolean };
  ngramas: NgramHit[];
  algumAcima: boolean;
}

export function diagnosticarRepeticao(textoCompleto: string, capitulos: string[]): DiagnosticoRepeticao {
  const r = contarManeirismos(textoCompleto);
  const moldesAcima = r.padroes.filter((p) => p.acima);
  const fecho = fechoEpigramatico(capitulos);
  const ngramas = ngramasSobrerepresentados(textoCompleto);
  return {
    moldes: moldesAcima,
    fecho,
    ngramas,
    algumAcima: moldesAcima.length > 0 || fecho.acima || ngramas.length > 0,
  };
}
