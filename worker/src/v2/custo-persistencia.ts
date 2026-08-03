// Persistência do custo V2 — lê o ledger, agrega e grava schema-free.
//
// SEM DDL NOVA, de propósito: os tokens já estão em `engine_runs` (gravados pelo
// MOLDE `executarPapel`), e o resultado agregado vai para uma linha `jobs` de
// tipo próprio — o mesmo padrão de `telemetria` e `qualidade_editorial`, que o
// picker nunca reivindica porque nasce `paused`.
//
// Separado de `custo.ts` para que a agregação continue pura e testável sem
// banco: aqui mora o I/O, lá mora a conta.

import { agregarCusto, projetarCustoLivro, type CustoV2, type ProjecaoCusto, type RunCusto } from "./custo.js";

/** Teto de runs lidos por projeto. Truncar em silêncio leria como "custo todo". */
const TETO_RUNS = 5000;

export interface CustoV2Persistido extends CustoV2 {
  /** true quando o teto foi atingido: a agregação NÃO cobre o projeto inteiro. */
  truncado: boolean;
  teto_runs: number;
  /**
   * Projeção do livro completo, calculada AQUI e não na tela: régua de custo em
   * dois lugares vira dois números diferentes para a mesma pergunta. `null`
   * quando não há base medida ou total de capítulos.
   */
  projecao: ProjecaoCusto | null;
}

/**
 * Agrega o custo do projeto a partir de `engine_runs` e grava/atualiza a linha
 * `jobs` tipo='custo_v2'. Best-effort: nunca derruba o job que a chamou.
 */
export async function gravarCustoV2Projeto(projectId: string): Promise<CustoV2Persistido | null> {
  try {
    const { sb, OWNER } = await import("../supabase.js");
    const { data, error } = await sb
      .from("engine_runs")
      .select("papel,alvo,status,model_name,tokens_in,tokens_out")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(TETO_RUNS);
    if (error) throw new Error(error.message);

    const linhas = (data ?? []) as Record<string, unknown>[];
    const runs: RunCusto[] = linhas.map((r) => ({
      papel: String(r.papel ?? ""),
      alvo: String(r.alvo ?? ""),
      status: String(r.status ?? ""),
      model_name: String(r.model_name ?? ""),
      tokens_in: typeof r.tokens_in === "number" ? r.tokens_in : undefined,
      tokens_out: typeof r.tokens_out === "number" ? r.tokens_out : undefined,
    }));

    // Total de capítulos do projeto: denominador da projeção. Ausente = sem
    // projeção (nunca um total inventado).
    const { data: proj } = await sb
      .from("projects")
      .select("total_capitulos")
      .eq("owner", OWNER)
      .eq("id", projectId)
      .maybeSingle();
    const totalCapitulos = Number((proj as { total_capitulos?: number | null } | null)?.total_capitulos ?? 0);

    const agregado = agregarCusto(runs);
    const custo: CustoV2Persistido = {
      ...agregado,
      truncado: linhas.length >= TETO_RUNS,
      teto_runs: TETO_RUNS,
      projecao: projetarCustoLivro(agregado, totalCapitulos),
    };
    if (custo.truncado) {
      console.warn(`[custo-v2] projeto ${projectId}: teto de ${TETO_RUNS} runs atingido — agregação PARCIAL`);
    }

    const { data: ex } = await sb
      .from("jobs")
      .select("id")
      .eq("owner", OWNER)
      .eq("project_id", projectId)
      .eq("tipo", "custo_v2")
      .limit(1);
    if (ex?.length) {
      await sb.from("jobs").update({ payload: custo }).eq("owner", OWNER).eq("id", (ex[0] as { id: string }).id);
    } else {
      await sb.from("jobs").insert({ owner: OWNER, project_id: projectId, tipo: "custo_v2", status: "paused", payload: custo });
    }
    return custo;
  } catch (e) {
    console.warn(`[custo-v2] projeto ${projectId}: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    return null;
  }
}
