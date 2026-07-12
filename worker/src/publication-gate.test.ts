import { describe, expect, it } from "vitest";
import { decideQualityState } from "./quality-state.js";
import { decidePublication } from "./publication-gate.js";

const q = (text: string) => decideQualityState({ text, detectorVersion: "d1", skillVersion: "s1", stage: "chapter", attempts: 1, maxAttempts: 2, blockers: [] });
const good = () => ({
  chaptersExpected: 1,
  chapters: [{ numero: 1, text: "Capítulo aprovado", quality: q("Capítulo aprovado") }],
  manuscriptText: "Capítulo aprovado",
  manuscriptMatchesChapters: true,
  epubPresent: true,
  epubMatchesManifest: true,
  metaTextFree: true,
  continuityValid: true,
  skillManifestValid: true,
});

describe("publication gate", () => {
  it("aprova somente conjunto íntegro", () => expect(decidePublication(good()).decision).toBe("approved"));
  it("bloqueia texto alterado após aprovação", () => {
    const e = good(); e.chapters[0].text = "Capítulo alterado";
    expect(decidePublication(e).blockers.map((b) => b.code)).toContain("CHAPTER_1_NOT_APPROVED");
  });
  it("bloqueia artefato parcial ou skill divergente", () => {
    const e = good(); e.epubMatchesManifest = false; e.skillManifestValid = false;
    const codes = decidePublication(e).blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(["EPUB_STALE", "SKILL_DRIFT"]));
  });
});
