// Backfill HONESTO de Quality State para capítulos antigos (F-09).
// Projetos escritos antes do Quality State não têm quality/capitulo-NN.json e,
// portanto, não passam no gate de publicação. Este backfill re-MEDE cada
// capítulo com os detectores determinísticos disponíveis em TS e grava um
// estado vinculado ao hash atual — SEM falsificar aprovação:
//   - detectores acusam excesso  => rewrite_required (blockers reais);
//   - medição limpa              => pending (aprovação exige o loop completo do
//     runner — spec/continuidade/agência — ou exceção humana explícita).
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cadenciaAcima,
  contarMuletas,
  orcCadenciaParaSkill,
} from "./maneirismo.js";
import { hashText, type QualityBlocker, type QualityState } from "./quality-state.js";

export const BACKFILL_DETECTOR_VERSION = "backfill-ts-1.0.0";

export function medirCapituloBackfill(texto: string, skill: string | null): {
  blockers: QualityBlocker[];
  metrics: Record<string, unknown>;
} {
  const blockers: QualityBlocker[] = [];
  const muletas = contarMuletas(texto).filter((m) => m.acima);
  for (const m of muletas)
    blockers.push({
      code: `MULETA:${m.termo}`,
      message: `muleta '${m.termo}' ${m.n}x (${m.por10k.toFixed(1)}/10k; alvo ${m.alvo})`,
      severity: "high",
      metric: "muleta", observed: m.n, target: m.alvo,
    });
  const cadencias = cadenciaAcima(texto, orcCadenciaParaSkill(skill));
  for (const c of cadencias)
    blockers.push({
      code: `CADENCIA:${c.nome}`,
      message: `cadência '${c.nome}' ${c.n}x (alvo ${c.alvo})`,
      severity: "high",
      metric: "cadencia", observed: c.n, target: c.alvo,
    });
  return {
    blockers,
    metrics: {
      words: texto.split(/\s+/).filter(Boolean).length,
      muletaExcess: muletas.length,
      cadenceExcess: cadencias.length,
    },
  };
}

export function estadoBackfill(texto: string, skill: string | null, agora: () => string = () => new Date().toISOString()): QualityState {
  const { blockers, metrics } = medirCapituloBackfill(texto, skill);
  const limpo = blockers.length === 0;
  return {
    status: limpo ? "pending" : "rewrite_required",
    stateVersion: "1.0.0",
    detectorVersion: BACKFILL_DETECTOR_VERSION,
    skillVersion: skill ?? "unknown",
    textHash: hashText(texto),
    evaluatedAt: agora(),
    stage: "BACKFILL",
    decisionBy: "backfill-quality",
    attempts: 0,
    maxAttempts: 0,
    metricsBefore: { backfill: true },
    metricsAfter: metrics,
    targets: { residualBlockers: 0 },
    blockers,
    warnings: [
      "estado gerado por backfill: mede muleta/cadência; spec, continuidade e agência exigem o loop do runner",
    ],
    reason: limpo
      ? "Medição determinística limpa; aprovação exige o loop completo do runner ou exceção humana."
      : "Detectores determinísticos acusam excesso no texto atual.",
    requiredAction: limpo
      ? "Rodar o loop de revisão do runner (ou registrar exceção humana) para aprovar."
      : "Reescrever o capítulo e reexecutar os gates.",
  };
}

export interface BackfillResultado {
  capitulo: string;
  acao: "gravado" | "preservado";
  status?: string;
}

/**
 * Grava quality/capitulo-NN.json para cada capítulo SEM estado. Estados
 * existentes nunca são sobrescritos (não regride decisões reais do runner).
 */
export async function backfillQualityProjeto(dir: string, skill: string | null): Promise<BackfillResultado[]> {
  const manuscrito = path.join(dir, "manuscrito");
  let arquivos: string[] = [];
  try { arquivos = (await readdir(manuscrito)).filter((f) => /^capitulo-\d+\.md$/.test(f)).sort(); } catch { return []; }
  const resultados: BackfillResultado[] = [];
  await mkdir(path.join(dir, "quality"), { recursive: true });
  for (const f of arquivos) {
    const n = f.match(/(\d+)/)![1];
    const qPath = path.join(dir, "quality", `capitulo-${n.padStart(2, "0")}.json`);
    let existe = false;
    try { await readFile(qPath, "utf8"); existe = true; } catch { /* sem estado */ }
    if (existe) {
      resultados.push({ capitulo: f, acao: "preservado" });
      continue;
    }
    const texto = await readFile(path.join(manuscrito, f), "utf8");
    const estado = estadoBackfill(texto, skill);
    await writeFile(qPath, JSON.stringify(estado, null, 2) + "\n", "utf8");
    resultados.push({ capitulo: f, acao: "gravado", status: estado.status });
  }
  return resultados;
}
