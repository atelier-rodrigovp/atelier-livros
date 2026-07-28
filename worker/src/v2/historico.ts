// Engine V2 — histórico append-only (fatia P).
//
// As mesmas regras que `supabase/engine_v2_historico.sql` impõe em RLS +
// trigger, como funções puras: testáveis sem Postgres e usadas pelo worker para
// recusar com mensagem legível antes de bater no banco.
//
// A distinção que o módulo carrega: FATO DE AUDITORIA (o que aconteceu) é
// imutável; PREFERÊNCIA DO USUÁRIO (o que ele quer) é mutável e vive em outra
// tabela. Corrigir um fato NUNCA reescreve o anterior — gera um evento novo que
// o referencia.

export const TIPOS_EVENTO = [
  "capitulo_aprovado",
  "capitulo_reprovado",
  "gate_bloqueou",
  "correcao_tentada",
  "circuit_breaker",
  "revalidacao",
  "premissa_alterada",
  "briefing_aprovado",
  "canario_aprovado",
  "fundacao_gerada",
  "autorizacao_concedida",
  "autorizacao_revogada",
  "excecao_do_autor",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface EventoAuditoria {
  id: string;
  owner: string;
  project_id: string;
  tipo: TipoEvento;
  capitulo?: number;
  text_hash?: string;
  payload: Record<string, unknown>;
  /** Evento que este CORRIGE. A trilha fica encadeada, nunca sobrescrita. */
  corrige_id?: string;
  criado_em: string;
}

export type Veredito = { permitido: true } | { permitido: false; motivo: string };

const OK: Veredito = { permitido: true };
const nao = (motivo: string): Veredito => ({ permitido: false, motivo });

export interface ContextoHistorico {
  uid: string;
  donoDoProjeto: string | null;
  /** true quando quem escreve é o worker (service role). */
  ehWorker?: boolean;
}

/** SELECT: só o dono do evento. */
export function podeLerEvento(e: Pick<EventoAuditoria, "owner">, ctx: ContextoHistorico): Veredito {
  if (ctx.ehWorker) return OK;
  return e.owner === ctx.uid ? OK : nao("evento de outro proprietário");
}

/** INSERT: o worker anexa livremente; o usuário, só no próprio projeto. */
export function podeInserirEvento(
  e: Omit<EventoAuditoria, "id" | "criado_em">,
  ctx: ContextoHistorico
): Veredito {
  if (!(TIPOS_EVENTO as readonly string[]).includes(e.tipo)) return nao(`tipo de evento desconhecido: "${e.tipo}"`);
  if (ctx.ehWorker) return OK;
  if (e.owner !== ctx.uid) return nao("owner precisa ser o usuário autenticado");
  if (ctx.donoDoProjeto === null) return nao("projeto inexistente");
  if (ctx.donoDoProjeto !== ctx.uid) return nao("o usuário não é o dono do projeto");
  return OK;
}

/** UPDATE: NUNCA. Nem para o worker. */
export function podeAtualizarEvento(): Veredito {
  return nao(
    "engine_eventos_v2 é append-only: para corrigir um evento, insira outro com corrige_id apontando para ele"
  );
}

/** DELETE: NUNCA. */
export function podeApagarEvento(): Veredito {
  return nao("engine_eventos_v2 é append-only: eventos não são apagados");
}

/**
 * Corrigir um fato = novo evento encadeado. O anterior permanece exatamente
 * como foi gravado — é isso que torna a trilha auditável.
 */
export function corrigirEvento(
  anterior: EventoAuditoria,
  correcao: { payload: Record<string, unknown>; id: string; criado_em: string }
): EventoAuditoria {
  return {
    ...anterior,
    id: correcao.id,
    payload: correcao.payload,
    corrige_id: anterior.id,
    criado_em: correcao.criado_em,
  };
}

/** Cadeia de correções de um evento, do original ao mais recente. */
export function cadeiaDeCorrecoes(eventos: EventoAuditoria[], idOriginal: string): EventoAuditoria[] {
  const cadeia: EventoAuditoria[] = [];
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const original = porId.get(idOriginal);
  if (!original) return cadeia;
  cadeia.push(original);
  let atual = original;
  for (;;) {
    const proximo = eventos.find((e) => e.corrige_id === atual.id);
    if (!proximo) break;
    cadeia.push(proximo);
    atual = proximo;
  }
  return cadeia;
}

/** O valor VIGENTE de um fato: o último da cadeia. O original nunca some. */
export function eventoVigente(eventos: EventoAuditoria[], idOriginal: string): EventoAuditoria | undefined {
  const cadeia = cadeiaDeCorrecoes(eventos, idOriginal);
  return cadeia[cadeia.length - 1];
}

// ---------------------------------------------------------------------------
// Runs e reviews: histórico de execução já existente
// ---------------------------------------------------------------------------

export const STATUS_RUN_CONCLUIDO = ["ok", "falha", "cancelado"] as const;

/** Run concluído é histórico. Só o que ainda está `running` aceita update. */
export function podeAtualizarRun(status: string): Veredito {
  return (STATUS_RUN_CONCLUIDO as readonly string[]).includes(status)
    ? nao(`run concluído (${status}) é histórico e não muda`)
    : OK;
}

/** Parecer é histórico: não se reescreve nem se apaga. */
export function podeAlterarReview(): Veredito {
  return nao("engine_reviews é histórico: um parecer não é reescrito nem apagado");
}

// ---------------------------------------------------------------------------
// Preferências — mutáveis, e separadas do histórico de propósito
// ---------------------------------------------------------------------------

export interface Preferencia {
  owner: string;
  project_id: string;
  chave: string;
  valor: Record<string, unknown>;
}

export function podeEscreverPreferencia(p: Preferencia, ctx: ContextoHistorico): Veredito {
  if (p.owner !== ctx.uid) return nao("preferência de outro proprietário");
  if (ctx.donoDoProjeto !== ctx.uid) return nao("o usuário não é o dono do projeto");
  return OK;
}

/** Preferência é sempre atualizável — é a diferença em relação ao histórico. */
export function podeAtualizarPreferencia(p: Preferencia, ctx: ContextoHistorico): Veredito {
  return podeEscreverPreferencia(p, ctx);
}
