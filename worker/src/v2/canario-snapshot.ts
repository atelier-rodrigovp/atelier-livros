// Engine V2 — canário como SNAPSHOT IMUTÁVEL e invalidação de artefatos (fatia L).
//
// Dois problemas:
//
// 1. o canário de voz era aprovado pelo autor e o texto se perdia. O perfil de
//    voz da fundação era gerado "inspirado" nele, sem vínculo verificável — não
//    havia como afirmar que a voz do livro é a voz que o autor aprovou;
// 2. mudar uma premissa (canário, briefing, idioma, skill, contrato, total de
//    capítulos) deixava fundação e capítulos antigos com cara de válidos. O
//    mecanismo existia (`DOCUMENTO_SUBSTITUIDO` no compilador) e os campos que o
//    disparariam nunca eram preenchidos.
//
// Aqui: o snapshot é imutável e hash-bound, o perfil DERIVA dele de forma
// verificável, e qualquer mudança de premissa invalida explicitamente o que
// dependia dela.

import { hashText } from "../quality-state.js";
import { hashJsonCanonico } from "./hash.js";

export interface SnapshotCanario {
  schema: "canario-voz-snapshot/v1";
  /** Texto INTEGRAL da amostra aprovada. Nunca um resumo. */
  texto: string;
  hash: string;
  /** Contrato e modelo que produziram a amostra. */
  skill: { id: string; versao: string; hash: string };
  modelo: string;
  projectId: string;
  /** Decisão do autor, com data. */
  aprovado_por: string;
  aprovado_em: string;
  /** Ajuste que o autor pediu antes de aprovar, quando houve. */
  ajuste_autor?: string;
}

/** Cria o snapshot. O hash é do TEXTO: qualquer alteração produz outro snapshot. */
export function criarSnapshotCanario(e: {
  texto: string;
  skill: { id: string; versao: string; hash: string };
  modelo: string;
  projectId: string;
  aprovadoPor: string;
  aprovadoEm: string;
  ajusteAutor?: string;
}): SnapshotCanario {
  if (!e.texto?.trim()) throw new Error("snapshot de canário exige o texto integral da amostra aprovada");
  return {
    schema: "canario-voz-snapshot/v1",
    texto: e.texto,
    hash: hashText(e.texto),
    skill: e.skill,
    modelo: e.modelo,
    projectId: e.projectId,
    aprovado_por: e.aprovadoPor,
    aprovado_em: e.aprovadoEm,
    ...(e.ajusteAutor?.trim() ? { ajuste_autor: e.ajusteAutor } : {}),
  };
}

/** O snapshot é IMUTÁVEL: alterar o texto invalida o hash e é detectável. */
export function snapshotIntacto(s: SnapshotCanario): boolean {
  return hashText(s.texto) === s.hash;
}

// ---------------------------------------------------------------------------
// Derivação verificável do perfil de voz
// ---------------------------------------------------------------------------

export interface PerfilDerivado {
  texto: string;
  /** Hash do snapshot de que este perfil derivou. */
  canario_hash: string;
  /** Hash do próprio perfil. */
  hash: string;
}

/**
 * O perfil de voz PASSA A CARREGAR a proveniência: o hash do canário aprovado.
 * Sem isso, "o perfil deriva do canário" era uma afirmação sem verificação.
 */
export function derivarPerfilDoCanario(snapshot: SnapshotCanario, textoPerfil: string): PerfilDerivado {
  if (!snapshotIntacto(snapshot)) {
    throw new Error("snapshot de canário adulterado: o hash não corresponde ao texto");
  }
  return { texto: textoPerfil, canario_hash: snapshot.hash, hash: hashText(textoPerfil) };
}

/** O perfil que a fundação usou deriva do canário que o autor aprovou? */
export function perfilDerivaDoCanario(perfil: { canario_hash?: string }, snapshot: SnapshotCanario): boolean {
  return Boolean(perfil.canario_hash) && perfil.canario_hash === snapshot.hash;
}

// ---------------------------------------------------------------------------
// Premissas e invalidação de artefatos dependentes
// ---------------------------------------------------------------------------

/** As entradas cuja mudança invalida o que foi construído sobre elas. */
export interface Premissas {
  canario_hash: string;
  briefing_hash: string;
  idioma: string;
  skill_id: string;
  skill_hash: string;
  contrato_hash: string;
  total_capitulos: number;
  /** Hash por documento central da fundação. */
  docs: Record<string, string>;
}

export function hashPremissas(p: Premissas): string {
  return hashJsonCanonico(p);
}

export type ArtefatoDependente = "perfil_de_voz" | "fundacao" | "fichas" | "capitulos" | "manuscrito" | "avaliacao";

/** Que artefatos cada premissa sustenta. Mudar a premissa invalida a lista. */
export const DEPENDENCIAS: Record<keyof Premissas, ArtefatoDependente[]> = {
  canario_hash: ["perfil_de_voz", "fundacao", "fichas", "capitulos", "manuscrito", "avaliacao"],
  briefing_hash: ["fundacao", "fichas", "capitulos", "manuscrito", "avaliacao"],
  idioma: ["perfil_de_voz", "fundacao", "fichas", "capitulos", "manuscrito", "avaliacao"],
  skill_id: ["perfil_de_voz", "fundacao", "fichas", "capitulos", "manuscrito", "avaliacao"],
  skill_hash: ["fichas", "capitulos", "avaliacao"],
  contrato_hash: ["fichas", "capitulos", "avaliacao"],
  total_capitulos: ["fundacao", "fichas", "manuscrito", "avaliacao"],
  docs: ["fichas", "capitulos", "avaliacao"],
};

export interface MudancaPremissa {
  premissa: keyof Premissas;
  de: string;
  para: string;
}

export function compararPremissas(antes: Premissas, agora: Premissas): MudancaPremissa[] {
  const out: MudancaPremissa[] = [];
  for (const chave of Object.keys(DEPENDENCIAS) as (keyof Premissas)[]) {
    const a = chave === "docs" ? hashJsonCanonico(antes.docs) : String(antes[chave]);
    const b = chave === "docs" ? hashJsonCanonico(agora.docs) : String(agora[chave]);
    if (a !== b) out.push({ premissa: chave, de: a, para: b });
  }
  return out;
}

export interface Invalidacao {
  artefatos: ArtefatoDependente[];
  mudancas: MudancaPremissa[];
  /** Mensagem para o autor: o que deixou de valer e por quê. */
  motivo: string;
}

/**
 * Traduz mudanças de premissa em invalidação EXPLÍCITA. Nunca deixa artefato
 * antigo aparentando validade: se a premissa mudou, o que dependia dela está
 * invalidado até o autor decidir reconstruir ou migrar.
 */
export function invalidarPorPremissa(mudancas: MudancaPremissa[]): Invalidacao | null {
  if (!mudancas.length) return null;
  const artefatos = [...new Set(mudancas.flatMap((m) => DEPENDENCIAS[m.premissa]))];
  return {
    artefatos,
    mudancas,
    motivo:
      `premissa(s) alterada(s): ${mudancas.map((m) => m.premissa).join(", ")}. ` +
      `Artefato(s) invalidado(s): ${artefatos.join(", ")}. ` +
      `Reconstrua ou migre antes de continuar — capítulos escritos sob a premissa antiga não são válidos sob a nova.`,
  };
}

export type EscolhaDoAutor = "reconstruir" | "migrar" | "cancelar";

export type DecisaoPremissa =
  | { acao: "seguir" }
  | { acao: "bloquear"; invalidacao: Invalidacao }
  | { acao: "reconstruir"; invalidacao: Invalidacao }
  | { acao: "migrar"; invalidacao: Invalidacao };

/**
 * Portão: com premissa alterada, a execução PARA até o autor escolher. Não há
 * caminho em que a engine siga escrevendo sobre uma base que mudou.
 */
export function decidirComPremissaAlterada(
  invalidacao: Invalidacao | null,
  escolha?: EscolhaDoAutor
): DecisaoPremissa {
  if (!invalidacao) return { acao: "seguir" };
  if (escolha === "reconstruir") return { acao: "reconstruir", invalidacao };
  if (escolha === "migrar") return { acao: "migrar", invalidacao };
  return { acao: "bloquear", invalidacao };
}
