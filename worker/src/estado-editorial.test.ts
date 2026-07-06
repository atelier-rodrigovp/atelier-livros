import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  lerEstadoEditorial, gravarEstadoEditorial, estadoEditorialDefault, mergeEstadoEditorial,
} from "./estado-editorial.js";

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
