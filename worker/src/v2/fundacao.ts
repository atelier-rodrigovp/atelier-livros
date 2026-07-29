// Engine V2 — fundação (arquiteto_enredo) como caminho ÚNICO.
// Usada por criar_fundacao (integracao, roteado por engine_mode) e pelo canário —
// nenhum script reimplementa geração/materialização de fundação.
// O modelo PROPÕE (JSON validado); quem grava disco e estado é ESTE módulo.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parsearArco } from "./arco.js";
import type { BriefingFundacao } from "./briefing.js";
import { compilarPacote } from "./compilador.js";
import { validarSaidaJson } from "./gates.js";
import type { Gravador } from "./gravador.js";
import { hashJsonCanonico } from "./hash.js";
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import {
  avaliarFundacaoV2,
  avaliarMacroFundacao,
  correcaoParaRetry,
  gateMacroMicroCoerentes,
} from "./portao-fundacao.js";
import type { ProvedorModelo } from "./provedor.js";
import { tarefaArquitetoEnredoMacro, tarefaArquitetoEnredoMicro } from "./tarefas.js";
import { chaveStorage, documentosDaFundacao, hashesDosDocumentos, indiceDeDocumentos } from "./documentos.js";
import { ErroEngine, type ArcoFundacao, type ContratoCompilado, type MapaModelos } from "./tipos.js";

export interface PersonagemMapa {
  nome: string;
  papel: string;
  ferida: string;
  segredo: string;
  desejo: string;
  voz: string;
  arco: string;
}

export interface FundacaoV2 {
  perfil_voz: string;
  biblia: string;
  mapa_personagens: PersonagemMapa[];
  estrutura: { capitulo: number; fio: string; resumo_estrutural: string }[];
  fios: string[];
  promessa_editorial: string;
  /**
   * Arco de longo alcance (schema de fundação v3): atos, promessas, fios e arcos
   * de personagem como OBJETOS verificáveis. Opcional no tipo porque a fundação v2
   * (O Farol Cego, canários) não tem — e continua rodando sem.
   */
  arco?: ArcoFundacao;
  /**
   * Documentos que o CONTRATO exige (`estruturas_exigidas.docs`): nome → conteúdo.
   * A fundação nunca os gerou — a leitura falhava e o erro era engolido num catch,
   * então o auditor factual julgava contradição sem o dossiê. Agora o arquiteto os
   * produz e o portão confere.
   */
  docs_exigidos?: Record<string, string>;
}

/** Versão do schema da fundação: "2" = sem arco; "3" = com a seção `arco`. */
export type VersaoFundacao = "2" | "3";

const CAMPOS_PERSONAGEM: (keyof PersonagemMapa)[] = ["nome", "papel", "ferida", "segredo", "desejo", "voz", "arco"];

/**
 * Passada 1 (macro): a mesma validação, sem exigir `estrutura` — que é o produto
 * da passada 2. A estrutura entra vazia e o portão da macro ignora os bloqueios
 * que só a micro pode satisfazer.
 */
export function parseFundacaoMacro(texto: string): FundacaoV2 {
  return parseFundacao(texto, { exigirEstrutura: false });
}

/** Passada 2 (micro): só a estrutura capítulo a capítulo. */
export function parseEstruturaMicro(texto: string): FundacaoV2["estrutura"] {
  const r = validarSaidaJson<FundacaoV2["estrutura"]>(texto, (o) => {
    const bruto = (o as { estrutura?: unknown }).estrutura ?? o;
    if (!Array.isArray(bruto) || bruto.length < 1) throw new Error("estrutura vazia");
    for (const e of bruto as FundacaoV2["estrutura"]) {
      if (!Number.isInteger(e?.capitulo) || typeof e?.fio !== "string" || typeof e?.resumo_estrutural !== "string") {
        throw new Error("item de estrutura inválido (esperado {capitulo:int, fio:string, resumo_estrutural:string})");
      }
    }
    return bruto as FundacaoV2["estrutura"];
  });
  if (!r.ok) throw new Error(`estrutura fora do schema: ${r.gate.evidencia}`);
  return r.valor;
}

export function parseFundacao(texto: string, opts: { exigirEstrutura?: boolean } = {}): FundacaoV2 {
  const exigirEstrutura = opts.exigirEstrutura !== false;
  const r = validarSaidaJson<FundacaoV2>(texto, (o) => {
    const f = o as FundacaoV2;
    if (typeof f?.perfil_voz !== "string" || f.perfil_voz.trim().length < 80) throw new Error("perfil_voz ausente/curto");
    if (typeof f?.biblia !== "string" || f.biblia.trim().length < 200) throw new Error("biblia ausente/curta");
    if (!Array.isArray(f.mapa_personagens) || f.mapa_personagens.length < 1) throw new Error("mapa_personagens vazio");
    for (const p of f.mapa_personagens) {
      for (const campo of CAMPOS_PERSONAGEM) {
        if (typeof p?.[campo] !== "string") throw new Error(`personagem inválido (campo ${campo})`);
      }
      if (!p.nome.trim()) throw new Error("personagem sem nome");
    }
    if (!Array.isArray(f.estrutura)) f.estrutura = [];
    if (exigirEstrutura && f.estrutura.length < 1) throw new Error("estrutura vazia");
    for (const e of f.estrutura) {
      if (!Number.isInteger(e.capitulo) || typeof e.fio !== "string" || typeof e.resumo_estrutural !== "string") {
        throw new Error("item de estrutura inválido");
      }
    }
    if (!Array.isArray(f.fios) || f.fios.length < 1) throw new Error("fios vazios");
    // `arco` é opcional no PARSE (fundação v2 segue válida). Quando vem, precisa
    // ser reconhecível — o portão da fundação é quem decide se a ausência reprova.
    const arco = parsearArco(o);
    if (arco) f.arco = arco;
    // docs_exigidos: só entradas string não-vazias; o portão confere a COBERTURA.
    const docs = (o as { docs_exigidos?: unknown }).docs_exigidos;
    if (docs && typeof docs === "object") {
      const limpos: Record<string, string> = {};
      for (const [nome, conteudo] of Object.entries(docs as Record<string, unknown>)) {
        if (typeof conteudo === "string" && conteudo.trim().length >= 80) limpos[nome] = conteudo;
      }
      if (Object.keys(limpos).length) f.docs_exigidos = limpos;
    }
    return f;
  });
  if (!r.ok) throw new Error(`fundação fora do schema: ${r.gate.evidencia}`);
  return r.valor;
}

export interface DepsFundacao {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  dirProjeto: string;
  jobId?: string | null;
  /** Dono e projeto: necessários para publicar os documentos no Storage (D7). */
  ownerId?: string | null;
  projectId?: string | null;
}

export interface ResultadoPortao {
  /** Quantos retries dirigidos o portão consumiu (0 = passou de primeira). */
  retries: number;
  /** Run da passada MACRO (a micro tem o seu em `runId`). */
  runIdMacro?: string;
  /** Motivo de cada reprovação, na ordem — adendo do autor ao §5 da spec. */
  reprovacoes: string[];
  avisos: string[];
}

/** Teto de retries dirigidos do portão. Estourou = fundação reprovada, não vira livro. */
export const MAX_RETRIES_PORTAO = 2;

/**
 * Gera a fundação pelo papel arquiteto_enredo (pacote compilado; run no ledger)
 * e a submete ao PORTÃO DE QUALIDADE antes de devolvê-la. Fundação reprovada é
 * regerada com instrução dirigida citando cada bloqueio; esgotados os retries,
 * lança — fundação reprovada não vira livro.
 *
 * DUAS PASSADAS (revoga a decisão de spec §5, que era geração única):
 * 1. MACRO — atos, conflito, promessa editorial, arcos, fios, clímax e resolução;
 * 2. MICRO — a função e a progressão de cada capítulo, DENTRO da macro aprovada.
 *
 * A objeção original à divisão era custo de cota. Na prática ela o reduz onde
 * mais dói: a macro é validada ANTES de gerar a estrutura inteira, e uma falha
 * só da micro regenera só a micro — antes, um retry por resumo repetido no
 * capítulo 31 regerava bíblia, mapa, perfil e arco junto.
 *
 * O adendo do autor sobre registrar retries continua valendo: `ResultadoPortao`
 * traz `retries` e `reprovacoes`, agora separados por passada.
 */
export async function gerarFundacaoV2(
  deps: DepsFundacao,
  briefing: BriefingFundacao
): Promise<{ fundacao: FundacaoV2; runId: string; portao: ResultadoPortao }> {
  const perfilTexto = [
    `Briefing do autor: ${briefing.premissa}`,
    briefing.detalhes ? `Decisões do autor na entrevista:\n${briefing.detalhes}` : "",
    `Idioma da obra: ${briefing.idioma}`,
  ].filter(Boolean).join("\n\n");
  const comp = compilarPacote({
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    contrato: deps.contrato,
    perfil: {
      texto: perfilTexto,
      skillId: deps.contrato.contrato.id,
      hash: hashJsonCanonico(perfilTexto),
      validado: true,
    },
  });
  if (!comp.ok) {
    throw new ErroEngine({
      codigo: "FUNDACAO_BLOQUEADA",
      classe: "configuracao",
      mensagem: `compilação da fundação bloqueada: ${comp.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  const reprovacoes: string[] = [];
  let avisos: string[] = [];
  let retriesTotais = 0;

  // ---------------------------------------------------------------------------
  // PASSADA 1 — MACRO (sem a linha por capítulo)
  // ---------------------------------------------------------------------------
  const tarefaMacro = tarefaArquitetoEnredoMacro(briefing, deps.contrato.contrato);
  let macro: FundacaoV2 | null = null;
  let runIdMacro = "";
  let correcao = "";

  for (let tentativa = 0; ; tentativa++) {
    const r = await executarPapel<FundacaoV2>({
      gravador: deps.gravador,
      provedor: deps.provedor,
      mapa: deps.mapa,
      jobId: deps.jobId ?? null,
      papel: "arquiteto_enredo",
      alvo: tentativa === 0 ? "fundacao:macro" : `fundacao:macro:portao-retry-${tentativa}`,
      pacote: comp.pacote!,
      tarefa: correcao ? `${tarefaMacro}\n\n## CORREÇÃO DO PORTÃO\n${correcao}` : tarefaMacro,
      parse: parseFundacaoMacro,
    });
    const av = avaliarMacroFundacao(
      r.valor,
      deps.contrato.contrato,
      briefing.totalCapitulos,
      Object.keys(r.valor.docs_exigidos ?? {})
    );
    avisos = av.avisos;
    if (av.bloqueios.length === 0) {
      macro = r.valor;
      runIdMacro = r.runId;
      retriesTotais = tentativa;
      break;
    }
    const motivo = av.bloqueios.map((b) => `${b.codigo}: ${b.mensagem}`).join(" · ");
    reprovacoes.push(`[macro] ${motivo}`);
    console.warn(`[engine-v2] portão da fundação reprovou a MACRO (tentativa ${tentativa + 1}): ${motivo}`);
    if (tentativa >= MAX_RETRIES_PORTAO) {
      throw new ErroEngine({
        codigo: "FUNDACAO_REPROVADA",
        classe: "qualidade",
        mensagem:
          `macro da fundação reprovada pelo portão após ${MAX_RETRIES_PORTAO} retry(s) dirigido(s); ` +
          `nenhum capítulo foi escrito. Último motivo — ${motivo}`,
        detalhe: { passada: "macro", reprovacoes, avisos: av.avisos },
      });
    }
    correcao = correcaoParaRetry(av);
  }

  // ---------------------------------------------------------------------------
  // PASSADA 2 — MICRO (dentro da macro aprovada; falha aqui NÃO regenera a macro)
  // ---------------------------------------------------------------------------
  const tarefaMicro = tarefaArquitetoEnredoMicro(briefing, deps.contrato.contrato, {
    fios: macro.fios,
    promessa_editorial: macro.promessa_editorial,
    arcoResumo: resumirArcoParaMicro(macro),
  });
  correcao = "";

  for (let tentativa = 0; ; tentativa++) {
    const r = await executarPapel<FundacaoV2["estrutura"]>({
      gravador: deps.gravador,
      provedor: deps.provedor,
      mapa: deps.mapa,
      jobId: deps.jobId ?? null,
      papel: "arquiteto_enredo",
      alvo: tentativa === 0 ? "fundacao:micro" : `fundacao:micro:portao-retry-${tentativa}`,
      pacote: comp.pacote!,
      tarefa: correcao ? `${tarefaMicro}\n\n## CORREÇÃO DO PORTÃO\n${correcao}` : tarefaMicro,
      parse: parseEstruturaMicro,
    });
    const completa: FundacaoV2 = { ...macro, estrutura: r.valor };
    const av = avaliarFundacaoV2(
      completa,
      deps.contrato.contrato,
      briefing.totalCapitulos,
      Object.keys(completa.docs_exigidos ?? {})
    );
    av.bloqueios.push(...gateMacroMicroCoerentes(completa));
    avisos = av.avisos;
    if (av.bloqueios.length === 0) {
      return {
        fundacao: completa,
        runId: r.runId,
        portao: { retries: retriesTotais + tentativa, reprovacoes, avisos, runIdMacro },
      };
    }
    const motivo = av.bloqueios.map((b) => `${b.codigo}: ${b.mensagem}`).join(" · ");
    reprovacoes.push(`[micro] ${motivo}`);
    console.warn(`[engine-v2] portão da fundação reprovou a MICRO (tentativa ${tentativa + 1}): ${motivo}`);
    if (tentativa >= MAX_RETRIES_PORTAO) {
      throw new ErroEngine({
        codigo: "FUNDACAO_REPROVADA",
        classe: "qualidade",
        mensagem:
          `micro da fundação reprovada pelo portão após ${MAX_RETRIES_PORTAO} retry(s) dirigido(s); ` +
          `a macro segue aprovada e nenhum capítulo foi escrito. Último motivo — ${motivo}`,
        detalhe: { passada: "micro", reprovacoes, avisos: av.avisos },
      });
    }
    correcao = correcaoParaRetry(av);
  }
}

/** A macro, condensada, para entrar como contexto vinculante da passada 2. */
export function resumirArcoParaMicro(macro: FundacaoV2): string {
  if (!macro.arco) return "(fundação sem grade de arco)";
  const linhas = [
    "Atos: " + macro.arco.atos.map((a) => `${a.numero} (cap ${a.cap_inicio}–${a.cap_fim}, ${a.funcao}, tensão ${a.tensao_alvo})`).join("; "),
    "Promessas: " + macro.arco.promessas.map((p) => `${p.id} "${p.enunciado}" planta ${p.plantada_em} → paga ${p.paga_em}`).join("; "),
    "Fios: " + macro.arco.fios.map((f) => `${f.nome} (abre ${f.abre}, escalada ${f.escalada.join("/")}, clímax ${f.climax}, fecha ${f.fecha})`).join("; "),
    "Arcos: " + macro.arco.arcos.map((a) => `${a.personagem} [${a.marcos.map((m) => `cap ${m.capitulo}: ${m.estado}`).join(" → ")}]`).join("; "),
  ];
  return linhas.join("\n");
}

/** Materializa a fundação: disco (perfil/bíblia/mapa/estrutura) + estado canônico + fases. */
export async function materializarFundacao(
  deps: DepsFundacao,
  fundacao: FundacaoV2,
  totalCaps: number,
  portao?: ResultadoPortao
): Promise<void> {
  // Lista CANÔNICA (documentos.ts): a mesma que alimenta disco, Storage, hashes
  // do estado e a lista que a interface abre. Antes, cada um desses tinha a sua.
  const docs = documentosDaFundacao(fundacao);
  await fs.mkdir(path.join(deps.dirProjeto, "fundacao"), { recursive: true });
  for (const doc of docs) {
    const destino = path.join(deps.dirProjeto, doc.caminho);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, doc.conteudo, "utf8");
  }

  // Storage: sem isto os documentos existem só no PC do worker e a tela do
  // projeto não abre nenhum deles (defeito D7). Falha de upload é registrada,
  // nunca engolida — o disco continua sendo a verdade da engine.
  const falhasUpload: string[] = [];
  if (deps.ownerId && deps.projectId) {
    const { uploadFile } = await import("../lib.js");
    for (const doc of docs) {
      try {
        await uploadFile("manuscritos", chaveStorage(deps.ownerId, deps.projectId, doc.caminho), path.join(deps.dirProjeto, doc.caminho));
      } catch (e) {
        falhasUpload.push(`${doc.caminho}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const estado = await deps.gravador.carregarEstado();
  estado.doc.skill = { id: deps.contrato.contrato.id, versao: deps.contrato.contrato.versao, hash: deps.contrato.hash };
  estado.doc.fundacao = {
    // v3 = fundação com grade de arco verificável; v2 = fundação anterior.
    versao: fundacao.arco ? "3" : "2",
    hash: hashJsonCanonico(fundacao),
    // TODOS os documentos, inclusive os exigidos pelo contrato — antes só quatro
    // entravam, e a substituição de um dossiê factual passava despercebida.
    docs: hashesDosDocumentos(docs),
    // Índice que a interface consome para saber o que existe e o que abrir.
    indice: indiceDeDocumentos(docs, new Date().toISOString()),
    ...(falhasUpload.length ? { storage_falhas: falhasUpload } : {}),
  };
  estado.doc.total_capitulos = totalCaps;
  // Adendo do autor ao §5: quantos retries o portão consumiu fica registrado.
  // Se os dois virarem rotina, a decisão "geração única" se revisita com dado.
  if (portao) {
    estado.doc.fundacao_portao = {
      retries: portao.retries,
      reprovacoes: portao.reprovacoes,
      em: new Date().toISOString(),
    };
  }
  await deps.persistencia.gravarEstado(estado);
  if ((await deps.gravador.carregarEstado()).doc.fase === "fundacao") {
    await deps.gravador.mudarFase("estrutura");
    await deps.gravador.mudarFase("escrita");
  }
}
