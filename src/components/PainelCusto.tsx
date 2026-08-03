// Painéis de custo da Observabilidade.
//
// Dois buracos que este arquivo fecha:
//   1. não havia custo por CAPÍTULO na V2 — só um agregado de transcripts da V1,
//      que não separa papéis nem diz quanto custa produzir mais um capítulo;
//   2. `por_modelo` era calculado e persistido por `telemetria.ts` e não
//      aparecia em tela nenhuma.
//
// Regra desta tela: MEDIDO e PROJETADO nunca se parecem. A projeção sai com
// rótulo, com a base da conta à vista (quantos capítulos foram medidos, de
// quantos), e a conta em si vem pronta do worker — régua de custo em dois
// lugares vira dois números diferentes para a mesma pergunta.

import { fmtTok } from "@/lib/formato";

export interface Tokens {
  entrada: number;
  saida: number;
  total: number;
}
export interface TokensComRuns extends Tokens {
  runs: number;
}

export interface ProjecaoCusto {
  natureza: "PROJECAO";
  base_capitulos_medidos: number;
  total_capitulos: number;
  media_por_capitulo: Tokens;
  projetado: Tokens;
}

/** Espelho do payload gravado pelo worker na linha `jobs` tipo='custo_v2'. */
export interface CustoV2Payload {
  gerado_em: string;
  runs_considerados: number;
  runs_sem_medicao: number;
  runs_falhos: number;
  totais: Tokens;
  por_papel: Record<string, TokensComRuns>;
  por_capitulo: Record<string, TokensComRuns>;
  por_modelo: Record<string, TokensComRuns>;
  sem_capitulo: TokensComRuns;
  capitulos_medidos: number;
  media_por_capitulo: Tokens;
  truncado: boolean;
  teto_runs: number;
  projecao: ProjecaoCusto | null;
}

export interface UsageCusto {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  custo_usd: number;
}

/**
 * Quebra por modelo da telemetria. Existia no dado e em lugar nenhum na tela —
 * era impossível responder "quanto do custo é opus?" sem abrir o banco.
 */
export function QuebraPorModelo({ porModelo }: { porModelo: Record<string, UsageCusto> }) {
  const linhas = Object.entries(porModelo).sort((a, b) => b[1].custo_usd - a[1].custo_usd);
  if (linhas.length === 0) return null;
  const maior = linhas[0][1].custo_usd || 1;
  return (
    <div className="mt-3 border-t pt-3">
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Custo por modelo</h4>
      <div className="space-y-1.5">
        {linhas.map(([modelo, u]) => (
          <div key={modelo} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 truncate" title={modelo}>{modelo}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-sky-500/70" style={{ width: `${Math.min(100, (u.custo_usd / maior) * 100)}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums">{u.custo_usd.toFixed(2)}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtTok(u.output)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        custo-proxy em USD (ranque relativo, não fatura) · output em tokens
      </p>
    </div>
  );
}

/**
 * Custo por capítulo da Engine V2, medido no ledger `engine_runs`, mais a
 * projeção do livro completo — sempre rotulada.
 */
export function CustoPorCapitulo({ custo }: { custo: CustoV2Payload }) {
  const papeis = Object.entries(custo.por_papel).sort((a, b) => b[1].total - a[1].total);
  const maior = papeis[0]?.[1].total || 1;
  const p = custo.projecao;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">Custo por capítulo — Engine V2</h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {custo.runs_considerados} run(s) do ledger
        </span>
      </div>

      {custo.truncado && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
          agregação PARCIAL: o teto de {custo.teto_runs} runs foi atingido — os números abaixo não cobrem o projeto inteiro
        </p>
      )}

      {custo.capitulos_medidos === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Custo ainda não medido — nenhum capítulo com token registrado no ledger.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">média MEDIDA/cap</div>
              <div className="font-medium tabular-nums">{fmtTok(custo.media_por_capitulo.total)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">capítulos medidos</div>
              <div className="font-medium tabular-nums">{custo.capitulos_medidos}</div>
            </div>
            <div>
              <div className="text-muted-foreground">entrada / saída</div>
              <div className="font-medium tabular-nums">
                {fmtTok(custo.totais.entrada)} / {fmtTok(custo.totais.saida)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">fora de capítulo</div>
              <div className="font-medium tabular-nums">{fmtTok(custo.sem_capitulo.total)}</div>
            </div>
          </div>

          {/* PROJEÇÃO — separada, rotulada, com a base da conta à vista. */}
          {p && (
            <div className="mt-3 rounded-lg border border-dashed bg-muted/30 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Projeção — livro completo
                </span>
                <span className="text-base font-semibold tabular-nums">{fmtTok(p.projetado.total)}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                PROJEÇÃO, não medição: média de {fmtTok(p.media_por_capitulo.total)} por capítulo
                {" "}× {p.total_capitulos} capítulos, extrapolada de {p.base_capitulos_medidos} capítulo(s) medido(s).
              </p>
            </div>
          )}

          <div className="mt-3 space-y-1.5 border-t pt-3">
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Custo por papel</h4>
            {papeis.map(([papel, t]) => (
              <div key={papel} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate" title={papel}>{papel}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-emerald-500/70" style={{ width: `${Math.min(100, (t.total / maior) * 100)}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right tabular-nums">{fmtTok(t.total)}</span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{t.runs}×</span>
              </div>
            ))}
          </div>

          {(custo.runs_sem_medicao > 0 || custo.runs_falhos > 0) && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {custo.runs_sem_medicao > 0 && `${custo.runs_sem_medicao} run(s) sem medição de token (fora da média). `}
              {custo.runs_falhos > 0 && `${custo.runs_falhos} run(s) falhos — consumiram cota sem produzir capítulo.`}
            </p>
          )}
        </>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        medido em engine_runs · atualizado ao fim de cada execução V2 ·{" "}
        {new Date(custo.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
