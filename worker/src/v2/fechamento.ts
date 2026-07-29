// Engine V2 — gates do FECHAMENTO do livro (rodam uma vez, com todos os
// capítulos escritos; nunca por capítulo).
//
// A distinção importa: uma promessa plantada no capítulo 2 para ser paga no 11
// é o funcionamento CORRETO do livro. Cobrar o pagamento capítulo a capítulo
// reprovaria toda abertura de arco. Por isso `gatePromessaNaoPaga` vive aqui —
// no fechamento — e não entre os gates universais de capítulo.

import { gatePromessaNaoPaga } from "./arco.js";
import { pendenciasDeFechamento } from "./memoria-prosa.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ArcoFundacao, EstadoCanonico, ResultadoGate, SceneSpec } from "./tipos.js";

export interface EntradaFechamento {
  projectId: string;
  total: number;
  /** Grade de arco da fundação v3. Ausente = fundação v2: gates de arco são no-op. */
  arco?: ArcoFundacao;
  /** Estado canônico já carregado (fonte da lista de capítulos aprovados). */
  estado: EstadoCanonico;
  persistencia: Pick<PersistenciaV2, "lerFichaMaisRecente">;
}

export interface ResultadoFechamento {
  /** false = fechamento bloqueado; o livro não pode ser declarado completo. */
  passou: boolean;
  gates: ResultadoGate[];
  /** Motivo estruturado quando o gate não é aplicável (fundação v2, sem promessas). */
  naoAplicavel?: string;
}

/** Fichas aprovadas do livro, na ordem, para os gates que cruzam plano × execução. */
export async function fichasAprovadasDoLivro(entrada: {
  projectId: string;
  total: number;
  estado: EstadoCanonico;
  persistencia: Pick<PersistenciaV2, "lerFichaMaisRecente">;
}): Promise<{ capitulo: number; ficha: SceneSpec }[]> {
  const out: { capitulo: number; ficha: SceneSpec }[] = [];
  for (let n = 1; n <= entrada.total; n++) {
    const cap = entrada.estado.doc.capitulos[String(n)];
    if (!cap || (cap.status !== "aprovado" && cap.status !== "aprovado_com_excecao")) continue;
    const ficha = await entrada.persistencia.lerFichaMaisRecente(entrada.projectId, n);
    if (ficha) out.push({ capitulo: n, ficha });
  }
  return out;
}

/**
 * Gates de fechamento do livro. Hoje: promessa plantada e nunca paga.
 * Fundação sem grade de arco (v2) ou sem promessas declaradas = no-op explícito
 * (`naoAplicavel`), nunca uma aprovação silenciosa.
 */
export async function avaliarFechamentoLivro(entrada: EntradaFechamento): Promise<ResultadoFechamento> {
  const fichas = await fichasAprovadasDoLivro(entrada);
  const memoria = entrada.estado.doc.memoria_prosa ?? [];
  const memoriaIncompleta = entrada.estado.doc.bloqueios.filter(
    (b) => b.codigo === "MEMORIA_PROSA_INCOMPLETA"
  );
  if (memoriaIncompleta.length) {
    return {
      passou: false,
      gates: [{
        gate: "memoria_prosa_incompleta",
        passou: false,
        evidencia: memoriaIncompleta
          .map((b) => `${b.alvo}: ${b.detalhe}`)
          .join(" · "),
      }],
    };
  }

  // CRUZAMENTO DAS TRÊS FONTES (fatia H). A fundação declara; as fichas marcam;
  // a PROSA planta. Silêncio de uma nunca vale como conformidade das outras: uma
  // pista aberta só na página continua exigindo payoff.
  const cruzadas = pendenciasDeFechamento({
    promessasFundacao: entrada.arco?.promessas ?? [],
    promessasFichas: fichas.flatMap(({ capitulo, ficha }) =>
      (ficha.promessas_tocadas ?? []).map((p) => ({ capitulo, id: p.id, acao: p.acao }))
    ),
    memoria,
  });
  const gateCruzado: ResultadoGate = {
    gate: "promessa_nao_paga",
    passou: cruzadas.length === 0,
    evidencia: cruzadas.length
      ? cruzadas
          .map((p) => `[${p.fonte}] ${p.id} ("${p.enunciado}", capítulo ${p.plantada_em}): ${p.motivo}`)
          .join(" · ")
      : undefined,
  };

  if (!entrada.arco) {
    // Sem grade de arco os gates de arco são no-op — mas a memória derivada da
    // PROSA continua valendo: ela não depende da fundação v3.
    if (cruzadas.length) return { passou: false, gates: [gateCruzado] };
    return {
      passou: true,
      gates: [],
      naoAplicavel: "fundação sem grade de arco (v2): gates de arco não aplicáveis; nenhuma pendência na memória da prosa",
    };
  }
  if (entrada.arco.promessas.length === 0 && memoria.length === 0) {
    return { passou: true, gates: [], naoAplicavel: "fundação sem promessas declaradas e sem memória derivada da prosa" };
  }
  const gates = [gatePromessaNaoPaga(entrada.arco.promessas, fichas), gateCruzado];
  return { passou: gates.every((g) => g.passou), gates };
}
