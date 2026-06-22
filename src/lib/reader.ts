// Renderer leve de Markdown -> HTML para a PROSA dos capítulos (não é um parser
// genérico): cobre o subconjunto que as skills produzem — títulos, parágrafos,
// ênfase, citações e separadores de cena. Escapa HTML antes de formatar.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Ênfase inline: **negrito**, *itálico* / _itálico_. Aplicada após o escape.
function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

const SEP = /^\s*([*\-_]\s*){3,}$/; // ---, ***, * * *

export function mdToHtml(md: string): string {
  const linhas = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragrafo: string[] = [];
  let citacao: string[] = [];

  const fecharParagrafo = () => {
    if (paragrafo.length) {
      out.push(`<p>${inline(paragrafo.join(" "))}</p>`);
      paragrafo = [];
    }
  };
  const fecharCitacao = () => {
    if (citacao.length) {
      out.push(`<blockquote>${inline(citacao.join(" "))}</blockquote>`);
      citacao = [];
    }
  };
  const fecharTudo = () => {
    fecharParagrafo();
    fecharCitacao();
  };

  for (const raw of linhas) {
    const linha = raw.trimEnd();
    if (!linha.trim()) {
      fecharTudo();
      continue;
    }
    if (SEP.test(linha)) {
      fecharTudo();
      out.push('<hr class="cena" />');
      continue;
    }
    const h = linha.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      fecharTudo();
      const nivel = h[1].length;
      out.push(`<h${nivel}>${inline(h[2])}</h${nivel}>`);
      continue;
    }
    const cit = linha.match(/^>\s?(.*)$/);
    if (cit) {
      fecharParagrafo();
      citacao.push(cit[1]);
      continue;
    }
    fecharCitacao();
    paragrafo.push(linha.trim());
  }
  fecharTudo();
  return out.join("\n");
}

// Primeiro título de um markdown (para usar como nome do capítulo quando faltar).
export function primeiroTitulo(md: string): string | null {
  const m = (md ?? "").match(/^\s*#{1,4}\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
