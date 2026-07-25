export interface ResolucaoTotalCapitulos {
  total: number;
  origem: "estado_migrado" | "projeto" | "estado" | "payload";
  divergenciaProjeto?: { projeto: number; canonico: number };
}

/**
 * Um projeto migrado obedece ao total canônico reconciliado, não ao número
 * histórico da tabela projects. Isso impede que um legado concluído 59/60
 * dispare silenciosamente a escrita de um capítulo inexistente.
 */
export function resolverTotalCapitulos(opts: {
  projeto?: number | null;
  canonico?: number | null;
  payload?: number | null;
  migrado: boolean;
}): ResolucaoTotalCapitulos | null {
  const projeto = Number(opts.projeto ?? 0);
  const canonico = Number(opts.canonico ?? 0);
  const payload = Number(opts.payload ?? 0);
  if (opts.migrado && canonico > 0) {
    return {
      total: canonico,
      origem: "estado_migrado",
      ...(projeto > 0 && projeto !== canonico
        ? { divergenciaProjeto: { projeto, canonico } }
        : {}),
    };
  }
  if (projeto > 0) return { total: projeto, origem: "projeto" };
  if (canonico > 0) return { total: canonico, origem: "estado" };
  if (payload > 0) return { total: payload, origem: "payload" };
  return null;
}
