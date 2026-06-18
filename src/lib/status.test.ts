import { describe, expect, it } from "vitest";
import { jobStatusBadge, projectStatusBadge, workerOnline } from "./status";

describe("jobStatusBadge", () => {
  it("mapeia todos os status de job", () => {
    expect(jobStatusBadge("queued").label).toBe("Na fila");
    expect(jobStatusBadge("running").variant).toBe("warning");
    expect(jobStatusBadge("done").variant).toBe("success");
    expect(jobStatusBadge("error").variant).toBe("destructive");
    expect(jobStatusBadge("canceled").label).toBe("Cancelado");
  });
});

describe("projectStatusBadge", () => {
  it("mapeia todos os status de projeto", () => {
    expect(projectStatusBadge("rascunho").label).toBe("Rascunho");
    expect(projectStatusBadge("pronto").variant).toBe("success");
    expect(projectStatusBadge("publicado").variant).toBe("default");
  });
});

describe("workerOnline", () => {
  const now = new Date("2026-06-18T12:00:00Z");

  it("offline quando não há heartbeat", () => {
    expect(workerOnline(null, 2, now)).toBe(false);
    expect(workerOnline(undefined, 2, now)).toBe(false);
  });

  it("online dentro da janela de staleness", () => {
    const last_seen = new Date(now.getTime() - 60_000).toISOString();
    expect(workerOnline({ last_seen }, 2, now)).toBe(true);
  });

  it("offline fora da janela", () => {
    const last_seen = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(workerOnline({ last_seen }, 2, now)).toBe(false);
  });

  it("offline com data inválida", () => {
    expect(workerOnline({ last_seen: "xxx" }, 2, now)).toBe(false);
  });
});
