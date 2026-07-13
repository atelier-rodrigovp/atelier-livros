import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/quality-parity.json";
import { contarManeirismos, contarMuletas } from "./maneirismo.js";

describe("contrato compartilhado TS/Python", () => {
  for (const f of fixtures.muletas) {
    it(`TS conta fixture ${f.name}`, () => {
      const hit = contarMuletas(f.text).find((m) => m.termo.toLowerCase().includes(f.termContains));
      expect(hit?.n).toBe(f.expectedCount);
    });
  }

  // Moldes (autópsia de convergência 2026-07-13): falso-positivos da regra
  // antiga não contam; antíteses verdadeiras contam. Espelhado no Python
  // por tools/test_quality_parity.py.
  for (const f of fixtures.moldes) {
    it(`TS molde fixture ${f.name}`, () => {
      const hit = contarManeirismos(f.text).padroes.find((p) => p.nome.includes(f.moldeContains));
      expect(hit?.n ?? 0).toBe(f.expectedCount);
    });
  }
});
