// Classificação de erros do claude CLI no caminho V2 (incidente 2026-07-22):
// o 429 do plano Max ("You've hit your session limit") virava PROVEDOR_FALHOU
// genérico → attempts++ → o recuperador re-enfileirava em loop quente por horas.
// classificarErroCli converte em LimiteMaxError (pausa com retry_at, não conta
// tentativa) e executarPapel deixa esse erro ATRAVESSAR sem retry técnico.
import { describe, expect, it } from "vitest";
import { LimiteMaxError } from "../limite-max.js";
import { ErroProvedor, classificarErroCli } from "./provedor.js";

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
});
