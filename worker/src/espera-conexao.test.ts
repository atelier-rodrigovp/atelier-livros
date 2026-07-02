import { describe, it, expect } from "vitest";
import { aguardarConexao } from "./espera-conexao.js";

const semEspera = { dormir: async () => {}, log: () => {} };

describe("aguardarConexao — startup resiliente", () => {
  it("retorna na 1ª tentativa quando a conexão está de pé", async () => {
    const r = await aguardarConexao(async () => {}, { ...semEspera });
    expect(r).toBe(1);
  });

  it("NÃO desiste: sobrevive a N falhas e retorna quando a rede volta", async () => {
    let chamadas = 0;
    const verificar = async () => {
      chamadas++;
      if (chamadas <= 30) throw new Error("TypeError: fetch failed");
    };
    const r = await aguardarConexao(verificar, { ...semEspera });
    expect(r).toBe(31); // nunca chama exit(1); espera até conectar
  });

  it("loga a 1ª falha e depois 1× a cada N (não polui o log)", async () => {
    const logs: string[] = [];
    let chamadas = 0;
    const verificar = async () => {
      chamadas++;
      if (chamadas <= 25) throw new Error("fetch failed");
    };
    await aguardarConexao(verificar, { ...semEspera, logCadaN: 12, log: (m) => logs.push(m) });
    // falhas 1..25 → loga nas tentativas 1, 12 e 24
    expect(logs).toHaveLength(3);
    expect(logs[0]).toContain("tentativa 1");
    expect(logs[0]).toContain("fetch failed"); // causa original preservada p/ diagnóstico
    expect(logs[1]).toContain("tentativa 12");
    expect(logs[2]).toContain("tentativa 24");
  });

  it("dorme entre tentativas (backoff fixo)", async () => {
    const dormidas: number[] = [];
    let chamadas = 0;
    const verificar = async () => {
      chamadas++;
      if (chamadas <= 3) throw new Error("ECONNRESET");
    };
    await aguardarConexao(verificar, {
      sleepMs: 5000,
      log: () => {},
      dormir: async (ms) => {
        dormidas.push(ms);
      },
    });
    expect(dormidas).toEqual([5000, 5000, 5000]);
  });
});
