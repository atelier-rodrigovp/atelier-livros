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
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { conferirParecer, validarParecer } from "./revisor.js";
import { medirSinais, resumoSinais } from "./sinais.js";
import { validarSpec } from "./spec.js";
import {
  tarefaArquitetoCena,
  tarefaAuditorFactual,
  tarefaContextualizador,
  tarefaEscritor,
  tarefaEscritorCorrecao,
  tarefaRevisor,
} from "./tarefas.js";
import type {
  ContratoCompilado,
  MapaModelos,
  Parecer,
  ResultadoGate,
  SceneSpec,
} from "./tipos.js";

export interface DepsPipeline {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  dirManuscrito: string; // onde capitulo-NN.md é escrito (pelo PIPELINE, não pelo modelo)
  projectId: string;
  editionId?: string | null;
  jobId?: string | null;
  fundacaoEsperada?: Record<string, string>;
  instrucoesAutor?: Instrucao[];
  maxCorrecoes?: number; // default 2 — tentativas de correção dirigida por capítulo
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

function validarSaidaContextualizador(obj: unknown): SaidaContextualizador {
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

function validarSaidaAuditor(obj: unknown): SaidaAuditor {
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
  return { contradicoes, conhecimento_indevido: conhecimento, pov_violado: { ha: pov.ha, detalhe: pov.detalhe } };
}

/** Prosa do escritor: só valida presença — o conteúdo é julgado por gates/revisor. */
function parseProsa(t: string): string {
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
  }
): Promise<ResultadoCapitulo> {
  const runs: string[] = [];
  const problemas: string[] = [];
  const alvoCap = `capitulo:${capitulo}`;
  const nn = String(capitulo).padStart(2, "0");
  const caminho = path.join(deps.dirManuscrito, `capitulo-${nn}.md`);
  const maxCorrecoes = deps.maxCorrecoes ?? 2;

  // Base comum das execuções de papel (ledger completo por chamada).
  const base = {
    gravador: deps.gravador,
    provedor: deps.provedor,
    mapa: deps.mapa,
    jobId: deps.jobId ?? null,
    editionId: deps.editionId ?? null,
  };

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
      fundacaoEsperada: deps.fundacaoEsperada,
      ...extras,
    });

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
  let ficha: SceneSpec;
  if (opts?.fichaExistente) {
    // Limitação documentada: a interface de persistência não tem consulta de spec;
    // ficha existente é assumida como já persistida — o pipeline não re-insere.
    ficha = opts.fichaExistente;
  } else {
    const comp = compilar("arquiteto_cena", `spec:${capitulo}`);
    if (!comp.ok) return bloquearPorCompilacao(comp.bloqueios);
    const r = await executarPapel<SceneSpec>({
      ...base,
      papel: "arquiteto_cena",
      alvo: `spec:${capitulo}`,
      pacote: comp.pacote!,
      tarefa: tarefaArquitetoCena(capitulo, deps.contrato.contrato),
      parse: (t) => {
        const spec = extrairJson(t) as SceneSpec;
        const v = validarSpec(spec, deps.contrato.contrato);
        if (!v.ok) throw new Error(`ficha inválida: ${v.erros.join("; ")}`);
        return spec;
      },
    });
    runs.push(r.runId);
    ficha = r.valor;
    // Sempre versão 1: sem consulta de specs na interface, o pipeline não sabe se já
    // existe versão anterior (limitação aceita; a UI/worker resolve versões futuras).
    await deps.persistencia.inserirSpec({
      project_id: deps.projectId,
      edition_id: deps.editionId ?? null,
      capitulo,
      versao: 1,
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
  const compCtx = compilar("contextualizador", alvoCap, { ficha });
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
  const repeticoesRecentes = ctx.repeticoes_recentes;

  // -------------------------------------------------------------------------
  // 3. ESCRITA (escritor) — o PIPELINE grava o arquivo, nunca o modelo
  // -------------------------------------------------------------------------
  const compEsc = compilar("escritor", alvoCap, {
    ficha,
    fatos,
    trechosAnteriores: opts?.trechosAnteriores,
    repeticoesRecentes,
  });
  if (!compEsc.ok) return bloquearPorCompilacao(compEsc.bloqueios);
  const pacoteEscritor = compEsc.pacote!;

  const rEsc = await executarPapel<string>({
    ...base,
    papel: "escritor",
    alvo: alvoCap,
    pacote: pacoteEscritor,
    tarefa: tarefaEscritor(ficha, deps.contrato.contrato),
    parse: parseProsa,
  });
  runs.push(rEsc.runId);
  let texto = rEsc.valor;

  const gravarERegistrar = async (t: string): Promise<void> => {
    gravarAtomico(caminho, t);
    await deps.gravador.registrarCapituloEscrito(capitulo, caminho, {
      palavras: contarPalavras(t),
      spec_versao: 1,
      spec_hash: specHash,
    });
  };
  await gravarERegistrar(texto);

  // -------------------------------------------------------------------------
  // 4. GATES UNIVERSAIS — com UMA rodada de correção dirigida por passagem
  // -------------------------------------------------------------------------
  const rodarGates = (): ResultadoGate[] =>
    rodarGatesCapitulo({
      texto,
      contrato: deps.contrato.contrato,
      ficha,
      anteriores: opts?.anteriores,
    }).filter((g) => !g.passou);

  const corrigirComEscritor = async (
    correcoes: { local: string; problema: string; instrucao: string }[]
  ): Promise<void> => {
    const r = await executarPapel<string>({
      ...base,
      papel: "escritor",
      alvo: alvoCap,
      pacote: pacoteEscritor,
      tarefa: tarefaEscritorCorrecao(capitulo, correcoes, texto),
      parse: parseProsa,
    });
    runs.push(r.runId);
    texto = r.valor;
    await gravarERegistrar(texto);
  };

  /** Garante gates verdes (1 correção dirigida se falhar); retorna os que sobraram. */
  const garantirGates = async (): Promise<ResultadoGate[]> => {
    let falhos = rodarGates();
    if (falhos.length === 0) return [];
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

  let gatesFalhos = await garantirGates();
  if (gatesFalhos.length) return bloquearPorGates(gatesFalhos);

  // -------------------------------------------------------------------------
  // 5–7. SINAIS + REVISÃO + AUDITORIA + DECISÃO (loop de correção dirigida)
  // -------------------------------------------------------------------------
  let correcoesFeitas = 0;
  let violacoesAnterior: number | null = null;

  for (;;) {
    // 5. Sinais medidos + parecer do revisor literário
    const sinais = medirSinais(texto, deps.contrato.contrato);
    const secaoTexto: SecaoContexto = { titulo: "TEXTO A AVALIAR", texto, fonte: "manuscrito" };

    const compRev = compilar("revisor_literario", alvoCap, {
      ficha,
      fatos: [...fatos, secaoTexto],
      repeticoesRecentes,
    });
    if (!compRev.ok) return bloquearPorCompilacao(compRev.bloqueios);
    const rRev = await executarPapel<Parecer>({
      ...base,
      papel: "revisor_literario",
      alvo: alvoCap,
      pacote: compRev.pacote!,
      tarefa: tarefaRevisor(capitulo, resumoSinais(sinais), deps.contrato.contrato),
      parse: (t) => validarParecer(extrairJson(t)),
    });
    runs.push(rRev.runId);
    const parecer = rRev.valor;
    const conferencia = conferirParecer(parecer, sinais);
    problemas.push(...conferencia.problemas);
    let verdictEfetivo = conferencia.verdictEfetivo;

    // 6. Auditoria factual — contradição comprovada é GATE universal
    const compAud = compilar("auditor_factual", alvoCap, { ficha, fatos: [...fatos, secaoTexto] });
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
    if (contradicoesBloqueantes.length > 0 || auditoria.conhecimento_indevido.length > 0) {
      verdictEfetivo = "reprovado";
      for (const c of contradicoesBloqueantes) {
        problemas.push(`contradição factual comprovada: ${c.fato_estabelecido} vs "${c.trecho_do_capitulo}"`);
      }
      for (const k of auditoria.conhecimento_indevido) {
        problemas.push(`conhecimento indevido: ${k.quem} sabe "${k.sabe_o_que_nao_deveria}" (${k.trecho})`);
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
        parecer,
      });
      await deps.gravador.aprovarCapitulo(
        capitulo,
        { id: reviewId, text_hash: textHash, verdict: verdictEfetivo, parecer },
        caminho
      );
      return { capitulo, status: verdictEfetivo, textHash, reviewId, gatesFalhos: [], problemas, runs };
    }

    if (verdictEfetivo === "necessita_decisao_humana") {
      const reviewId = await deps.persistencia.inserirReview({
        project_id: deps.projectId,
        edition_id: deps.editionId ?? null,
        capitulo,
        text_hash: textHash,
        verdict: verdictEfetivo,
        run_id: rRev.runId,
        parecer,
      });
      await deps.gravador.registrarBloqueio(
        "DECISAO_HUMANA",
        alvoCap,
        problemas.length ? problemas.join(" · ") : "revisor solicitou decisão humana"
      );
      return { capitulo, status: "necessita_decisao_humana", textHash, reviewId, gatesFalhos: [], problemas, runs };
    }

    // Reprovado: correção dirigida se há instruções, orçamento e convergência
    const violacoes = parecer.sinais.filter((s) => s.disposicao === "violacao_confirmada").length;
    const semConvergencia = violacoesAnterior !== null && violacoes >= violacoesAnterior;
    if (parecer.correcoes.length > 0 && correcoesFeitas < maxCorrecoes && !semConvergencia) {
      violacoesAnterior = violacoes;
      correcoesFeitas++;
      await corrigirComEscritor(parecer.correcoes);
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
      parecer,
    });
    await deps.gravador.registrarBloqueio(
      "QUALIDADE_REPROVADA",
      alvoCap,
      problemas.length ? problemas.join(" · ") : `parecer reprovado após ${correcoesFeitas} correção(ões)`
    );
    return { capitulo, status: "reprovado", textHash, reviewId, gatesFalhos: [], problemas, runs };
  }
}
