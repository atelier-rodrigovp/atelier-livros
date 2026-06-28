// Detecção e agendamento do throttle temporário do plano Max.
//
// O limite do Max NÃO é erro: é uma janela de uso que reabre no "reset". Quando
// o `claude` headless bate o limite, o worker deve PAUSAR e RETOMAR sozinho no
// reset (continuando do disco), sem gastar tentativas. Puro/testável.

// Erro distinto: sinaliza ao loop do worker "pause e retome em retryAt", em vez
// de tratar como falha terminal.
export class LimiteMaxError extends Error {
  retryAt: string; // ISO — quando tentar de novo (próximo reset, ou backoff)
  constructor(message: string, retryAt: string) {
    super(message);
    this.name = "LimiteMaxError";
    this.retryAt = retryAt;
  }
}

// Assinaturas FORTES do limite de uso (distingue de erros reais: skill, disco, crédito).
const LIMITE_RE =
  /(hit your (session|usage) limit|(session|usage) limit reached|usage limit|limit reached|limite de uso do plano max|plano max atingido)/i;

// Extrai o horário do reset do texto ("resets at 1:40am", "reseta 1:40am",
// "reset at 13:40") e devolve o PRÓXIMO instante futuro como ISO (+90s de folga).
export function parseHoraReset(texto: string, agora: Date = new Date()): string | null {
  let h: number | null = null;
  let min = 0;
  // 1) formato 12h com am/pm
  const ampm = texto.match(/reset[s]?|reseta/i)
    ? texto.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i)
    : null;
  if (ampm) {
    h = parseInt(ampm[1], 10);
    min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const ap = ampm[3].toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
  } else {
    // 2) formato 24h: "reset(s) at 13:40" / "reseta 13:40"
    const h24 = texto.match(/(?:reset[s]?(?:\s+at)?|reseta)[^0-9]{0,8}(\d{1,2}):(\d{2})/i);
    if (h24) {
      h = parseInt(h24[1], 10);
      min = parseInt(h24[2], 10);
    }
  }
  if (h == null || h > 23 || min > 59) return null;
  const d = new Date(agora);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 1); // próxima ocorrência futura
  d.setTime(d.getTime() + 90_000); // +90s para garantir que a janela já reabriu
  return d.toISOString();
}

// Se o texto indica limite do Max, devolve o ISO de retomada (horário do reset
// ou backoff padrão de ~35min se não der pra parsear). Senão, null (não é limite).
export function limiteMaxRetryAt(
  texto: string,
  agora: Date = new Date(),
  backoffMs = 35 * 60_000
): string | null {
  if (!texto || !LIMITE_RE.test(texto)) return null;
  const iso = parseHoraReset(texto, agora);
  // Janela do Max é ≤5h: um reset parseado a >6h é mis-parse (am/pm trocado ou
  // log antigo) → usa backoff em vez de esperar ~24h por engano.
  if (iso && Date.parse(iso) - agora.getTime() <= 6 * 3600_000) return iso;
  return new Date(agora.getTime() + backoffMs).toISOString();
}

// Só classifica: o texto indica limite do Max? (sem calcular retry). Usado para
// recuperar jobs que morreram como 'error' por limite (classificação antiga).
export function pareceLimiteMax(texto: string): boolean {
  return !!texto && LIMITE_RE.test(texto);
}
