// Engine V2 — meta-nota (avaliação de livro completo), portada da V1 para a V2.
// Consolida o manuscrito, avalia o livro no papel revisor_literario (alvo "livro") e,
// enquanto a nota fica abaixo da meta, dispara reescrita DIRIGIDA dos capítulos apontados
// (o mesmo miolo de gates/sinais/revisor/auditor do pipeline, via escreverCapitulo).
// Deps injetadas → testável com DiscoPersistencia + ProvedorMock. Nenhum modelo toca disco.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import { compilarPacote, type SecaoContexto } from "./compilador.js";
import type { Gravador } from "./gravador.js";
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { tarefaAvaliadorLivro } from "./tarefas.js";
import { ErroEngine, type ContratoCompilado, type MapaModelos, type Parecer } from "./tipos.js";

// Acima disso, o manuscrito é avaliado em blocos de capítulos e as avaliações são agregadas.
const LIMITE_PALAVRAS_BLOCO = 40000;
// Capítulos reescritos por iteração (os N piores apontados pelo avaliador).
const N_REESCRITA = 4;

export interface DepsMeta9 {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  dirProjeto: string;
  dirManuscrito: string;
  projectId: string;
  editionId?: string | null;
  jobId?: string | null;
  meta?: number;
  maxIteracoes?: number;
  docsFactuais?: SecaoContexto[];
  /** Callback opcional para o worker refletir a etapa no progresso do job (não usado nos testes). */
  reportarEtapa?: (etapa: string, dados?: Record<string, unknown>) => Promise<void>;
}

export interface ResultadoMeta9 {
  atingiu: boolean;
  nota: number;
  iteracoes: number;
  relatorioPath?: string;
}

export interface AvaliacaoLivro {
  schema: "avaliacao-livro/v1";
  nota: number;
  pontos_fortes: string[];
  pontos_fracos: string[];
  capitulos_a_reescrever: { capitulo: number; problemas: string[]; instrucoes: string[] }[];
  resumo: string;
}

// ---------------------------------------------------------------------------
// Utilitários puros
// ---------------------------------------------------------------------------

function contarPalavras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

function nomeCapitulo(n: number): string {
  return `capitulo-${String(n).padStart(2, "0")}.md`;
}

/** Extrai JSON da resposta do modelo (aceita cerca ```json ... ```). Lança se inválido. */
function extrairJson(texto: string): unknown {
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : texto).trim());
}

function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, conteudo, "utf8");
  renameSync(tmp, caminho);
}

/** Lê os capítulos 1..total do disco (na ordem). Lança se algum arquivo faltar. */
function lerCapitulos(dirManuscrito: string, total: number): { numero: number; texto: string; palavras: number }[] {
  const out: { numero: number; texto: string; palavras: number }[] = [];
  for (let n = 1; n <= total; n++) {
    const caminho = path.join(dirManuscrito, nomeCapitulo(n));
    if (!existsSync(caminho)) {
      throw new ErroEngine({
        codigo: "GATE_ARTEFATO_AUSENTE",
        classe: "qualidade",
        mensagem: `consolidação: ${nomeCapitulo(n)} ausente no disco`,
        detalhe: { capitulo: n, caminho },
      });
    }
    const texto = readFileSync(caminho, "utf8");
    out.push({ numero: n, texto, palavras: contarPalavras(texto) });
  }
  return out;
}

/**
 * Concatena capitulo-NN.md (1..total, na ordem) em <dirProjeto>/MANUSCRITO-MESTRE.md,
 * de forma determinística e atômica. Retorna caminho, hash e contagem de palavras.
 */
export function consolidarManuscrito(
  dirManuscrito: string,
  dirProjeto: string,
  total: number
): { caminho: string; hash: string; palavras: number } {
  const capitulos = lerCapitulos(dirManuscrito, total);
  const conteudo = capitulos.map((c) => c.texto.trim()).join("\n\n") + "\n";
  const caminho = path.join(dirProjeto, "MANUSCRITO-MESTRE.md");
  gravarAtomico(caminho, conteudo);
  return { caminho, hash: hashText(conteudo), palavras: contarPalavras(conteudo) };
}

/** Validação estrita do JSON do avaliador de livro (schema "avaliacao-livro/v1"). */
export function validarAvaliacaoLivro(obj: unknown): AvaliacaoLivro {
  if (typeof obj !== "object" || obj === null) throw new Error("avaliação não é objeto");
  const o = obj as Record<string, unknown>;
  if (o.schema !== "avaliacao-livro/v1") throw new Error(`schema inválido: ${String(o.schema)}`);
  if (typeof o.nota !== "number" || o.nota < 0 || o.nota > 10) throw new Error(`nota inválida: ${String(o.nota)}`);
  const listaStr = (v: unknown, campo: string): string[] => {
    if (!Array.isArray(v)) throw new Error(`${campo} deve ser lista`);
    return v.map((x, i) => {
      if (typeof x !== "string") throw new Error(`${campo}[${i}] deve ser string`);
      return x;
    });
  };
  const pontos_fortes = listaStr(o.pontos_fortes, "pontos_fortes");
  const pontos_fracos = listaStr(o.pontos_fracos, "pontos_fracos");
  if (typeof o.resumo !== "string") throw new Error("resumo deve ser string");
  if (!Array.isArray(o.capitulos_a_reescrever)) throw new Error("capitulos_a_reescrever deve ser lista");
  const capitulos_a_reescrever = (o.capitulos_a_reescrever as unknown[]).map((c, i) => {
    const x = c as Record<string, unknown>;
    if (typeof x?.capitulo !== "number" || !Number.isInteger(x.capitulo) || x.capitulo < 1) {
      throw new Error(`capitulos_a_reescrever[${i}].capitulo inválido`);
    }
    return {
      capitulo: x.capitulo,
      problemas: listaStr(x.problemas, `capitulos_a_reescrever[${i}].problemas`),
      instrucoes: listaStr(x.instrucoes, `capitulos_a_reescrever[${i}].instrucoes`),
    };
  });
  return { schema: "avaliacao-livro/v1", nota: o.nota, pontos_fortes, pontos_fracos, capitulos_a_reescrever, resumo: o.resumo };
}

/** Parecer/v1 mínimo derivado da avaliação de livro (6 eixos com a nota escalada 0–5 = nota/2). */
function pareceDeAvaliacao(av: AvaliacaoLivro, meta: number): Parecer {
  const notaEixo = Math.max(0, Math.min(5, Math.round((av.nota / 2) * 10) / 10));
  const primeiroForte = av.pontos_fortes[0] ?? av.resumo ?? "avaliação de livro";
  const eixo = (ev: string) => ({ nota: notaEixo, evidencia: ev || primeiroForte });
  const evidencias = (av.pontos_fortes.length ? av.pontos_fortes : [av.resumo || primeiroForte])
    .slice(0, 3)
    .map((p) => ({ local: "livro", trecho: p, observacao: "ponto forte identificado na avaliação" }));
  const correcoes = av.capitulos_a_reescrever.flatMap((c) =>
    c.problemas.map((p, i) => ({
      local: `capítulo ${c.capitulo}`,
      problema: p,
      instrucao: c.instrucoes[i] ?? c.instrucoes[0] ?? "reescreva conforme o problema apontado",
    }))
  );
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo(av.pontos_fortes[0] ?? av.resumo),
    skill_adherence: eixo(av.pontos_fortes[1] ?? primeiroForte),
    clarity: eixo(av.pontos_fortes[2] ?? primeiroForte),
    emotional_effect: eixo(primeiroForte),
    continuity: eixo(primeiroForte),
    hook_effectiveness: eixo(primeiroForte),
    verdict: av.nota >= meta ? "aprovado" : "reprovado",
    evidencias,
    sinais: [],
    correcoes,
  };
}

function selecionarPiores(
  caps: AvaliacaoLivro["capitulos_a_reescrever"],
  n: number
): AvaliacaoLivro["capitulos_a_reescrever"] {
  return [...caps].sort((a, b) => b.problemas.length - a.problemas.length).slice(0, n);
}

// ---------------------------------------------------------------------------
// Avaliação (com fatiamento em blocos para manuscritos longos)
// ---------------------------------------------------------------------------

async function avaliarBloco(
  deps: DepsMeta9,
  meta: number,
  textoManuscrito: string,
  rotulo: string
): Promise<{ av: AvaliacaoLivro; runId: string }> {
  const comp = compilarPacote({
    papel: "revisor_literario",
    alvo: "livro",
    contrato: deps.contrato,
    perfil: deps.perfil,
    fatos: [{ titulo: `MANUSCRITO (${rotulo})`, texto: textoManuscrito, fonte: "manuscrito" }, ...(deps.docsFactuais ?? [])],
  });
  if (!comp.ok) {
    throw new ErroEngine({
      codigo: "AVALIACAO_PACOTE_BLOQUEADO",
      classe: "qualidade",
      mensagem: `avaliação de livro bloqueada na compilação: ${comp.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  const r = await executarPapel<AvaliacaoLivro>({
    gravador: deps.gravador,
    provedor: deps.provedor,
    mapa: deps.mapa,
    jobId: deps.jobId ?? null,
    editionId: deps.editionId ?? null,
    papel: "revisor_literario",
    alvo: "livro",
    pacote: comp.pacote!,
    tarefa: tarefaAvaliadorLivro(meta, deps.contrato.contrato),
    parse: (t) => validarAvaliacaoLivro(extrairJson(t)),
  });
  return { av: r.valor, runId: r.runId };
}

/** Fatia os capítulos em blocos cujo total de palavras fica abaixo do limite. */
function agruparEmBlocos(
  capitulos: { numero: number; texto: string; palavras: number }[],
  limite: number
): { numero: number; texto: string; palavras: number }[][] {
  const blocos: { numero: number; texto: string; palavras: number }[][] = [];
  let atual: { numero: number; texto: string; palavras: number }[] = [];
  let soma = 0;
  for (const cap of capitulos) {
    if (atual.length > 0 && soma + cap.palavras > limite) {
      blocos.push(atual);
      atual = [];
      soma = 0;
    }
    atual.push(cap);
    soma += cap.palavras;
  }
  if (atual.length > 0) blocos.push(atual);
  return blocos;
}

/** Agrega avaliações de blocos: nota = média ponderada por palavras; reescritas = união. */
function agregarAvaliacoes(partes: { av: AvaliacaoLivro; palavras: number }[]): AvaliacaoLivro {
  const totalPalavras = partes.reduce((s, p) => s + p.palavras, 0) || 1;
  const notaPonderada = partes.reduce((s, p) => s + p.av.nota * p.palavras, 0) / totalPalavras;
  const porCapitulo = new Map<number, { capitulo: number; problemas: string[]; instrucoes: string[] }>();
  for (const p of partes) {
    for (const c of p.av.capitulos_a_reescrever) {
      const existente = porCapitulo.get(c.capitulo);
      if (existente) {
        existente.problemas.push(...c.problemas);
        existente.instrucoes.push(...c.instrucoes);
      } else {
        porCapitulo.set(c.capitulo, { capitulo: c.capitulo, problemas: [...c.problemas], instrucoes: [...c.instrucoes] });
      }
    }
  }
  return {
    schema: "avaliacao-livro/v1",
    nota: Math.round(notaPonderada * 10) / 10,
    pontos_fortes: partes.flatMap((p) => p.av.pontos_fortes),
    pontos_fracos: partes.flatMap((p) => p.av.pontos_fracos),
    capitulos_a_reescrever: [...porCapitulo.values()].sort((a, b) => a.capitulo - b.capitulo),
    resumo: partes.map((p) => p.av.resumo).join(" "),
  };
}

async function avaliarLivro(
  deps: DepsMeta9,
  meta: number,
  capitulos: { numero: number; texto: string; palavras: number }[],
  manuscritoTexto: string,
  manuscritoPalavras: number
): Promise<{ av: AvaliacaoLivro; runId: string }> {
  if (manuscritoPalavras <= LIMITE_PALAVRAS_BLOCO) {
    return avaliarBloco(deps, meta, manuscritoTexto, "livro completo");
  }
  // Manuscrito longo: avalia por blocos e agrega.
  const blocos = agruparEmBlocos(capitulos, LIMITE_PALAVRAS_BLOCO);
  const partes: { av: AvaliacaoLivro; palavras: number }[] = [];
  let ultimoRunId = "";
  for (const bloco of blocos) {
    const texto = bloco.map((c) => c.texto.trim()).join("\n\n");
    const palavras = bloco.reduce((s, c) => s + c.palavras, 0);
    const rotulo = `capítulos ${bloco[0].numero}–${bloco[bloco.length - 1].numero}`;
    const r = await avaliarBloco(deps, meta, texto, rotulo);
    partes.push({ av: r.av, palavras });
    ultimoRunId = r.runId;
  }
  return { av: agregarAvaliacoes(partes), runId: ultimoRunId };
}

// ---------------------------------------------------------------------------
// Orquestração da meta-nota
// ---------------------------------------------------------------------------

function salvarRelatorio(dirProjeto: string, iteracao: number, av: AvaliacaoLivro): string {
  const caminho = path.join(dirProjeto, "avaliacoes", `avaliacao-${String(iteracao).padStart(2, "0")}.json`);
  gravarAtomico(caminho, JSON.stringify(av, null, 2));
  return caminho;
}

function depsPipelineDe(deps: DepsMeta9): DepsPipeline {
  return {
    gravador: deps.gravador,
    persistencia: deps.persistencia,
    provedor: deps.provedor,
    mapa: deps.mapa,
    contrato: deps.contrato,
    perfil: deps.perfil,
    dirManuscrito: deps.dirManuscrito,
    projectId: deps.projectId,
    editionId: deps.editionId ?? null,
    jobId: deps.jobId ?? null,
    docsFactuais: deps.docsFactuais,
  };
}

/**
 * Executa a meta-nota: consolida → avalia → (se abaixo da meta) reescreve os piores capítulos
 * apontados e reavalia, até atingir a meta, esgotar o orçamento de iterações ou uma reescrita
 * terminar bloqueada/reprovada. Escalação HONESTA: nunca conclui sem atingir a meta.
 */
export async function executarMeta9(deps: DepsMeta9): Promise<ResultadoMeta9> {
  const meta = deps.meta ?? 9.0;
  const maxIteracoes = deps.maxIteracoes ?? 3;
  const reportar = deps.reportarEtapa ?? (async () => {});

  const estado = await deps.gravador.carregarEstado();
  const total = estado.doc.total_capitulos ?? Object.keys(estado.doc.capitulos).length;
  if (!total || total < 1) {
    throw new ErroEngine({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao", mensagem: "meta-nota sem total de capítulos definido no estado" });
  }

  // Retomada: um job re-executado pode chegar aqui com a fase já em consolidacao
  // ou avaliacao — mudarFase para trás seria transição inválida. A consolidação
  // em si é determinística e re-roda sempre (o manuscrito reflete o disco atual).
  const faseInicial = estado.doc.fase;
  if (faseInicial === "revisao_final") await deps.gravador.mudarFase("consolidacao");
  await reportar("CONSOLIDACAO");
  let consolidado = consolidarManuscrito(deps.dirManuscrito, deps.dirProjeto, total);

  if (faseInicial !== "avaliacao") await deps.gravador.mudarFase("avaliacao");

  const depsPipeline = depsPipelineDe(deps);
  let ultimaNota = 0;
  let relatorioPath: string | undefined;

  for (let iteracao = 1; iteracao <= maxIteracoes; iteracao++) {
    if (iteracao > 1) consolidado = consolidarManuscrito(deps.dirManuscrito, deps.dirProjeto, total);
    await reportar("AVALIACAO", { iteracao, meta });

    const capitulos = lerCapitulos(deps.dirManuscrito, total);
    const manuscritoTexto = readFileSync(consolidado.caminho, "utf8");
    const { av, runId } = await avaliarLivro(deps, meta, capitulos, manuscritoTexto, consolidado.palavras);
    ultimaNota = av.nota;
    relatorioPath = salvarRelatorio(deps.dirProjeto, iteracao, av);

    await deps.persistencia.inserirReview({
      project_id: deps.projectId,
      edition_id: deps.editionId ?? null,
      run_id: runId,
      capitulo: null,
      text_hash: consolidado.hash,
      verdict: av.nota >= meta ? "aprovado" : "reprovado",
      parecer: pareceDeAvaliacao(av, meta),
    });
    await deps.gravador.registrarAvaliacao({ nota: av.nota, meta, iteracoes: iteracao, relatorio_path: relatorioPath });

    if (av.nota >= meta) {
      await deps.gravador.mudarFase("concluido");
      await reportar("CONCLUIDO", { nota: av.nota, meta, iteracoes: iteracao });
      return { atingiu: true, nota: av.nota, iteracoes: iteracao, relatorioPath };
    }

    // Sem orçamento para outra rodada de reescrita → bloqueia abaixo (escalação honesta).
    if (iteracao >= maxIteracoes) break;

    const piores = selecionarPiores(av.capitulos_a_reescrever, N_REESCRITA);
    if (piores.length === 0) break; // nota baixa sem capítulos a reescrever: não há como melhorar

    for (const alvo of piores) {
      const caminho = path.join(deps.dirManuscrito, nomeCapitulo(alvo.capitulo));
      if (!existsSync(caminho)) {
        throw new ErroEngine({ codigo: "GATE_ARTEFATO_AUSENTE", classe: "qualidade", mensagem: `reescrita: ${nomeCapitulo(alvo.capitulo)} ausente no disco` });
      }
      const textoBase = readFileSync(caminho, "utf8");
      const ficha = await deps.persistencia.lerFichaMaisRecente(deps.projectId, alvo.capitulo);
      if (!ficha) {
        throw new ErroEngine({ codigo: "FICHA_AUSENTE", classe: "qualidade", mensagem: `reescrita: ficha do capítulo ${alvo.capitulo} não encontrada` });
      }
      const correcoes = alvo.problemas.map((p, i) => ({
        local: `capítulo ${alvo.capitulo}`,
        problema: p,
        instrucao: alvo.instrucoes[i] ?? alvo.instrucoes[0] ?? "reescreva conforme o problema apontado",
      }));
      const r = await escreverCapitulo(depsPipeline, alvo.capitulo, {
        fichaExistente: ficha,
        reescritaDirigida: { correcoes, textoBase },
      });
      if (r.status !== "aprovado" && r.status !== "aprovado_com_excecao") {
        await deps.gravador.registrarBloqueio(
          "META_NAO_ATINGIDA",
          "livro",
          `capítulo ${alvo.capitulo} terminou "${r.status}" na reescrita dirigida (nota ${ultimaNota} < meta ${meta})`
        );
        throw new ErroEngine({
          codigo: "META_NAO_ATINGIDA",
          classe: "qualidade",
          mensagem: `meta ${meta} não atingida: reescrita do capítulo ${alvo.capitulo} terminou "${r.status}" (nota ${ultimaNota})`,
        });
      }
    }
  }

  await deps.gravador.registrarBloqueio(
    "META_NAO_ATINGIDA",
    "livro",
    `nota ${ultimaNota} abaixo da meta ${meta} após ${maxIteracoes} iteração(ões)`
  );
  throw new ErroEngine({
    codigo: "META_NAO_ATINGIDA",
    classe: "qualidade",
    mensagem: `meta ${meta} não atingida (nota ${ultimaNota}) após ${maxIteracoes} iteração(ões)`,
    detalhe: { nota: ultimaNota, meta, iteracoes: maxIteracoes, relatorioPath },
  });
}
