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
}

/** Mesma decisão exibida pela tela e exigida pelo worker antes da fundação. */
export function avaliarPrecondicoesFundacao(entrada: EntradaPrecondicoesFundacao): PrecondicoesFundacao {
  if (entrada.engineMode !== "v2") return { podeGerar: true, pendencias: [] };
  const pendencias = [
    !entrada.entrevistaCompleta ? "concluir a entrevista" : null,
    !entrada.briefingAprovadoAtual ? "aprovar o briefing atual" : null,
    !entrada.projetoAutorizado ? "autorizar este projeto" : null,
    !entrada.releaseCertificado ? "publicar um certificado de release válido para o código em execução" : null,
  ].filter((item): item is string => Boolean(item));
  return { podeGerar: pendencias.length === 0, pendencias };
}
