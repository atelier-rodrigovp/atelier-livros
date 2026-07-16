// Contrato de progresso S7/1.4 (frontend) — RESOLVEDOR OPERACIONAL ÚNICO.
// Uma só função decide badge, mensagem, contadores, blocker humano, próxima ação,
// engine e botões. Dashboard, página do projeto e aba de escrita consomem ISTO —
// nenhuma tela reinterpreta estado. Substitui status.ts:displayProjectStatus,
// operationalStatus.ts:deriveWritingStatus e o inline de Projeto.tsx.
// Shape CONGELADO: docs/contrato-progresso/03-shape-resolvedor.md.
import type { Job } from "./types";
import { horaCurta } from "./status";
import { selecionarJobVigenteEscrita } from "./jobVigente";

// --- Progresso de escrita (shape canônico §2) --------------------------------
export interface ProgressoEscrita {
  fase?: string;
  cap_atual?: number;
  total?: number;
  palavras?: number;
  nota?: number | null;
  continua?: boolean;
  engine?: string;
  provedor?: string;
  modelo?: string;
  quality_status?: string;
  quality_stage?: string;
  quality_blockers?: string[];
  quality_categoria?: string; // SG1: recuperavel_qualidade | fundacao_pendente | decisao_autoral | circuit_breaker | ...
  quality_cap?: number | null; // capítulo bloqueado/em correção (do runner/worker)
  quality_motivo?: string;
  aguardando_reset?: boolean;
  retry_at?: string | null;
  motivo?: string;
  infrastructure_retry?: unknown;
  reducao_qualidade?: string;
  // SG3/SG6: espelho do ledger de correção automática (worker).
  correcao?: {
    ativa?: boolean;
    capitulo?: number | null;
    estagio?: string | null;
    degrau?: number | null;
    estrategia?: string | null;
    tentativa?: number | null;
    max_tentativas?: number;
    retry_at?: string | null;
    total_tentativas?: number;
    historico?: unknown[];
  } | null;
  // SG7: pendência de FUNDAÇÃO (não bloqueia a escrita; bloqueia a publicação).
  fundacao_status?: string;
  fundacao_blockers?: string[];
  reconciliacao_legada?: {
    estado?: string;
    detector_version?: string;
    hash_reconciliado?: string;
    tentativa?: number;
    estrategia?: string;
    resultado?: string;
    motivo?: string;
    job_origem?: string;
    job_retomada?: string;
  } | null;
}

export interface ChapterRow {
  numero: number;
  text_sha256?: string | null;
  quality_status?: string | null;
}

export type Situacao =
  | "executando"
  | "correcao_automatica" // correção automática em andamento (rodando agora)
  | "aguardando_correcao" // aguardando a próxima tentativa automática (retry_at)
  | "aguardando_cota"
  | "retry_infra"
  | "bloqueado_qualidade"
  | "circuit_breaker" // não convergiu no orçamento — decisão humana com diagnóstico
  | "aguardando_decisao"
  | "producao_desativada" // pausa GLOBAL do usuário (worker_control)
  | "pausado_manual"
  | "na_fila"
  | "interrompido_retomavel"
  | "concluido"
  | "sem_escrita";

export type Tone = "info" | "success" | "warning" | "danger" | "neutral";

export interface OperationalButton {
  id: string;
  label: string;
  habilitado: boolean;
}

export interface OperationalState {
  situacao: Situacao;
  badge: string;
  tone: Tone;
  mensagem_humana: string;
  diagnostico_tecnico: string | null;
  contadores: { produzidos: number; aprovados: number; sincronizados: number; em_correcao: number };
  capitulo_bloqueado: number | null;
  blocker_humano: string | null;
  proxima_acao: string | null;
  engine_info: { engine: string; provedor: string; modelo: string } | null;
  botoes: OperationalButton[];
  // SG7: pendência de fundação SEPARADA do bloqueio editorial do capítulo —
  // banner próprio; nunca some nem se mistura com o estado da escrita.
  aviso_fundacao: string | null;
  // SG6: detalhe da correção automática (degrau/tentativa/próxima janela).
  correcao_info: { capitulo: number | null; degrau: number | null; tentativa: number | null; max_tentativas: number | null; retry_at: string | null } | null;
}

export type JobLite = Pick<Job, "status" | "erro"> & { progresso?: ProgressoEscrita | null };

export interface ResolverInput {
  job: JobLite | null; // job de escrita VIGENTE (via selecionarJobVigenteEscrita)
  chapters: ChapterRow[]; // linhas de chapters da edição de origem
  totalCapitulos: number;
  workerOnline: boolean;
  producaoPausada?: boolean; // pausa POR PROJETO (briefing.producao_pausada)
  producaoGlobalAtiva?: boolean; // worker_control.enabled (default true) — pausa GLOBAL
  now?: number;
}

// Mapeia o tom do resolvedor para a variante de Badge (shadcn) usada nas telas.
export function toneToVariant(tone: Tone): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  switch (tone) {
    case "success": return "success";
    case "warning": return "warning";
    case "danger": return "destructive";
    case "info": return "warning";
    case "neutral": return "outline";
  }
}

// Situações em que a ESCRITA governa o cartão (senão, o ciclo do projeto manda).
export function escritaGovernaCartao(s: Situacao): boolean {
  return (
    s === "executando" || s === "correcao_automatica" || s === "aguardando_correcao" ||
    s === "bloqueado_qualidade" || s === "circuit_breaker" || s === "aguardando_decisao" ||
    s === "aguardando_cota" || s === "retry_infra" || s === "interrompido_retomavel" ||
    s === "producao_desativada" || s === "na_fila"
  );
}

const BLOQUEADO_DB = new Set(["blocked_quality", "blocked_infrastructure"]);

// Contadores semânticos (§3): derivados de chapters + progresso, SEM disco.
// INVARIANTE S3: o worker só sincroniza capítulos APROVADOS — logo, uma linha em
// `chapters` que não carrega status bloqueado é aprovada (linhas legadas sem
// hash/status contam como aprovadas, SEM afirmar "approved" no banco: é presunção
// de leitura, não escrita). Um capítulo bloqueado nunca ganha linha.
function contadores(chapters: ChapterRow[], pg: ProgressoEscrita) {
  const sincronizados = chapters.length;
  const aprovados = chapters.filter((c) => !(c.quality_status != null && BLOQUEADO_DB.has(c.quality_status))).length;
  const produzidos = Math.max(Number(pg.cap_atual ?? 0), sincronizados);
  const em_correcao =
    pg.quality_status === "blocked_quality" || pg.quality_status === "auto_correcao" || pg.correcao?.ativa ? 1 : 0;
  return { produzidos, aprovados, sincronizados, em_correcao };
}

// Humaniza o blocker do runner (§6): "muleta coisa/coisas 2x — L35..." → frase clara.
function humanizarBlocker(blockers: string[] | undefined, capitulo: number | null): string | null {
  if (!blockers || !blockers.length) return null;
  const b = blockers[0];
  const mMuleta = /muleta\s+([^\s]+)\s+(\d+)x/i.exec(b);
  if (mMuleta) {
    const palavra = mMuleta[1].split("/")[0];
    return `${mMuleta[2]} usos de "${palavra}"${capitulo ? ` no capítulo ${capitulo}` : ""} — trocar pelo referente concreto a que se refere.`;
  }
  if (/cadencia|cadência|anafora|anáfora|fragmento/i.test(b)) return `Ajuste de cadência${capitulo ? ` no capítulo ${capitulo}` : ""} (ritmo repetitivo).`;
  return b.length > 140 ? b.slice(0, 137) + "…" : b;
}

// Tradução da mensagem principal (§6): NUNCA o erro cru.
function traduzirMensagem(pg: ProgressoEscrita, capitulo: number | null): string {
  const stage = pg.quality_stage ?? "";
  if (pg.quality_status === "blocked_quality") {
    if (/REVISAO_CAPITULO/i.test(stage)) return `Capítulo ${capitulo ?? ""} precisa de uma correção de estilo antes de seguir.`.replace("  ", " ");
    if (/SPEC_CAPITULO/i.test(stage)) return `Capítulo ${capitulo ?? ""} não cumpriu a especificação estrutural.`.replace("  ", " ");
    if (/PUBLICATION_GATE/i.test(stage)) return "O livro ainda não está pronto para publicar (gate final).";
    return "Uma correção de qualidade é necessária antes de continuar.";
  }
  if (pg.quality_status === "blocked_infrastructure") return "Instabilidade técnica — retomando automaticamente.";
  return "";
}

export function resolveOperationalState(input: ResolverInput): OperationalState {
  const now = input.now ?? Date.now();
  const job = input.job;
  const pg: ProgressoEscrita = (job?.progresso ?? {}) as ProgressoEscrita;
  const cont = contadores(input.chapters, pg);
  const engine_info = pg.engine ? { engine: pg.engine, provedor: pg.provedor ?? "", modelo: pg.modelo ?? "" } : null;
  const retry = pg.retry_at ? Date.parse(pg.retry_at) : NaN;
  const retryFuturo = !Number.isNaN(retry) && retry > now;
  const emCorrecaoAuto = pg.quality_status === "auto_correcao" || pg.correcao?.ativa === true;
  const reconciliacaoLegada = !!pg.reconciliacao_legada;
  const capituloBloqueado =
    pg.quality_status === "blocked_quality" || emCorrecaoAuto
      ? (Number(pg.quality_cap ?? pg.correcao?.capitulo ?? pg.cap_atual ?? 0) || null)
      : null;
  const globalDesativada = input.producaoGlobalAtiva === false;

  // SG7: pendência de fundação — banner PRÓPRIO, nunca misturado ao capítulo.
  const aviso_fundacao =
    pg.fundacao_status === "reprovada"
      ? `Fundação com pendência (${(pg.fundacao_blockers ?? []).join(", ") || "gate reprovado"}) — a escrita continua; a publicação fica bloqueada até resolver.`
      : null;
  const correcao_info = pg.correcao
    ? {
        capitulo: pg.correcao.capitulo ?? null,
        degrau: pg.correcao.degrau ?? null,
        tentativa: pg.correcao.tentativa ?? null,
        max_tentativas: pg.correcao.max_tentativas ?? null,
        retry_at: pg.correcao.retry_at ?? null,
      }
    : null;

  // Botões contextuais (§7) montados ao fim conforme a situação.
  const botoes: OperationalButton[] = [];
  const add = (id: string, label: string, habilitado = true) => botoes.push({ id, label, habilitado });

  const base = {
    contadores: cont,
    capitulo_bloqueado: capituloBloqueado,
    engine_info,
    diagnostico_tecnico: job?.erro ?? pg.quality_motivo ?? pg.motivo ?? null,
    aviso_fundacao,
    correcao_info,
  };

  // Sem job de escrita: estado neutro (projeto ainda não escreveu ou só histórico).
  if (!job) {
    return { situacao: "sem_escrita", badge: "Sem escrita", tone: "neutral", mensagem_humana: "Escrita ainda não iniciada.", ...base, diagnostico_tecnico: null, blocker_humano: null, proxima_acao: cont.produzidos > 0 ? null : "Iniciar escrita", botoes };
  }

  // Hierarquia de precedência (§5).
  // 1a. correção automática RODANDO agora (o job foi reivindicado pelo worker).
  if (job.status === "running" && input.workerOnline && emCorrecaoAuto) {
    add("ver_diagnostico", "Ver diagnóstico");
    if (reconciliacaoLegada && pg.quality_stage === "SPEC_CAPITULO") {
      return { situacao: "correcao_automatica", badge: `Revalidando spec — cap ${capituloBloqueado ?? "?"}`, tone: "info", mensagem_humana: `Revalidando a spec do capítulo ${capituloBloqueado ?? "?"} com o detector atual; os capítulos já aprovados permanecem intactos.`, ...base, blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado), proxima_acao: null, botoes };
    }
    const t = pg.correcao?.tentativa ? ` (tentativa ${pg.correcao.tentativa}${pg.correcao?.max_tentativas ? `/${pg.correcao.max_tentativas}` : ""})` : "";
    return { situacao: "correcao_automatica", badge: capituloBloqueado ? `Correção automática — cap ${capituloBloqueado}` : "Correção automática", tone: "info", mensagem_humana: `Correção automática em andamento${capituloBloqueado ? ` no capítulo ${capituloBloqueado}` : ""}${t} — nenhum clique é necessário.`, ...base, blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado), proxima_acao: null, botoes };
  }
  // 1. executando
  if (job.status === "running" && input.workerOnline) {
    add("ver_diagnostico", "Ver diagnóstico");
    return { situacao: "executando", badge: `Escrevendo${pg.cap_atual ? ` (cap ${pg.cap_atual})` : ""}`, tone: "info", mensagem_humana: `Escrevendo o capítulo ${pg.cap_atual ?? "?"} de ${input.totalCapitulos || pg.total || "?"}.`, ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 8. interrompido recuperável (running mas sem heartbeat)
  if (job.status === "running" && !input.workerOnline) {
    return { situacao: "interrompido_retomavel", badge: "Interrompido — retoma do disco", tone: "warning", mensagem_humana: "Execução interrompida; retoma automaticamente do disco quando o worker voltar.", ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 2a. correção automática AGENDADA (queued + retry_at): sem clique — o worker
  // retoma sozinho na janela. Se a produção global estiver desativada, a verdade
  // é outra (ramo 5a): a retomada NÃO vai acontecer até religar.
  if (job.status === "queued" && emCorrecaoAuto && !globalDesativada) {
    const h = horaCurta(pg.correcao?.retry_at ?? pg.retry_at);
    const t = pg.correcao?.tentativa ? `tentativa ${pg.correcao.tentativa}${pg.correcao?.max_tentativas ? `/${pg.correcao.max_tentativas}` : ""}` : "próxima tentativa";
    if (!reconciliacaoLegada) add("tentar_agora", "Tentar agora"); // reconciliação já é automática
    add("ver_diagnostico", "Ver diagnóstico");
    if (reconciliacaoLegada) {
      const spec = pg.quality_stage === "SPEC_CAPITULO";
      return {
        situacao: "aguardando_correcao",
        badge: spec ? `Revalidando spec — cap ${capituloBloqueado ?? "?"}` : "Reavaliando bloqueio existente",
        tone: "info",
        mensagem_humana: spec
          ? `A spec do capítulo ${capituloBloqueado ?? "?"} será revalidada pelo detector atual; os ${cont.aprovados} capítulos aprovados permanecem intactos.`
          : "O bloqueio existente será reavaliado automaticamente, sem repetir trabalho já aprovado.",
        ...base,
        blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado),
        proxima_acao: null,
        botoes,
      };
    }
    return {
      situacao: "aguardando_correcao",
      badge: capituloBloqueado ? `Correção automática — cap ${capituloBloqueado}` : "Correção automática",
      tone: "info",
      mensagem_humana: `Correção automática do capítulo ${capituloBloqueado ?? "?"} agendada (${t}${h ? `, ~${h}` : ""}, degrau ${pg.correcao?.degrau ?? "?"}) — retoma sozinha, nenhum clique é necessário.`,
      ...base,
      blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado),
      proxima_acao: null,
      botoes,
    };
  }
  // 2. aguardando cota (limite do Max)
  if (job.status === "queued" && (pg.aguardando_reset || (retryFuturo && !pg.infrastructure_retry))) {
    const h = horaCurta(pg.retry_at);
    return { situacao: "aguardando_cota", badge: h ? `Aguardando cota — retoma ~${h}` : "Aguardando cota", tone: "warning", mensagem_humana: h ? `Aguardando a cota do plano — retoma ~${h}.` : "Aguardando a cota do plano.", ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 3. retry de infra agendado
  if (job.status === "queued" && pg.infrastructure_retry && retryFuturo) {
    return { situacao: "retry_infra", badge: "Retomada de infraestrutura agendada", tone: "warning", mensagem_humana: "Instabilidade técnica — retomando automaticamente.", ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 4a. circuit breaker (SG1-f): a engine tentou o orçamento inteiro e parou com
  // diagnóstico — aqui a decisão é humana de verdade.
  if (job.status === "paused" && pg.quality_categoria === "circuit_breaker") {
    const spec = pg.quality_stage === "SPEC_CAPITULO";
    add("corrigir", spec ? `Revalidar spec do capítulo ${capituloBloqueado ?? ""}`.trim() : `Corrigir capítulo ${capituloBloqueado ?? ""}`.trim());
    add("ver_diagnostico", "Ver diagnóstico");
    return {
      situacao: "circuit_breaker",
      badge: "Bloqueado após circuit breaker",
      tone: "danger",
      mensagem_humana: spec
        ? `O planejamento do capítulo ${capituloBloqueado ?? "?"} não passou após ${pg.correcao?.total_tentativas ?? "várias"} tentativa(s); os capítulos já aprovados permanecem intactos.`
        : `A correção automática do capítulo ${capituloBloqueado ?? "?"} não convergiu após ${pg.correcao?.total_tentativas ?? "várias"} tentativa(s) — decisão humana necessária (diagnóstico completo disponível).`,
      ...base,
      blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado),
      proxima_acao: spec
        ? `Revalidar o planejamento do capítulo ${capituloBloqueado ?? ""}`.trim()
        : `Revisar o diagnóstico e decidir o capítulo ${capituloBloqueado ?? ""}`.trim(),
      botoes,
    };
  }
  // 4b'. decisão autoral / fundação pendente (SG1-e / SG7-d): não é defeito de
  // capítulo nem falha técnica — o autor precisa decidir.
  if (job.status === "paused" && (pg.quality_categoria === "decisao_autoral" || pg.quality_categoria === "fundacao_pendente")) {
    const fundacao = pg.quality_categoria === "fundacao_pendente";
    add("corrigir", fundacao ? "Resolver fundação" : "Resolver pendência");
    add("ver_diagnostico", "Ver diagnóstico");
    return {
      situacao: "aguardando_decisao",
      badge: fundacao ? "Fundação pendente (bloqueia publicação)" : "Decisão autoral necessária",
      tone: "warning",
      mensagem_humana: fundacao
        ? "A publicação está bloqueada por uma inconsistência de fundação — os capítulos aprovados continuam intactos; decida a fundação para publicar."
        : "A engine parou num ponto que exige decisão autoral (ver diagnóstico).",
      ...base,
      blocker_humano: humanizarBlocker(pg.quality_blockers, capituloBloqueado),
      proxima_acao: fundacao ? "Resolver a fundação (refinar ou registrar exceção)" : "Registrar a decisão autoral",
      botoes,
    };
  }
  // 4. bloqueado por qualidade (legado/sem categoria — mantém o contrato anterior)
  if (job.status === "paused" && pg.quality_status === "blocked_quality") {
    const blocker = humanizarBlocker(pg.quality_blockers, capituloBloqueado);
    add("corrigir", `Corrigir capítulo ${capituloBloqueado ?? ""}`.trim());
    add("ver_diagnostico", "Ver diagnóstico");
    if (cont.produzidos > cont.sincronizados) add("reconciliar", "Reconciliar aprovados");
    add("continuar", `Continuar a partir do ${(capituloBloqueado ?? 0) + 1}`, false); // só após o bloqueado ser aprovado
    return { situacao: "bloqueado_qualidade", badge: capituloBloqueado ? `Correção necessária no cap ${capituloBloqueado}` : "Correção necessária", tone: "danger", mensagem_humana: traduzirMensagem(pg, capituloBloqueado), ...base, blocker_humano: blocker, proxima_acao: `Corrigir capítulo ${capituloBloqueado ?? ""}`.trim(), botoes };
  }
  // 4b. bloqueado por infraestrutura (paused)
  if (job.status === "paused" && pg.quality_status === "blocked_infrastructure") {
    return { situacao: "retry_infra", badge: "Bloqueado por infraestrutura", tone: "danger", mensagem_humana: traduzirMensagem(pg, null), ...base, blocker_humano: pg.motivo ?? null, proxima_acao: "Ver diagnóstico", botoes };
  }
  // 5a. produção GLOBAL desativada (worker_control): nada roda até religar — a
  // verdade da fila inteira; distinto da pausa por projeto e da correção.
  if (globalDesativada && (job.status === "queued" || job.status === "paused")) {
    return {
      situacao: "producao_desativada",
      badge: "Produção global desativada",
      tone: "neutral",
      mensagem_humana: emCorrecaoAuto
        ? "Produção global desativada — a correção automática agendada retoma quando você religar a produção."
        : "Produção global desativada — nada roda até religar (Configurações).",
      ...base,
      blocker_humano: null,
      proxima_acao: "Religar a produção (Configurações)",
      botoes,
    };
  }
  // 6. pausado manualmente (produção)
  if (input.producaoPausada && (job.status === "queued" || job.status === "paused")) {
    return { situacao: "pausado_manual", badge: "Produção pausada", tone: "neutral", mensagem_humana: "Produção deste projeto pausada — retoma quando você religar a fila.", ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 7. na fila
  if (job.status === "queued") {
    return { situacao: "na_fila", badge: "Na fila", tone: "neutral", mensagem_humana: "Na fila — aguardando o worker pegar o job.", ...base, blocker_humano: null, proxima_acao: null, botoes };
  }
  // 9. concluído
  if (job.status === "done") {
    add("ver_edicao", "Ver edição");
    return { situacao: "concluido", badge: "Concluído", tone: "success", mensagem_humana: "Escrita concluída.", ...base, diagnostico_tecnico: null, blocker_humano: null, proxima_acao: null, botoes };
  }
  // fallback (error/canceled/paused sem quality_status)
  return { situacao: "sem_escrita", badge: "Aguardando", tone: "neutral", mensagem_humana: job.erro ? "A escrita parou por um erro técnico (ver diagnóstico)." : "Aguardando.", ...base, blocker_humano: null, proxima_acao: null, botoes };
}

// Builder ÚNICO de entrada — as 3 telas (dashboard/projeto/escrita) DEVEM usar este
// para garantir paridade (mesma entrada → mesma saída). Recebe os jobs crus do
// projeto e seleciona o vigente internamente (S6).
export function buildResolverInput(args: {
  jobs: Array<{ id: string; tipo: string; created_at: string; status: Job["status"]; erro: string | null; progresso?: ProgressoEscrita | Record<string, unknown> | null }>;
  chapters: ChapterRow[];
  totalCapitulos: number;
  workerOnline: boolean;
  producaoPausada?: boolean;
  producaoGlobalAtiva?: boolean;
  now?: number;
}): ResolverInput {
  const vig = selecionarJobVigenteEscrita(args.jobs);
  return {
    job: vig ? { status: vig.status, erro: vig.erro, progresso: (vig.progresso ?? null) as ProgressoEscrita | null } : null,
    chapters: args.chapters,
    totalCapitulos: args.totalCapitulos,
    workerOnline: args.workerOnline,
    producaoPausada: args.producaoPausada,
    producaoGlobalAtiva: args.producaoGlobalAtiva,
    now: args.now,
  };
}
