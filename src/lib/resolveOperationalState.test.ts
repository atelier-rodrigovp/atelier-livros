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

// Goal correcao-sem-clique (SG6): os 7 estados distintos aparecem sem contradição
// entre telas (mesmo resolvedor) e o clique deixa de ser necessário no recuperável.
describe("estados da correção automática (SG6 / cenário 18)", () => {
  const chapters = chaptersAte(37);
  const correcao = { ativa: true, capitulo: 38, estagio: "REVISAO_CAPITULO", degrau: 2, estrategia: "revisao_dirigida", tentativa: 1, max_tentativas: 5, retry_at: "2026-07-14T12:03:00Z", total_tentativas: 1 };
  const mk = (status: any, progresso: any, extra: any = {}) =>
    buildResolverInput({ jobs: [{ id: "j", tipo: "escrever_livro", created_at: "2026-07-14T00:00:00Z", status, erro: null, progresso }], chapters, totalCapitulos: 60, workerOnline: true, now: Date.parse("2026-07-14T12:00:00Z"), ...extra });

  it("aguardando_correcao: queued + auto_correcao → retoma sozinho, botão vira 'Tentar agora'", () => {
    const st = resolveOperationalState(mk("queued", { quality_status: "auto_correcao", quality_cap: 38, cap_atual: 38, retry_at: correcao.retry_at, correcao }));
    expect(st.situacao).toBe("aguardando_correcao");
    expect(st.mensagem_humana).toContain("nenhum clique é necessário");
    expect(st.capitulo_bloqueado).toBe(38);
    expect(st.correcao_info).toMatchObject({ tentativa: 1, degrau: 2, max_tentativas: 5 });
    expect(st.botoes.map((b) => b.id)).toContain("tentar_agora");
    expect(st.contadores.em_correcao).toBe(1);
  });

  it("correcao_automatica: running + correcao ativa → 'correção automática em andamento'", () => {
    const st = resolveOperationalState(mk("running", { cap_atual: 38, correcao }));
    expect(st.situacao).toBe("correcao_automatica");
    expect(st.mensagem_humana).toContain("Correção automática em andamento");
  });

  it("circuit_breaker: paused + categoria circuit_breaker → decisão humana com diagnóstico", () => {
    const st = resolveOperationalState(mk("paused", { quality_status: "blocked_quality", quality_categoria: "circuit_breaker", quality_cap: 38, quality_motivo: "Circuit breaker: 5 tentativas", correcao: { ...correcao, ativa: false } }));
    expect(st.situacao).toBe("circuit_breaker");
    expect(st.badge).toBe("Bloqueado após circuit breaker");
    expect(st.diagnostico_tecnico).toContain("Circuit breaker");
  });

  it("aguardando_decisao: decisão autoral e fundação pendente são distintos do editorial", () => {
    const a = resolveOperationalState(mk("paused", { quality_status: "blocked_quality", quality_categoria: "decisao_autoral", quality_stage: "GATE_FUNDACAO" }));
    expect(a.situacao).toBe("aguardando_decisao");
    const f = resolveOperationalState(mk("paused", { quality_status: "blocked_quality", quality_categoria: "fundacao_pendente", quality_stage: "PUBLICATION_GATE" }));
    expect(f.situacao).toBe("aguardando_decisao");
    expect(f.badge).toContain("Fundação");
  });

  it("producao_desativada: pausa GLOBAL vence a fila e explica a correção parada", () => {
    const st = resolveOperationalState(mk("queued", { quality_status: "auto_correcao", correcao }, { producaoGlobalAtiva: false }));
    expect(st.situacao).toBe("producao_desativada");
    expect(st.mensagem_humana).toContain("religar");
  });

  it("aguardando_cota e pausado_manual permanecem estados próprios (sem regressão)", () => {
    expect(resolveOperationalState(mk("queued", { aguardando_reset: true, retry_at: "2999-01-01T00:00:00Z" })).situacao).toBe("aguardando_cota");
    expect(resolveOperationalState(mk("queued", {}, { producaoPausada: true })).situacao).toBe("pausado_manual");
  });

  it("SG7: aviso_fundacao é banner separado e não muda a situação da escrita", () => {
    const st = resolveOperationalState(mk("running", { cap_atual: 39, fundacao_status: "reprovada", fundacao_blockers: ["PROTAGONISTA_INCOERENTE"] }));
    expect(st.situacao).toBe("executando");
    expect(st.aviso_fundacao).toContain("PROTAGONISTA_INCOERENTE");
    expect(st.aviso_fundacao).toContain("publicação");
  });

  it("paridade entre telas nos novos estados (mesma entrada → mesmo estado)", () => {
    const progresso = { quality_status: "auto_correcao", quality_cap: 38, retry_at: correcao.retry_at, correcao };
    const a = resolveOperationalState(mk("queued", progresso));
    const b = resolveOperationalState(mk("queued", progresso));
    expect(a).toEqual(b);
  });
});
