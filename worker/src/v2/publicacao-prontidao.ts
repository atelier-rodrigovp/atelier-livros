// Ponte entre o `npm run prontidao` (arquivo local) e a interface (site estático).
//
// A distinção entre saúde local e produção certificada vivia só no terminal, e a
// tela ficava livre para dar a impressão de "tudo pronto". A publicação segue a
// convenção que o projeto já usa para telemetria: uma linha em `jobs` com um
// `tipo` dedicado e payload versionado.
//
// Esta camada é PURA: monta e valida o payload. Quem escreve no banco é o script
// `worker/scripts/publicar-prontidao.ts`, e ele exige autorização explícita.

export const SCHEMA_PRONTIDAO_PUBLICADA = "prontidao-publicada/v1";
export const TIPO_JOB_PRONTIDAO = "prontidao_v2";

export interface RelatorioProntidao {
  head?: string;
  gerado_em?: string;
  estados?: Record<string, string>;
  bloqueios_producao?: string[];
  bloqueios?: string[];
}

export interface PayloadProntidaoPublicada {
  schema: typeof SCHEMA_PRONTIDAO_PUBLICADA;
  head: string;
  gerado_em: string;
  estados: Record<string, string>;
  bloqueios_producao: string[];
}

export class ErroPublicacao extends Error {}

/**
 * Só publica o que a tela precisa: estados e bloqueios. Nada de log, caminho de
 * arquivo ou nome de máquina — o payload fica visível na interface e o remoto é
 * público.
 */
export function payloadDaProntidao(rel: unknown): PayloadProntidaoPublicada {
  if (!rel || typeof rel !== "object") throw new ErroPublicacao("relatório de prontidão ausente ou ilegível");
  const r = rel as RelatorioProntidao;

  // HEAD sem fallback, pela mesma razão da evidência externa: um carimbo textual
  // ("desconhecido") passa por dado e contamina tudo que depende dele.
  if (!r.head || !/^[0-9a-f]{40}$/.test(r.head)) {
    throw new ErroPublicacao(`relatório sem HEAD válido: ${String(r.head)}`);
  }
  if (!r.estados || typeof r.estados !== "object") throw new ErroPublicacao("relatório sem estados formais");
  if (!r.estados.implementacao_local || !r.estados.release_producao) {
    throw new ErroPublicacao("relatório sem `implementacao_local` ou `release_producao`");
  }
  // Relatório com bloqueio local em aberto não vira publicação: a tela mostraria
  // um estado que a própria execução considerou reprovado.
  if (Array.isArray(r.bloqueios) && r.bloqueios.length > 0) {
    throw new ErroPublicacao(`o relatório tem ${r.bloqueios.length} bloqueio(s) local(is) — corrija antes de publicar`);
  }
  return {
    schema: SCHEMA_PRONTIDAO_PUBLICADA,
    head: r.head,
    gerado_em: r.gerado_em ?? new Date().toISOString(),
    estados: r.estados,
    bloqueios_producao: Array.isArray(r.bloqueios_producao) ? r.bloqueios_producao : [],
  };
}
