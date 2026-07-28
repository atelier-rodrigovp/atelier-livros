// Fatia D — execução encadeada por checkpoint.
import { describe, expect, it } from "vitest";
import { capsPorExecucao, devolverAFilaNoCheckpoint } from "./integracao.js";

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

  it("lote cheio com livro incompleto devolve à fila (a execução continua depois)", () => {
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
