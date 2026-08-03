import { describe, expect, it } from "vitest";
import { mesclarContextoHeartbeat } from "./heartbeat-state.js";

describe("estado operacional do heartbeat", () => {
  it("pulso periódico não transforma worker pausado em ocioso", () => {
    expect(mesclarContextoHeartbeat({ estado: "paused" }, {})).toEqual({
      estado: "paused",
    });
  });

  it("progresso preserva busy, job e tipo", () => {
    expect(
      mesclarContextoHeartbeat(
        { estado: "busy", job: "j1", tipo: "entrevistar" },
        { fase: "ENTREVISTA", turnos: 3 }
      )
    ).toEqual({
      estado: "busy",
      job: "j1",
      tipo: "entrevistar",
      fase: "ENTREVISTA",
      turnos: 3,
    });
  });

  it("transição para idle remove contexto vencido do job", () => {
    expect(
      mesclarContextoHeartbeat(
        { estado: "busy", job: "j1", fase: "ENTREVISTA" },
        { estado: "idle" }
      )
    ).toEqual({ estado: "idle" });
  });
});
