import { describe, expect, it } from "vitest";
import { displayProjectStatus, jobStatusBadge, projectStatusBadge, workerOnline } from "./status";

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

describe("displayProjectStatus", () => {
  it("offline + escrevendo vira 'pausada', sem animação", () => {
    const r = displayProjectStatus({ projectStatus: "escrevendo", hasActiveJob: true, workerOnline: false });
    expect(r.label).toBe("Escrita pausada (worker offline)");
    expect(r.variant).toBe("warning");
    expect(r.pulse).toBe(false);
  });

  it("offline + job ativo (status fundacao) também vira 'pausada'", () => {
    const r = displayProjectStatus({ projectStatus: "fundacao", hasActiveJob: true, workerOnline: false });
    expect(r.label).toBe("Escrita pausada (worker offline)");
  });

  it("online + job ativo vira 'Escrevendo' animado", () => {
    const r = displayProjectStatus({ projectStatus: "escrevendo", hasActiveJob: true, workerOnline: true });
    expect(r.label).toBe("Escrevendo");
    expect(r.pulse).toBe(true);
  });

  it("sem job ativo cai no mapeamento base", () => {
    expect(displayProjectStatus({ projectStatus: "pronto", hasActiveJob: false, workerOnline: true }).label).toBe("Pronto");
    expect(displayProjectStatus({ projectStatus: "fundacao", hasActiveJob: false, workerOnline: false }).label).toBe("Fundação");
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
