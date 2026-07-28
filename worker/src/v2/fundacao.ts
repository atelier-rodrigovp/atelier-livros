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
import { avaliarFundacaoV2, correcaoParaRetry } from "./portao-fundacao.js";
import type { ProvedorModelo } from "./provedor.js";
import { tarefaArquitetoEnredo } from "./tarefas.js";
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

export function parseFundacao(texto: string): FundacaoV2 {
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
    if (!Array.isArray(f.estrutura) || f.estrutura.length < 1) throw new Error("estrutura vazia");
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
}

export interface ResultadoPortao {
  /** Quantos retries dirigidos o portão consumiu (0 = passou de primeira). */
  retries: number;
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
 * Decisão de spec §5: geração ÚNICA com portão, em vez de duas passadas (macro
 * validada antes da micro). Duas passadas dobrariam o consumo de cota (esta
 * chamada já tem timeout de 900s) e o defeito que evitariam é o mesmo que o
 * portão detecta. O adendo do autor exige registrar quantos retries cada fundação
 * consumiu: se os dois virarem rotina, a decisão se revisita com dado.
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
  const tarefaBase = tarefaArquitetoEnredo(briefing, deps.contrato.contrato);
  const reprovacoes: string[] = [];
  let avisos: string[] = [];
  let correcao = "";

  for (let tentativa = 0; ; tentativa++) {
    const r = await executarPapel<FundacaoV2>({
      gravador: deps.gravador,
      provedor: deps.provedor,
      mapa: deps.mapa,
      jobId: deps.jobId ?? null,
      papel: "arquiteto_enredo",
      alvo: tentativa === 0 ? "fundacao" : `fundacao:portao-retry-${tentativa}`,
      pacote: comp.pacote!,
      tarefa: correcao ? `${tarefaBase}\n\n## CORREÇÃO DO PORTÃO\n${correcao}` : tarefaBase,
      parse: parseFundacao,
      // Fundação completa (perfil + bíblia + mapa + estrutura por capítulo) é a
      // maior geração única da engine: 5 min estourava com briefing rico.
      timeoutMs: 900000,
    });

    const av = avaliarFundacaoV2(
      r.valor,
      deps.contrato.contrato,
      briefing.totalCapitulos,
      Object.keys(r.valor.docs_exigidos ?? {})
    );
    avisos = av.avisos;
    if (av.bloqueios.length === 0) {
      return { fundacao: r.valor, runId: r.runId, portao: { retries: tentativa, reprovacoes, avisos } };
    }

    const motivo = av.bloqueios.map((b) => `${b.codigo}: ${b.mensagem}`).join(" · ");
    reprovacoes.push(motivo);
    console.warn(`[engine-v2] portão da fundação reprovou (tentativa ${tentativa + 1}): ${motivo}`);

    if (tentativa >= MAX_RETRIES_PORTAO) {
      throw new ErroEngine({
        codigo: "FUNDACAO_REPROVADA",
        classe: "qualidade",
        mensagem:
          `fundação reprovada pelo portão após ${MAX_RETRIES_PORTAO} retry(s) dirigido(s); ` +
          `nenhum capítulo foi escrito. Último motivo — ${motivo}`,
        detalhe: { reprovacoes, avisos: av.avisos },
      });
    }
    correcao = correcaoParaRetry(av);
  }
}

/** Materializa a fundação: disco (perfil/bíblia/mapa/estrutura) + estado canônico + fases. */
export async function materializarFundacao(
  deps: DepsFundacao,
  fundacao: FundacaoV2,
  totalCaps: number,
  portao?: ResultadoPortao
): Promise<void> {
  await fs.mkdir(path.join(deps.dirProjeto, "fundacao"), { recursive: true });
  await fs.writeFile(path.join(deps.dirProjeto, "perfil-de-voz.md"), fundacao.perfil_voz, "utf8");
  await fs.writeFile(path.join(deps.dirProjeto, "fundacao", "biblia-da-obra.md"), fundacao.biblia, "utf8");
  const mapaJson = JSON.stringify({ personagens: fundacao.mapa_personagens }, null, 2);
  await fs.writeFile(path.join(deps.dirProjeto, "fundacao", "mapa-personagens.json"), mapaJson, "utf8");
  await fs.writeFile(
    path.join(deps.dirProjeto, "estrutura.json"),
    JSON.stringify(
      {
        estrutura: fundacao.estrutura,
        fios: fundacao.fios,
        promessa: fundacao.promessa_editorial,
        // `arco` só aparece no arquivo quando existe: estrutura.json de fundação
        // v2 permanece byte-compatível com o que já está no disco.
        ...(fundacao.arco ? { arco: fundacao.arco } : {}),
      },
      null,
      2
    ),
    "utf8"
  );
  // Docs que o contrato exige (dossiê factual, matriz de relógios…): vão para
  // fundacao/, que é onde prepararProjetoV2 os procura para o revisor e o auditor.
  for (const [nome, conteudo] of Object.entries(fundacao.docs_exigidos ?? {})) {
    // Nome vem do modelo: só o basename, e só dentro de fundacao/ (path traversal).
    const seguro = path.basename(nome);
    if (!seguro || seguro.startsWith(".")) continue;
    await fs.writeFile(path.join(deps.dirProjeto, "fundacao", seguro), conteudo, "utf8");
  }

  const estado = await deps.gravador.carregarEstado();
  estado.doc.skill = { id: deps.contrato.contrato.id, versao: deps.contrato.contrato.versao, hash: deps.contrato.hash };
  estado.doc.fundacao = {
    // v3 = fundação com grade de arco verificável; v2 = fundação anterior.
    versao: fundacao.arco ? "3" : "2",
    hash: hashJsonCanonico(fundacao),
    docs: {
      "perfil-de-voz.md": createHash("sha256").update(fundacao.perfil_voz, "utf8").digest("hex"),
      "fundacao/biblia-da-obra.md": createHash("sha256").update(fundacao.biblia, "utf8").digest("hex"),
      "fundacao/mapa-personagens.json": hashJsonCanonico(fundacao.mapa_personagens),
      "estrutura.json": hashJsonCanonico(fundacao.estrutura),
    },
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
