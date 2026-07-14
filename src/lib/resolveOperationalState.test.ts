import { describe, it, expect } from "vitest";
import { resolveOperationalState, buildResolverInput } from "./resolveOperationalState";

// Chapters 1..n com hash (aprovados+sincronizados).
const chaptersAte = (n: number) => Array.from({ length: n }, (_, i) => ({ numero: i + 1, text_sha256: `h${i + 1}`, quality_status: "approved" }));

const jobBloqueado = {
  id: "cur", tipo: "escrever_livro" as const, created_at: "2026-07-13T14:37:00Z",
  status: "paused" as const, erro: "time escritor->revisor->editor esgotou o orcamento sem comprovar pos-condicoes",
  progresso: { fase: "REVISAO_CAPITULO", cap_atual: 38, total: 60, engine: "claude-code", provedor: "anthropic", modelo: "opus", quality_status: "blocked_quality", quality_stage: "REVISAO_CAPITULO", quality_blockers: ['muleta coisa/coisas 2x — L35: "Escute uma coisa" | L45: "outra coisa"'] },
};
const jobAntigo = {
  id: "old", tipo: "escrever_livro" as const, created_at: "2026-07-08T15:53:00Z",
  status: "paused" as const, erro: "gate cadencia", progresso: { quality_status: "blocked_quality", quality_stage: "GATE_CAPITULO", cap_atual: 30 },
};
const jobTelem = { id: "t", tipo: "telemetria" as const, created_at: "2026-07-20T00:00:00Z", status: "paused" as const, erro: null, progresso: {} };

describe("resolveOperationalState — caso 53abdade (cap 38 bloqueado, 37 sincronizados)", () => {
  const input = buildResolverInput({ jobs: [jobBloqueado, jobAntigo, jobTelem], chapters: chaptersAte(37), totalCapitulos: 60, workerOnline: false, now: Date.parse("2026-07-13T15:00:00Z") });
  const st = resolveOperationalState(input);

  it("seleciona o job vigente (mais recente escrever_livro), ignora antigo e telemetria", () => {
    // O antigo (GATE_CAPITULO) não vence; a telemetria não conta.
    expect(st.situacao).toBe("bloqueado_qualidade");
    expect(st.badge).toBe("Correção necessária no cap 38");
  });

  it("contadores: 38 produzidos · 37 aprovados · 37 sincronizados · 1 em correção", () => {
    expect(st.contadores).toEqual({ produzidos: 38, aprovados: 37, sincronizados: 37, em_correcao: 1 });
    expect(st.capitulo_bloqueado).toBe(38);
  });

  it("mensagem principal é TRADUZIDA; o erro cru vai só para diagnóstico", () => {
    expect(st.mensagem_humana).not.toContain("escritor->revisor->editor");
    expect(st.mensagem_humana).toMatch(/capítulo 38/i);
    expect(st.diagnostico_tecnico).toContain("escritor->revisor->editor");
  });

  it("blocker humano explica a muleta; engine info presente", () => {
    expect(st.blocker_humano).toMatch(/2 usos de "coisa".*capítulo 38/i);
    expect(st.engine_info).toEqual({ engine: "claude-code", provedor: "anthropic", modelo: "opus" });
  });

  it("botões: Corrigir 38 + Ver diagnóstico + Reconciliar (produzidos>sincronizados); Continuar 39 DESABILITADO", () => {
    const ids = st.botoes.map((b) => b.id);
    expect(ids).toContain("corrigir");
    expect(ids).toContain("reconciliar"); // 38 produzidos > 37 sincronizados
    const continuar = st.botoes.find((b) => b.id === "continuar");
    expect(continuar?.habilitado).toBe(false); // só após o 38 aprovado
  });
});

describe("dados legados (pós-reconciliação real): 1–36 sem status + 37 aprovado", () => {
  it("linhas legadas contam como aprovadas; blocked_quality no progresso = 1 em correção", () => {
    // 1–36 legadas (sem quality_status/text_sha256) + 37 aprovado com hash.
    const legadas = Array.from({ length: 36 }, (_, i) => ({ numero: i + 1, text_sha256: null, quality_status: null }));
    const c37 = [{ numero: 37, text_sha256: "h37", quality_status: "approved" }];
    const st = resolveOperationalState(buildResolverInput({ jobs: [jobBloqueado], chapters: [...legadas, ...c37], totalCapitulos: 60, workerOnline: false, now: Date.parse("2026-07-13T15:00:00Z") }));
    expect(st.contadores).toEqual({ produzidos: 38, aprovados: 37, sincronizados: 37, em_correcao: 1 });
  });
  it("uma linha com status bloqueado NÃO conta como aprovada (defensivo)", () => {
    const chapters = [{ numero: 1, text_sha256: "h1", quality_status: "approved" }, { numero: 2, text_sha256: null, quality_status: "blocked_quality" }];
    const st = resolveOperationalState(buildResolverInput({ jobs: [{ id: "j", tipo: "escrever_livro", created_at: "2026-07-13T00:00:00Z", status: "running", erro: null, progresso: { cap_atual: 2 } }], chapters, totalCapitulos: 10, workerOnline: true }));
    expect(st.contadores.sincronizados).toBe(2);
    expect(st.contadores.aprovados).toBe(1);
  });
});

describe("paridade dashboard↔projeto↔escrita (mesmo resolvedor, mesma saída)", () => {
  it("as 3 telas, com os mesmos dados crus, produzem OperationalState IDÊNTICO", () => {
    const jobs = [jobBloqueado, jobAntigo, jobTelem];
    const chapters = chaptersAte(37);
    const now = Date.parse("2026-07-13T15:00:00Z");
    // Cada tela monta a entrada pelo builder ÚNICO e resolve.
    const dashboard = resolveOperationalState(buildResolverInput({ jobs, chapters, totalCapitulos: 60, workerOnline: false, now }));
    const projeto = resolveOperationalState(buildResolverInput({ jobs, chapters, totalCapitulos: 60, workerOnline: false, now }));
    const escrita = resolveOperationalState(buildResolverInput({ jobs, chapters, totalCapitulos: 60, workerOnline: false, now }));
    expect(projeto).toEqual(dashboard);
    expect(escrita).toEqual(dashboard);
  });
});

describe("hierarquia de precedência", () => {
  const chapters = chaptersAte(10);
  const mk = (status: any, progresso: any, extra: any = {}) => buildResolverInput({ jobs: [{ id: "j", tipo: "escrever_livro", created_at: "2026-07-13T00:00:00Z", status, erro: null, progresso }], chapters, totalCapitulos: 60, ...extra });

  it("executando quando running + worker online", () => {
    expect(resolveOperationalState(mk("running", { cap_atual: 11 }, { workerOnline: true })).situacao).toBe("executando");
  });
  it("interrompido_retomavel quando running sem heartbeat", () => {
    expect(resolveOperationalState(mk("running", { cap_atual: 11 }, { workerOnline: false })).situacao).toBe("interrompido_retomavel");
  });
  it("aguardando_cota quando queued + aguardando_reset", () => {
    expect(resolveOperationalState(mk("queued", { aguardando_reset: true, retry_at: "2999-01-01T00:00:00Z" }, { workerOnline: true })).situacao).toBe("aguardando_cota");
  });
  it("bloqueio de qualidade nunca aparece como só 'Pausado'", () => {
    const st = resolveOperationalState(mk("paused", { quality_status: "blocked_quality", quality_stage: "REVISAO_CAPITULO", cap_atual: 5 }, { workerOnline: true }));
    expect(st.situacao).toBe("bloqueado_qualidade");
    expect(st.badge).not.toBe("Pausado");
  });
  it("pausado_manual quando produção pausada", () => {
    expect(resolveOperationalState(mk("queued", {}, { workerOnline: false, producaoPausada: true })).situacao).toBe("pausado_manual");
  });
  it("sem job de escrita → sem_escrita", () => {
    const st = resolveOperationalState(buildResolverInput({ jobs: [jobTelem], chapters, totalCapitulos: 60, workerOnline: true }));
    expect(st.situacao).toBe("sem_escrita");
  });
});
