import { describe, expect, it } from "vitest";
import { interpretarAutorizacao, rotularAutorizacao, type AutorizacaoV2Row } from "./autorizacaoV2";
import { commitDaProntidao, lerProntidaoPublicada, SCHEMA_PRONTIDAO_PUBLICADA } from "./prontidaoPublicada";

const linha = (over: Partial<AutorizacaoV2Row> = {}): AutorizacaoV2Row => ({
  project_id: "p1",
  modo: "producao",
  autorizado_por: "rodrigo",
  motivo: "prova pré-canário",
  ativo: true,
  revoked_at: null,
  created_at: "2026-07-28T10:00:00Z",
  ...over,
});

describe("autorização do projeto", () => {
  it("linha ativa = autorizado, com quem e por quê", () => {
    const e = interpretarAutorizacao([linha()]);
    expect(e).toMatchObject({ estado: "autorizado", modo: "producao", por: "rodrigo" });
    const r = rotularAutorizacao(e);
    expect(r.autorizado).toBe(true);
    expect(r.titulo).toContain("producao");
    expect(r.detalhe).toContain("rodrigo");
  });

  it("nenhuma linha = não autorizado, e o rótulo diz o que fazer", () => {
    const r = rotularAutorizacao(interpretarAutorizacao([]));
    expect(r.autorizado).toBe(false);
    expect(r.detalhe).toContain("engine_autorizacoes_v2");
    expect(r.detalhe.length).toBeGreaterThan(30);
  });

  it("REVOGADA não é o mesmo que nunca autorizado", () => {
    // Some da tela e o autor não distingue "nunca autorizei" de "eu revoguei".
    const e = interpretarAutorizacao([linha({ ativo: false, revoked_at: "2026-07-28T12:00:00Z" })]);
    expect(e.estado).toBe("revogada");
    const r = rotularAutorizacao(e);
    expect(r.autorizado).toBe(false);
    expect(r.titulo).toContain("revogada");
    expect(r.detalhe).toContain("2026-07-28T12:00:00Z");
  });

  it("a linha ATIVA prevalece sobre revogações antigas", () => {
    const e = interpretarAutorizacao([linha({ ativo: false, revoked_at: "2026-07-01T00:00:00Z" }), linha()]);
    expect(e.estado).toBe("autorizado");
  });

  it("revogada mais recente é a mostrada", () => {
    const e = interpretarAutorizacao([
      linha({ ativo: false, revoked_at: "2026-07-01T00:00:00Z", autorizado_por: "antigo" }),
      linha({ ativo: false, revoked_at: "2026-07-20T00:00:00Z", autorizado_por: "recente" }),
    ]);
    expect(e).toMatchObject({ estado: "revogada", por: "recente" });
  });
});

describe("erro de banco nunca vira sucesso visual", () => {
  it("tabela ausente (migration não aplicada) é dito com todas as letras", () => {
    const e = interpretarAutorizacao(null, { code: "42P01", message: 'relation "engine_autorizacoes_v2" does not exist' });
    expect(e.estado).toBe("indisponivel");
    expect(rotularAutorizacao(e).detalhe).toContain("engine_v2_autorizacoes.sql");
    expect(rotularAutorizacao(e).autorizado).toBe(false);
  });

  it("erro genérico não autoriza nem finge normalidade", () => {
    const r = rotularAutorizacao(interpretarAutorizacao(null, { code: "PGRST301", message: "JWT expired" }));
    expect(r.autorizado).toBe(false);
    expect(r.detalhe).toContain("JWT expired");
  });

  it("consulta sem dados e sem erro também não autoriza", () => {
    expect(rotularAutorizacao(interpretarAutorizacao(null)).autorizado).toBe(false);
  });
});

describe("prontidão publicada", () => {
  const payload = {
    schema: SCHEMA_PRONTIDAO_PUBLICADA,
    head: "190868d0000000000000000000000000000000aa",
    gerado_em: "2026-07-28T16:00:00Z",
    estados: {
      implementacao_local: "IMPLEMENTACAO_LOCAL_APROVADA",
      pre_canary: "PRE_CANARY_BLOQUEADO: PAPEIS_REAIS",
      release_producao: "RELEASE_PRODUCAO_BLOQUEADO",
    },
    bloqueios_producao: ["CALIBRACAO_HUMANA", "MIGRACOES_REMOTAS"],
  };

  it("lê local, produção e bloqueios", () => {
    const p = lerProntidaoPublicada(payload);
    expect(p.local).toBe("IMPLEMENTACAO_LOCAL_APROVADA");
    expect(p.preCanary).toBe("PRE_CANARY_BLOQUEADO: PAPEIS_REAIS");
    expect(p.producao).toBe("RELEASE_PRODUCAO_BLOQUEADO");
    expect(p.bloqueios).toEqual(["CALIBRACAO_HUMANA", "MIGRACOES_REMOTAS"]);
    expect(p.indisponivel).toBeNull();
  });

  it("SEM publicação: diz desconhecido e explica — não omite", () => {
    // Omitir a linha faria a tela parecer saudável por ausência de informação.
    const p = lerProntidaoPublicada(null);
    expect(p.local).toBe("DESCONHECIDO");
    expect(p.producao).toBe("DESCONHECIDO");
    expect(p.indisponivel).toContain("npm run prontidao");
  });

  it("schema desconhecido não é interpretado", () => {
    expect(lerProntidaoPublicada({ schema: "outro/v9" }).indisponivel).toContain("formato desconhecido");
  });

  it("produção não certificada e sem motivos é contradição, não liberação", () => {
    const p = lerProntidaoPublicada({ ...payload, bloqueios_producao: [] });
    expect(p.indisponivel).toContain("sem motivos listados");
  });

  it("o commit publicado vem curto e validado", () => {
    expect(commitDaProntidao(payload)).toBe("190868d");
    expect(commitDaProntidao({ ...payload, head: "nao-e-sha" })).toBeNull();
    expect(commitDaProntidao(null)).toBeNull();
  });

  it("[DOD:R-08] prontidão de outro SHA ou build sujo nunca libera a interface", () => {
    const outroSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const divergente = lerProntidaoPublicada(payload, { shaEsperado: outroSha });
    expect(divergente.indisponivel).toContain("prontidão vencida");
    expect(divergente.indisponivel).toContain("190868d");
    expect(divergente.indisponivel).toContain("aaaaaaa");

    const sujo = lerProntidaoPublicada(payload, {
      shaEsperado: payload.head,
      buildSujo: true,
    });
    expect(sujo.indisponivel).toContain("arquivos rastreados modificados");

    expect(lerProntidaoPublicada(payload, {
      shaEsperado: payload.head,
      buildSujo: false,
    }).indisponivel).toBeNull();
  });
});
