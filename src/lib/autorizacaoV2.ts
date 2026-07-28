// Autorização do projeto na tela.
//
// `engine_autorizacoes_v2` decide se um projeto pode executar na V2, e a
// interface não lia essa tabela: o autor via botões cinzas sem saber que o
// motivo era autorização, e não defeito.
//
// Fail-closed por construção: erro de consulta, tabela ausente (migration ainda
// não aplicada) e linha inexistente são estados DIFERENTES e nenhum deles vira
// "autorizado". Erro de banco jamais pode virar sucesso visual.

export interface AutorizacaoV2Row {
  project_id: string;
  modo: string;
  autorizado_por: string;
  motivo: string;
  ativo: boolean;
  revoked_at: string | null;
  created_at: string;
}

export type EstadoAutorizacao =
  | { estado: "autorizado"; modo: string; por: string; motivo: string; desde: string }
  | { estado: "revogada"; por: string; motivo: string; em: string }
  | { estado: "nao_autorizado" }
  | { estado: "indisponivel"; detalhe: string };

/** Código do Postgres para "relação não existe" — migration ainda não aplicada. */
const TABELA_AUSENTE = "42P01";

export function interpretarAutorizacao(
  linhas: AutorizacaoV2Row[] | null,
  erro?: { code?: string; message?: string } | null
): EstadoAutorizacao {
  if (erro) {
    if (erro.code === TABELA_AUSENTE) {
      return { estado: "indisponivel", detalhe: "a migration `engine_v2_autorizacoes.sql` ainda não foi aplicada neste banco" };
    }
    return { estado: "indisponivel", detalhe: `não foi possível ler a autorização: ${erro.message ?? erro.code ?? "erro desconhecido"}` };
  }
  if (!linhas) return { estado: "indisponivel", detalhe: "consulta de autorização não retornou dados" };

  const ativa = linhas.find((l) => l.ativo && !l.revoked_at);
  if (ativa) {
    return { estado: "autorizado", modo: ativa.modo, por: ativa.autorizado_por, motivo: ativa.motivo, desde: ativa.created_at };
  }
  // Revogação é fato do histórico e precisa continuar visível: some da tela e o
  // autor não distingue "nunca autorizei" de "eu mesmo revoguei".
  const revogadas = linhas.filter((l) => l.revoked_at).sort((a, b) => String(b.revoked_at).localeCompare(String(a.revoked_at)));
  if (revogadas.length) {
    const r = revogadas[0];
    return { estado: "revogada", por: r.autorizado_por, motivo: r.motivo, em: String(r.revoked_at) };
  }
  return { estado: "nao_autorizado" };
}

export interface RotuloAutorizacao {
  titulo: string;
  /** O que falta para destravar. Nunca vazio quando não está autorizado. */
  detalhe: string;
  autorizado: boolean;
}

export function rotularAutorizacao(e: EstadoAutorizacao): RotuloAutorizacao {
  switch (e.estado) {
    case "autorizado":
      return {
        titulo: `Projeto autorizado (${e.modo})`,
        detalhe: `por ${e.por} — ${e.motivo}`,
        autorizado: true,
      };
    case "revogada":
      return {
        titulo: "Autorização revogada",
        detalhe: `revogada em ${e.em}; a autorização anterior era de ${e.por} — ${e.motivo}. Registre uma nova para voltar a executar.`,
        autorizado: false,
      };
    case "nao_autorizado":
      return {
        titulo: "Projeto não autorizado",
        detalhe:
          "nenhuma autorização ativa em `engine_autorizacoes_v2`. A execução V2 é fail-closed: registre a autorização com quem autoriza e o motivo.",
        autorizado: false,
      };
    case "indisponivel":
      return { titulo: "Autorização indisponível", detalhe: e.detalhe, autorizado: false };
  }
}
