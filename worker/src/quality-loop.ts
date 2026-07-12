import { decideQualityState, type QualityBlocker, type QualityState } from "./quality-state.js";

export interface QualityMeasurement {
  metrics: Record<string, unknown>;
  targets: Record<string, unknown>;
  blockers: QualityBlocker[];
}

export interface QualityLoopResult {
  text: string;
  state: QualityState;
  history: Array<{ attempt: number; before: QualityMeasurement; after?: QualityMeasurement }>;
}

export async function runQualityCorrection(input: {
  text: string;
  detectorVersion: string;
  skillVersion: string;
  stage: string;
  maxAttempts: number;
  measure: (text: string) => QualityMeasurement;
  rewrite: (text: string, blockers: QualityBlocker[], attempt: number) => Promise<string>;
}): Promise<QualityLoopResult> {
  let text = input.text;
  let before = input.measure(text);
  const history: QualityLoopResult["history"] = [];
  if (!before.blockers.length) {
    return { text, history, state: decideQualityState({ ...input, text, attempts: 0, metricsAfter: before.metrics, targets: before.targets, blockers: [] }) };
  }
  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    const item: QualityLoopResult["history"][number] = { attempt, before };
    try { text = await input.rewrite(text, before.blockers, attempt); }
    catch (e: any) {
      history.push(item);
      return { text, history, state: decideQualityState({ ...input, text, attempts: attempt, metricsBefore: before.metrics, targets: before.targets, blockers: before.blockers, infrastructureFailure: String(e?.message ?? e) }) };
    }
    const after = input.measure(text);
    item.after = after;
    history.push(item);
    const state = decideQualityState({ ...input, text, attempts: attempt, metricsBefore: before.metrics, metricsAfter: after.metrics, targets: after.targets, blockers: after.blockers });
    if (state.status === "approved" || state.status === "blocked_quality") return { text, state, history };
    before = after;
  }
  throw new Error("invariante: loop terminou sem decisão");
}
