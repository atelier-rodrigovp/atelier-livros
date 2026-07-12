import { describe, expect, it } from "vitest";
import { runQualityCorrection, type QualityMeasurement } from "./quality-loop.js";

const measure = (text: string): QualityMeasurement => {
  const coisa = (text.match(/\bcoisa\b/gi) ?? []).length;
  const deRepente = (text.match(/\bde repente\b/gi) ?? []).length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const blockers = [];
  if (coisa > 1) blockers.push({ code: "MULETA_COISA", message: "coisa acima do alvo", severity: "high" as const, observed: coisa, target: 1 });
  if (deRepente > 1) blockers.push({ code: "MULETA_DE_REPENTE", message: "de repente acima do alvo", severity: "high" as const, observed: deRepente, target: 1 });
  if (words < 4) blockers.push({ code: "WORD_FLOOR", message: "texto abaixo do piso", severity: "critical" as const, observed: words, target: 4 });
  return { metrics: { coisa, deRepente, words }, targets: { coisa: 1, deRepente: 1, words: 4 }, blockers };
};
const run = (rewrite: (text: string) => Promise<string>) => runQualityCorrection({
  text: "coisa coisa coisa em cena", detectorVersion: "fixture-v1", skillVersion: "skill-v1", stage: "chapter", maxAttempts: 2, measure,
  rewrite: (text) => rewrite(text),
});

describe("aceitação central: corrigir -> reler -> recontar -> decidir", () => {
  it("1. somente texto realmente corrigido chega a approved", async () => expect((await run(async () => "objeto concreto aparece em cena")).state.status).toBe("approved"));
  it("2. texto inalterado termina blocked_quality", async () => expect((await run(async (t) => t)).state.status).toBe("blocked_quality"));
  it("3. redução parcial não é confundida com aprovação", async () => expect((await run(async () => "coisa coisa permanece em cena")).state.status).toBe("blocked_quality"));
  it("4. corrigir um tique e introduzir outro continua bloqueado", async () => expect((await run(async () => "de repente de repente muda a cena")).state.status).toBe("blocked_quality"));
  it("5. texto abaixo do piso continua bloqueado", async () => expect((await run(async () => "texto curto")).state.status).toBe("blocked_quality"));
  it("6. subprocesso interrompido vira blocked_infrastructure", async () => expect((await run(async () => { throw new Error("executor interrompido sem rc"); })).state.status).toBe("blocked_infrastructure"));
});
