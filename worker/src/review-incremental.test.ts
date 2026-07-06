import { describe, it, expect } from "vitest";
import { capitulosAlterados, escopoReview } from "./review-incremental.js";

// Constrói um snapshot de hash {"1":..,"2":..,..} para um livro de `total` capítulos.
function snapshot(total: number, versao = "v1"): Record<string, string> {
  const h: Record<string, string> = {};
  for (let n = 1; n <= total; n++) h[String(n)] = `hash_${n}_${versao}`;
  return h;
}
// Aplica uma "reescrita" mudando o hash SÓ dos capítulos listados (verdade do disco).
function reescrever(base: Record<string, string>, caps: number[]): Record<string, string> {
  const h = { ...base };
  for (const c of caps) h[String(c)] = `hash_${c}_reescrito`;
  return h;
}

describe("capitulosAlterados — verdade do disco (diff de hash)", () => {
  it("detecta só os capítulos cujo hash mudou", () => {
    const antes = snapshot(60);
    const depois = reescrever(antes, [10, 30, 50]);
    expect(capitulosAlterados(antes, depois)).toEqual([10, 30, 50]);
  });

  it("livro inalterado → nenhum capítulo alterado", () => {
    const antes = snapshot(60);
    expect(capitulosAlterados(antes, { ...antes })).toEqual([]);
  });

  it("capítulo que surgiu ou sumiu conta como alterado", () => {
    const antes = snapshot(5);
    const depois = snapshot(6); // capítulo 6 surgiu
    expect(capitulosAlterados(antes, depois)).toEqual([6]);
    expect(capitulosAlterados(depois, antes)).toEqual([6]); // e sumiu
  });
});

describe("escopoReview — iteração 1 varre o livro inteiro (não muda)", () => {
  it("iteração 1 = livro inteiro mesmo com alterados informados", () => {
    const r = escopoReview({ iteracao: 1, total: 60, capitulosAlterados: [10, 30, 50] });
    expect(r.livroInteiro).toBe(true);
    expect(r.escopo.length).toBe(60);
    expect(r.carregados).toEqual([]);
  });
});

describe("DoD (a) — iteração 2+ lê SÓ os afetados + vizinhos, não o livro inteiro", () => {
  it("60 capítulos, 3 pendências na iteração 1 → iteração 2 lê 9, não 60", () => {
    const H1 = snapshot(60);
    // Iteração 1: varredura completa. "arquivos lidos" = livro inteiro.
    const lidosIter1 = escopoReview({ iteracao: 1, total: 60, capitulosAlterados: [] }).escopo.length;
    expect(lidosIter1).toBe(60);

    // REESCRITA cirúrgica corrige as 3 pendências (caps 10, 30, 50). O disco muda só neles.
    const H2 = reescrever(H1, [10, 30, 50]);
    const alterados = capitulosAlterados(H1, H2);
    expect(alterados).toEqual([10, 30, 50]);

    // Iteração 2: escopo = alterados + vizinhos imediatos.
    const r2 = escopoReview({
      iteracao: 2,
      total: 60,
      capitulosAlterados: alterados,
      capitulosPendencias: [10, 30, 50],
    });
    expect(r2.livroInteiro).toBe(false);
    expect(r2.escopo).toEqual([9, 10, 11, 29, 30, 31, 49, 50, 51]);

    // A prova de escopo reduzido: 9 arquivos lidos, não 60.
    const lidosIter2 = r2.escopo.length;
    expect(lidosIter2).toBe(9);
    expect(lidosIter2).toBeLessThan(lidosIter1);

    // Os 51 restantes entram ancorados na avaliação anterior (não relidos, texto idêntico).
    expect(r2.carregados.length).toBe(51);
    expect(new Set([...r2.escopo, ...r2.carregados]).size).toBe(60); // cobertura total do livro
  });

  it("vizinhos são recortados nas bordas do livro (cap 1 e cap N)", () => {
    const H1 = snapshot(60);
    const H2 = reescrever(H1, [1, 60]);
    const r = escopoReview({
      iteracao: 2,
      total: 60,
      capitulosAlterados: capitulosAlterados(H1, H2),
      capitulosPendencias: [1, 60],
    });
    expect(r.escopo).toEqual([1, 2, 59, 60]); // sem 0 nem 61
  });
});

describe("DoD (b) — regressão FORA das pendências NÃO passa batida (teste negativo)", () => {
  it("cap fora da lista de pendências que regrediu (mudou no disco) entra no escopo", () => {
    const H1 = snapshot(60);
    // A REESCRITA deveria tocar só as pendências [10, 30, 50], MAS por engano/regressão
    // também alterou o capítulo 42 (que ninguém pediu para mexer).
    const H2 = reescrever(H1, [10, 30, 50, 42]);
    const alterados = capitulosAlterados(H1, H2);
    expect(alterados).toEqual([10, 30, 42, 50]);

    const r = escopoReview({
      iteracao: 2,
      total: 60,
      capitulosAlterados: alterados, // sinal PRIMÁRIO = disco
      capitulosPendencias: [10, 30, 50], // pendências NÃO mencionam o 42
    });

    // SALVAGUARDA: o 42 (regressão fora das pendências) está no escopo e SERÁ relido.
    expect(r.escopo).toContain(42);
    expect(r.escopo).toContain(41);
    expect(r.escopo).toContain(43);
    expect(r.carregados).not.toContain(42); // não foi silenciosamente carregado como "inalterado"
  });

  it("CONTRA-PROVA: sem o sinal de disco, confiar só nas pendências DEIXARIA o 42 passar", () => {
    // Demonstra por que o disco é o sinal primário: se o escopo dependesse só das
    // pendências auto-relatadas [10,30,50], o 42 regredido escaparia da review.
    const soPendencias = escopoReview({
      iteracao: 2,
      total: 60,
      capitulosAlterados: [], // ninguém olhou o disco
      capitulosPendencias: [10, 30, 50],
    });
    expect(soPendencias.escopo).not.toContain(42); // <- exatamente o buraco que o disco fecha
  });
});

describe("escopoReview — fallback conservador", () => {
  it("iteração 2 sem nada alterado e sem pendência → cai para o livro inteiro (nunca sub-avalia)", () => {
    const r = escopoReview({ iteracao: 2, total: 40, capitulosAlterados: [], capitulosPendencias: [] });
    expect(r.livroInteiro).toBe(true);
    expect(r.escopo.length).toBe(40);
  });
});
