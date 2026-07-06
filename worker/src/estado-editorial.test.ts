import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  lerEstadoEditorial, gravarEstadoEditorial, estadoEditorialDefault, mergeEstadoEditorial,
  agenciaGenerica, processarNovidade, modoExpositivo,
} from "./estado-editorial.js";
import { exigenciasParaSkill, CAMPOS_EDITORIAIS_SPEC } from "./exigencias-skill.js";
import { exposicaoPosRevelacaoRisco } from "./maneirismo.js";

const proj = () => mkdtempSync(path.join(tmpdir(), "ed-"));

describe("estado-editorial (Fase 1)", () => {
  it("projeto sem o arquivo → schema default (não quebra em legado)", async () => {
    const d = proj();
    const e = await lerEstadoEditorial(d);
    expect(e).toEqual(estadoEditorialDefault());
    expect(e.source_reveal_streak).toBe(0);
    expect(e.agency_balance).toEqual({});
    expect(e.motif_ledger).toEqual([]);
  });

  it("gravar é idempotente (2ª gravação = bytes idênticos)", async () => {
    const d = proj();
    const est = estadoEditorialDefault();
    est.source_reveal_streak = 2;
    est.agency_balance = { Helena: 3 };
    await gravarEstadoEditorial(d, est);
    const b1 = readFileSync(path.join(d, "estado", "estado-editorial.json"), "utf8");
    // relê e regrava o mesmo estado
    await gravarEstadoEditorial(d, await lerEstadoEditorial(d));
    const b2 = readFileSync(path.join(d, "estado", "estado-editorial.json"), "utf8");
    expect(b2).toBe(b1);
  });

  it("ler o que foi gravado devolve os mesmos valores", async () => {
    const d = proj();
    await gravarEstadoEditorial(d, { source_reveal_streak: 4, open_loops: ["quem matou Danny?"] });
    const e = await lerEstadoEditorial(d);
    expect(e.source_reveal_streak).toBe(4);
    expect(e.open_loops).toEqual(["quem matou Danny?"]);
    expect(existsSync(path.join(d, "estado", "estado-editorial.json"))).toBe(true);
  });

  it("merge preenche campos faltantes de arquivo de versão anterior", () => {
    const parcial = { source_reveal_streak: 1 }; // arquivo antigo, só um campo
    const e = mergeEstadoEditorial(parcial);
    expect(e.source_reveal_streak).toBe(1);
    expect(e.paid_loops).toEqual([]);        // campo novo → default
    expect(e.last_high_impact_scene).toBeNull();
  });

  it("merge ignora tipos inválidos (robusto a arquivo corrompido)", () => {
    const e = mergeEstadoEditorial({ open_loops: "não-é-array" as any, source_reveal_streak: "x" as any });
    expect(e.open_loops).toEqual([]);
    expect(e.source_reveal_streak).toBe(0);
  });
});

describe("Agency Gate (Fase 2)", () => {
  it("campo universal 'Decisão/Ação' em toda skill gated", () => {
    for (const s of ["skill-dan-brown", "hoover-mcfadden", "skill-romantasy"]) {
      expect(exigenciasParaSkill(s)!.camposSpec).toContain("Decisão/Ação");
    }
  });
  it("agenciaGenerica: vazio/curto ou percepção passiva = genérico", () => {
    expect(agenciaGenerica("")).toBe(true);
    expect(agenciaGenerica("ele percebeu")).toBe(true);
    expect(agenciaGenerica("Helena percebeu que algo estava errado com a memória dela e ficou pensando")).toBe(true); // só percepção
  });
  it("agenciaGenerica: cena de escolha/ação concreta = NÃO genérico", () => {
    expect(agenciaGenerica("Cole decidiu não entregar o relógio ao rio e guardou a prova contra a própria regra, ao custo da vida")).toBe(false);
    expect(agenciaGenerica("Helena mente para Sam sobre o lapso, escolhe protegê-lo e assume o risco de ser descoberta")).toBe(false);
  });
});

describe("Novelty Gate (Fase 3)", () => {
  it("pergunta aberta → open_loops; pergunta paga (cap 2) → move p/ paid_loops", () => {
    let e = estadoEditorialDefault();
    e = processarNovidade(e, "info nova sobre o símbolo. pergunta aberta: quem matou Danny?");
    expect(e.open_loops).toContain("quem matou Danny?");
    expect(e.paid_loops).toEqual([]);
    e = processarNovidade(e, "revelação forte. pergunta paga: quem matou Danny — foi o Curador");
    expect(e.open_loops).toEqual([]);   // esvaziou
    expect(e.paid_loops.length).toBe(1); // cresceu
  });
  it("paga sem match adiciona a paid sem esvaziar open não-relacionado", () => {
    let e = estadoEditorialDefault();
    e = processarNovidade(e, "pergunta aberta: onde está o arquivo P12?");
    e = processarNovidade(e, "pergunta paga: a testemunha era falsa");
    expect(e.open_loops).toEqual(["onde está o arquivo P12?"]); // não relacionado, fica
    expect(e.paid_loops.length).toBe(1);
  });
  it("campo universal Novidade + Modo no editor (CAMPOS_EDITORIAIS_SPEC)", () => {
    expect(CAMPOS_EDITORIAIS_SPEC).toMatch(/\*\*Novidade:\*\*/);
    expect(CAMPOS_EDITORIAIS_SPEC).toMatch(/\*\*Modo:\*\*/);
  });
});

describe("Exposition Control pós-revelação (Fase 5)", () => {
  const conceitual =
    "A memória é uma reconstrução. É o que a mente faz. A verdade era uma abstração. " +
    "Havia um padrão. Ela era o padrão. Tudo era memória. A ideia era vasta. O conceito parecia infinito. " +
    "Nada existia além do pensamento. Era assim que a mente funcionava. Sempre havia sido assim.";
  it("sinaliza reexplicação conceitual SÓ quando houve revelação antes", () => {
    expect(exposicaoPosRevelacaoRisco(conceitual, true)).toBe(true);
    expect(exposicaoPosRevelacaoRisco(conceitual, false)).toBe(false);
  });
  it("prosa com ação/diálogo NÃO sinaliza mesmo pós-revelação", () => {
    const ativo = '— Corra! — gritou Cole.\n\nEla correu. A porta bateu. Ele puxou a arma. O carro derrapou. — Vai! — ela gritou, e saltaram.';
    expect(exposicaoPosRevelacaoRisco(ativo, true)).toBe(false);
  });
});

describe("Source Reveal Streak (Fase 4)", () => {
  it("modoExpositivo classifica exposição vs dramático", () => {
    expect(modoExpositivo("exposição")).toBe(true);
    expect(modoExpositivo("entrevista com a testemunha")).toBe(true);
    expect(modoExpositivo("documento / diálogo-informativo")).toBe(true);
    expect(modoExpositivo("ação / perseguição")).toBe(false);
    expect(modoExpositivo("confronto no beco")).toBe(false);
    expect(modoExpositivo("")).toBe(false);
  });
});
