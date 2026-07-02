// Retry com backoff exponencial + jitter para falhas TRANSITÓRIAS de rede nas
// chamadas Supabase/Storage (o postgrest-js só re-tenta GET/HEAD/OPTIONS sozinho —
// todo write fica por nossa conta). Escopo deliberado:
// - só chamadas explicitamente embrulhadas, e apenas WRITES IDEMPOTENTES
//   (update/upsert): insert puro NÃO passa por aqui (resposta perdida + retry =
//   linha duplicada) — quem cobre esse caso é a reclassificação de erro de rede
//   no processarJob (re-enfileira sem queimar tentativa);
// - o CLAIM de job fica FORA por design: o update condicional é a garantia
//   anti-duplo-claim; resposta perdida = "não peguei" (recuperarOrfaos resolve);
// - erro NÃO-rede (constraint, auth 4xx) nunca é re-tentado — falha alto na 1ª.

export const RE_ERRO_REDE =
  /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR|socket hang up/i;

export function ehErroDeRede(e: unknown): boolean {
  const msg =
    e && typeof e === "object" && "message" in e
      ? String((e as { message?: unknown }).message ?? "")
      : String(e ?? "");
  return RE_ERRO_REDE.test(msg);
}

export interface RetryOpts {
  tentativas?: number; // total de execuções (1 = sem retry)
  baseMs?: number;
  tetoMs?: number;
  rotulo?: string; // identifica a chamada no log
  log?: (msg: string) => void;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number; // injetável p/ teste (jitter)
}

// Re-executa `exec` enquanto o resultado trouxer erro DE REDE (estilo supabase-js:
// o erro vem no retorno, não em exceção). Devolve o ÚLTIMO resultado — o chamador
// decide o que fazer com o erro remanescente (falhar alto, engolir, logar).
export async function comRetrySb<T extends { error: unknown }>(
  exec: () => PromiseLike<T>,
  opts: RetryOpts = {}
): Promise<T> {
  const tentativas = Math.max(1, opts.tentativas ?? 5);
  const baseMs = opts.baseMs ?? 1000;
  const tetoMs = opts.tetoMs ?? 30_000;
  const log = opts.log ?? ((m: string) => console.error(m));
  const dormir = opts.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const aleatorio = opts.aleatorio ?? Math.random;
  let r = await exec();
  for (let n = 1; n < tentativas && r.error && ehErroDeRede(r.error); n++) {
    const exp = Math.min(tetoMs, baseMs * 2 ** (n - 1));
    const espera = Math.round(exp * (0.5 + aleatorio())); // jitter: 0.5×–1.5× do degrau
    if (opts.rotulo) {
      log(`[retry] ${opts.rotulo}: rede falhou (tentativa ${n}/${tentativas}) — nova em ${espera}ms`);
    }
    await dormir(espera);
    r = await exec();
  }
  return r;
}
