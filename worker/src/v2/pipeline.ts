// Engine V2 — ciclo por capítulo (F7).
// Orquestra os papéis (arquiteto_cena → contextualizador → escritor → revisor_literario
// → auditor_factual) em torno do gravador determinístico: papéis NUNCA tocam disco —
// quem escreve capitulo-NN.md e persiste estado é o pipeline/gravador.
// Nenhum nome de skill ou de modelo aqui: tudo chega pelo contrato e pelo MapaModelos.
// hashText (../quality-state.js) é puro — import direto não arrasta .env.

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import { compilarPacote, type Instrucao, type SecaoContexto } from "./compilador.js";
import { rodarGatesCapitulo } from "./gates.js";
import type { Gravador } from "./gravador.js";
import { hashJsonCanonico } from "./hash.js";
import { gateFichaContraArco, gateRotacaoPov, renderizarArcoParaCapitulo } from "./arco.js";
import {
  conferirConformidade,
  medirConformidade,
  resumoConformidade,
  validarParecerConformidade,
  type ParecerConformidade,
} from "./conformidade.js";
import { entradasDaFicha, gateRevelacaoRepetida, renderizarLedger, revelacoesDaFicha } from "./ledger.js";
import { decidirIdioma, medirIdioma, resumoIdioma, validarParecerIdioma, type ParecerIdioma } from "./idioma.js";
import { derivarMemoriaDaProsa, validarExtracaoProsa, type ExtracaoProsa } from "./memoria-prosa.js";
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { aplicarDelta, precisaEscalar, validarDelta, type DeltaDecisao } from "./cascata.js";
import { acharSinalMedido, conferirParecer, exigirDisposicaoCompleta, hidratarOcorrenciasCitadas, normalizarParecerBruto, validarParecer } from "./revisor.js";
import { medirSinais, resumoSinais } from "./sinais.js";
import {
  decidirManeirismo,
  detectarRepeticaoSemantica,
  localizarTrechoSemantico,
  medirManeirismosDoLivro,
  repeticaoSemanticaBloqueia,
} from "./repeticao.js";
import { validarSpec } from "./spec.js";
import {
  tarefaArquitetoCena,
  tarefaAuditorFactual,
  tarefaContextualizador,
  tarefaEscritor,
  tarefaConformidade,
  tarefaIdioma,
  tarefaExtratorMemoria,
  tarefaEscritorCorrecao,
  tarefaRevisor,
  tarefaDecisaoCascata,
  type ModoCorrecao,
} from "./tarefas.js";
import {
  ErroEngine,
  type ArcoFundacao,
  type ContratoCompilado,
  type EstrategiaCorrecao as Estrategia,
  type MapaModelos,
  type Parecer,
  type ResultadoGate,
  type SceneSpec,
} from "./tipos.js";

export interface DepsPipeline {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  /** Ofício da skill (SKILL.md + references, verbatim) — entra no pacote do
   *  escritor E do revisor literário (o MESMO texto para os dois; documentos
   *  diferentes reintroduziriam a divergência escritor×revisor). */
  oficio?: { skillId: string; texto: string; hash: string };
  dirManuscrito: string; // onde capitulo-NN.md é escrito (pelo PIPELINE, não pelo modelo)
  projectId: string;
  editionId?: string | null;
  jobId?: string | null;
  fundacaoEsperada?: Record<string, string>;
  instrucoesAutor?: Instrucao[];
  /** Preferências não obrigatórias do autor — camada 7 do compilador. */
  preferencias?: Instrucao[];
  /** Idioma da obra (projects.idioma_origem); a prosa sai neste idioma. */
  idioma?: string;
  maxCorrecoes?: number; // default 2 — tentativas de correção dirigida por capítulo
  /** Docs factuais do projeto (ex.: dossie-factual.md) — entram no pacote do revisor e do auditor. */
  docsFactuais?: SecaoContexto[];
  /** Fundação da obra (bíblia/mapa/estrutura/arco) — seções camada 6 por papel. */
  fundacao?: {
    biblia?: string;
    mapaPersonagens?: string;
    estrutura?: { capitulo: number; fio: string; resumo_estrutural: string }[];
    /** Grade de arco (fundação v3). Ausente = fundação v2: gates de arco são no-op. */
    arco?: ArcoFundacao;
  };
}

export interface ResultadoCapitulo {
  capitulo: number;
  status: "aprovado" | "aprovado_com_excecao" | "reprovado" | "necessita_decisao_humana" | "bloqueado";
  textHash?: string;
  reviewId?: string;
  gatesFalhos: ResultadoGate[];
  problemas: string[];
  runs: string[]; // ids na ordem
}

// ---------------------------------------------------------------------------
// Saídas estruturadas dos papéis de fatos (contextualizador e auditor)
// ---------------------------------------------------------------------------

interface SaidaContextualizador {
  fatos: { fato: string; origem: string }[];
  continuidade: { item: string; origem: string }[];
  repeticoes_recentes: string[];
}

interface SaidaAuditor {
  contradicoes: { fato_estabelecido: string; trecho_do_capitulo: string; gravidade: "bloqueante" | "aviso" }[];
  conhecimento_indevido: { quem: string; sabe_o_que_nao_deveria: string; trecho: string }[];
  pov_violado: { ha: boolean; detalhe: string };
}

/** Itens do contextualizador acima disso = cheiro de prosa, não de fato seco. */
const MAX_PALAVRAS_ITEM_CONTEXTO = 60;

function contarPalavras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

/** Extrai JSON da resposta do modelo (aceita cerca ```json ... ```). Lança se inválido. */
function extrairJson(texto: string): unknown {
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cru = (m ? m[1] : texto).trim();
  return JSON.parse(cru);
}

function exigirString(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`${campo} deve ser string não-vazia`);
  if (contarPalavras(valor) > MAX_PALAVRAS_ITEM_CONTEXTO) {
    throw new Error(`${campo}: ${contarPalavras(valor)} palavras (máx ${MAX_PALAVRAS_ITEM_CONTEXTO}) — contextualizador não escreve prosa`);
  }
  return valor;
}

export function validarSaidaContextualizador(obj: unknown): SaidaContextualizador {
  if (typeof obj !== "object" || obj === null) throw new Error("saída do contextualizador não é objeto");
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.fatos) || !Array.isArray(o.continuidade) || !Array.isArray(o.repeticoes_recentes)) {
    throw new Error("esperado { fatos[], continuidade[], repeticoes_recentes[] }");
  }
  const fatos = (o.fatos as unknown[]).map((f, i) => {
    const x = f as Record<string, unknown>;
    return { fato: exigirString(x?.fato, `fatos[${i}].fato`), origem: exigirString(x?.origem, `fatos[${i}].origem`) };
  });
  const continuidade = (o.continuidade as unknown[]).map((c, i) => {
    const x = c as Record<string, unknown>;
    return { item: exigirString(x?.item, `continuidade[${i}].item`), origem: exigirString(x?.origem, `continuidade[${i}].origem`) };
  });
  const repeticoes = (o.repeticoes_recentes as unknown[]).map((r, i) => exigirString(r, `repeticoes_recentes[${i}]`));
  return { fatos, continuidade, repeticoes_recentes: repeticoes };
}

export function validarSaidaAuditor(obj: unknown): SaidaAuditor {
  if (typeof obj !== "object" || obj === null) throw new Error("saída do auditor não é objeto");
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.contradicoes) || !Array.isArray(o.conhecimento_indevido)) {
    throw new Error("esperado { contradicoes[], conhecimento_indevido[], pov_violado }");
  }
  const contradicoes = (o.contradicoes as unknown[]).map((c, i) => {
    const x = c as Record<string, unknown>;
    if (typeof x?.fato_estabelecido !== "string" || typeof x?.trecho_do_capitulo !== "string") {
      throw new Error(`contradicoes[${i}] inválida (fato_estabelecido/trecho_do_capitulo)`);
    }
    const gravidade =
      x.gravidade === "bloqueante" ? ("bloqueante" as const) : x.gravidade === "aviso" ? ("aviso" as const) : null;
    if (gravidade === null) throw new Error(`contradicoes[${i}].gravidade inválida: ${String(x.gravidade)}`);
    return { fato_estabelecido: x.fato_estabelecido, trecho_do_capitulo: x.trecho_do_capitulo, gravidade };
  });
  const conhecimento = (o.conhecimento_indevido as unknown[]).map((k, i) => {
    const x = k as Record<string, unknown>;
    if (typeof x?.quem !== "string" || typeof x?.sabe_o_que_nao_deveria !== "string" || typeof x?.trecho !== "string") {
      throw new Error(`conhecimento_indevido[${i}] inválido (quem/sabe_o_que_nao_deveria/trecho)`);
    }
    return { quem: x.quem, sabe_o_que_nao_deveria: x.sabe_o_que_nao_deveria, trecho: x.trecho };
  });
  const pov = o.pov_violado as Record<string, unknown> | undefined;
  if (!pov || typeof pov.ha !== "boolean" || typeof pov.detalhe !== "string") {
    throw new Error("pov_violado inválido (esperado {ha: boolean, detalhe: string})");
  }
  // `pov_violado` REPROVA o capítulo (decisão, não anotação). Uma violação
  // declarada sem detalhe é protocolo violado — vira retry técnico do auditor,
  // nunca uma reprovação sem evidência localizável.
  if (pov.ha === true && pov.detalhe.trim().length === 0) {
    throw new Error("pov_violado.ha=true exige `detalhe` não vazio citando o trecho que viola o POV");
  }
  if (pov.ha === true) {
    const detalheNormalizado = pov.detalhe
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const negaAPropriaAcusacao = [
      /nao (?:e|constitui|configura) (?:uma )?violacao/,
      /consistente com (?:a )?ficha/,
      /previst[oa] pel[ao] ficha/,
    ].some((padrao) => padrao.test(detalheNormalizado));
    if (negaAPropriaAcusacao) {
      throw new Error(
        "pov_violado contraditório: ha=true, mas o detalhe afirma que o trecho não viola o POV ou está previsto pela ficha"
      );
    }
  }
  return { contradicoes, conhecimento_indevido: conhecimento, pov_violado: { ha: pov.ha, detalhe: pov.detalhe } };
}

/**
 * Uma linha por capítulo anterior: o mínimo para planejar sem reinventar o passado
 * (fio/POV, quando, onde, o que mudou, como fechou). Sem prosa — é ficha, não texto.
 */
function resumirFicha(capitulo: number, f: SceneSpec): string {
  const partes = [
    `Cap ${capitulo} [${f.pov}]`,
    f.tempo ? `${f.tempo}` : "",
    f.local ? `${f.local}` : "",
    f.virada ? `virada: ${f.virada}` : "",
    f.mudanca_estado ? `mudança: ${f.mudanca_estado}` : "",
    f.gancho?.tipo ? `gancho: ${f.gancho.tipo}` : "",
  ].filter(Boolean);
  return `- ${partes.join(" · ")}`;
}

/** Prosa do escritor: só valida presença — o conteúdo é julgado por gates/revisor. */
export function parseProsa(t: string): string {
  const limpo = t.trim();
  if (!limpo) throw new Error("prosa vazia");
  return limpo;
}

/** Gravação atômica (tmp + rename), criando o diretório se preciso. */
function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, conteudo, "utf8");
  renameSync(tmp, caminho);
}

// ---------------------------------------------------------------------------
// Ciclo por capítulo
// ---------------------------------------------------------------------------

export async function escreverCapitulo(
  deps: DepsPipeline,
  capitulo: number,
  opts?: {
    fichaExistente?: SceneSpec;
    anteriores?: { numero: number; trecho: string }[];
    trechosAnteriores?: SecaoContexto[];
    /**
     * Texto-base (revalidação/meta-nota): usa o texto dado (normalmente o do disco) em
     * vez de escrever prosa nova — o fluxo de gates/sinais/revisor/auditor/decisão roda
     * IDÊNTICO (caminho único de decisão; scripts nunca reimplementam aprovação).
     * Exige fichaExistente.
     */
    textoBase?: string;
    /**
     * Reavalia o texto-base sem qualquer correção automática. Todos os gates e
     * papéis de julgamento rodam; o escritor só será chamado por uma etapa
     * posterior se este veredito reprovar.
     */
    somenteRevalidacao?: boolean;
    /**
     * Reescrita dirigida (meta-nota): sobre o textoBase, aplica as correções do avaliador
     * em modo "reescrita" como 1ª ação, seguindo depois o fluxo normal. Exige textoBase.
     */
    reescritaDirigida?: { correcoes: { local: string; problema: string; instrucao: string }[] };
    /**
     * Escada de correção (fatia C): a ESTRATÉGIA escolhida pelo controlador muda
     * a AÇÃO desta execução — regenerar a ficha, reescrever a superfície,
     * reescrever do zero ou trocar o juiz. Sem isto, "tentar de novo" seria a
     * mesma ação repetida com outras palavras.
     */
    correcaoDirigida?: { estrategia: Estrategia; blockers: string[]; hipotese: string; tentativa: number };
  }
): Promise<ResultadoCapitulo> {
  const runs: string[] = [];
  const problemas: string[] = [];
  const alvoCap = `capitulo:${capitulo}`;
  const nn = String(capitulo).padStart(2, "0");
  const caminho = path.join(deps.dirManuscrito, `capitulo-${nn}.md`);
  // `julgamento_alternativo` NÃO chama o escritor: a hipótese sob teste é que o
  // texto está adequado e o veredito é que estava errado. Corrigir a prosa aqui
  // mudaria o hash e destruiria justamente o que se quer rejulgar.
  const maxCorrecoes =
    opts?.somenteRevalidacao || opts?.correcaoDirigida?.estrategia === "julgamento_alternativo"
      ? 0
      : (deps.maxCorrecoes ?? 2);

  if (opts?.textoBase && !opts.fichaExistente) {
    throw new ErroEngine({
      codigo: "REESCRITA_SEM_FICHA",
      classe: "tecnica",
      mensagem: `texto-base do capítulo ${capitulo} exige fichaExistente`,
    });
  }
  if (opts?.reescritaDirigida && !opts.textoBase) {
    throw new ErroEngine({
      codigo: "REESCRITA_SEM_TEXTO_BASE",
      classe: "tecnica",
      mensagem: `reescrita dirigida do capítulo ${capitulo} exige textoBase`,
    });
  }

  // Escada de correção: a estratégia da tentativa muda a AÇÃO desta execução.
  const estrategia = opts?.correcaoDirigida?.estrategia;
  /**
   * `julgamento_alternativo`: mesmo texto, juiz diferente. É a única estratégia
   * que troca modelo — a hipótese sob teste é que o veredito, não o texto, está
   * errado. Os pins de prosa/fatos/raciocínio ficam intactos.
   */
  const mapaModelos =
    estrategia === "julgamento_alternativo"
      ? { ...deps.mapa, julgamento: deps.mapa.raciocinio }
      : deps.mapa;

  // Base comum das execuções de papel (ledger completo por chamada).
  const base = {
    gravador: deps.gravador,
    provedor: deps.provedor,
    mapa: mapaModelos,
    jobId: deps.jobId ?? null,
    editionId: deps.editionId ?? null,
  };

  /** Diretiva da tentativa: entra no pacote de quem PLANEJA e de quem ESCREVE. */
  const secCorrecao: SecaoContexto[] = opts?.correcaoDirigida
    ? [
        {
          titulo: `CORREÇÃO DIRIGIDA — tentativa ${opts.correcaoDirigida.tentativa} (estratégia: ${opts.correcaoDirigida.estrategia})`,
          texto: [
            `Hipótese desta tentativa: ${opts.correcaoDirigida.hipotese}`,
            "",
            "A versão anterior deste capítulo foi REPROVADA pelos seguintes bloqueios:",
            ...opts.correcaoDirigida.blockers.map((b) => `- ${b}`),
            "",
            "Ataque a CAUSA nomeada acima. Repetir a mesma solução da tentativa anterior não é aceitável.",
          ].join("\n"),
          fonte: "escada-correcao",
        },
      ]
    : [];

  const compilar = (
    papel: Parameters<typeof compilarPacote>[0]["papel"],
    alvo: string,
    extras: Partial<Parameters<typeof compilarPacote>[0]> = {}
  ) =>
    compilarPacote({
      papel,
      alvo,
      contrato: deps.contrato,
      perfil: deps.perfil,
      instrucoesAutor: deps.instrucoesAutor,
      preferencias: deps.preferencias,
      fundacaoEsperada: deps.fundacaoEsperada,
      ...extras,
    });

  // Seções da fundação (camada 6) por papel: bíblia+mapa+estrutura orientam quem
  // planeja e quem julga; o escritor recebe o mapa e SÓ o item estrutural do
  // capítulo (a bíblia chega a ele destilada pelo contextualizador — anti-inchaço).
  const fundacao = deps.fundacao;
  const secBiblia: SecaoContexto[] = fundacao?.biblia?.trim()
    ? [{ titulo: "BÍBLIA DA OBRA", texto: fundacao.biblia, fonte: "fundacao/biblia-da-obra.md" }]
    : [];
  const secMapa: SecaoContexto[] = fundacao?.mapaPersonagens?.trim()
    ? [{ titulo: "MAPA DE PERSONAGENS", texto: fundacao.mapaPersonagens, fonte: "fundacao/mapa-personagens.json" }]
    : [];
  const secEstruturaLivro: SecaoContexto[] = fundacao?.estrutura?.length
    ? [{
        titulo: "ESTRUTURA DO LIVRO (resumos estruturais)",
        texto: fundacao.estrutura.map((e) => `- Cap ${e.capitulo} [${e.fio}]: ${e.resumo_estrutural}`).join("\n"),
        fonte: "estrutura.json",
      }]
    : [];
  const itemEstrutural = fundacao?.estrutura?.find((e) => e.capitulo === capitulo);
  const secEstruturaCap: SecaoContexto[] = itemEstrutural
    ? [{
        titulo: `ESTRUTURA DO CAPÍTULO ${capitulo}`,
        texto: `Fio: ${itemEstrutural.fio}. ${itemEstrutural.resumo_estrutural}`,
        fonte: "estrutura.json",
      }]
    : [];
  // Recorte do arco para ESTE capítulo (ato, promessas em aberto, fios vivos,
  // marcos). A fundação v2 não tem arco: a seção simplesmente não existe.
  const secArco: SecaoContexto[] = fundacao?.arco
    ? [{
        titulo: `ARCO DO CAPÍTULO ${capitulo}`,
        texto: renderizarArcoParaCapitulo(fundacao.arco, capitulo),
        fonte: "estrutura.json#arco",
      }]
    : [];
  const secoesPlanejamento = [...secBiblia, ...secMapa, ...secEstruturaLivro, ...secArco];
  const secoesJulgamento = [...secBiblia, ...secMapa, ...secArco];

  /** Compilação bloqueada em qualquer etapa → bloqueio registrado + status "bloqueado". */
  const bloquearPorCompilacao = async (
    bloqueios: { codigo: string; detalhe: string }[]
  ): Promise<ResultadoCapitulo> => {
    const detalhe = bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ");
    await deps.gravador.registrarBloqueio(bloqueios[0].codigo, alvoCap, detalhe);
    return { capitulo, status: "bloqueado", gatesFalhos: [], problemas, runs };
  };

  // -------------------------------------------------------------------------
  // 1. FICHA (arquiteto_cena) — ou usa a existente
  // -------------------------------------------------------------------------
  // Versão da ficha derivada do MÁXIMO entre estado canônico e banco: o estado
  // só registra spec_versao quando o escritor conclui, então queda entre gravar
  // a ficha e escrever o capítulo deixaria spec órfã no banco e a retomada
  // colidiria com a unique(project, capítulo, versão) (achados dos canários 6 e 7).
  const estadoParaSpec = await deps.gravador.carregarEstado();
  const versaoConhecida = Math.max(
    estadoParaSpec.doc.capitulos[String(capitulo)]?.spec_versao ?? 0,
    await deps.persistencia.maiorVersaoSpec(deps.projectId, capitulo)
  );
  // Ledger de revelações: o que o LEITOR já sabe. Entra no pacote de quem PLANEJA
  // e de quem JULGA; o gate roda contra o ledger inteiro, mesmo que o pacote tenha
  // degradado para janela.
  const ledger = estadoParaSpec.doc.ledger_revelacoes ?? [];
  const memoriaProsa = estadoParaSpec.doc.memoria_prosa ?? [];
  const ledgerRender = renderizarLedger(ledger, opts?.fichaExistente);
  const secLedger: SecaoContexto[] = [
    {
      titulo: "LEDGER DE REVELAÇÕES (o que o leitor JÁ SABE — não revele de novo)",
      texto: ledgerRender.texto,
      fonte: "engine_state.ledger_revelacoes",
    },
  ];

  // Passado condensado: uma linha por capítulo anterior, das fichas persistidas
  // (leitura em LOTE). Antes, quem planejava e quem contextualizava recebia ZERO
  // capítulo anterior e inventava a continuidade — raiz do diagnóstico.
  const fichasAnteriores = (await deps.persistencia.lerFichasMaisRecentes(deps.projectId))
    .filter((f) => f.capitulo < capitulo)
    .sort((a, b) => a.capitulo - b.capitulo);
  const secPassado: SecaoContexto[] = fichasAnteriores.length
    ? [{
        titulo: "CAPÍTULOS ANTERIORES (fichas condensadas)",
        texto: fichasAnteriores
          .map((f) => resumirFicha(f.capitulo, f.ficha))
          .join("\n"),
        fonte: "engine_scene_specs",
      }]
    : [];
  let specVersao: number;
  let ficha: SceneSpec;
  // `reficha`: a hipótese é que o PLANO é a causa. Descartar a ficha existente é
  // exatamente o que distingue esta estratégia de reescrever a prosa outra vez.
  if (opts?.fichaExistente && estrategia !== "reficha") {
    // Ficha existente já está persistida (o pipeline não re-insere); o estado
    // referencia a última versão conhecida.
    specVersao = Math.max(versaoConhecida, 1);
    ficha = opts.fichaExistente;
  } else {
    specVersao = versaoConhecida + 1;
    const comp = compilar("arquiteto_cena", `spec:${capitulo}`, {
      fatos: [...secoesPlanejamento, ...secLedger, ...secPassado, ...secCorrecao],
    });
    if (!comp.ok) return bloquearPorCompilacao(comp.bloqueios);
    const r = await executarPapel<SceneSpec>({
      ...base,
      papel: "arquiteto_cena",
      alvo: `spec:${capitulo}`,
      pacote: comp.pacote!,
      // Anti-ghostwriting é rígido de propósito; 3 tentativas com erro citando o trecho.
      maxTentativas: 3,
      tarefa: tarefaArquitetoCena(capitulo, deps.contrato.contrato, Boolean(fundacao?.arco)),
      parse: (t) => {
        const spec = extrairJson(t) as SceneSpec;
        // Boilerplate é responsabilidade do código, não do modelo: normaliza
        // schema/capítulo deterministicamente antes de validar o conteúdo.
        if (spec && typeof spec === "object") {
          if (!spec.schema) spec.schema = "scene-spec/v1";
          if (spec.capitulo == null) spec.capitulo = capitulo;
        }
        const v = validarSpec(spec, deps.contrato.contrato);
        if (!v.ok) throw new Error(`ficha inválida: ${v.erros.join("; ")}`);
        // Gate de repetição de revelação, contra o ledger INTEIRO (nunca a janela).
        // A mensagem carrega a entrada anterior LITERAL: executarPapel a reinjeta
        // no prompt do retry (papeis.ts), então o arquiteto não retenta cego mesmo
        // quando a entrada ficou fora da janela do pacote — adendo §1 do autor.
        const gRev = gateRevelacaoRepetida(capitulo, spec, ledger);
        if (!gRev.passou) {
          throw new Error(
            `revelação já entregue ao leitor: ${gRev.evidencia}. ` +
              `Escolha uma informação nova que ainda NÃO esteja no ledger, ou avance a que já existe (aprofunde/complique), sem reapresentá-la como novidade.`
          );
        }
        // Rotação de POV do contrato: declarada no schema desde sempre e nunca
        // aplicada. Roda aqui (planejamento) porque é onde ainda dá para trocar
        // o fio sem jogar prosa fora.
        const gRot = gateRotacaoPov(capitulo, spec, fichasAnteriores, deps.contrato.contrato);
        if (!gRot.passou) {
          throw new Error(
            `rotação de fios violada: ${gRot.evidencia}. ` +
              `Reveja "fios_avancados"/"fios_ausentes": alterne o fio ou retome o que está parado.`
          );
        }
        // Ficha × grade de arco: `ato`, `tensao_alvo`, `promessas_tocadas` e
        // `marcos_arco` eram pedidos ao modelo e nunca conferidos contra o plano.
        const gArco = gateFichaContraArco(capitulo, spec, fundacao?.arco);
        if (!gArco.passou) {
          throw new Error(
            `ficha contradiz a grade de arco: ${gArco.evidencia}. ` +
              `Use a seção ARCO DO CAPÍTULO como fonte: ela diz a que ato o capítulo pertence, qual a tensão-alvo, que promessas ele toca e que marcos caem aqui.`
          );
        }
        return spec;
      },
    });
    runs.push(r.runId);
    ficha = r.valor;
    await deps.persistencia.inserirSpec({
      project_id: deps.projectId,
      edition_id: deps.editionId ?? null,
      capitulo,
      versao: specVersao,
      hash: hashJsonCanonico(ficha),
      status: "validada",
      ficha,
      origem_run_id: r.runId,
    });
  }
  const specHash = hashJsonCanonico(ficha);

  // -------------------------------------------------------------------------
  // 2. CONTEXTO (contextualizador) — fatos e continuidade, nunca prosa
  // -------------------------------------------------------------------------
  const compCtx = compilar("contextualizador", alvoCap, {
    ficha,
    fatos: [...secoesPlanejamento, ...secLedger, ...secPassado],
  });
  if (!compCtx.ok) return bloquearPorCompilacao(compCtx.bloqueios);
  const rCtx = await executarPapel<SaidaContextualizador>({
    ...base,
    papel: "contextualizador",
    alvo: alvoCap,
    pacote: compCtx.pacote!,
    tarefa: tarefaContextualizador(capitulo),
    parse: (t) => validarSaidaContextualizador(extrairJson(t)),
  });
  runs.push(rCtx.runId);
  const ctx = rCtx.valor;

  const fatos: SecaoContexto[] = [];
  if (ctx.fatos.length) {
    fatos.push({
      titulo: "FATOS ESTABELECIDOS",
      texto: ctx.fatos.map((f) => `- ${f.fato} (origem: ${f.origem})`).join("\n"),
      fonte: "contextualizador",
    });
  }
  if (ctx.continuidade.length) {
    fatos.push({
      titulo: "CONTINUIDADE ABERTA",
      texto: ctx.continuidade.map((c) => `- ${c.item} (origem: ${c.origem})`).join("\n"),
      fonte: "contextualizador",
    });
  }
  // Camada acumulativa: os textos anteriores chegam completos, mas só sinais
  // que atravessaram cinco capítulos entram como prevenção. Sem calibração
  // humana são sinais para escritor/revisor, nunca bloqueio automático.
  const sinaisManeirismoAnteriores = medirManeirismosDoLivro(
    (opts?.anteriores ?? []).map((a) => ({ numero: a.numero, texto: a.trecho }))
  )
    .map((sinal) => {
      const decisao = decidirManeirismo(sinal, { excecoesDoAutor: [] });
      return decisao.acao === "sinalizar"
        ? `MANEIRISMO ACUMULADO [${sinal.padrao}]: ${decisao.motivo}; exemplos: ` +
            sinal.ocorrencias.slice(0, 2).map((o) => `cap ${o.capitulo}: "${o.trecho}"`).join(" · ")
        : null;
    })
    .filter((sinal): sinal is string => sinal !== null);
  const repeticoesRecentes = [...ctx.repeticoes_recentes, ...sinaisManeirismoAnteriores];

  // -------------------------------------------------------------------------
  // 3. ESCRITA (escritor) — o PIPELINE grava o arquivo, nunca o modelo
  // -------------------------------------------------------------------------
  const compEsc = compilar("escritor", alvoCap, {
    oficio: deps.oficio,
    ficha,
    fatos: [...secMapa, ...secEstruturaCap, ...fatos, ...secCorrecao],
    trechosAnteriores: opts?.trechosAnteriores,
    repeticoesRecentes,
  });
  if (!compEsc.ok) return bloquearPorCompilacao(compEsc.bloqueios);
  const pacoteEscritor = compEsc.pacote!;

  // Texto-base (revalidação/reescrita dirigida) pula a escrita inicial;
  // no fluxo normal, o escritor produz a prosa inicial.
  let texto: string;
  if (opts?.textoBase) {
    texto = opts.textoBase;
  } else {
    const rEsc = await executarPapel<string>({
      ...base,
      papel: "escritor",
      alvo: alvoCap,
      pacote: pacoteEscritor,
      tarefa: tarefaEscritor(ficha, deps.contrato.contrato, deps.idioma),
      parse: parseProsa,
    });
    runs.push(rEsc.runId);
    texto = rEsc.valor;
  }

  const gravarERegistrar = async (t: string): Promise<void> => {
    gravarAtomico(caminho, t);
    await deps.gravador.registrarCapituloEscrito(capitulo, caminho, {
      palavras: contarPalavras(t),
      spec_versao: specVersao,
      spec_hash: specHash,
    });
  };

  // -------------------------------------------------------------------------
  // 4. GATES UNIVERSAIS — com UMA rodada de correção dirigida por passagem
  // -------------------------------------------------------------------------
  const acharRepeticoesSemanticas = () =>
    revelacoesDaFicha(ficha).flatMap((novoEnunciado) =>
      detectarRepeticaoSemantica({
        capitulo,
        novoEnunciado,
        trechoAtual: localizarTrechoSemantico(texto, novoEnunciado),
        ledger,
        memoria: memoriaProsa,
      })
    );

  const rodarGates = (): ResultadoGate[] => {
    const resultados = rodarGatesCapitulo({
      texto,
      contrato: deps.contrato.contrato,
      ficha,
      anteriores: opts?.anteriores,
    });
    const repeticoesSemanticas = acharRepeticoesSemanticas().filter(repeticaoSemanticaBloqueia);
    resultados.push({
      gate: "repeticao_semantica",
      passou: repeticoesSemanticas.length === 0,
      evidencia: repeticoesSemanticas.length
        ? repeticoesSemanticas.slice(0, 3).map((a) =>
            `cap ${a.capituloAnterior} (${Math.round(a.similaridade * 100)}%): ` +
            `"${a.trechoAtual}" repete "${a.trechoAnterior}"`
          ).join(" · ")
        : undefined,
    });
    return resultados.filter((g) => !g.passou);
  };

  const corrigirComEscritor = async (
    correcoes: { local: string; problema: string; instrucao: string }[],
    modo: ModoCorrecao = "cirurgico"
  ): Promise<void> => {
    const r = await executarPapel<string>({
      ...base,
      papel: "escritor",
      alvo: alvoCap,
      pacote: pacoteEscritor,
      tarefa: tarefaEscritorCorrecao(capitulo, correcoes, texto, modo),
      parse: parseProsa,
      payload: { modo_correcao: modo }, // auditável no ledger (a UI mostra o modo por tentativa)
    });
    runs.push(r.runId);
    texto = r.valor;
    await gravarERegistrar(texto);
  };

  /** Garante gates verdes (1 correção dirigida se falhar); retorna os que sobraram. */
  const garantirGates = async (): Promise<ResultadoGate[]> => {
    let falhos = rodarGates();
    if (falhos.length === 0) return [];
    // Rejulgamento não toca no texto — nem para consertar gate. Devolve os gates
    // falhos como estão: o objetivo é saber se ESTE hash passa com outro juiz.
    if (maxCorrecoes === 0) return falhos;
    await corrigirComEscritor(
      falhos.map((g) => ({ local: g.gate, problema: g.evidencia ?? g.gate, instrucao: "elimine a causa" }))
    );
    falhos = rodarGates();
    return falhos;
  };

  const bloquearPorGates = async (falhos: ResultadoGate[]): Promise<ResultadoCapitulo> => {
    const evidencias = falhos.map((g) => `${g.gate}: ${g.evidencia ?? "sem evidência"}`).join(" · ");
    await deps.gravador.registrarBloqueio("GATE_" + falhos[0].gate, alvoCap, evidencias);
    return { capitulo, status: "bloqueado", textHash: hashText(texto), gatesFalhos: falhos, problemas, runs };
  };

  // Em reescrita dirigida, a PRIMEIRA ação é a correção do avaliador em modo reescrita
  // (sobre o texto-base); nos demais fluxos (inclusive revalidação por texto-base),
  // grava/registra o texto e segue — a decisão é SEMPRE deste loop.
  if (opts?.reescritaDirigida) {
    await corrigirComEscritor(opts.reescritaDirigida.correcoes, "reescrita");
  } else {
    await gravarERegistrar(texto);
  }

  let gatesFalhos = await garantirGates();
  if (gatesFalhos.length) return bloquearPorGates(gatesFalhos);

  // -------------------------------------------------------------------------
  // 5–7. SINAIS + REVISÃO + AUDITORIA + DECISÃO (loop de correção dirigida)
  // -------------------------------------------------------------------------
  let correcoesFeitas = 0;
  // Anti-loop por SALDO: total ponderado de violações (revisor + auditor) entre
  // rodadas, com tolerância de 1 rodada em platô — exigir queda estrita por
  // contagem matava capítulos recuperáveis (9→9 = fim, mesmo com orçamento).
  let saldoAnterior: number | null = null;
  let rodadasSemMelhora = 0;
  const docsFactuais = deps.docsFactuais ?? [];

  for (;;) {
    // O relatório e a decisão refletem apenas ESTE hash. Problemas de uma
    // versão já reescrita ficam no ledger de runs, não contaminam a rodada nova.
    problemas.length = 0;
    // 5. Sinais medidos + parecer do revisor literário
    const sinais = medirSinais(texto, deps.contrato.contrato);
    const sinaisManeirismoAtuais = medirManeirismosDoLivro([
      ...(opts?.anteriores ?? []).map((a) => ({ numero: a.numero, texto: a.trecho })),
      { numero: capitulo, texto },
    ])
      .map((sinal) => {
        const decisao = decidirManeirismo(sinal, { excecoesDoAutor: [] });
        return decisao.acao === "sinalizar"
          ? `MANEIRISMO ACUMULADO [${sinal.padrao}]: ${decisao.motivo}; exemplos: ` +
              sinal.ocorrencias.slice(0, 3).map((o) => `cap ${o.capitulo}: "${o.trecho}"`).join(" · ")
          : null;
      })
      .filter((sinal): sinal is string => sinal !== null);
    const sinaisSemanticosNaoBloqueantes = acharRepeticoesSemanticas()
      .filter((achado) => !repeticaoSemanticaBloqueia(achado))
      .map((achado) =>
        `REPETIÇÃO SEMÂNTICA A JULGAR: cap ${achado.capituloAnterior}, ` +
        `"${achado.enunciadoAtual}" versus "${achado.enunciadoAnterior}" (evidência incompleta)`
      );
    const repeticoesParaJulgamento = [
      ...repeticoesRecentes,
      ...sinaisManeirismoAtuais,
      ...sinaisSemanticosNaoBloqueantes,
    ];
    const secaoTexto: SecaoContexto = { titulo: "TEXTO A AVALIAR", texto, fonte: "manuscrito" };

    const compRev = compilar("revisor_literario", alvoCap, {
      oficio: deps.oficio,
      ficha,
      fatos: [...secoesJulgamento, ...secLedger, ...docsFactuais, ...fatos, secaoTexto],
      repeticoesRecentes: repeticoesParaJulgamento,
    });
    if (!compRev.ok) return bloquearPorCompilacao(compRev.bloqueios);
    const rRev = await executarPapel<Parecer>({
      ...base,
      papel: "revisor_literario",
      alvo: alvoCap,
      pacote: compRev.pacote!,
      tarefa: tarefaRevisor(capitulo, resumoSinais(sinais), deps.contrato.contrato),
      // Parecer que omite disposição de sinal fora da cota = protocolo violado →
      // retry técnico do REVISOR (com o sinal nomeado), não reprova do capítulo.
      // Normaliza a ESCRITA antes de julgar: valor escrito como texto e rotulo
      // superfluo de "dentro da cota" custavam um retry inteiro do revisor —
      // ~22 mil tokens para reescrever um parecer cujo conteudo ja estava certo.
      // Nenhuma regua muda aqui: a validacao recebe o mesmo julgamento.
      // normalizar (escrita) -> validar (schema) -> conferir (medicao) -> HIDRATAR.
      // A hidratacao e a ultima porque so grava o que ja passou: resolve o
      // {indice} do modelo para {indice, trecho} usando ESTE array de medicao,
      // antes de o parecer seguir para engine_reviews e para a correcao dirigida.
      parse: (t) =>
        hidratarOcorrenciasCitadas(
          exigirDisposicaoCompleta(validarParecer(normalizarParecerBruto(extrairJson(t), sinais)), sinais),
          sinais
        ),
    });
    runs.push(rRev.runId);
    const parecer = rRev.valor;
    const conferenciaTriagem = conferirParecer(parecer, sinais);
    let conferenciaFinal = conferenciaTriagem;
    let verdictEfetivo = conferenciaTriagem.verdictEfetivo;

    // 5b. CASCATA DE JULGAMENTO. A triagem (modelo barato) ja opinou; a decisao
    // (modelo caro) e chamada so quando ha o que decidir, e julga nos DOIS
    // sentidos: derruba confirmacao que e falso positivo E acrescenta violacao
    // que a triagem nao viu. So derrubar faria disto uma maquina de leniencia.
    //
    // O veredito continua tendo UM dono: `verdictEfetivo`, aqui. O delta ajusta
    // os sinais e SUGERE veredito; os gates universais logo abaixo (contradicao,
    // POV, conhecimento indevido, idioma) reprovam depois e por cima — sugestao
    // de "aprovado" nao sobrevive a uma contradicao comprovada.
    const escalada = precisaEscalar(parecer, sinais, {
      vaiFechar: verdictEfetivo === "aprovado" || verdictEfetivo === "aprovado_com_excecao",
    });
    let parecerFinal = parecer;
    if (escalada.escalar) {
      const compDec = compilar("revisor_decisao", alvoCap, { ficha, fatos: [...secoesJulgamento, secaoTexto] });
      if (!compDec.ok) return bloquearPorCompilacao(compDec.bloqueios);
      const rDec = await executarPapel<DeltaDecisao>({
        ...base,
        papel: "revisor_decisao",
        alvo: alvoCap,
        pacote: compDec.pacote!,
        tarefa: tarefaDecisaoCascata(capitulo, resumoSinais(sinais), parecer, escalada.motivo),
        parse: (t) => validarDelta(extrairJson(t), sinais),
        payload: { passada: "decisao", gatilho: escalada.motivo },
      });
      runs.push(rDec.runId);
      // O consolidado volta pela MESMA validacao da triagem: nao existe segundo
      // caminho de validacao, e o delta nao escapa de nenhuma regra.
      parecerFinal = hidratarOcorrenciasCitadas(
        exigirDisposicaoCompleta(validarParecer(aplicarDelta(parecer, rDec.valor, sinais)), sinais),
        sinais
      );
      const conf2 = conferirParecer(parecerFinal, sinais);
      conferenciaFinal = conf2;
      verdictEfetivo = conf2.verdictEfetivo;
    }
    problemas.push(...conferenciaFinal.problemas);

    // Defesa final: o caminho de produção nunca devolve uma decisão editorial
    // ao usuário. A cascata deveria ter adjudicado acima; se um parecer legado
    // ainda escapar, ele reprova automaticamente e segue para correção.
    if (verdictEfetivo === "necessita_decisao_humana") {
      verdictEfetivo = "reprovado";
      problemas.push("pedido de decisão humana convertido em reprovação automática para correção");
    }


    // 6. Auditoria factual — contradição comprovada é GATE universal
    const compAud = compilar("auditor_factual", alvoCap, { ficha, fatos: [...secoesJulgamento, ...docsFactuais, ...fatos, secaoTexto] });
    if (!compAud.ok) return bloquearPorCompilacao(compAud.bloqueios);
    const rAud = await executarPapel<SaidaAuditor>({
      ...base,
      papel: "auditor_factual",
      alvo: alvoCap,
      pacote: compAud.pacote!,
      tarefa: tarefaAuditorFactual(capitulo),
      parse: (t) => validarSaidaAuditor(extrairJson(t)),
    });
    runs.push(rAud.runId);
    const auditoria = rAud.valor;
    const contradicoesBloqueantes = auditoria.contradicoes.filter((c) => c.gravidade === "bloqueante");
    const povViolado = auditoria.pov_violado.ha;
    if (contradicoesBloqueantes.length > 0 || auditoria.conhecimento_indevido.length > 0 || povViolado) {
      verdictEfetivo = "reprovado";
      for (const c of contradicoesBloqueantes) {
        problemas.push(`contradição factual comprovada: ${c.fato_estabelecido} vs "${c.trecho_do_capitulo}"`);
      }
      for (const k of auditoria.conhecimento_indevido) {
        problemas.push(`conhecimento indevido: ${k.quem} sabe "${k.sabe_o_que_nao_deveria}" (${k.trecho})`);
      }
      if (povViolado) {
        problemas.push(`POV violado: ${auditoria.pov_violado.detalhe}`);
      }
    }

    // 6b. CONFORMIDADE FICHA → PROSA (fatia G). A engine julgava se o capítulo
    // estava BEM ESCRITO e se era coerente, nunca se ENTREGOU o que a ficha
    // planejou. Um capítulo competente que não cumpre a virada passava.
    const sinaisConf = medirConformidade(ficha, texto);
    const compConf = compilar("conformidade_ficha", alvoCap, { ficha, fatos: [secaoTexto] });
    if (!compConf.ok) return bloquearPorCompilacao(compConf.bloqueios);
    const rConf = await executarPapel<ParecerConformidade>({
      ...base,
      papel: "conformidade_ficha",
      alvo: alvoCap,
      pacote: compConf.pacote!,
      tarefa: tarefaConformidade(capitulo, ficha, resumoConformidade(sinaisConf)),
      parse: (t) => validarParecerConformidade(extrairJson(t)),
    });
    runs.push(rConf.runId);
    const conformidade = conferirConformidade(rConf.valor, ficha, texto);
    if (!conformidade.conforme) {
      verdictEfetivo = "reprovado";
      for (const p of conformidade.problemas) {
        problemas.push(`conformidade [${p.item}] ${p.motivo}: ${p.detalhe}`);
      }
    }

    // 6c. IDIOMA E VARIANTE (fatia J). O detector é sinal; este papel julga —
    // ele separa narração de diálogo intencional, citação e personagem
    // estrangeiro, que nenhum detector de marcadores sabe distinguir.
    const sinalIdioma = medirIdioma(texto, deps.idioma ?? "pt-BR");
    if (sinalIdioma.divergentesNarracao.length || sinalIdioma.divergentesDialogo.length) {
      const compIdi = compilar("julgamento_idioma", alvoCap, { fatos: [secaoTexto] });
      if (!compIdi.ok) return bloquearPorCompilacao(compIdi.bloqueios);
      const rIdi = await executarPapel<ParecerIdioma>({
        ...base,
        papel: "julgamento_idioma",
        alvo: alvoCap,
        pacote: compIdi.pacote!,
        tarefa: tarefaIdioma(capitulo, deps.idioma ?? "pt-BR", resumoIdioma(sinalIdioma)),
        parse: (t) => validarParecerIdioma(extrairJson(t)),
      });
      runs.push(rIdi.runId);
      const vIdioma = decidirIdioma(sinalIdioma, rIdi.valor);
      if (!vIdioma.passou) {
        verdictEfetivo = "reprovado";
        problemas.push(`idioma: ${vIdioma.motivo} — ${vIdioma.evidencia}`);
      }
    }

    // 7. Decisão
    const textHash = hashText(texto);

    if (verdictEfetivo === "aprovado" || verdictEfetivo === "aprovado_com_excecao") {
      const reviewId = await deps.persistencia.inserirReview({
        project_id: deps.projectId,
        edition_id: deps.editionId ?? null,
        capitulo,
        text_hash: textHash,
        verdict: verdictEfetivo,
        run_id: rRev.runId,
        parecer: parecerFinal,
      });
      await deps.gravador.aprovarCapitulo(
        capitulo,
        { id: reviewId, text_hash: textHash, verdict: verdictEfetivo, parecer: parecerFinal },
        caminho,
        entradasDaFicha(capitulo, ficha)
      );

      // MEMÓRIA DERIVADA DA PROSA (fatia H). Roda DEPOIS da aprovação, sobre o
      // texto que ficou. O ledger de revelações vem da FICHA — o plano; isto vem
      // da PÁGINA. Uma pista plantada de improviso só existe para a engine aqui.
      // Falha do extrator NUNCA desfaz a aprovação: o capítulo está aprovado e
      // hash-bound; a memória é registrada como incompleta e o fechamento avisa.
      try {
        const compMem = compilar("extrator_memoria", alvoCap, { ficha, fatos: [secaoTexto] });
        if (compMem.ok) {
          const rMem = await executarPapel<ExtracaoProsa>({
            ...base,
            papel: "extrator_memoria",
            alvo: alvoCap,
            pacote: compMem.pacote!,
            tarefa: tarefaExtratorMemoria(capitulo, ficha),
            parse: (t) => validarExtracaoProsa(extrairJson(t)),
          });
          runs.push(rMem.runId);
          const derivada = derivarMemoriaDaProsa({
            capitulo,
            texto,
            ficha,
            extracao: rMem.valor,
            em: new Date().toISOString(),
          });
          await deps.gravador.registrarMemoriaDaProsa(capitulo, derivada.entradas, derivada.conflitos);
          for (const c of derivada.conflitos) {
            problemas.push(`divergência ficha × prosa em "${c.campo}": ficha "${c.valorFicha}" vs página "${c.valorProsa}"`);
          }
        }
      } catch (e) {
        problemas.push(
          `memória da prosa não extraída no capítulo ${capitulo} (${e instanceof Error ? e.message.slice(0, 120) : String(e)})`
        );
        await deps.gravador.registrarMemoriaIncompleta(capitulo);
      }

      return { capitulo, status: verdictEfetivo, textHash, reviewId, gatesFalhos: [], problemas, runs };
    }

    // Reprovado: correção dirigida se há instruções, orçamento e convergência.
    // O saldo pondera TODAS as fontes de reprovação (violações do revisor +
    // contradições bloqueantes e conhecimento indevido do auditor).
    const violacoes = parecerFinal.sinais.filter(
      (s) => s.disposicao === "violacao_confirmada" || conferenciaFinal.rebaixados.includes(s.sinal)
    ).length;
    const saldo =
      violacoes + 2 * contradicoesBloqueantes.length + auditoria.conhecimento_indevido.length + (povViolado ? 2 : 0) + 2 * conformidade.problemas.length;
    if (saldoAnterior !== null && saldo >= saldoAnterior) rodadasSemMelhora++;
    else rodadasSemMelhora = 0;
    const semConvergencia = rodadasSemMelhora >= 2; // duas rodadas sem melhora líquida = parar

    // Achados do AUDITOR viram correções para o escritor (antes, um capítulo com
    // contradição trivialmente corrigível morria sem UMA tentativa quando o
    // revisor não listava correções — caso do canário dan-brown).
    const correcoesAuditor = [
      ...contradicoesBloqueantes.map((c) => ({
        local: `trecho: "${c.trecho_do_capitulo.slice(0, 160)}"`,
        problema: `contradição factual: viola o fato estabelecido "${c.fato_estabelecido}"`,
        instrucao: "corrija o trecho para respeitar o fato estabelecido, preservando a cena e a voz",
      })),
      ...auditoria.conhecimento_indevido.map((k) => ({
        local: `trecho: "${k.trecho.slice(0, 160)}"`,
        problema: `conhecimento indevido: ${k.quem} não pode saber "${k.sabe_o_que_nao_deveria}"`,
        instrucao: "reescreva o trecho para que a informação não seja revelada por quem não a tem",
      })),
      ...(povViolado
        ? [
            {
              local: "capítulo inteiro",
              problema: `POV violado: ${auditoria.pov_violado.detalhe}`,
              instrucao: `reescreva os trechos indicados para respeitar o POV do contrato (${deps.contrato.contrato.pov.pessoa}), sem acesso a percepções ou pensamentos fora do ponto de vista vigente`,
            },
          ]
        : []),
    ];

    // Violação difusa (ex.: cadência/cota estourada no capítulo inteiro) não se
    // resolve com lista cirúrgica: cada violação confirmada vira também uma
    // instrução global com a cota-alvo do contrato E os trechos que o detector
    // flagrou — o escritor precisa saber QUAIS frases contam (achados do canário
    // hoover).
    const globais = parecerFinal.sinais
      .filter((s) => s.disposicao === "violacao_confirmada" || conferenciaFinal.rebaixados.includes(s.sinal))
      .map((s) => {
        const medido = acharSinalMedido(s.sinal, sinais);
        const cota = medido?.cota;
        const alvo = cota?.max != null ? `no máximo ${cota.max}` : cota?.min != null ? `no mínimo ${cota.min}` : "dentro da cota do contrato";
        // O escritor corrige as ocorrências que o REVISOR confirmou (citadas uma a
        // uma — adendo 2); os trechos do detector são só fallback informativo.
        const citadas = s.ocorrencias_citadas?.length
          ? ` Ocorrências confirmadas pelo revisor: ${s.ocorrencias_citadas.map((o) => JSON.stringify(o.trecho)).join(" · ")}`
          : medido?.exemplos?.length
            ? ` Trechos flagrados pelo detector: ${medido.exemplos.slice(0, 3).map((e) => JSON.stringify(e)).join(" · ")}`
            : "";
        const quantas = s.ocorrencias_citadas?.length ?? null;
        return {
          local: "capítulo inteiro",
          problema: `${s.sinal} = ${s.valor}${quantas != null ? ` (${quantas} confirmadas pelo revisor)` : ""} (alvo: ${alvo}).${citadas}`,
          instrucao: `corrija as ocorrências confirmadas de ${s.sinal} — funda fragmentos em frases completas e corte reformulações, preservando conteúdo e voz`,
        };
      });

    const correcoesDoParecer = parecerFinal.correcoes;
    // Sem instrução específica, a reprovação sobe intacta para a escada externa
    // de cinco estratégias. Inventar aqui uma "reescrita genérica" consumiria o
    // micro-orçamento e esconderia o diagnóstico do controlador/ledger.
    const todasCorrecoes = [...correcoesDoParecer, ...correcoesAuditor, ...globais];
    if (todasCorrecoes.length > 0 && correcoesFeitas < maxCorrecoes && !semConvergencia) {
      saldoAnterior = saldo;
      correcoesFeitas++;
      // Instrução global presente = meta difusa: modo REESCRITA ORIENTADA (preserva
      // eventos/fatos/diálogo/estrutura, reescreve a superfície). Sem meta global,
      // modo cirúrgico. A escolha é do pipeline, nunca do modelo — e a estratégia
      // da escada (`reescrita_orientada`/`reescrita_integral`) força o modo amplo.
      const modo: ModoCorrecao =
        globais.length > 0 || estrategia === "reescrita_orientada" || estrategia === "reescrita_integral"
          ? "reescrita"
          : "cirurgico";
      await corrigirComEscritor(todasCorrecoes, modo);
      problemas.length = 0;
      gatesFalhos = await garantirGates();
      if (gatesFalhos.length) return bloquearPorGates(gatesFalhos);
      continue; // re-roda sinais + revisor + auditor no texto corrigido
    }

    const reviewId = await deps.persistencia.inserirReview({
      project_id: deps.projectId,
      edition_id: deps.editionId ?? null,
      capitulo,
      text_hash: textHash,
      verdict: "reprovado",
      run_id: rRev.runId,
      parecer: parecerFinal,
    });
    await deps.gravador.registrarBloqueio(
      "QUALIDADE_REPROVADA",
      alvoCap,
      problemas.length ? problemas.join(" · ") : `parecer reprovado após ${correcoesFeitas} correção(ões)`
    );
    return { capitulo, status: "reprovado", textHash, reviewId, gatesFalhos: [], problemas, runs };
  }
}
