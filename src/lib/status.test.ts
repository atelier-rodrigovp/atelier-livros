import { describe, expect, it } from "vitest";
import { aguardandoResetMax, displayProjectStatus, horaCurta, jobAtivoReal, jobStatusBadge, jobStatusBadgeEx, projectStatusBadge, tipoLabel, workerOnline } from "./status";

describe("jobStatusBadge", () => {
  it("mapeia todos os status de job", () => {
    expect(jobStatusBadge("queued").label).toBe("Na fila");
    expect(jobStatusBadge("running").variant).toBe("warning");
    expect(jobStatusBadge("done").variant).toBe("success");
    expect(jobStatusBadge("error").variant).toBe("destructive");
    expect(jobStatusBadge("canceled").label).toBe("Cancelado");
  });
});

describe("aguardandoResetMax / jobStatusBadgeEx", () => {
  const retry = "2026-06-27T01:40:00";
  it("detecta job em espera do reset do Max (queued + flag)", () => {
    expect(aguardandoResetMax("queued", { aguardando_reset: true, retry_at: retry })).toEqual({ retryAt: retry });
  });
  it("não confunde queued normal nem outros status", () => {
    expect(aguardandoResetMax("queued", {})).toBeNull();
    expect(aguardandoResetMax("error", { aguardando_reset: true })).toBeNull();
  });
  it("badge âmbar com horário, NÃO vermelho", () => {
    const b = jobStatusBadgeEx({ status: "queued", progresso: { aguardando_reset: true, retry_at: retry } });
    expect(b.variant).toBe("warning");
    expect(b.label).toContain("Aguardando reset do Max");
    expect(b.label).toContain(horaCurta(retry)!);
  });
  it("job comum cai no badge padrão", () => {
    expect(jobStatusBadgeEx({ status: "error" }).variant).toBe("destructive");
    expect(jobStatusBadgeEx({ status: "running" }).variant).toBe("warning");
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

describe("jobAtivoReal", () => {
  const now = new Date("2026-06-25T12:00:00Z");
  it("false quando o job não está running", () => {
    expect(jobAtivoReal({ status: "queued", workerOnline: true, lockedAt: now.toISOString(), now })).toBe(false);
    expect(jobAtivoReal({ status: "done", workerOnline: true, lockedAt: now.toISOString(), now })).toBe(false);
  });
  it("false quando running mas worker offline (job órfão)", () => {
    expect(jobAtivoReal({ status: "running", workerOnline: false, lockedAt: now.toISOString(), now })).toBe(false);
  });
  it("false quando running, online, mas lock velho (> 5 min)", () => {
    const old = new Date(now.getTime() - 10 * 60_000).toISOString();
    expect(jobAtivoReal({ status: "running", workerOnline: true, lockedAt: old, now })).toBe(false);
  });
  it("true quando running, online e lock fresco", () => {
    const fresh = new Date(now.getTime() - 30_000).toISOString();
    expect(jobAtivoReal({ status: "running", workerOnline: true, lockedAt: fresh, now })).toBe(true);
  });
  it("true quando running, online e sem lock (recém-reivindicado)", () => {
    expect(jobAtivoReal({ status: "running", workerOnline: true, lockedAt: null, now })).toBe(true);
  });
});

describe("tipoLabel", () => {
  it("mapeia tipos conhecidos e cai no próprio nome para desconhecido", () => {
    expect(tipoLabel("escrever_livro")).toBe("Escrita");
    expect(tipoLabel("gerar_post_social")).toBe("Post social");
    expect(tipoLabel("criar_volumes")).toBe("Volumes da saga");
    expect(tipoLabel("xpto")).toBe("xpto");
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
