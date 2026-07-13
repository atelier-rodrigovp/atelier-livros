import { describe, it, expect } from "vitest";
import { escolherProximo, normalizarMaxParalelo, prioridadeEfetiva, type JobFila, type ProjInfo } from "./fila.js";

const J = (id: string, project_id: string | null, created_at: string, retry_at?: string): JobFila =>
  ({ id, project_id, created_at, progresso: retry_at ? { retry_at } : null });

const proj = (m: Record<string, ProjInfo>) => new Map(Object.entries(m));
const AGORA = Date.parse("2026-06-28T12:00:00Z");

describe("escolherProximo — prioridade + pausa + concorrência", () => {
  it("escolhe o de maior prioridade (do projeto)", () => {
    const cands = [J("a", "p1", "2026-01-01"), J("b", "p2", "2026-01-02")];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 0, pausada: false }, p2: { prioridade: 5, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("b");
  });

  it("empate de prioridade → mais antigo (created_at ASC)", () => {
    const cands = [J("novo", "p2", "2026-03-01"), J("velho", "p1", "2026-01-01")];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 1, pausada: false }, p2: { prioridade: 1, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("velho");
  });

  it("pula projeto com produção PAUSADA", () => {
    const cands = [J("a", "p1", "2026-01-01"), J("b", "p2", "2026-01-02")];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 9, pausada: true }, p2: { prioridade: 0, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("b"); // p1 tem prioridade alta mas está pausado
  });

  it("CONCORRÊNCIA: nunca pega job de projeto já em execução", () => {
    const cands = [J("a", "p1", "2026-01-01"), J("b", "p1", "2026-01-02"), J("c", "p2", "2026-01-03")];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 9, pausada: false }, p2: { prioridade: 0, pausada: false } }), new Set(["p1"]), AGORA);
    expect(r?.id).toBe("c"); // p1 já roda → vai pro p2 (projeto distinto)
  });

  it("pula jobs aguardando reset do Max (retry_at futuro)", () => {
    const futuro = new Date(AGORA + 60 * 60_000).toISOString();
    const cands = [J("esperando", "p1", "2026-01-01", futuro), J("pronto", "p2", "2026-01-02")];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 9, pausada: false }, p2: { prioridade: 0, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("pronto");
  });

  it("retry_at no passado é elegível", () => {
    const passado = new Date(AGORA - 60_000).toISOString();
    const r = escolherProximo([J("x", "p1", "2026-01-01", passado)], proj({ p1: { prioridade: 0, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("x");
  });

  it("ANTI-STARVATION: espera longa vence prioridade recém-criada (aging +1/24h)", () => {
    // 'faminto' (prioridade 0) espera 3 dias; 'furao' (prioridade 2) acabou de entrar.
    const cands = [
      J("faminto", "p1", new Date(AGORA - 3 * 24 * 60 * 60_000).toISOString()),
      J("furao", "p2", new Date(AGORA - 60_000).toISOString()),
    ];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 0, pausada: false }, p2: { prioridade: 2, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("faminto"); // 0+3 > 2+0
  });

  it("aging não inverte prioridade entre jobs igualmente novos", () => {
    const cands = [
      J("comum", "p1", new Date(AGORA - 60_000).toISOString()),
      J("urgente", "p2", new Date(AGORA - 30_000).toISOString()),
    ];
    const r = escolherProximo(cands, proj({ p1: { prioridade: 0, pausada: false }, p2: { prioridade: 1, pausada: false } }), new Set(), AGORA);
    expect(r?.id).toBe("urgente");
  });

  it("prioridadeEfetiva: sem created_at não ganha bônus", () => {
    expect(prioridadeEfetiva(2, undefined, AGORA)).toBe(2);
    expect(prioridadeEfetiva(0, new Date(AGORA - 25 * 60 * 60_000).toISOString(), AGORA)).toBe(1);
  });

  it("nada elegível → null", () => {
    expect(escolherProximo([], new Map(), new Set(), AGORA)).toBeNull();
    expect(escolherProximo([J("a", "p1", "2026-01-01")], proj({ p1: { prioridade: 0, pausada: true } }), new Set(), AGORA)).toBeNull();
  });
});

describe("normalizarMaxParalelo", () => {
  it("piso 1, teto 4, inteiro", () => {
    expect(normalizarMaxParalelo(2)).toBe(2);
    expect(normalizarMaxParalelo(0)).toBe(1);
    expect(normalizarMaxParalelo(99)).toBe(4);
    expect(normalizarMaxParalelo("3")).toBe(3);
    expect(normalizarMaxParalelo(undefined)).toBe(1);
    expect(normalizarMaxParalelo(2.7)).toBe(2);
  });
});
