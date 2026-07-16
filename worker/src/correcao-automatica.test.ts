// SG1/SG2/SG5 — decisão pura da correção automática: classificação de bloqueio,
// escada por tipo de problema, orçamento, dedupe por hash e circuit breaker.
import { describe, expect, it } from "vitest";
import {
  backoffCorrecao,
  chaveLedger,
  classificarBloqueio,
  decidirCorrecao,
  degrauInicial,
  fecharTentativaPendente,
  ledgerVazio,
  registrarTentativa,
  resumirLedger,
  type CorrecaoLedger,
  type TentativaCorrecao,
} from "./correcao-automatica.js";

const AGORA = Date.parse("2026-07-14T12:00:00Z");

function bloqueio(over: Partial<Parameters<typeof decidirCorrecao>[0]> = {}) {
  return decidirCorrecao({
    ledger: ledgerVazio("proj"),
    estagio: "REVISAO_CAPITULO",
    blockers: ["molde antitese 'nao X, mas Y' 2x"],
    capitulo: 38,
    hashAtual: "h1",
    agora: AGORA,
    ...over,
  });
}

describe("classificarBloqueio (SG1)", () => {
  it("estágios editoriais do runner são recuperáveis automaticamente", () => {
    for (const stage of ["REVISAO_CAPITULO", "SPEC_CAPITULO", "DESMANEIRISMO", "REVISAO_PROSA", "REVISAO_FINAL", "REAVALIACAO_FINAL"]) {
      expect(classificarBloqueio(stage, ["x"])).toBe("recuperavel_qualidade");
    }
  });
  it("fundação recuperável só pausa por decisão explícita ou circuit breaker", () => {
    expect(classificarBloqueio("GATE_FUNDACAO", ["PROTAGONISTA_INCOERENTE"])).toBe("decisao_autoral");
    expect(classificarBloqueio("GATE_FUNDACAO", ["DECISAO_AUTORAL:TITULO"])).toBe("decisao_autoral");
    expect(classificarBloqueio("GATE_FUNDACAO", ["CIRCUIT_BREAKER_FUNDACAO"])).toBe("circuit_breaker");
  });
  it("gate de publicação com blocker de fundação é fundacao_pendente (SG7)", () => {
    expect(classificarBloqueio("PUBLICATION_GATE", ["PROTAGONISTA_INCOERENTE: protagonista 'X' ausente"])).toBe("fundacao_pendente");
  });
  it("gate de publicação sem fundação e estágio desconhecido são decisão autoral (conservador)", () => {
    expect(classificarBloqueio("PUBLICATION_GATE", ["CHAPTER_NOT_APPROVED: cap 12"])).toBe("decisao_autoral");
    expect(classificarBloqueio("ESTAGIO_NOVO", ["x"])).toBe("decisao_autoral");
  });
});

describe("degrauInicial (SG2 — degrau pelo tipo de problema)", () => {
  it("meta-texto/espaçamento começa no degrau 1", () => {
    expect(degrauInicial(["meta-texto residual"])).toBe(1);
  });
  it("muleta lexical começa no degrau 2 (nunca no determinístico)", () => {
    expect(degrauInicial(["muleta coisa 2x"])).toBe(2);
  });
  it("defeito narrativo começa no degrau 5; misto usa a pior categoria", () => {
    expect(degrauInicial(["continuidade nao gravada"])).toBe(5);
    expect(degrauInicial(["meta-texto", "muleta coisa 2x", "continuidade nao gravada"])).toBe(5);
  });
});

describe("decidirCorrecao (SG2/SG5)", () => {
  it("primeiro bloqueio recuperável agenda correção com retry_at e tentativa 1", () => {
    const d = bloqueio();
    expect(d.acao).toBe("corrigir");
    if (d.acao !== "corrigir") return;
    expect(d.degrau).toBe(2); // molde = defeito de frase → começa na revisão dirigida
    expect(d.tentativa.tentativa).toBe(1);
    expect(Date.parse(d.retryAt)).toBeGreaterThan(AGORA);
    expect(d.tentativa.resultado).toBe("pendente");
    expect(d.tentativa.retomada_automatica).toBe(true);
  });

  it("cenário 10: mesmo hash após tentativa → NÃO repete a estratégia, escala o degrau", () => {
    const ledger = ledgerVazio("proj");
    const d1 = bloqueio({ ledger, blockers: ["muleta coisa 2x"] });
    if (d1.acao !== "corrigir") throw new Error("esperava corrigir");
    registrarTentativa(ledger, chaveLedger(38, "REVISAO_CAPITULO"), d1.tentativa);
    fecharTentativaPendente(ledger, chaveLedger(38, "REVISAO_CAPITULO"), "reprovado", "h1");
    const d2 = bloqueio({ ledger, blockers: ["muleta coisa 2x"], hashAtual: "h1" });
    if (d2.acao !== "corrigir") throw new Error("esperava corrigir");
    expect(d1.degrau).toBe(2);
    expect(d2.degrau).toBe(3); // escalou: mesma estratégia sobre o mesmo hash é proibida
    expect(d2.estrategia).not.toBe(d1.estrategia);
  });

  it("cenário 11: hash mudou mas 2 tentativas no mesmo degrau → escala mesmo assim", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    for (const [hash, novoHash] of [["h1", "h2"], ["h2", "h3"]] as const) {
      const d = bloqueio({ ledger, blockers: ["muleta coisa 2x"], hashAtual: hash });
      if (d.acao !== "corrigir") throw new Error("esperava corrigir");
      registrarTentativa(ledger, chave, d.tentativa);
      fecharTentativaPendente(ledger, chave, "reprovado", novoHash);
    }
    const d3 = bloqueio({ ledger, blockers: ["muleta coisa 2x"], hashAtual: "h3" });
    if (d3.acao !== "corrigir") throw new Error("esperava corrigir");
    expect(d3.degrau).toBe(3); // 2 passadas no degrau 2 sem convergir → sobe
  });

  it("cenário 12: orçamento esgotado → circuit breaker com diagnóstico (teto nunca aprova)", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    for (let i = 1; i <= 5; i++) {
      registrarTentativa(ledger, chave, {
        tentativa: i, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
        bloqueio: ["x"], hash_antes: `h${i}`, degrau: Math.min(6, i + 1), estrategia: "s",
        aplicado_em: new Date(AGORA + i).toISOString(), retry_at: null, modelo: null,
        resultado: "reprovado", retomada_automatica: true,
      } satisfies TentativaCorrecao);
    }
    const d = bloqueio({ ledger, hashAtual: "h9" });
    expect(d.acao).toBe("escalar_humano");
    if (d.acao !== "escalar_humano") return;
    expect(d.categoria).toBe("circuit_breaker");
    expect(d.motivo).toContain("5 tentativa");
  });

  it("escada esgotada (acima do degrau 6) → circuit breaker mesmo dentro do orçamento", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    registrarTentativa(ledger, chave, {
      tentativa: 1, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
      bloqueio: ["x"], hash_antes: "h1", degrau: 6, estrategia: "modelo_alternativo",
      aplicado_em: new Date(AGORA).toISOString(), retry_at: null, modelo: "opus",
      resultado: "reprovado", retomada_automatica: true,
    });
    const d = bloqueio({ ledger, hashAtual: "h1" });
    expect(d.acao).toBe("escalar_humano");
    if (d.acao !== "escalar_humano") return;
    expect(d.categoria).toBe("circuit_breaker");
    expect(d.motivo).toContain("degrau 6");
  });

  it("degrau 6 registra modelo alternativo", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    for (let i = 1; i <= 1; i++) {
      registrarTentativa(ledger, chave, {
        tentativa: 1, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
        bloqueio: ["x"], hash_antes: "h1", degrau: 5, estrategia: "revisao_ampla",
        aplicado_em: new Date(AGORA).toISOString(), retry_at: null, modelo: null,
        resultado: "reprovado", retomada_automatica: true,
      });
    }
    const d = bloqueio({ ledger, hashAtual: "h1" });
    if (d.acao !== "corrigir") throw new Error("esperava corrigir");
    expect(d.degrau).toBe(6);
    expect(d.tentativa.modelo).toBe("opus");
  });

  it("book-wide (sem capítulo/hash) escala a cada passada e usa chave por estágio", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(null, "DESMANEIRISMO");
    expect(chave).toBe("stage-DESMANEIRISMO");
    const d1 = bloqueio({ ledger, estagio: "DESMANEIRISMO", capitulo: null, hashAtual: null, blockers: ["muleta coisa 4x book-wide"] });
    if (d1.acao !== "corrigir") throw new Error("esperava corrigir");
    registrarTentativa(ledger, chave, d1.tentativa);
    fecharTentativaPendente(ledger, chave, "reprovado", null);
    const d2 = bloqueio({ ledger, estagio: "DESMANEIRISMO", capitulo: null, hashAtual: null, blockers: ["muleta coisa 4x book-wide"] });
    if (d2.acao !== "corrigir") throw new Error("esperava corrigir");
    expect(d2.degrau).toBeGreaterThan(d1.degrau);
  });
});

describe("ledger (SG3/SG4)", () => {
  it("registrarTentativa deduplica pendente com mesmo hash e estratégia (clique duplicado)", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    const t: TentativaCorrecao = {
      tentativa: 1, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
      bloqueio: ["x"], hash_antes: "h1", degrau: 2, estrategia: "revisao_dirigida",
      aplicado_em: new Date(AGORA).toISOString(), retry_at: "2026-07-14T12:02:00Z", modelo: null,
      resultado: "pendente", retomada_automatica: true,
    };
    registrarTentativa(ledger, chave, t);
    registrarTentativa(ledger, chave, { ...t, tentativa: 2 });
    expect(ledger.capitulos[chave]).toHaveLength(1);
  });

  it("fecharTentativaPendente é idempotente e preserva o histórico", () => {
    const ledger = ledgerVazio("proj");
    const chave = chaveLedger(38, "REVISAO_CAPITULO");
    registrarTentativa(ledger, chave, {
      tentativa: 1, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
      bloqueio: ["x"], hash_antes: "h1", degrau: 2, estrategia: "revisao_dirigida",
      aplicado_em: new Date(AGORA).toISOString(), retry_at: null, modelo: null,
      resultado: "pendente", retomada_automatica: true,
    });
    expect(fecharTentativaPendente(ledger, chave, "aprovado", "h2")).toBe(true);
    expect(fecharTentativaPendente(ledger, chave, "reprovado", "h3")).toBe(false); // nada pendente
    expect(ledger.capitulos[chave][0].resultado).toBe("aprovado");
    expect(ledger.capitulos[chave][0].hash_depois).toBe("h2");
  });

  it("resumirLedger expõe a pendência mais recente para a UI (SG6)", () => {
    const ledger = ledgerVazio("proj");
    registrarTentativa(ledger, "cap-38", {
      tentativa: 2, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
      bloqueio: ["x"], hash_antes: "h2", degrau: 3, estrategia: "edicao_focalizada",
      aplicado_em: "2026-07-14T12:05:00Z", retry_at: "2026-07-14T12:11:00Z", modelo: null,
      resultado: "pendente", retomada_automatica: true,
    });
    const r = resumirLedger(ledger);
    expect(r).toMatchObject({ ativa: true, capitulo: 38, degrau: 3, tentativa: 2, retry_at: "2026-07-14T12:11:00Z" });
    expect(resumirLedger(ledgerVazio("p"))).toBeNull();
  });
});

describe("backoffCorrecao", () => {
  it("dobra a partir de 90s com teto de 30min", () => {
    expect(Date.parse(backoffCorrecao(1, AGORA)) - AGORA).toBe(90_000);
    expect(Date.parse(backoffCorrecao(2, AGORA)) - AGORA).toBe(180_000);
    expect(Date.parse(backoffCorrecao(10, AGORA)) - AGORA).toBe(30 * 60_000);
  });
});
