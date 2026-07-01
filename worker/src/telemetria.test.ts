import { describe, it, expect } from "vitest";
import {
  tier, custoProxy, papel, usageZero, acumular,
  agregarTranscript, sinaisRunnerLog, pastaTranscript,
} from "./telemetria.js";

describe("tier", () => {
  it("classifica por substring do model", () => {
    expect(tier("claude-opus-4-8")).toBe("opus");
    expect(tier("claude-sonnet-4-6")).toBe("sonnet");
    expect(tier("claude-haiku-4-5")).toBe("haiku");
    expect(tier(undefined)).toBe("outro");
  });
});

describe("custoProxy", () => {
  it("output pesa mais que input; cache_read é barato", () => {
    const u = { ...usageZero(), output: 1_000_000 };
    expect(custoProxy("opus", u)).toBeCloseTo(75, 5);
    const cr = { ...usageZero(), cache_read: 1_000_000 };
    // cache_read ≈ 0.1× input → opus in 15 → 1.5
    expect(custoProxy("opus", cr)).toBeCloseTo(1.5, 5);
  });
});

describe("papel", () => {
  it("sidechain usa subagent_type quando conhecido", () => {
    expect(papel(true, "opus", "livro-escritor")).toBe("livro-escritor");
    expect(papel(true, "sonnet", null)).toBe("subagente:sonnet");
    expect(papel(false, "sonnet", null)).toBe("orquestrador/inline:sonnet");
  });
});

describe("agregarTranscript", () => {
  it("soma usage de mensagens assistant, atribui papel e conta spawns", () => {
    const acc = { totais: usageZero(), porModelo: {}, porPapel: {}, spawns: {} } as any;
    const linhas = [
      // orquestrador sonnet
      JSON.stringify({ type: "assistant", isSidechain: false, message: { model: "claude-sonnet-4-6", usage: { output_tokens: 100, cache_read_input_tokens: 50 } } }),
      // Task spawna o escritor (linha real traz "subagent_type" no tool_use)
      JSON.stringify({ type: "assistant", isSidechain: false, message: { model: "claude-sonnet-4-6", content: [{ type: "tool_use", name: "Task", input: { subagent_type: "livro-escritor" } }] } }),
      // subagente escritor opus
      JSON.stringify({ type: "assistant", isSidechain: true, message: { model: "claude-opus-4-8", usage: { output_tokens: 40 } } }),
      // linha sem usage (ignorada)
      JSON.stringify({ type: "user", message: { content: "oi" } }),
    ].join("\n");
    agregarTranscript(linhas, acc);
    expect(acc.totais.output).toBe(140);
    expect(acc.porModelo.sonnet.output).toBe(100);
    expect(acc.porModelo.opus.output).toBe(40);
    expect(acc.spawns["livro-escritor"]).toBe(1);
    expect(acc.porPapel["livro-escritor"].output).toBe(40);
    expect(acc.porPapel["orquestrador/inline:sonnet"].output).toBe(100);
  });
});

describe("sinaisRunnerLog", () => {
  it("conta restarts, calls, rc e deriva sem_rc + hard-fails de 32k", () => {
    const log = [
      "runner v2 iniciado. fase=ESCRITA",
      "Disparando Claude headless",
      "Claude rc=0. Fim",
      "Disparando Claude headless",
      "Claude rc=1. API Error: 32000 output token maximum",
      "runner v2 iniciado. fase=ESCRITA",
      "Disparando Claude headless", // sem rc (morta)
    ].join("\n");
    const s = sinaisRunnerLog(log);
    expect(s.restarts).toBe(2);
    expect(s.calls).toBe(3);
    expect(s.rc0).toBe(1);
    expect(s.rc1).toBe(1);
    expect(s.sem_rc).toBe(1);
    expect(s.hard_fail_32k).toBe(1);
  });
});

describe("pastaTranscript", () => {
  it("troca não-alfanuméricos por '-' (casa o encoding do Claude Code)", () => {
    expect(pastaTranscript("C:\\Users\\Rodrigo Paiva\\atelier-work\\53abdade-554d")).toBe(
      "C--Users-Rodrigo-Paiva-atelier-work-53abdade-554d"
    );
  });
});
