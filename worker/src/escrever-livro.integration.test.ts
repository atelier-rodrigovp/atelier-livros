import { describe, expect, it } from "vitest";
import { claimJobAtomic } from "./claim.js";
import { runQualityCorrection, type QualityMeasurement } from "./quality-loop.js";
import { decidePublication } from "./publication-gate.js";
import { executePublicationTransaction, type PublicationTransactionIO } from "./publication-transaction.js";
import { deriveWritingStatus } from "../../src/lib/operationalStatus.js";

const measure = (text: string): QualityMeasurement => {
  const n = (text.match(/\bcoisa\b/gi) ?? []).length;
  return { metrics: { coisa: n }, targets: { coisa: 1 }, blockers: n > 1 ? [{ code: "MULETA_COISA", message: "acima do alvo", severity: "high", observed: n, target: 1 }] : [] };
};

async function lifecycle(rewrite: (text: string) => Promise<string>) {
  const events: string[] = [];
  const claimClient = { rpc: async () => ({ data: [{ id: "j1", tipo: "escrever_livro", payload: {}, project_id: "p1", edition_id: "e1" }], error: null }) };
  const job = await claimJobAtomic(claimClient, "j1", "owner", "worker-A"); events.push("1:claimed");
  if (!job) throw new Error("claim perdido");
  events.push("2:prepared");
  const runner = { chapter: "coisa coisa coisa em cena", manuscript: "", epub: "epub" }; events.push("3:runner");
  const corrected = await runQualityCorrection({ text: runner.chapter, detectorVersion: "d1", skillVersion: "s1", stage: "chapter", maxAttempts: 2, measure, rewrite: async (t) => { events.push("4:rewrite"); return rewrite(t); } });
  events.push("5:remeasured");
  runner.chapter = corrected.text; runner.manuscript = corrected.text;
  if (corrected.state.status !== "approved") return { events, status: corrected.state.status, promoted: 0, front: deriveWritingStatus({ status: "paused", progresso: { quality_status: "blocked_quality", quality_stage: "chapter", quality_blockers: corrected.state.blockers.map((b) => b.code) } }, true).label };
  events.push("6:quality-approved");
  const decision = decidePublication({ chaptersExpected: 1, chapters: [{ numero: 1, text: runner.chapter, quality: corrected.state }], manuscriptText: runner.manuscript, manuscriptMatchesChapters: true, epubPresent: true, epubMatchesManifest: true, metaTextFree: true, continuityValid: true, skillManifestValid: true });
  events.push("7:publication-gate");
  if (decision.decision !== "approved") throw new Error("gate inesperado");
  const contents: Record<string, string> = { cap: runner.chapter, master: runner.manuscript, epub: runner.epub };
  let promoted = 0;
  const io: PublicationTransactionIO = {
    read: async (p) => Buffer.from(contents[p]),
    writeManifest: async () => { events.push("8:manifest"); },
    upload: async (_b, _k, p) => { events.push(`9:upload-${p}`); },
    promote: async ({ chapters, artifacts }) => { expect(chapters).toHaveLength(1); expect(artifacts).toHaveLength(2); promoted++; events.push("10:promoted"); },
  };
  await executePublicationTransaction({ owner: "owner", projectId: "p1", editionId: "e1", files: [
    { kind: "chapter", bucket: "manuscritos", localPath: "cap", filename: "capitulo-01.md", numero: 1, palavras: 5 },
    { kind: "manuscript", bucket: "manuscritos", localPath: "master", filename: "MANUSCRITO-MESTRE.md" },
    { kind: "epub", bucket: "epubs", localPath: "epub", filename: "livro.epub" },
  ] }, io);
  events.push("11:job-done");
  return { events, status: "done", promoted, front: "Concluído" };
}

describe("integração escrever_livro sem serviços externos", () => {
  it("claim -> runner -> correção -> recontagem -> gate -> staging -> promoção -> done", async () => {
    const r = await lifecycle(async () => "objeto concreto aparece em cena");
    expect(r.status).toBe("done"); expect(r.promoted).toBe(1);
    expect(r.events).toEqual(expect.arrayContaining(["1:claimed", "2:prepared", "3:runner", "5:remeasured", "6:quality-approved", "7:publication-gate", "8:manifest", "10:promoted", "11:job-done"]));
    expect(r.events.indexOf("10:promoted")).toBeGreaterThan(r.events.indexOf("9:upload-epub"));
  });
  it("correção que não funciona bloqueia antes de qualquer upload/promoção", async () => {
    const r = await lifecycle(async (t) => t);
    expect(r.status).toBe("blocked_quality"); expect(r.promoted).toBe(0);
    expect(r.events.some((e) => e.includes("upload"))).toBe(false);
    expect(r.front).toBe("Bloqueado por qualidade");
  });
});
