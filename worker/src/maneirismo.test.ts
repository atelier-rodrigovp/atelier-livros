import { describe, it, expect } from "vitest";
import { contarManeirismos, resumoManeirismo } from "./maneirismo.js";

describe("contarManeirismos", () => {
  it("conta antíteses 'não era X. Era Y.' e fragmentos", () => {
    const t = "Não era medo. Era algo pior. Ela correu. Não correu por covardia. Correu por instinto.";
    const r = contarManeirismos(t);
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.padroes.length).toBeGreaterThan(0);
  });

  it("conta clichês recorrentes", () => {
    const r = contarManeirismos("O mar de chumbo. Um silêncio ensurdecedor caiu.");
    expect(r.padroes.some((p) => /clich/i.test(p.nome))).toBe(true);
    expect(r.total).toBe(2);
  });

  it("prosa limpa → zero e não estoura orçamento", () => {
    const r = contarManeirismos("A manhã chegou devagar sobre a cidade adormecida, e ela seguiu pela rua.");
    expect(r.total).toBe(0);
    expect(r.acimaDoOrcamento).toBe(false);
  });

  it("densidade por 10k e estouro de orçamento", () => {
    const r = contarManeirismos("Não era X. Era Y.", 1); // texto curto, muitos tiques/palavra
    expect(r.por10k).toBeGreaterThan(0);
    expect(r.acimaDoOrcamento).toBe(true);
  });

  it("resumo legível", () => {
    expect(resumoManeirismo(contarManeirismos("Não era frio. Era pânico."))).toMatch(/Maneirismo:/);
    expect(resumoManeirismo(contarManeirismos("Texto limpo e calmo."))).toMatch(/nenhum tique/);
  });
});
