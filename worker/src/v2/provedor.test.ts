// Classificação de erros do claude CLI no caminho V2 (incidente 2026-07-22):
// o 429 do plano Max ("You've hit your session limit") virava PROVEDOR_FALHOU
// genérico → attempts++ → o recuperador re-enfileirava em loop quente por horas.
// classificarErroCli converte em LimiteMaxError (pausa com retry_at, não conta
// tentativa) e executarPapel deixa esse erro ATRAVESSAR sem retry técnico.
import { describe, expect, it } from "vitest";
import { LimiteMaxError } from "../limite-max.js";
import {
  argumentosClaudeCli,
  ErroProvedor,
  classificarErroCli,
  exigirModeloExecutado,
  extrairMensagemCli,
} from "./provedor.js";

describe("argumentosClaudeCli", () => {
  it("desabilita ferramentas para manter cada papel como transformação pura de texto", () => {
    const args = argumentosClaudeCli("opus");
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
  });
});

describe("classificarErroCli", () => {
  it("mensagem REAL do incidente (session limit 429) vira LimiteMaxError com retry_at", () => {
    const msg =
      'claude CLI rc=1: {"type":"result","subtype":"success","is_error":true,"api_error_status":429,' +
      '"result":"You\'ve hit your session limit · resets 2:50am (America/Sao_Paulo)"}';
    const e = classificarErroCli(msg);
    expect(e).toBeInstanceOf(LimiteMaxError);
    const lm = e as LimiteMaxError;
    expect(lm.aguardandoReset).toBe(true);
    // retry_at existe e está no futuro próximo (reset parseado ou backoff ~35min)
    expect(Date.parse(lm.retryAt)).toBeGreaterThan(Date.now());
  });

  it("usage limit também é reconhecido", () => {
    expect(classificarErroCli("claude CLI is_error (?): You've hit your usage limit. Resets at 1:40am.")).toBeInstanceOf(
      LimiteMaxError
    );
  });

  it("erro comum do CLI segue como ErroProvedor", () => {
    const e = classificarErroCli("claude CLI rc=3221225794: ");
    expect(e).toBeInstanceOf(ErroProvedor);
    expect((e as ErroProvedor).codigo).toBe("PROVEDOR_FALHOU");
  });
});

describe("proveniência do modelo executado", () => {
  it("aceita somente o ID fixo solicitado", () => {
    expect(exigirModeloExecutado({
      modelUsage: { "claude-opus-5": { outputTokens: 10 } },
    }, "claude-opus-5")).toBe("claude-opus-5");
  });

  it("rejeita ausência, fallback ou mistura de modelos", () => {
    expect(() => exigirModeloExecutado({}, "claude-opus-5"))
      .toThrow(/executado\(s\): não informado/);
    expect(() => exigirModeloExecutado({
      modelUsage: { "claude-sonnet-5": { outputTokens: 10 } },
    }, "claude-opus-5")).toThrow(/claude-sonnet-5/);
    expect(() => exigirModeloExecutado({
      modelUsage: {
        "claude-opus-5": { outputTokens: 10 },
        "claude-haiku-4-5-20251001": { outputTokens: 1 },
      },
    }, "claude-opus-5")).toThrow(/PROVEDOR_MODELO_DIVERGENTE|executado/);
  });
});

describe("extrairMensagemCli — throttle no rc=1 (envelope com result após usage)", () => {
  it("recupera o result do envelope quando o rc!=0 traz JSON no stdout", () => {
    // Envelope REAL do incidente romantasy 00:03Z: is_error e usage vêm ANTES
    // do result, então um slice(0,400) do bruto perderia "session limit".
    const out =
      '{"is_error":true,"duration_api_ms":0,"num_turns":1,"stop_reason":"stop_sequence",' +
      '"session_id":"5e23f8ac","total_cost_usd":0,"usage":{"input_tokens":0,"output_tokens":0,' +
      '"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"service_tier":"standard"},' +
      '"result":"You\'ve hit your session limit · resets 2:50am (America/Sao_Paulo)"}';
    const msg = extrairMensagemCli("", out);
    expect(msg).toContain("session limit");
    // e a classificação agora reconhece o throttle → pausa, não erro que queima tentativa
    expect(classificarErroCli(`claude CLI rc=1: ${msg.slice(0, 400)}`)).toBeInstanceOf(LimiteMaxError);
  });

  it("stdout não-JSON cai no bruto", () => {
    expect(extrairMensagemCli("stderr real", "")).toBe("stderr real");
    expect(extrairMensagemCli("", "texto solto não-json")).toBe("texto solto não-json");
  });
});

describe("executarPapel — LimiteMaxError atravessa sem retry técnico", () => {
  it("re-lança na 1ª tentativa (retry local não ajuda no throttle)", async () => {
    const { executarPapel } = await import("./papeis.js");
    let chamadas = 0;
    const provedor = {
      nome: "stub",
      async chamar() {
        chamadas++;
        throw new LimiteMaxError("claude CLI: session limit", new Date(Date.now() + 60_000).toISOString());
      },
    };
    const gravador = {
      iniciarRun: async () => "run-1",
      falharRun: async () => undefined,
      concluirRun: async () => undefined,
    };
    await expect(
      executarPapel({
        papel: "escritor",
        alvo: "cap-1",
        pacote: {
          hash: "hash-do-bundle",
          papel: "escritor",
          alvo: "cap-1",
          skill: { id: "s", versao: "1.0.0", hash: "hash-da-skill" },
          instrucoes: [],
          repeticoesRecentes: [],
          secoes: [],
        } as never,
        tarefa: "t",
        parse: (t: string) => t,
        gravador: gravador as never,
        provedor: provedor as never,
        mapa: { forte: "m", media: "m", leve: "m" } as never,
      })
    ).rejects.toMatchObject({ name: "LimiteMaxError" });
    expect(chamadas).toBe(1); // sem 2ª tentativa
  });

  it("rejeita fallback do escritor sem tentar consumir uma segunda chamada", async () => {
    const { executarPapel } = await import("./papeis.js");
    let chamadas = 0;
    const provedor = {
      nome: "stub",
      async chamar() {
        chamadas++;
        return { texto: "prosa", modeloExecutado: "claude-sonnet-5" };
      },
    };
    const gravador = {
      iniciarRun: async () => "run-fallback",
      falharRun: async () => undefined,
      concluirRun: async () => undefined,
    };
    await expect(executarPapel({
      papel: "escritor",
      alvo: "cap-1",
      pacote: {
        hash: "bundle",
        papel: "escritor",
        alvo: "cap-1",
        skill: { id: "s", versao: "1", hash: "skill" },
        instrucoes: [],
        repeticoesRecentes: [],
        secoes: [],
      } as never,
      tarefa: "escreva",
      parse: (texto: string) => texto,
      gravador: gravador as never,
      provedor,
      mapa: {
        raciocinio: "claude-sonnet-5",
        fatos: "claude-haiku-4-5-20251001",
        prosa: "claude-opus-5",
        julgamento: "claude-sonnet-5",
      },
    })).rejects.toMatchObject({
      codigo: "PROVEDOR_MODELO_DIVERGENTE",
      classe: "configuracao",
    });
    expect(chamadas).toBe(1);
  });
});
