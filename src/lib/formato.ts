/**
 * Formatação de contagem de tokens, compartilhada entre a página de
 * Observabilidade e os painéis de custo. Vive em `lib` e não num componente
 * porque duas cópias da mesma régua produzem dois números para a mesma medida.
 */
export const fmtTok = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);
