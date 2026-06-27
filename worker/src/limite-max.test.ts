import { describe, it, expect } from "vitest";
import { LimiteMaxError, parseHoraReset, limiteMaxRetryAt } from "./limite-max.js";

const AGORA = new Date("2026-06-27T00:30:00"); // 00:30 local

describe("parseHoraReset", () => {
  it("parseia 'resets at 1:40am' como próxima ocorrência futura", () => {
    const iso = parseHoraReset("Claude usage limit reached. Your limit will reset at 1:40am.", AGORA)!;
    const d = new Date(iso);
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(41); // 40 + 90s de folga
    expect(d.getTime()).toBeGreaterThan(AGORA.getTime());
  });

  it("hora já passada hoje → joga para amanhã", () => {
    const iso = parseHoraReset("resets at 12:10am", new Date("2026-06-27T13:00:00"))!;
    expect(new Date(iso).getTime()).toBeGreaterThan(new Date("2026-06-27T13:00:00").getTime());
  });

  it("entende formato 24h 'reseta 13:40'", () => {
    const iso = parseHoraReset("reseta 13:40", new Date("2026-06-27T10:00:00"))!;
    const d = new Date(iso);
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(41);
  });

  it("texto sem horário → null", () => {
    expect(parseHoraReset("limite atingido, tente depois", AGORA)).toBeNull();
  });
});

describe("limiteMaxRetryAt", () => {
  it("detecta limite do Max e devolve o horário do reset", () => {
    const iso = limiteMaxRetryAt("You've hit your usage limit. Resets at 1:40am.", AGORA)!;
    expect(new Date(iso).getHours()).toBe(1);
  });

  it("limite sem horário parseável → backoff padrão (~35min)", () => {
    const iso = limiteMaxRetryAt("usage limit reached", AGORA, 35 * 60_000)!;
    expect(new Date(iso).getTime()).toBeCloseTo(AGORA.getTime() + 35 * 60_000, -3);
  });

  it("reset parseado a >6h (mis-parse/stale) → cai no backoff, não espera ~24h", () => {
    const agora = new Date("2026-06-27T13:00:00"); // 13h; "12:10am" parsearia p/ amanhã (+11h)
    const iso = limiteMaxRetryAt("usage limit reached. resets at 12:10am", agora)!;
    expect(Date.parse(iso) - agora.getTime()).toBeLessThanOrEqual(6 * 3600_000);
  });

  it("erro real (skill/disco) NÃO é tratado como limite", () => {
    expect(limiteMaxRetryAt("Skill 'x' não instalada no worker", AGORA)).toBeNull();
    expect(limiteMaxRetryAt("escrita não avançou em 3/32 (rc=1)", AGORA)).toBeNull();
  });
});

describe("LimiteMaxError", () => {
  it("carrega retryAt e nome distinto", () => {
    const e = new LimiteMaxError("limite", "2026-06-27T01:40:00.000Z");
    expect(e.name).toBe("LimiteMaxError");
    expect(e.retryAt).toBe("2026-06-27T01:40:00.000Z");
    expect(e instanceof Error).toBe(true);
  });
});
