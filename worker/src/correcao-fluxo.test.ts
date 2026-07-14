// SG2/SG3/SG4/G5 — fluxo de correção sobre DISCO real (tmpdir): ledger persiste e
// sobrevive a "restart" (reload do disco), preparo de degrau é idempotente (rodar a
// mesma correção 2x sobre o mesmo hash = no-op na 2ª), marcadores .try concedem UMA
// tentativa, e tratarBloqueioQualidade produz o patch de reagendamento sem clique.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashText } from "./quality-state.js";
import {
  capituloBloqueado,
  carregarLedger,
  concluirCorrecoesAprovadas,
  ledgerPath,
  prepararCorrecao,
  salvarLedger,
  tratarBloqueioQualidade,
} from "./correcao-fluxo.js";
import { decidirCorrecao, ledgerVazio, registrarTentativa } from "./correcao-automatica.js";

let dir: string;
const PID = "proj-teste";

async function fixture(opts: { capTexto?: string; tryMarker?: boolean; estado?: Record<string, unknown> } = {}) {
  await mkdir(path.join(dir, "manuscrito"), { recursive: true });
  await mkdir(path.join(dir, "review"), { recursive: true });
  await mkdir(path.join(dir, "quality"), { recursive: true });
  const texto = opts.capTexto ?? "# Capítulo 38\n\nHelena correu. Não sabia nomear aquele som, mas o timbre já lhe era familiar.\n";
  await writeFile(path.join(dir, "manuscrito", "capitulo-38.md"), texto, "utf8");
  if (opts.tryMarker !== false) await writeFile(path.join(dir, "review", "_revcap-38.try"), "2026-07-14", "utf8");
  await writeFile(
    path.join(dir, "ESTADO_LIVRO.json"),
    JSON.stringify({ fase_atual: "ESCRITA", total_capitulos_previstos: 60, quality_stage: "REVISAO_CAPITULO", quality_cap: 38, max_desmaneirismo: 3, desmaneirismo_iters: 0, ...(opts.estado ?? {}) }),
    "utf8"
  );
  return texto;
}

function ctxBloqueio(texto: string, over: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    jobTipo: "escrever_livro",
    projectId: PID,
    payload: {},
    stage: "REVISAO_CAPITULO",
    blockers: ["molde antitese 'nao X, mas Y' 2x — L27: \"...\""],
    mensagem: "time escritor->revisor->editor esgotou o orcamento sem comprovar pos-condicoes",
    progressoAtual: { fase: "ESCRITA", cap_atual: 38, total: 60 },
    agora: Date.parse("2026-07-14T12:00:00Z"),
    ...over,
  } as Parameters<typeof tratarBloqueioQualidade>[0];
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "correcao-fluxo-"));
  process.env.WORK_DIR = dir; // projDir(PID) = WORK_DIR/PID — usamos dir direto nos helpers
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("capituloBloqueado", () => {
  it("usa quality_cap do estado; sem ele, deriva do marcador .try", async () => {
    await fixture();
    expect(await capituloBloqueado(dir, "REVISAO_CAPITULO")).toBe(38);
    await writeFile(path.join(dir, "ESTADO_LIVRO.json"), JSON.stringify({ fase_atual: "ESCRITA" }), "utf8");
    expect(await capituloBloqueado(dir, "REVISAO_CAPITULO")).toBe(38); // via _revcap-38.try
    expect(await capituloBloqueado(dir, "DESMANEIRISMO")).toBeNull();
  });
});

describe("ledger persistente (SG3 / cenário 7 — restart)", () => {
  it("sobrevive a reload do disco (restart do worker no meio da correção)", async () => {
    await fixture();
    const ledger = ledgerVazio(PID);
    const d = decidirCorrecao({ ledger, estagio: "REVISAO_CAPITULO", blockers: ["muleta coisa 2x"], capitulo: 38, hashAtual: "h1", agora: Date.now() });
    if (d.acao !== "corrigir") throw new Error("esperava corrigir");
    registrarTentativa(ledger, "cap-38", d.tentativa);
    await salvarLedger(dir, ledger);
    // "restart": novo processo carrega do disco e vê a MESMA pendência.
    const recarregado = await carregarLedger(dir, PID);
    expect(recarregado.capitulos["cap-38"]).toHaveLength(1);
    expect(recarregado.capitulos["cap-38"][0]).toMatchObject({ resultado: "pendente", degrau: 2, retry_at: d.retryAt });
  });
});

describe("prepararCorrecao (G5 — idempotência provada por teste)", () => {
  it("degraus 2+: grava instrução, remove .try; 2ª aplicação sobre o mesmo hash = no-op", async () => {
    await fixture();
    const ledger = ledgerVazio(PID);
    const d = decidirCorrecao({ ledger, estagio: "REVISAO_CAPITULO", blockers: ["molde antitese 2x"], capitulo: 38, hashAtual: "h1", agora: Date.now() });
    if (d.acao !== "corrigir") throw new Error("esperava corrigir");

    const m1 = await prepararCorrecao(dir, d, "REVISAO_CAPITULO", 38);
    expect(m1.join("; ")).toContain("instrução de correção gravada");
    expect(m1.join("; ")).toContain("_revcap.try removido");
    const instrucao = JSON.parse(await readFile(path.join(dir, "review", "_correcao-cap-38.json"), "utf8"));
    expect(instrucao).toMatchObject({ capitulo: 38, degrau: 2, estrategia: "revisao_dirigida" });
    const mtime1 = (await stat(path.join(dir, "review", "_correcao-cap-38.json"))).mtimeMs;

    const m2 = await prepararCorrecao(dir, d, "REVISAO_CAPITULO", 38);
    expect(m2).toEqual([]); // no-op integral na 2ª passada
    const mtime2 = (await stat(path.join(dir, "review", "_correcao-cap-38.json"))).mtimeMs;
    expect(mtime2).toBe(mtime1); // arquivo não regravado
  });

  it("degrau 1 aplica determinístico e é no-op quando o texto já está limpo", async () => {
    const sujo = "# Cap\n\n\n\nEle  correu.   \n<!-- meta -->\nFim.\n";
    await fixture({ capTexto: sujo });
    const ledger = ledgerVazio(PID);
    const d = decidirCorrecao({ ledger, estagio: "REVISAO_CAPITULO", blockers: ["meta-texto residual"], capitulo: 38, hashAtual: hashText(sujo), agora: Date.now() });
    if (d.acao !== "corrigir") throw new Error("esperava corrigir");
    expect(d.degrau).toBe(1);
    const m1 = await prepararCorrecao(dir, d, "REVISAO_CAPITULO", 38);
    expect(m1.join("; ")).toContain("degrau 1 aplicado");
    const limpo = await readFile(path.join(dir, "manuscrito", "capitulo-38.md"), "utf8");
    expect(limpo).not.toContain("<!-- meta -->");
    const m2 = await prepararCorrecao(dir, d, "REVISAO_CAPITULO", 38);
    expect(m2.filter((m) => m.includes("degrau 1"))).toEqual([]); // 2ª vez: nada a fazer
  });

  it("DESMANEIRISMO: recua o contador em exatamente 1 passada; 2ª aplicação = no-op", async () => {
    await fixture({ estado: { desmaneirismo_iters: 3, max_desmaneirismo: 3 } });
    const ledger = ledgerVazio(PID);
    const d = decidirCorrecao({ ledger, estagio: "DESMANEIRISMO", blockers: ["muleta coisa 4x"], capitulo: null, hashAtual: null, agora: Date.now() });
    if (d.acao !== "corrigir") throw new Error("esperava corrigir");
    const m1 = await prepararCorrecao(dir, d, "DESMANEIRISMO", null);
    expect(m1.join("; ")).toContain("desmaneirismo_iters ajustado para 2");
    const st = JSON.parse(await readFile(path.join(dir, "ESTADO_LIVRO.json"), "utf8"));
    expect(st.desmaneirismo_iters).toBe(2);
    const m2 = await prepararCorrecao(dir, d, "DESMANEIRISMO", null);
    expect(m2).toEqual([]);
  });
});

describe("tratarBloqueioQualidade (coração do goal — sem clique)", () => {
  it("bloqueio recuperável → patch queued com retry_at, ledger gravado, .try removido", async () => {
    const texto = await fixture();
    const r = await tratarBloqueioQualidade({ ...ctxBloqueio(texto), dirOverride: dir } as any);
    expect(r.patch.status).toBe("queued");
    expect(r.patch.erro).toBeNull();
    const p = r.patch.progresso as any;
    expect(p.quality_status).toBe("auto_correcao");
    expect(p.quality_categoria).toBe("recuperavel_qualidade");
    expect(p.quality_cap).toBe(38);
    expect(Date.parse(p.retry_at)).toBeGreaterThan(Date.parse("2026-07-14T12:00:00Z"));
    expect(p.correcao).toMatchObject({ ativa: true, capitulo: 38, tentativa: 1, degrau: 2 });
    // preservação do progresso vigente (merge, não substituição)
    expect(p.cap_atual).toBe(38);
    expect(p.total).toBe(60);
    // disco: ledger existe; .try removido (1 nova tentativa concedida)
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-38"]).toHaveLength(1);
    await expect(readFile(path.join(dir, "review", "_revcap-38.try"), "utf8")).rejects.toThrow();
  });

  it("processamento duplicado do MESMO bloqueio não queima orçamento (SG4/cenário 9)", async () => {
    const texto = await fixture();
    const ctx = { ...ctxBloqueio(texto), dirOverride: dir } as any;
    const r1 = await tratarBloqueioQualidade(ctx);
    const r2 = await tratarBloqueioQualidade(ctx); // mensagem repetida/2º worker
    expect(r2.patch.status).toBe("queued");
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-38"]).toHaveLength(1); // NÃO virou 2 tentativas
    expect((r2.patch.progresso as any).retry_at).toBe((r1.patch.progresso as any).retry_at);
  });

  it("re-bloqueio após run real (novo .try) escala o degrau e registra 2ª tentativa", async () => {
    const texto = await fixture();
    const ctx = { ...ctxBloqueio(texto), dirOverride: dir } as any;
    await tratarBloqueioQualidade(ctx);
    // "run real": runner recriou o .try e bloqueou de novo com o MESMO texto
    await writeFile(path.join(dir, "review", "_revcap-38.try"), "2026-07-14T13:00", "utf8");
    const r2 = await tratarBloqueioQualidade(ctx);
    expect(r2.patch.status).toBe("queued");
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-38"]).toHaveLength(2);
    expect(ledger.capitulos["cap-38"][0].resultado).toBe("reprovado");
    expect(ledger.capitulos["cap-38"][1]).toMatchObject({ resultado: "pendente", degrau: 3 }); // escalou
  });

  it("orçamento esgotado → paused com categoria circuit_breaker e histórico (cenário 12)", async () => {
    const texto = await fixture();
    const ctx = { ...ctxBloqueio(texto), maxTentativas: 2, dirOverride: dir } as any;
    await tratarBloqueioQualidade(ctx);
    await writeFile(path.join(dir, "review", "_revcap-38.try"), "x", "utf8");
    await tratarBloqueioQualidade(ctx);
    await writeFile(path.join(dir, "review", "_revcap-38.try"), "x", "utf8");
    const r3 = await tratarBloqueioQualidade(ctx);
    expect(r3.patch.status).toBe("paused");
    const p = r3.patch.progresso as any;
    expect(p.quality_categoria).toBe("circuit_breaker");
    expect(p.quality_motivo).toContain("Circuit breaker");
    expect(p.correcao.historico).toHaveLength(2);
    expect(p.correcao.ativa).toBe(false);
  });

  it("GATE_FUNDACAO → paused decisao_autoral; PUBLICATION_GATE com fundação → fundacao_pendente (SG7)", async () => {
    const texto = await fixture();
    const r1 = await tratarBloqueioQualidade({ ...ctxBloqueio(texto, { stage: "GATE_FUNDACAO", blockers: ["PROTAGONISTA_INCOERENTE"] }), dirOverride: dir } as any);
    expect(r1.patch.status).toBe("paused");
    expect((r1.patch.progresso as any).quality_categoria).toBe("decisao_autoral");
    const r2 = await tratarBloqueioQualidade({ ...ctxBloqueio(texto, { stage: "PUBLICATION_GATE", blockers: ["PROTAGONISTA_INCOERENTE: 'Helena' ausente do Mapa"] }), dirOverride: dir } as any);
    expect(r2.patch.status).toBe("paused");
    expect((r2.patch.progresso as any).quality_categoria).toBe("fundacao_pendente");
  });

  it("degrau 6 autoriza modelo alternativo via payload (revisor_craft_opus)", async () => {
    const texto = await fixture();
    const ledger = ledgerVazio(PID);
    registrarTentativa(ledger, "cap-38", {
      tentativa: 1, capitulo: 38, estagio: "REVISAO_CAPITULO", categoria: "recuperavel_qualidade",
      bloqueio: ["x"], hash_antes: hashText(texto), degrau: 5, estrategia: "revisao_ampla",
      aplicado_em: "2026-07-14T11:00:00Z", retry_at: null, modelo: null,
      resultado: "reprovado", retomada_automatica: true,
    });
    await salvarLedger(dir, ledger);
    const r = await tratarBloqueioQualidade({ ...ctxBloqueio(texto), dirOverride: dir } as any);
    expect(r.patch.status).toBe("queued");
    expect((r.patch.payload as any)?.revisor_craft_opus).toBe(true);
    const l2 = await carregarLedger(dir, PID);
    expect(l2.capitulos["cap-38"][1]).toMatchObject({ degrau: 6, modelo: "opus" });
  });
});

describe("concluirCorrecoesAprovadas (fecha o ciclo quando o gate aprova)", () => {
  it("tentativa pendente fecha como aprovada quando quality/capitulo-NN.json aprova o hash atual", async () => {
    const texto = await fixture();
    await tratarBloqueioQualidade({ ...ctxBloqueio(texto), dirOverride: dir } as any);
    // gate real aprovou (quality json com hash do texto atual)
    await writeFile(
      path.join(dir, "quality", "capitulo-38.json"),
      JSON.stringify({ status: "approved", textHash: hashText(texto) }),
      "utf8"
    );
    const resumo = await concluirCorrecoesAprovadas(dir, PID);
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-38"][0].resultado).toBe("aprovado");
    expect(resumo?.ativa).toBe(false);
    // idempotente
    await concluirCorrecoesAprovadas(dir, PID);
    expect((await carregarLedger(dir, PID)).capitulos["cap-38"]).toHaveLength(1);
  });
});

describe("caminho do ledger", () => {
  it("fica em quality/correcao-ledger.json (verdade no disco)", () => {
    expect(ledgerPath("/x")).toBe(path.join("/x", "quality", "correcao-ledger.json"));
  });
});
