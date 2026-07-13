// Regressão A16: job 'running' com lock velho volta para 'queued' — com escopo
// de owner e SOMENTE locks mais antigos que a janela de staleness.
import { describe, expect, it } from "vitest";
import { recuperarOrfaos } from "./orfaos.js";

function mockSb() {
  const calls: any = { update: null, eq: [] as Array<[string, unknown]>, lt: [] as Array<[string, unknown]> };
  const chain: any = {
    update(v: unknown) { calls.update = v; return chain; },
    eq(c: string, v: unknown) { calls.eq.push([c, v]); return chain; },
    lt(c: string, v: unknown) { calls.lt.push([c, v]); chain.done = true; return Promise.resolve({ data: null, error: null }); },
  };
  return { sb: { from: (t: string) => { calls.table = t; return chain; } }, calls };
}

describe("recuperarOrfaos", () => {
  const NOW = Date.parse("2026-07-12T12:00:00Z");

  it("requeue com owner, status=running e locked_at < agora-staleMin", async () => {
    const { sb, calls } = mockSb();
    await recuperarOrfaos(sb, "owner-1", 15, () => NOW);
    expect(calls.table).toBe("jobs");
    expect(calls.update).toEqual({ status: "queued", locked_by: null, locked_at: null });
    expect(calls.eq).toEqual([
      ["owner", "owner-1"],
      ["status", "running"],
    ]);
    expect(calls.lt).toEqual([["locked_at", new Date(NOW - 15 * 60_000).toISOString()]]);
  });

  it("a janela acompanha staleMin (não requeia lock fresco)", async () => {
    const { sb, calls } = mockSb();
    await recuperarOrfaos(sb, "owner-1", 60, () => NOW);
    expect(calls.lt[0][1]).toBe(new Date(NOW - 60 * 60_000).toISOString());
  });
});
