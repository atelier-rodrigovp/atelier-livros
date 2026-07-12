export type RunnerOutcome =
  | { kind: "ok" }
  | { kind: "timeout"; message: string }
  | { kind: "no_exit_code"; message: string }
  | { kind: "failed"; message: string };

export function classifyRunnerOutcome(result: { code: number; out?: string; err?: string }): RunnerOutcome {
  if (result.code === 0) return { kind: "ok" };
  const tail = String(result.err || result.out || "").slice(-400);
  if (result.code === 124) return { kind: "timeout", message: `Runner excedeu o timeout. ${tail}`.trim() };
  if (result.code === -1) return { kind: "no_exit_code", message: `Runner terminou sem código de saída. ${tail}`.trim() };
  return { kind: "failed", message: `Runner falhou com rc=${result.code}. ${tail}`.trim() };
}
