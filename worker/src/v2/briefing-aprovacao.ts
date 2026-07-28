// Engine V2 — cobertura da entrevista e APROVAÇÃO do briefing (fatia E).
//
// Dois defeitos que este módulo fecha:
//
// 1. a entrevista aceitava omissão. Um campo narrativo em branco virava default
//    silencioso lá na fundação — o modelo inventava o tom, o POV, o tempo
//    verbal, e o autor descobria lendo o livro pronto;
// 2. não havia aprovação. A fundação era gerada direto do que estivesse gravado,
//    inclusive contraditório, e nada registrava que o autor tinha visto aquilo.
//
// Regra: cada decisão relevante recebe RESPOSTA EXPLÍCITA ou um `não se aplica`
// também explícito, com justificativa. Silêncio nunca é resposta.

import { hashJsonCanonico } from "./hash.js";
import type { BriefingAutor } from "./briefing.js";

/** Marcador de "não se aplica" explícito. Qualquer outro texto é resposta. */
export const NAO_SE_APLICA = "nao_se_aplica" as const;

export interface RespostaBriefing {
  /** Texto da resposta, ou o marcador `nao_se_aplica`. */
  valor: string;
  /** Obrigatória quando `valor === NAO_SE_APLICA`: por que não se aplica. */
  justificativa?: string;
}

export interface CampoEntrevista {
  id: string;
  pergunta: string;
  /** `sempre` = toda obra precisa; `condicional` = depende de outra resposta. */
  natureza: "sempre" | "condicional";
  /** Quando condicional: o campo só é exigido se este predicado for verdadeiro. */
  exigidoQuando?: (b: BriefingAutor) => boolean;
  /** Onde a resposta vive em `projects.briefing` (fonte única de autoridade). */
  caminho: string;
}

const temSerie = (b: BriefingAutor) => Boolean(b.serie && String(b.serie).trim());
const temProtagonista = (b: BriefingAutor) => Boolean(b.protagonista?.nome?.trim());

/**
 * Cobertura da entrevista. Cada item aqui é uma decisão que muda a obra — e por
 * isso não pode sair de um default.
 */
export const CAMPOS_ENTREVISTA: CampoEntrevista[] = [
  { id: "ideia_central", pergunta: "Qual é a ideia central da obra?", natureza: "sempre", caminho: "ideia_central" },
  { id: "autor", pergunta: "Quem assina a obra?", natureza: "sempre", caminho: "autor" },
  { id: "idioma", pergunta: "Em que idioma e variante a obra é escrita?", natureza: "sempre", caminho: "idioma" },
  { id: "genero", pergunta: "Qual é o gênero?", natureza: "sempre", caminho: "genero" },
  { id: "tom", pergunta: "Qual é o tom?", natureza: "sempre", caminho: "tom" },
  { id: "pdv", pergunta: "Qual é o ponto de vista?", natureza: "sempre", caminho: "pdv" },
  { id: "tempo_verbal", pergunta: "Qual é o tempo verbal?", natureza: "sempre", caminho: "tempo_verbal" },
  { id: "linha_tempo", pergunta: "Como é a cronologia?", natureza: "sempre", caminho: "linha_tempo" },
  { id: "final", pergunta: "Qual é a natureza do final?", natureza: "sempre", caminho: "final" },
  { id: "antagonista", pergunta: "Quem (ou o quê) é a força antagônica?", natureza: "sempre", caminho: "antagonista" },
  { id: "canone", pergunta: "Há cânone a respeitar?", natureza: "sempre", caminho: "canone" },
  { id: "proibido", pergunta: "O que é proibido nesta obra?", natureza: "sempre", caminho: "proibido" },
  { id: "protagonista.nome", pergunta: "Quem é o protagonista?", natureza: "sempre", caminho: "protagonista.nome" },
  // Condicionais: só fazem sentido quando o anterior existe.
  {
    id: "protagonista.ferida",
    pergunta: "Qual é a ferida do protagonista?",
    natureza: "condicional",
    exigidoQuando: temProtagonista,
    caminho: "protagonista.ferida",
  },
  {
    id: "protagonista.desejo",
    pergunta: "Qual é o desejo do protagonista?",
    natureza: "condicional",
    exigidoQuando: temProtagonista,
    caminho: "protagonista.desejo",
  },
  {
    id: "protagonista.segredo",
    pergunta: "Qual é o segredo do protagonista?",
    natureza: "condicional",
    exigidoQuando: temProtagonista,
    caminho: "protagonista.segredo",
  },
  {
    id: "serie_total",
    pergunta: "Quantos volumes tem a série?",
    natureza: "condicional",
    exigidoQuando: temSerie,
    caminho: "serie_total",
  },
  {
    id: "volume",
    pergunta: "Este é qual volume da série?",
    natureza: "condicional",
    exigidoQuando: temSerie,
    caminho: "volume",
  },
];

function ler(b: BriefingAutor, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((acc, parte) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[parte];
  }, b);
}

export type MotivoLacuna = "sem_resposta" | "nao_se_aplica_sem_justificativa";

export interface Lacuna {
  campo: string;
  pergunta: string;
  motivo: MotivoLacuna;
}

/**
 * Campos exigidos que não têm resposta explícita. Um campo condicional cujo
 * gatilho não ocorreu simplesmente não é exigido — e isso não é lacuna.
 */
export function lacunasDoBriefing(b: BriefingAutor): Lacuna[] {
  const out: Lacuna[] = [];
  for (const campo of CAMPOS_ENTREVISTA) {
    if (campo.natureza === "condicional" && !campo.exigidoQuando?.(b)) continue;
    const bruto = ler(b, campo.caminho);
    const valor = typeof bruto === "string" ? bruto.trim() : bruto == null ? "" : String(bruto);
    if (!valor) {
      out.push({ campo: campo.id, pergunta: campo.pergunta, motivo: "sem_resposta" });
      continue;
    }
    // `não se aplica` é resposta LEGÍTIMA — desde que justificada.
    if (valor === NAO_SE_APLICA || valor.toLowerCase() === "não se aplica") {
      const just = String(ler(b, `${campo.caminho}_justificativa`) ?? "").trim();
      if (just.length < 10) {
        out.push({ campo: campo.id, pergunta: campo.pergunta, motivo: "nao_se_aplica_sem_justificativa" });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conflitos: uma única fonte de autoridade por dado
// ---------------------------------------------------------------------------

export interface ConflitoBriefing {
  campo: string;
  valorBriefing: string;
  valorColuna: string;
  detalhe: string;
}

/**
 * O wizard grava algumas decisões em COLUNAS de `projects` e a entrevista as
 * grava em `projects.briefing`. Quando divergem, o autor tem de escolher — a
 * engine não elege vencedor em silêncio.
 */
export function conflitosDoBriefing(
  b: BriefingAutor,
  colunas: { idioma_origem?: string | null; total_capitulos?: number | null; skill_escrita?: string | null }
): ConflitoBriefing[] {
  const out: ConflitoBriefing[] = [];
  const idiomaBriefing = (b.idioma ?? "").trim();
  const idiomaColuna = (colunas.idioma_origem ?? "").trim();
  if (idiomaBriefing && idiomaColuna && idiomaBriefing !== idiomaColuna) {
    out.push({
      campo: "idioma",
      valorBriefing: idiomaBriefing,
      valorColuna: idiomaColuna,
      detalhe: "a entrevista e o wizard registraram idiomas diferentes para a mesma obra",
    });
  }
  const volume = Number(b.volume ?? 0);
  const totalSerie = Number(b.serie_total ?? 0);
  if (volume && totalSerie && volume > totalSerie) {
    out.push({
      campo: "volume",
      valorBriefing: String(volume),
      valorColuna: String(totalSerie),
      detalhe: "o volume declarado é maior que o total de volumes da série",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------------

export interface BriefingAprovado {
  schema: "briefing-aprovado/v1";
  hash: string;
  aprovado_por: string;
  aprovado_em: string;
  /** Cópia exata do que foi aprovado — a fundação é gerada DESTA versão. */
  briefing: BriefingAutor;
}

/** Hash canônico do briefing: muda se qualquer decisão mudar. */
export function hashBriefing(b: BriefingAutor): string {
  return hashJsonCanonico(b);
}

export interface ResultadoConsolidacao {
  /** Pode gerar fundação? */
  pronto: boolean;
  lacunas: Lacuna[];
  conflitos: ConflitoBriefing[];
  hash: string;
  /** Texto para o autor revisar antes de aprovar. */
  resumo: string;
}

/**
 * Briefing consolidado para o autor aprovar. Lacuna ou conflito impede a
 * aprovação: um briefing contraditório nunca vira fundação.
 */
export function consolidarBriefing(
  b: BriefingAutor,
  colunas: { idioma_origem?: string | null; total_capitulos?: number | null; skill_escrita?: string | null } = {}
): ResultadoConsolidacao {
  const lacunas = lacunasDoBriefing(b);
  const conflitos = conflitosDoBriefing(b, colunas);
  const linhas: string[] = [];
  for (const campo of CAMPOS_ENTREVISTA) {
    if (campo.natureza === "condicional" && !campo.exigidoQuando?.(b)) continue;
    const bruto = ler(b, campo.caminho);
    const valor = bruto == null || bruto === "" ? "(sem resposta)" : String(bruto);
    linhas.push(`- ${campo.pergunta} ${valor}`);
  }
  if (conflitos.length) {
    linhas.push("", "CONFLITOS (o autor precisa decidir):");
    for (const c of conflitos) linhas.push(`- ${c.campo}: "${c.valorBriefing}" (entrevista) vs "${c.valorColuna}" (wizard) — ${c.detalhe}`);
  }
  return {
    pronto: lacunas.length === 0 && conflitos.length === 0,
    lacunas,
    conflitos,
    hash: hashBriefing(b),
    resumo: linhas.join("\n"),
  };
}

export type MotivoRecusa =
  | "briefing_nao_aprovado"
  | "briefing_com_lacunas"
  | "briefing_com_conflitos"
  | "briefing_alterado_apos_aprovacao";

/**
 * Portão da fundação: só gera com um briefing APROVADO e cujo hash ainda bate.
 * Alterar o briefing depois de aprovado invalida a aprovação — senão a fundação
 * sairia de um texto que o autor nunca viu.
 */
export function autorizarFundacao(
  b: BriefingAutor,
  aprovacao: BriefingAprovado | null | undefined,
  colunas: { idioma_origem?: string | null; total_capitulos?: number | null; skill_escrita?: string | null } = {}
): { permitido: true } | { permitido: false; motivo: MotivoRecusa; detalhe: string } {
  const consolidado = consolidarBriefing(b, colunas);
  if (consolidado.lacunas.length) {
    return {
      permitido: false,
      motivo: "briefing_com_lacunas",
      detalhe: `${consolidado.lacunas.length} decisão(ões) sem resposta explícita: ${consolidado.lacunas
        .map((l) => l.campo)
        .slice(0, 6)
        .join(", ")}`,
    };
  }
  if (consolidado.conflitos.length) {
    return {
      permitido: false,
      motivo: "briefing_com_conflitos",
      detalhe: consolidado.conflitos.map((c) => `${c.campo}: ${c.detalhe}`).join(" · "),
    };
  }
  if (!aprovacao) {
    return { permitido: false, motivo: "briefing_nao_aprovado", detalhe: "o autor ainda não aprovou o briefing consolidado" };
  }
  if (aprovacao.hash !== consolidado.hash) {
    return {
      permitido: false,
      motivo: "briefing_alterado_apos_aprovacao",
      detalhe: `o briefing mudou depois da aprovação (aprovado ${aprovacao.hash.slice(0, 12)}, atual ${consolidado.hash.slice(0, 12)})`,
    };
  }
  return { permitido: true };
}

/** Registra a aprovação do autor sobre a versão exata que ele viu. */
export function aprovarBriefing(b: BriefingAutor, por: string, em: string): BriefingAprovado {
  return {
    schema: "briefing-aprovado/v1",
    hash: hashBriefing(b),
    aprovado_por: por,
    aprovado_em: em,
    briefing: b,
  };
}
