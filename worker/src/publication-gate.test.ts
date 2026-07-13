import { describe, expect, it } from "vitest";
import { decideQualityState } from "./quality-state.js";
import { decidePublication, verificarEpubFonte } from "./publication-gate.js";

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

describe("verificarEpubFonte — EPUB↔mestre por hash (A17)", () => {
  const agora = () => "2026-07-12T00:00:00.000Z";

  it("EPUB novo (hash inédito) é coerente e grava o registro de origem", () => {
    const v = verificarEpubFonte(null, "mestre-h1", "epub-h1", agora);
    expect(v.coerente).toBe(true);
    expect(v.novoRegistro).toEqual({ mestre_sha256: "mestre-h1", epub_sha256: "epub-h1", registrado_em: agora() });
  });

  it("mestre alterado após a construção do EPUB reprova (EPUB_STALE)", () => {
    const reg = { mestre_sha256: "mestre-h1", epub_sha256: "epub-h1", registrado_em: agora() };
    const v = verificarEpubFonte(reg, "mestre-MUDOU", "epub-h1", agora);
    expect(v.coerente).toBe(false);
    expect(v.novoRegistro).toBeNull();
  });

  it("mestre inalterado mantém coerência sem regravar", () => {
    const reg = { mestre_sha256: "mestre-h1", epub_sha256: "epub-h1", registrado_em: agora() };
    const v = verificarEpubFonte(reg, "mestre-h1", "epub-h1", agora);
    expect(v.coerente).toBe(true);
    expect(v.novoRegistro).toBeNull();
  });

  it("EPUB reconstruído (hash novo) renova o registro para o mestre atual", () => {
    const reg = { mestre_sha256: "mestre-velho", epub_sha256: "epub-velho", registrado_em: agora() };
    const v = verificarEpubFonte(reg, "mestre-h2", "epub-h2", agora);
    expect(v.coerente).toBe(true);
    expect(v.novoRegistro?.mestre_sha256).toBe("mestre-h2");
  });
});
