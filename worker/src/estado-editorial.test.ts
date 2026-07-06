import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  lerEstadoEditorial, gravarEstadoEditorial, estadoEditorialDefault, mergeEstadoEditorial,
  agenciaGenerica,
} from "./estado-editorial.js";
import { exigenciasParaSkill } from "./exigencias-skill.js";

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
