import { describe, expect, it } from "vitest";
import { decidirGateReleaseCI } from "./gate-release-ci.js";
import type { CertificadoReleaseV2 } from "./release.js";

const certificado = {
  codigo_commit: "a".repeat(40),
} as CertificadoReleaseV2;

describe("gate de release no CI", () => {
  it("permite deploy técnico sem certificado apenas no modo pré-canário", () => {
    expect(
      decidirGateReleaseCI({
        modoPreCanario: true,
        arquivoCertificadoExiste: false,
        releaseOk: false,
        erros: ["certificado não encontrado"],
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        estado: "PRE_CANARY_RELEASE_BLOQUEADA",
      })
    );
  });

  it("mantém certificado ausente como falha no modo estrito", () => {
    expect(
      decidirGateReleaseCI({
        modoPreCanario: false,
        arquivoCertificadoExiste: false,
        releaseOk: false,
        erros: ["certificado não encontrado"],
      })
    ).toEqual(expect.objectContaining({ ok: false, estado: "RELEASE_INVALIDA" }));
  });

  it("não deixa certificado presente e inválido passar como pré-canário", () => {
    expect(
      decidirGateReleaseCI({
        modoPreCanario: true,
        arquivoCertificadoExiste: true,
        releaseOk: false,
        erros: ["runtime_hash divergente"],
      })
    ).toEqual(expect.objectContaining({ ok: false, estado: "RELEASE_INVALIDA" }));
  });

  it("aceita certificado presente somente quando a validação estrita aprovou", () => {
    expect(
      decidirGateReleaseCI({
        modoPreCanario: true,
        arquivoCertificadoExiste: true,
        releaseOk: true,
        certificado,
        erros: [],
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        estado: "RELEASE_CERTIFICADA",
      })
    );
  });

  it("recusa estado impossível de release aprovada sem arquivo", () => {
    expect(
      decidirGateReleaseCI({
        modoPreCanario: true,
        arquivoCertificadoExiste: false,
        releaseOk: true,
        certificado,
        erros: [],
      })
    ).toEqual(expect.objectContaining({ ok: false, estado: "RELEASE_INVALIDA" }));
  });
});
