import { describe, expect, it } from "vitest";
import { mapaModelosDoAmbiente, MODELOS_V2_FIXOS } from "./config.js";

describe("modelos fixos da Engine V2", () => {
  it("pina Opus 5 na prosa, Sonnet 5 no raciocínio/julgamento e Haiku 4.5 nos fatos", () => {
    expect(mapaModelosDoAmbiente({} as NodeJS.ProcessEnv)).toEqual({
      raciocinio: "claude-sonnet-5",
      fatos: "claude-haiku-4-5-20251001",
      prosa: "claude-opus-5",
      julgamento: "claude-sonnet-5",
    });
  });

  it("aceita somente overrides redundantes e rejeita deriva de ambiente", () => {
    expect(mapaModelosDoAmbiente({
      V2_MODEL_PROSA: MODELOS_V2_FIXOS.prosa,
    } as NodeJS.ProcessEnv)).toEqual(MODELOS_V2_FIXOS);

    expect(() => mapaModelosDoAmbiente({
      V2_MODEL_PROSA: "opus",
    } as NodeJS.ProcessEnv)).toThrow(/V2_MODEL_PROSA=opus diverge/);
  });
});
