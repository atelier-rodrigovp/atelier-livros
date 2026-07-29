export interface EntradaPrecondicoesFundacao {
  engineMode: string | null | undefined;
  entrevistaCompleta: boolean;
  briefingAprovadoAtual: boolean;
  projetoAutorizado: boolean;
  releaseCertificado: boolean;
}

export interface PrecondicoesFundacao {
  podeGerar: boolean;
  pendencias: string[];
  modo: "release_certificada" | "pre_canario";
}

/**
 * A fundação é uma pré-condição da prova real e da calibração; exigir o
 * certificado final aqui criava um ciclo impossível (certificado exige canário,
 * canário exige fundação). Escrita continua bloqueada pelo release final.
 */
export function avaliarPrecondicoesFundacao(entrada: EntradaPrecondicoesFundacao): PrecondicoesFundacao {
  if (entrada.engineMode !== "v2") {
    return { podeGerar: true, pendencias: [], modo: "release_certificada" };
  }
  const pendencias = [
    !entrada.entrevistaCompleta ? "concluir a entrevista" : null,
    !entrada.briefingAprovadoAtual ? "aprovar o briefing atual" : null,
    !entrada.projetoAutorizado ? "autorizar este projeto" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    podeGerar: pendencias.length === 0,
    pendencias,
    modo: entrada.releaseCertificado ? "release_certificada" : "pre_canario",
  };
}
