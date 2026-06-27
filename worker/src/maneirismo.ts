// Linter de maneirismo: conta tiques mecânicos de prosa que o avaliador penaliza
// (antíteses "não era X. Era Y.", fragmentos antitéticos, clichês recorrentes).
// Puro/testável. Usado para (a) mirar a passada anti-maneirismo da revisão e
// (b) compor o relatório de alcançabilidade honesto. NÃO altera texto.

export interface PadraoContagem { nome: string; n: number; exemplos: string[] }
export interface ResultadoManeirismo {
  total: number;
  palavras: number;
  por10k: number;        // densidade por 10 mil palavras
  acimaDoOrcamento: boolean;
  padroes: PadraoContagem[]; // ordenado por n desc
}

const PADROES: { nome: string; re: RegExp }[] = [
  { nome: "antítese \"não era X. Era Y.\"", re: /\bn[ãa]o\s+era\b[^.!?\n]{0,60}[.!?]\s+era\b/gi },
  { nome: "antítese \"não X, mas Y\"", re: /\bn[ãa]o\s+\w[^.,;!?\n]{0,50},\s*mas\s+/gi },
  { nome: "fragmento antitético curto (\"Não X. Y.\")", re: /(?:^|[.!?]\s)N[ãa]o\s+[^.!?\n]{1,45}[.!?]\s+[A-ZÀ-Ý]/g },
  { nome: "clichê recorrente", re: /\b(mar de chumbo|clareza fria|sil[êe]ncio ensurdecedor|frio na espinha|cora[çc][ãa]o disparad[oa]|sangue gelad[oa]|n[óo] na garganta)\b/gi },
];

// Orçamento padrão: tiques por 10 mil palavras acima do qual a prosa "estoura".
export const ORCAMENTO_POR_10K = 6;

function contarPalavras(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

export function contarManeirismos(texto: string, orcamentoPor10k = ORCAMENTO_POR_10K): ResultadoManeirismo {
  const t = texto ?? "";
  const palavras = contarPalavras(t);
  const padroes: PadraoContagem[] = PADROES.map(({ nome, re }) => {
    const ms = [...t.matchAll(re)];
    const exemplos = ms.slice(0, 3).map((m) => m[0].replace(/\s+/g, " ").trim().slice(0, 70));
    return { nome, n: ms.length, exemplos };
  }).filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
  const total = padroes.reduce((s, p) => s + p.n, 0);
  const por10k = palavras > 0 ? Math.round((total / palavras) * 10_000 * 10) / 10 : 0;
  return { total, palavras, por10k, acimaDoOrcamento: por10k > orcamentoPor10k, padroes };
}

// Resumo de uma linha para injetar em prompt / relatório.
export function resumoManeirismo(r: ResultadoManeirismo): string {
  if (!r.total) return "Maneirismo: nenhum tique mecânico detectado.";
  const top = r.padroes.slice(0, 3).map((p) => `${p.nome} (${p.n}×)`).join("; ");
  return `Maneirismo: ${r.total} tiques (${r.por10k}/10k palavras${r.acimaDoOrcamento ? ", ACIMA do orçamento" : ""}). Principais: ${top}.`;
}
