import { describe, expect, it } from "vitest";
import { ErroPublicacao, payloadDaProntidao, SCHEMA_PRONTIDAO_PUBLICADA } from "./publicacao-prontidao.js";

const rel = (over: Record<string, unknown> = {}) => ({
  head: "190868d0000000000000000000000000000000aa",
  gerado_em: "2026-07-28T16:00:00Z",
  estados: {
    implementacao_local: "IMPLEMENTACAO_LOCAL_APROVADA",
    pre_canary: "PRE_CANARY_BLOQUEADO: PAPEIS_REAIS",
    release_producao: "RELEASE_PRODUCAO_BLOQUEADO",
  },
  bloqueios_producao: ["CALIBRACAO_HUMANA"],
  bloqueios: [],
  ...over,
});

describe("payload publicado", () => {
  it("leva schema, head, estados e bloqueios de produção", () => {
    const p = payloadDaProntidao(rel());
    expect(p.schema).toBe(SCHEMA_PRONTIDAO_PUBLICADA);
    expect(p.head).toHaveLength(40);
    expect(p.bloqueios_producao).toEqual(["CALIBRACAO_HUMANA"]);
  });

  it("NÃO leva log, caminho de arquivo nem nada além do necessário", () => {
    // O payload aparece na interface e o remoto é público.
    const p = payloadDaProntidao(rel({ nivel1: { itens: [{ evidencia: "C:/Users/Fulano/..." }] }, avisos: ["x"] }));
    expect(Object.keys(p).sort()).toEqual(["bloqueios_producao", "estados", "gerado_em", "head", "schema"]);
  });
});

describe("o que NÃO pode ser publicado", () => {
  it("relatório sem HEAD válido", () => {
    expect(() => payloadDaProntidao(rel({ head: "desconhecido" }))).toThrow(ErroPublicacao);
  });

  it("HEAD curto não passa por SHA", () => {
    expect(() => payloadDaProntidao(rel({ head: "190868d" }))).toThrow(/HEAD/);
  });

  it("relatório com bloqueio LOCAL em aberto", () => {
    // Publicar aqui faria a tela exibir um estado que a execução reprovou.
    expect(() => payloadDaProntidao(rel({ bloqueios: ["lint: 2 erros"] }))).toThrow(/bloqueio/);
  });

  it("relatório sem o bloco de estados", () => {
    expect(() => payloadDaProntidao(rel({ estados: undefined }))).toThrow(/estados/);
  });

  it("bloco de estados vazio também não publica", () => {
    expect(() => payloadDaProntidao(rel({ estados: {} }))).toThrow(/implementacao_local/);
  });

  it("relatório sem release_producao", () => {
    expect(() => payloadDaProntidao(rel({ estados: { implementacao_local: "X", pre_canary: "Y" } }))).toThrow(/release_producao/);
  });

  it("relatório sem pre_canary", () => {
    expect(() => payloadDaProntidao(rel({ estados: { implementacao_local: "X", release_producao: "Z" } }))).toThrow(/pre_canary/);
  });

  it("entrada ausente", () => {
    expect(() => payloadDaProntidao(null)).toThrow(ErroPublicacao);
  });
});
