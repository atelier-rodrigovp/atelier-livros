// Esforço e timeout por papel — fatias 3+4.
//
// Antes: todo papel no esforço padrão do CLI, com teto único de 600 s e dois
// `timeoutMs: 900000` soltos em `fundacao.ts`. `arquiteto_enredo` falhava
// metade das vezes por `timeout após 300000ms` — relógio, não capacidade.
//
// A armadilha que estes testes existem para fechar: o CLI **ignora** valor de
// esforço inválido com um aviso e SEGUE RODANDO. Sem conferir esse aviso, a
// engine roda no padrão acreditando que roda em `high`, e ninguém descobre.

import { describe, expect, it } from "vitest";
import { argumentosClaudeCli, conferirEsforcoAplicado, ErroProvedor } from "./provedor.js";
import { executarPapel } from "./papeis.js";
import { CLASSE_POR_PAPEL, EXECUCAO_POR_PAPEL, type MapaModelos, type Papel } from "./tipos.js";

const MAPA: MapaModelos = {
  raciocinio: "claude-sonnet-5",
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
  julgamento: "claude-sonnet-5",
};

const PACOTE = {
  hash: "bundle",
  papel: "arquiteto_enredo",
  alvo: "x",
  skill: { id: "s", versao: "1", hash: "h" },
  instrucoes: [],
  repeticoesRecentes: [],
  secoes: [],
} as never;

describe("configuração é dado, não número mágico", () => {
  it("todos os 10 papéis têm esforço e timeout declarados", () => {
    const papeis = Object.keys(CLASSE_POR_PAPEL) as Papel[];
    expect(papeis).toHaveLength(10);
    for (const p of papeis) {
      expect(EXECUCAO_POR_PAPEL[p], p).toBeDefined();
      expect(EXECUCAO_POR_PAPEL[p].timeoutMs, p).toBeGreaterThanOrEqual(120_000);
      expect(["low", "medium", "high", "xhigh", "max"]).toContain(EXECUCAO_POR_PAPEL[p].esforco);
    }
  });

  it("o piso de 120 s da regra é respeitado por todos", () => {
    for (const [p, e] of Object.entries(EXECUCAO_POR_PAPEL)) {
      expect(e.timeoutMs, p).toBeGreaterThanOrEqual(120_000);
    }
  });

  it("arquiteto_enredo: 1200 s = ~3x o maior SUCESSO real (333 s / 30.706 tokens)", () => {
    expect(EXECUCAO_POR_PAPEL.arquiteto_enredo.timeoutMs).toBe(1_200_000);
  });
});

describe("argumentos do CLI por papel", () => {
  it("arquiteto_enredo monta --effort high", () => {
    const args = argumentosClaudeCli("claude-sonnet-5", EXECUCAO_POR_PAPEL.arquiteto_enredo.esforco);
    expect(args.join(" ")).toBe("-p --model claude-sonnet-5 --output-format json --tools  --effort high");
  });

  it("contextualizador monta --effort low", () => {
    const args = argumentosClaudeCli("claude-haiku-4-5-20251001", EXECUCAO_POR_PAPEL.contextualizador.esforco);
    expect(args).toContain("--effort");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
  });

  it("sem esforço declarado, a flag não entra (compatibilidade)", () => {
    expect(argumentosClaudeCli("claude-sonnet-5")).not.toContain("--effort");
  });
});

describe("esforço inválido FALHA FECHADO", () => {
  it("o aviso do CLI vira erro do run, não sucesso", () => {
    // Saída real do CLI: ele avisa e continua. Para a engine, o run é inválido.
    const saida = "Warning: Unknown --effort value 'ultra' — ignoring it and using the default effort.";
    expect(() => conferirEsforcoAplicado(saida, "high", "2.1.220")).toThrow(ErroProvedor);
  });

  it("a mensagem é acionável: diz os valores aceitos e por que o run não vale", () => {
    const saida = "Unknown --effort value 'x' — ignoring it";
    try {
      conferirEsforcoAplicado(saida, "high", "2.1.220");
      throw new Error("deveria ter lançado");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain("low, medium, high, xhigh, max");
      expect(m).toContain("2.1.220");
      expect(m).toMatch(/nao da para afirmar em que esforco/i);
    }
  });

  it("saída limpa não levanta nada", () => {
    expect(() => conferirEsforcoAplicado('{"is_error":false}', "high", "2.1.220")).not.toThrow();
  });

  it("sem esforço pedido, não há o que conferir", () => {
    expect(() => conferirEsforcoAplicado("Unknown --effort value 'x'", undefined, "2.1.220")).not.toThrow();
  });
});

describe("flag ausente FALHA FECHADO", () => {
  it("CLI antigo que não conhece --effort é erro, não fallback silencioso", () => {
    const saida = "error: unknown option '--effort'";
    expect(() => conferirEsforcoAplicado(saida, "medium", "1.9.0")).toThrow(/nao conhece a flag --effort/);
  });

  it("a mensagem nomeia a versão instalada e a necessária", () => {
    try {
      conferirEsforcoAplicado("error: unknown option '--effort'", "medium", "1.9.0");
      throw new Error("deveria ter lançado");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain("1.9.0");
      expect(m).toContain("2.1");
    }
  });
});

describe("timeout e esforço chegam ao executor, e ao run", () => {
  async function capturar(papel: Papel) {
    const chamadas: Record<string, unknown>[] = [];
    const runs: Record<string, unknown>[] = [];
    const provedor = {
      nome: "mock",
      versao: () => "2.1.220 (Claude Code)",
      chamar: async (c: Record<string, unknown>) => {
        chamadas.push(c);
        return { texto: "ok", modeloExecutado: MAPA[CLASSE_POR_PAPEL[papel]] };
      },
    } as never;
    const gravador = {
      iniciarRun: async () => "run-1",
      falharRun: async () => undefined,
      concluirRun: async (_id: string, r: Record<string, unknown>) => {
        runs.push(r);
      },
    } as never;
    await executarPapel<string>({
      papel,
      alvo: "x",
      pacote: { ...(PACOTE as object), papel } as never,
      tarefa: "faça",
      parse: (t: string) => t,
      gravador,
      provedor,
      mapa: MAPA,
    } as never);
    return { chamada: chamadas[0], run: runs[0] };
  }

  it("arquiteto_enredo recebe 1.200.000 ms e high", async () => {
    const { chamada } = await capturar("arquiteto_enredo");
    expect(chamada.timeoutMs).toBe(1_200_000);
    expect(chamada.esforco).toBe("high");
  });

  it("contextualizador recebe 120.000 ms e low", async () => {
    const { chamada } = await capturar("contextualizador");
    expect(chamada.timeoutMs).toBe(120_000);
    expect(chamada.esforco).toBe("low");
  });

  it("cada papel recebe exatamente o que a tabela declara", async () => {
    for (const papel of ["escritor", "revisor_literario", "auditor_factual", "arquiteto_cena"] as Papel[]) {
      const { chamada } = await capturar(papel);
      expect(chamada.timeoutMs, papel).toBe(EXECUCAO_POR_PAPEL[papel].timeoutMs);
      expect(chamada.esforco, papel).toBe(EXECUCAO_POR_PAPEL[papel].esforco);
    }
  });

  it("o run grava o esforço solicitado e a versão do CLI", async () => {
    const { run } = await capturar("escritor");
    const ev = run.evidencias as { referencia: string; detalhe: unknown }[];
    expect(ev.find((x) => x.referencia === "esforco_solicitado")?.detalhe).toBe("high");
    expect(ev.find((x) => x.referencia === "cli_versao")?.detalhe).toBe("2.1.220 (Claude Code)");
  });

  it("o run continua gravando o modelo executado (fatia anterior intacta)", async () => {
    const { run } = await capturar("escritor");
    const ev = run.evidencias as { referencia: string; detalhe: unknown }[];
    expect(ev.find((x) => x.referencia === "modelo_executado")?.detalhe).toBe("claude-opus-5");
  });

  it("provedor sem `versao` não quebra (mocks antigos)", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const provedor = {
      nome: "mock-antigo",
      chamar: async (c: Record<string, unknown>) => {
        chamadas.push(c);
        return { texto: "ok", modeloExecutado: "claude-haiku-4-5-20251001" };
      },
    } as never;
    const gravador = { iniciarRun: async () => "r", falharRun: async () => undefined, concluirRun: async () => undefined } as never;
    await executarPapel<string>({
      papel: "contextualizador",
      alvo: "x",
      pacote: { ...(PACOTE as object), papel: "contextualizador" } as never,
      tarefa: "f",
      parse: (t: string) => t,
      gravador,
      provedor,
      mapa: MAPA,
    } as never);
    expect(chamadas[0].timeoutMs).toBe(120_000);
  });
});

describe("o que não mudou", () => {
  it("nenhum papel usa mais timeout solto: `fundacao.ts` não passa timeoutMs", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    expect(readFileSync(path.join(aqui, "fundacao.ts"), "utf8")).not.toContain("timeoutMs");
  });

});
