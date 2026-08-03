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

// ---------------------------------------------------------------------------
// O gate estava CEGO para prova vencida.
//
// Em 2026-08-01 o CI passou verde com as CINCO evidências externas já caducas,
// porque `--pre-canary` só olhava o certificado de release e nunca lia
// `.evidencias/`. Prova vencida é afirmação que não se sustenta mais — e afirmar
// o que não se sustenta é exatamente o que este projeto trata como bloqueio.
// ---------------------------------------------------------------------------

const evidenciaOk = (tipo: string) => ({ tipo, rotulo: `prova ${tipo}`, valida: true as const, motivos: [] });
const evidenciaVencida = (tipo: string, motivo: string) => ({
  tipo,
  rotulo: `prova ${tipo}`,
  valida: false as const,
  motivos: [motivo],
});
const evidenciaAusente = (tipo: string) => ({
  tipo,
  rotulo: `prova ${tipo}`,
  valida: null,
  motivos: [`sem evidência em .evidencias/${tipo}.json`],
});

describe("o gate recusa evidência externa VENCIDA", () => {
  it("evidência presente e caduca reprova o pré-canário, mesmo sem certificado", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: true,
      arquivoCertificadoExiste: false,
      releaseOk: false,
      erros: ["certificado não encontrado"],
      evidencias: [
        evidenciaOk("migracoes_remotas"),
        evidenciaVencida("worker_real", "fingerprints.worker_hash mudou desde a verificação"),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.estado).toBe("EVIDENCIA_EXTERNA_VENCIDA");
  });

  it("a mensagem DIZ qual fingerprint mudou — diagnóstico, não 'reprovado'", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: true,
      arquivoCertificadoExiste: false,
      releaseOk: false,
      erros: [],
      evidencias: [evidenciaVencida("papeis_reais", "fingerprints.interface_hash mudou desde a verificação")],
    });
    expect(r.mensagem).toContain("papeis_reais");
    expect(r.mensagem).toContain("interface_hash");
  });

  it("evidência AUSENTE não é o mesmo que vencida: não reprova, segue pré-canário", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: true,
      arquivoCertificadoExiste: false,
      releaseOk: false,
      erros: ["certificado não encontrado"],
      evidencias: [evidenciaAusente("papeis_reais"), evidenciaAusente("provedor_real")],
    });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("PRE_CANARY_RELEASE_BLOQUEADA");
  });

  it("todas válidas + sem certificado segue o caminho pré-canário de sempre", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: true,
      arquivoCertificadoExiste: false,
      releaseOk: false,
      erros: ["certificado não encontrado"],
      evidencias: [evidenciaOk("migracoes_remotas"), evidenciaOk("papeis_reais")],
    });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("PRE_CANARY_RELEASE_BLOQUEADA");
  });

  it("evidência vencida reprova TAMBÉM no modo estrito, com certificado válido", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: false,
      arquivoCertificadoExiste: true,
      releaseOk: true,
      certificado,
      erros: [],
      evidencias: [evidenciaVencida("integracao_real", "fingerprints.migrations_source_hash mudou desde a verificação")],
    });
    expect(r.ok).toBe(false);
    expect(r.estado).toBe("EVIDENCIA_EXTERNA_VENCIDA");
  });

  // Compatibilidade: quem não passa `evidencias` mantém o comportamento antigo.
  it("sem a lista de evidências, decide só pelo certificado (como antes)", () => {
    const r = decidirGateReleaseCI({
      modoPreCanario: true,
      arquivoCertificadoExiste: false,
      releaseOk: false,
      erros: ["certificado não encontrado"],
    });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("PRE_CANARY_RELEASE_BLOQUEADA");
  });
});
