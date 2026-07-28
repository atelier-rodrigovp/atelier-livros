// O desvio V1/V2 é o ponto mais barato de mentir do sistema: um projeto marcado
// como V2 executando por código V1 sem nada no log parece V2 para quem olha o
// painel. Estes testes fixam o vocabulário do roteamento e provam que o desvio,
// quando é legítimo, sai audível.

import { describe, expect, it, vi } from "vitest";
import { registrarDesvioV1, TIPOS_V2 } from "./integracao.js";

describe("tipos que a V2 implementa", () => {
  it("cobre escrita, fundação, revisão, avaliação e refino", () => {
    for (const t of ["escrever_livro", "criar_fundacao", "revisar", "refinar_fundacao", "avaliar"]) {
      expect(TIPOS_V2.has(t), t).toBe(true);
    }
  });

  it("NÃO reivindica os jobs determinísticos que seguem na V1", () => {
    // EPUB, capa e tradução não têm pipeline V2. O ponto não é que rodem na V1 —
    // é que rodar na V1 seja uma decisão declarada, não um vazamento.
    for (const t of ["gerar_epub", "gerar_capa", "traduzir", "importar_vendas", "ping"]) {
      expect(TIPOS_V2.has(t), t).toBe(false);
    }
  });
});

describe("desvio para a V1 é audível", () => {
  it("registra job, tipo e motivo", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    registrarDesvioV1({ id: "job-1", tipo: "gerar_epub" }, "tipo 'gerar_epub' não tem implementação V2");
    expect(spy).toHaveBeenCalledTimes(1);
    const linha = String(spy.mock.calls[0][0]);
    expect(linha).toContain("job-1");
    expect(linha).toContain("gerar_epub");
    expect(linha).toContain("roteado para a V1");
    expect(linha).toContain("não tem implementação V2");
    spy.mockRestore();
  });

  it("o motivo nunca vai vazio (log sem causa não serve para auditar)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    registrarDesvioV1({ id: "job-2", tipo: "revisar" }, "revisão de tradução não tem pipeline V2");
    expect(String(spy.mock.calls[0][0])).toMatch(/—\s+\S/);
    spy.mockRestore();
  });
});
