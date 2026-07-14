// Correção automática pós-gate (goal correcao-sem-clique, SG1/SG2/SG3/SG5).
// Decisão PURA sobre o que fazer quando um QualityBlockedError chega ao worker:
// classifica o bloqueio, consulta o ledger persistente de tentativas e decide o
// próximo degrau da escada — ou escala para decisão humana (circuit breaker).
// NUNCA aprova nada: a aprovação continua pertencendo aos MESMOS gates do runner,
// que recontam o texto do disco a cada tentativa.
import { classificarBlocker, DEGRAU_MINIMO, type CategoriaBlocker } from "./escada-correcao.js";

// SG1 — categorias persistidas de bloqueio. `paused`/decisão humana só para
// decisao_autoral, circuit_breaker e pausa_global (esta última é o worker_control,
// tratada fora daqui — nenhum job é reivindicado enquanto ativa).
export type CategoriaBloqueio =
  | "recuperavel_qualidade" // (a) qualidade editorial recuperável por correção automática
  | "infra_transitoria" // (b) falha transitória de infraestrutura (retry-policy.ts)
  | "quota_provedor" // (c) limite/indisponibilidade do provedor (limite-max.ts)
  | "fundacao_pendente" // (d) inconsistência de fundação que pode aguardar a publicação
  | "decisao_autoral" // (e) ambiguidade que exige decisão humana
  | "circuit_breaker" // (f) não convergência após o limite seguro
  | "pausa_global"; // (g) pausa deliberada do usuário

// Estágios de qualidade que o runner sabe recorrigir sozinho ao ser re-executado
// (retomável do disco; o gate reconta e só aprova quando a pós-condição passa).
const ESTAGIOS_RECUPERAVEIS = new Set([
  "REVISAO_CAPITULO",
  "SPEC_CAPITULO",
  "DESMANEIRISMO",
  "REVISAO_PROSA",
  "REVISAO_FINAL",
  "REAVALIACAO_FINAL",
]);

// Blockers de fundação (SG7): não são defeito do capítulo — podem aguardar até a
// publicação, mas nunca passam do gate final sem decisão humana.
const RE_BLOCKER_FUNDACAO = /PROTAGONISTA_INCOERENTE|FUNDACAO|CRAFT_AUSENTE|CRAFT_AGENTE|VOZ_NAO_REGISTRADA/i;

export function classificarBloqueio(stage: string, blockers: string[]): CategoriaBloqueio {
  if (ESTAGIOS_RECUPERAVEIS.has(stage)) return "recuperavel_qualidade";
  // Fundação reprovada no início da escrita: corrigir fundação é decisão autoral
  // (refinar_fundacao ou exceção explícita) — não há degrau automático seguro.
  if (stage === "GATE_FUNDACAO") return "decisao_autoral";
  if (stage === "PUBLICATION_GATE" || stage === "EPUB_PUBLICATION_GATE") {
    return blockers.some((b) => RE_BLOCKER_FUNDACAO.test(b)) ? "fundacao_pendente" : "decisao_autoral";
  }
  // Estágio desconhecido: conservador — não gastar créditos em loop cego.
  return "decisao_autoral";
}

// SG2 — degraus da escada (executados, não recomendados). O degrau 1 roda no
// worker (determinístico); 2–5 viram instrução de correção que o runner injeta no
// micro-loop escritor→revisor→editor; 6 autoriza modelo alternativo (revisor a
// opus); 7 é o circuit breaker (decisão humana com diagnóstico completo).
export const ESTRATEGIA_POR_DEGRAU: Record<number, string> = {
  1: "deterministico_seguro",
  2: "revisao_dirigida",
  3: "edicao_focalizada",
  4: "reescrita_focalizada",
  5: "revisao_ampla",
  6: "modelo_alternativo",
};
export const DEGRAU_MAXIMO = 6;

// SG3 — ledger persistente de tentativas (verdade no disco em
// quality/correcao-ledger.json; espelho resumido em jobs.progresso.correcao).
export interface TentativaCorrecao {
  tentativa: number;
  capitulo: number | null;
  estagio: string;
  categoria: CategoriaBloqueio;
  bloqueio: string[];
  hash_antes: string | null;
  degrau: number;
  estrategia: string;
  aplicado_em: string;
  retry_at: string | null;
  modelo: string | null;
  resultado: "pendente" | "aprovado" | "reprovado" | "circuit_breaker";
  hash_preparado?: string | null; // hash APÓS o preparo do degrau (ex.: degrau 1 alterou o texto)
  hash_depois?: string | null;
  encerramento?: string | null;
  retomada_automatica: boolean;
  decisao_humana?: string | null;
  custo_tokens?: number | null;
}

export interface CorrecaoLedger {
  versao: 1;
  projeto: string;
  capitulos: Record<string, TentativaCorrecao[]>;
}

export function ledgerVazio(projeto: string): CorrecaoLedger {
  return { versao: 1, projeto, capitulos: {} };
}

// Chave do ledger: capítulo quando o bloqueio é por capítulo; estágio quando é
// book-wide (DESMANEIRISMO/REVISAO_PROSA/etc. não têm capítulo único).
export function chaveLedger(capitulo: number | null, estagio: string): string {
  return capitulo != null ? `cap-${String(capitulo).padStart(2, "0")}` : `stage-${estagio}`;
}

// Orçamento (SG5): teto de tentativas automáticas por capítulo/estágio. Acima
// disso, circuit breaker — teto nunca aprova, só para com diagnóstico.
export const MAX_TENTATIVAS_AUTO = 5;

export type DecisaoCorrecao =
  | {
      acao: "corrigir";
      degrau: number;
      estrategia: string;
      retryAt: string;
      tentativa: TentativaCorrecao;
    }
  | {
      acao: "escalar_humano";
      categoria: Extract<CategoriaBloqueio, "circuit_breaker" | "decisao_autoral" | "fundacao_pendente">;
      motivo: string;
    };

// Backoff curto (qualidade não é rate limit): 90s dobrando, teto 30min.
export function backoffCorrecao(tentativa: number, agora: number): string {
  const delay = Math.min(30 * 60_000, 90_000 * 2 ** Math.max(0, tentativa - 1));
  return new Date(agora + delay).toISOString();
}

function pior(a: CategoriaBlocker, b: CategoriaBlocker): CategoriaBlocker {
  const ordem: CategoriaBlocker[] = ["mecanico_seguro", "lexical_prosa", "narrativo"];
  return ordem.indexOf(a) >= ordem.indexOf(b) ? a : b;
}

// Degrau inicial pelo TIPO de problema (SG2: "selecionados pelo tipo de problema").
// Blockers mistos começam no degrau mínimo da pior categoria presente.
export function degrauInicial(blockers: string[]): number {
  let cat: CategoriaBlocker = "mecanico_seguro";
  for (const b of blockers) cat = pior(cat, classificarBlocker(b));
  return DEGRAU_MINIMO[cat];
}

export interface EntradaDecisao {
  ledger: CorrecaoLedger;
  estagio: string;
  blockers: string[];
  capitulo: number | null;
  hashAtual: string | null; // hash do capítulo bloqueado no disco (null = book-wide)
  agora?: number;
  maxTentativas?: number;
  modeloAlternativo?: string | null; // degrau 6
}

// Decide a PRÓXIMA ação para um bloqueio recuperável. Regras (SG5):
// - orçamento por capítulo/estágio (maxTentativas) → circuit breaker ao esgotar;
// - nunca repetir a MESMA estratégia sobre o MESMO hash → escala o degrau;
// - degrau nunca desce; acima do degrau 6 → circuit breaker;
// - backoff exponencial curto entre tentativas.
export function decidirCorrecao(input: EntradaDecisao): DecisaoCorrecao {
  const agora = input.agora ?? Date.now();
  const max = input.maxTentativas ?? MAX_TENTATIVAS_AUTO;
  const chave = chaveLedger(input.capitulo, input.estagio);
  const anteriores = input.ledger.capitulos[chave] ?? [];
  const n = anteriores.length;

  if (n >= max) {
    return {
      acao: "escalar_humano",
      categoria: "circuit_breaker",
      motivo:
        `Circuit breaker: ${n} tentativa(s) automática(s) de correção em ${chave} sem convergência ` +
        `(orçamento ${max}). Blockers atuais: ${input.blockers.join("; ").slice(0, 400)}`,
    };
  }

  const ultima = anteriores[anteriores.length - 1] ?? null;
  let degrau = degrauInicial(input.blockers);
  if (ultima) {
    // Texto NÃO mudou desde o hash em que a estratégia anterior foi APLICADA
    // (hash_preparado ?? hash_antes) → mesma estratégia sobre o mesmo hash é
    // proibida (SG5): escalar o degrau.
    const hashAplicado = ultima.hash_preparado ?? ultima.hash_antes;
    const mesmoHash = input.hashAtual != null && input.hashAtual === hashAplicado;
    // Book-wide (sem hash de capítulo): duas passadas no mesmo degrau ⇒ escalar.
    const repeticoesNoDegrau = anteriores.filter((t) => t.degrau === ultima.degrau).length;
    const escalar = mesmoHash || input.hashAtual == null || repeticoesNoDegrau >= 2;
    degrau = Math.max(degrau, ultima.degrau + (escalar ? 1 : 0));
  }
  if (degrau > DEGRAU_MAXIMO) {
    return {
      acao: "escalar_humano",
      categoria: "circuit_breaker",
      motivo:
        `Circuit breaker: escada esgotada em ${chave} (todas as estratégias até o degrau ${DEGRAU_MAXIMO} ` +
        `aplicadas sem convergência). Blockers atuais: ${input.blockers.join("; ").slice(0, 400)}`,
    };
  }

  const numero = n + 1;
  const retryAt = backoffCorrecao(numero, agora);
  return {
    acao: "corrigir",
    degrau,
    estrategia: ESTRATEGIA_POR_DEGRAU[degrau],
    retryAt,
    tentativa: {
      tentativa: numero,
      capitulo: input.capitulo,
      estagio: input.estagio,
      categoria: "recuperavel_qualidade",
      bloqueio: input.blockers.slice(0, 12),
      hash_antes: input.hashAtual,
      degrau,
      estrategia: ESTRATEGIA_POR_DEGRAU[degrau],
      aplicado_em: new Date(agora).toISOString(),
      retry_at: retryAt,
      modelo: degrau === 6 ? (input.modeloAlternativo ?? "opus") : null,
      resultado: "pendente",
      retomada_automatica: true,
    },
  };
}

// Fecha a tentativa "pendente" mais recente da chave com o resultado observado.
// Idempotente: sem tentativa pendente, é no-op. Retorna true se algo mudou.
export function fecharTentativaPendente(
  ledger: CorrecaoLedger,
  chave: string,
  resultado: "aprovado" | "reprovado",
  hashDepois: string | null,
  encerramento?: string
): boolean {
  const tentativas = ledger.capitulos[chave] ?? [];
  for (let i = tentativas.length - 1; i >= 0; i--) {
    if (tentativas[i].resultado === "pendente") {
      tentativas[i] = {
        ...tentativas[i],
        resultado,
        hash_depois: hashDepois,
        ...(encerramento ? { encerramento } : {}),
      };
      return true;
    }
  }
  return false;
}

// Registra a tentativa decidida no ledger (append). Dedup por construção: se a
// última tentativa da chave ainda está "pendente" com o MESMO hash_antes e MESMA
// estratégia, não duplica (clique/mensagem repetida, SG4) — retorna a existente.
export function registrarTentativa(ledger: CorrecaoLedger, chave: string, t: TentativaCorrecao): TentativaCorrecao {
  const tentativas = (ledger.capitulos[chave] ??= []);
  const ultima = tentativas[tentativas.length - 1];
  if (
    ultima &&
    ultima.resultado === "pendente" &&
    ultima.hash_antes === t.hash_antes &&
    ultima.estrategia === t.estrategia
  ) {
    return ultima;
  }
  tentativas.push(t);
  return t;
}

// Resumo compacto para o espelho em jobs.progresso.correcao (SG6): a UI mostra
// degrau, tentativa e próxima janela sem carregar o ledger inteiro.
export interface ResumoCorrecao {
  ativa: boolean;
  capitulo: number | null;
  estagio: string | null;
  degrau: number | null;
  estrategia: string | null;
  tentativa: number | null;
  max_tentativas: number;
  retry_at: string | null;
  total_tentativas: number;
}

export function resumirLedger(ledger: CorrecaoLedger, maxTentativas = MAX_TENTATIVAS_AUTO): ResumoCorrecao | null {
  let pendente: TentativaCorrecao | null = null;
  let total = 0;
  for (const tentativas of Object.values(ledger.capitulos)) {
    total += tentativas.length;
    for (const t of tentativas) {
      if (t.resultado === "pendente" && (!pendente || t.aplicado_em > pendente.aplicado_em)) pendente = t;
    }
  }
  if (total === 0) return null;
  return {
    ativa: pendente != null,
    capitulo: pendente?.capitulo ?? null,
    estagio: pendente?.estagio ?? null,
    degrau: pendente?.degrau ?? null,
    estrategia: pendente?.estrategia ?? null,
    tentativa: pendente?.tentativa ?? null,
    max_tentativas: maxTentativas,
    retry_at: pendente?.retry_at ?? null,
    total_tentativas: total,
  };
}
