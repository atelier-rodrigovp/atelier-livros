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
  // AUDITORIA-CONVERGENCIA 2026-07-13: a versão antiga casava QUALQUER frase
  // curta iniciada por "Não" (4/5 marcações reais eram falso positivo — réplicas
  // e confissões de narradora 1ª pessoa, sem antítese). Agora exige o 2º termo
  // antitético na frase seguinte (Era/É/Este/Havia/Mas/…).
  { nome: 'fragmento antitético curto ("Não X. Era/Este Y.")', re: /(?:^|[.!?]\s)N[ãa]o\s+[^.!?\n]{1,45}[.!?]\s+(?:Era|É|Foi|Fora|Seria|Este|Esta|Isto|Isso|Havia|Há|Mas|Agora|Hoje)(?=[\s,;:.!?—…]|$)/g, orc10k: 1.5 },
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
  // SPEC-08: token estrangeiro/typo de geração (o "ninguño" do capítulo vesper passou
  // por TODOS os gates e chegaria ao EPUB). Lista LITERAL curta — nada de heurística
  // (nome próprio de fantasia não pode dar falso positivo). orc10k 0 = alvo 0 (qualquer
  // ocorrência estoura). "sino" ficou FORA de propósito: é palavra PT legítima (o sino).
  {
    termo: "léxico estrangeiro (typo de geração)",
    re: /\b(ninguño|ningún|ninguna|pero|entonces|mismo|misma|llegou|llegó|aunque|también|todavía|además)\b/gi,
    orc10k: 0,
  },
  {
    // AUDITORIA-DAN-BROWN-V2 FASE -1: léxico de Portugal vazando na prosa pt-BR (rede
    // de segurança; a 1ª linha é a instrução em lexico-ptbr.ts). Alvo 0 (qualquer estoura).
    termo: "léxico PT-PT (não pt-BR)",
    re: /\b(telemóve(?:l|is)|ecrã|autocarro(?:s)?|comboio(?:s)?|frigorífico|casa de banho|pequeno-almoço|autoclismo|talho)\b/gi,
    orc10k: 0,
  },
];

export interface MuletaContagem { termo: string; n: number; por10k: number; alvo: number; acima: boolean }

export function contarMuletas(texto: string, lexico: Muleta[] = MULETAS): MuletaContagem[] {
  const t = texto ?? "";
  const palavras = (t.match(/\S+/g) ?? []).length;
  return lexico
    .map(({ termo, re, orc10k }) => {
      const n = (t.match(re) ?? []).length;
      // orc10k ≤ 0 = tolerância zero (léxico estrangeiro); senão, piso 1 proporcional.
      const alvo = orc10k <= 0 ? 0 : Math.max(1, Math.round((orc10k * palavras) / 10_000));
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
// AUDITORIA-CONVERGENCIA 2026-07-13 (autópsia 53abdade): anáfora por palavra
// FUNCIONAL ("O cabeçalho…"/"O segundo…") é português ordinário, não tique.
// Quando a 1ª palavra é funcional, a chave compara as DUAS primeiras palavras
// ("O campo…/O campo…" continua contando como anáfora real).
const PALAVRAS_FUNCIONAIS = new Set([
  "o", "a", "os", "as", "um", "uma", "e", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "ao", "à", "aos", "às", "mas", "que",
  "se", "por", "com", "para",
]);
function chaveAnafora(f: string): string {
  const palavras = semAbertura(f).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) ?? [];
  const p1 = (palavras[0] ?? "").toLowerCase();
  if (!p1) return "";
  if (!PALAVRAS_FUNCIONAIS.has(p1)) return p1;
  const p2 = (palavras[1] ?? "").toLowerCase();
  return p2 ? `${p1} ${p2}` : "";
}

// Fragmento de ÊNFASE (Regra 4): beat deliberado — 1–2 palavras ("Travou.",
// "*Comprometido.*") ou 3 palavras iniciando por negação ("Não pode ser.").
// Frase completa de 3 palavras com verbo+complemento ("Ligou o carro.") é
// compressão comum de prosa, não fragmento (autópsia: 3/5 marcações eram isso).
function ehFragmentoEnfase(f: string, len: number, tetoEnfase: number): boolean {
  if (len < 1) return false;
  if (len <= 2) return true;
  return len <= tetoEnfase && /^(n[ãa]o|nem|nunca|nada)\b/i.test(semAbertura(f));
}
function ehDialogo(f: string): boolean {
  return /^[—–\-"'“”‘’]/.test(f.trim());
}

// Frases rotuladas com a marca de DIÁLOGO do PARÁGRAFO de origem: a fala
// multi-frase ("— Desculpe. Ainda está aberto?") pertence INTEIRA ao diálogo,
// mesmo que a 2ª frase não carregue o travessão. Conservador: o aparte de
// narração dentro do parágrafo de fala também conta como diálogo (menos falso
// positivo, nunca mais).
function frasesRotuladas(texto: string): { fr: string[]; narr: boolean[] } {
  const fr: string[] = [];
  const narr: boolean[] = [];
  for (const par of (texto ?? "").split(/\n{2,}/)) {
    const dialogo = /^[\s>]*[—–\-"'“”‘’]/.test(par);
    for (const f of dividirFrases(par)) {
      fr.push(f);
      narr.push(!dialogo);
    }
  }
  return { fr, narr };
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
  staccatoPct: number;        // % de frases de NARRAÇÃO ≤ curta palavras
  fragDialogo: number;        // fragmentos curtos em DIÁLOGO (só SINAL — fala curta é fala, não tique)
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
  fragColados: number;  // pares de fragmentos de ênfase colados (Regra 4: nunca dois → 0)
  italico: number;      // pensamentos em itálico (Regra 4: ≤2–3)
  retorica: number;     // perguntas retóricas suspensas (Regra 4: ≤1–2)
}
export const ORC_CADENCIA: OrcamentoCadencia = {
  curta: 4, enfase: 3, colados: 1, staccatoFrac: 0.35, minFrases: 8,
  clipeNeg: 1, anafora: 1, epigrama: 1, fragEnfase: 2, fragColados: 0, italico: 3, retorica: 2,
};

// Orçamento POR SKILL: o default é calibrado para cadência LONGA (Regra 4 da
// skill-dan-brown/vésper). Skills de cadência RÁPIDA têm a frase curta como
// ASSINATURA ("curta e cheia" do hoover-mcfadden) — o orçamento único criminalizava
// a voz correta (capítulo conforme a craft reprovava com staccato 47%). Opt-in por
// skill; quem não está no mapa usa o default intacto.
// Calibração do hoover: pelo capítulo-exemplar da auditoria (julgado CONFORME à
// craft na página): a régua contra staccato VAZIO fica na DENSIDADE (55%), nos
// pares colados e na anáfora — a contagem absoluta de fragmentos é a própria voz
// e ganha folga. Epigrama/itálico/retórica seguem o default (molde de IA, não voz).
export const ORC_CADENCIA_POR_SKILL: Record<string, OrcamentoCadencia> = {
  "hoover-mcfadden": {
    ...ORC_CADENCIA,
    staccatoFrac: 0.55, fragEnfase: 20, fragColados: 6, colados: 8, clipeNeg: 3, anafora: 2,
  },
  // SPEC-RM3 (auditoria hoover/romantasy, n=3): a frase-soco/fragmento de ênfase é a
  // assinatura BookTok do gênero, mas o staccatoPct medido foi BAIXO (16–23%) — não é
  // excesso de staccato, é a CONTAGEM de fragmentos que o orçamento longo criminalizava.
  // Sobe SÓ fragEnfase/fragColados/anafora (folga menor que o hoover); staccatoFrac fica
  // no default 0.35 (romantasy não estourou densidade). Muleta "coisa" e símile-andaime
  // seguem FIXAS no detector de muletas/moldes (molde de IA em qualquer skill, não voz).
  "skill-romantasy": {
    ...ORC_CADENCIA,
    fragEnfase: 6, fragColados: 1, anafora: 2,
  },
};
export function orcCadenciaParaSkill(skill?: string | null): OrcamentoCadencia {
  return (skill && ORC_CADENCIA_POR_SKILL[skill]) || ORC_CADENCIA;
}

const RE_EPIGRAMA = /\b[oa]s?\s+[A-Za-zÀ-ÿ]+\s+(?:faz|fazia|fez|faziam)\s+[oa]s?\s+[A-Za-zÀ-ÿ]+\s+que\b/gi;

export function diagnosticarCadencia(texto: string, orc: OrcamentoCadencia = ORC_CADENCIA): ResultadoCadencia {
  const t = texto ?? "";
  // Diálogo NÃO conta como tique de ritmo: fala curta é fala natural, não staccato
  // de narração ("— Desculpe. Ainda está aberto?" contava como fragmento). Fica
  // como SINAL separado (fragDialogo) para o revisor, sem reprovar.
  const { fr, narr } = frasesRotuladas(t);
  const lens = fr.map(palavrasFrase);
  const ex = (arr: string[]) => arr.slice(0, 3).map((s) => s.slice(0, 70));

  // 1) fragmentos colados: pares adjacentes de frases de NARRAÇÃO ≤ curta palavras
  const coladosEx: string[] = [];
  let colados = 0;
  for (let i = 1; i < fr.length; i++) {
    if (narr[i - 1] && narr[i] && lens[i - 1] <= orc.curta && lens[i] <= orc.curta) {
      colados++;
      coladosEx.push(`${fr[i - 1]} ${fr[i]}`);
    }
  }
  // 2) staccato: densidade de frases curtas NA NARRAÇÃO
  const nNarr = narr.filter(Boolean).length;
  const curtas = lens.filter((n, i) => narr[i] && n > 0 && n <= orc.curta).length;
  const staccatoPct = nNarr ? Math.round((curtas / nNarr) * 1000) / 10 : 0;
  const staccatoAcima = nNarr >= orc.minFrases && curtas / nNarr > orc.staccatoFrac;
  // 3) clipe de negação curto: frase de narração ≤3 palavras começando "Não"
  const clipes = fr.filter((f, i) => narr[i] && lens[i] <= 3 && /^n[ãa]o\b/i.test(semAbertura(f)));
  // 4) anáfora: frases de narração consecutivas com a MESMA primeira palavra
  const anaforaEx: string[] = [];
  let anafora = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = chaveAnafora(fr[i - 1]);
    if (narr[i - 1] && narr[i] && a && a === chaveAnafora(fr[i])) {
      anafora++;
      anaforaEx.push(`${fr[i - 1]} / ${fr[i]}`);
    }
  }
  // 5) epigrama antitético ("X fazia o Y que …")
  const epi = [...t.matchAll(RE_EPIGRAMA)].map((m) => m[0]);
  // 6) cota da Regra 4: fragmento de ênfase (1–enfase palavras, narração) + colados;
  //    itálico; retórica. Fragmento em DIÁLOGO vira só sinal.
  const frag = fr.filter((f, i) => narr[i] && ehFragmentoEnfase(f, lens[i], orc.enfase));
  const fragDialogo = fr.filter((f, i) => !narr[i] && ehFragmentoEnfase(f, lens[i], orc.enfase)).length;
  let fragColados = 0;
  for (let i = 1; i < fr.length; i++)
    if (narr[i - 1] && narr[i] && ehFragmentoEnfase(fr[i - 1], lens[i - 1], orc.enfase) && ehFragmentoEnfase(fr[i], lens[i], orc.enfase))
      fragColados++;
  const italicos = [...t.matchAll(RE_ITALICO)].map((m) => m[2]);
  const retoricas = fr.filter((f, i) => narr[i] && /[?]["'”’)\]]*$/.test(f));

  const mk = (nome: string, n: number, alvo: number, exemplos: string[], densidade?: number): CadenciaTique =>
    ({ nome, n, alvo, acima: n > alvo, exemplos: ex(exemplos), densidade });

  const tiques: CadenciaTique[] = [
    mk("fragmentos colados (≤4 palavras)", colados, orc.colados, coladosEx),
    { nome: "staccato (frases curtas)", n: curtas, alvo: Math.round(nNarr * orc.staccatoFrac), acima: staccatoAcima, exemplos: [], densidade: staccatoPct },
    mk("clipe de negação curto", clipes.length, orc.clipeNeg, clipes),
    mk("anáfora (frases coladas, mesmo início)", anafora, orc.anafora, anaforaEx),
    mk("epigrama antitético", epi.length, orc.epigrama, epi),
    mk("fragmento de ênfase (Regra 4 ≤1–2)", frag.length, orc.fragEnfase, frag),
    mk("fragmentos de ênfase COLADOS (Regra 4: nunca dois)", fragColados, orc.fragColados, []),
    mk("pensamento em itálico (Regra 4 ≤2–3)", italicos.length, orc.italico, italicos),
    mk("pergunta retórica (Regra 4 ≤1–2)", retoricas.length, orc.retorica, retoricas),
  ];
  return { frases: fr.length, staccatoPct, fragDialogo, tiques, acima: tiques.some((q) => q.acima) };
}

// Só os tiques de cadência ACIMA do orçamento (para gate/relatório).
export function cadenciaAcima(texto: string, orc: OrcamentoCadencia = ORC_CADENCIA): CadenciaTique[] {
  return diagnosticarCadencia(texto, orc).tiques.filter((q) => q.acima);
}

// CLÁUSULA CAUSAL-GNÔMICA (tique novo — SINAL CONSULTIVO, NÃO entra na cota Regra 4 nem
// gera regen). Um "porque" (última cláusula da frase) que resolve numa abstração quase-
// aforística: "…porque esperar era uma maneira de mentir para si mesma", "…é só medo com
// aparência de método", "…estava tudo errado do jeito certo", "…porque nunca houve o que
// tocar". Medição contra corpus real (caps 30–36 do Índice): um GATE determinístico teria
// ~44–45% de falso-positivo (não separa aforismo de causal concreto legítimo sem semântica)
// — regen a essa taxa é pior que não ter gate (regra do projeto). Por isso este contador só
// SINALIZA a densidade por capítulo; o julgamento fica no revisor (categoria nomeada no
// PROPULSAO). Heurística deliberadamente inclusiva (pega os 4 casos do cap 35); a precisão
// vem do humano, não do número. Regra prática: n>2 no mesmo capítulo = tique provável.
const _RE_COP_GNOMICA = /\b(é|era|foi|seria|são|eram|está|estava|estavam|houve|havia|vira|virava|significa|significava)\b/i;
const _RE_NOME_PROPRIO = /\b[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõ]{2,}/;
export interface CausalGnomicoSinal { n: number; exemplos: string[]; limiar: number; acima: boolean }
export const LIMIAR_CAUSAL_GNOMICO = 2; // >2 no mesmo capítulo = tique provável (só sinaliza)
export function contarCausalGnomico(texto: string): CausalGnomicoSinal {
  const t = semHeadings(texto ?? "");
  const exemplos: string[] = [];
  for (const sent of t.split(/(?<=[.!?])\s+/)) {
    const s = sent.replace(/\s+/g, " ").trim();
    if (/^[—-]/.test(s)) continue; // diálogo: fala não é narração aforística
    const idx = s.toLowerCase().lastIndexOf("porque");
    if (idx < 0) continue;
    const cl = s.slice(idx + "porque".length).replace(/^[\s,]+/, "").replace(/[\s.,;:—-]+$/, "");
    const nw = cl.split(/\s+/).filter(Boolean).length;
    if (nw === 0 || nw > 14) continue;   // curta: aforismo fecha rápido
    if (!_RE_COP_GNOMICA.test(cl)) continue; // cópula/existencial: "é/era/estava/houve…"
    if (_RE_NOME_PROPRIO.test(cl)) continue; // referente concreto/nome próprio ⇒ causal legítimo
    if (/\d/.test(cl)) continue;             // dígito ⇒ fato concreto
    exemplos.push(("porque " + cl).slice(0, 90));
  }
  return { n: exemplos.length, exemplos: exemplos.slice(0, 5), limiar: LIMIAR_CAUSAL_GNOMICO, acima: exemplos.length > LIMIAR_CAUSAL_GNOMICO };
}

// INTERIORIDADE SEM EVENTO (heurística — SINALIZA, não bloqueia): capítulo
// majoritariamente cópula/percepção (ser/estar/parecer/haver/sentir/lembrar) e quase
// sem diálogo → prosa "bem escrita e chata", sensação sobre sensação sem que nada
// aconteça na cena. Alimenta o REVISOR (não rejeita sozinho — pode ser uma abertura
// contemplativa legítima). Conservador: exige densidade alta E diálogo quase nulo.
// Fronteira Unicode-aware: o `\b` do JS (ASCII) NÃO reconhece vogal acentuada como
// caractere de palavra, então `\bé\b`/`\bestá\b`/`\bhá\b` NUNCA casavam — bloqueava a
// detecção de estática em prosa no PRESENTE (o tempo verbal do hoover-mcfadden). Trocado
// por lookarounds `\p{L}\d_` com flag `u`. A LISTA de palavras é idêntica; só a fronteira muda.
const RE_ESTATICO = /(?<![\p{L}\d_])(é|era|foi|s[ãa]o|eram|est[áa]|estava|estavam|parece|parecia|pareciam|h[áa]|havia|houve|sentia|sente|sentiu|lembrava|lembra|imaginava|imagina|pensava|tinha|existia)(?![\p{L}\d_])/iu;
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

// TIPO DE GANCHO (fim de capítulo) — classificador heurístico + sinal de alternância.
// A skill hoover-mcfadden (e a romantasy) pedem VARIAR o tipo de gancho: "não termine 3
// capítulos seguidos no mesmo tipo". Tipos: virada (fato novo derruba o anterior), pergunta
// (algo se abre sem resposta), soco emocional (verdade do coração), relógio (o prazo aperta).
// pergunta e relógio são detectáveis com boa confiança; virada×soco é a fronteira fuzzy —
// por isso o mecanismo é CONSULTIVO (sinaliza a repetição, NÃO bloqueia/regenera), mesmo
// padrão do tique causal-gnômico. Genérico (sem parâmetro de skill): quem usa é o revisor.
export type TipoGancho = "pergunta" | "relogio" | "virada" | "soco" | "indefinido";
const _RE_RELOGIO_GANCHO = /(?<![\p{L}])(horas?|minutos?|segundos?|dias?|semanas?|prazo|amanh[ãa]|meia-noite|madrugada|rel[óo]gio|contagem|faltavam?|faltam?|restavam?|restam?|esgot\p{L}*|antes que|tempo)(?![\p{L}])/iu;
const _RE_VIRADA_GANCHO = /(?<![\p{L}])(descobr\p{L}+|percebi|soube|entendi|afinal|n[ãa]o era|era el[ea]|mentira|mentiu|nunca (foi|houve|existiu)|o nome del\p{L}+|a verdade era|na verdade)(?![\p{L}])/iu;
const _RE_SOCO_GANCHO = /(?<![\p{L}])(amei?|amava|amor|perdi|perda|medo|sozinh\p{L}+|d[óo]i|do[íi]a|cora[çc][ãa]o|chor\p{L}+|saudade|culpa|vazio|adeus|para sempre|nunca mais)(?![\p{L}])/iu;

/** Classifica o TIPO do gancho pelo(s) parágrafo(s) final(is) de um capítulo. Heurístico. */
export function classificarGanchoFinal(texto: string): TipoGancho {
  const fr = dividirFrases(texto);
  if (!fr.length) return "indefinido";
  const ultima = fr[fr.length - 1];
  const ultimas = fr.slice(-2).join(" ");
  if (/[?]["'”’»)\]]*$/.test(ultima)) return "pergunta";          // termina em pergunta
  if (_RE_RELOGIO_GANCHO.test(ultimas)) return "relogio";         // léxico de prazo/tempo
  if (_RE_VIRADA_GANCHO.test(ultimas)) return "virada";           // revelação factual
  if (_RE_SOCO_GANCHO.test(ultimas) || palavrasFrase(ultima) <= 6) return "soco"; // punch emocional/curto
  return "indefinido";
}

export interface AlternanciaGanchoSinal { repetido: boolean; tipo: TipoGancho; sequencia: number }
/** SINAL consultivo (não bloqueia): true se os últimos ≥3 ganchos são do MESMO tipo (≠indefinido). */
export function alternanciaGanchoSinal(tipos: TipoGancho[]): AlternanciaGanchoSinal {
  if (!tipos.length) return { repetido: false, tipo: "indefinido", sequencia: 0 };
  const ultimo = tipos[tipos.length - 1];
  let seq = 1;
  for (let i = tipos.length - 1; i > 0 && tipos[i] === tipos[i - 1]; i--) seq++;
  return { repetido: seq >= 3 && ultimo !== "indefinido", tipo: ultimo, sequencia: seq };
}

// FASE 5 — Exposition Control ESPECIALIZADO (pós-revelação; SINALIZA, não bloqueia).
// Se o capítulo ANTERIOR teve revelação forte (pista paga / pergunta paga), o capítulo
// atual só pode ter interpretação emocional CURTA + consequência prática. Excesso de
// prosa conceitual reexplicando a revelação = aviso. Reusa interioridadeSemEvento com
// um limiar mais SENSÍVEL (pós-revelação a régua aperta: estática >0.5 e diálogo <0.10).
export function exposicaoPosRevelacaoRisco(textoAtual: string, houveRevelacaoAntes: boolean): boolean {
  if (!houveRevelacaoAntes) return false;
  const s = interioridadeSemEvento(textoAtual);
  return s.acima || (s.frases >= 10 && s.estaticaPct > 50 && s.dialogoPct < 10);
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

// ---------------------------------------------------------------------------
// 6) REPETIÇÃO VERBATIM CROSS-CAPÍTULO (AUDITORIA-DAN-BROWN-V2, gap 1). O detector
//    acima só olha DENTRO de um capítulo; o modelo reaproveita frases-assinatura
//    ENTRE capítulos ("A mão soube antes da cabeça" — cap-12 e cap-20 do Índice).
//    UNIVERSAL (não entra em ORC_CADENCIA_POR_SKILL): repetir assinatura é defeito
//    em qualquer gênero. Ledger = assinaturas-cross-capitulo.json (única fonte).
// ---------------------------------------------------------------------------
export function normalizarTrecho(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SlotAforistico { original: string; normalizado: string }

// Fala direta OU tag de fala formulaico não são "assinatura autoral" — são ruído no
// detector cross-capítulo (dialogo repetido / atribuição "disse X"). Exclui da extração.
const _RE_TAG_FALA = /^(disse|perguntou|respondeu|murmurou|sussurrou|repetiu|retrucou|indagou|exclamou|gritou|falou|acrescentou|continuou|concluiu|observou)\b|,\s+(disse|perguntou|respondeu|murmurou|sussurrou|repetiu|retrucou|indagou|acrescentou|observou)\b/i;
function ehDialogoOuTag(f: string): boolean {
  return ehDialogo(f) || _RE_TAG_FALA.test((f ?? "").trim());
}

// Extrai os "slots aforísticos": frases isoladas (parágrafo próprio) OU trechos
// após dois-pontos/travessão OU frases que batem num molde aforístico
// (definicional/antítese/símile). São os slots que o modelo reaproveita.
export function extrairSlotsAforisticos(texto: string): SlotAforistico[] {
  const t = semHeadings(texto ?? "");
  const brutos: string[] = [];
  for (const par of t.split(/\n{2,}/)) {
    const fr = dividirFrases(par);
    if (fr.length === 1 && !ehDialogoOuTag(fr[0])) brutos.push(fr[0]); // parágrafo de UMA frase = aforismo isolado
  }
  for (const m of t.matchAll(/[:—–]\s*([A-Za-zÀ-ÿ][^.!?\n:—–]{6,90}[.!?])/g)) if (!ehDialogoOuTag(m[1])) brutos.push(m[1]);
  for (const f of dividirFrases(t)) {
    if (ehDialogoOuTag(f)) continue;
    if (/\b[ée]\s+a\s+defini[çc][ãa]o\b/i.test(f) ||
        /\bcomo\s+(?:se|quando)\b/i.test(f) ||
        /\bn[ãa]o\s+\w[^.,;!?\n]{0,50}[,;]\s*(?:mas|e\s+sim|sen[ãa]o)\s+/i.test(f)) brutos.push(f);
  }
  const seen = new Set<string>();
  const out: SlotAforistico[] = [];
  const emit = (original: string, normalizado: string) => {
    const nw = normalizado.split(" ").filter(Boolean).length;
    const conteudo = normalizado.split(" ").filter((w) => w && !STOP.has(w)).length;
    if (nw >= 3 && nw <= 16 && conteudo >= 3 && !seen.has(normalizado)) { seen.add(normalizado); out.push({ original: original.slice(0, 120), normalizado }); }
  };
  for (const b of brutos) {
    const original = b.replace(/\s+/g, " ").trim();
    const normalizado = normalizarTrecho(original);
    const palavras = normalizado.split(" ").filter(Boolean);
    emit(original, normalizado); // o slot aforístico inteiro (3–16 palavras)
    for (const k of [6, 8]) if (palavras.length > k)
      emit(original.split(/\s+/).slice(0, k).join(" "), palavras.slice(0, k).join(" "));
  }
  // Além dos slots aforísticos: o PREFIXO (6 e 8 palavras) de TODA sentença. A
  // assinatura reciclada costuma ser o INÍCIO de uma sentença no meio de um parágrafo
  // ("A mão soube antes da cabeça, do jeito…" vs "…, esterçou para a rampa") — que os
  // slots aforísticos (parágrafo isolado/molde) não pegam. Só o prefixo, filtrado por
  // conteúdo, comparado verbatim/shingle no ledger.
  for (const f of dividirFrases(t)) {
    if (ehDialogoOuTag(f)) continue; // fala/tag não é assinatura autoral
    const pal = normalizarTrecho(f).split(" ").filter(Boolean);
    const origW = f.trim().split(/\s+/);
    for (const k of [6, 8]) if (pal.length > k) emit(origW.slice(0, k).join(" "), pal.slice(0, k).join(" "));
  }
  return out;
}

function _shingles(norm: string, k = 4): Set<string> {
  const w = norm.split(" ").filter(Boolean);
  const s = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(" "));
  if (!s.size && w.length) s.add(w.join(" "));
  return s;
}
function _jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface RepeticaoCross { trecho: string; capituloAnterior: number; tipo: "verbatim" | "quase-verbatim"; score: number }

// Compara os slots do capítulo atual contra o ledger de capítulos anteriores.
export function detectarRepeticaoCrossCapitulo(
  capituloAtual: string,
  anteriores: { numero: number; trecho: string }[]
): RepeticaoCross[] {
  const slots = extrairSlotsAforisticos(capituloAtual);
  const ant = anteriores.map((a) => {
    const norm = normalizarTrecho(a.trecho);
    return { numero: a.numero, norm, sh: _shingles(norm) };
  });
  const out: RepeticaoCross[] = [];
  const jaVi = new Set<string>();
  for (const s of slots) {
    if (jaVi.has(s.normalizado)) continue;
    const v = ant.find((a) => a.norm === s.normalizado);
    if (v) { out.push({ trecho: s.original, capituloAnterior: v.numero, tipo: "verbatim", score: 1 }); jaVi.add(s.normalizado); continue; }
    const ssh = _shingles(s.normalizado);
    let best = { num: -1, score: 0 };
    for (const a of ant) { const j = _jaccard(ssh, a.sh); if (j > best.score) best = { num: a.numero, score: j }; }
    if (best.score >= 0.6) { out.push({ trecho: s.original, capituloAnterior: best.num, tipo: "quase-verbatim", score: Math.round(best.score * 100) / 100 }); jaVi.add(s.normalizado); }
  }
  return out;
}

export interface EntradaLedger { capitulo: number; trecho_normalizado: string; trecho_original: string }

// Devolve as NOVAS entradas do ledger para um capítulo (o caller concatena/persiste).
export function entradasLedgerDoCapitulo(capitulo: number, texto: string): EntradaLedger[] {
  return extrairSlotsAforisticos(texto).map((s) => ({ capitulo, trecho_normalizado: s.normalizado, trecho_original: s.original }));
}

// ---------------------------------------------------------------------------
// 7) ARITMÉTICA DE DIA/HORA (AUDITORIA-DAN-BROWN-V2, gap 3b). O gate de spec só
//    confere PRESENÇA do campo; não faz a conta. Bug real: spec-16 "SEXTA DIA N+3"
//    e spec-17 "SEXTA DIA N+4" — offset avança, dia-da-semana não. Formato medido:
//    "Dia/Hora corrente:** <DIA-SEMANA>, DIA N+<k> — **<hora>**". Degrade gracioso:
//    spec sem dia-da-semana OU sem N+k é ignorada (não dá para checar).
// ---------------------------------------------------------------------------
const _DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

export function parseDiaHora(texto: string): { dia: number; offset: number } | null {
  const t = normalizarTrecho(texto); // minúsculo, sem acento (sabado, terca…)
  let dia = -1;
  for (let i = 0; i < _DIAS_SEMANA.length; i++) {
    if (new RegExp(`\\b${_DIAS_SEMANA[i]}(?:\\s*feira)?\\b`).test(t)) { dia = i; break; }
  }
  const m = /\bdia n\s*\+?\s*(\d+)\b/.exec(t);
  const offset = m ? parseInt(m[1], 10) : NaN;
  if (dia < 0 || Number.isNaN(offset)) return null;
  return { dia, offset };
}

export interface DiaHoraInconsistencia { capitulo: number; motivo: string }

// Checa a sequência de specs (em ordem de capítulo): offset avança ⇒ dia-da-semana
// avança na mesma medida (mod 7). Só usa a linha "Dia/Hora corrente".
export function checarDiaHoraSequencia(specs: { numero: number; diaHoraLinha: string }[]): DiaHoraInconsistencia[] {
  const parsed = specs
    .map((s) => ({ numero: s.numero, dh: parseDiaHora(s.diaHoraLinha) }))
    .filter((x) => x.dh) as { numero: number; dh: { dia: number; offset: number } }[];
  const out: DiaHoraInconsistencia[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const a = parsed[i - 1], b = parsed[i];
    const dOff = b.dh.offset - a.dh.offset;
    if (dOff < 0) { out.push({ capitulo: b.numero, motivo: `DIA N+${b.dh.offset} retrocede vs N+${a.dh.offset} (cap ${a.numero})` }); continue; }
    const esperado = (((a.dh.dia + dOff) % 7) + 7) % 7;
    if (b.dh.dia !== esperado)
      out.push({ capitulo: b.numero, motivo: `${_DIAS_SEMANA[b.dh.dia]} em DIA N+${b.dh.offset} incoerente: cap ${a.numero} era ${_DIAS_SEMANA[a.dh.dia]} (N+${a.dh.offset}); +${dOff}d ⇒ ${_DIAS_SEMANA[esperado]}` });
  }
  return out;
}

// ===========================================================================
// TRANSPARÊNCIA (AUDITORIA-ESTILO-DANBROWN.md, 2026-07-17): o eixo que faltava.
// Os detectores acima medem tique BARATO (staccato, muleta, molde); estes medem
// o ornamento CARO que passava limpo (gnômico, personificação, sanfona, adjetivo
// avaliativo, piso de declarativas, diálogo, metáfora). TODOS nascem em modo
// SINAL (alimentam o prompt do revisor; NÃO bloqueiam). Promoção a gate é POR
// SKILL via ORC_TRANSPARENCIA_POR_SKILL — cota dura só entra para a skill que
// validou zero falso-positivo nos capítulos-controle do benchmark (regra da
// convergência 2026-07-13: um FP aqui trava a produção inteira).
// D2/D3/D4 são sinal-FORTE deliberadamente inclusivo: a precisão final vem do
// revisor (mesma filosofia do causal-gnômico acima).
// ===========================================================================

const _NAO_LETRA = "(?<![\\p{L}\\d_])";
const _FIM_LETRA = "(?![\\p{L}\\d_])";

// --- D1: GNÔMICO AMPLIADO (estende contarCausalGnomico: além do "porque"+cópula,
//     pega a máxima-cópula "X é uma forma de Y", o sujeito genérico "Homens que…"
//     e o infinitivo-sujeito "Guardar é…"). Quiasmo fica para o revisor (semântica).
const _RE_MAXIMA_FORMA = new RegExp(
  `${_NAO_LETRA}(é|era|são|eram|foi)\\s+(?:só\\s+|sempre\\s+)?(?:uma?\\s+|[oa]\\s+|minha\\s+|meu\\s+|sua\\s+|seu\\s+)?(forma|maneira|jeito|modo|métrica|questão|arte|hábito|categoria|luxo|ofício)s?\\s+de${_FIM_LETRA}`,
  "iu",
);
const _RE_SUJEITO_GENERICO = /^(?:(homens|mulheres|gente|pessoas|tod[oa]\s+\p{L}+|um\s+homem|uma\s+mulher|um\s+alvo|uma\s+ferramenta)\s+que|quem)\s+\p{L}/iu;
// Máxima DEFINITÓRIA de sujeito genérico: "Um X que <faz Y> (não) é/são Z" —
// define uma categoria, não descreve um indivíduo concreto (que não fecha em
// cópula-definição). Exige a cópula após a oração relativa ("Um operador que
// retém material não é um operador"; "Um arquivamento que deixa cópia é malfeito").
// "Um homem que esperava junto ao portão" (sem cópula-definição) NÃO casa.
const _RE_DEFINICAO_GENERICA = /^um[a]?\s+\p{L}+\s+que\s+[^.!?]{3,70}?\s+(?:n[ãa]o\s+)?(é|s[ãa]o|era|eram)\s+(?!(?:el[ea]|o\s|a\s|os\s|as\s)\b)/iu;
// Máxima de plural genérico no PRESENTE ("Os doentes enterram a si mesmos.",
// "Curadores não perguntam — curam."): plural + verbo em -am/-em presente
// (rejeita os passados -aram/-eram/-iram/-avam/-iam).
const _RE_PLURAL_PRESENTE = /^(?:[oa]s\s+)?\p{Ll}\p{L}+(?:es|ns|is|s)\s+(?:n[ãa]o\s+|nunca\s+|s[óo]\s+)?(\p{L}+[ae]m)(?![\p{L}\d_])/iu;
const _RE_VERBO_PASSADO_3PL = /(aram|eram|iram|avam|iam)$/iu;
const _RE_INFINITIVO_SUJEITO = /^(?:e\s+|mas\s+)?[\p{L}]+(?:ar|er|ir)\s+(?:\p{Ll}+\s+){0,2}?(é|era|não\s+(?:é|era))\b/iu;
const _RE_E_SEMPRE = /(?<![\p{L}\d_])(é|são|era|eram)\s+sempre\s/iu;
const _RE_MAIS_DO_QUE = /^é\s+mais\s+\p{L}+\s+[^.!?]{0,40}\s+do\s+que\b/iu;
const _RE_IMPESSOAL_MAXIMA = /^n[ãa]o\s+se\s+\p{L}+[aei](m?)\s/iu;
const _RE_DEITICO = /(?<![\p{L}\d_])(aqui|agora|hoje|ontem|amanh[ãa]|neste|nesta|desse|dessa|deste|desta|aquele|aquela|este|esta)(?![\p{L}\d_])/iu;
// Sujeito abstrato + cópula curta ("Lealdade é uma métrica…", "a beleza é sempre…").
const _ABSTRATOS_GNOMICO_EXTRA = "lealdade|desempenho|amor|ódio|coragem|covardia|guardar|lembrar|esquecer|esperar|explicar|acreditar|confiar";

// Segmentos candidatos: a frase inteira + cláusulas finais após ":" ou travessão
// (a máxima costuma fechar a frase: "…uma tática antiga: quem preenche o silêncio
// primeiro entrega mais do que pretende").
function _segmentosMaxima(s: string): string[] {
  const out = [s];
  for (const parte of s.split(/[:—–]/).slice(1)) {
    const p = parte.trim();
    if (p) out.push(p);
  }
  return out;
}
// Nome próprio fora da 1ª palavra = referente concreto (a 1ª sempre é maiúscula).
function _temNomeProprioInterno(seg: string): boolean {
  const semPrimeira = seg.replace(/^\s*[\p{L}\d’'-]+\s*/u, "");
  return _RE_NOME_PROPRIO.test(semPrimeira);
}
function _ehMaxima(segBruto: string): boolean {
  if (/\?["'”’»)\]]*\s*$/.test(segBruto)) return false; // pergunta não é máxima
  const seg = segBruto.replace(/^[\s,;]+/, "").replace(/[.!?…\s]+$/, "");
  const nw = palavrasFrase(seg);
  if (nw < 3 || nw > 22) return false;
  if (/\d/.test(seg) || _temNomeProprioInterno(seg) || _RE_DEITICO.test(seg)) return false;
  const nu = semAbertura(seg);
  if (_RE_MAXIMA_FORMA.test(nu)) return true;
  if (_RE_SUJEITO_GENERICO.test(nu) && nw <= 18) return true;
  if (_RE_DEFINICAO_GENERICA.test(nu) && nw <= 20) return true;
  if (_RE_INFINITIVO_SUJEITO.test(nu)) return true;
  if (_RE_E_SEMPRE.test(nu)) return true;
  if (_RE_MAIS_DO_QUE.test(nu)) return true;
  if (_RE_IMPESSOAL_MAXIMA.test(nu) && nw <= 12) return true;
  const plu = _RE_PLURAL_PRESENTE.exec(nu);
  if (plu && nw <= 12 && !_RE_VERBO_PASSADO_3PL.test(plu[1])) return true;
  // Sujeito abstrato nomeado + cópula, fechando curto (máxima clássica).
  const reAbstrCop = new RegExp(
    `^(?:[oa]s?\\s+)?(${_ABSTRATOS}|${_ABSTRATOS_GNOMICO_EXTRA})\\s+(?:\\p{Ll}+\\s+){0,2}?(é|são|era|eram)\\s`,
    "iu",
  );
  if (reAbstrCop.test(nu) && nw <= 16) return true;
  return false;
}

export interface GnomicoSinal {
  n: number;               // total (narração + diálogo)
  narracao: number;
  dialogo: number;
  exemplos: string[];
  limiar: number;
  acima: boolean;
}
export const LIMIAR_GNOMICO = 2; // meta do contrato do revisor: ≤2/capítulo

export function contarGnomico(texto: string): GnomicoSinal {
  const exemplos: string[] = [];
  let narracao = 0, dialogo = 0;
  const { fr, narr } = frasesRotuladas(semHeadings(texto ?? ""));
  for (let i = 0; i < fr.length; i++) {
    const s = fr[i].replace(/\s+/g, " ").trim();
    const hit = _segmentosMaxima(s).find(_ehMaxima);
    if (!hit) continue;
    if (narr[i]) narracao++; else dialogo++;
    exemplos.push(hit.trim().slice(0, 90));
  }
  // O causal ("…porque esperar era uma maneira de mentir") soma sem dupla
  // contagem quando a frase inteira já foi marcada acima: dedup por frase.
  const causal = contarCausalGnomico(texto);
  const causalNovos = causal.exemplos.filter((ex) => !exemplos.some((e) => e.includes(ex.slice(7, 40))));
  const n = exemplos.length + causalNovos.length;
  return {
    n,
    narracao: narracao + causalNovos.length, // o causal ignora diálogo por construção
    dialogo,
    exemplos: exemplos.concat(causalNovos).slice(0, 6),
    limiar: LIMIAR_GNOMICO,
    acima: n > LIMIAR_GNOMICO,
  };
}

// --- D2: PERSONIFICAÇÃO de abstração / corpo-agente. Lista ABERTA (a fechada
//     subdetectou 1-2 ordens de grandeza na auditoria). Exclusões codificadas:
//     símile ("como se a memória…" é D7, não D2), idiomatismo morto, fala de
//     pessoa por metonímia comum ("a voz respondeu" após travessão adjacente).
const _ABSTRATOS =
  "raz[ãa]o|medo|sil[êe]ncio|mem[óo]ria|lembran[çc]a|d[úu]vida|certeza|culpa|p[âa]nico|instinto|l[óo]gica|esperan[çc]a|verdade|mentira|solid[ãa]o|pressa|paci[êe]ncia|ambi[çc][ãa]o|cidade|noite|manh[ãa]|madrugada|escurid[ãa]o|disciplina|rotina|h[áa]bito|hist[óo]ria|passado|futuro|dist[âa]ncia|beleza|dor|raiva|fome|cansa[çc]o|aus[êe]ncia|piedade|f[ée]|intui[çc][ãa]o|paranoia|programa|sistema|m[áa]quina|maquinaria|aparato|aparelho|mecanismo|engrenagem|dispositivo|protocolo|procedimento|burocracia|institui[çc][ãa]o|ag[êe]ncia|organiza[çc][ãa]o|frieza|lista|casa|papel|terra";
const _CORPO =
  "m[ãa]os?|mand[íi]bula|corpo|cabe[çc]a|olhos|dedos?|pulso|est[ôo]mago|garganta|pele|reflexo|ombros?|joelhos?|p[ée]s?";
const _V_AGENTE =
  "decid|soub|sab|escolh|recus|insist|mentiu|mente|mentia|respond|pergunt|esper|aprend|entend|negoci|vot|convoc|devor|cortej|tra[íi]|desist|promet|cobr|exig|aceit|compr|vend|ensin|obedec|comand|arquiv|julg|perdo|castig|conden|resist|pediu|ped|guard|acredit|fingi|fing|desmen|denunci|entreg|conspir|vigi|trabalh|serv|dorm|acord|respir|fez|faz|fazia|mud|vir[oa]|volt|segu|encolh|permiti|concord|discord|hesit|teim|obrig|convenc|abandon|persegu|acus|absolv|fal(?:a|ou|ava|am)|ench|devolv|escrev|pediu|dit(?:a|ou|ava)|contou|conta|contava|chama|chamou|puxou|puxa|puxava";
const _RE_PERSONIFICACAO = new RegExp(
  // artigo/possessivo + [adjetivo?] + substantivo abstrato/corpo + [", aparte,"?]
  // + ["que"?] + janela curta + [neg/refl/aux?] + verbo de agência
  `${_NAO_LETRA}(?:o|a|os|as|sua|seu|minha|meu|aquela?|essa?|esta?|própri[oa])\\s+(?:\\p{Ll}+\\s+)?(${_ABSTRATOS}|${_CORPO})(?:,\\s+[^,.!?]{1,25},)?\\s+(?:que\\s+)?(?:\\p{Ll}+\\s+){0,3}?(?:se\\s+|j[áa]\\s+|n[ãa]o\\s+|nunca\\s+|vai\\s+|ia\\s+|tinham?\\s+)?(${_V_AGENTE})\\p{Ll}*${_FIM_LETRA}`,
  "iu",
);
const _IDIOMATISMOS = [
  /peg(ou|a|ava)\s+fogo/iu, /conta\s+(n[ãa]o\s+)?fecha/iu, /tempo\s+pass/iu,
  /cora[çc][ãa]o\s+(bat|dispar|acele)/iu, /cabe[çc]a\s+do[íi]/iu, /est[ôo]mago\s+ronc/iu,
  /casa\s+ca[íi]/iu, /porta\s+(abriu|fechou|bateu)/iu,
];

export interface PersonificacaoSinal { n: number; por1000: number; exemplos: string[]; acima: boolean }
export const LIMIAR_PERSONIFICACAO_1000 = 1.5; // meta: ≤1/1000 (folga de sinal: 1.5)

export function contarPersonificacao(texto: string): PersonificacaoSinal {
  const exemplos: string[] = [];
  const { fr, narr } = frasesRotuladas(semHeadings(texto ?? ""));
  for (let i = 0; i < fr.length; i++) {
    if (!narr[i]) continue; // fala de personagem: voz dele, revisor julga
    const s = fr[i].replace(/\s+/g, " ");
    const m = _RE_PERSONIFICACAO.exec(s);
    if (!m) continue;
    const antes = s.slice(0, m.index);
    if (/\bcomo\s+(se|quem)?\s*$/iu.test(antes)) continue;   // símile explícito ⇒ D7
    if (_IDIOMATISMOS.some((re) => re.test(m[0]) || re.test(s))) continue;
    exemplos.push(s.trim().slice(0, 100));
  }
  const palavras = (semHeadings(texto ?? "").match(/[\p{L}\d’'-]+/gu) ?? []).length;
  const por1000 = palavras ? Math.round((exemplos.length / palavras) * 10000) / 10 : 0;
  return { n: exemplos.length, por1000, exemplos: exemplos.slice(0, 6), acima: por1000 > LIMIAR_PERSONIFICACAO_1000 };
}

// --- D3: FRASE-SANFONA (a mesma percepção reformulada em cadeia). Três moldes
//     operacionais: escada "de que… de que…", dupla-negação reformuladora
//     ("não X — Y" ×2 ou "não X, mas Y" + outra reformulação) e aposto-sobre-
//     aposto (≥2 travessões internos OU ≥3 vírgulas fora de enumeração).
//     Guarda anti-enumeração: segmentos curtos (≤3 palavras) entre vírgulas
//     sem cópula = lista legítima, não sanfona.
export interface SanfonaSinal { n: number; exemplos: string[]; limiar: number; acima: boolean }
export const LIMIAR_SANFONA = 1; // meta: ≤1/capítulo

function _ehEnumeracao(s: string): boolean {
  const meio = s.split(/[—–]/)[0];
  const seg = meio.split(",").map((x) => x.trim()).filter(Boolean);
  if (seg.length < 3) return false;
  const curtos = seg.slice(1).filter((x) => palavrasFrase(x) <= 3 && !_RE_COP_GNOMICA.test(x));
  return curtos.length >= seg.length - 2;
}

export function contarSanfona(texto: string): SanfonaSinal {
  const exemplos: string[] = [];
  for (const f of dividirFrases(semHeadings(texto ?? ""))) {
    if (ehDialogo(f)) continue;
    const s = f.replace(/\s+/g, " ");
    const travessoes = (s.match(/[—–]/g) ?? []).length;
    const virgulas = (s.match(/,/g) ?? []).length;
    const escadaDeQue = (s.match(/\bde que\b/giu) ?? []).length >= 2;
    const negacoes = (s.match(/(?<![\p{L}\d_])n[ãa]o\s+\p{L}+/giu) ?? []).length;
    const negReformula = negacoes >= 2 && /(?<![\p{L}\d_])n[ãa]o\s+[^,;—–]{2,40}[,;—–]\s*(mas|e sim|s[óo]|é)\b/iu.test(s);
    const apostoDenso = (travessoes >= 2 || virgulas >= 3) && !_ehEnumeracao(s) && palavrasFrase(s) >= 18;
    if (escadaDeQue || negReformula || (apostoDenso && (negacoes >= 1 || _RE_COP_GNOMICA.test(s))))
      exemplos.push(s.trim().slice(0, 110));
  }
  return { n: exemplos.length, exemplos: exemplos.slice(0, 5), limiar: LIMIAR_SANFONA, acima: exemplos.length > LIMIAR_SANFONA };
}

// --- D4: ADJETIVO AVALIATIVO em objeto físico ("facho honesto", "papel estúpido").
//     Tique RARO (0,4-1,1/1000 na auditoria) e de alto risco de FP ⇒ SÓ SINAL,
//     nunca cota dura. Lista curada dos dois lados.
const _ADJ_AVALIATIVO =
  "honest[oa]s?|decentes?|est[úu]pid[oa]s?|educad[oa]s?|generos[oa]s?|cru[ée]is|cruel|arrogantes?|t[íi]mid[oa]s?|pacientes?|impacientes?|entediad[oa]s?|traiçoeir[oa]s?|obedientes?|teimos[oa]s?|humildes?|orgulhos[oa]s?|covardes?|corajos[oa]s?|sincer[oa]s?|mentiros[oa]s?|leais?|ingênu[oa]s?|c[úu]mplices?";
const _OBJETO_FISICO =
  "luz|facho|porta|mesa|corredor|pr[ée]dio|parede|papel|m[áa]quina|rel[óo]gio|estrada|cadeira|janela|copo|telefone|carro|n[úu]mero|letra|n[óo]dulo|cicatriz|l[âa]mpada|muro|pedra|ch[ãa]o|cimento|a[çc]o|vidro|tela|pasta|arquivo|formul[áa]rio|caneta|l[âa]mina|caixa|cofre|mapa|foto|quadro|livro|bloco|gaveta|escada|rampa|vaga|cerca|port[ãa]o";
const _RE_ADJ_OBJ_POS = new RegExp(`${_NAO_LETRA}(${_OBJETO_FISICO})\\s+(?:\\p{Ll}+\\s+)?(?:e\\s+)?(${_ADJ_AVALIATIVO})${_FIM_LETRA}`, "iu");
const _RE_ADJ_OBJ_PRE = new RegExp(`${_NAO_LETRA}(${_ADJ_AVALIATIVO})\\s+(${_OBJETO_FISICO})${_FIM_LETRA}`, "iu");
const _RE_ADJ_OBJ_COP = new RegExp(`${_NAO_LETRA}(${_OBJETO_FISICO})[^.!?]{0,20}\\s(era|é|s[ãa]o|eram|parecia|estava)\\s+(?:\\p{Ll}+\\s+)?(${_ADJ_AVALIATIVO})${_FIM_LETRA}`, "iu");

export interface AdjetivoAvaliativoSinal { n: number; exemplos: string[] }
export function contarAdjetivoAvaliativo(texto: string): AdjetivoAvaliativoSinal {
  const exemplos: string[] = [];
  for (const f of dividirFrases(semHeadings(texto ?? ""))) {
    const s = f.replace(/\s+/g, " ");
    if (_RE_ADJ_OBJ_POS.test(s) || _RE_ADJ_OBJ_PRE.test(s) || _RE_ADJ_OBJ_COP.test(s))
      exemplos.push(s.trim().slice(0, 100));
  }
  return { n: exemplos.length, exemplos: exemplos.slice(0, 5) };
}

// --- D5: PISO de frases declarativas simples. Mesma heurística da auditoria
//     (comparabilidade da régua): ≤15 palavras, ≤1 vírgula, sem travessão
//     interno/';', não-interrogativa/exclamativa, sem subordinativa inicial.
const _RE_SUBORD_INICIAL = /^(quando|embora|enquanto|se|porque|como\s+se|apesar|ainda\s+que|mesmo\s+que)\b/iu;
export interface DeclarativasSinal { pct: number; frases: number; abaixo: boolean }
export const PISO_DECLARATIVAS_PCT = 50; // meta: ≥50%

export function percentDeclarativasSimples(texto: string): DeclarativasSinal {
  const fr = dividirFrases(semHeadings(texto ?? ""));
  if (!fr.length) return { pct: 0, frases: 0, abaixo: false };
  let simples = 0;
  for (const f of fr) {
    const s = semAbertura(f);
    const interno = s.slice(1); // travessão de fala inicial já removido
    if (/[?!]["'”’»)\]]*$/.test(f)) continue;
    if (/[—–;]/.test(interno)) continue;
    if ((s.match(/,/g) ?? []).length > 1) continue;
    if (palavrasFrase(f) > 15) continue;
    if (_RE_SUBORD_INICIAL.test(s)) continue;
    simples++;
  }
  const pct = Math.round((simples / fr.length) * 1000) / 10;
  return { pct, frases: fr.length, abaixo: fr.length >= 20 && pct < PISO_DECLARATIVAS_PCT };
}

// --- D6: DIÁLOGO / interioridade contínua. % de palavras em parágrafos de fala
//     (mesma convenção da auditoria) + maior sequência de frases de narração
//     "estática" (RE_ESTATICO) sem evento. O piso de diálogo só faz sentido com
//     ≥2 personagens em cena — quem sabe disso é a spec; o chamador passa.
export interface DialogoSinal { dialogoPct: number; maxInterioridadeSeguida: number; abaixo: boolean }
export const PISO_DIALOGO_PCT = 15;      // meta (≥2 personagens em cena)
export const TETO_INTERIORIDADE_RUN = 3; // meta (personagem sozinho)

export function sinalDialogoInterioridade(texto: string, doisOuMaisEmCena = true): DialogoSinal {
  const t = semHeadings(texto ?? "");
  let palavrasFala = 0, palavrasTotal = 0;
  for (const par of t.split(/\n{2,}/)) {
    const n = (par.match(/[\p{L}\d’'-]+/gu) ?? []).length;
    palavrasTotal += n;
    if (/^[\s>]*[—–]/.test(par)) palavrasFala += n;
  }
  const dialogoPct = palavrasTotal ? Math.round((palavrasFala / palavrasTotal) * 1000) / 10 : 0;
  const { fr, narr } = frasesRotuladas(t);
  let run = 0, maxRun = 0;
  for (let i = 0; i < fr.length; i++) {
    if (narr[i] && RE_ESTATICO.test(fr[i])) { run++; maxRun = Math.max(maxRun, run); }
    else run = 0;
  }
  const abaixo = doisOuMaisEmCena
    ? dialogoPct < PISO_DIALOGO_PCT && palavrasTotal > 600
    : maxRun > TETO_INTERIORIDADE_RUN;
  return { dialogoPct, maxInterioridadeSeguida: maxRun, abaixo };
}

// --- D7: METÁFORA ELABORADA (teto ≈1/300 palavras; cadeia = 2 a <300 palavras).
//     Absorve os gatilhos explícitos; o símile-andaime ("como se") mantém seu
//     teto próprio nos MOLDES — aqui medimos DENSIDADE e CADEIA.
const _RE_METAFORA = /(?<![\p{L}\d_])(como\s+se|como\s+quem|feito\s+\p{L}|igual\s+a\s|como\s+uma?\s)/giu;
export interface MetaforaSinal { n: number; por300: number; cadeias: number; exemplos: string[]; acima: boolean }
export function contarMetaforaElaborada(texto: string): MetaforaSinal {
  const t = semHeadings(texto ?? "");
  const posicoes: number[] = [];
  const exemplos: string[] = [];
  let m: RegExpExecArray | null;
  _RE_METAFORA.lastIndex = 0;
  while ((m = _RE_METAFORA.exec(t)) !== null) {
    posicoes.push((t.slice(0, m.index).match(/[\p{L}\d’'-]+/gu) ?? []).length);
    exemplos.push(t.slice(m.index, m.index + 80).replace(/\s+/g, " ").trim());
  }
  const palavras = (t.match(/[\p{L}\d’'-]+/gu) ?? []).length;
  let cadeias = 0;
  for (let i = 1; i < posicoes.length; i++) if (posicoes[i] - posicoes[i - 1] < 300) cadeias++;
  const por300 = palavras ? Math.round((posicoes.length / palavras) * 300 * 100) / 100 : 0;
  return { n: posicoes.length, por300, cadeias, exemplos: exemplos.slice(0, 5), acima: por300 > 1 || cadeias > 0 };
}

// --- AGREGADOR: sinais legíveis para o prompt do revisor (mesmo formato dos
//     sinais consultivos existentes) + gate opcional POR SKILL.
export interface OrcamentoTransparencia {
  gnomico: number;            // teto por capítulo
  personificacaoPor1000: number;
  sanfona: number;
  declarativasMinPct: number;
  bloqueia: boolean;          // false = tudo sinal (default de toda skill)
  // AUDITORIA-HOOVER (CR4): eixos PROTEGIDOS nas skills intimistas. Ausentes/true =
  // comportamento dan-brown (emite os sinais). false = NÃO emite o sinal (a
  // interioridade/metáfora emocional é feature, não defeito). Só a CADEIA de metáfora
  // continua a sinalizar quando `metaforaDensidade:false`.
  pisoDeclarativas?: boolean; // default true (emite "declarativas <piso%")
  pisoDialogo?: boolean;      // default true (emite "diálogo <15%" / "interioridade contínua")
  metaforaDensidade?: boolean;// default true (emite por densidade>1 OU cadeia); false = só cadeia
}
export const SINAL_TRANSPARENCIA: OrcamentoTransparencia = {
  gnomico: LIMIAR_GNOMICO, personificacaoPor1000: LIMIAR_PERSONIFICACAO_1000,
  sanfona: LIMIAR_SANFONA, declarativasMinPct: PISO_DECLARATIVAS_PCT, bloqueia: false,
};
// Promoção POR SKILL (fatia 5 do plano): só entra aqui skill validada no
// benchmark com zero FP nos capítulos-controle. Vazio = nenhum bloqueio.
// hoover-mcfadden (AUDITORIA-HOOVER.md): SINAL (bloqueia:false) dos 4 alvos de
// ornamento (gnômico/personificação/sanfona/adjetivo), MAS com os eixos protegidos
// DESLIGADOS — sem piso de declarativa, sem piso de diálogo, metáfora só sinaliza em
// CADEIA. A voz emocional em 1ª pessoa (interioridade/metáfora sentimental) é feature.
export const ORC_TRANSPARENCIA_POR_SKILL: Record<string, OrcamentoTransparencia> = {
  "hoover-mcfadden": {
    gnomico: LIMIAR_GNOMICO, personificacaoPor1000: LIMIAR_PERSONIFICACAO_1000,
    sanfona: LIMIAR_SANFONA, declarativasMinPct: PISO_DECLARATIVAS_PCT, bloqueia: false,
    pisoDeclarativas: false, pisoDialogo: false, metaforaDensidade: false,
  },
};

export function orcTransparenciaParaSkill(skill?: string | null): OrcamentoTransparencia {
  return (skill && ORC_TRANSPARENCIA_POR_SKILL[skill]) || SINAL_TRANSPARENCIA;
}

export interface TransparenciaResultado {
  gnomico: GnomicoSinal;
  personificacao: PersonificacaoSinal;
  sanfona: SanfonaSinal;
  adjetivoAvaliativo: AdjetivoAvaliativoSinal;
  declarativas: DeclarativasSinal;
  dialogo: DialogoSinal;
  metafora: MetaforaSinal;
  linhas: string[];   // sinais formatados p/ prompt (vazio se nada digno de nota)
  ofensores: string[]; // SÓ quando orc.bloqueia — o que estourou a cota dura
}

export function diagnosticarTransparencia(
  texto: string,
  skill?: string | null,
  doisOuMaisEmCena = true,
): TransparenciaResultado {
  const orc = orcTransparenciaParaSkill(skill);
  const gnomico = contarGnomico(texto);
  const personificacao = contarPersonificacao(texto);
  const sanfona = contarSanfona(texto);
  const adjetivoAvaliativo = contarAdjetivoAvaliativo(texto);
  const declarativas = percentDeclarativasSimples(texto);
  const dialogo = sinalDialogoInterioridade(texto, doisOuMaisEmCena);
  const metafora = contarMetaforaElaborada(texto);

  const linhas: string[] = [];
  if (gnomico.n > orc.gnomico)
    linhas.push(`fecho gnomico/maxima ${gnomico.n}x (alvo <= ${orc.gnomico}; ex.: ${gnomico.exemplos[0] ?? ""})`);
  if (personificacao.por1000 > orc.personificacaoPor1000)
    linhas.push(`personificacao de abstracao ${personificacao.n}x (${personificacao.por1000}/1000; ex.: ${personificacao.exemplos[0] ?? ""})`);
  if (sanfona.n > orc.sanfona)
    linhas.push(`frase-sanfona ${sanfona.n}x (alvo <= ${orc.sanfona}; ex.: ${sanfona.exemplos[0] ?? ""})`);
  if (adjetivoAvaliativo.n > 1)
    linhas.push(`adjetivo avaliativo em objeto ${adjetivoAvaliativo.n}x (ex.: ${adjetivoAvaliativo.exemplos[0] ?? ""})`);
  if (orc.pisoDeclarativas !== false && declarativas.abaixo)
    linhas.push(`frases declarativas simples ${declarativas.pct}% (piso ${orc.declarativasMinPct}%)`);
  if (orc.pisoDialogo !== false && dialogo.abaixo)
    linhas.push(doisOuMaisEmCena
      ? `dialogo ${dialogo.dialogoPct}% das palavras (piso ${PISO_DIALOGO_PCT}% com 2+ em cena)`
      : `interioridade continua ${dialogo.maxInterioridadeSeguida} frases seguidas (teto ${TETO_INTERIORIDADE_RUN})`);
  // Metáfora: default sinaliza por densidade OU cadeia; nas skills intimistas
  // (metaforaDensidade:false) só a CADEIA é defeito — a metáfora sentimental isolada fica.
  const metaforaSinaliza = orc.metaforaDensidade === false ? metafora.cadeias > 0 : metafora.acima;
  if (metaforaSinaliza)
    linhas.push(`metafora elaborada ${metafora.n}x (${metafora.por300}/300 palavras; cadeias ${metafora.cadeias})`);

  const ofensores = orc.bloqueia
    ? linhas.filter((l) =>
        /^(fecho gnomico|personificacao|frase-sanfona|frases declarativas)/.test(l))
    : [];
  return { gnomico, personificacao, sanfona, adjetivoAvaliativo, declarativas, dialogo, metafora, linhas, ofensores };
}
