// ESTADO EDITORIAL persistente (camada editorial — proposta das 9 componentes).
// estado/estado-editorial.json por projeto: estruturado (JSON fixo), schema-free
// (sem DDL). Alicerce das Fases 2–8 (cada uma popula um campo). NÃO se confunde com
// estado/estado-narrativo.md (prosa livre, intocado). Espelhado no runner (Python).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MotifEntry {
  capitulo: number;
  beat: string;
  funcao: "introducao" | "reforco" | "virada" | "pagamento" | "eco-redundante";
}
export interface BlockerReport {
  chapter: number;
  approved: boolean;
  issues: string[];
  rewrite_instructions: string[];
}
export interface EstadoEditorial {
  motif_ledger: MotifEntry[];
  open_loops: string[];
  paid_loops: string[];
  source_reveal_streak: number;
  agency_balance: Record<string, number>;
  exposition_risk: number;
  semantic_repetition_risk: number;
  last_high_impact_scene: number | null;
  commercial_blockers: BlockerReport[];
  next_chapter_editorial_requirements: string[];
}

export const ARQUIVO_ESTADO_EDITORIAL = "estado-editorial.json";

export function estadoEditorialDefault(): EstadoEditorial {
  return {
    motif_ledger: [],
    open_loops: [],
    paid_loops: [],
    source_reveal_streak: 0,
    agency_balance: {},
    exposition_risk: 0,
    semantic_repetition_risk: 0,
    last_high_impact_scene: null,
    commercial_blockers: [],
    next_chapter_editorial_requirements: [],
  };
}

// Merge de um objeto parcial (arquivo legado / campos faltando) com o default:
// projeto antigo sem o arquivo, ou com um arquivo de versão anterior, nunca quebra.
export function mergeEstadoEditorial(parcial: Partial<EstadoEditorial> | null | undefined): EstadoEditorial {
  const d = estadoEditorialDefault();
  const p = (parcial ?? {}) as Partial<EstadoEditorial>;
  return {
    motif_ledger: Array.isArray(p.motif_ledger) ? p.motif_ledger : d.motif_ledger,
    open_loops: Array.isArray(p.open_loops) ? p.open_loops : d.open_loops,
    paid_loops: Array.isArray(p.paid_loops) ? p.paid_loops : d.paid_loops,
    source_reveal_streak: Number.isFinite(p.source_reveal_streak as number) ? (p.source_reveal_streak as number) : d.source_reveal_streak,
    agency_balance: p.agency_balance && typeof p.agency_balance === "object" ? p.agency_balance : d.agency_balance,
    exposition_risk: Number.isFinite(p.exposition_risk as number) ? (p.exposition_risk as number) : d.exposition_risk,
    semantic_repetition_risk: Number.isFinite(p.semantic_repetition_risk as number) ? (p.semantic_repetition_risk as number) : d.semantic_repetition_risk,
    last_high_impact_scene: typeof p.last_high_impact_scene === "number" ? p.last_high_impact_scene : d.last_high_impact_scene,
    commercial_blockers: Array.isArray(p.commercial_blockers) ? p.commercial_blockers : d.commercial_blockers,
    next_chapter_editorial_requirements: Array.isArray(p.next_chapter_editorial_requirements) ? p.next_chapter_editorial_requirements : d.next_chapter_editorial_requirements,
  };
}

// FASE 2 (Agency Gate). Heurística leve (estilo interioridadeSemEvento): o valor do
// campo "Decisão/Ação" da spec é genérico/vazio? Genérico = <8 palavras OU percepção
// passiva ("ele percebeu que…") sem verbo de ação/escolha. NÃO usa IA — só conta/regex.
const _RE_PERCEPCAO = /\b(percebe|percebeu|nota|notou|sente|sentiu|entende|entendeu|imagina|imaginou|pensa|pensou|lembra|lembrou|repara|reparou|observa|observou)\b/i;
const _RE_ACAO = /\b(decid\w+|escolh\w+|faz|fez|age|agiu|arrisc\w+|mat[ao]u?|ment\w+|fog\w+|fugiu|confront\w+|roub\w+|entrega|entregou|revela|revelou|abre|abriu|quebra|quebrou|corta|cortou|liga|ligou|invade|invadiu|persegue|perseguiu|salva|salvou|trai|traiu|destr[óo]i|destruiu)\b/i;
export function agenciaGenerica(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim();
  const nw = (v.match(/\S+/g) ?? []).length;
  if (nw < 8) return true;                                 // vazio/curto demais
  if (_RE_PERCEPCAO.test(v) && !_RE_ACAO.test(v)) return true; // só percepção passiva
  return false;
}

// FASE 3 (Novelty Gate). O campo "Novidade" da spec responde a UMA pergunta; quando
// abre um loop ("pergunta aberta: …") vira open_loops; quando paga ("pergunta paga: …"
// / "responde: …") sai de open_loops e entra em paid_loops. Determinístico/testável.
function _tokens(s: string): Set<string> {
  return new Set(
    (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2)
  );
}
function _melhorMatch(open: string[], alvo: string): number {
  const a = _tokens(alvo);
  let best = -1, bestScore = 0;
  open.forEach((o, i) => {
    const t = _tokens(o);
    const inter = [...a].filter((x) => t.has(x)).length;
    const score = inter / Math.max(1, Math.min(a.size, t.size));
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return bestScore >= 0.3 ? best : -1;
}

export function extrairPerguntas(novidade: string): { abre?: string; paga?: string } {
  const n = novidade ?? "";
  const abre = /pergunta\s+aberta\s*:?\s*(.+)/i.exec(n)?.[1]?.trim() || /\babre\s*:\s*(.+)/i.exec(n)?.[1]?.trim();
  const paga = /pergunta\s+paga\s*:?\s*(.+)/i.exec(n)?.[1]?.trim() || /\bpaga\s*:\s*(.+)/i.exec(n)?.[1]?.trim() || /\bresponde\s*:\s*(.+)/i.exec(n)?.[1]?.trim();
  return { abre, paga };
}

// Processa a "Novidade" de um capítulo contra os loops abertos. Puro (não grava).
export function processarNovidade(estado: EstadoEditorial, novidade: string): EstadoEditorial {
  const { abre, paga } = extrairPerguntas(novidade);
  const open_loops = [...estado.open_loops];
  const paid_loops = [...estado.paid_loops];
  if (paga) {
    const idx = _melhorMatch(open_loops, paga);
    if (idx >= 0) { paid_loops.push(open_loops[idx]); open_loops.splice(idx, 1); }
    else paid_loops.push(paga);
  }
  if (abre) open_loops.push(abre);
  return { ...estado, open_loops, paid_loops };
}

function estadoPath(projDir: string): string {
  return path.join(projDir, "estado", ARQUIVO_ESTADO_EDITORIAL);
}

// Lê o estado-editorial.json (via merge com default). Projeto sem o arquivo → default.
export async function lerEstadoEditorial(projDir: string): Promise<EstadoEditorial> {
  try {
    const raw = await readFile(estadoPath(projDir), "utf8");
    return mergeEstadoEditorial(JSON.parse(raw));
  } catch {
    return estadoEditorialDefault();
  }
}

// Grava (merge → JSON estável de 2 espaços). Idempotente: gravar o mesmo estado 2×
// produz bytes idênticos (chaves na ordem do schema, via mergeEstadoEditorial).
export async function gravarEstadoEditorial(projDir: string, estado: Partial<EstadoEditorial>): Promise<void> {
  const dir = path.join(projDir, "estado");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(estadoPath(projDir), JSON.stringify(mergeEstadoEditorial(estado), null, 2) + "\n", "utf8");
}
