// Teto duro de falhas de infra por (execução, papel) — incidente 2026-07-21/22:
// 1.299 runs 'falha' do arquiteto_cena em cima de um 429 não classificado.
// Regras: (1) limite de cota NÃO consome tentativa nem conta no teto;
// (2) a 6ª falha de infra do mesmo papel na mesma execução aborta com classe 'quota'.
import { beforeEach, describe, expect, it } from "vitest";
import { LimiteMaxError } from "../limite-max.js";
import { classificarErroCli, extrairMensagemCli, ErroProvedor } from "./provedor.js";
import { executarPapel, TETO_FALHAS_INFRA, zerarFalhasInfra } from "./papeis.js";
import type { MapaModelos } from "./tipos.js";

const MAPA: MapaModelos = {
  raciocinio: "claude-sonnet-5",
  fatos: "claude-haiku-4-5-20251001",
  prosa: "claude-opus-5",
  julgamento: "claude-sonnet-5",
};

const PACOTE = {
  hash: "bundle",
  papel: "arquiteto_cena",
  alvo: "cap-1",
  skill: { id: "s", versao: "1", hash: "skill" },
  instrucoes: [],
  repeticoesRecentes: [],
  secoes: [],
} as never;

const GRAVADOR = {
  iniciarRun: async () => "run-x",
  falharRun: async () => undefined,
  concluirRun: async () => undefined,
} as never;

// Envelope REAL extraído do Supabase (engine_runs, papel arquiteto_cena, 2026-07-22):
// rc=1 com o result DEPOIS dos campos técnicos e "api_error_status":429.
const STDOUT_REAL_429 =
  '{"type":"result","subtype":"success","is_error":true,"api_error_status":429,' +
  '"duration_ms":1346,"duration_api_ms":0,"num_turns":1,' +
  '"result":"You\'ve hit your session limit · resets 1:10p"}';

function execucao(provedor: { nome: string; chamar: () => Promise<never> }, jobId: string) {
  return executarPapel<string>({
    papel: "arquiteto_cena",
    alvo: "cap-1",
    pacote: PACOTE,
    tarefa: "t",
    parse: (t: string) => t,
    gravador: GRAVADOR,
    provedor: provedor as never,
    mapa: MAPA,
    jobId,
  });
}

beforeEach(() => zerarFalhasInfra());

describe("limite de cota não consome tentativa nem conta no teto", () => {
  it("envelope real do Supabase → LimiteMaxError atravessa na 1ª chamada", async () => {
    let chamadas = 0;
    const provedor = {
      nome: "stub",
      async chamar(): Promise<never> {
        chamadas++;
        // Mesmo fluxo do ProvedorClaudeCli em rc!=0: extrai o result e classifica.
        const msg = extrairMensagemCli("", STDOUT_REAL_429);
        throw classificarErroCli(`claude CLI rc=1: ${msg.slice(0, 400)}`, { code: 1 });
      },
    };
    await expect(execucao(provedor, "job-quota")).rejects.toMatchObject({ name: "LimiteMaxError" });
    expect(chamadas).toBe(1); // sem retry técnico: quota pausa, não conta tentativa
  });

  it("envelope real truncado ANTES do result (só o 429 estruturado) → ainda é LimiteMaxError", () => {
    const truncado =
      '{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"duration_ms":2092';
    // stdout não parseia como JSON → extrai o bruto; a classificação pega o 429 estruturado.
    const msg = extrairMensagemCli("", truncado);
    expect(classificarErroCli(`claude CLI rc=1: ${msg.slice(0, 400)}`)).toBeInstanceOf(LimiteMaxError);
  });

  it("erro real de skill/disco segue como ErroProvedor (não vira quota)", () => {
    expect(classificarErroCli("claude CLI rc=1: ENOENT: no such file or directory")).toBeInstanceOf(ErroProvedor);
    expect(classificarErroCli("claude CLI rc=1: Skill 'x' não instalada no worker")).toBeInstanceOf(ErroProvedor);
  });
});

describe(`teto duro: > ${TETO_FALHAS_INFRA} falhas de infra do mesmo papel na mesma execução`, () => {
  it("6ª falha aborta com ErroEngine classe 'quota' (TETO_FALHAS_INFRA)", async () => {
    let chamadas = 0;
    const provedor = {
      nome: "stub",
      async chamar(): Promise<never> {
        chamadas++;
        throw new ErroProvedor("PROVEDOR_FALHOU", `infra caiu (chamada ${chamadas})`);
      },
    };
    // Cada executarPapel consome 2 tentativas (default). 1ª e 2ª execução: 4 falhas
    // → PROVEDOR_FALHOU infra. 3ª execução: 5ª falha (retry) + 6ª falha → teto.
    await expect(execucao(provedor, "job-storm")).rejects.toMatchObject({ codigo: "PROVEDOR_FALHOU", classe: "infra" });
    await expect(execucao(provedor, "job-storm")).rejects.toMatchObject({ codigo: "PROVEDOR_FALHOU", classe: "infra" });
    await expect(execucao(provedor, "job-storm")).rejects.toMatchObject({
      codigo: "TETO_FALHAS_INFRA",
      classe: "quota",
    });
    expect(chamadas).toBe(6); // a 6ª falha dispara o teto — nada além disso é gasto
  });

  it("execuções (jobs) distintas não compartilham o contador", async () => {
    const provedor = {
      nome: "stub",
      async chamar(): Promise<never> {
        throw new ErroProvedor("PROVEDOR_FALHOU", "infra caiu");
      },
    };
    await expect(execucao(provedor, "job-a")).rejects.toMatchObject({ classe: "infra" });
    await expect(execucao(provedor, "job-a")).rejects.toMatchObject({ classe: "infra" });
    // job-b começa do zero: falha como infra comum, não como teto
    await expect(execucao(provedor, "job-b")).rejects.toMatchObject({ codigo: "PROVEDOR_FALHOU", classe: "infra" });
  });

  it("LimiteMaxError intercalado NÃO incrementa o teto", async () => {
    let chamadas = 0;
    const provedor = {
      nome: "stub",
      async chamar(): Promise<never> {
        chamadas++;
        throw new LimiteMaxError("claude CLI: session limit", new Date(Date.now() + 60_000).toISOString());
      },
    };
    for (let i = 0; i < 10; i++) {
      await expect(execucao(provedor, "job-so-quota")).rejects.toMatchObject({ name: "LimiteMaxError" });
    }
    expect(chamadas).toBe(10); // 10 pausas de quota, nenhuma virou TETO_FALHAS_INFRA
  });
});
