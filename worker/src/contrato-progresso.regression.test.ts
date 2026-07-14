// Regressão do caso 36/37/38 (contrato de progresso, S11). Prova, no nível da
// DECISÃO do contrato (resolveChapterState + deveSincronizar + aggregate), que:
//  - o cap-37 aprovado é sincronizado E permanece aprovado quando o 38 bloqueia;
//  - o cap-38 bloqueado NÃO chega ao leitor;
//  - o sync é idempotente (não re-sobe o mesmo hash);
//  - a retomada corrige o 38 sem re-sincronizar o 37;
//  - os contadores da UI batem "38 produzidos · 37 aprovados · 37 sincronizados · 38 em correção".
import { describe, it, expect } from "vitest";
import { resolveChapterState, deveSincronizar, aggregateChapterStates, type ChapterFacts } from "./chapter-state.js";
import { decideQualityState, hashText } from "./quality-state.js";

const PISO = 1800;
const texto = (marca: string) => (marca + " palavra ").repeat(1000); // ~2000 palavras
const qApproved = (t: string) => decideQualityState({ text: t, detectorVersion: "d", skillVersion: "skill-dan-brown", stage: "REVISAO_CAPITULO", attempts: 1, maxAttempts: 2, blockers: [] });
const qBlocked = (t: string) => decideQualityState({ text: t, detectorVersion: "d", skillVersion: "skill-dan-brown", stage: "REVISAO_CAPITULO", attempts: 2, maxAttempts: 2, blockers: [{ code: "MULETA_COISA", message: "2x coisa", severity: "high" }] });

// Modelo mutável do "mundo" (disco + banco). O sync altera o banco (dbHash).
interface Mundo { numero: number; diskText: string; quality: ReturnType<typeof decideQualityState> | null; dbHash: string | null; }

// Um passe de sincronização: sobe SÓ o que deveSincronizar decidir; simula durável
// gravando o hash no "banco". Retorna os números efetivamente sincronizados.
function syncPass(mundo: Mundo[]): number[] {
  const subiram: number[] = [];
  for (const m of mundo) {
    const facts: ChapterFacts = { numero: m.numero, piso: PISO, diskExists: true, diskText: m.diskText, qualityState: m.quality, dbRow: m.dbHash != null ? { text_sha256: m.dbHash } : null };
    const st = resolveChapterState(facts);
    if (deveSincronizar(st, m.dbHash)) { m.dbHash = st.hashDisco; subiram.push(m.numero); }
  }
  return subiram;
}

function estados(mundo: Mundo[]) {
  return mundo.map((m) => resolveChapterState({ numero: m.numero, piso: PISO, diskExists: true, diskText: m.diskText, qualityState: m.quality, dbRow: m.dbHash != null ? { text_sha256: m.dbHash } : null }));
}

describe("regressão 36/37/38 — aprovado durável antes do próximo, bloqueio não oculta", () => {
  it("37 aprovado sincroniza; 38 bloqueado NÃO chega ao leitor", () => {
    const t37 = texto("descartavel"), t38 = texto("ela-sempre-soube");
    // 37 aprovado ainda não sincronizado; 38 bloqueado.
    const mundo: Mundo[] = [
      { numero: 37, diskText: t37, quality: qApproved(t37), dbHash: null },
      { numero: 38, diskText: t38, quality: qBlocked(t38), dbHash: null },
    ];
    const subiram = syncPass(mundo);
    expect(subiram).toEqual([37]); // só o aprovado subiu
    const st = estados(mundo);
    expect(st.find((s) => s.numero === 37)!.sincronizado).toBe(true);
    expect(st.find((s) => s.numero === 38)!.aprovado).toBe(false);
    expect(st.find((s) => s.numero === 38)!.sincronizado).toBe(false);
    expect(st.find((s) => s.numero === 38)!.disponivel).toBe(false);
    expect(st.find((s) => s.numero === 38)!.phase).toBe("correcao_necessaria");
  });

  it("sync é idempotente: segundo passe não re-sobe o 37", () => {
    const t37 = texto("descartavel");
    const mundo: Mundo[] = [{ numero: 37, diskText: t37, quality: qApproved(t37), dbHash: null }];
    expect(syncPass(mundo)).toEqual([37]);
    expect(syncPass(mundo)).toEqual([]); // já durável com o mesmo hash
  });

  it("retomada corrige o 38 sem re-sincronizar o 37", () => {
    const t37 = texto("descartavel"), t38 = texto("ela-sempre-soube");
    const mundo: Mundo[] = [
      { numero: 37, diskText: t37, quality: qApproved(t37), dbHash: null },
      { numero: 38, diskText: t38, quality: qBlocked(t38), dbHash: null },
    ];
    syncPass(mundo); // sobe 37
    // Correção do 38: novo texto aprovado (novo hash). O 37 não muda.
    const t38ok = texto("ela-sempre-soube-corrigido");
    const m38 = mundo.find((m) => m.numero === 38)!;
    m38.diskText = t38ok; m38.quality = qApproved(t38ok);
    const subiram = syncPass(mundo);
    expect(subiram).toEqual([38]); // só o 38; o 37 não re-sobe (idempotente)
    const st = estados(mundo);
    expect(st.every((s) => s.sincronizado)).toBe(true); // 37 e 38 duráveis
  });

  it("contadores da UI: 38 produzidos · 37 aprovados · 37 sincronizados · 38 em correção", () => {
    // 1–36 aprovados e já sincronizados; 37 aprovado recém-sincronizado; 38 bloqueado.
    const mundo: Mundo[] = [];
    for (let i = 1; i <= 36; i++) { const t = texto(`c${i}`); mundo.push({ numero: i, diskText: t, quality: qApproved(t), dbHash: hashText(t) }); }
    const t37 = texto("descartavel"), t38 = texto("ela-sempre-soube");
    mundo.push({ numero: 37, diskText: t37, quality: qApproved(t37), dbHash: null });
    mundo.push({ numero: 38, diskText: t38, quality: qBlocked(t38), dbHash: null });
    // Antes do sync do 37: 36 sincronizados.
    let agg = aggregateChapterStates(estados(mundo));
    expect(agg.produzidos).toBe(38);
    expect(agg.aprovados).toBe(37);
    expect(agg.sincronizados).toBe(36);
    // Sync incremental sobe o 37.
    expect(syncPass(mundo)).toEqual([37]);
    agg = aggregateChapterStates(estados(mundo));
    expect(agg.produzidos).toBe(38);
    expect(agg.aprovados).toBe(37);
    expect(agg.sincronizados).toBe(37);
    expect(agg.em_correcao).toBe(1);
    expect(agg.bloqueados).toEqual([38]);
    expect(agg.maior_aprovado).toBe(37);
    expect(agg.maior_sincronizado).toBe(37);
  });
});
