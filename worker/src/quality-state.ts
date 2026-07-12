import { createHash } from "node:crypto";

export const QUALITY_STATE_VERSION = "1.0.0";

export type QualityStatus =
  | "pending"
  | "evaluating"
  | "rewrite_required"
  | "approved"
  | "approved_with_exception"
  | "blocked_quality"
  | "blocked_infrastructure"
  | "stale"
  | "unknown";

export type BlockerSeverity = "critical" | "high" | "medium" | "low";

export interface QualityBlocker {
  code: string;
  message: string;
  severity: BlockerSeverity;
  metric?: string;
  observed?: number | string | boolean;
  target?: number | string | boolean;
}

export interface QualityException {
  acceptedBy: string;
  acceptedAt: string;
  reason: string;
  blockerCodes: string[];
}

export interface QualityState {
  status: QualityStatus;
  stateVersion: string;
  detectorVersion: string;
  skillVersion: string;
  textHash: string;
  evaluatedAt: string;
  stage: string;
  decisionBy: string;
  attempts: number;
  maxAttempts: number;
  metricsBefore: Record<string, unknown>;
  metricsAfter: Record<string, unknown>;
  targets: Record<string, unknown>;
  blockers: QualityBlocker[];
  warnings: string[];
  reason: string;
  requiredAction: string | null;
  exception?: QualityException;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface QualityDecisionInput {
  text: string;
  detectorVersion: string;
  skillVersion: string;
  stage: string;
  decisionBy?: string;
  attempts: number;
  maxAttempts: number;
  metricsBefore?: Record<string, unknown>;
  metricsAfter?: Record<string, unknown>;
  targets?: Record<string, unknown>;
  blockers?: QualityBlocker[];
  warnings?: string[];
  infrastructureFailure?: string | null;
  exception?: QualityException;
  evaluatedAt?: string;
}

export function decideQualityState(input: QualityDecisionInput): QualityState {
  const blockers = input.blockers ?? [];
  const blockerCodes = blockers.map((b) => b.code);
  let status: QualityStatus;
  let reason: string;
  let requiredAction: string | null;

  if (input.infrastructureFailure) {
    status = "blocked_infrastructure";
    reason = input.infrastructureFailure;
    requiredAction = "Restabelecer a dependência e retomar a mesma avaliação.";
  } else if (blockers.length === 0) {
    status = "approved";
    reason = "Todas as pós-condições foram comprovadas no texto atual.";
    requiredAction = null;
  } else if (input.exception && blockerCodes.length > 0 && blockerCodes.every((code) => input.exception!.blockerCodes.includes(code))) {
    status = "approved_with_exception";
    reason = `Exceção humana explícita: ${input.exception.reason}`;
    requiredAction = null;
  } else if (input.attempts >= input.maxAttempts) {
    status = "blocked_quality";
    reason = "O teto automático foi atingido com blockers residuais; teto não equivale a aprovação.";
    requiredAction = "Revisar os blockers, ajustar a estratégia e retomar explicitamente.";
  } else {
    status = "rewrite_required";
    reason = "A medição posterior ainda contém blockers.";
    requiredAction = "Reescrever e executar nova medição sobre o arquivo gravado.";
  }

  return {
    status,
    stateVersion: QUALITY_STATE_VERSION,
    detectorVersion: input.detectorVersion,
    skillVersion: input.skillVersion,
    textHash: hashText(input.text),
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    stage: input.stage,
    decisionBy: input.decisionBy ?? "quality-engine",
    attempts: input.attempts,
    maxAttempts: input.maxAttempts,
    metricsBefore: input.metricsBefore ?? {},
    metricsAfter: input.metricsAfter ?? {},
    targets: input.targets ?? {},
    blockers,
    warnings: input.warnings ?? [],
    reason,
    requiredAction,
    ...(input.exception ? { exception: input.exception } : {}),
  };
}

export function stateForCurrentText(state: QualityState | null | undefined, text: string): QualityState {
  if (!state) {
    return decideQualityState({
      text,
      detectorVersion: "unknown",
      skillVersion: "unknown",
      stage: "unknown",
      attempts: 0,
      maxAttempts: 0,
      blockers: [{ code: "QUALITY_STATE_MISSING", message: "Texto sem avaliação persistida.", severity: "critical" }],
    });
  }
  if (state.textHash === hashText(text)) return state;
  return {
    ...state,
    status: "stale",
    blockers: [{ code: "TEXT_CHANGED_AFTER_EVALUATION", message: "O texto mudou após a avaliação.", severity: "critical" }, ...state.blockers],
    reason: "A aprovação anterior pertence a outro hash de texto.",
    requiredAction: "Executar novamente todos os gates aplicáveis.",
  };
}

export function isPublishableQuality(state: QualityState): boolean {
  return state.status === "approved" || state.status === "approved_with_exception";
}

export function applyQualityException(state: QualityState, text: string, exception: QualityException): QualityState {
  const current = stateForCurrentText(state, text);
  if (current.status === "stale") throw new Error("não é possível aceitar exceção para texto alterado");
  if (!exception.acceptedBy.trim() || !exception.reason.trim()) throw new Error("exceção exige identidade e motivo");
  return decideQualityState({
    text, detectorVersion: current.detectorVersion, skillVersion: current.skillVersion,
    stage: current.stage, decisionBy: `human:${exception.acceptedBy}`,
    attempts: current.attempts, maxAttempts: current.maxAttempts,
    metricsBefore: current.metricsBefore, metricsAfter: current.metricsAfter,
    targets: current.targets, blockers: current.blockers, warnings: current.warnings,
    exception, evaluatedAt: new Date().toISOString(),
  });
}
