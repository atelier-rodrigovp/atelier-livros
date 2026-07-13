import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/quality-parity.json";
import { cadenciaAcima, contarManeirismos, contarMuletas, orcCadenciaParaSkill } from "./maneirismo.js";

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

  // Cadência (autópsia 53adade cap-37): anáfora por artigo funcional e frase
  // curta de ação não estouram; anáfora real e beats de ênfase estouram.
  // Nomes de tique diferem por acento entre TS/Python — comparação normalizada.
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const f of fixtures.cadencia) {
    it(`TS cadência fixture ${f.name}`, () => {
      const acima = cadenciaAcima(f.text, orcCadenciaParaSkill("skill-dan-brown"));
      const hit = acima.some((q) => norm(q.nome).includes(norm(f.tiqueContains)));
      expect(hit).toBe(f.expectedAbove);
    });
  }
});
