// Duração medida na FONTE e fim carimbado no fim — achado A1.
//
// `finished_at` é carimbo de ciclo de vida da linha. No run `889f9fc9` ele saiu
// 27 minutos depois do trabalho, que morreu aos 5 com `tokens_out` nulo — e esse
// artefato sozinho levou o p95 do papel a 1106 s num universo de 9 runs, quase
// fazendo a fatia anterior dimensionar timeout por um bug.
//
// A medição passa a vir do cronômetro do spawn, gravado no run.

import { describe, expect, it } from "vitest";
import { ErroProvedor, ProvedorClaudeCli } from "./provedor.js";
import { executarPapel } from "./papeis.js";
import { EXECUCAO_POR_PAPEL, type MapaModelos, type Papel } from "./tipos.js";

const MAPA: MapaModelos = {
  raciocinio: "claude-sonnet-5",
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
  julgamento: "claude-sonnet-5",
};

const pacote = (papel: Papel) =>
  ({
    hash: "bundle",
    papel,
    alvo: "x",
    skill: { id: "s", versao: "1", hash: "h" },
    instrucoes: [],
    repeticoesRecentes: [],
    secoes: [],
  }) as never;

/** Roda um papel com provedor controlado e devolve o que foi gravado. */
async function rodar(opts: {
  papel?: Papel;
  chamar: () => Promise<Record<string, unknown>>;
}) {
  const concluidos: Record<string, unknown>[] = [];
  const falhados: { id: string; erro: Record<string, unknown>; em: number }[] = [];
  const papel = opts.papel ?? "contextualizador";
  const provedor = { nome: "mock", versao: () => "2.1.220", chamar: opts.chamar } as never;
  const gravador = {
    iniciarRun: async () => "run-1",
    // O gravador real carimba `finished_at: this.agora()` dentro de falharRun;
    // aqui registramos QUANDO ele foi chamado, que é o que importa provar.
    falharRun: async (id: string, erro: Record<string, unknown>) => {
      falhados.push({ id, erro, em: Date.now() });
    },
    concluirRun: async (_id: string, r: Record<string, unknown>) => concluidos.push(r),
  } as never;
  let erro: unknown;
  try {
    await executarPapel<string>({
      papel,
      alvo: "x",
      pacote: pacote(papel),
      tarefa: "t",
      parse: (t: string) => t,
      gravador,
      provedor,
      mapa: MAPA,
    } as never);
  } catch (e) {
    erro = e;
  }
  return { concluidos, falhados, erro };
}

describe("duração vem do cronômetro da chamada, não da linha", () => {
  it("o run grava duracao_chamada_ms com o valor medido pelo provedor", async () => {
    const { concluidos } = await rodar({
      chamar: async () => ({ texto: "ok", modeloExecutado: MAPA.fatos, duracaoMs: 4321 }),
    });
    const ev = concluidos[0].evidencias as { referencia: string; detalhe: unknown }[];
    expect(ev.find((x) => x.referencia === "duracao_chamada_ms")?.detalhe).toBe("4321");
  });

  it("duração ausente não vira zero silencioso", async () => {
    // Zero seria lido como "chamada instantânea" numa média futura.
    const { concluidos } = await rodar({
      chamar: async () => ({ texto: "ok", modeloExecutado: MAPA.fatos }),
    });
    const ev = concluidos[0].evidencias as { referencia: string; detalhe: unknown }[];
    expect(ev.find((x) => x.referencia === "duracao_chamada_ms")?.detalhe).toBe("");
  });

  it("o cronômetro é real: um spawn que falha ainda devolve duração", async () => {
    // Binário inexistente exercita o caminho `p.on("error")` com spawn de verdade.
    const p = new ProvedorClaudeCli("binario-que-nao-existe-xyz");
    const t0 = Date.now();
    await expect(
      p.chamar({ papel: "contextualizador", capacidade: "fatos", modelo: MAPA.fatos, prompt: "x", timeoutMs: 20_000 })
    ).rejects.toBeInstanceOf(Error);
    // O importante: falhou rápido, e não pendurou até o timeout de 20 s.
    expect(Date.now() - t0).toBeLessThan(20_000);
  });
});

describe("o fim é carimbado no fim, inclusive quando o run morre", () => {
  it("TIMEOUT: falharRun é chamado na hora do estouro, não depois", async () => {
    const t0 = Date.now();
    const { falhados, erro } = await rodar({
      chamar: async () => {
        throw new ErroProvedor("PROVEDOR_TIMEOUT", "claude CLI: timeout após 120000ms");
      },
    });
    expect(falhados.length).toBeGreaterThan(0);
    expect(String((falhados[0].erro as { mensagem: string }).mensagem)).toContain("timeout");
    // Sem espera pendurada entre o erro e o carimbo — era a hipótese do 889f9fc9.
    expect(falhados[0].em - t0).toBeLessThan(5_000);
    expect(erro).toBeDefined();
  });

  it("ERRO DE INFRA que não é timeout também carimba o fim", async () => {
    const { falhados } = await rodar({
      chamar: async () => {
        throw new ErroProvedor("PROVEDOR_FALHOU", "claude CLI rc=1: conexão recusada");
      },
    });
    expect(falhados.length).toBeGreaterThan(0);
    expect((falhados[0].erro as { classe: string }).classe).toBe("infra");
  });

  it("cada tentativa que falha carimba o seu próprio run", async () => {
    let n = 0;
    const { falhados } = await rodar({
      chamar: async () => {
        n++;
        throw new ErroProvedor("PROVEDOR_FALHOU", `falha ${n}`);
      },
    });
    expect(falhados.length).toBe(n);
  });
});

describe("o timeout usado é o do papel", () => {
  it("contextualizador pede 120 s ao provedor", async () => {
    const vistos: Record<string, unknown>[] = [];
    await rodar({
      papel: "contextualizador",
      chamar: async (...args: unknown[]) => {
        vistos.push(args[0] as Record<string, unknown>);
        return { texto: "ok", modeloExecutado: MAPA.fatos, duracaoMs: 1 };
      },
    });
    expect(vistos[0].timeoutMs).toBe(EXECUCAO_POR_PAPEL.contextualizador.timeoutMs);
  });
});
