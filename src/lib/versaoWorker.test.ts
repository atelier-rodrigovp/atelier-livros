import { describe, expect, it } from "vitest";
import { compararVersaoWorker } from "./versaoWorker";

const SHA = "aae0b83657aa9c86814a7448cb7ea3f373bd9584";
const OUTRO = "055f33b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7";

describe("comparação entre o código do worker e o do repositório", () => {
  it("[DOD:R-06] IGUAL: mesmo SHA e worktree limpa não bloqueia", () => {
    const c = compararVersaoWorker({ sha: SHA, sujo: false, sujos: [] }, SHA);
    expect(c.veredicto).toBe("igual");
    expect(c.bloqueia).toBe(false);
    expect(c.mensagem).toContain("aae0b83");
  });

  it("[DOD:R-07] DIVERGENTE: bloqueia e diz os dois SHAs, nesta ordem", () => {
    // Exatamente o caso real de 29/07: o worker no ar era de 055f33b enquanto o
    // repositório já estava seis fatias à frente.
    const c = compararVersaoWorker({ sha: OUTRO, sujo: false, sujos: [] }, SHA);
    expect(c.veredicto).toBe("divergente");
    expect(c.bloqueia).toBe(true);
    expect(c.mensagem).toBe("worker roda código de 055f33b, repositório está em aae0b83");
  });

  it("mesmo SHA com worktree suja também bloqueia — o SHA sozinho mente", () => {
    const c = compararVersaoWorker({ sha: SHA, sujo: true, sujos: ["worker/src/jobs.ts", "worker/src/lib.ts"] }, SHA);
    expect(c.veredicto).toBe("suja");
    expect(c.bloqueia).toBe(true);
    expect(c.mensagem).toContain("2 arquivo(s) modificado(s)");
  });

  it("sem carimbo (worker offline ou anterior à 6b) bloqueia como desconhecido", () => {
    for (const carimbo of [null, undefined, { sha: null, sujo: false }]) {
      const c = compararVersaoWorker(carimbo, SHA);
      expect(c.veredicto).toBe("sem_carimbo");
      expect(c.bloqueia).toBe(true);
      expect(c.mensagem).toContain("não declara a versão");
      // Não inventa igualdade por ausência de dado.
      expect(c.mensagem).not.toContain("roda o código do repositório");
    }
  });
});
