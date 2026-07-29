import type { CertificadoReleaseV2 } from "./release.js";

export interface EntradaGateReleaseCI {
  modoPreCanario: boolean;
  arquivoCertificadoExiste: boolean;
  releaseOk: boolean;
  certificado?: CertificadoReleaseV2;
  erros: string[];
}

export type SaidaGateReleaseCI =
  | {
      ok: true;
      estado: "RELEASE_CERTIFICADA";
      mensagem: string;
    }
  | {
      ok: true;
      estado: "PRE_CANARY_RELEASE_BLOQUEADA";
      mensagem: string;
    }
  | {
      ok: false;
      estado: "RELEASE_INVALIDA";
      mensagem: string;
    };

/**
 * O CI precisa permitir que o código fail-closed chegue ao ambiente em que a
 * prova pré-canário será executada, sem transformar "certificado ausente" em
 * release aprovada.
 *
 * Regras:
 * - certificado presente: validação estrita, inclusive no modo pré-canário;
 * - certificado ausente + modo estrito: reprova;
 * - certificado ausente + modo pré-canário: aprova somente o DEPLOY TÉCNICO e
 *   declara que a release literária continua bloqueada.
 */
export function decidirGateReleaseCI(entrada: EntradaGateReleaseCI): SaidaGateReleaseCI {
  if (entrada.arquivoCertificadoExiste) {
    if (entrada.releaseOk && entrada.certificado) {
      return {
        ok: true,
        estado: "RELEASE_CERTIFICADA",
        mensagem: `release V2 certificada em ${entrada.certificado.codigo_commit}`,
      };
    }
    return {
      ok: false,
      estado: "RELEASE_INVALIDA",
      mensagem: `certificado presente, mas inválido: ${entrada.erros.join(" · ") || "sem detalhe"}`,
    };
  }

  if (!entrada.modoPreCanario) {
    return {
      ok: false,
      estado: "RELEASE_INVALIDA",
      mensagem: `certificado ausente: ${entrada.erros.join(" · ") || "release não certificada"}`,
    };
  }

  if (entrada.releaseOk || entrada.certificado) {
    return {
      ok: false,
      estado: "RELEASE_INVALIDA",
      mensagem: "estado incoerente: release aprovada sem arquivo de certificado",
    };
  }

  return {
    ok: true,
    estado: "PRE_CANARY_RELEASE_BLOQUEADA",
    mensagem:
      "deploy técnico pré-canário permitido; release literária permanece fail-closed até certificado válido",
  };
}
