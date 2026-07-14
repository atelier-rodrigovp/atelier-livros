import { describe, it, expect } from "vitest";
import { resolveChapterState, aggregateChapterStates } from "./chapter-state.js";
import { decideQualityState, hashText } from "./quality-state.js";
import type { ChapterFacts } from "./chapter-state.js";

const PISO = 1800;
// Texto sintético acima do piso (2 palavras por unidade × 1000 = ~2000 palavras).
const texto = (marca: string) => (marca + " palavra ").repeat(1000);

function aprovado(text: string) {
  return decideQualityState({ text, detectorVersion: "d", skillVersion: "skill-dan-brown", stage: "REVISAO_CAPITULO", attempts: 1, maxAttempts: 2, blockers: [] });
}
function bloqueado(text: string) {
  return decideQualityState({
    text, detectorVersion: "d", skillVersion: "skill-dan-brown", stage: "REVISAO_CAPITULO", attempts: 2, maxAttempts: 2,
    blockers: [{ code: "MULETA_COISA", message: "2x coisa", severity: "high" }],
  });
}

describe("resolveChapterState", () => {
  it("capítulo inexistente → ausente", () => {
    const s = resolveChapterState({ numero: 40, piso: PISO, diskExists: false });
    expect(s.phase).toBe("ausente");
    expect(s.aprovado).toBe(false);
  });

  it("abaixo do piso → produzido", () => {
    const s = resolveChapterState({ numero: 5, piso: PISO, diskExists: true, diskText: "curto demais" });
    expect(s.phase).toBe("produzido");
  });

  it("acima do piso, sem sinal de revisão → acima_do_piso", () => {
    const s = resolveChapterState({ numero: 5, piso: PISO, diskExists: true, diskText: texto("a") });
    expect(s.phase).toBe("acima_do_piso");
  });

  it("cap-37: aprovado (hash bate), ainda não sincronizado → aprovado", () => {
    const t = texto("descartavel");
    const f: ChapterFacts = { numero: 37, piso: PISO, diskExists: true, diskText: t, revisado: true, qualityState: aprovado(t), dbRow: null };
    const s = resolveChapterState(f);
    expect(s.phase).toBe("aprovado");
    expect(s.aprovado).toBe(true);
    expect(s.sincronizado).toBe(false);
    expect(s.hashAprovado).toBe(hashText(t));
  });

  it("cap-37 após sync no banco (hash coincide) → sincronizado", () => {
    const t = texto("descartavel");
    const s = resolveChapterState({ numero: 37, piso: PISO, diskExists: true, diskText: t, revisado: true, qualityState: aprovado(t), dbRow: { text_sha256: hashText(t) } });
    expect(s.phase).toBe("sincronizado");
    expect(s.sincronizado).toBe(true);
    expect(s.disponivel).toBe(false);
  });

  it("cap-37 no banco + Storage → disponivel", () => {
    const t = texto("descartavel");
    const s = resolveChapterState({ numero: 37, piso: PISO, diskExists: true, diskText: t, revisado: true, qualityState: aprovado(t), dbRow: { text_sha256: hashText(t) }, storage: { exists: true, hash: hashText(t) } });
    expect(s.phase).toBe("disponivel");
    expect(s.disponivel).toBe(true);
  });

  it("aprovação de outro hash (texto mudou) → correcao_necessaria + stale", () => {
    const antigo = texto("antigo");
    const novo = texto("novo");
    const s = resolveChapterState({ numero: 37, piso: PISO, diskExists: true, diskText: novo, revisado: true, qualityState: aprovado(antigo) });
    expect(s.stale).toBe(true);
    expect(s.aprovado).toBe(false);
    expect(s.phase).toBe("correcao_necessaria");
  });

  it("cap-38: bloqueado por qualidade → correcao_necessaria, nunca aprovado/sincronizado", () => {
    const t = texto("ela-sempre-soube");
    const s = resolveChapterState({ numero: 38, piso: PISO, diskExists: true, diskText: t, qualityState: bloqueado(t) });
    expect(s.phase).toBe("correcao_necessaria");
    expect(s.aprovado).toBe(false);
    expect(s.sincronizado).toBe(false);
    expect(s.disponivel).toBe(false);
    expect(s.blockers.map((b) => b.code)).toContain("MULETA_COISA");
  });

  it("linha legada sem text_sha256 → sincronizado (hash desconhecido), não regride", () => {
    const t = texto("legado");
    const s = resolveChapterState({ numero: 10, piso: PISO, diskExists: true, diskText: t, qualityState: aprovado(t), dbRow: { text_sha256: null } });
    expect(s.legadoSemHash).toBe(true);
    expect(s.sincronizado).toBe(true);
  });
});

describe("aggregateChapterStates — cenário 37 aprovado, 38 bloqueado", () => {
  it("conta produzidos/aprovados/sincronizados/em_correcao corretamente", () => {
    const t37 = texto("descartavel");
    const t38 = texto("ela-sempre-soube");
    const s37 = resolveChapterState({ numero: 37, piso: PISO, diskExists: true, diskText: t37, revisado: true, qualityState: aprovado(t37), dbRow: null });
    const s38 = resolveChapterState({ numero: 38, piso: PISO, diskExists: true, diskText: t38, qualityState: bloqueado(t38) });
    const agg = aggregateChapterStates([s37, s38]);
    expect(agg.produzidos).toBe(2);
    expect(agg.aprovados).toBe(1);
    expect(agg.sincronizados).toBe(0);
    expect(agg.em_correcao).toBe(1);
    expect(agg.bloqueados).toEqual([38]);
    expect(agg.maior_aprovado).toBe(37);
  });
});
