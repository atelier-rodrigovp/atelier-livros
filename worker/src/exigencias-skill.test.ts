import { describe, it, expect } from "vitest";
import {
  exigenciasParaSkill, garantirRotacaoNaEstrutura, garantirSpecCompletaNoEditor,
  garantirFatoDossieNoRevisor, garantirBlocoRevisorSkill,
  MARCADOR_ROTACAO, MARCADOR_SPEC_COMPLETA, MARCADOR_FATO_DOSSIE,
  MARCADOR_RELOGIOS_NARRADORA, MARCADOR_ROTACAO_POV, MARCADOR_CUSTO_ESCALA,
} from "./exigencias-skill.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;
const ESTRUTURA = "# Estrutura\n\n## NOTAS DE EXECUÇÃO (para o pipeline)\n\n- fair-play.\n";
const EDITOR = "---\nname: livro-editor\nmodel: haiku\n---\n## Spec\n- POV / fio: <H|C|R>\n";
const REVISOR = "---\nname: livro-revisor\nmodel: sonnet\n---\n## Checklist\n- [ ] PdV.\n";

describe("exigenciasParaSkill — opt-in absoluto", () => {
  it("dan-brown/hoover/romantasy têm entrada; as demais são NO-OP", () => {
    expect(exigenciasParaSkill("skill-dan-brown")?.dossie).toBe(true);
    expect(exigenciasParaSkill("hoover-mcfadden")?.marcadorNotas).toBe(MARCADOR_RELOGIOS_NARRADORA);
    expect(exigenciasParaSkill("skill-romantasy")?.fios).toEqual({ min: 2, max: 2 });
    expect(exigenciasParaSkill("skill-jk-rowling")).toBeNull();
    expect(exigenciasParaSkill("vesper-escritor-de-capitulos")).toBeNull();
    expect(exigenciasParaSkill(null)).toBeNull();
    expect(exigenciasParaSkill(undefined)).toBeNull();
  });
  it("skill sem entrada não muda NENHUM arquivo", () => {
    expect(garantirRotacaoNaEstrutura(ESTRUTURA, "skill-jk-rowling").mudou).toBe(false);
    expect(garantirSpecCompletaNoEditor(EDITOR, null).mudou).toBe(false);
    expect(garantirFatoDossieNoRevisor(REVISOR, "vesper-escritor-de-capitulos").mudou).toBe(false);
    expect(garantirBlocoRevisorSkill(REVISOR, "skill-jk-rowling").mudou).toBe(false);
  });
});

describe("garantirRotacaoNaEstrutura (dan-brown)", () => {
  it("injeta a política de rotação no topo das NOTAS DE EXECUÇÃO", () => {
    const r = garantirRotacaoNaEstrutura(ESTRUTURA, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/NOTAS DE EXECUÇÃO[^\n]*\n<!-- ROTACAO-FIOS v1 -->/);
    expect(r.texto).toMatch(/nunca 4 capítulos seguidos no mesmo fio/);
    expect(r.texto).toMatch(/Dia\/Hora corrente avança em toda spec/);
  });
  it("idempotente (marcador 1×)", () => {
    const um = garantirRotacaoNaEstrutura(ESTRUTURA, "skill-dan-brown").texto;
    expect(garantirRotacaoNaEstrutura(um, "skill-dan-brown").mudou).toBe(false);
    expect(contar(um, MARCADOR_ROTACAO)).toBe(1);
  });
  it("cria a seção quando não há NOTAS DE EXECUÇÃO", () => {
    const r = garantirRotacaoNaEstrutura("# Estrutura\n\n## Ato I\n- cap 1.\n", "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/## NOTAS DE EXECUÇÃO \(montagem\)/);
  });
});

describe("garantirSpecCompletaNoEditor (dan-brown)", () => {
  it("injeta o formato SPEC COMPLETA (os campos que o arquiteto dropava)", () => {
    const r = garantirSpecCompletaNoEditor(EDITOR, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_SPEC_COMPLETA);
    expect(r.texto).toMatch(/Fio de POV/);
    expect(r.texto).toMatch(/Dia\/Hora corrente/);
    expect(r.texto).toMatch(/Montagem/);
    expect(r.texto).toMatch(/Forma \(anti-mesmice\)/);
    expect(r.texto).toMatch(/Notas de precisão factual/);
    expect(r.texto).toMatch(/Justificativa de fio/);
  });
  it("idempotente", () => {
    const um = garantirSpecCompletaNoEditor(EDITOR, "skill-dan-brown").texto;
    expect(garantirSpecCompletaNoEditor(um, "skill-dan-brown").mudou).toBe(false);
    expect(contar(um, MARCADOR_SPEC_COMPLETA)).toBe(1);
  });
});

describe("garantirFatoDossieNoRevisor (dan-brown)", () => {
  it("injeta o item fato-vs-dossiê", () => {
    const r = garantirFatoDossieNoRevisor(REVISOR, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_FATO_DOSSIE);
    expect(r.texto).toMatch(/dossie-factual\.md/);
    expect(r.texto).toMatch(/marcado como hipótese/);
  });
  it("idempotente", () => {
    const um = garantirFatoDossieNoRevisor(REVISOR, "skill-dan-brown").texto;
    expect(garantirFatoDossieNoRevisor(um, "skill-dan-brown").mudou).toBe(false);
    expect(contar(um, MARCADOR_FATO_DOSSIE)).toBe(1);
  });
  it("hoover/romantasy (dossie=false) → no-op", () => {
    expect(garantirFatoDossieNoRevisor(REVISOR, "hoover-mcfadden").mudou).toBe(false);
    expect(garantirFatoDossieNoRevisor(REVISOR, "skill-romantasy").mudou).toBe(false);
  });
});

describe("SPEC-HM1/HM2 — hoover (relógios + narradora + pistas + DIA/HORA)", () => {
  it("Estrutura: injeta RELOGIOS-NARRADORA (DIA/HORA avança, relógio move, presente)", () => {
    const r = garantirRotacaoNaEstrutura(ESTRUTURA, "hoover-mcfadden");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_RELOGIOS_NARRADORA);
    expect(r.texto).toMatch(/DIA\/HORA corrente avança em toda spec/);
    expect(r.texto).toMatch(/≥1 relógio da MATRIZ DE RELÓGIOS move por capítulo/);
    expect(r.texto).toMatch(/1ª pessoa PRESENTE/);
  });
  it("Estrutura: idempotente (marcador 1×)", () => {
    const um = garantirRotacaoNaEstrutura(ESTRUTURA, "hoover-mcfadden").texto;
    expect(garantirRotacaoNaEstrutura(um, "hoover-mcfadden").mudou).toBe(false);
    expect(contar(um, MARCADOR_RELOGIOS_NARRADORA)).toBe(1);
  });
  it("Editor: SPEC COMPLETA com Relógios/Pistas/Narradora/Dia-Hora/Gancho", () => {
    const r = garantirSpecCompletaNoEditor(EDITOR, "hoover-mcfadden");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_SPEC_COMPLETA);
    expect(r.texto).toMatch(/Dia\/Hora corrente/);
    expect(r.texto).toMatch(/\*\*Relógios:\*\*/);
    expect(r.texto).toMatch(/\*\*Pistas:\*\*/);
    expect(r.texto).toMatch(/\*\*Narradora:\*\*/);
    expect(r.texto).toMatch(/\*\*Gancho:\*\*/);
  });
  it("Revisor: sem bloco extra (fair-play fica no LLM) → garantirBlocoRevisorSkill no-op", () => {
    expect(garantirBlocoRevisorSkill(REVISOR, "hoover-mcfadden").mudou).toBe(false);
  });
});

describe("SPEC-RM1/RM2 — romantasy (POV duplo + custo-escala + slow burn)", () => {
  it("Estrutura: injeta ROTACAO-POV (nunca 2 caps no mesmo amante)", () => {
    const r = garantirRotacaoNaEstrutura(ESTRUTURA, "skill-romantasy");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_ROTACAO_POV);
    expect(r.texto).toMatch(/nunca 2 capítulos seguidos no mesmo amante/);
    expect(r.texto).toMatch(/Justificativa de POV/);
  });
  it("Estrutura: idempotente (marcador 1×)", () => {
    const um = garantirRotacaoNaEstrutura(ESTRUTURA, "skill-romantasy").texto;
    expect(garantirRotacaoNaEstrutura(um, "skill-romantasy").mudou).toBe(false);
    expect(contar(um, MARCADOR_ROTACAO_POV)).toBe(1);
  });
  it("Editor: SPEC COMPLETA com Ponto de vista/Degrau slow burn/Custo de magia", () => {
    const r = garantirSpecCompletaNoEditor(EDITOR, "skill-romantasy");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/\*\*Ponto de vista:\*\*/);
    expect(r.texto).toMatch(/\*\*Degrau slow burn:\*\*/);
    expect(r.texto).toMatch(/\*\*Custo de magia:\*\*/);
  });
  it("Revisor: injeta o item CUSTO-ESCALA (deus-ex proibido)", () => {
    const r = garantirBlocoRevisorSkill(REVISOR, "skill-romantasy");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CUSTO_ESCALA);
    expect(r.texto).toMatch(/Custo-escala da magia/);
    expect(r.texto).toMatch(/deus-ex/);
  });
  it("Revisor: idempotente", () => {
    const um = garantirBlocoRevisorSkill(REVISOR, "skill-romantasy").texto;
    expect(garantirBlocoRevisorSkill(um, "skill-romantasy").mudou).toBe(false);
    expect(contar(um, MARCADOR_CUSTO_ESCALA)).toBe(1);
  });
});

// FASE 2 (qualidade/deteccao): a camada editorial estava CEGA para o dan-brown — Modo/Novidade
// eram DESCRITOS no system prompt do editor mas AUSENTES do camposSpec, entao o gate nao os
// cobrava, o editor os omitia e Source Reveal Streak / Novelty / Set-Piece ficavam inertes.
describe("FASE 2 — Modo/Novidade agora no camposSpec de toda skill gated (cegueira fechada)", () => {
  it("as 3 skills gated incluem 'Modo' e 'Novidade' no camposSpec", () => {
    for (const skill of ["skill-dan-brown", "hoover-mcfadden", "skill-romantasy"]) {
      const campos = exigenciasParaSkill(skill)!.camposSpec;
      expect(campos).toContain("Modo");
      expect(campos).toContain("Novidade");
    }
  });

  it("skill sem exigencia (jk-rowling): continua sem camposSpec (no-op preservado)", () => {
    expect(exigenciasParaSkill("skill-jk-rowling")).toBeNull();
  });

  it("o bloco SPEC COMPLETA injetado no editor descreve Modo e Novidade (dado que o gate cobra)", () => {
    const r = garantirSpecCompletaNoEditor("# livro-editor\n", "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain("**Modo:**");
    expect(r.texto).toContain("**Novidade:**");
    // idempotente
    expect(garantirSpecCompletaNoEditor(r.texto, "skill-dan-brown").mudou).toBe(false);
  });
});
