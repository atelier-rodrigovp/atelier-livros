// E2E do goal correcao-sem-clique (SG8): exercita o caminho VERDADEIRO
// runner→gate→bloqueio→decisão do worker→preparo→re-run→recontagem pelos MESMOS
// gates→aprovação→persistência→continuação para o próximo capítulo. O runner
// Python REAL do repo roda em cada etapa; o ÚNICO mock é run_claude (a chamada
// de LLM), substituído por um stub roteirizado que age no disco (driver).
// Nenhum clique humano acontece em nenhum passo (asserção do cenário 19: a
// transição bloqueado→reagendado é decidida por tratarBloqueioQualidade, o mesmo
// código que o worker chama no handler de QualityBlockedError).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashText } from "./quality-state.js";
import { carregarLedger, concluirCorrecoesAprovadas, tratarBloqueioQualidade } from "./correcao-fluxo.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(AQUI, "..", "skill-patches", "livro-do-zero-ao-epub", "assets", "livro_runner.py");
const DRIVER = path.join(AQUI, "..", "scripts", "e2e-correcao-driver.py");

// PY_BIN: env → worker/.env → "python" (o runner é o mesmo que roda em produção).
function pythonBin(): string {
  if (process.env.PY_BIN) return process.env.PY_BIN;
  try {
    const env = readFileSync(path.join(AQUI, "..", ".env"), "utf8");
    const m = /^PY_BIN=(.+)$/m.exec(env);
    if (m) return m[1].trim();
  } catch {
    /* sem .env → fallback */
  }
  return "python";
}
const PY = pythonBin();

const PISO = 25;
const PID = "proj-e2e";

// Texto reprovável pelo gate REAL: molde "antítese por negação" 9x.
// O gatilho eram 2 ocorrências, de quando o runner reprovava qualquer molde
// acima de 1 por capítulo. Esse 1 era do tempo das seis regex de superfície;
// com o detector único e o teto humano (limiar 8 em maneirismo.ts) ele passou a
// reprovar prosa dentro da faixa humana, e o Python foi alinhado ao TS. O que
// este e2e prova é a ESCADA (bloqueia → worker corrige sozinho → recontagem
// aprova → avança), não o número: o gatilho subiu para 9, um acima do teto.
const TEXTO_RUIM = `# Capítulo 1 — O Arquivo

Helena desceu a escada do arquivo municipal com a lanterna apagada. O som que vinha do porão não era coisa de cano, mas sim de voz. Ele não queria abrir a porta de ferro, e sim adiar tudo mais uma noite. A data na margem não foi escrita ontem. Foi escrita agora. O registro de 1974 não estava aberto por acaso: estava aberto na página errada de propósito. Não era descuido do arquivista, e sim recado. A tinta não secou. Está fresca. O corredor não tinha eco, mas sim um silêncio que empurrava. Ela não subiu a escada, e sim desceu mais um lance. O porão não guardava papel velho; guardava o que sobrou de 1975.
`;

// Correção MÍNIMA: as frases-molde reescritas; o resto do capítulo preservado.
// Verificado contra o gate real: 0 molde, 0 muleta, 0 cadência acima da cota.
const TEXTO_LIMPO = `# Capítulo 1 — O Arquivo

Helena desceu a escada do arquivo municipal com a lanterna apagada. O som que vinha do porão tinha um timbre antigo demais para os canos. A porta de ferro pesou na mão dela, e os passos atrás dela empurraram a decisão. Alguém escrevera a data na margem havia poucos minutos, com tinta ainda molhada. O registro de 1974 esperava sobre a mesa, aberto na página errada. O arquivista deixara aquilo ali como recado. O corredor devolveu o silêncio em vez do eco. Ela desceu mais um lance. O porão guardava o que sobrou de 1975.
`;

const TEXTO_CAP2 = `# Capítulo 2 — A Margem

O carimbo da prefeitura ainda cheirava a almofada nova quando Vera abriu o envelope. Dentro, uma única folha listava seis nomes de funcionários do cartório, todos aposentados no mesmo mês de 1975. Ela dobrou a folha, guardou no bolso do casaco e subiu para a sala do telefone, onde a linha externa funcionava apenas depois das seis.
`;

let dir: string;

async function fixture() {
  dir = await mkdtemp(path.join(tmpdir(), "e2e-correcao-"));
  await mkdir(path.join(dir, "manuscrito"), { recursive: true });
  await mkdir(path.join(dir, "review"), { recursive: true });
  await mkdir(path.join(dir, "estado"), { recursive: true });
  await writeFile(path.join(dir, "briefing.md"), "# Briefing\n\nThriller municipal em 2 capítulos.\n", "utf8");
  await writeFile(path.join(dir, "estado", "estado-narrativo.md"), "# Estado narrativo\n\n(MCL inicial)\n", "utf8");
  await writeFile(path.join(dir, "manuscrito", "capitulo-01.md"), TEXTO_RUIM, "utf8");
  // .try presente = o time escritor→revisor→editor JÁ esgotou o bound no run
  // anterior (estado real do incidente cap-38).
  await writeFile(path.join(dir, "review", "_revcap-01.try"), "2026-07-14T02:00:00", "utf8");
  await writeFile(
    path.join(dir, "ESTADO_LIVRO.json"),
    JSON.stringify({
      titulo: "E2E",
      total_capitulos_previstos: 2,
      fase_atual: "ESCRITA",
      piso_palavras_cap: PISO,
      gerar_epub: false,
    }),
    "utf8"
  );
}

function runRunner(plano: unknown[], parar_apos?: number) {
  return (async () => {
    await writeFile(path.join(dir, "_stub-plano.json"), JSON.stringify(plano), "utf8");
    await rm(path.join(dir, "_stub-idx"), { force: true });
    if (parar_apos != null) await writeFile(path.join(dir, "_PARAR_APOS_CAP"), String(parar_apos), "utf8");
    const r = spawnSync(PY, [DRIVER, RUNNER, dir, "--piso", String(PISO), "--claude-bin", "stub-nao-usado", "--max-estagnacao", "4"], {
      encoding: "utf8",
      env: { ...process.env, PYTHONUTF8: "1" },
      timeout: 120_000,
    });
    return r;
  })();
}

async function estado(): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path.join(dir, "ESTADO_LIVRO.json"), "utf8"));
}

beforeAll(async () => {
  await fixture();
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const temPython = (() => {
  const r = spawnSync(PY, ["--version"], { encoding: "utf8" });
  return r.status === 0;
})();

describe.skipIf(!temPython)("e2e correção sem clique (runner real, LLM stubado)", () => {
  it("cenário 2: gate REAL reprova o cap-1 (molde antitese 2x) e bloqueia com rc=3", async () => {
    // Stub "sem correção": revisão roda mas não melhora o texto (equipe falhou).
    const r = await runRunner([{ tocar_ledger: true }]);
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("QUALITY_BLOCKED stage=REVISAO_CAPITULO cap=1");
    const st = await estado();
    expect(st.quality_status).toBe("blocked_quality");
    expect(st.quality_stage).toBe("REVISAO_CAPITULO");
    expect(st.quality_cap).toBe(1);
    expect(String(st.quality_blockers)).toContain("antitese por negacao");
  }, 120_000);

  it("cenário 3/19: o worker decide a correção SOZINHO (mesmo código do handler; zero clique)", async () => {
    const st = await estado();
    const resultado = await tratarBloqueioQualidade({
      jobId: "job-e2e",
      jobTipo: "escrever_livro",
      projectId: PID,
      payload: {},
      stage: st.quality_stage,
      blockers: st.quality_blockers.map(String),
      mensagem: st.quality_reason,
      progressoAtual: { fase: "ESCRITA", cap_atual: 1, total: 2 },
      dirOverride: dir,
    } as any);
    // Reagendamento persistente: queued + retry_at (o picker do worker já pula
    // retry_at futuro e reivindica sozinho quando passa — fila.ts escolherProximo).
    expect(resultado.patch.status).toBe("queued");
    const p = resultado.patch.progresso as any;
    expect(p.quality_status).toBe("auto_correcao");
    expect(p.correcao).toMatchObject({ ativa: true, capitulo: 1, tentativa: 1 });
    expect(Date.parse(p.retry_at)).toBeGreaterThan(Date.now() - 1000);
    // Preparo no disco: .try removido (1 nova tentativa limitada) + instrução gravada.
    expect(existsSync(path.join(dir, "review", "_revcap-01.try"))).toBe(false);
    expect(existsSync(path.join(dir, "review", "_correcao-cap-01.json"))).toBe(true);
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-01"]).toHaveLength(1);
    expect(ledger.capitulos["cap-01"][0]).toMatchObject({ resultado: "pendente", degrau: 2, estrategia: "revisao_dirigida" });
  });

  it("cenários 4/5: re-run corrige, os MESMOS gates recontam e APROVAM; persistência no disco", async () => {
    // Stub "equipe corrigiu": regrava o capítulo com a correção mínima + continuidade.
    const r = await runRunner([{ gravar: "manuscrito/capitulo-01.md", conteudo: TEXTO_LIMPO, tocar_ledger: true }], 1);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("RUNNER_PARADA_LIMPA");
    // A instrução de correção foi INJETADA no prompt do micro-loop (escada→runner).
    const prompts = await readFile(path.join(dir, "_stub-prompts.log"), "utf8");
    expect(prompts).toContain("INSTRUCAO DE CORRECAO AUTOMATICA");
    expect(prompts).toContain("CORRECAO DIRIGIDA (degrau 2)");
    expect(prompts).toContain("antitese por negacao");
    // Gate aceitou: marcador .done + quality json hash-bound ao texto aprovado.
    expect(existsSync(path.join(dir, "review", "_revcap-01.done"))).toBe(true);
    const q = JSON.parse(await readFile(path.join(dir, "quality", "capitulo-01.json"), "utf8"));
    expect(q.status).toBe("approved");
    expect(q.stage).toBe("REVISAO_CAPITULO");
    const textoFinal = await readFile(path.join(dir, "manuscrito", "capitulo-01.md"), "utf8");
    expect(q.textHash).toBe(hashText(textoFinal));
    // Estado não segue bloqueado; instrução de correção consumida e removida.
    const st = await estado();
    expect(st.quality_status).not.toBe("blocked_quality");
    expect(existsSync(path.join(dir, "review", "_correcao-cap-01.json"))).toBe(false);
    // Worker fecha o ciclo no ledger: tentativa pendente → aprovada.
    const resumo = await concluirCorrecoesAprovadas(dir, PID);
    const ledger = await carregarLedger(dir, PID);
    expect(ledger.capitulos["cap-01"][0].resultado).toBe("aprovado");
    expect(resumo?.ativa).toBe(false);
  }, 120_000);

  it("cenário 6: a escrita AVANÇA sozinha para o cap-2 (escreve, revisa e aceita)", async () => {
    await rm(path.join(dir, "_PARAR_APOS_CAP"), { force: true });
    const r = await runRunner(
      [
        { gravar: "manuscrito/capitulo-02.md", conteudo: TEXTO_CAP2 },
        { gravar: "manuscrito/capitulo-02.md", conteudo: TEXTO_CAP2, tocar_ledger: true },
      ],
      2
    );
    expect(r.status).toBe(0);
    expect(existsSync(path.join(dir, "manuscrito", "capitulo-02.md"))).toBe(true);
    expect(existsSync(path.join(dir, "review", "_revcap-02.done"))).toBe(true);
    const st = await estado();
    expect(st.quality_status).not.toBe("blocked_quality");
    // Cap-1 aprovado permaneceu intacto (cenário 20 no nível do e2e).
    const cap1 = await readFile(path.join(dir, "manuscrito", "capitulo-01.md"), "utf8");
    expect(hashText(cap1)).toBe(hashText(TEXTO_LIMPO));
  }, 120_000);
});
