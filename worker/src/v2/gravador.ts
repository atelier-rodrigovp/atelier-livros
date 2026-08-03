// Engine V2 — gravador de estado determinístico.
// NÃO é um papel/agente: é código. Verifica artefatos no disco (verdade no disco),
// registra runs e mantém o estado canônico com lock otimista (retry com releitura).
import { hashArquivo } from "./hash.js";
import { fundirNoLedger } from "./ledger.js";
import type { ConflitoFichaProsa, EntradaMemoria } from "./memoria-prosa.js";
import type { SnapshotCanario } from "./canario-snapshot.js";
import { ErroConcorrencia, type PersistenciaV2 } from "./persistencia.js";
import {
  ENGINE_V2_VERSION,
  ErroEngine,
  type CapituloEstado,
  type ErroEstruturado,
  type EstadoCanonico,
  type EstadoCanonicoDoc,
  type Evidencia,
  type Parecer,
  type RevelacaoLedger,
  type RunRegistro,
  type TentativaCorrecao,
  type Verdict,
} from "./tipos.js";

type Fase = EstadoCanonicoDoc["fase"];

/**
 * Transições de fase permitidas.
 * Fluxo: escrita → revisao_final → consolidacao → avaliacao → concluido.
 * Regressões: escrita ← revisao_final (reescrita de capítulo) e escrita ← avaliacao
 * (a meta-nota manda reescrever capítulos). Bloqueado retoma para qualquer fase útil.
 */
const TRANSICOES_VALIDAS: Record<Fase, Fase[]> = {
  fundacao: ["estrutura", "bloqueado"],
  estrutura: ["escrita", "bloqueado"],
  escrita: ["revisao_final", "bloqueado"],
  revisao_final: ["consolidacao", "concluido", "escrita", "bloqueado"],
  consolidacao: ["avaliacao", "bloqueado"],
  avaliacao: ["concluido", "escrita", "bloqueado"],
  concluido: ["avaliacao", "bloqueado"], // avaliacao: revisão pós-conclusão pedida pelo autor (job revisar)
  bloqueado: ["fundacao", "estrutura", "escrita", "revisao_final", "consolidacao", "avaliacao", "concluido"],
};

const MAX_TENTATIVAS_CONCORRENCIA = 3;

/** Extrai o número do capítulo de um alvo "capitulo:NN"; null para outros alvos. */
function capituloDoAlvo(alvo: string): string | null {
  const m = /^capitulo:(\d+)$/.exec(alvo);
  return m ? String(Number(m[1])) : null;
}

export class Gravador {
  private readonly persistencia: PersistenciaV2;
  private readonly projectId: string;
  private readonly engineVersion: string;
  private estado: EstadoCanonico | null = null; // cache local; releitura em concorrência

  constructor(opts: { persistencia: PersistenciaV2; projectId: string; engineVersion?: string }) {
    this.persistencia = opts.persistencia;
    this.projectId = opts.projectId;
    this.engineVersion = opts.engineVersion ?? ENGINE_V2_VERSION;
  }

  private agora(): string {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  async iniciarRun(
    dados: Omit<RunRegistro, "status" | "started_at" | "attempt" | "project_id" | "engine_version"> & {
      attempt?: number;
      project_id?: string | null;
      engine_version?: string;
    }
  ): Promise<string> {
    const run: RunRegistro = {
      ...dados,
      // O Gravador já conhece o projeto e a versão da engine — o chamador não repete.
      project_id: dados.project_id !== undefined ? dados.project_id : this.projectId,
      engine_version: dados.engine_version ?? this.engineVersion,
      attempt: dados.attempt ?? 1,
      status: "running",
      started_at: this.agora(),
    };
    return this.persistencia.inserirRun(run);
  }

  async concluirRun(
    id: string,
    r: { output_hash?: string; tokens_in?: number; tokens_out?: number; evidencias?: Evidencia[] }
  ): Promise<void> {
    const patch: Partial<RunRegistro> = { status: "ok", finished_at: this.agora() };
    if (r.output_hash !== undefined) patch.output_hash = r.output_hash;
    if (r.tokens_in !== undefined) patch.tokens_in = r.tokens_in;
    if (r.tokens_out !== undefined) patch.tokens_out = r.tokens_out;
    if (r.evidencias !== undefined) patch.evidencias = r.evidencias;
    await this.persistencia.atualizarRun(id, patch);
  }

  async falharRun(id: string, erro: ErroEstruturado): Promise<void> {
    await this.persistencia.atualizarRun(id, {
      status: "falha",
      finished_at: this.agora(),
      // Forma plana e serializável (nunca a instância de Error crua)
      erro: { codigo: erro.codigo, classe: erro.classe, mensagem: erro.mensagem, detalhe: erro.detalhe },
    });
  }

  // -------------------------------------------------------------------------
  // Estado canônico
  // -------------------------------------------------------------------------

  /** Lê o estado persistido ou cria o inicial (fase fundacao, versao 0 = nunca gravado). */
  async carregarEstado(): Promise<EstadoCanonico> {
    if (this.estado) return this.estado;
    const lido = await this.persistencia.lerEstado(this.projectId);
    this.estado =
      lido ?? {
        project_id: this.projectId,
        engine_version: this.engineVersion,
        versao: 0,
        doc: { schema: "engine-state/v1", fase: "fundacao", capitulos: {}, bloqueios: [] },
      };
    return this.estado;
  }

  /** Aplica a mutação e grava; em ErroConcorrencia relê o estado e reaplica (até 3 tentativas). */
  private async mutarEstado(mutacao: (doc: EstadoCanonicoDoc) => void): Promise<EstadoCanonico> {
    let estado = await this.carregarEstado();
    for (let tentativa = 1; ; tentativa++) {
      mutacao(estado.doc);
      try {
        await this.persistencia.gravarEstado(estado); // incrementa estado.versao no sucesso
        this.estado = estado;
        return estado;
      } catch (e) {
        this.estado = null; // cópia local mutada sem persistir: invalida o cache
        if (!(e instanceof ErroConcorrencia) || tentativa >= MAX_TENTATIVAS_CONCORRENCIA) throw e;
        estado = await this.carregarEstado(); // releitura obrigatória e reaplica
      }
    }
  }

  /**
   * Registra um capítulo escrito VERIFICANDO o arquivo no disco (existência + hash).
   * Idempotente: mesmo texto já registrado não duplica nem regride status.
   */
  async registrarCapituloEscrito(
    cap: number,
    caminhoArquivo: string,
    meta: { palavras: number; spec_versao?: number; spec_hash?: string }
  ): Promise<CapituloEstado> {
    const hash = hashArquivo(caminhoArquivo);
    if (hash === null) {
      throw new ErroEngine({
        codigo: "GATE_ARTEFATO_AUSENTE",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: arquivo ausente no disco (${caminhoArquivo}).`,
        detalhe: { capitulo: cap, caminho: caminhoArquivo },
      });
    }
    const chave = String(cap);

    // Idempotência: mesmo texto e mesmos metadados já registrados → não grava de novo
    const atual = (await this.carregarEstado()).doc.capitulos[chave];
    if (
      atual &&
      atual.text_hash === hash &&
      atual.palavras === meta.palavras &&
      atual.spec_versao === meta.spec_versao &&
      atual.spec_hash === meta.spec_hash
    ) {
      return atual;
    }

    let resultado: CapituloEstado | undefined;
    await this.mutarEstado((doc) => {
      const existente = doc.capitulos[chave];
      if (existente && existente.text_hash === hash) {
        // Mesmo texto: preserva status (aprovação não regride), atualiza metadados
        resultado = {
          ...existente,
          palavras: meta.palavras,
          ...(meta.spec_versao !== undefined ? { spec_versao: meta.spec_versao } : {}),
          ...(meta.spec_hash !== undefined ? { spec_hash: meta.spec_hash } : {}),
        };
      } else {
        // Texto novo (ou primeiro registro): status escrito; aprovação anterior não vale p/ outro hash
        resultado = {
          status: "escrito",
          text_hash: hash,
          palavras: meta.palavras,
          ...(meta.spec_versao !== undefined ? { spec_versao: meta.spec_versao } : {}),
          ...(meta.spec_hash !== undefined ? { spec_hash: meta.spec_hash } : {}),
        };
      }
      doc.capitulos[chave] = resultado;
    });
    return resultado!;
  }

  /**
   * Aprova um capítulo com GATE aprovacao_sem_evidencia:
   * verdict aprovador + parecer com evidências + hash do disco idêntico ao do review.
   */
  async aprovarCapitulo(
    cap: number,
    review: { id: string; text_hash: string; verdict: Verdict; parecer: Parecer },
    caminhoArquivo: string,
    /**
     * Revelações da ficha aprovada (ledger.entradasDaFicha). Alimentam o ledger
     * de revelações deterministicamente — sem chamada de modelo. Omitir mantém o
     * ledger intacto (retrocompatível com chamadores anteriores).
     */
    revelacoes?: RevelacaoLedger[]
  ): Promise<void> {
    if (review.verdict !== "aprovado" && review.verdict !== "aprovado_com_excecao") {
      throw new ErroEngine({
        codigo: "GATE_APROVACAO_SEM_EVIDENCIA",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: verdict "${review.verdict}" não autoriza aprovação.`,
        detalhe: { capitulo: cap, verdict: review.verdict },
      });
    }
    if (!review.parecer.evidencias || review.parecer.evidencias.length === 0) {
      throw new ErroEngine({
        codigo: "GATE_APROVACAO_SEM_EVIDENCIA",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: parecer sem evidências localizadas; aprovação exige ≥1 evidência.`,
        detalhe: { capitulo: cap, review_id: review.id },
      });
    }
    const hashDisco = hashArquivo(caminhoArquivo);
    if (hashDisco === null) {
      throw new ErroEngine({
        codigo: "GATE_ARTEFATO_AUSENTE",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: arquivo ausente no disco (${caminhoArquivo}).`,
        detalhe: { capitulo: cap, caminho: caminhoArquivo },
      });
    }
    if (hashDisco !== review.text_hash) {
      throw new ErroEngine({
        codigo: "GATE_ESTADO_INCONSISTENTE",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: o texto no disco difere do texto avaliado pelo review.`,
        detalhe: { capitulo: cap, hash_review: review.text_hash, hash_disco: hashDisco },
      });
    }
    const verdict = review.verdict; // "aprovado" | "aprovado_com_excecao"
    const chave = String(cap);
    await this.mutarEstado((doc) => {
      const { bloqueio: _antigo, ...existente } = doc.capitulos[chave] ?? {};
      doc.capitulos[chave] = {
        ...existente,
        status: verdict,
        text_hash: review.text_hash,
        review_id: review.id,
        aprovacao: { review_id: review.id, text_hash: review.text_hash, em: this.agora() },
      };
      // Aprovação com evidência supera bloqueios anteriores DESTE capítulo (retomada limpa).
      doc.bloqueios = doc.bloqueios.filter((b) => b.alvo !== `capitulo:${cap}`);
      // Ledger de revelações: fusão idempotente (reaprovar substitui, nunca duplica).
      if (revelacoes) doc.ledger_revelacoes = fundirNoLedger(doc.ledger_revelacoes ?? [], revelacoes);
    });
  }

  /**
   * Restaura uma versão anteriormente aprovada depois de uma tentativa de
   * reescrita da meta-nota falhar. O chamador restaura primeiro o arquivo de
   * forma atômica; este método confere o hash no disco antes de promover o
   * snapshot de volta ao estado canônico.
   *
   * A tentativa fracassada continua auditável em runs/reviews. O resumo da
   * reversão também fica no estado para a UI explicar por que o melhor texto
   * foi preservado.
   */
  async restaurarCapituloAprovado(
    cap: number,
    caminhoArquivo: string,
    snapshot: CapituloEstado,
    tentativa: {
      status: CapituloEstado["status"] | "erro";
      text_hash?: string;
      review_id?: string;
      motivo: string;
    }
  ): Promise<void> {
    if (
      (snapshot.status !== "aprovado" && snapshot.status !== "aprovado_com_excecao") ||
      !snapshot.text_hash ||
      !snapshot.review_id ||
      !snapshot.aprovacao ||
      snapshot.aprovacao.text_hash !== snapshot.text_hash
    ) {
      throw new ErroEngine({
        codigo: "META_SNAPSHOT_INVALIDO",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: snapshot da meta-nota não representa uma aprovação verificável.`,
        detalhe: { capitulo: cap, status: snapshot.status, text_hash: snapshot.text_hash },
      });
    }
    const hashDisco = hashArquivo(caminhoArquivo);
    if (hashDisco !== snapshot.text_hash) {
      throw new ErroEngine({
        codigo: "GATE_ESTADO_INCONSISTENTE",
        classe: "qualidade",
        mensagem: `Capítulo ${cap}: não foi possível restaurar o estado porque o arquivo não corresponde ao melhor hash aprovado.`,
        detalhe: { capitulo: cap, hash_esperado: snapshot.text_hash, hash_disco: hashDisco },
      });
    }

    const chave = String(cap);
    await this.mutarEstado((doc) => {
      doc.capitulos[chave] = structuredClone(snapshot);
      doc.bloqueios = doc.bloqueios.filter((b) => b.alvo !== `capitulo:${cap}`);
      doc.reversoes_meta ??= [];
      doc.reversoes_meta.push({
        capitulo: cap,
        status_tentativa: tentativa.status,
        ...(tentativa.text_hash ? { text_hash_tentativa: tentativa.text_hash } : {}),
        ...(tentativa.review_id ? { review_id_tentativa: tentativa.review_id } : {}),
        text_hash_restaurado: snapshot.text_hash!,
        motivo: tentativa.motivo,
        em: this.agora(),
      });
    });
  }

  // -------------------------------------------------------------------------
  // Bloqueios
  // -------------------------------------------------------------------------

  async registrarBloqueio(codigo: string, alvo: string, detalhe: string): Promise<void> {
    await this.mutarEstado((doc) => {
      const existente = doc.bloqueios.find((b) => b.codigo === codigo && b.alvo === alvo);
      if (existente) {
        existente.detalhe = detalhe;
        return;
      }
      const entrada: EstadoCanonicoDoc["bloqueios"][number] = { codigo, alvo, detalhe, desde: this.agora() };
      const chave = capituloDoAlvo(alvo);
      if (chave !== null) {
        const cap = doc.capitulos[chave];
        if (cap && cap.status !== "bloqueado") entrada.status_anterior = cap.status;
        doc.capitulos[chave] = {
          ...cap,
          status: "bloqueado",
          bloqueio: { codigo, detalhe, desde: entrada.desde },
        };
      }
      doc.bloqueios.push(entrada);
    });
  }

  /**
   * Registra uma tentativa da escada de correção (fatia C).
   *
   * A tentativa é gravada ABERTA (`hash_saida: null`) ANTES de rodar — assim uma
   * queda do worker no meio da tentativa não faz a escada repetir a estratégia na
   * retomada — e FECHADA depois, com o hash produzido e o resultado. Fechar é
   * completar o registro da MESMA tentativa (mesma estratégia, mesmo texto de
   * entrada), nunca reescrever uma tentativa anterior: qualquer outra combinação
   * entra como linha nova.
   */
  async registrarTentativaCorrecao(tentativa: TentativaCorrecao): Promise<void> {
    await this.mutarEstado((doc) => {
      const chave = String(tentativa.capitulo);
      doc.correcoes = doc.correcoes ?? {};
      const lista = [...(doc.correcoes[chave] ?? [])];
      const aberta = lista.findIndex(
        (t) =>
          t.hash_saida === null &&
          t.estrategia === tentativa.estrategia &&
          t.hash_entrada === tentativa.hash_entrada
      );
      if (aberta >= 0) lista[aberta] = tentativa;
      else lista.push(tentativa);
      doc.correcoes[chave] = lista;
    });
  }

  /**
   * Memória derivada da PROSA APROVADA (fatia H). Append por capítulo: reprocessar
   * um capítulo substitui as entradas DELE, nunca as dos outros.
   */
  async registrarMemoriaDaProsa(
    capitulo: number,
    entradas: EntradaMemoria[],
    conflitos: ConflitoFichaProsa[]
  ): Promise<void> {
    await this.mutarEstado((doc) => {
      const outros = (doc.memoria_prosa ?? []).filter((m) => m.capitulo !== capitulo);
      doc.memoria_prosa = [...outros, ...entradas].sort((a, b) => a.capitulo - b.capitulo);
      // Uma extração bem-sucedida resolve o bloqueio técnico anterior deste
      // capítulo. Sem isso, reprocessar a memória nunca permitiria fechar o livro.
      doc.bloqueios = doc.bloqueios.filter(
        (b) => !(b.codigo === "MEMORIA_PROSA_INCOMPLETA" && b.alvo === `capitulo:${capitulo}`)
      );
      if (conflitos.length) {
        const anteriores = (doc.conflitos_ficha_prosa ?? []).filter((c) => c.capitulo !== capitulo);
        doc.conflitos_ficha_prosa = [...anteriores, ...conflitos];
      }
    });
  }

  /** O extrator falhou: o capítulo segue aprovado, mas a memória dele está incompleta. */
  async registrarMemoriaIncompleta(capitulo: number): Promise<void> {
    await this.mutarEstado((doc) => {
      const outros = (doc.memoria_prosa ?? []).filter((m) => m.capitulo !== capitulo);
      doc.memoria_prosa = outros;
      const alvo = `capitulo:${capitulo}`;
      const existente = doc.bloqueios.find(
        (b) => b.codigo === "MEMORIA_PROSA_INCOMPLETA" && b.alvo === alvo
      );
      if (existente) {
        existente.detalhe = "o extrator de memória falhou; o fechamento não pode cobrar pistas deste capítulo";
      } else {
        doc.bloqueios.push({
          codigo: "MEMORIA_PROSA_INCOMPLETA",
          alvo,
          detalhe: "o extrator de memória falhou; o fechamento não pode cobrar pistas deste capítulo",
          desde: this.agora(),
        });
      }
    });
  }

  /**
   * Registra uma onda de revalidação transitiva (fatia K): o que foi reaberto,
   * por quê, e a decisão. É o que a interface mostra como "capítulos afetados
   * por reescrita" — antes, a propagação era invisível.
   */
  async registrarRevalidacao(
    origem: number,
    acao: "nenhuma" | "reabrir" | "decisao_humana",
    afetados: { capitulo: number; distancia: number; motivos: { canal: string; chave: string; via: number }[] }[]
  ): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.revalidacoes = [
        ...(doc.revalidacoes ?? []).filter((r) => r.origem !== origem),
        {
          origem,
          acao,
          em: this.agora(),
          afetados: afetados.map((a) => ({
            capitulo: a.capitulo,
            distancia: a.distancia,
            motivos: a.motivos.map((m) => `${m.canal}:${m.chave} (via cap ${m.via})`),
          })),
        },
      ].sort((a, b) => a.origem - b.origem);
    });
  }

  /** Grava o snapshot imutável do canário aprovado (fatia L). */
  async registrarSnapshotCanario(snapshot: SnapshotCanario): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.canario_snapshot = snapshot;
    });
  }

  /** Premissas vigentes: a base contra a qual a próxima execução compara. */
  async registrarPremissas(premissas: NonNullable<EstadoCanonicoDoc["premissas"]>): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.premissas = premissas;
    });
  }

  /** Artefatos invalidados por mudança de premissa — nunca silencioso. */
  async registrarInvalidacao(inv: NonNullable<EstadoCanonicoDoc["invalidacao"]>): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.invalidacao = inv;
      doc.bloqueios.push({
        codigo: "PREMISSA_ALTERADA",
        alvo: "livro",
        detalhe: inv.motivo,
        desde: this.agora(),
      });
    });
  }

  /** A escada parou neste capítulo: a decisão passa a ser do autor. */
  async registrarCircuitBreaker(capitulo: number, motivo: string, tentativas: number): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.circuit_breaker = doc.circuit_breaker ?? [];
      const existente = doc.circuit_breaker.find((c) => c.capitulo === capitulo);
      if (existente) {
        existente.motivo = motivo;
        existente.tentativas = tentativas;
        return;
      }
      doc.circuit_breaker.push({ capitulo, motivo, tentativas, em: this.agora() });
    });
  }

  async removerBloqueio(codigo: string, alvo: string): Promise<void> {
    await this.mutarEstado((doc) => {
      const removido = doc.bloqueios.find((b) => b.codigo === codigo && b.alvo === alvo);
      doc.bloqueios = doc.bloqueios.filter((b) => !(b.codigo === codigo && b.alvo === alvo));
      const chave = capituloDoAlvo(alvo);
      if (chave === null || !removido) return;
      const cap = doc.capitulos[chave];
      if (!cap || cap.status !== "bloqueado") return;
      // Outro bloqueio ainda mira este capítulo? Então o status bloqueado permanece.
      if (doc.bloqueios.some((b) => b.alvo === alvo)) return;
      const { bloqueio: _descartado, ...resto } = cap;
      doc.capitulos[chave] = {
        ...resto,
        status: removido.status_anterior ?? (cap.text_hash ? "escrito" : "planejado"),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Fase
  // -------------------------------------------------------------------------

  async mudarFase(fase: Fase): Promise<void> {
    const estado = await this.carregarEstado();
    const atual = estado.doc.fase;
    if (atual === fase) return; // idempotente: mesma fase não grava
    if (!TRANSICOES_VALIDAS[atual].includes(fase)) {
      throw new ErroEngine({
        codigo: "ESTADO_INCONSISTENTE",
        classe: "tecnica",
        mensagem: `Transição de fase inválida: ${atual} → ${fase}.`,
        detalhe: { de: atual, para: fase },
      });
    }
    await this.mutarEstado((doc) => {
      doc.fase = fase;
    });
  }

  // -------------------------------------------------------------------------
  // Edição estrutural e meta-nota (fechamento do loop, F3)
  // -------------------------------------------------------------------------

  /** Registra o resultado da edição estrutural (propostas do editor + o que o pipeline aplicou). */
  async registrarEdicaoEstrutural(dados: {
    run_id?: string;
    propostas: number;
    aplicadas: number;
    detalhe: string[];
  }): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.edicao_estrutural = { ...dados, em: this.agora() };
    });
  }

  /** Registra a última avaliação de livro (nota × meta × iterações + caminho do relatório). */
  async registrarAvaliacao(dados: {
    nota?: number;
    meta: number;
    floor?: { dimensao: string; nota: number };
    iteracoes: number;
    relatorio_path?: string;
  }): Promise<void> {
    await this.mutarEstado((doc) => {
      doc.avaliacao = { ...dados, em: this.agora() };
    });
  }

  /**
   * Re-keia doc.capitulos pelo mapa {número antigo → número novo} produzido pela
   * edição estrutural (corte + reordenação) e ajusta total_capitulos. Capítulos
   * ausentes do mapa (cortados) são descartados. Mapa vazio = no-op.
   */
  async aplicarMapaCapitulos(
    mapa: Record<number, number>,
    opts?: {
      edicao?: {
        run_id?: string;
        propostas: number;
        aplicadas: number;
        detalhe: string[];
      };
      specs?: { destino: number; versao: number; hash: string }[];
      fusoes?: {
        origens: number[];
        destino: number;
        text_hash: string;
        palavras: number;
        review_id: string;
        spec_versao: number;
        spec_hash: string;
      }[];
    }
  ): Promise<void> {
    const entradas = Object.entries(mapa);
    if (entradas.length === 0 && !opts?.fusoes?.length && !opts?.edicao) return;
    await this.mutarEstado((doc) => {
      if (entradas.length > 0 || opts?.fusoes?.length) {
        const antigo = doc.capitulos;
        const novo: Record<string, CapituloEstado> = {};
        const fusoesPorDestino = new Map((opts?.fusoes ?? []).map((f) => [f.destino, f]));
        const specsPorDestino = new Map((opts?.specs ?? []).map((s) => [s.destino, s]));
        for (const [de, para] of entradas) {
          if (fusoesPorDestino.has(para)) continue;
          const est = antigo[String(de)];
          if (est) {
            const spec = specsPorDestino.get(para);
            novo[String(para)] = {
              ...est,
              ...(spec ? { spec_versao: spec.versao, spec_hash: spec.hash } : {}),
            };
          }
        }
        for (const fusao of opts?.fusoes ?? []) {
          const lider = antigo[String(fusao.origens[0])] ?? {};
          const { bloqueio: _bloqueio, ...base } = lider;
          novo[String(fusao.destino)] = {
            ...base,
            status: "aprovado",
            text_hash: fusao.text_hash,
            palavras: fusao.palavras,
            review_id: fusao.review_id,
            aprovacao: {
              review_id: fusao.review_id,
              text_hash: fusao.text_hash,
              em: this.agora(),
            },
            spec_versao: fusao.spec_versao,
            spec_hash: fusao.spec_hash,
            origens_estruturais: [...fusao.origens],
          };
        }
        doc.capitulos = novo;
        doc.total_capitulos = Object.keys(novo).length;
      }
      if (opts?.edicao) {
        doc.edicao_estrutural = { ...opts.edicao, em: this.agora() };
      }
    });
  }
}
