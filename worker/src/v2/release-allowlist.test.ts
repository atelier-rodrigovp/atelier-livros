// Fatia M — certificado e autorização são garantias SEPARADAS.
//
// Antes: a lista de projetos liberados era um Set de UUIDs hardcoded em
// release.ts — o autor não conseguia rodar um livro seu sem editar o fonte.
// Agora a autorização é dado (engine_autorizacoes_v2) e entra aqui já lida, o
// que mantém a decisão pura e testável.
import { describe, expect, it } from "vitest";
import { exigirReleaseAtual, type AutorizacaoProjetoV2 } from "./release.js";

const PROJETO = "8b11072c-097d-4964-8f89-abecb96eb16c";
// Obra REAL fora de escopo por decisão do autor — nunca autorizada aqui.
const OBRA_REAL_FORA_DE_ESCOPO = "53abdade-554d-47e2-bd14-955de3ffc41e";

const autorizacao = (modo: "producao" | "canario", projectId = PROJETO): AutorizacaoProjetoV2 => ({
  project_id: projectId,
  modo,
  autorizado_por: "rodrigo",
  motivo: "prova",
});

describe("autorização de projeto (V2)", () => {
  it("SEM certificado e SEM autorização: não executa", () => {
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, null)).toThrowError(/não tem autorização ativa/);
  });

  it("autorização de PRODUÇÃO não substitui o certificado", () => {
    // Não há certificado válido no checkout: mesmo autorizado, o projeto para.
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, autorizacao("producao"))).toThrowError(
      /Engine V2 bloqueada para fundação\/escrita/
    );
  });

  it("autorização de CANÁRIO dispensa o certificado — só ela, e só na operação de canário", () => {
    const release = exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "canario");
    expect(release).toMatchObject({
      modo: "canario",
      codigo_commit: "canario-sem-certificado",
      autorizado_por: "rodrigo",
    });
  });

  it("a liberação de canário carrega QUEM autorizou e POR QUÊ (auditoria)", () => {
    const release = exigirReleaseAtual(
      "dan-brown",
      PROJETO,
      {
        project_id: PROJETO,
        modo: "canario",
        autorizado_por: "rodrigo",
        motivo: "Canário V2 — O Cofre de Alcobaça",
      },
      "canario"
    );
    expect(release).toMatchObject({ autorizado_por: "rodrigo", motivo: "Canário V2 — O Cofre de Alcobaça" });
  });

  it("obra fora de escopo sem autorização continua fail-closed", () => {
    expect(() => exigirReleaseAtual("dan-brown", OBRA_REAL_FORA_DE_ESCOPO, null)).toThrowError(
      /não tem autorização ativa/
    );
  });

  it("sem project_id continua fail-closed pelo certificado", () => {
    expect(() => exigirReleaseAtual("dan-brown")).toThrowError(/Engine V2 bloqueada/);
  });

  it("a mensagem diz ao autor o que fazer (autorizar), não só que falhou", () => {
    try {
      exigirReleaseAtual("dan-brown", PROJETO, null);
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect((e as Error).message).toContain("Autorize-o na tela do projeto");
      expect((e as Error).message).toContain("Autorização não substitui certificado");
    }
  });
});

// ---------------------------------------------------------------------------
// D3 — modo canário cobre APENAS a amostra de canário
// ---------------------------------------------------------------------------

describe("o modo canário não é porta dos fundos para produzir obra", () => {
  it("cobre a operação de canário", () => {
    const r = exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "canario");
    expect(r).toMatchObject({ modo: "canario" });
  });

  it("NÃO cobre fundação", () => {
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "fundacao")).toThrowError(
      /CANÁRIO.*apenas a amostra de canário|exige certificado de release válido/s
    );
  });

  it("NÃO cobre escrita de livro", () => {
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "escrita")).toThrowError(
      /exige certificado de release válido/
    );
  });

  it("NÃO cobre avaliação", () => {
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "avaliacao")).toThrowError(
      /exige certificado de release válido/
    );
  });

  it("o default da operação é `escrita` — nunca o mais permissivo", () => {
    expect(() => exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"))).toThrowError(
      /exige certificado de release válido/
    );
  });

  it("a mensagem diz o caminho: certificar e mudar para modo producao", () => {
    try {
      exigirReleaseAtual("dan-brown", PROJETO, autorizacao("canario"), "escrita");
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect((e as Error).message).toContain("modo 'producao'");
    }
  });
});
