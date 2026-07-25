import { describe, expect, it } from "vitest";
import { resolverEsperaWizardV2 } from "./wizardV2";

const AGORA = Date.parse("2026-07-25T18:00:00-03:00");

describe("resolverEsperaWizardV2", () => {
  it("expõe worker offline e produção pausada antes de fingir fila normal", () => {
    expect(resolverEsperaWizardV2({ status: "queued", workerOnline: false, producaoAtiva: true, agora: AGORA }))
      .toBe("worker_offline");
    expect(resolverEsperaWizardV2({ status: "queued", workerOnline: true, producaoAtiva: false, agora: AGORA }))
      .toBe("producao_pausada");
  });

  it("distingue throttle, pausa humana e falha", () => {
    expect(resolverEsperaWizardV2({
      status: "queued",
      progresso: { aguardando_reset: true, retry_at: "2026-07-25T19:00:00-03:00" },
      workerOnline: true,
      producaoAtiva: true,
      agora: AGORA,
    })).toBe("throttle");
    expect(resolverEsperaWizardV2({ status: "paused", workerOnline: true, producaoAtiva: true, agora: AGORA }))
      .toBe("pausado");
    expect(resolverEsperaWizardV2({ status: "error", workerOnline: true, producaoAtiva: true, agora: AGORA }))
      .toBe("falha");
  });

  it("torna espera excessiva visível sem declarar falha inexistente", () => {
    expect(resolverEsperaWizardV2({
      status: "queued",
      createdAt: "2026-07-25T17:57:00-03:00",
      workerOnline: true,
      producaoAtiva: true,
      agora: AGORA,
    })).toBe("demora_excessiva");
    expect(resolverEsperaWizardV2({
      status: "running",
      createdAt: "2026-07-25T17:00:00-03:00",
      workerOnline: true,
      producaoAtiva: true,
      agora: AGORA,
    })).toBe("executando");
  });
});
