// Engine V2 — briefing do autor como dado de primeira classe.
// Funções PURAS que traduzem o que a entrevista/wizard gravou (projects.briefing
// + colunas) em: idioma resolvido, instruções camada 3 (decisao_autor),
// preferências camada 7 e o briefing completo entregue ao arquiteto_enredo.
// Nada aqui toca banco, disco ou modelo.

import type { Instrucao } from "./compilador.js";

/** Campos do briefing gravados pela entrevista (worker/src/entrevista.ts). */
export interface BriefingAutor {
  ideia_central?: string;
  genero?: string;
  autor?: string;
  serie?: string | null;
  serie_total?: number;
  volume?: number;
  protagonista?: { nome?: string; ferida?: string; segredo?: string; desejo?: string };
  antagonista?: string;
  personagens?: { protagonistas?: number; antagonistas?: number; apoio?: number };
  tom?: string;
  pdv?: string;
  tempo_verbal?: string;
  linha_tempo?: string;
  final?: string;
  canone?: string;
  proibido?: string;
  idioma?: string;
  decisoes_autor?: { texto?: string; em?: string }[];
  preferencias?: { texto?: string; em?: string }[];
  /**
   * Justificativas de `não se aplica` (fatia E): para cada campo `x` que o autor
   * respondeu com o marcador, `x_justificativa` diz POR QUÊ. Sem ela, o marcador
   * volta a ser omissão — e omissão nunca vira default silencioso na fundação.
   */
  [justificativa: `${string}_justificativa`]: unknown;
}

// ---------------------------------------------------------------------------
// Idioma
// ---------------------------------------------------------------------------

/** Nome legível do idioma para instruções de tarefa (fallback: o próprio código). */
export function nomeIdioma(codigo: string): string {
  const nomes: Record<string, string> = {
    "pt-BR": "português brasileiro",
    "pt-PT": "português europeu",
    "en": "inglês",
    "en-US": "inglês (EUA)",
    "en-GB": "inglês (Reino Unido)",
    "es-ES": "espanhol (Espanha)",
    "es": "espanhol",
    "it-IT": "italiano",
    "it": "italiano",
    "de-DE": "alemão",
    "de": "alemão",
    "fr-FR": "francês (França)",
    "fr": "francês",
  };
  return nomes[codigo] ?? codigo;
}

/**
 * Precedência do idioma da obra (spec aprovada):
 * projects.idioma_origem > briefing.idioma > "pt-BR".
 */
export function resolverIdioma(proj: { idioma_origem?: string | null; briefing?: BriefingAutor | null }): string {
  const coluna = proj.idioma_origem?.trim();
  if (coluna) return coluna;
  const doBriefing = proj.briefing?.idioma?.trim();
  if (doBriefing) return doBriefing;
  return "pt-BR";
}

// ---------------------------------------------------------------------------
// Instruções derivadas do briefing
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Decisões explícitas do autor na entrevista → instruções camada 3.
 * Cobre o que o autor DECIDIU (tom, PdV, tempo verbal, proibições, cânone,
 * protagonista, antagonista) — o que é material de fundação (linha do tempo,
 * final) vai ao arquiteto_enredo via briefingParaFundacao, não a cada capítulo.
 */
export function instrucoesDoBriefing(b: BriefingAutor | null | undefined): Instrucao[] {
  if (!b) return [];
  const out: Instrucao[] = [];
  const add = (chave: string, texto: string) => {
    if (texto) out.push({ texto, camada: "decisao_autor", fonte: "autor:briefing", chave: `briefing.${chave}` });
  };
  const p = b.protagonista;
  if (p && str(p.nome)) {
    const detalhes = [
      str(p.ferida) && `ferida: ${str(p.ferida)}`,
      str(p.segredo) && `segredo: ${str(p.segredo)}`,
      str(p.desejo) && `desejo: ${str(p.desejo)}`,
    ].filter(Boolean).join("; ");
    add("protagonista", `Protagonista definido pelo autor: ${str(p.nome)}${detalhes ? ` (${detalhes})` : ""}.`);
  }
  if (str(b.antagonista)) add("antagonista", `Antagonista definido pelo autor: ${str(b.antagonista)}.`);
  if (str(b.tom)) add("tom", `Tom da obra (decisão do autor): ${str(b.tom)}.`);
  if (str(b.pdv)) add("pdv", `Ponto de vista (decisão do autor): ${str(b.pdv)}.`);
  if (str(b.tempo_verbal)) add("tempo_verbal", `Tempo verbal da narração (decisão do autor): ${str(b.tempo_verbal)}.`);
  if (str(b.canone)) add("canone", `Cânone estabelecido pelo autor (não contradizer): ${str(b.canone)}.`);
  if (str(b.proibido)) add("proibido", `Proibições do autor (nunca incluir): ${str(b.proibido)}.`);
  return out;
}

/** Decisões avulsas registradas pelo autor (wizard e página do projeto) → camada 3. */
export function decisoesAvulsas(b: BriefingAutor | null | undefined): Instrucao[] {
  return (b?.decisoes_autor ?? [])
    .filter((d) => typeof d?.texto === "string" && d.texto.trim())
    .map((d) => ({
      texto: d.texto!.trim(),
      camada: "decisao_autor" as const,
      fonte: `autor:${d.em ?? "briefing"}`,
    }));
}

/** Preferências não obrigatórias do autor → camada 7 (a mais fraca). */
export function preferenciasDoBriefing(b: BriefingAutor | null | undefined): Instrucao[] {
  return (b?.preferencias ?? [])
    .filter((p) => typeof p?.texto === "string" && p.texto.trim())
    .map((p) => ({
      texto: p.texto!.trim(),
      camada: "preferencia" as const,
      fonte: `autor:${p.em ?? "preferencia"}`,
    }));
}

// ---------------------------------------------------------------------------
// Briefing completo para a fundação (arquiteto_enredo)
// ---------------------------------------------------------------------------

export interface BriefingFundacao {
  titulo: string;
  premissa: string;
  totalCapitulos: number;
  idioma: string;
  /** Bloco legível com TODOS os campos presentes da entrevista (vazio se nenhum). */
  detalhes: string;
}

/** Renderiza os campos presentes do briefing num bloco legível para o arquiteto. */
export function renderizarDetalhesBriefing(b: BriefingAutor | null | undefined): string {
  if (!b) return "";
  const linhas: string[] = [];
  const add = (rotulo: string, valor: string) => {
    if (valor) linhas.push(`- ${rotulo}: ${valor}`);
  };
  add("Gênero", str(b.genero));
  if (b.serie != null && str(b.serie)) {
    add("Série", `${str(b.serie)} (volume ${b.volume ?? 1} de ${b.serie_total ?? 1})`);
  }
  const p = b.protagonista;
  if (p && (str(p.nome) || str(p.ferida) || str(p.segredo) || str(p.desejo))) {
    add(
      "Protagonista",
      [str(p.nome), str(p.ferida) && `ferida: ${str(p.ferida)}`, str(p.segredo) && `segredo: ${str(p.segredo)}`, str(p.desejo) && `desejo: ${str(p.desejo)}`]
        .filter(Boolean)
        .join("; ")
    );
  }
  add("Antagonista", str(b.antagonista));
  const pp = b.personagens;
  if (pp && (pp.protagonistas != null || pp.antagonistas != null || pp.apoio != null)) {
    add("Elenco", `${pp.protagonistas ?? 1} protagonista(s), ${pp.antagonistas ?? 1} antagonista(s), ${pp.apoio ?? 0} de apoio`);
  }
  add("Tom", str(b.tom));
  add("Ponto de vista", str(b.pdv));
  add("Tempo verbal", str(b.tempo_verbal));
  add("Linha do tempo", str(b.linha_tempo));
  add("Final planejado", str(b.final));
  add("Cânone (não contradizer)", str(b.canone));
  add("Proibições (nunca incluir)", str(b.proibido));
  return linhas.join("\n");
}

export function briefingParaFundacao(proj: {
  titulo?: string | null;
  total_capitulos?: number | null;
  idioma_origem?: string | null;
  briefing?: BriefingAutor | null;
}): BriefingFundacao {
  return {
    titulo: proj.titulo?.trim() || "Sem título",
    premissa: str(proj.briefing?.ideia_central),
    totalCapitulos: proj.total_capitulos ?? 0,
    idioma: resolverIdioma(proj),
    detalhes: renderizarDetalhesBriefing(proj.briefing),
  };
}
