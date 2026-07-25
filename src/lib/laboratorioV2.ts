export interface ResultadoHumanoLab {
  acertos: number;
  total: number;
}

export function podeAprovarReleaseLab(opts: {
  decisaoAutomatica?: string;
  resultadoHumano?: ResultadoHumanoLab | null;
  minimoHumano?: number;
}): boolean {
  const minimo = opts.minimoHumano ?? 0.8;
  const humano = opts.resultadoHumano;
  return (
    opts.decisaoAutomatica === "aprovar" &&
    humano != null &&
    humano.total > 0 &&
    humano.acertos / humano.total >= minimo
  );
}
