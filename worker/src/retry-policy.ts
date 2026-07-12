export interface InfrastructureRetryState {
  count: number;
  firstFailureAt: string;
  lastFailureAt: string;
  dependency: string;
}

export type InfrastructureRetryDecision =
  | { action: "retry"; retryAt: string; delayMs: number; state: InfrastructureRetryState }
  | { action: "blocked"; state: InfrastructureRetryState; reason: string };

export function decideInfrastructureRetry(
  previous: InfrastructureRetryState | null | undefined,
  dependency: string,
  now = new Date(),
  opts: { maxAttempts?: number; maxWindowMs?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): InfrastructureRetryDecision {
  const maxAttempts = opts.maxAttempts ?? 6;
  const maxWindowMs = opts.maxWindowMs ?? 2 * 60 * 60_000;
  const baseDelayMs = opts.baseDelayMs ?? 2 * 60_000;
  const maxDelayMs = opts.maxDelayMs ?? 30 * 60_000;
  const count = (previous?.dependency === dependency ? previous.count : 0) + 1;
  const firstFailureAt = previous?.dependency === dependency ? previous.firstFailureAt : now.toISOString();
  const state = { count, firstFailureAt, lastFailureAt: now.toISOString(), dependency };
  const elapsed = now.getTime() - Date.parse(firstFailureAt);
  if (count >= maxAttempts || elapsed >= maxWindowMs) {
    return { action: "blocked", state, reason: `Circuit breaker aberto para ${dependency} após ${count} falhas em ${Math.max(0, Math.round(elapsed / 60_000))} min.` };
  }
  const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (count - 1));
  return { action: "retry", retryAt: new Date(now.getTime() + delayMs).toISOString(), delayMs, state };
}
