import { describe, expect, it } from "vitest";
import { decideInfrastructureRetry, registrarErroRepetido } from "./retry-policy.js";

// H6 (auditoria de convergência): erro determinístico idêntico N vezes seguidas
// bloqueia com mensagem legível, sem reciclar retries.
describe("registrarErroRepetido", () => {
  it("3ª ocorrência idêntica bloqueia; mensagem diferente zera a contagem", () => {
    const e1 = registrarErroRepetido(null, "NameError: txt_norm");
    expect(e1.bloquear).toBe(false);
    expect(e1.estado.erro_repetido).toBe(1);
    const e2 = registrarErroRepetido(e1.estado, "NameError: txt_norm");
    expect(e2.bloquear).toBe(false);
    const e3 = registrarErroRepetido(e2.estado, "NameError: txt_norm");
    expect(e3.bloquear).toBe(true);
    expect(e3.motivo).toContain("3x seguidas");
    expect(e3.motivo).toContain("NameError");
    const e4 = registrarErroRepetido(e3.estado, "outro erro qualquer");
    expect(e4.bloquear).toBe(false);
    expect(e4.estado.erro_repetido).toBe(1);
  });
  it("mensagem vazia nunca acumula", () => {
    const a = registrarErroRepetido({ ultimo_erro: "", erro_repetido: 5 }, "");
    expect(a.bloquear).toBe(false);
  });
});

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
