export interface ResultadoHumanoLab {
  acertos: number;
  total: number;
}

export function podeAprovarReleaseLab(opts: {
  decisaoAutomatica?: string;
  calibracaoPronta?: boolean;
  resultadoHumano?: ResultadoHumanoLab | null;
  minimoHumano?: number;
}): boolean {
  const minimo = opts.minimoHumano ?? 0.8;
  const humano = opts.resultadoHumano;
  return (
    opts.decisaoAutomatica === "aprovar" &&
    opts.calibracaoPronta === true &&
    humano != null &&
    humano.total > 0 &&
    humano.acertos / humano.total >= minimo
  );
}
