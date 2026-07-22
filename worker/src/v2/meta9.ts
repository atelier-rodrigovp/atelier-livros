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
import { tarefaAvaliadorLivro, tarefaSinteseArco } from "./tarefas.js";
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

// Rubrica do book-bestseller-review (references/scoring-rubric.md): dez dimensões,
// 8 majors (governam o floor) + 2 modificadores; pesos 1.5×/1×/0.5×; o headline é a
// média ponderada CALCULADA EM CÓDIGO e o veredito é limitado pelo floor principle.
export const DIMENSOES_LIVRO = [
  { chave: "hook_abertura", peso: 1.5, major: true },
  { chave: "premissa_originalidade", peso: 1.5, major: true },
  { chave: "estrutura_ritmo", peso: 1, major: true },
  { chave: "personagens", peso: 1, major: true },
  { chave: "prosa_oficio", peso: 1, major: true },
  { chave: "payoff", peso: 1.5, major: true },
  { chave: "coerencia_consistencia", peso: 1, major: true },
  { chave: "final", peso: 1, major: true },
  { chave: "encaixe_mercado", peso: 1, major: false },
  { chave: "acabamento", peso: 0.5, major: false },
] as const;

export interface DimensaoAvaliada { nota: number; evidencia: string }

export interface AvaliacaoLivro {
  schema: "avaliacao-livro/v2";
  dimensoes: Record<string, DimensaoAvaliada>;
  /** headline: média ponderada das 10 dimensões, calculada pelo CÓDIGO */
  nota: number;
  /** menor nota entre as dimensões majors (floor principle) */
  floor: { dimensao: string; nota: number };
  pontos_fortes: string[];
  pontos_fracos: string[];
  capitulos_a_reescrever: { capitulo: number; problemas: string[]; instrucoes: string[] }[];
  resumo: string;
}

/**
 * Floor mínimo para APROVAÇÃO (rubrica, banda "market-ready": nenhuma dimensão
 * major abaixo de 7). A média NUNCA aprova sozinha — o floor decide junto.
 */
export const FLOOR_MINIMO_APROVACAO = 7;

/** Predicado ÚNICO de aprovação da meta-nota: média ≥ meta E floor ≥ mínimo. */
export function atingiuMeta(av: AvaliacaoLivro, meta: number): boolean {
  return av.nota >= meta && av.floor.nota >= FLOOR_MINIMO_APROVACAO;
}

/** Média ponderada + floor (determinísticos — o modelo nunca soma a própria nota). */
export function derivarNotaEFloor(dimensoes: Record<string, DimensaoAvaliada>): { nota: number; floor: { dimensao: string; nota: number } } {
  let soma = 0;
  let pesos = 0;
  let floor: { dimensao: string; nota: number } | null = null;
  for (const d of DIMENSOES_LIVRO) {
    const av = dimensoes[d.chave];
    soma += av.nota * d.peso;
    pesos += d.peso;
    if (d.major && (floor === null || av.nota < floor.nota)) floor = { dimensao: d.chave, nota: av.nota };
  }
  return { nota: Math.round((soma / pesos) * 10) / 10, floor: floor! };
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

/**
 * Validação estrita do JSON do avaliador de livro (schema "avaliacao-livro/v2").
 * Cada uma das dez dimensões exige nota 1–10 e evidência não-vazia (nota sem
 * evidência é inválida — princípio da rubrica); nota e floor saem do CÓDIGO.
 */
export function validarAvaliacaoLivro(obj: unknown): AvaliacaoLivro {
  if (typeof obj !== "object" || obj === null) throw new Error("avaliação não é objeto");
  const o = obj as Record<string, unknown>;
  if (o.schema !== "avaliacao-livro/v2") throw new Error(`schema inválido: ${String(o.schema)} (esperado avaliacao-livro/v2)`);
  const dims = o.dimensoes as Record<string, unknown> | undefined;
  if (typeof dims !== "object" || dims === null) throw new Error("dimensoes deve ser objeto");
  const dimensoes: Record<string, DimensaoAvaliada> = {};
  for (const d of DIMENSOES_LIVRO) {
    const v = dims[d.chave] as { nota?: unknown; evidencia?: unknown } | undefined;
    if (!v || typeof v.nota !== "number" || v.nota < 1 || v.nota > 10) {
      throw new Error(`dimensoes.${d.chave}.nota inválida (esperado número 1–10)`);
    }
    if (typeof v.evidencia !== "string" || !v.evidencia.trim()) {
      throw new Error(`dimensoes.${d.chave}.evidencia obrigatória — nota sem evidência é inválida`);
    }
    dimensoes[d.chave] = { nota: v.nota, evidencia: v.evidencia };
  }
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
  const { nota, floor } = derivarNotaEFloor(dimensoes);
  return { schema: "avaliacao-livro/v2", dimensoes, nota, floor, pontos_fortes, pontos_fracos, capitulos_a_reescrever, resumo: o.resumo };
}

/**
 * Parecer/v1 derivado da avaliação de livro: cada eixo mapeia uma DIMENSÃO REAL da
 * rubrica (nota/2, evidência da própria dimensão) — nunca uma nota única espelhada.
 */
function pareceDeAvaliacao(av: AvaliacaoLivro, meta: number): Parecer {
  const eixoDe = (chave: string) => {
    const d = av.dimensoes[chave];
    return { nota: Math.max(0, Math.min(5, Math.round((d.nota / 2) * 10) / 10)), evidencia: d.evidencia };
  };
  const evidencias = (av.pontos_fortes.length ? av.pontos_fortes : [av.resumo])
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
    dramatic_progression: eixoDe("estrutura_ritmo"),
    skill_adherence: eixoDe("premissa_originalidade"),
    clarity: eixoDe("prosa_oficio"),
    emotional_effect: eixoDe("payoff"),
    continuity: eixoDe("coerencia_consistencia"),
    hook_effectiveness: eixoDe("hook_abertura"),
    verdict: atingiuMeta(av, meta) ? "aprovado" : "reprovado",
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

/** União dos capítulos-a-reescrever dos blocos (a síntese de arco pode acrescentar). */
function unirReescritas(
  listas: AvaliacaoLivro["capitulos_a_reescrever"][]
): AvaliacaoLivro["capitulos_a_reescrever"] {
  const porCapitulo = new Map<number, { capitulo: number; problemas: string[]; instrucoes: string[] }>();
  for (const lista of listas) {
    for (const c of lista) {
      const existente = porCapitulo.get(c.capitulo);
      if (existente) {
        existente.problemas.push(...c.problemas);
        existente.instrucoes.push(...c.instrucoes);
      } else {
        porCapitulo.set(c.capitulo, { capitulo: c.capitulo, problemas: [...c.problemas], instrucoes: [...c.instrucoes] });
      }
    }
  }
  return [...porCapitulo.values()].sort((a, b) => a.capitulo - b.capitulo);
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
  // Manuscrito longo: blocos para leitura integral + SÍNTESE DE ARCO para a visão
  // do livro inteiro (as dimensões finais saem da síntese, nunca de média de blocos).
  const blocos = agruparEmBlocos(capitulos, LIMITE_PALAVRAS_BLOCO);
  const partes: { rotulo: string; av: AvaliacaoLivro }[] = [];
  for (const bloco of blocos) {
    const texto = bloco.map((c) => c.texto.trim()).join("\n\n");
    const rotulo = `capítulos ${bloco[0].numero}–${bloco[bloco.length - 1].numero}`;
    const r = await avaliarBloco(deps, meta, texto, rotulo);
    partes.push({ rotulo, av: r.av });
  }
  const materialArco: SecaoContexto[] = [
    {
      titulo: "AVALIAÇÕES POR BLOCO",
      texto: partes
        .map((p) => `## ${p.rotulo}\n${JSON.stringify({ dimensoes: p.av.dimensoes, pontos_fortes: p.av.pontos_fortes, pontos_fracos: p.av.pontos_fracos, resumo: p.av.resumo }, null, 1)}`)
        .join("\n\n"),
      fonte: "avaliacoes-blocos",
    },
    { titulo: `PRIMEIRO CAPÍTULO (integral)`, texto: capitulos[0].texto, fonte: "capitulo-1" },
    { titulo: `ÚLTIMO CAPÍTULO (integral)`, texto: capitulos[capitulos.length - 1].texto, fonte: `capitulo-${capitulos.length}` },
  ];
  const comp = compilarPacote({ papel: "revisor_literario", alvo: "livro", contrato: deps.contrato, perfil: deps.perfil, fatos: [...materialArco, ...(deps.docsFactuais ?? [])] });
  if (!comp.ok) {
    throw new ErroEngine({ codigo: "AVALIACAO_PACOTE_BLOQUEADO", classe: "qualidade", mensagem: `síntese de arco bloqueada: ${comp.bloqueios.map((b) => b.codigo).join(", ")}` });
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
    tarefa: tarefaSinteseArco(partes.length),
    parse: (t) => validarAvaliacaoLivro(extrairJson(t)),
  });
  // Reescritas: união dos blocos + o que a síntese apontou.
  const av: AvaliacaoLivro = {
    ...r.valor,
    capitulos_a_reescrever: unirReescritas([...partes.map((p) => p.av.capitulos_a_reescrever), r.valor.capitulos_a_reescrever]),
  };
  return { av, runId: r.runId };
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
      verdict: atingiuMeta(av, meta) ? "aprovado" : "reprovado",
      parecer: pareceDeAvaliacao(av, meta),
    });
    await deps.gravador.registrarAvaliacao({ nota: av.nota, meta, iteracoes: iteracao, relatorio_path: relatorioPath });

    if (atingiuMeta(av, meta)) {
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
        textoBase,
        reescritaDirigida: { correcoes },
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
