export type ContextoHeartbeat = Record<string, unknown>;

/**
 * Atualizações de progresso não apagam o estado operacional. Uma transição que
 * declara `estado`, por outro lado, inicia um contexto novo e remove job/fase
 * antigos. O pulso periódico usa `{}` e apenas renova `last_seen`.
 */
export function mesclarContextoHeartbeat(
  atual: ContextoHeartbeat,
  atualizacao: ContextoHeartbeat
): ContextoHeartbeat {
  if (Object.prototype.hasOwnProperty.call(atualizacao, "estado")) {
    return { ...atualizacao };
  }
  return { ...atual, ...atualizacao };
}
