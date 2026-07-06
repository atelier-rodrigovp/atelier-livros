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
