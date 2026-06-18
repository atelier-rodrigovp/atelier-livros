// Executores por tipo de job. Cada um ORQUESTRA uma skill do Claude Code — não
// reimplementa a lógica. São esqueletos com a forma correta; o Claude Code completa
// os TODOs por fase (Seção 12 do spec).
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { sb, OWNER } from "./supabase.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const PY_BIN = process.env.PY_BIN || "python3";
const RUNNER_PATH = process.env.RUNNER_PATH || "";
const MODEL = process.env.MODEL || "opus";

export interface Job {
  id: string;
  tipo: string;
  payload: any;
  project_id: string | null;
  edition_id: string | null;
}

// Callback opcional de heartbeat (o loop injeta para sinalizar progresso).
export type Heartbeat = (extra?: Record<string, unknown>) => Promise<void>;

function projDir(projectId: string) {
  return path.join(WORK_DIR, projectId);
}

// Executa um processo e devolve {code, out, err}. Faz streaming de progresso opcional.
function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: false });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? -1, out, err }));
  });
}

async function setProgress(jobId: string, progresso: Record<string, unknown>) {
  await sb.from("jobs").update({ progresso }).eq("id", jobId);
}

async function countWords(file: string) {
  try { return (await readFile(file, "utf8")).split(/\s+/).filter(Boolean).length; }
  catch { return 0; }
}

// ---- Executores -----------------------------------------------------------

// ping: smoke test da FASE 0. Verifica a ponte web->fila->worker de ponta a ponta,
// sem depender de nenhuma skill. Apenas grava progresso verificável e conclui.
async function ping(job: Job) {
  await setProgress(job.id, {
    fase: "PING",
    recebido_em: new Date().toISOString(),
    payload: job.payload ?? {},
  });
}

// criar_fundacao: roda a skill arquiteto-de-enredo em modo NÃO interativo a partir
// do briefing salvo em projects.briefing -> gera a fundação no disco.
async function criarFundacao(job: Job) {
  const { data: proj } = await sb.from("projects").select("*").eq("id", job.project_id).single();
  const dir = projDir(job.project_id!);
  await mkdir(dir, { recursive: true });
  // grava briefing.md a partir de proj.briefing (TODO: template completo da Seção 8.1)
  // ...escrever ${dir}/briefing.md...
  const prompt =
    "Rode a skill arquiteto-de-enredo em modo NAO INTERATIVO a partir de ./briefing.md. " +
    "Para cada decisao use o briefing; quando omisso, adote o default e registre em " +
    "'## SUPOSICOES ASSUMIDAS'. Gere a fundacao completa (Biblia, Estrutura, Mapa, " +
    "perfil-de-voz, 5 agentes, estado/, ESTADO_LIVRO.json semente com skill_escrita). " +
    "NAO dispare /goal e NAO escreva capitulos.";
  const r = await run(CLAUDE_BIN, ["-p", prompt, "--permission-mode", "bypassPermissions", "--model", MODEL], dir);
  if (r.code !== 0) throw new Error("arquiteto-de-enredo falhou: " + r.err.slice(-500));
  // TODO: criar edition de origem; subir arquivos da fundação p/ Storage; status=fundacao
}

// escrever_livro: ESPINHA determinística — roda o livro_runner.py (Opus) até CONCLUIDO.
async function escreverLivro(job: Job) {
  if (!RUNNER_PATH) throw new Error("RUNNER_PATH nao configurado");
  const dir = projDir(job.project_id!);
  const { data: proj } = await sb.from("projects").select("*").eq("id", job.project_id).single();
  const piso = String(proj?.piso_palavras ?? 1400);
  const args = [
    RUNNER_PATH, "--projeto", dir, "--briefing", path.join(dir, "briefing.md"),
    "--epub", "--meta", String(proj?.meta_nota ?? 9.0), "--max-reescritas", "4",
    "--piso", piso, "--model", MODEL,
  ];
  const r = await run(PY_BIN, args, dir);
  // VERDADE DO DISCO: conta capítulos válidos (>= piso) e espelha no banco.
  const manus = path.join(dir, "manuscrito");
  let validos = 0;
  try {
    for (const f of await readdir(manus)) {
      if (/^capitulo-\d{2}\.md$/.test(f)) {
        const w = await countWords(path.join(manus, f));
        if (w >= Number(piso)) validos++;
      }
    }
  } catch {}
  await setProgress(job.id, { fase: "ESCRITA", capitulos_validos: validos });
  if (r.code !== 0) throw new Error("runner retornou " + r.code + " — inspecione runner.log");
  // TODO: subir capítulos/manuscrito/EPUB p/ Storage; gravar chapters/artifacts/nota.
}

// Stubs das demais fases (o Claude Code completa por fase):
async function gerarEpub(_job: Job) { /* skill edicao-kindle -> artifacts(epub) */ }
async function traduzir(_job: Job) { /* skill traducao-editorial por idioma -> editions */ }
async function gerarCapa(_job: Job) { /* IA de imagem + canvas-design -> artifacts(capa) */ }
async function gerarPacote(_job: Job) { /* edicao-kindle -> publishing_packages */ }
async function importarVendas(_job: Job) { /* parse CSV KDP -> sales_rows */ }

// O loop injeta `_hb` (heartbeat) — usado pelos executores pesados nas próximas fases.
export async function executarJob(job: Job, _hb?: Heartbeat): Promise<void> {
  switch (job.tipo) {
    case "ping": return ping(job);
    case "criar_fundacao": return criarFundacao(job);
    case "escrever_livro": return escreverLivro(job);
    case "gerar_epub": return gerarEpub(job);
    case "traduzir": return traduzir(job);
    case "gerar_capa": return gerarCapa(job);
    case "gerar_pacote": return gerarPacote(job);
    case "importar_vendas": return importarVendas(job);
    default: throw new Error("tipo de job desconhecido: " + job.tipo);
  }
}
