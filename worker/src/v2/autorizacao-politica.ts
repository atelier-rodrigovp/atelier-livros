// Engine V2 — política de acesso da tabela de autorizações (defeito D4).
//
// As MESMAS regras que `supabase/engine_v2_autorizacoes.sql` impõe em RLS +
// trigger, expressas aqui como funções puras. Serve a dois propósitos:
//
// 1. testar o COMPORTAMENTO das regras sem um Postgres (o teste de contrato
//    sobre o texto do SQL, sozinho, é checagem estática — e checagem estática
//    nunca vale sozinha);
// 2. dar ao worker/UI uma pré-validação com a mesma semântica do banco, para a
//    recusa chegar com mensagem legível em vez de um erro cru do PostgREST.
//
// O banco continua sendo a autoridade: isto não substitui a RLS, espelha-a.

export interface LinhaAutorizacao {
  id: string;
  owner: string;
  project_id: string;
  modo: "producao" | "canario";
  autorizado_por: string;
  motivo: string;
  ativo: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface ContextoAcesso {
  /** Usuário autenticado (auth.uid()). */
  uid: string;
  /** Dono do projeto alvo, como está em `projects.owner`. */
  donoDoProjeto: string | null;
}

export type Veredito = { permitido: true } | { permitido: false; motivo: string };

const OK: Veredito = { permitido: true };
const nao = (motivo: string): Veredito => ({ permitido: false, motivo });

/** SELECT: cada um enxerga apenas as próprias autorizações. */
export function podeLer(linha: Pick<LinhaAutorizacao, "owner">, ctx: ContextoAcesso): Veredito {
  return linha.owner === ctx.uid ? OK : nao("autorização de outro proprietário");
}

/**
 * INSERT. Além de `owner = auth.uid()`, exige que o usuário seja o DONO DO
 * PROJETO — senão bastaria apontar o `project_id` alheio para autorizar a obra
 * de outra pessoa em nome próprio.
 */
export function podeInserir(nova: Omit<LinhaAutorizacao, "id">, ctx: ContextoAcesso): Veredito {
  if (nova.owner !== ctx.uid) return nao("owner precisa ser o usuário autenticado");
  if (ctx.donoDoProjeto === null) return nao("projeto inexistente");
  if (ctx.donoDoProjeto !== ctx.uid) return nao("o usuário não é o dono do projeto");
  if (!nova.ativo || nova.revoked_at !== null) return nao("autorização nasce ATIVA e sem revoked_at");
  if (!nova.autorizado_por.trim()) return nao("autorizado_por não pode ser vazio");
  if (!nova.motivo.trim()) return nao("motivo não pode ser vazio");
  if (nova.modo !== "producao" && nova.modo !== "canario") return nao("modo inválido");
  return OK;
}

/** Campos que nunca mudam depois de gravados — a trilha de quem liberou o quê. */
export const CAMPOS_HISTORICOS = [
  "id",
  "owner",
  "project_id",
  "modo",
  "autorizado_por",
  "motivo",
  "created_at",
] as const;

/**
 * UPDATE: a ÚNICA transição permitida é revogar (ativo true → false, carimbando
 * revoked_at). Qualquer alteração de campo histórico é recusada, e uma
 * autorização já revogada não muda mais.
 */
export function podeAtualizar(
  antiga: LinhaAutorizacao,
  nova: LinhaAutorizacao,
  ctx: ContextoAcesso
): Veredito {
  if (antiga.owner !== ctx.uid) return nao("autorização de outro proprietário");
  for (const campo of CAMPOS_HISTORICOS) {
    if (antiga[campo] !== nova[campo]) {
      return nao(`campo histórico "${campo}" é imutável (revogue e crie uma autorização nova)`);
    }
  }
  if (!antiga.ativo) return nao("autorização já revogada não muda mais");
  if (nova.ativo) return nao("o único update permitido é a revogação (ativo=false)");
  if (!nova.revoked_at) return nao("revogação exige revoked_at");
  return OK;
}

/** DELETE: nunca. Histórico não é apagado — é revogado. */
export function podeApagar(): Veredito {
  return nao("histórico não é apagado — revogue (ativo=false)");
}

/**
 * Aplica a revogação preservando tudo o mais. É a única forma correta de
 * "desautorizar": nada de UPDATE em modo/motivo nem DELETE.
 */
export function revogar(linha: LinhaAutorizacao, em: string): LinhaAutorizacao {
  return { ...linha, ativo: false, revoked_at: em };
}

/** No máximo uma autorização ATIVA por projeto (índice parcial único no banco). */
export function violaUnicidadeAtiva(existentes: LinhaAutorizacao[], nova: { project_id: string }): boolean {
  return existentes.some((l) => l.ativo && l.project_id === nova.project_id);
}
