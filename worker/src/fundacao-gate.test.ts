// Regressão do gate da fundação (F-05/F-06). Antes: criar_fundacao aprovava com
// Biblia+Estrutura presentes e total>0; VOZ-CONSISTENCIA era aviso eterno.
import { describe, expect, it } from "vitest";
import {
  AGENTES_FUNDACAO,
  ARQUIVOS_FUNDACAO,
  avaliarFundacaoConteudo,
  consistenciaVozAutomatica,
  contarCapitulosEstrutura,
  qualityStateFundacao,
  sinopsesDuplicadas,
  textoAgregadoFundacao,
  type ConteudoFundacao,
} from "./fundacao-gate.js";
import { MARCADOR_CRAFT_LEITURA, MARCADOR_PROPULSAO } from "./craft-agentes.js";
import { MARCADOR_VOZ_CONSISTENCIA } from "./craft-skill.js";
import { hashText } from "./quality-state.js";

const CRAFT_BLOCO = "<!-- CRAFT-SKILL v1 -->\nmotor: suspeita → revelação\n";

function fundacaoValida(): ConteudoFundacao {
  const estrutura =
    "# Estrutura\n" +
    Array.from({ length: 12 }, (_, i) => `## Capítulo ${i + 1}\nMarta investiga o naufrágio número ${i + 1} e descobre um detalhe novo que muda o rumo.\n`).join("") +
    "\n## Viradas\n- Virada 1 no cap 4; reviravolta no cap 9.\n";
  const arquivos: Record<string, string | null> = {
    "briefing.md": "# Briefing\nprotagonista: Marta",
    "Biblia-da-Obra.md": "# Bíblia\nProtagonista: Marta, faroleira. Antagonista: o armador, com plano de fraude de seguros. Virada central no ato 2.",
    "Mapa-de-Personagens.md": "## Marta\nferida: culpa\n## Armador\nobjetivo: lucro",
    "Estrutura-do-Livro.md": estrutura,
    "perfil-de-voz.md": `# Perfil\n${CRAFT_BLOCO}`,
    "ESTADO_LIVRO.json": JSON.stringify({ titulo: "Farol", total_capitulos_previstos: 12, fase_atual: "ESCRITA", skill_escrita: "skill-dan-brown" }),
    ".claude/agents/livro-escritor.md": `---\nmodel: opus\n---\n${MARCADOR_CRAFT_LEITURA}\nler craft`,
    ".claude/agents/livro-revisor.md": `---\nmodel: sonnet\n---\n${MARCADOR_PROPULSAO}\nveredito`,
    ".claude/agents/livro-editor.md": "---\nmodel: haiku\n---\nspec",
    ".claude/agents/livro-contextualizador.md": "---\nmodel: haiku\n---\ncontexto",
  };
  return { arquivos };
}

const ctx = { skill: "skill-dan-brown", protagonistaNome: "Marta" };

describe("gate da fundação — pós-condições", () => {
  it("fundação completa e coerente aprova (com voz registrada)", () => {
    const c = fundacaoValida();
    c.arquivos["Biblia-da-Obra.md"] += `\n${MARCADOR_VOZ_CONSISTENCIA} alinhado`;
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.blockers).toEqual([]);
    const st = qualityStateFundacao(av, "1.0.0");
    expect(st.status).toBe("approved");
    expect(st.stage).toBe("GATE_FUNDACAO");
  });

  it("cada arquivo obrigatório ausente é um blocker crítico nomeado", () => {
    for (const f of ARQUIVOS_FUNDACAO) {
      const c = fundacaoValida();
      c.arquivos[f] = null;
      const av = avaliarFundacaoConteudo(c, ctx);
      expect(av.blockers.map((b) => b.code)).toContain(`ARQUIVO_AUSENTE:${f}`);
    }
  });

  it("cada agente ausente é um blocker crítico", () => {
    for (const a of AGENTES_FUNDACAO) {
      const c = fundacaoValida();
      c.arquivos[`.claude/agents/${a}`] = null;
      const av = avaliarFundacaoConteudo(c, ctx);
      expect(av.blockers.map((b) => b.code)).toContain(`AGENTE_AUSENTE:${a}`);
    }
  });

  it("presença de arquivo NÃO basta: estado inválido/total<=0 bloqueia", () => {
    const c = fundacaoValida();
    c.arquivos["ESTADO_LIVRO.json"] = "{corrompido";
    expect(avaliarFundacaoConteudo(c, ctx).blockers.map((b) => b.code)).toContain("ESTADO_INVALIDO");
    c.arquivos["ESTADO_LIVRO.json"] = JSON.stringify({ total_capitulos_previstos: 0, skill_escrita: "skill-dan-brown" });
    expect(avaliarFundacaoConteudo(c, ctx).blockers.map((b) => b.code)).toContain("ESTADO_SEM_TOTAL");
  });

  it("skill do projeto divergente do ESTADO bloqueia", () => {
    const c = fundacaoValida();
    const av = avaliarFundacaoConteudo(c, { ...ctx, skill: "hoover-mcfadden" });
    expect(av.blockers.map((b) => b.code)).toContain("SKILL_INCOERENTE");
  });

  it("capítulos da Estrutura incoerentes com o ESTADO bloqueiam", () => {
    const c = fundacaoValida();
    c.arquivos["ESTADO_LIVRO.json"] = JSON.stringify({ total_capitulos_previstos: 30, fase_atual: "ESCRITA", skill_escrita: "skill-dan-brown" });
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.blockers.map((b) => b.code)).toContain("ESTRUTURA_CAPITULOS_INCOERENTES");
  });

  it("craft não comprovada no perfil bloqueia (skill com registro)", () => {
    const c = fundacaoValida();
    c.arquivos["perfil-de-voz.md"] = "# Perfil sem craft";
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.blockers.map((b) => b.code)).toContain("CRAFT_AUSENTE");
  });

  it("agentes sem CRAFT-LEITURA/PROPULSAO bloqueiam", () => {
    const c = fundacaoValida();
    c.arquivos[".claude/agents/livro-escritor.md"] = "---\nmodel: opus\n---\nsem craft";
    c.arquivos[".claude/agents/livro-revisor.md"] = "---\nmodel: sonnet\n---\nsem propulsao";
    const codes = avaliarFundacaoConteudo(c, ctx).blockers.map((b) => b.code);
    expect(codes).toContain("CRAFT_AGENTE_ESCRITOR");
    expect(codes).toContain("CRAFT_AGENTE_REVISOR");
  });

  it("voz sem registro auditável bloqueia; skill sem registro de voz é no-op", () => {
    const c = fundacaoValida(); // sem marcador na Bíblia
    expect(avaliarFundacaoConteudo(c, ctx).blockers.map((b) => b.code)).toContain("VOZ_NAO_REGISTRADA");
    const semSkill = avaliarFundacaoConteudo(c, { skill: null, protagonistaNome: "Marta" });
    expect(semSkill.blockers.map((b) => b.code)).not.toContain("VOZ_NAO_REGISTRADA");
  });

  it("protagonista do briefing ausente da Bíblia/Mapa bloqueia", () => {
    const c = fundacaoValida();
    c.arquivos["Biblia-da-Obra.md"] = `Bíblia genérica sem a personagem. ${MARCADOR_VOZ_CONSISTENCIA} alinhado. Antagonista com plano. Virada central.`;
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.blockers.map((b) => b.code)).toContain("PROTAGONISTA_INCOERENTE");
  });

  it("rubrica anti-genérico sinaliza sinopses duplicadas e ausência de viradas", () => {
    const dupLinha = "A protagonista investiga mais um caso e nada muda na trama principal desta vez.";
    const estrutura = "## Capítulo 1\n" + dupLinha + "\n## Capítulo 2\n" + dupLinha + "\n";
    expect(sinopsesDuplicadas(estrutura)).toBe(1);
    const c = fundacaoValida();
    c.arquivos["Estrutura-do-Livro.md"] = estrutura;
    c.arquivos["ESTADO_LIVRO.json"] = JSON.stringify({ total_capitulos_previstos: 2, fase_atual: "ESCRITA", skill_escrita: "skill-dan-brown" });
    c.arquivos["Biblia-da-Obra.md"] = `Marta contra o armador (plano de fraude). ${MARCADOR_VOZ_CONSISTENCIA} alinhado`;
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.warnings.join(" ")).toContain("repetidas");
    expect(av.warnings.join(" ")).toContain("virada");
  });

  it("quality state agregado muda se qualquer arquivo mudar (hash-bound)", () => {
    const c = fundacaoValida();
    const a1 = avaliarFundacaoConteudo(c, ctx);
    const t1 = textoAgregadoFundacao(a1.hashes);
    c.arquivos["Biblia-da-Obra.md"] += "\numa linha nova";
    const a2 = avaliarFundacaoConteudo(c, ctx);
    expect(hashText(textoAgregadoFundacao(a2.hashes))).not.toBe(hashText(t1));
  });
});

describe("H7 — piso do projeto vs faixa da skill", () => {
  it("piso >= teto da faixa da skill sinaliza (exige decisão autoral)", () => {
    const c = fundacaoValida();
    c.arquivos["Biblia-da-Obra.md"] += `\n${MARCADOR_VOZ_CONSISTENCIA} alinhado`;
    c.arquivos["ESTADO_LIVRO.json"] = JSON.stringify({
      titulo: "Farol", total_capitulos_previstos: 12, fase_atual: "ESCRITA",
      skill_escrita: "skill-dan-brown", piso_palavras_cap: 2800,
    });
    const av = avaliarFundacaoConteudo(c, ctx);
    expect(av.warnings.join(" ")).toContain("teto da faixa da skill");
  });
  it("piso dentro da faixa não sinaliza; skill sem faixa é no-op", () => {
    const c = fundacaoValida();
    c.arquivos["Biblia-da-Obra.md"] += `\n${MARCADOR_VOZ_CONSISTENCIA} alinhado`;
    c.arquivos["ESTADO_LIVRO.json"] = JSON.stringify({
      titulo: "Farol", total_capitulos_previstos: 12, fase_atual: "ESCRITA",
      skill_escrita: "skill-dan-brown", piso_palavras_cap: 1800,
    });
    expect(avaliarFundacaoConteudo(c, ctx).warnings.join(" ")).not.toContain("teto da faixa");
  });
});

describe("contagem de capítulos da Estrutura", () => {
  it("conta cabeçalhos distintos", () => {
    expect(contarCapitulosEstrutura("## Capítulo 1\n## Capítulo 2\n### Capítulo 2\nCapítulo 3 — final")).toBe(3);
  });
  it("aceita o formato abreviado real do arquiteto ('### Cap. N — …')", () => {
    const est =
      "## ATO 1 — A torre (caps. 1–4)\n" +
      "### Cap. 1 — A hesitação · `tier: pivo` · D-21\n" +
      "### Cap. 2 — Dar corda · D-19\n" +
      "### Cap. 3 — A memória · D-17\n";
    expect(contarCapitulosEstrutura(est)).toBe(3); // "caps. 1–4" plural não conta
  });
  it("texto sem capítulos retorna 0", () => {
    expect(contarCapitulosEstrutura("nada aqui")).toBe(0);
  });
});

describe("F-06 — consistência de voz idempotente", () => {
  const agora = () => "2026-07-12T00:00:00.000Z";

  it("craft comprovada + sem marcador => registra alinhamento automático auditável", () => {
    const r = consistenciaVozAutomatica("# Bíblia", `x\n${CRAFT_BLOCO}`, "skill-dan-brown", agora);
    expect(r.registrado).toBe(true);
    expect(r.novaBiblia).toContain(MARCADOR_VOZ_CONSISTENCIA);
    expect(r.novaBiblia).toContain("registro automático auditável");
    expect(r.novaBiblia).toContain("sha256");
  });

  it("é idempotente: segunda passada não duplica o registro", () => {
    const r1 = consistenciaVozAutomatica("# Bíblia", `x\n${CRAFT_BLOCO}`, "skill-dan-brown", agora);
    const r2 = consistenciaVozAutomatica(r1.novaBiblia!, `x\n${CRAFT_BLOCO}`, "skill-dan-brown", agora);
    expect(r2.novaBiblia).toBeNull();
    expect(r2.registrado).toBe(true);
  });

  it("divergência autoral existente é preservada, nunca sobrescrita", () => {
    const biblia = `# Bíblia\n${MARCADOR_VOZ_CONSISTENCIA} divergência consciente: voz lírica de propósito`;
    const r = consistenciaVozAutomatica(biblia, `x\n${CRAFT_BLOCO}`, "skill-dan-brown", agora);
    expect(r.novaBiblia).toBeNull();
    expect(r.registrado).toBe(true);
    expect(r.motivo).toContain("preservado");
  });

  it("craft NÃO comprovada => não registra e explica (gate bloqueia)", () => {
    const r = consistenciaVozAutomatica("# Bíblia", "# perfil sem craft", "skill-dan-brown", agora);
    expect(r.registrado).toBe(false);
    expect(r.novaBiblia).toBeNull();
  });

  it("skill sem registro de voz é no-op registrado", () => {
    const r = consistenciaVozAutomatica("# Bíblia", "# perfil", null, agora);
    expect(r.registrado).toBe(true);
    expect(r.novaBiblia).toBeNull();
  });
});
