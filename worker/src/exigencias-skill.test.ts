import { describe, it, expect } from "vitest";
import {
  exigenciasParaSkill, garantirRotacaoNaEstrutura, garantirSpecCompletaNoEditor,
  garantirFatoDossieNoRevisor, MARCADOR_ROTACAO, MARCADOR_SPEC_COMPLETA, MARCADOR_FATO_DOSSIE,
} from "./exigencias-skill.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;
const ESTRUTURA = "# Estrutura\n\n## NOTAS DE EXECUÇÃO (para o pipeline)\n\n- fair-play.\n";
const EDITOR = "---\nname: livro-editor\nmodel: haiku\n---\n## Spec\n- POV / fio: <H|C|R>\n";
const REVISOR = "---\nname: livro-revisor\nmodel: sonnet\n---\n## Checklist\n- [ ] PdV.\n";

describe("exigenciasParaSkill — opt-in absoluto", () => {
  it("dan-brown tem entrada; as demais são NO-OP", () => {
    expect(exigenciasParaSkill("skill-dan-brown")?.dossie).toBe(true);
    expect(exigenciasParaSkill("skill-jk-rowling")).toBeNull();
    expect(exigenciasParaSkill("hoover-mcfadden")).toBeNull();
    expect(exigenciasParaSkill(null)).toBeNull();
    expect(exigenciasParaSkill(undefined)).toBeNull();
  });
  it("skill sem entrada não muda NENHUM arquivo", () => {
    expect(garantirRotacaoNaEstrutura(ESTRUTURA, "skill-jk-rowling").mudou).toBe(false);
    expect(garantirSpecCompletaNoEditor(EDITOR, null).mudou).toBe(false);
    expect(garantirFatoDossieNoRevisor(REVISOR, "vesper-escritor-de-capitulos").mudou).toBe(false);
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
});
