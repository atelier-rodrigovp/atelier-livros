// Que código o worker que está RODANDO tem — carimbado no arranque.
//
// O achado A2 ficou sem causa raiz por falta exatamente disto: o worker executou
// Haiku com Sonnet solicitado (run 894dba1a) e não havia como saber se o
// processo daquele momento já tinha a correção ou era binário velho. Commit não
// é produção: o worker só passa a valer o commit depois de reiniciar, e nada
// registrava quando isso aconteceu.
//
// Uma worktree suja invalida o SHA: o código em execução não é o do commit. Por
// isso `sujo` vai junto e é dado de primeira classe, não nota de rodapé — SHA
// sozinho, com arquivo modificado por cima, é pior que nenhum SHA: parece dado.

import { capturarHead, worktreeLimpa } from "./v2/execucao.js";

export interface VersaoCodigo {
  /** HEAD no momento do arranque, ou null se o git não respondeu. */
  sha: string | null;
  /** Arquivos do worker modificados por cima do HEAD. `true` invalida o SHA. */
  sujo: boolean;
  /** Quais arquivos — sem isso o `sujo` não é acionável. */
  sujos: string[];
  /** Quando ESTE processo subiu. É o que faltava para datar o reinício. */
  iniciadoEm: string;
  /** Por que o SHA é null, quando é. */
  erro?: string;
}

/** Só o que o worker executa: mudar o frontend não suja a versão do worker. */
const CAMINHOS_DO_WORKER = ["worker/src", "worker/scripts", "worker/skills-v2"];

/**
 * Lê uma vez, no arranque. Não relê a cada heartbeat de propósito: o que
 * interessa é o código com que o processo SUBIU — editar arquivo com o worker
 * no ar não troca o que está em execução, e um valor que mudasse sozinho
 * enquanto o processo vive descreveria o disco, não o processo.
 */
export function lerVersaoCodigo(cwd: string, agora: Date = new Date()): VersaoCodigo {
  const iniciadoEm = agora.toISOString();
  try {
    const sha = capturarHead(cwd);
    const { limpa, sujos } = worktreeLimpa(cwd, CAMINHOS_DO_WORKER);
    return { sha, sujo: !limpa, sujos, iniciadoEm };
  } catch (e) {
    // Worker rodando fora de repositório git é cenário real (cópia solta). Não
    // derruba o daemon; vira ausência declarada, que é o oposto de silêncio.
    return { sha: null, sujo: false, sujos: [], iniciadoEm, erro: (e as Error).message.slice(0, 200) };
  }
}

/** Uma linha para o log do arranque, legível sem consultar o banco. */
export function descreverVersao(v: VersaoCodigo): string {
  if (!v.sha) return `código: SHA indisponível (${v.erro ?? "sem motivo"}) — início ${v.iniciadoEm}`;
  const curto = v.sha.slice(0, 7);
  if (!v.sujo) return `código: ${curto} (worktree limpa) — início ${v.iniciadoEm}`;
  return `código: ${curto} + ${v.sujos.length} arquivo(s) MODIFICADO(S) por cima — início ${v.iniciadoEm}`;
}
