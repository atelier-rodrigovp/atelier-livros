// SPEC-12: prefixa [ISO] em console.log/warn/error do worker. O worker.log não
// tinha relógio próprio — a forense da auditoria precisou datar 321 fetch failed
// por âncoras indiretas (trechos de runner.log embutidos). Instalação única
// (guard por Symbol); injetável para teste.

const FLAG = Symbol.for("atelier.logIso");

export function instalarTimestampsISO(
  c: Console = console,
  agora: () => string = () => new Date().toISOString()
): void {
  const alvo = c as Console & { [FLAG]?: boolean };
  if (alvo[FLAG]) return; // nunca prefixar duas vezes
  alvo[FLAG] = true;
  for (const m of ["log", "warn", "error"] as const) {
    const orig = c[m].bind(c);
    c[m] = (...args: unknown[]) => orig(`[${agora()}]`, ...args);
  }
}
