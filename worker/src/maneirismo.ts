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
  // antítese com "haver" — escapava (o molde acima só casa não era/foi/é/seria):
  // "Não havia nada… Havia só o branco." / "não havia X, havia Y".
  { nome: 'antítese com "haver" ("Não havia X… Havia Y")', re: /\bn[ãa]o\s+h(?:avia|á|ouve)\b[^.!?\n]{0,80}[.!?…]+\s+(?:[^.!?\n]{0,30}\s)?h(?:avia|á)\b/gi, orc10k: 1.5 },
  { nome: 'antítese com "haver" (mesma frase: "não havia X, havia Y")', re: /\bn[ãa]o\s+h(?:avia|á|ouve)\b[^.,;:!?\n]{1,50}[,;]\s*(?:mas\s+|e\s+sim\s+)?h(?:avia|á)\b/gi, orc10k: 1.0 },
  // símile-andaime: símile hipotético estendido ("Como quando se entra…", "como se
  // pudesse…") — um dos piores tiques de IA. Orçamento apertado (1 legítimo ok; o
  // alvo é o EXCESSO e o molde repetido).
  { nome: 'símile-andaime ("como se / como quando")', re: /\bcomo\s+(?:se|quando)\b/gi, orc10k: 2.5 },
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
// 4) LÉXICO DE MULETAS: palavras/expressões sobre-usadas (palavra INTEIRA,
//    case-insensitive). "coisa" é a pior (~1 a cada 200 palavras nos livros) e
//    tem orçamento APERTADO. Configurável: cada item traz o orçamento por 10k.
// ---------------------------------------------------------------------------
export interface Muleta { termo: string; re: RegExp; orc10k: number }

export const MULETAS: Muleta[] = [
  { termo: "coisa/coisas", re: /\bcoisas?\b/gi, orc10k: 4 },   // ~1 a cada 2500 palavras
  { termo: "algo", re: /\balgo\b/gi, orc10k: 8 },
  { termo: '"meio que"', re: /\bmeio que\b/gi, orc10k: 3 },
  { termo: "simplesmente", re: /\bsimplesmente\b/gi, orc10k: 3 },
  { termo: '"de repente"', re: /\bde repente\b/gi, orc10k: 4 },
  { termo: '"na verdade"', re: /\bna verdade\b/gi, orc10k: 4 },
  { termo: '"parecia que"', re: /\bparecia que\b/gi, orc10k: 3 },
  { termo: '"de certa forma/maneira"', re: /\bde certa (?:forma|maneira)\b/gi, orc10k: 2 },
];

export interface MuletaContagem { termo: string; n: number; por10k: number; alvo: number; acima: boolean }

export function contarMuletas(texto: string, lexico: Muleta[] = MULETAS): MuletaContagem[] {
  const t = texto ?? "";
  const palavras = (t.match(/\S+/g) ?? []).length;
  return lexico
    .map(({ termo, re, orc10k }) => {
      const n = (t.match(re) ?? []).length;
      const alvo = Math.max(1, Math.round((orc10k * palavras) / 10_000));
      return { termo, n, por10k: palavras ? Math.round((n / palavras) * 10_000 * 10) / 10 : 0, alvo, acima: n > alvo };
    })
    .filter((m) => m.n > 0)
    .sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------------------
// 5) CADÊNCIA (ritmo, não palavras): o detector acima mede moldes/léxico; este
//    mede o RITMO das frases — o staccato que a Regra 4 da skill-dan-brown bane
//    ("nunca dois fragmentos colados"). Determinístico, puro, testável.
//    Tiques: fragmentos colados, densidade de staccato, clipe de negação,
//    anáfora, epigrama antitético, e a cota de tiques de propulsão da Regra 4.
// ---------------------------------------------------------------------------
const RE_ITALICO = /(?<![\*_])([\*_])(?![\*_\s])([^\*_\n]{1,80}?)\1(?![\*_])/g;

// Remove linhas de heading markdown (não são prosa).
function semHeadings(texto: string): string {
  return (texto ?? "").split(/\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
}

// Divide em frases por pontuação terminal (mantém a pontuação). Heurística PT-BR.
export function dividirFrases(texto: string): string[] {
  const t = semHeadings(texto).replace(/[ \t]+/g, " ").trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?…])[\s\n]+/)
    .map((s) => s.replace(/\n+/g, " ").trim())
    .filter(Boolean);
}

// Tira marcas de abertura (travessão de fala, aspas) antes de contar/abrir a frase.
function semAbertura(f: string): string {
  return f.replace(/^[—–\-"'“”‘’*_(\s]+/, "");
}
function palavrasFrase(f: string): number {
  return (semAbertura(f).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) ?? []).length;
}
function primeiraPalavra(f: string): string {
  return (semAbertura(f).match(/[A-Za-zÀ-ÿ0-9’'-]+/) ?? [""])[0].toLowerCase();
}
function ehDialogo(f: string): boolean {
  return /^[—–\-"'“”‘’]/.test(f.trim());
}

export interface CadenciaTique {
  nome: string;
  n: number;
  alvo: number;
  acima: boolean;
  exemplos: string[];
  densidade?: number; // % quando aplicável (staccato)
}
export interface ResultadoCadencia {
  frases: number;
  staccatoPct: number;        // % de frases ≤ curta palavras
  tiques: CadenciaTique[];    // todos os medidos (n≥0); os com acima=true são os ofensores
  acima: boolean;             // algum tique acima do orçamento
}

export interface OrcamentoCadencia {
  curta: number;        // limiar "frase curta" (palavras) p/ colados/staccato
  enfase: number;       // limiar "fragmento de ênfase" da Regra 4 (palavras)
  colados: number;      // orçamento de pares colados (≤1 tolerado)
  staccatoFrac: number; // fração de frases curtas que dispara
  minFrases: number;    // nº mínimo de frases p/ avaliar staccato (anti falso-positivo)
  clipeNeg: number;     // clipes de negação curtos por capítulo
  anafora: number;      // pares de anáfora colada
  epigrama: number;     // epigramas antitéticos
  fragEnfase: number;   // fragmentos de ênfase (Regra 4: ≤1–2)
  italico: number;      // pensamentos em itálico (Regra 4: ≤2–3)
  retorica: number;     // perguntas retóricas suspensas (Regra 4: ≤1–2)
}
export const ORC_CADENCIA: OrcamentoCadencia = {
  curta: 4, enfase: 3, colados: 1, staccatoFrac: 0.35, minFrases: 8,
  clipeNeg: 1, anafora: 1, epigrama: 1, fragEnfase: 2, italico: 3, retorica: 2,
};

const RE_EPIGRAMA = /\b[oa]s?\s+[A-Za-zÀ-ÿ]+\s+(?:faz|fazia|fez|faziam)\s+[oa]s?\s+[A-Za-zÀ-ÿ]+\s+que\b/gi;

export function diagnosticarCadencia(texto: string, orc: OrcamentoCadencia = ORC_CADENCIA): ResultadoCadencia {
  const t = texto ?? "";
  const fr = dividirFrases(t);
  const lens = fr.map(palavrasFrase);
  const ex = (arr: string[]) => arr.slice(0, 3).map((s) => s.slice(0, 70));

  // 1) fragmentos colados: pares adjacentes de frases ≤ curta palavras
  const coladosEx: string[] = [];
  let colados = 0;
  for (let i = 1; i < fr.length; i++) {
    if (lens[i - 1] <= orc.curta && lens[i] <= orc.curta) {
      colados++;
      coladosEx.push(`${fr[i - 1]} ${fr[i]}`);
    }
  }
  // 2) staccato: densidade de frases curtas
  const curtas = lens.filter((n) => n > 0 && n <= orc.curta).length;
  const staccatoPct = fr.length ? Math.round((curtas / fr.length) * 1000) / 10 : 0;
  const staccatoAcima = fr.length >= orc.minFrases && curtas / fr.length > orc.staccatoFrac;
  // 3) clipe de negação curto: frase ≤3 palavras começando "Não"
  const clipes = fr.filter((f, i) => lens[i] <= 3 && /^n[ãa]o\b/i.test(semAbertura(f)));
  // 4) anáfora: frases consecutivas com a MESMA primeira palavra
  const anaforaEx: string[] = [];
  let anafora = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = primeiraPalavra(fr[i - 1]);
    if (a && a === primeiraPalavra(fr[i])) {
      anafora++;
      anaforaEx.push(`${fr[i - 1]} / ${fr[i]}`);
    }
  }
  // 5) epigrama antitético ("X fazia o Y que …")
  const epi = [...t.matchAll(RE_EPIGRAMA)].map((m) => m[0]);
  // 6) cota da Regra 4: fragmento de ênfase (1–enfase palavras) + colados; itálico; retórica
  const frag = fr.filter((f, i) => lens[i] >= 1 && lens[i] <= orc.enfase);
  let fragColados = 0;
  for (let i = 1; i < fr.length; i++)
    if (lens[i - 1] >= 1 && lens[i - 1] <= orc.enfase && lens[i] >= 1 && lens[i] <= orc.enfase) fragColados++;
  const italicos = [...t.matchAll(RE_ITALICO)].map((m) => m[2]);
  const retoricas = fr.filter((f) => /[?]["'”’)\]]*$/.test(f) && !ehDialogo(f));

  const mk = (nome: string, n: number, alvo: number, exemplos: string[], densidade?: number): CadenciaTique =>
    ({ nome, n, alvo, acima: n > alvo, exemplos: ex(exemplos), densidade });

  const tiques: CadenciaTique[] = [
    mk("fragmentos colados (≤4 palavras)", colados, orc.colados, coladosEx),
    { nome: "staccato (frases curtas)", n: curtas, alvo: Math.round(fr.length * orc.staccatoFrac), acima: staccatoAcima, exemplos: [], densidade: staccatoPct },
    mk("clipe de negação curto", clipes.length, orc.clipeNeg, clipes),
    mk("anáfora (frases coladas, mesmo início)", anafora, orc.anafora, anaforaEx),
    mk("epigrama antitético", epi.length, orc.epigrama, epi),
    mk("fragmento de ênfase (Regra 4 ≤1–2)", frag.length, orc.fragEnfase, frag),
    mk("fragmentos de ênfase COLADOS (Regra 4: nunca dois)", fragColados, 0, []),
    mk("pensamento em itálico (Regra 4 ≤2–3)", italicos.length, orc.italico, italicos),
    mk("pergunta retórica (Regra 4 ≤1–2)", retoricas.length, orc.retorica, retoricas),
  ];
  return { frases: fr.length, staccatoPct, tiques, acima: tiques.some((q) => q.acima) };
}

// Só os tiques de cadência ACIMA do orçamento (para gate/relatório).
export function cadenciaAcima(texto: string, orc: OrcamentoCadencia = ORC_CADENCIA): CadenciaTique[] {
  return diagnosticarCadencia(texto, orc).tiques.filter((q) => q.acima);
}

// INTERIORIDADE SEM EVENTO (heurística — SINALIZA, não bloqueia): capítulo
// majoritariamente cópula/percepção (ser/estar/parecer/haver/sentir/lembrar) e quase
// sem diálogo → prosa "bem escrita e chata", sensação sobre sensação sem que nada
// aconteça na cena. Alimenta o REVISOR (não rejeita sozinho — pode ser uma abertura
// contemplativa legítima). Conservador: exige densidade alta E diálogo quase nulo.
const RE_ESTATICO = /\b(é|era|foi|s[ãa]o|eram|est[áa]|estava|estavam|parece|parecia|pareciam|h[áa]|havia|houve|sentia|sente|sentiu|lembrava|lembra|imaginava|imagina|pensava|tinha|existia)\b/i;
export interface InterioridadeSinal { frases: number; estaticaPct: number; dialogoPct: number; acima: boolean }
export function interioridadeSemEvento(texto: string, min = 10): InterioridadeSinal {
  const fr = dividirFrases(texto);
  if (!fr.length) return { frases: 0, estaticaPct: 0, dialogoPct: 0, acima: false };
  const estaticas = fr.filter((f) => RE_ESTATICO.test(f) && !ehDialogo(f)).length;
  const dialogo = fr.filter((f) => ehDialogo(f)).length;
  const ep = estaticas / fr.length;
  const dp = dialogo / fr.length;
  return {
    frases: fr.length,
    estaticaPct: Math.round(ep * 1000) / 10,
    dialogoPct: Math.round(dp * 1000) / 10,
    acima: fr.length >= min && ep > 0.6 && dp < 0.06,
  };
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
export interface CadenciaCapitulo { capitulo: number; tiques: CadenciaTique[] }

export interface DiagnosticoRepeticao {
  moldes: PadraoContagem[];           // só os ACIMA do alvo
  muletas: MuletaContagem[];          // só as ACIMA do alvo
  fecho: FechoResultado & { acima: boolean };
  ngramas: NgramHit[];
  cadencia: CadenciaCapitulo[];       // por capítulo, só os com tiques de ritmo ACIMA
  algumAcima: boolean;
}

export function diagnosticarRepeticao(textoCompleto: string, capitulos: string[]): DiagnosticoRepeticao {
  const r = contarManeirismos(textoCompleto);
  const moldesAcima = r.padroes.filter((p) => p.acima);
  const muletasAcima = contarMuletas(textoCompleto).filter((m) => m.acima);
  const fecho = fechoEpigramatico(capitulos);
  const ngramas = ngramasSobrerepresentados(textoCompleto);
  // Cadência é POR CAPÍTULO (staccato/colados não fazem sentido book-wide): roda por
  // capítulo e lista os que estouram o orçamento de ritmo.
  const cadencia: CadenciaCapitulo[] = capitulos
    .map((cap, i) => ({ capitulo: i + 1, tiques: cadenciaAcima(cap) }))
    .filter((c) => c.tiques.length > 0);
  return {
    moldes: moldesAcima,
    muletas: muletasAcima,
    fecho,
    ngramas,
    cadencia,
    algumAcima: moldesAcima.length > 0 || muletasAcima.length > 0 || fecho.acima || ngramas.length > 0 || cadencia.length > 0,
  };
}
