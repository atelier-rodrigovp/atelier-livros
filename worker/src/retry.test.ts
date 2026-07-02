import { describe, it, expect } from "vitest";
import { comRetrySb, ehErroDeRede } from "./retry.js";

const silencioso = { log: () => {}, dormir: async () => {} };
const REDE = { error: { message: "TypeError: fetch failed" } };
const OK = { error: null, data: 42 };
const CONSTRAINT = { error: { message: 'duplicate key value violates unique constraint "jobs_pkey"' } };

describe("ehErroDeRede — classificação estrita", () => {
  it("reconhece as assinaturas de rede", () => {
    expect(ehErroDeRede(new Error("TypeError: fetch failed"))).toBe(true);
    expect(ehErroDeRede({ message: "FetchError: fetch failed" })).toBe(true);
    expect(ehErroDeRede(new Error("connect ECONNREFUSED 127.0.0.1:443"))).toBe(true);
    expect(ehErroDeRede({ message: "getaddrinfo ENOTFOUND xyz.supabase.co" })).toBe(true);
    expect(ehErroDeRede(new Error("socket hang up"))).toBe(true);
  });
  it("NÃO classifica erro de constraint/auth/aplicação como rede", () => {
    expect(ehErroDeRede(CONSTRAINT.error)).toBe(false);
    expect(ehErroDeRede({ message: "JWT expired" })).toBe(false);
    expect(ehErroDeRede(new Error("projeto não encontrado"))).toBe(false);
    expect(ehErroDeRede(null)).toBe(false);
  });
});

describe("comRetrySb — retry só em rede, com backoff+jitter", () => {
  it("sucesso na 1ª: executa uma vez só", async () => {
    let execs = 0;
    const r = await comRetrySb(async () => (execs++, OK), { ...silencioso });
    expect(execs).toBe(1);
    expect(r.error).toBeNull();
  });

  it("re-tenta rede e devolve o sucesso quando a rede volta", async () => {
    let execs = 0;
    const r = await comRetrySb(
      async () => (++execs <= 2 ? REDE : OK),
      { tentativas: 5, ...silencioso }
    );
    expect(execs).toBe(3);
    expect(r.error).toBeNull();
  });

  it("esgota as tentativas e devolve o ÚLTIMO erro (caller decide)", async () => {
    let execs = 0;
    const r = await comRetrySb(async () => (execs++, REDE), { tentativas: 5, ...silencioso });
    expect(execs).toBe(5);
    expect(ehErroDeRede(r.error)).toBe(true);
  });

  it("NUNCA re-tenta erro não-rede (constraint falha alto na 1ª)", async () => {
    let execs = 0;
    const r = await comRetrySb(async () => (execs++, CONSTRAINT), { tentativas: 5, ...silencioso });
    expect(execs).toBe(1);
    expect(r.error).toBe(CONSTRAINT.error);
  });

  it("backoff exponencial com teto e jitter determinístico", async () => {
    const esperas: number[] = [];
    let execs = 0;
    await comRetrySb(async () => (execs++, REDE), {
      tentativas: 6,
      baseMs: 1000,
      tetoMs: 4000,
      log: () => {},
      aleatorio: () => 0.5, // jitter fixo em 1.0× p/ assert exato
      dormir: async (ms) => {
        esperas.push(ms);
      },
    });
    // degraus 1000·2^n com teto 4000: 1000, 2000, 4000, 4000, 4000
    expect(esperas).toEqual([1000, 2000, 4000, 4000, 4000]);
  });

  it("jitter varia a espera em ±50% do degrau", async () => {
    const esperas: number[] = [];
    let execs = 0;
    await comRetrySb(async () => (execs++, REDE), {
      tentativas: 3,
      baseMs: 1000,
      log: () => {},
      aleatorio: () => 0, // piso do jitter = 0.5×
      dormir: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(esperas).toEqual([500, 1000]);
  });
});
