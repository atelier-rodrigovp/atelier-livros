import type { CertificadoReleaseV2 } from "./release.js";

/** O que o gate precisa saber de cada evidência externa — nada além disso. */
export interface EvidenciaNoGate {
  tipo: string;
  /** true = válida; false = presente e VENCIDA; null = ausente. */
  valida: boolean | null;
  motivos: string[];
}

export interface EntradaGateReleaseCI {
  modoPreCanario: boolean;
  arquivoCertificadoExiste: boolean;
  releaseOk: boolean;
  certificado?: CertificadoReleaseV2;
  erros: string[];
  /**
   * Evidências externas conferidas contra o código atual. Opcional para não
   * quebrar quem já chamava o gate; quando vem, evidência VENCIDA reprova.
   */
  evidencias?: EvidenciaNoGate[];
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
    }
  | {
      ok: false;
      estado: "EVIDENCIA_EXTERNA_VENCIDA";
      mensagem: string;
    };

/**
 * O CI precisa permitir que o código fail-closed chegue ao ambiente em que a
 * prova pré-canário será executada, sem transformar "certificado ausente" em
 * release aprovada.
 *
 * Regras:
 * - evidência externa VENCIDA reprova antes de tudo (ver abaixo);
 * - certificado presente: validação estrita, inclusive no modo pré-canário;
 * - certificado ausente + modo estrito: reprova;
 * - certificado ausente + modo pré-canário: aprova somente o DEPLOY TÉCNICO e
 *   declara que a release literária continua bloqueada.
 */
export function decidirGateReleaseCI(entrada: EntradaGateReleaseCI): SaidaGateReleaseCI {
  // Prova VENCIDA reprova em qualquer modo, e antes do certificado: o CI passou
  // verde em 2026-08-01 com as cinco evidências caducas justamente porque só
  // olhava o certificado. Evidência AUSENTE é outra coisa — é ausência de prova,
  // esperada antes do pré-canário, e não reprova nada.
  const vencidas = (entrada.evidencias ?? []).filter((e) => e.valida === false);
  if (vencidas.length > 0) {
    const detalhe = vencidas.map((e) => `${e.tipo}: ${e.motivos.join(" · ") || "inválida"}`).join(" | ");
    return {
      ok: false,
      estado: "EVIDENCIA_EXTERNA_VENCIDA",
      mensagem: `${vencidas.length} evidência(s) externa(s) não valem mais para este código — ${detalhe}`,
    };
  }

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
