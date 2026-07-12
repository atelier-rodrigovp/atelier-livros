import { describe, expect, it } from "vitest";
import { decideInfrastructureRetry } from "./retry-policy.js";

describe("infrastructure retry policy", () => {
  it("aplica backoff exponencial com teto", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const a = decideInfrastructureRetry(null, "supabase", now);
    expect(a.action).toBe("retry");
    if (a.action !== "retry") return;
    expect(a.delayMs).toBe(120_000);
    const b = decideInfrastructureRetry(a.state, "supabase", now);
    expect(b.action === "retry" && b.delayMs).toBe(240_000);
  });

  it("abre circuit breaker no teto, sem retry infinito", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    let state: any = null;
    let last: any;
    for (let i = 0; i < 6; i++) { last = decideInfrastructureRetry(state, "storage", now); state = last.state; }
    expect(last.action).toBe("blocked");
    expect(last.reason).toContain("Circuit breaker");
  });

  it("reinicia contador ao mudar a dependência", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const a = decideInfrastructureRetry(null, "runner", now);
    const b = decideInfrastructureRetry(a.state, "supabase", now);
    expect(b.state.count).toBe(1);
  });
});
