import { describe, expect, it } from "vitest";
import { applyQualityException, decideQualityState, hashText, isPublishableQuality, stateForCurrentText, type QualityBlocker } from "./quality-state.js";

const blocker: QualityBlocker = {
  code: "MULETA_COISA",
  message: "Muleta acima do orçamento após a correção.",
  severity: "high",
  observed: 4,
  target: 1,
};

const base = { detectorVersion: "maneirismo-ts-v1", skillVersion: "skill-test-v1", stage: "chapter", maxAttempts: 2 };

describe("Quality State", () => {
  it("aprova somente sem blockers na medição posterior", () => {
    const s = decideQualityState({ ...base, text: "Texto variado.", attempts: 1, blockers: [], metricsBefore: { coisa: 4 }, metricsAfter: { coisa: 0 } });
    expect(s.status).toBe("approved");
    expect(isPublishableQuality(s)).toBe(true);
  });

  it("texto inalterado ou parcialmente corrigido continua exigindo reescrita", () => {
    for (const text of ["coisa coisa coisa coisa", "coisa coisa"]) {
      const s = decideQualityState({ ...base, text, attempts: 1, blockers: [blocker] });
      expect(s.status).toBe("rewrite_required");
      expect(isPublishableQuality(s)).toBe(false);
    }
  });

  it("teto com blocker vira blocked_quality, nunca approved", () => {
    const s = decideQualityState({ ...base, text: "coisa coisa", attempts: 2, blockers: [blocker] });
    expect(s.status).toBe("blocked_quality");
    expect(s.reason).toContain("teto não equivale a aprovação");
  });

  it("subprocesso interrompido vira blocked_infrastructure", () => {
    const s = decideQualityState({ ...base, text: "texto", attempts: 1, infrastructureFailure: "Executor interrompido sem código de saída." });
    expect(s.status).toBe("blocked_infrastructure");
  });

  it("mudança posterior invalida aprovação pelo hash", () => {
    const approved = decideQualityState({ ...base, text: "versão aprovada", attempts: 1, blockers: [] });
    expect(approved.textHash).toBe(hashText("versão aprovada"));
    expect(stateForCurrentText(approved, "versão alterada").status).toBe("stale");
  });

  it("exceção precisa ser explícita e cobrir blocker alto", () => {
    const s = decideQualityState({
      ...base, text: "texto", attempts: 2, blockers: [blocker],
      exception: { acceptedBy: "owner", acceptedAt: "2026-07-11T00:00:00Z", reason: "Decisão editorial consciente", blockerCodes: [blocker.code] },
    });
    expect(s.status).toBe("approved_with_exception");
  });

  it("exceção humana persistida exige identidade, motivo, todos os blockers e hash atual", () => {
    const blocked = decideQualityState({ ...base, text: "texto atual", attempts: 2, blockers: [blocker] });
    const accepted = applyQualityException(blocked, "texto atual", { acceptedBy: "owner-id", acceptedAt: "2026-07-11T00:00:00Z", reason: "decisão editorial consciente", blockerCodes: [blocker.code] });
    expect(accepted).toMatchObject({ status: "approved_with_exception", decisionBy: "human:owner-id" });
    expect(() => applyQualityException(blocked, "texto mudou", accepted.exception!)).toThrow("texto alterado");
  });
});
