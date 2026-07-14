// Contrato de progresso (Fase 2, unidade 1.1/S2): resolvedor PURO do estado de um
// capítulo. Sem I/O — o caller lê disco/quality/banco/Storage e passa os fatos.
// Fonte de verdade explícita (docs/contrato-progresso/01-contrato.md §1.1):
//   disco (existe? piso?) · quality/capitulo-NN.json (gate/hash) · chapters (sync)
//   · Storage (disponível). Aprovação é vinculada ao hash: texto mudou → regride.
import { hashText, isPublishableQuality, stateForCurrentText } from "./quality-state.js";
import type { QualityBlocker, QualityState } from "./quality-state.js";

// Máquina de estados canônica (marco mais alto alcançado pelo capítulo).
export type ChapterPhase =
  | "ausente"
  | "produzido"
  | "acima_do_piso"
  | "em_revisao"
  | "correcao_necessaria"
  | "aprovado"
  | "aprovado_excepcionalmente"
  | "sincronizado"
  | "disponivel";

// Fatos físicos já lidos pelo caller (nenhuma leitura acontece aqui).
export interface ChapterFacts {
  numero: number;
  piso: number;
  diskExists: boolean;
  diskText?: string | null; // conteúdo do capitulo-NN.md, se existe
  revisado?: boolean; // marcador review/_revcap-NN.done presente
  qualityState?: QualityState | null; // quality/capitulo-NN.json já parseado
  dbRow?: { text_sha256?: string | null; quality_status?: string | null } | null; // linha em chapters
  storage?: { exists: boolean; hash?: string | null } | null; // objeto no Storage
}

export interface ChapterState {
  numero: number;
  phase: ChapterPhase;
  aprovado: boolean; // aprovação hash-bound vale para o texto atual do disco
  sincronizado: boolean; // durável em chapters com hash coincidente
  disponivel: boolean; // presente no Storage com o hash aprovado
  stale: boolean; // havia aprovação, mas o texto mudou (aprovação invalidada)
  legadoSemHash: boolean; // linha existe em chapters, mas sem text_sha256 (pré-contrato)
  hashDisco: string | null;
  hashAprovado: string | null; // textHash da decisão de qualidade vigente (se aprovado)
  blockers: QualityBlocker[];
  proximaAcao: string;
}

// Resolve o estado do capítulo a partir dos fatos. Puro e determinístico.
export function resolveChapterState(f: ChapterFacts): ChapterState {
  const base = {
    numero: f.numero,
    aprovado: false,
    sincronizado: false,
    disponivel: false,
    stale: false,
    legadoSemHash: false,
    hashDisco: null as string | null,
    hashAprovado: null as string | null,
    blockers: [] as QualityBlocker[],
  };

  if (!f.diskExists || f.diskText == null) {
    return { ...base, phase: "ausente", proximaAcao: "Escrever o capítulo." };
  }

  const hashDisco = hashText(f.diskText);
  const palavras = f.diskText.split(/\s+/).filter(Boolean).length;

  // Abaixo do piso: ainda "produzido", não elegível a revisão/aprovação.
  if (palavras < f.piso) {
    return { ...base, phase: "produzido", hashDisco, proximaAcao: `Ampliar até o piso (${palavras}/${f.piso} palavras).` };
  }

  // Avaliação de qualidade vigente para o TEXTO ATUAL (stateForCurrentText já
  // marca "stale" se o quality/capitulo-NN.json pertence a outro hash).
  const current = f.qualityState ? stateForCurrentText(f.qualityState, f.diskText) : null;
  const aprovado = current ? isPublishableQuality(current) : false;
  const stale = current?.status === "stale";
  const excecao = current?.status === "approved_with_exception";
  const blockers = current?.blockers ?? [];
  const hashAprovado = aprovado ? hashDisco : null;

  // Sincronizado: linha em chapters com hash coincidente ao aprovado. Linha sem
  // text_sha256 = legado pré-contrato (conta como sincronizado, hash desconhecido).
  const dbHash = f.dbRow?.text_sha256 ?? null;
  const legadoSemHash = !!f.dbRow && dbHash == null;
  const sincronizado = aprovado && (dbHash === hashDisco || legadoSemHash);
  // Disponível ao leitor: objeto no Storage com o hash aprovado (ou legado).
  const stHash = f.storage?.hash ?? null;
  const disponivel = sincronizado && !!f.storage?.exists && (stHash === hashDisco || stHash == null);

  const comuns = { ...base, hashDisco, hashAprovado, blockers, stale, legadoSemHash, aprovado, sincronizado, disponivel };

  if (aprovado) {
    if (disponivel) return { ...comuns, phase: "disponivel", proximaAcao: "Nenhuma — capítulo aprovado, sincronizado e disponível." };
    if (sincronizado) return { ...comuns, phase: "sincronizado", proximaAcao: "Publicar/disponibilizar ao leitor (Storage)." };
    return {
      ...comuns,
      phase: excecao ? "aprovado_excepcionalmente" : "aprovado",
      proximaAcao: "Sincronizar (Storage + banco) com a aprovação vinculada ao hash.",
    };
  }

  // Não aprovado.
  if (stale) return { ...comuns, phase: "correcao_necessaria", proximaAcao: "Texto mudou após aprovação — reexecutar os gates." };
  if (current && (current.status === "blocked_quality" || current.status === "rewrite_required")) {
    return { ...comuns, phase: "correcao_necessaria", proximaAcao: current.requiredAction ?? "Corrigir os blockers e recontar." };
  }
  // Tem quality pendente/avaliando OU marcador de revisão sem veredito → em revisão.
  if (f.revisado || current) return { ...comuns, phase: "em_revisao", proximaAcao: "Concluir a revisão (escritor→revisor→editor)." };
  // Acima do piso, sem qualquer sinal de revisão.
  return { ...comuns, phase: "acima_do_piso", proximaAcao: "Iniciar a revisão do capítulo." };
}

// Agregados semânticos para a UI/resolvedor único (um só lugar produz os contadores).
export interface ChapterAggregate {
  produzidos: number;
  aprovados: number;
  sincronizados: number;
  disponiveis: number;
  em_correcao: number;
  bloqueados: number[]; // números em correção_necessária
  maior_aprovado: number;
  maior_sincronizado: number;
}

// Decisão de sincronização (S3/1.2): só aprovados (hash-bound) cujo hash durável no
// banco difira do hash do disco. Idempotente por construção — re-sincronizar o mesmo
// hash é no-op. Um capítulo bloqueado (não aprovado) NUNCA é selecionado.
export function deveSincronizar(st: ChapterState, dbHashAtual: string | null): boolean {
  return st.aprovado && st.hashDisco != null && dbHashAtual !== st.hashDisco;
}

export function aggregateChapterStates(states: ChapterState[]): ChapterAggregate {
  const presentes = states.filter((s) => s.phase !== "ausente");
  const aprovados = presentes.filter((s) => s.aprovado);
  const sincronizados = presentes.filter((s) => s.sincronizado);
  const disponiveis = presentes.filter((s) => s.disponivel);
  const emCorrecao = presentes.filter((s) => s.phase === "correcao_necessaria");
  const maxNum = (arr: ChapterState[]) => (arr.length ? Math.max(...arr.map((s) => s.numero)) : 0);
  return {
    produzidos: presentes.length,
    aprovados: aprovados.length,
    sincronizados: sincronizados.length,
    disponiveis: disponiveis.length,
    em_correcao: emCorrecao.length,
    bloqueados: emCorrecao.map((s) => s.numero).sort((a, b) => a - b),
    maior_aprovado: maxNum(aprovados),
    maior_sincronizado: maxNum(sincronizados),
  };
}
