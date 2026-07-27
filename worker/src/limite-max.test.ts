import { describe, it, expect } from "vitest";
import { LimiteMaxError, parseHoraReset, limiteMaxRetryAt, pareceLimiteMax, deveRecuperar } from "./limite-max.js";

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

  // Envelope REAL extraído do Supabase (engine_runs, incidente 2026-07-21/22,
  // 1.299 falhas do arquiteto_cena): rc=1 com "api_error_status":429 no JSON.
  const ENVELOPE_REAL_429 =
    'claude CLI: claude CLI rc=1: {"type":"result","subtype":"success","is_error":true,' +
    '"api_error_status":429,"duration_ms":1346,"duration_api_ms":0,"num_turns":1,' +
    '"result":"You\'ve hit your session limit · resets 1:10p"}';

  it("envelope real do incidente (api_error_status 429) → limite, com reset 1:10p = 13:10", () => {
    const agora = new Date("2026-07-22T11:00:00");
    const iso = limiteMaxRetryAt(ENVELOPE_REAL_429, agora);
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getHours()).toBe(13); // "1:10p" é 13h10, não 01h10
  });

  it("forma estruturada SEM a frase (envelope truncado antes do result) → limite via 429", () => {
    const truncado =
      'claude CLI rc=1: {"type":"result","subtype":"success","is_error":true,' +
      '"api_error_status":429,"duration_ms":2092,"duration_api_ms":0';
    const iso = limiteMaxRetryAt(truncado, AGORA, 35 * 60_000);
    expect(iso).not.toBeNull(); // sem horário parseável → backoff padrão
    expect(new Date(iso!).getTime()).toBeCloseTo(AGORA.getTime() + 35 * 60_000, -3);
  });

  it("rate_limit_error e HTTP 429 também são limite", () => {
    expect(limiteMaxRetryAt('{"type":"error","error":{"type":"rate_limit_error"}}', AGORA)).not.toBeNull();
    expect(limiteMaxRetryAt("request failed: HTTP 429 Too Many Requests", AGORA)).not.toBeNull();
  });

  it("429 estruturado NÃO confunde erro real com número solto", () => {
    expect(limiteMaxRetryAt("capitulo-04.md gravado (429 palavras)", AGORA)).toBeNull();
    expect(limiteMaxRetryAt("ENOENT: no such file or directory, open 'capitulo-429.md'", AGORA)).toBeNull();
  });

  it("PROGRESSO + limite no fim do output → classifica como limite (não erro)", () => {
    // run que ESCREVEU capítulos e DEPOIS bateu o limite (o caso do bug)
    const out =
      "[..] --- ESCRITA: capitulo alvo = 6 ---\n" +
      "[..] capitulo-06.md gravado (1500 palavras).\n" +
      "[..] stderr: Claude usage limit reached. Your limit will reset at 7:20pm.\n";
    const agora = new Date("2026-06-27T15:00:00"); // perto do reset (7:20pm), dentro do cap de 6h
    const iso = limiteMaxRetryAt(out, agora);
    expect(iso).not.toBeNull();           // pausa, não erro
    expect(new Date(iso!).getHours()).toBe(19);
  });
});

describe("pareceLimiteMax — recuperação de jobs mortos", () => {
  it("casa a assinatura antiga do worker e a do CLI", () => {
    expect(pareceLimiteMax("Limite de uso do plano Max atingido (reseta 7:20pm). A escrita parou em 6/32.")).toBe(true);
    expect(pareceLimiteMax("You've hit your usage limit. Resets at 1:40am.")).toBe(true);
  });
  it("NÃO casa erros reais (não recupera)", () => {
    expect(pareceLimiteMax("fundação ausente — rode criar_fundacao antes de escrever_livro")).toBe(false);
    expect(pareceLimiteMax("MANUSCRITO-MESTRE.md ausente para pt-BR")).toBe(false);
    expect(pareceLimiteMax("")).toBe(false);
  });
});

describe("deveRecuperar — recupera Max E 'não avançou em N/total' (N>0)", () => {
  it("recupera limite do Max", () => {
    expect(deveRecuperar("Limite de uso do plano Max atingido (reseta 7:20pm).")).toBe(true);
  });
  it("recupera 'escrita não avançou em 20/32' (livro longo íntegro)", () => {
    expect(deveRecuperar("escrita não avançou em 20/32 (rc=2). ...")).toBe(true);
    expect(deveRecuperar("escrita não avançou em 4/32 (rc=2).")).toBe(true);
  });
  it("NÃO recupera 0/N (nenhum capítulo) nem erros reais", () => {
    expect(deveRecuperar("escrita não avançou em 0/32 (rc=1).")).toBe(false);
    expect(deveRecuperar("fundação ausente — rode criar_fundacao")).toBe(false);
    expect(deveRecuperar("Credit balance is too low")).toBe(false);
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
