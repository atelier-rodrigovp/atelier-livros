// Parser + renderer do relatório da skill `book-bestseller-review` para uma
// leitura EDITORIAL (resumo executivo → seções → tabela de critérios →
// metodologia recolhida ao fim). Renderer de markdown leve, sem libs.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Ênfase inline: `code`, **negrito**, *itálico* / _itálico_. Após o escape.
function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

// Ênfase inline de um trecho (para células de tabela / títulos). Exportada.
export function inlineMd(s: string): string {
  return inline(s);
}

// md → HTML do CORPO de uma seção: parágrafos, sub-títulos (###+), listas,
// citações. Tabelas são tratadas à parte (parseTable) e ignoradas aqui.
export function renderBody(md: string): string {
  const linhas = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let par: string[] = [];
  let li: string[] = [];
  let cit: string[] = [];
  const fp = () => { if (par.length) { out.push(`<p>${inline(par.join(" "))}</p>`); par = []; } };
  const fl = () => { if (li.length) { out.push(`<ul>${li.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); li = []; } };
  const fc = () => { if (cit.length) { out.push(`<blockquote>${inline(cit.join(" "))}</blockquote>`); cit = []; } };
  const fAll = () => { fp(); fl(); fc(); };

  for (const raw of linhas) {
    const l = raw.trim();
    if (!l) { fAll(); continue; }
    if (/^\|.*\|$/.test(l)) continue; // linha de tabela: tratada à parte
    const h = l.match(/^(#{3,6})\s+(.*)$/);
    if (h) { fAll(); const n = Math.min(6, h[1].length); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    const item = l.match(/^[-*]\s+(.*)$/);
    if (item) { fp(); fc(); li.push(item[1]); continue; }
    const c = l.match(/^>\s?(.*)$/);
    if (c) { fp(); fl(); cit.push(c[1]); continue; }
    fl(); fc(); par.push(l);
  }
  fAll();
  return out.join("\n");
}

// Tabela markdown (| a | b |\n|---|---|\n| 1 | 2 |) → { headers, rows }.
export function parseTable(md: string): { headers: string[]; rows: string[][] } | null {
  const linhas = (md ?? "").split("\n").map((l) => l.trim()).filter((l) => /^\|.*\|$/.test(l));
  if (linhas.length < 2) return null;
  const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const headers = cells(linhas[0]);
  const rows = linhas
    .slice(1)
    .filter((l) => !/^[|\s:-]+$/.test(l)) // descarta a linha separadora |---|
    .map(cells);
  return { headers, rows };
}

export interface ReviewModel {
  titulo: string | null;
  nota: number | null;
  veredito: string | null;
  meta: number | null;
  gap: number | null; // distância até a meta
  topFixes: string[]; // títulos dos itens de ALTA prioridade
  panoramaHtml: string | null;
  criterios: { headers: string[]; rows: string[][] } | null;
  fortesHtml: string | null;
  fracos: { prioridade: string; itensHtml: string }[];
  outras: { titulo: string; html: string }[];
  metodologiaHtml: string;
}

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export function parseReview(md: string): ReviewModel {
  const texto = (md ?? "").replace(/\r\n/g, "\n");
  const tituloM = texto.match(/^#\s+(.+)$/m);
  const titulo = tituloM ? tituloM[1].replace(/\*/g, "").trim() : null;

  const partes = texto.split(/^##\s+/m); // [0]=preâmbulo (H1 + blockquote), resto=seções
  const preambulo = partes[0] ?? "";
  const secoes = partes.slice(1).map((s) => {
    const nl = s.indexOf("\n");
    return { heading: (nl < 0 ? s : s.slice(0, nl)).trim(), body: nl < 0 ? "" : s.slice(nl + 1) };
  });

  let nota: number | null = null;
  let veredito: string | null = null;
  let panoramaHtml: string | null = null;
  let criterios: ReviewModel["criterios"] = null;
  let fortesHtml: string | null = null;
  let topFixes: string[] = [];
  const fracos: ReviewModel["fracos"] = [];
  const outras: ReviewModel["outras"] = [];
  const metod: string[] = [];

  // blockquote do preâmbulo (metadados da skill) → metodologia
  const preBq = preambulo.split("\n").filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
  if (preBq.trim()) metod.push(renderBody(preBq));

  for (const sec of secoes) {
    const h = sec.heading;
    if (/NOTA\s*GLOBAL/i.test(h)) {
      nota = num(h.match(/([\d.,]+)\s*\/\s*10/)?.[1]) ?? num(sec.body.match(/([\d.,]+)\s*\/\s*10/)?.[1]);
      veredito = sec.body.match(/Veredito:?\**\s*\*?([^*\n.]+)/i)?.[1]?.trim() ?? null;
      panoramaHtml = renderBody(sec.body);
      continue;
    }
    if (/CRIT[ÉE]RIO/i.test(h)) { criterios = parseTable(sec.body); continue; }
    if (/PONTOS\s+FORTES/i.test(h)) { fortesHtml = renderBody(sec.body); continue; }
    if (/PONTOS\s+FRACOS/i.test(h)) {
      const subs = sec.body.split(/^###\s+/m);
      for (const sub of subs.slice(1)) {
        const nl = sub.indexOf("\n");
        const prioridade = (nl < 0 ? sub : sub.slice(0, nl)).trim();
        const corpo = nl < 0 ? "" : sub.slice(nl + 1);
        fracos.push({ prioridade, itensHtml: renderBody(corpo) });
        if (/ALTA/i.test(prioridade)) {
          topFixes = [...corpo.matchAll(/^\*\*\s*\d+\.\s*(.+?)\*\*/gm)].map((m) => m[1].replace(/\s*\.\s*$/, "").trim());
        }
      }
      continue;
    }
    if (/honestidad|metodolog|m[ée]todo|como a nota|f[óo]rmula|c[áa]lculo/i.test(h)) {
      metod.push(`<h3>${escapeHtml(h)}</h3>${renderBody(sec.body)}`);
      continue;
    }
    outras.push({ titulo: h, html: renderBody(sec.body) });
  }

  const meta = num(texto.match(/meta(?:\s+de\s+nota)?(?:\s+do\s+projeto)?:?\s*\(?([\d.,]+)\)?/i)?.[1]);
  let gap = num(texto.match(/([\d.,]+)\s+abaixo da meta/i)?.[1]);
  if (gap == null && meta != null && nota != null) gap = Math.round((meta - nota) * 10) / 10;

  return { titulo, nota, veredito, meta, gap, topFixes, panoramaHtml, criterios, fortesHtml, fracos, outras, metodologiaHtml: metod.join("\n") };
}
