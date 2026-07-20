// Engine V2 — runner de projetos-canário (F10).
// Executa o fluxo completo por skill: briefing → fundação (arquiteto_enredo) →
// fichas → contexto → escrita → gates → revisão → auditoria → aprovação com
// evidência — tudo pelo pipeline real, com chamadas reais de modelo.
//
// DELIBERADAMENTE não cria linhas em `jobs`: o worker V1 vivo nunca pode
// reivindicar um canário (a recuperação de órfãos re-enfileiraria um job
// 'running' sem heartbeat). O canário chama o pipeline direto; o estado
// canônico fica em engine_state (ou fallback de disco pré-DDL).
//
// Uso (de worker/):  npx tsx scripts/v2-canario.ts [dan-brown|hoover-mcfadden|romantasy|todos] [--caps N]

import "dotenv/config";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { carregarContrato } from "../src/v2/contrato.js";
import { criarPersistencia } from "../src/v2/persistencia.js";
import { Gravador } from "../src/v2/gravador.js";
import { compilarPacote } from "../src/v2/compilador.js";
import { executarPapel } from "../src/v2/papeis.js";
import { tarefaArquitetoEnredo } from "../src/v2/tarefas.js";
import { escreverCapitulo, type DepsPipeline } from "../src/v2/pipeline.js";
import { mapaModelosDoAmbiente } from "../src/v2/config.js";
import { ProvedorClaudeCli } from "../src/v2/provedor.js";
import { hashJsonCanonico } from "../src/v2/hash.js";
import { validarSaidaJson } from "../src/v2/gates.js";

const BRIEFINGS: Record<string, { titulo: string; premissa: string }> = {
  "dan-brown": {
    titulo: "Canário V2 — O Cofre de Alcobaça",
    premissa: "Uma perita em documentos descobre que três mosteiros portugueses guardam terços de um mesmo inventário proibido de 1834; alguém mata para reunificá-lo em 72 horas.",
  },
  "hoover-mcfadden": {
    titulo: "Canário V2 — Tudo o que não te contei",
    premissa: "Uma enfermeira noturna aceita cuidar da esposa em coma do homem com quem teve um caso há dez anos; o diário da paciente sugere que o coma não foi acidente — e que ela sabia do caso.",
  },
  "romantasy": {
    titulo: "Canário V2 — A Corte do Sal",
    premissa: "Uma cartógrafa das marés, capaz de reescrever rotas ao custo de memórias próprias, é obrigada a guiar o corsário que jurou afundar — o único que percebe o que ela esquece a cada mapa.",
  },
};

interface FundacaoCanario {
  perfil_voz: string;
  estrutura: { capitulo: number; fio: string; resumo_estrutural: string }[];
  fios: string[];
  promessa_editorial: string;
}

function parseFundacao(texto: string): FundacaoCanario {
  const r = validarSaidaJson<FundacaoCanario>(texto, (o) => {
    const f = o as FundacaoCanario;
    if (typeof f?.perfil_voz !== "string" || f.perfil_voz.trim().length < 80) throw new Error("perfil_voz ausente/curto");
    if (!Array.isArray(f.estrutura) || f.estrutura.length < 1) throw new Error("estrutura vazia");
    for (const e of f.estrutura) {
      if (!Number.isInteger(e.capitulo) || typeof e.fio !== "string" || typeof e.resumo_estrutural !== "string") {
        throw new Error("item de estrutura inválido");
      }
    }
    if (!Array.isArray(f.fios) || f.fios.length < 1) throw new Error("fios vazios");
    return f;
  });
  if (!r.ok) throw new Error(`fundação fora do schema: ${r.gate.evidencia}`);
  return r.valor;
}

async function rodarCanario(skillId: string, totalCaps: number, dirExistente?: string): Promise<Record<string, unknown>> {
  const contrato = carregarContrato(skillId);
  const brief = BRIEFINGS[skillId];
  if (!brief) throw new Error(`sem briefing para ${skillId}`);

  const WORK_DIR = process.env.WORK_DIR!;
  let projectId = randomUUID();
  let dirProjeto = dirExistente ?? path.join(WORK_DIR, `canario-v2-${skillId}-${projectId.slice(0, 8)}`);
  if (dirExistente) {
    // Retomada: reaproveita o projeto (estado canônico decide o que falta).
    const bruto = await fs.readFile(path.join(dirExistente, "engine-v2", "estado.json"), "utf8");
    projectId = (JSON.parse(bruto) as { project_id: string }).project_id;
    console.log(`retomando projeto ${projectId} em ${dirExistente}`);
  }
  await fs.mkdir(dirProjeto, { recursive: true });

  const { persistencia, migracaoPendente } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });
  const provedor = new ProvedorClaudeCli(process.env.CLAUDE_BIN!, dirProjeto);
  const mapa = mapaModelosDoAmbiente();

  console.log(`\n=== CANÁRIO ${skillId} (${contrato.contrato.versao}) — ${brief.titulo}`);
  console.log(`dir: ${dirProjeto} · persistência: ${migracaoPendente ? "disco (DDL pendente)" : "supabase"}`);

  // --- Retomada: fundação já existe no disco? ---
  const perfilPathExistente = path.join(dirProjeto, "perfil-de-voz.md");
  let perfilExistente = "";
  try { perfilExistente = await fs.readFile(perfilPathExistente, "utf8"); } catch { /* primeira execução */ }
  if (dirExistente && perfilExistente.trim()) {
    const estruturaBruta = JSON.parse(await fs.readFile(path.join(dirProjeto, "estrutura.json"), "utf8")) as { estrutura: FundacaoCanario["estrutura"]; fios: string[]; promessa: string };
    console.log(`fundação reaproveitada · fios: ${estruturaBruta.fios.join(", ")}`);
    return continuarCapitulos(skillId, totalCaps, {
      contrato, brief, projectId, dirProjeto, persistencia, gravador, provedor, mapa, migracaoPendente,
      fundacao: { perfil_voz: perfilExistente, estrutura: estruturaBruta.estrutura, fios: estruturaBruta.fios, promessa_editorial: estruturaBruta.promessa },
      fundacaoRunId: "retomada",
    });
  }

  // --- Fundação (arquiteto_enredo) ---
  const pacoteFundacao = compilarPacote({
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    contrato,
    perfil: { texto: `Briefing do autor: ${brief.premissa}`, skillId: contrato.contrato.id, hash: "briefing", validado: true },
  });
  if (!pacoteFundacao.ok) throw new Error(`compilação da fundação bloqueada: ${JSON.stringify(pacoteFundacao.bloqueios)}`);
  const fundacao = await executarPapel<FundacaoCanario>({
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    pacote: pacoteFundacao.pacote!,
    tarefa: tarefaArquitetoEnredo({ titulo: brief.titulo, premissa: brief.premissa, totalCapitulos: totalCaps }, contrato.contrato),
    parse: parseFundacao,
    gravador,
    provedor,
    mapa,
    timeoutMs: 300000,
  });

  // Gravador (código) materializa a fundação em disco + hashes no estado.
  const perfilPath = path.join(dirProjeto, "perfil-de-voz.md");
  const estruturaPath = path.join(dirProjeto, "estrutura.json");
  await fs.writeFile(perfilPath, fundacao.valor.perfil_voz, "utf8");
  await fs.writeFile(estruturaPath, JSON.stringify({ estrutura: fundacao.valor.estrutura, fios: fundacao.valor.fios, promessa: fundacao.valor.promessa_editorial }, null, 2), "utf8");
  const estado = await gravador.carregarEstado();
  estado.doc.skill = { id: contrato.contrato.id, versao: contrato.contrato.versao, hash: contrato.hash };
  estado.doc.fundacao = {
    versao: "1",
    hash: hashJsonCanonico(fundacao.valor),
    docs: {
      "perfil-de-voz.md": createHash("sha256").update(fundacao.valor.perfil_voz, "utf8").digest("hex"),
      "estrutura.json": hashJsonCanonico(fundacao.valor.estrutura),
    },
  };
  estado.doc.total_capitulos = totalCaps;
  await persistencia.gravarEstado(estado);
  await gravador.mudarFase("estrutura");
  await gravador.mudarFase("escrita");
  console.log(`fundação ok · fios: ${fundacao.valor.fios.join(", ")}`);

  return continuarCapitulos(skillId, totalCaps, {
    contrato, brief, projectId, dirProjeto, persistencia, gravador, provedor, mapa, migracaoPendente,
    fundacao: fundacao.valor,
    fundacaoRunId: fundacao.runId,
  });
}

interface CtxCanario {
  contrato: ReturnType<typeof carregarContrato>;
  brief: { titulo: string; premissa: string };
  projectId: string;
  dirProjeto: string;
  persistencia: Awaited<ReturnType<typeof criarPersistencia>>["persistencia"];
  gravador: Gravador;
  provedor: ProvedorClaudeCli;
  mapa: ReturnType<typeof mapaModelosDoAmbiente>;
  migracaoPendente: boolean;
  fundacao: FundacaoCanario;
  fundacaoRunId: string;
}

async function continuarCapitulos(skillId: string, totalCaps: number, ctx: CtxCanario): Promise<Record<string, unknown>> {
  const { contrato, brief, projectId, dirProjeto, persistencia, gravador, provedor, mapa, migracaoPendente, fundacao } = ctx;
  const deps: DepsPipeline = {
    gravador,
    persistencia,
    provedor,
    mapa,
    contrato,
    perfil: {
      texto: fundacao.perfil_voz,
      skillId: contrato.contrato.id,
      hash: createHash("sha256").update(fundacao.perfil_voz, "utf8").digest("hex"),
      validado: true,
    },
    dirManuscrito: path.join(dirProjeto, "manuscrito"),
    projectId,
    maxCorrecoes: 4, // paridade com a escada V1 (orçamento 5); anti-loop continua protegendo
    instrucoesAutor: [
      {
        texto: `Estrutura aprovada: ${fundacao.estrutura.map((e) => `cap ${e.capitulo} [${e.fio}] ${e.resumo_estrutural}`).join(" · ")}`,
        camada: "decisao_autor",
        fonte: "canario:estrutura",
      },
    ],
  };

  // Estado FRESCO decide o que falta (retomada: capítulos aprovados são pulados).
  const estadoAtual = await gravador.carregarEstado();
  const resultados: Record<string, unknown>[] = [];
  for (let n = 1; n <= totalCaps; n++) {
    const cap = estadoAtual.doc.capitulos[String(n)];
    if (cap && (cap.status === "aprovado" || cap.status === "aprovado_com_excecao")) {
      console.log(`— capítulo ${n}/${totalCaps}: já aprovado (retomada), pulando`);
      resultados.push({ capitulo: n, status: cap.status, textHash: cap.text_hash, retomado: true });
      continue;
    }
    console.log(`— capítulo ${n}/${totalCaps}…`);
    const anteriores: { numero: number; trecho: string }[] = [];
    const trechos: { titulo: string; texto: string; fonte: string }[] = [];
    if (n > 1) {
      const prev = path.join(deps.dirManuscrito, `capitulo-${String(n - 1).padStart(2, "0")}.md`);
      try {
        const t = await fs.readFile(prev, "utf8");
        anteriores.push({ numero: n - 1, trecho: t });
        trechos.push({ titulo: `FINAL DO CAPÍTULO ${n - 1}`, texto: t.split(/\n{2,}/).slice(-3).join("\n\n"), fonte: `capitulo-${n - 1}` });
      } catch { /* segue sem trecho anterior */ }
    }
    const r = await escreverCapitulo(deps, n, { anteriores, trechosAnteriores: trechos });
    console.log(`   → ${r.status}${r.problemas.length ? ` (${r.problemas[0]})` : ""} · runs: ${r.runs.length}`);
    resultados.push({ capitulo: n, status: r.status, textHash: r.textHash, reviewId: r.reviewId, runs: r.runs.length, problemas: r.problemas, gatesFalhos: r.gatesFalhos });
    if (r.status !== "aprovado" && r.status !== "aprovado_com_excecao") break; // falha é retomável: re-rodar com --dir continua do estado
  }

  const relatorio = {
    projectId,
    skill: { id: contrato.contrato.id, versao: contrato.contrato.versao, hash: contrato.hash },
    titulo: brief.titulo,
    dirProjeto,
    migracaoPendente,
    fundacao: { fios: fundacao.fios, promessa: fundacao.promessa_editorial, runId: ctx.fundacaoRunId },
    capitulos: resultados,
    executadoEm: new Date().toISOString(),
  };
  const relPath = path.join(dirProjeto, "engine-v2", "canario-relatorio.json");
  await fs.mkdir(path.dirname(relPath), { recursive: true });
  await fs.writeFile(relPath, JSON.stringify(relatorio, null, 2), "utf8");
  console.log(`relatório: ${relPath}`);
  return relatorio;
}

async function main() {
  const arg = process.argv[2] ?? "todos";
  const capsIdx = process.argv.indexOf("--caps");
  const totalCaps = capsIdx > 0 ? Number(process.argv[capsIdx + 1]) || 2 : 2;
  const dirIdx = process.argv.indexOf("--dir");
  const dirExistente = dirIdx > 0 ? process.argv[dirIdx + 1] : undefined;
  const skills = arg === "todos" ? ["dan-brown", "hoover-mcfadden", "romantasy"] : [arg];
  if (dirExistente && skills.length > 1) throw new Error("--dir só com uma skill");
  const todos: Record<string, unknown>[] = [];
  for (const s of skills) {
    try {
      todos.push(await rodarCanario(s, totalCaps, dirExistente));
    } catch (e) {
      console.error(`CANÁRIO ${s} FALHOU:`, e instanceof Error ? e.message : e);
      todos.push({ skill: s, erro: e instanceof Error ? e.message : String(e) });
      process.exitCode = 1;
    }
  }
  const resumoPath = path.join(process.env.WORK_DIR!, "canario-v2-resumo.json");
  await fs.writeFile(resumoPath, JSON.stringify(todos, null, 2), "utf8");
  console.log(`\nresumo: ${resumoPath}`);
}

main();
