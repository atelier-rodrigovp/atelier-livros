import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/quality-parity.json";
import { contarMuletas } from "./maneirismo.js";

describe("contrato compartilhado TS/Python", () => {
  for (const f of fixtures.muletas) {
    it(`TS conta fixture ${f.name}`, () => {
      const hit = contarMuletas(f.text).find((m) => m.termo.toLowerCase().includes(f.termContains));
      expect(hit?.n).toBe(f.expectedCount);
    });
  }
});
