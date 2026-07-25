export interface ResultadoHumanoLab {
  acertos: number;
  total: number;
}

export interface EvidenciaHumanaRelease {
  schema: "human-blind-evaluation/v1";
  lab_execucao_id: string;
  job_id: string;
  por: string;
  em: string;
  palpites: Record<string, string>;
  gabarito: Record<string, string>;
}

export function montarEvidenciaHumanaRelease(opts: {
  jobId: string;
  execucaoId: string;
  humana: { por: string; em: string; palpites: Record<string, string> };
  amostras: { amostraId: string; hash: string }[];
  gabaritoPorHash: Record<string, string>;
}): EvidenciaHumanaRelease {
  if (!opts.jobId || !opts.execucaoId || opts.humana.por.trim().length < 3 || !Number.isFinite(Date.parse(opts.humana.em))) {
    throw new Error("avaliação humana sem identidade, execução ou data válida");
  }
  if (!opts.amostras.length || Object.keys(opts.humana.palpites).length !== opts.amostras.length) {
    throw new Error("avaliação humana não cobre todas as amostras");
  }
  const gabarito: Record<string, string> = {};
  for (const amostra of opts.amostras) {
    if (!opts.humana.palpites[amostra.amostraId]) {
      throw new Error(`palpite ausente para ${amostra.amostraId}`);
    }
    const skill = opts.gabaritoPorHash[amostra.hash];
    if (!skill) throw new Error(`gabarito ausente para ${amostra.amostraId}`);
    gabarito[amostra.amostraId] = skill;
  }
  return {
    schema: "human-blind-evaluation/v1",
    lab_execucao_id: opts.execucaoId,
    job_id: opts.jobId,
    por: opts.humana.por,
    em: opts.humana.em,
    palpites: { ...opts.humana.palpites },
    gabarito,
  };
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
