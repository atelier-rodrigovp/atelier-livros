// Correção automática pós-gate — camada de I/O (SG2/SG3/SG4). Liga a decisão pura
// (correcao-automatica.ts) ao disco do projeto e ao contrato com o runner:
//  - ledger persistente em quality/correcao-ledger.json (verdade no disco);
//  - preparo do degrau: determinístico no worker (1), instrução de correção que o
//    runner injeta no micro-loop (2–6) e concessão de UMA nova tentativa limitada
//    (remoção do marcador .try / ajuste do contador book-wide);
//  - patch de job para o worker reagendar (queued + retry_at) ou escalar (paused).
// Nenhum gate é enfraquecido: quem aprova segue sendo a recontagem do runner.
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hashText } from "./quality-state.js";
import { degrau1Deterministico } from "./escada-correcao.js";
import {
  chaveLedger,
  classificarBloqueio,
  decidirCorrecao,
  fecharTentativaPendente,
  ledgerVazio,
  MAX_TENTATIVAS_AUTO,
  registrarTentativa,
  resumirLedger,
  type CategoriaBloqueio,
  type CorrecaoLedger,
  type DecisaoCorrecao,
  type ResumoCorrecao,
} from "./correcao-automatica.js";

// Helpers locais de I/O (não importar lib.ts aqui: lib→supabase exige .env e
// inviabilizaria os testes deste módulo; o projDir real entra por import dinâmico).
async function readText(p: string): Promise<string> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}
async function exists(p: string): Promise<boolean> {
  try {
    await (await import("node:fs/promises")).access(p);
    return true;
  } catch {
    return false;
  }
}

const LEDGER_REL = path.join("quality", "correcao-ledger.json");

export function ledgerPath(dir: string): string {
  return path.join(dir, LEDGER_REL);
}

export async function carregarLedger(dir: string, projeto: string): Promise<CorrecaoLedger> {
  try {
    const bruto = JSON.parse(await readFile(ledgerPath(dir), "utf8")) as CorrecaoLedger;
    if (bruto && bruto.versao === 1 && bruto.capitulos) return bruto;
  } catch {
    /* primeiro uso ou arquivo ilegível → ledger novo (append-only, nada a perder) */
  }
  return ledgerVazio(projeto);
}

export async function salvarLedger(dir: string, ledger: CorrecaoLedger): Promise<void> {
  await mkdir(path.dirname(ledgerPath(dir)), { recursive: true });
  await writeFile(ledgerPath(dir), JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

function capFile(dir: string, n: number): string {
  return path.join(dir, "manuscrito", `capitulo-${String(n).padStart(2, "0")}.md`);
}
function revTryFile(dir: string, n: number): string {
  return path.join(dir, "review", `_revcap-${String(n).padStart(2, "0")}.try`);
}
function specTryFile(dir: string, n: number): string {
  return path.join(dir, "specs", `_spec-${String(n).padStart(2, "0")}.try`);
}
function instrucaoFile(dir: string, n: number): string {
  return path.join(dir, "review", `_correcao-cap-${String(n).padStart(2, "0")}.json`);
}

async function lerEstado(dir: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, "ESTADO_LIVRO.json"), "utf8"));
  } catch {
    return null;
  }
}

// Capítulo bloqueado: preferir o quality_cap gravado pelo runner; fallback pelos
// marcadores .try (garantidos no bloqueio — o runner só bloqueia com ja_tentou).
export async function capituloBloqueado(dir: string, stage: string): Promise<number | null> {
  const st = await lerEstado(dir);
  // quality_cap só vale para o bloqueio ATUAL (mesmo estágio) — nunca stale.
  const doEstado = Number(st?.quality_cap);
  if (st?.quality_stage === stage && Number.isFinite(doEstado) && doEstado > 0) return doEstado;
  const { readdir } = await import("node:fs/promises");
  const buscar = async (sub: string, re: RegExp) => {
    const files = await readdir(path.join(dir, sub)).catch(() => [] as string[]);
    const nums = files.map((f) => re.exec(f)?.[1]).filter(Boolean).map(Number);
    return nums.length ? Math.min(...nums) : null;
  };
  if (stage === "REVISAO_CAPITULO") return buscar("review", /^_revcap-(\d+)\.try$/);
  if (stage === "SPEC_CAPITULO") return buscar("specs", /^_spec-(\d+)\.try$/);
  return null;
}

// Concilia o ledger com a verdade do disco: tentativa pendente cujo capítulo já
// está APROVADO (quality/capitulo-NN.json com hash do texto atual) fecha como
// "aprovado". Idempotente. Retorna true se algo mudou.
export async function conciliarLedgerComDisco(dir: string, ledger: CorrecaoLedger): Promise<boolean> {
  let mudou = false;
  for (const [chave, tentativas] of Object.entries(ledger.capitulos)) {
    const pendente = tentativas.some((t) => t.resultado === "pendente");
    if (!pendente) continue;
    const cap = tentativas[tentativas.length - 1]?.capitulo;
    if (cap == null) continue;
    try {
      const q = JSON.parse(await readFile(path.join(dir, "quality", `capitulo-${String(cap).padStart(2, "0")}.json`), "utf8"));
      const texto = await readText(capFile(dir, cap));
      const aprovado =
        (q?.status === "approved" || q?.status === "approved_with_exception") && q?.textHash === hashText(texto);
      if (aprovado) {
        mudou = fecharTentativaPendente(ledger, chave, "aprovado", hashText(texto), "gate recontou e aprovou") || mudou;
      }
    } catch {
      /* sem avaliação ainda → segue pendente */
    }
  }
  return mudou;
}

// Fecha como aprovadas as tentativas cujo capítulo o gate já aprovou (chamado pelo
// caminho de sucesso do escrever_livro). Best-effort e idempotente.
export async function concluirCorrecoesAprovadas(dir: string, projeto: string): Promise<ResumoCorrecao | null> {
  const ledger = await carregarLedger(dir, projeto);
  if (!Object.keys(ledger.capitulos).length) return null;
  if (await conciliarLedgerComDisco(dir, ledger)) await salvarLedger(dir, ledger);
  return resumirLedger(ledger);
}

export async function resumoCorrecaoDoDisco(dir: string, projeto: string): Promise<ResumoCorrecao | null> {
  return resumirLedger(await carregarLedger(dir, projeto));
}

// Preparo do degrau no disco (SG2). Idempotente por construção (G5):
//  - degrau 1: determinístico seguro; texto já limpo → no-op;
//  - instrução de correção: conteúdo determinístico (sem timestamp) — reescrever o
//    mesmo conteúdo é no-op lógico (comparado antes de gravar);
//  - remoção de .try ausente → no-op; ajuste de contador já ajustado → no-op.
export async function prepararCorrecao(
  dir: string,
  decisao: Extract<DecisaoCorrecao, { acao: "corrigir" }>,
  estagio: string,
  capitulo: number | null
): Promise<string[]> {
  const mudancas: string[] = [];

  if (capitulo != null && decisao.degrau === 1) {
    const arq = capFile(dir, capitulo);
    if (await exists(arq)) {
      const antes = await readText(arq);
      const d1 = degrau1Deterministico(antes);
      if (d1.texto !== antes) {
        await writeFile(arq, d1.texto, "utf8");
        mudancas.push(`degrau 1 aplicado: ${d1.mudancas.join("; ")}`);
      }
    }
  }

  if (capitulo != null && decisao.degrau >= 2) {
    // Instrução de correção que o runner injeta no micro-loop (frases exatas dos
    // blockers + diretiva do degrau). Conteúdo determinístico p/ idempotência.
    const instrucao = {
      capitulo,
      degrau: decisao.degrau,
      estrategia: decisao.estrategia,
      tentativa: decisao.tentativa.tentativa,
      hash_alvo: decisao.tentativa.hash_antes,
      blockers: decisao.tentativa.bloqueio,
    };
    const arq = instrucaoFile(dir, capitulo);
    const novo = JSON.stringify(instrucao, null, 2) + "\n";
    const atual = await readFile(arq, "utf8").catch(() => null);
    if (atual !== novo) {
      await mkdir(path.dirname(arq), { recursive: true });
      await writeFile(arq, novo, "utf8");
      mudancas.push(`instrução de correção gravada (degrau ${decisao.degrau})`);
    }
  }

  // Concede UMA nova tentativa limitada ao gate do runner (o gate RECONTA tudo —
  // remover o marcador não aprova nada; sem isso o runner re-bloqueia sem tentar).
  if (capitulo != null && estagio === "REVISAO_CAPITULO" && (await exists(revTryFile(dir, capitulo)))) {
    await rm(revTryFile(dir, capitulo), { force: true });
    mudancas.push("marcador _revcap.try removido (1 nova tentativa limitada)");
  }
  if (capitulo != null && estagio === "SPEC_CAPITULO" && (await exists(specTryFile(dir, capitulo)))) {
    await rm(specTryFile(dir, capitulo), { force: true });
    mudancas.push("marcador _spec.try removido (1 nova tentativa limitada)");
  }

  // Book-wide (DESMANEIRISMO): o contador de passadas persiste no estado — sem
  // recuá-lo em exatamente 1, o run seguinte re-bloqueia sem nova passada.
  if (estagio === "DESMANEIRISMO") {
    const estadoPath = path.join(dir, "ESTADO_LIVRO.json");
    const st = await lerEstado(dir);
    if (st) {
      const max = Number(st.max_desmaneirismo ?? 3);
      const alvo = Math.max(0, max - 1);
      if (Number(st.desmaneirismo_iters ?? 0) > alvo) {
        st.desmaneirismo_iters = alvo;
        await writeFile(estadoPath, JSON.stringify(st, null, 2), "utf8");
        mudancas.push(`desmaneirismo_iters ajustado para ${alvo} (1 nova passada limitada)`);
      }
    }
  }

  return mudancas;
}

// ---------------------------------------------------------------------------
// Orquestrador chamado pelo worker (index.ts) quando um QualityBlockedError
// chega. Decide o patch do job: reagendar (queued + retry_at, sem clique) ou
// escalar para decisão humana (paused com categoria persistida). SG1/SG4/SG5.
// ---------------------------------------------------------------------------
export interface BloqueioContexto {
  jobId: string;
  jobTipo: string;
  projectId: string | null;
  payload: Record<string, any> | null | undefined;
  stage: string;
  blockers: string[];
  mensagem: string;
  progressoAtual: Record<string, unknown>;
  agora?: number;
  maxTentativas?: number;
  dirOverride?: string; // testes: diretório do projeto sem passar por WORK_DIR/projDir
}

export interface ResultadoBloqueio {
  patch: {
    status: "queued" | "paused";
    erro: string | null;
    progresso: Record<string, unknown>;
    payload?: Record<string, unknown>;
  };
  log: string;
}

const ROTULO_CATEGORIA: Record<CategoriaBloqueio, string> = {
  recuperavel_qualidade: "Correção automática em andamento",
  infra_transitoria: "Bloqueado por infraestrutura",
  quota_provedor: "Aguardando janela do provedor",
  fundacao_pendente: "Fundação com pendência (bloqueia a publicação)",
  decisao_autoral: "Decisão autoral necessária",
  circuit_breaker: "Bloqueado após circuit breaker",
  pausa_global: "Produção desativada",
};

function patchPausado(
  ctx: BloqueioContexto,
  categoria: CategoriaBloqueio,
  motivo: string,
  extras: Record<string, unknown> = {}
): ResultadoBloqueio {
  return {
    patch: {
      status: "paused",
      erro: ctx.mensagem,
      progresso: {
        ...ctx.progressoAtual,
        quality_status: "blocked_quality",
        quality_categoria: categoria,
        quality_stage: ctx.stage,
        quality_blockers: ctx.blockers,
        quality_motivo: motivo,
        resumo: ROTULO_CATEGORIA[categoria],
        ...extras,
      },
    },
    log: `${ROTULO_CATEGORIA[categoria]} em ${ctx.stage}: ${motivo}`,
  };
}

export async function tratarBloqueioQualidade(ctx: BloqueioContexto): Promise<ResultadoBloqueio> {
  const categoria = classificarBloqueio(ctx.stage, ctx.blockers);
  // Recuperável exige um projeto (o ledger vive no WORK_DIR dele). Qualquer tipo
  // de job com estágio recuperável entra na escada — o orçamento por chave e o
  // circuit breaker limitam o custo; estágio não recuperável pausa com categoria.
  if (categoria !== "recuperavel_qualidade" || !ctx.projectId) {
    const cat = categoria === "recuperavel_qualidade" ? "decisao_autoral" : categoria;
    return patchPausado(ctx, cat, ctx.mensagem);
  }

  const dir = ctx.dirOverride ?? (await import("./lib.js")).projDir(ctx.projectId);
  const ledger = await carregarLedger(dir, ctx.projectId);
  const capitulo = await capituloBloqueado(dir, ctx.stage);
  const chave = chaveLedger(capitulo, ctx.stage);
  let hashAtual: string | null = null;
  if (capitulo != null && (await exists(capFile(dir, capitulo)))) {
    hashAtual = hashText(await readText(capFile(dir, capitulo)));
  }

  // DEDUPE (SG4): processamento repetido do MESMO bloqueio (mensagem duplicada,
  // dois workers, crash entre gravar o ledger e finalizar o job) não queima
  // orçamento. Distintivo: tentativa pendente para o hash em que o preparo foi
  // aplicado E marcador .try ausente (nenhum run aconteceu no meio) → re-emite o
  // MESMO reagendamento, sem fechar a pendência nem registrar nova tentativa.
  const anteriores = ledger.capitulos[chave] ?? [];
  const ultima = anteriores[anteriores.length - 1];
  if (
    ultima?.resultado === "pendente" &&
    hashAtual != null &&
    hashAtual === (ultima.hash_preparado ?? ultima.hash_antes)
  ) {
    let semRunNoMeio = false;
    if (ctx.stage === "REVISAO_CAPITULO" && capitulo != null) semRunNoMeio = !(await exists(revTryFile(dir, capitulo)));
    else if (ctx.stage === "SPEC_CAPITULO" && capitulo != null) semRunNoMeio = !(await exists(specTryFile(dir, capitulo)));
    if (semRunNoMeio) {
      const hh = new Date(ultima.retry_at ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const motivoDup =
        `correção automática do ${capitulo != null ? `cap ${capitulo}` : ctx.stage} — degrau ${ultima.degrau} ` +
        `(${ultima.estrategia}), tentativa ${ultima.tentativa}/${ctx.maxTentativas ?? MAX_TENTATIVAS_AUTO}; nova tentativa ~${hh} (dedupe)`;
      return {
        patch: {
          status: "queued",
          erro: null,
          progresso: {
            ...ctx.progressoAtual,
            aguardando_reset: false,
            retry_at: ultima.retry_at,
            quality_status: "auto_correcao",
            quality_categoria: "recuperavel_qualidade",
            quality_stage: ctx.stage,
            quality_blockers: ctx.blockers,
            quality_cap: capitulo,
            motivo: motivoDup,
            resumo: "Correção automática em andamento",
            correcao: resumirLedger(ledger),
          },
        },
        log: motivoDup,
      };
    }
  }

  // Verdade do disco antes de decidir: fecha pendências já aprovadas em outras
  // chaves e marca a pendência DESTA chave como reprovada (o gate recontou e o
  // bloqueio voltou) — histórico completo, nunca sobrescrito.
  await conciliarLedgerComDisco(dir, ledger);
  fecharTentativaPendente(ledger, chave, "reprovado", hashAtual, "recontagem seguiu reprovada");

  const decisao = decidirCorrecao({
    ledger,
    estagio: ctx.stage,
    blockers: ctx.blockers,
    capitulo,
    hashAtual,
    agora: ctx.agora,
    maxTentativas: ctx.maxTentativas,
  });

  if (decisao.acao === "escalar_humano") {
    const tentativas = ledger.capitulos[chave] ?? [];
    const diagnostico = tentativas.map((t) => ({
      tentativa: t.tentativa,
      degrau: t.degrau,
      estrategia: t.estrategia,
      resultado: t.resultado,
      aplicado_em: t.aplicado_em,
    }));
    if (tentativas.length) {
      tentativas[tentativas.length - 1] = {
        ...tentativas[tentativas.length - 1],
        encerramento: decisao.motivo,
      };
    }
    await salvarLedger(dir, ledger);
    return patchPausado(ctx, decisao.categoria, decisao.motivo, {
      correcao: { ...(resumirLedger(ledger) ?? {}), ativa: false, historico: diagnostico },
    });
  }

  const registrada = registrarTentativa(ledger, chave, decisao.tentativa);
  const mudancas = await prepararCorrecao(dir, decisao, ctx.stage, capitulo);
  // Degrau 1 pode ter alterado o texto no preparo: registrar o hash APLICADO
  // (base do dedupe e da regra "nunca a mesma estratégia sobre o mesmo hash").
  if (capitulo != null && (await exists(capFile(dir, capitulo)))) {
    registrada.hash_preparado = hashText(await readText(capFile(dir, capitulo)));
  }
  await salvarLedger(dir, ledger);

  const hh = new Date(decisao.retryAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const motivo =
    `correção automática do ${capitulo != null ? `cap ${capitulo}` : ctx.stage} — degrau ${decisao.degrau} ` +
    `(${decisao.estrategia}), tentativa ${registrada.tentativa}/${ctx.maxTentativas ?? MAX_TENTATIVAS_AUTO}; nova tentativa ~${hh}`;
  return {
    patch: {
      status: "queued",
      erro: null,
      ...(decisao.degrau >= 6 ? { payload: { ...(ctx.payload ?? {}), revisor_craft_opus: true } } : {}),
      progresso: {
        ...ctx.progressoAtual,
        aguardando_reset: false,
        retry_at: registrada.retry_at,
        quality_status: "auto_correcao",
        quality_categoria: "recuperavel_qualidade",
        quality_stage: ctx.stage,
        quality_blockers: ctx.blockers,
        quality_cap: capitulo,
        motivo,
        resumo: "Correção automática em andamento",
        correcao: resumirLedger(ledger),
      },
    },
    log: `${motivo}${mudancas.length ? ` [${mudancas.join("; ")}]` : ""}`,
  };
}
