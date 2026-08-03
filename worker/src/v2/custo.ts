// Engine V2 — quanto custa um livro, por PAPEL e por CAPÍTULO.
//
// Por que existe: a V2 não tinha nenhuma estimativa de custo por capítulo. O
// único número disponível vinha da V1 (323k tokens/capítulo, agregado dos
// transcripts do runner Python), que não descreve a V2 nem separa papéis.
// Sem isto, "o sistema escreve um livro" fica indecidível mesmo com qualidade
// boa: pode ser capaz e inviável ao mesmo tempo.
//
// SEM DDL NOVA: os tokens já são gravados pelo MOLDE (`executarPapel` →
// `concluirRun` → colunas `tokens_in`/`tokens_out` de `engine_runs`). Este
// módulo só AGREGA o que o ledger já tem, e o resultado é persistido numa linha
// `jobs` de tipo próprio, como a telemetria e o `qualidade_editorial` já fazem.
//
// Honestidade da medição, que é o ponto: run sem token não vira zero (viraria
// média para baixo), run que falhou não conta como custo de capítulo produzido,
// e trabalho fora de capítulo (fundação, avaliação do livro) fica num balde
// próprio em vez de ser diluído na média por capítulo.

export interface Tokens {
  entrada: number;
  saida: number;
  total: number;
}

export interface TokensComRuns extends Tokens {
  runs: number;
}

/** Projeção do papel de um run no ledger — só o que a conta precisa. */
export interface RunCusto {
  papel: string;
  alvo: string;
  status: string;
  model_name: string;
  tokens_in?: number;
  tokens_out?: number;
}

export interface CustoV2 {
  gerado_em: string;
  runs_considerados: number;
  /** Runs que não trouxeram medição de token (não entram em nenhuma média). */
  runs_sem_medicao: number;
  /** Runs com status diferente de "ok" — trabalho gasto que não virou capítulo. */
  runs_falhos: number;
  totais: Tokens;
  por_papel: Record<string, TokensComRuns>;
  por_capitulo: Record<string, TokensComRuns>;
  por_modelo: Record<string, TokensComRuns>;
  /** Trabalho medido que não pertence a um capítulo (fundação, livro, canário). */
  sem_capitulo: TokensComRuns;
  /** Quantos capítulos DISTINTOS têm medição — o denominador da média. */
  capitulos_medidos: number;
  media_por_capitulo: Tokens;
}

export interface ProjecaoCusto {
  /** Rótulo explícito: isto é conta, não medição. */
  natureza: "PROJECAO";
  base_capitulos_medidos: number;
  total_capitulos: number;
  media_por_capitulo: Tokens;
  projetado: Tokens;
}

/**
 * Capítulo a que um alvo pertence. `capitulo:N` é a escrita/revisão; `spec:N` é
 * a ficha daquele capítulo — trabalho gasto para produzi-lo, e deixá-la fora
 * subestimaria o custo real. Qualquer outro alvo não é de capítulo.
 */
export function capituloDoAlvoCusto(alvo: string): number | null {
  const m = /^(?:capitulo|spec):(\d+)$/.exec(alvo);
  return m ? Number(m[1]) : null;
}

function zero(): TokensComRuns {
  return { entrada: 0, saida: 0, total: 0, runs: 0 };
}

function somar(acc: TokensComRuns, entrada: number, saida: number): void {
  acc.entrada += entrada;
  acc.saida += saida;
  acc.total += entrada + saida;
  acc.runs += 1;
}

/** Agrega runs do ledger em custo por papel, por capítulo e por modelo. */
export function agregarCusto(runs: RunCusto[], agora: Date = new Date()): CustoV2 {
  const por_papel: Record<string, TokensComRuns> = {};
  const por_capitulo: Record<string, TokensComRuns> = {};
  const por_modelo: Record<string, TokensComRuns> = {};
  const sem_capitulo = zero();
  const totais: Tokens = { entrada: 0, saida: 0, total: 0 };
  let runs_sem_medicao = 0;
  let runs_falhos = 0;

  for (const r of runs) {
    if (r.status !== "ok") runs_falhos += 1;
    const entrada = Number(r.tokens_in ?? 0);
    const saida = Number(r.tokens_out ?? 0);
    const medido = typeof r.tokens_in === "number" || typeof r.tokens_out === "number";
    if (!medido) {
      runs_sem_medicao += 1;
      continue;
    }
    // Falha consumiu cota, e isso aparece nos totais e no papel — mas não pode
    // ser contabilizada como custo de um capítulo que ela não produziu.
    if (r.status !== "ok") {
      totais.entrada += entrada;
      totais.saida += saida;
      totais.total += entrada + saida;
      por_papel[r.papel] ??= zero();
      somar(por_papel[r.papel], entrada, saida);
      por_modelo[r.model_name] ??= zero();
      somar(por_modelo[r.model_name], entrada, saida);
      continue;
    }

    totais.entrada += entrada;
    totais.saida += saida;
    totais.total += entrada + saida;

    por_papel[r.papel] ??= zero();
    somar(por_papel[r.papel], entrada, saida);

    por_modelo[r.model_name] ??= zero();
    somar(por_modelo[r.model_name], entrada, saida);

    const capitulo = capituloDoAlvoCusto(r.alvo);
    if (capitulo === null) {
      somar(sem_capitulo, entrada, saida);
    } else {
      const chave = String(capitulo);
      por_capitulo[chave] ??= zero();
      somar(por_capitulo[chave], entrada, saida);
    }
  }

  const capitulos = Object.values(por_capitulo);
  const capitulos_medidos = capitulos.length;
  const soma = capitulos.reduce(
    (a, c) => ({ entrada: a.entrada + c.entrada, saida: a.saida + c.saida, total: a.total + c.total }),
    { entrada: 0, saida: 0, total: 0 }
  );
  const media_por_capitulo: Tokens = capitulos_medidos
    ? {
        entrada: Math.round(soma.entrada / capitulos_medidos),
        saida: Math.round(soma.saida / capitulos_medidos),
        total: Math.round(soma.total / capitulos_medidos),
      }
    : { entrada: 0, saida: 0, total: 0 };

  return {
    gerado_em: agora.toISOString(),
    runs_considerados: runs.length,
    runs_sem_medicao,
    runs_falhos,
    totais,
    por_papel,
    por_capitulo,
    por_modelo,
    sem_capitulo,
    capitulos_medidos,
    media_por_capitulo,
  };
}

/**
 * Custo estimado do livro completo = média MEDIDA por capítulo × total de
 * capítulos. Devolve `null` quando não há base — projetar sobre zero capítulo
 * medido, ou sobre um total desconhecido, seria inventar número.
 */
export function projetarCustoLivro(custo: CustoV2, totalCapitulos: number): ProjecaoCusto | null {
  if (!custo.capitulos_medidos || !totalCapitulos || totalCapitulos <= 0) return null;
  const m = custo.media_por_capitulo;
  return {
    natureza: "PROJECAO",
    base_capitulos_medidos: custo.capitulos_medidos,
    total_capitulos: totalCapitulos,
    media_por_capitulo: m,
    projetado: {
      entrada: m.entrada * totalCapitulos,
      saida: m.saida * totalCapitulos,
      total: m.total * totalCapitulos,
    },
  };
}
