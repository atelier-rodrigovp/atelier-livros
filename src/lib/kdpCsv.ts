// Parser tolerante de relatórios KDP (CSV). Os relatórios variam de colunas e
// separador; mapeamos por nome de cabeçalho (case-insensitive, "contém").

export interface SalesRow {
  data: string | null;
  marketplace: string | null;
  idioma: string | null;
  titulo: string | null;
  unidades: number | null;
  royalty: number | null;
  moeda: string | null;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === sep && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toNum(s: string | undefined): number | null {
  if (!s) return null;
  // remove separador de milhar e normaliza decimal
  let t = s.replace(/[^\d.,-]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

export function parseKdpCsv(text: string): SalesRow[] {
  const linhas = text.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = splitCsvLine(linhas[0], sep).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  const find = (cands: string[]) => head.findIndex((h) => cands.some((c) => h.includes(c)));
  const cData = find(["royalty date", "date", "data"]);
  const cMkt = find(["marketplace", "loja"]);
  const cIdioma = find(["language", "idioma"]);
  const cTit = find(["title", "título", "titulo"]);
  const cUn = find(["net units sold", "units sold", "net units", "units", "unidades", "quantidade"]);
  // "royalty" sem ser a coluna "Royalty Date"
  const cRoy = head.findIndex(
    (h) => !h.includes("date") && (h.includes("royalty") || h.includes("royalties") || h.includes("earnings") || h === "valor")
  );
  const cMoeda = find(["currency", "moeda"]);

  const rows: SalesRow[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = splitCsvLine(linhas[i], sep);
    const row: SalesRow = {
      data: cData >= 0 ? cols[cData] || null : null,
      marketplace: cMkt >= 0 ? cols[cMkt] || null : null,
      idioma: cIdioma >= 0 ? cols[cIdioma] || null : null,
      titulo: cTit >= 0 ? cols[cTit] || null : null,
      unidades: cUn >= 0 ? (toNum(cols[cUn]) != null ? Math.round(toNum(cols[cUn]) as number) : null) : null,
      royalty: cRoy >= 0 ? toNum(cols[cRoy]) : null,
      moeda: cMoeda >= 0 ? cols[cMoeda] || null : null,
    };
    if (row.unidades != null || row.royalty != null) rows.push(row);
  }
  return rows;
}

// Normaliza a data para YYYY-MM-DD quando possível (aceita ISO, DD/MM/YYYY, MM/DD/YYYY).
export function normalizaData(s: string | null): string | null {
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}
