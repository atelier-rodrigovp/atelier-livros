import { describe, it, expect } from "vitest";
import { instalarTimestampsISO } from "./log-iso.js";

function consoleFake() {
  const linhas: string[] = [];
  const c = {
    log: (...a: unknown[]) => linhas.push(a.join(" ")),
    warn: (...a: unknown[]) => linhas.push(a.join(" ")),
    error: (...a: unknown[]) => linhas.push(a.join(" ")),
  } as unknown as Console;
  return { c, linhas };
}

describe("instalarTimestampsISO", () => {
  it("prefixa [ISO] em log/warn/error", () => {
    const { c, linhas } = consoleFake();
    instalarTimestampsISO(c, () => "2026-07-02T12:00:00.000Z");
    c.log("[worker pc-rodrigo] conectado.");
    c.error("[heartbeat] erro: fetch failed");
    expect(linhas[0]).toBe("[2026-07-02T12:00:00.000Z] [worker pc-rodrigo] conectado.");
    expect(linhas[1]).toBe("[2026-07-02T12:00:00.000Z] [heartbeat] erro: fetch failed");
  });
  it("instalação dupla NÃO prefixa duas vezes", () => {
    const { c, linhas } = consoleFake();
    instalarTimestampsISO(c, () => "T1");
    instalarTimestampsISO(c, () => "T2");
    c.log("x");
    expect(linhas[0]).toBe("[T1] x");
  });
});
