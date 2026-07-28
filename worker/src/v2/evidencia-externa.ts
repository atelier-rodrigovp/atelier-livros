// Evidência de verificação EXTERNA — o que um teste local não pode provar.
//
// Integração real com Supabase, download em sessão autenticada e smoke do
// provedor acontecem fora da máquina de teste. O risco óbvio é alguém marcar um
// checkbox e chamar isso de certificado. Um booleano solto não prova nada: não
// diz contra qual commit rodou, em qual ambiente, com qual schema, nem o que
// baixou.
//
// Aqui a evidência é um DOCUMENTO versionado, vinculado a um commit e a um
// conjunto de hashes do que estava valendo quando rodou. Mudou o worker, a
// interface, os contratos ou as migrations? A evidência que dependia daquilo
// deixa de valer sozinha — sem ninguém precisar lembrar de revogá-la.

export const SCHEMA_EVIDENCIA = "evidencia-externa/v1";

/** O que uma evidência externa pode atestar. Vocabulário fechado. */
export type TipoEvidencia =
  | "migracoes_remotas"
  | "integracao_real"
  | "ui_autenticada"
  | "provedor_real";

export type ResultadoEvidencia = "aprovado" | "reprovado";

export interface ArtefatoEvidencia {
  /** O que é (ex.: "capitulo-01.md", "estrutura.json"). */
  nome: string;
  /** Hash do conteúdo REALMENTE baixado, não do que se esperava. */
  hash: string;
  /** Bytes recebidos — pega download truncado que "abriu" mas veio vazio. */
  bytes: number;
}

export interface PassoEvidencia {
  passo: string;
  resultado: ResultadoEvidencia;
  detalhe?: string;
}

/**
 * Impressão do código que estava valendo. Se qualquer uma mudar, a evidência
 * que dependia dela caduca — é o que impede "rodei semana passada, vale".
 */
export interface DependenciasEvidencia {
  /** Commit exato em que a verificação rodou. */
  commit: string;
  /** Versão das migrations aplicadas (nome do último arquivo, ou hash). */
  migrations_versao: string;
  /** Hash do schema observado no banco. */
  schema_hash: string;
  /** Hash agregado dos contratos de skill. */
  contratos_hash: string;
  /** Hash agregado do código do worker. */
  worker_hash: string;
  /** Hash agregado do código da interface. */
  interface_hash: string;
}

export interface EvidenciaExterna {
  schema: typeof SCHEMA_EVIDENCIA;
  tipo: TipoEvidencia;
  /** ISO 8601. */
  executado_em: string;
  /** Ambiente alvo — evidência de `local` não certifica `producao`. */
  ambiente: "local" | "staging" | "producao";
  /** Projeto usado na verificação. */
  project_id: string;
  /** Identificador técnico do executor. Nunca e-mail nem nome. */
  executor_ref: string;
  dependencias: DependenciasEvidencia;
  passos: PassoEvidencia[];
  artefatos: ArtefatoEvidencia[];
  erros: string[];
  resultado: ResultadoEvidencia;
}

export interface ValidacaoEvidencia {
  valida: boolean;
  motivos: string[];
}

const CAMPOS_DEPENDENCIA: (keyof DependenciasEvidencia)[] = [
  "commit",
  "migrations_versao",
  "schema_hash",
  "contratos_hash",
  "worker_hash",
  "interface_hash",
];

/**
 * Uma evidência só vale contra o estado ATUAL do repositório e para o ambiente
 * pedido. Qualquer divergência a invalida — nunca "aproveita" a antiga.
 */
export function validarEvidencia(
  ev: unknown,
  esperado: { tipo: TipoEvidencia; ambiente: EvidenciaExterna["ambiente"]; dependencias: DependenciasEvidencia }
): ValidacaoEvidencia {
  const motivos: string[] = [];
  if (!ev || typeof ev !== "object") return { valida: false, motivos: ["evidência ausente ou não é um objeto"] };
  const e = ev as Partial<EvidenciaExterna>;

  if (e.schema !== SCHEMA_EVIDENCIA) motivos.push(`schema inesperado: ${String(e.schema)}`);
  if (e.tipo !== esperado.tipo) motivos.push(`tipo ${String(e.tipo)} não atesta ${esperado.tipo}`);

  // Falha NUNCA vira aprovação. Nem por resultado declarado, nem por passo
  // reprovado, nem por erro registrado — os três precisam concordar.
  if (e.resultado !== "aprovado") motivos.push(`resultado é ${String(e.resultado)}`);
  if (Array.isArray(e.erros) && e.erros.length > 0) motivos.push(`${e.erros.length} erro(s) registrados`);
  if (!Array.isArray(e.passos) || e.passos.length === 0) motivos.push("nenhum passo registrado");
  else {
    const ruins = e.passos.filter((p) => p?.resultado !== "aprovado");
    if (ruins.length) motivos.push(`${ruins.length} passo(s) não aprovados: ${ruins.map((p) => p?.passo).join(", ")}`);
  }

  // Ambiente diferente não vale: passar em `local` não diz nada sobre produção.
  if (e.ambiente !== esperado.ambiente) motivos.push(`ambiente ${String(e.ambiente)} ≠ ${esperado.ambiente}`);

  if (!e.project_id) motivos.push("project_id ausente");
  if (!e.executor_ref) motivos.push("executor_ref ausente");
  if (!e.executado_em || Number.isNaN(Date.parse(e.executado_em))) motivos.push("executado_em ausente ou inválido");

  // O coração: a evidência caduca quando o que ela mediu mudou.
  const dep = e.dependencias;
  if (!dep || typeof dep !== "object") motivos.push("dependencias ausentes");
  else {
    for (const campo of CAMPOS_DEPENDENCIA) {
      const tem = dep[campo];
      if (!tem) {
        motivos.push(`dependencias.${campo} ausente`);
        continue;
      }
      if (tem !== esperado.dependencias[campo]) {
        motivos.push(`dependencias.${campo} mudou desde a verificação (${tem} ≠ ${esperado.dependencias[campo]})`);
      }
    }
  }

  // Verificação que baixa arquivo precisa provar o que baixou.
  if (esperado.tipo === "integracao_real" || esperado.tipo === "ui_autenticada") {
    if (!Array.isArray(e.artefatos) || e.artefatos.length === 0) {
      motivos.push("nenhum artefato baixado registrado");
    } else {
      for (const a of e.artefatos) {
        if (!a?.hash) motivos.push(`artefato ${a?.nome ?? "?"} sem hash`);
        if (!a?.bytes) motivos.push(`artefato ${a?.nome ?? "?"} com 0 byte`);
      }
    }
  }

  return { valida: motivos.length === 0, motivos };
}
