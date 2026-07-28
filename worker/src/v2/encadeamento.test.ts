// Fatia D — execução encadeada por checkpoint.
import { describe, expect, it } from "vitest";
import {
  capsPorExecucao,
  devolverAFilaNoCheckpoint,
  livroCompleto,
  pararPorLoteDeNovos,
} from "./integracao.js";

describe("tamanho do lote por execução", () => {
  it("sem variável = livro inteiro numa execução (0 = sem lote)", () => {
    expect(capsPorExecucao({})).toBe(0);
    expect(capsPorExecucao({ V2_CAPS_POR_EXECUCAO: "0" })).toBe(0);
    expect(capsPorExecucao({ V2_CAPS_POR_EXECUCAO: "nao-numero" })).toBe(0);
    expect(capsPorExecucao({ V2_CAPS_POR_EXECUCAO: "-3" })).toBe(0);
  });

  it("valor positivo encadeia em lotes desse tamanho", () => {
    expect(capsPorExecucao({ V2_CAPS_POR_EXECUCAO: "1" })).toBe(1);
    expect(capsPorExecucao({ V2_CAPS_POR_EXECUCAO: "4" })).toBe(4);
  });
});

describe("decisão de devolver o job à fila no checkpoint", () => {
  it("lote desligado nunca encadeia — não vira 12 jobs nem para no meio", () => {
    expect(devolverAFilaNoCheckpoint({ lote: 0, novosCaps: 5, capitulo: 5, total: 12 })).toBe(false);
  });

  it("[DOD:D-01] lote cheio com livro incompleto devolve à fila (a execução continua depois)", () => {
    expect(devolverAFilaNoCheckpoint({ lote: 1, novosCaps: 1, capitulo: 3, total: 12 })).toBe(true);
    expect(devolverAFilaNoCheckpoint({ lote: 4, novosCaps: 4, capitulo: 8, total: 12 })).toBe(true);
  });

  it("lote ainda não cheio segue no mesmo job", () => {
    expect(devolverAFilaNoCheckpoint({ lote: 4, novosCaps: 2, capitulo: 6, total: 12 })).toBe(false);
  });

  it("ÚLTIMO capítulo nunca encadeia — a execução tem de seguir para o fechamento", () => {
    expect(devolverAFilaNoCheckpoint({ lote: 1, novosCaps: 1, capitulo: 12, total: 12 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D5 — `max_novos_caps` limita o LOTE; nunca produz falso `done`
// ---------------------------------------------------------------------------

describe("parada por lote de capítulos novos", () => {
  it("max_novos_caps=1 num livro de 12 devolve o job à fila, apontando o capítulo 2", () => {
    const p = pararPorLoteDeNovos({ maxNovosCaps: 1, novosCaps: 1, proximoCapitulo: 2, total: 12 });
    expect(p).not.toBeNull();
    expect(p!.proximoCapitulo).toBe(2);
    expect(p!.motivo).toContain("livro incompleto (1/12)");
  });

  it("lote ainda não cheio não para", () => {
    expect(pararPorLoteDeNovos({ maxNovosCaps: 3, novosCaps: 1, proximoCapitulo: 2, total: 12 })).toBeNull();
  });

  it("sem max_novos_caps (Infinity) nunca para por lote", () => {
    expect(pararPorLoteDeNovos({ maxNovosCaps: Infinity, novosCaps: 99, proximoCapitulo: 5, total: 12 })).toBeNull();
  });

  it("lote cheio no ÚLTIMO capítulo não encadeia — a execução segue para o fechamento", () => {
    expect(pararPorLoteDeNovos({ maxNovosCaps: 1, novosCaps: 1, proximoCapitulo: 13, total: 12 })).toBeNull();
  });
});

describe("livro completo é derivado dos capítulos, nunca do fim da execução", () => {
  const aprovados = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { status: "aprovado" }]));

  it("[DOD:D5-01] 1 de 12 aprovados NÃO é livro completo (o falso `done` que D5 corrige)", () => {
    expect(livroCompleto({ total: 12, statusPorCapitulo: aprovados(1) })).toBe(false);
  });

  it("[DOD:D5-02] 12 de 12 aprovados é livro completo", () => {
    expect(livroCompleto({ total: 12, statusPorCapitulo: aprovados(12) })).toBe(true);
  });

  it("aprovado_com_excecao conta como aprovado", () => {
    const caps = { ...aprovados(11), "12": { status: "aprovado_com_excecao" } };
    expect(livroCompleto({ total: 12, statusPorCapitulo: caps })).toBe(true);
  });

  it("furo no meio não é livro completo", () => {
    const caps = { ...aprovados(12), "7": { status: "bloqueado" } };
    expect(livroCompleto({ total: 12, statusPorCapitulo: caps })).toBe(false);
  });

  it("capítulo legado sem evidência não conta como aprovado", () => {
    const caps = { ...aprovados(12), "4": { status: "legado_sem_evidencia" } };
    expect(livroCompleto({ total: 12, statusPorCapitulo: caps })).toBe(false);
  });

  it("total zero nunca é completo", () => {
    expect(livroCompleto({ total: 0, statusPorCapitulo: {} })).toBe(false);
  });
});
