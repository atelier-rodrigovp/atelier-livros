// Engine V2 — gravador de estado determinístico.
// NÃO é um papel/agente: é código. Verifica artefatos no disco (verdade no disco),
// registra runs e mantém o estado canônico com lock otimista (retry com releitura).
import { hashArquivo } from "./hash.js";
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
  type RunRegistro,
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
  concluido: ["bloqueado"],
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
    caminhoArquivo: string
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
  async aplicarMapaCapitulos(mapa: Record<number, number>): Promise<void> {
    const entradas = Object.entries(mapa);
    if (entradas.length === 0) return;
    await this.mutarEstado((doc) => {
      const antigo = doc.capitulos;
      const novo: Record<string, CapituloEstado> = {};
      for (const [de, para] of entradas) {
        const est = antigo[String(de)];
        if (est) novo[String(para)] = est;
      }
      doc.capitulos = novo;
      doc.total_capitulos = Object.keys(novo).length;
    });
  }
}
