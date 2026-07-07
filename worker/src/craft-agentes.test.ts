import { describe, it, expect } from "vitest";
import {
  garantirCraftLeituraEscritor, garantirPropulsaoRevisor,
  MARCADOR_CRAFT_LEITURA, MARCADOR_PROPULSAO,
} from "./craft-agentes.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;

const ESCRITOR = `---
name: livro-escritor
model: opus
---
## Entradas
1. contexto/contexto-cap-NN.md — o digest.
3. perfil-de-voz.md.

Não releia os documentos integrais da fundação — o digest já traz o necessário.

## Saída
Grave em manuscrito/capitulo-NN.md.
`;

describe("garantirCraftLeituraEscritor", () => {
  it("injeta o bloco de leitura de craft + neutraliza o 'não releia'", () => {
    const r = garantirCraftLeituraEscritor(ESCRITOR);
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_LEITURA);
    expect(r.texto).toContain("<!-- /CRAFT-LEITURA -->");
    expect(r.texto).toMatch(/voz-e-oficio\.md/);
    expect(r.texto).toMatch(/metamodelo-thriller\.md/);
    // a linha blanket foi neutralizada
    expect(r.texto).not.toMatch(/Não releia os documentos integrais da fundação — o digest já traz/);
    expect(r.texto).toMatch(/a VOZ\/TÉCNICA você lê a CADA capítulo/);
  });
  it("idempotente (marcador 1×)", () => {
    const um = garantirCraftLeituraEscritor(ESCRITOR).texto;
    const dois = garantirCraftLeituraEscritor(um);
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR_CRAFT_LEITURA)).toBe(1);
  });
  it("injeção nova já manda CUMPRIR o ORÇAMENTO DE PÁGINA do perfil (SPEC-06)", () => {
    expect(garantirCraftLeituraEscritor(ESCRITOR).texto).toMatch(/ORÇAMENTO DE PÁGINA/);
  });
  it("UPGRADE: bloco v1 antigo (sem a linha do orçamento) ganha a linha sem duplicar", () => {
    // simula agente injetado antes da SPEC-06: bloco presente, sem a linha
    const v1 = garantirCraftLeituraEscritor(ESCRITOR).texto.replace(/\*\*CUMPRA o `### ORÇAMENTO DE PÁGINA`[^\n]*\n\n/, "");
    expect(v1).not.toMatch(/ORÇAMENTO DE PÁGINA/);
    const r = garantirCraftLeituraEscritor(v1);
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/ORÇAMENTO DE PÁGINA/);
    expect(contar(r.texto, MARCADOR_CRAFT_LEITURA)).toBe(1); // sem duplicar o bloco
    expect(garantirCraftLeituraEscritor(r.texto).mudou).toBe(false); // idempotente após upgrade
  });
});

describe("garantirPropulsaoRevisor", () => {
  it("injeta o veredito de propulsão (reprova 'competente e chato')", () => {
    const r = garantirPropulsaoRevisor("---\nname: livro-revisor\nmodel: sonnet\n---\n## Checklist\n- [ ] PdV.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_PROPULSAO);
    expect(r.texto).toMatch(/ISTO ESTÁ VIVO/);
    expect(r.texto).toMatch(/corta no PICO/);
    expect(r.texto).toMatch(/avança a cena ou só decora/);
  });
  it("idempotente", () => {
    const um = garantirPropulsaoRevisor("# rev\n").texto;
    expect(garantirPropulsaoRevisor(um).mudou).toBe(false);
    expect(contar(um, MARCADOR_PROPULSAO)).toBe(1);
  });
  it("SPEC-07: injeção nova carrega os critérios de paridade do inline", () => {
    const t = garantirPropulsaoRevisor("# rev\n").texto;
    expect(t).toMatch(/perfil-de-voz\.md/);
    expect(t).toMatch(/Voz fora do perfil/);
    expect(t).toMatch(/Continuidade dura vs ledger/);
    expect(t).toMatch(/símile-andaime.*eco de negação|eco de negação/);
    expect(t).toMatch(/antítese-haver/);
    expect(t).toMatch(/ninguño/); // SPEC-08: token estrangeiro vira item do revisor
  });
  it("SPEC-07: UPGRADE de bloco v1 (sem paridade) ganha o adendo sem duplicar", () => {
    const v1 = garantirPropulsaoRevisor("# rev\n").texto
      .replace(/### PARIDADE COM A REVISÃO INLINE[\s\S]*?(?=\n\n<!-- \/PROPULSAO -->)/, "")
      .replace(/\n{3,}/g, "\n\n");
    expect(v1).not.toMatch(/PARIDADE COM A REVISÃO INLINE/);
    const r = garantirPropulsaoRevisor(v1);
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/Continuidade dura vs ledger/);
    expect(contar(r.texto, MARCADOR_PROPULSAO)).toBe(1);
    expect(garantirPropulsaoRevisor(r.texto).mudou).toBe(false); // idempotente após upgrade
  });
});

describe("FASE 2/3 — defesa em profundidade no revisor (redundância conceitual + causal-gnômica)", () => {
  it("injeção nova carrega as duas categorias nomeadas novas", () => {
    const t = garantirPropulsaoRevisor("# rev\n").texto;
    expect(t).toMatch(/REDUNDÂNCIA CONCEITUAL entre capítulos/);   // FASE 2 step 4
    expect(t).toMatch(/reexplica/);
    expect(t).toMatch(/CLÁUSULA CAUSAL-GNÔMICA repetida/);          // FASE 3 (consultivo)
    expect(t).toMatch(/mais de 2 vezes/);
  });
  it("UPGRADE: bloco antigo (sem as categorias novas) as ganha sem duplicar o marcador", () => {
    // simula bloco já injetado ANTES desta mudança (com motif, sem os 2 adendos novos)
    const antigo = garantirPropulsaoRevisor("# rev\n").texto
      .replace(/### REDUNDÂNCIA CONCEITUAL entre capítulos[\s\S]*?(?=\n\n### CLÁUSULA)/, "")
      .replace(/### CLÁUSULA CAUSAL-GNÔMICA repetida[\s\S]*?(?=\n\n<!-- \/PROPULSAO -->)/, "")
      .replace(/\n{3,}/g, "\n\n");
    expect(antigo).not.toMatch(/REDUNDÂNCIA CONCEITUAL entre capítulos/);
    expect(antigo).not.toMatch(/CLÁUSULA CAUSAL-GNÔMICA repetida/);
    const r = garantirPropulsaoRevisor(antigo);
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/REDUNDÂNCIA CONCEITUAL entre capítulos/);
    expect(r.texto).toMatch(/CLÁUSULA CAUSAL-GNÔMICA repetida/);
    expect(contar(r.texto, MARCADOR_PROPULSAO)).toBe(1);
    expect(garantirPropulsaoRevisor(r.texto).mudou).toBe(false); // idempotente após upgrade
  });
});

describe("FASE 2 — interioridade-sem-evento como reprovação (skill-agnóstico, herdado por todo projeto)", () => {
  it("injeção nova carrega o gatilho de reprovação genérico", () => {
    const t = garantirPropulsaoRevisor("# rev\n").texto;
    expect(t).toMatch(/INTERIORIDADE-SEM-EVENTO — reprova/);
    expect(t).toMatch(/bem escrito e mesmo assim MORTO/);
    expect(t).toMatch(/Vale para toda voz/);       // explicitamente skill-agnóstico
    // nenhuma menção a uma skill específica no bloco (genérico de verdade)
    expect(t).not.toMatch(/dan-brown|hoover|romantasy|rowling|vesper/);
  });
  it("UPGRADE: bloco antigo (sem o adendo) o ganha sem duplicar o marcador", () => {
    const antigo = garantirPropulsaoRevisor("# rev\n").texto
      .replace(/### INTERIORIDADE-SEM-EVENTO — reprova[\s\S]*?(?=\n\n<!-- \/PROPULSAO -->)/, "")
      .replace(/\n{3,}/g, "\n\n");
    expect(antigo).not.toMatch(/INTERIORIDADE-SEM-EVENTO — reprova/);
    const r = garantirPropulsaoRevisor(antigo);
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/INTERIORIDADE-SEM-EVENTO — reprova/);
    expect(contar(r.texto, MARCADOR_PROPULSAO)).toBe(1);
    expect(garantirPropulsaoRevisor(r.texto).mudou).toBe(false);
  });
});
