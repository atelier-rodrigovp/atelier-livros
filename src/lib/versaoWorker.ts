// O worker carimba o SHA com que subiu; aqui esse carimbo vira BLOQUEIO.
//
// A fatia 6b fez o worker declarar sua versão, e nada consumia o carimbo — de
// modo que "commit não é produção" continuava sendo uma frase, não um alarme.
// Um worker rodando código de anteontem produz capítulo com a régua de anteontem
// e não há nada na tela dizendo isso.
//
// Comparação pura, sem I/O: quem lê o heartbeat e quem lê o HEAD são os
// chamadores (a prontidão no worker, o painel na interface).

export interface CarimboWorker {
  sha: string | null;
  sujo: boolean;
  sujos?: string[];
  iniciadoEm?: string;
}

export type VeredictoVersao = "igual" | "divergente" | "suja" | "sem_carimbo";

export interface ComparacaoVersao {
  veredicto: VeredictoVersao;
  /** Divergência é bloqueio explícito, não detalhe de log. */
  bloqueia: boolean;
  mensagem: string;
}

const curto = (sha: string) => sha.slice(0, 7);

/**
 * `carimbo` nulo cobre dois casos que dão no mesmo para quem lê: não há worker
 * no ar, ou o worker no ar é anterior ao carimbo. Nos dois, a versão em execução
 * é desconhecida — e desconhecido não é igual.
 */
export function compararVersaoWorker(
  carimbo: CarimboWorker | null | undefined,
  shaRepo: string
): ComparacaoVersao {
  if (!carimbo?.sha) {
    return {
      veredicto: "sem_carimbo",
      bloqueia: true,
      mensagem:
        `o worker no ar não declara a versão do código que executa; ` +
        `repositório está em ${curto(shaRepo)}`,
    };
  }
  if (carimbo.sha !== shaRepo) {
    return {
      veredicto: "divergente",
      bloqueia: true,
      mensagem: `worker roda código de ${curto(carimbo.sha)}, repositório está em ${curto(shaRepo)}`,
    };
  }
  if (carimbo.sujo) {
    const n = carimbo.sujos?.length ?? 0;
    return {
      veredicto: "suja",
      bloqueia: true,
      // Mesmo SHA não basta: o processo subiu com arquivo modificado por cima,
      // então o código em execução não é o do commit.
      mensagem:
        `worker roda código de ${curto(carimbo.sha)} com ${n} arquivo(s) modificado(s) por cima; ` +
        `repositório está em ${curto(shaRepo)}`,
    };
  }
  return {
    veredicto: "igual",
    bloqueia: false,
    mensagem: `worker roda o código do repositório (${curto(shaRepo)})`,
  };
}
