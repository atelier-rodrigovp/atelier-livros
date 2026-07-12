import { isPublishableQuality, stateForCurrentText, type QualityBlocker, type QualityState } from "./quality-state.js";

export interface PublicationEvidence {
  chaptersExpected: number;
  chapters: Array<{ numero: number; text: string; quality: QualityState | null }>;
  manuscriptText: string;
  manuscriptMatchesChapters: boolean;
  epubPresent: boolean;
  epubMatchesManifest: boolean;
  metaTextFree: boolean;
  continuityValid: boolean;
  skillManifestValid: boolean;
}

export interface PublicationDecision {
  decision: "approved" | "blocked_quality" | "blocked_infrastructure";
  blockers: QualityBlocker[];
  warnings: string[];
  metrics: Record<string, number | boolean>;
  version: string;
  evidence: string[];
  requiredAction: string | null;
}

export function decidePublication(e: PublicationEvidence): PublicationDecision {
  const blockers: QualityBlocker[] = [];
  const add = (code: string, message: string, severity: "critical" | "high" = "critical") => blockers.push({ code, message, severity });
  if (e.chapters.length !== e.chaptersExpected) add("CHAPTER_COUNT_MISMATCH", `Esperados ${e.chaptersExpected}, encontrados ${e.chapters.length}.`);
  for (const c of e.chapters) {
    const current = stateForCurrentText(c.quality, c.text);
    if (!isPublishableQuality(current)) add(`CHAPTER_${c.numero}_NOT_APPROVED`, `Capítulo ${c.numero}: ${current.status}.`);
  }
  if (!e.manuscriptText.trim()) add("MANUSCRIPT_MISSING", "Manuscrito-mestre ausente ou vazio.");
  if (!e.manuscriptMatchesChapters) add("MANUSCRIPT_STALE", "Manuscrito-mestre não corresponde aos capítulos aprovados.");
  if (!e.epubPresent) add("EPUB_MISSING", "EPUB ausente.");
  if (!e.epubMatchesManifest) add("EPUB_STALE", "EPUB não corresponde ao manifest da publicação.");
  if (!e.metaTextFree) add("META_TEXT", "Meta-texto detectado no artefato final.");
  if (!e.continuityValid) add("CONTINUITY", "Pós-condição de continuidade não comprovada.", "high");
  if (!e.skillManifestValid) add("SKILL_DRIFT", "Skill instalada diverge do manifest versionado.");
  return {
    decision: blockers.length ? "blocked_quality" : "approved",
    blockers,
    warnings: [],
    metrics: { chaptersExpected: e.chaptersExpected, chaptersFound: e.chapters.length, epubPresent: e.epubPresent },
    version: "publication-gate-v1",
    evidence: e.chapters.map((c) => `capitulo-${String(c.numero).padStart(2, "0")}:${c.quality?.textHash ?? "sem-avaliacao"}`),
    requiredAction: blockers.length ? "Resolver todos os blockers e executar novamente o gate final." : null,
  };
}
