// Gate de qualidade da FUNDAÇÃO (F-05/F-06 da auditoria Novo Projeto).
// "Arquivo existe" não é pós-condição: este gate valida presença, parseabilidade,
// coerência cruzada, craft comprovada e consistência de voz, e grava um Quality
// State vinculado aos hashes dos arquivos (quality/fundacao.quality.json).
// Núcleo puro (testável sem disco) + wrapper async de disco.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MARCADOR_VOZ_CONSISTENCIA,
  registroVozDaSkill,
  temCraft,
  vozConsistenciaRegistrada,
} from "./craft-skill.js";
import { MARCADOR_CRAFT_LEITURA, MARCADOR_PROPULSAO } from "./craft-agentes.js";
import { decideQualityState, hashText, type QualityBlocker, type QualityState } from "./quality-state.js";

export const FUNDACAO_DETECTOR_VERSION = "1.0.0";
export const FUNDACAO_QUALITY_FILE = path.join("quality", "fundacao.quality.json");

export const ARQUIVOS_FUNDACAO = [
  "briefing.md",
  "Biblia-da-Obra.md",
  "Mapa-de-Personagens.md",
  "Estrutura-do-Livro.md",
  "perfil-de-voz.md",
  "ESTADO_LIVRO.json",
] as const;

export const AGENTES_FUNDACAO = [
  "livro-escritor.md",
  "livro-revisor.md",
  "livro-editor.md",
  "livro-contextualizador.md",
] as const;

export interface ConteudoFundacao {
  // chave = caminho relativo (ex.: "Biblia-da-Obra.md", ".claude/agents/livro-escritor.md");
  // valor = conteúdo, ou null se o arquivo não existe.
  arquivos: Record<string, string | null>;
}

export interface ContextoFundacao {
  skill: string | null;
  protagonistaNome?: string | null;
}

export interface AvaliacaoFundacao {
  blockers: QualityBlocker[];
  warnings: string[];
  hashes: Record<string, string>;
  totalCapitulosEstado: number;
  capitulosEstrutura: number;
}

const agentePath = (a: string) => `.claude/agents/${a}`;

// Conta capítulos declarados na Estrutura por cabeçalho. Formatos reais do
// arquiteto: "## Capítulo 12", "Capítulo 12 —", "### Cap. 12 — ..." (abreviado).
// "caps. 1–4" (plural, em cabeçalho de ATO) não conta.
export function contarCapitulosEstrutura(estrutura: string): number {
  const nums = new Set<number>();
  const re = /^#{0,4}\s*cap(?:[ií]tulo)?\.?\s+(\d{1,3})\b/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(estrutura))) nums.add(Number(m[1]));
  return nums.size;
}

// Linhas de sinopse repetidas na Estrutura (capítulos que só repetem informação).
export function sinopsesDuplicadas(estrutura: string): number {
  const vistos = new Map<string, number>();
  for (const l of estrutura.split(/\r?\n/)) {
    const t = l.trim().toLowerCase();
    if (t.length < 40 || t.startsWith("#") || t.startsWith("|")) continue;
    vistos.set(t, (vistos.get(t) ?? 0) + 1);
  }
  let dups = 0;
  for (const n of vistos.values()) if (n > 1) dups += n - 1;
  return dups;
}

export function avaliarFundacaoConteudo(c: ConteudoFundacao, ctx: ContextoFundacao): AvaliacaoFundacao {
  const blockers: QualityBlocker[] = [];
  const warnings: string[] = [];
  const hashes: Record<string, string> = {};

  const get = (k: string) => c.arquivos[k] ?? null;
  for (const [k, v] of Object.entries(c.arquivos)) if (v !== null) hashes[k] = hashText(v);

  // 1) Presença e não-vazio dos arquivos e agentes obrigatórios
  for (const f of ARQUIVOS_FUNDACAO) {
    const v = get(f);
    if (v === null || !v.trim())
      blockers.push({ code: `ARQUIVO_AUSENTE:${f}`, message: `arquivo obrigatório ausente ou vazio: ${f}`, severity: "critical" });
  }
  for (const a of AGENTES_FUNDACAO) {
    const v = get(agentePath(a));
    if (v === null || !v.trim())
      blockers.push({ code: `AGENTE_AUSENTE:${a}`, message: `agente obrigatório ausente: .claude/agents/${a}`, severity: "critical" });
  }

  // 2) ESTADO_LIVRO.json parseável e coerente
  let estado: any = null;
  let totalCapitulosEstado = 0;
  const estadoRaw = get("ESTADO_LIVRO.json");
  if (estadoRaw) {
    try { estado = JSON.parse(estadoRaw); } catch { /* tratado abaixo */ }
    if (!estado || typeof estado !== "object") {
      blockers.push({ code: "ESTADO_INVALIDO", message: "ESTADO_LIVRO.json não é JSON válido", severity: "critical" });
    } else {
      totalCapitulosEstado = Number(estado.total_capitulos_previstos ?? 0);
      if (!(totalCapitulosEstado > 0))
        blockers.push({ code: "ESTADO_SEM_TOTAL", message: "total_capitulos_previstos ausente ou <= 0", severity: "critical" });
      const skillEstado = estado.skill_escrita ?? null;
      if ((ctx.skill ?? null) !== skillEstado)
        blockers.push({
          code: "SKILL_INCOERENTE",
          message: `skill do projeto (${ctx.skill ?? "null"}) difere do ESTADO_LIVRO.json (${skillEstado ?? "null"})`,
          severity: "critical",
        });
    }
  }

  // 3) Estrutura: capítulos declarados batem com o estado
  const estrutura = get("Estrutura-do-Livro.md") ?? "";
  const capitulosEstrutura = estrutura ? contarCapitulosEstrutura(estrutura) : 0;
  if (estrutura && capitulosEstrutura === 0) {
    warnings.push("Estrutura-do-Livro.md sem cabeçalhos de capítulo parseáveis (formato não reconhecido)");
  } else if (capitulosEstrutura > 0 && totalCapitulosEstado > 0 && capitulosEstrutura !== totalCapitulosEstado) {
    blockers.push({
      code: "ESTRUTURA_CAPITULOS_INCOERENTES",
      message: `Estrutura declara ${capitulosEstrutura} capítulos; ESTADO_LIVRO.json prevê ${totalCapitulosEstado}`,
      severity: "high",
      metric: "capitulos", observed: capitulosEstrutura, target: totalCapitulosEstado,
    });
  }

  // 4) Craft da skill comprovada no perfil e nos agentes
  const perfil = get("perfil-de-voz.md") ?? "";
  if (ctx.skill && registroVozDaSkill(ctx.skill) && perfil && !temCraft(perfil))
    blockers.push({
      code: "CRAFT_AUSENTE",
      message: `perfil-de-voz.md sem o bloco de craft da skill '${ctx.skill}' (normalizador não comprovou a incorporação)`,
      severity: "critical",
    });
  const escritor = get(agentePath("livro-escritor.md")) ?? "";
  if (escritor && !escritor.includes(MARCADOR_CRAFT_LEITURA))
    blockers.push({ code: "CRAFT_AGENTE_ESCRITOR", message: "livro-escritor.md sem o bloco CRAFT-LEITURA", severity: "high" });
  const revisor = get(agentePath("livro-revisor.md")) ?? "";
  if (revisor && !revisor.includes(MARCADOR_PROPULSAO))
    blockers.push({ code: "CRAFT_AGENTE_REVISOR", message: "livro-revisor.md sem o bloco PROPULSAO", severity: "high" });

  // 5) Consistência de voz: registro (manual OU automático) precisa existir
  const biblia = get("Biblia-da-Obra.md") ?? "";
  if (ctx.skill && registroVozDaSkill(ctx.skill) && biblia && !vozConsistenciaRegistrada(biblia))
    blockers.push({
      code: "VOZ_NAO_REGISTRADA",
      message: "consistência de voz vs skill sem registro auditável na Bíblia (nem alinhamento automático nem divergência autoral)",
      severity: "high",
    });

  // 6) Coerência de personagens (v1: protagonista do briefing presente nos docs)
  const nome = (ctx.protagonistaNome ?? "").trim();
  if (nome) {
    const mapa = get("Mapa-de-Personagens.md") ?? "";
    const emBiblia = biblia.toLowerCase().includes(nome.toLowerCase());
    const emMapa = mapa.toLowerCase().includes(nome.toLowerCase());
    if (biblia && mapa && (!emBiblia || !emMapa))
      blockers.push({
        code: "PROTAGONISTA_INCOERENTE",
        message: `protagonista '${nome}' do briefing não aparece em ${!emBiblia ? "Biblia-da-Obra.md" : ""}${!emBiblia && !emMapa ? " e " : ""}${!emMapa ? "Mapa-de-Personagens.md" : ""}`,
        severity: "high",
      });
    if (estrutura && !estrutura.toLowerCase().includes(nome.toLowerCase()))
      warnings.push(`protagonista '${nome}' não aparece na Estrutura-do-Livro.md`);
  }

  // 7) Rubrica anti-genérico v1 (heurística honesta: sinaliza, não prova qualidade)
  if (biblia && estrutura && !/virada|reviravolta|twist|revela[cç][aã]o/i.test(biblia + estrutura))
    warnings.push("nenhuma virada/reviravolta declarada na Bíblia ou Estrutura (estrutura possivelmente episódica)");
  if (estrutura) {
    const dups = sinopsesDuplicadas(estrutura);
    if (dups > 0) warnings.push(`${dups} linha(s) de sinopse repetidas na Estrutura (capítulos que repetem informação)`);
  }
  if (biblia && !/antagonista|vil[aã]o|advers[aá]ri/i.test(biblia))
    warnings.push("Bíblia sem seção/menção de antagonista identificável");

  return { blockers, warnings, hashes, totalCapitulosEstado, capitulosEstrutura };
}

// Texto agregado estável cujos hash vincula o Quality State ao conteúdo atual.
export function textoAgregadoFundacao(hashes: Record<string, string>): string {
  return Object.keys(hashes).sort().map((k) => `${k}:${hashes[k]}`).join("\n");
}

export function qualityStateFundacao(av: AvaliacaoFundacao, skillVersion: string): QualityState {
  return decideQualityState({
    text: textoAgregadoFundacao(av.hashes),
    detectorVersion: FUNDACAO_DETECTOR_VERSION,
    skillVersion,
    stage: "GATE_FUNDACAO",
    decisionBy: "fundacao-gate",
    attempts: 1,
    maxAttempts: 1,
    metricsAfter: {
      arquivos: av.hashes,
      total_capitulos_estado: av.totalCapitulosEstado,
      capitulos_estrutura: av.capitulosEstrutura,
    },
    blockers: av.blockers,
    warnings: av.warnings,
  });
}

// --- F-06: consistência de voz idempotente (auto-registro auditável) --------
export interface RegistroVozAutomatico {
  novaBiblia: string | null; // texto novo da Bíblia se registrou agora; null se nada a fazer
  registrado: boolean;       // true se há (ou passou a haver) registro auditável
  motivo: string;
}

export function consistenciaVozAutomatica(
  biblia: string,
  perfil: string,
  skill: string | null | undefined,
  agora: () => string = () => new Date().toISOString(),
): RegistroVozAutomatico {
  const registro = registroVozDaSkill(skill);
  if (!registro) return { novaBiblia: null, registrado: true, motivo: "skill sem registro de voz (no-op)" };
  if (vozConsistenciaRegistrada(biblia))
    return { novaBiblia: null, registrado: true, motivo: "registro existente preservado (alinhamento ou divergência autoral)" };
  if (!temCraft(perfil))
    return {
      novaBiblia: null,
      registrado: false,
      motivo: "craft canônica NÃO comprovada no perfil-de-voz.md — exige normalizador ou decisão autoral",
    };
  const bloco =
    `\n\n${MARCADOR_VOZ_CONSISTENCIA} alinhado (registro automático auditável): a craft canônica da skill ` +
    `\`${skill}\` foi comprovada em perfil-de-voz.md (sha256 ${hashText(perfil)}) pelo normalizador determinístico em ${agora()}. ` +
    `Divergência autoral, se desejada, deve substituir esta linha por "${MARCADOR_VOZ_CONSISTENCIA} divergência consciente: <o quê/por quê>".\n`;
  return { novaBiblia: biblia + bloco, registrado: true, motivo: "alinhamento registrado automaticamente (idempotente)" };
}

// --- wrappers de disco -------------------------------------------------------
async function lerSeExiste(p: string): Promise<string | null> {
  try { return await readFile(p, "utf8"); } catch { return null; }
}

export async function lerConteudoFundacao(dir: string): Promise<ConteudoFundacao> {
  const arquivos: Record<string, string | null> = {};
  for (const f of ARQUIVOS_FUNDACAO) arquivos[f] = await lerSeExiste(path.join(dir, f));
  for (const a of AGENTES_FUNDACAO) arquivos[agentePath(a)] = await lerSeExiste(path.join(dir, ".claude", "agents", a));
  return { arquivos };
}

/** Aplica o auto-registro de voz no disco (idempotente) e retorna o resultado. */
export async function registrarConsistenciaVozNoDisco(dir: string, skill: string | null | undefined): Promise<RegistroVozAutomatico> {
  const biblia = (await lerSeExiste(path.join(dir, "Biblia-da-Obra.md"))) ?? "";
  const perfil = (await lerSeExiste(path.join(dir, "perfil-de-voz.md"))) ?? "";
  const r = consistenciaVozAutomatica(biblia, perfil, skill);
  if (r.novaBiblia !== null) await writeFile(path.join(dir, "Biblia-da-Obra.md"), r.novaBiblia, "utf8");
  return r;
}

/** Avalia a fundação no disco, grava o Quality State e o retorna. */
export async function avaliarFundacaoNoDisco(
  dir: string,
  ctx: ContextoFundacao,
  skillVersion = "unknown",
): Promise<{ state: QualityState; avaliacao: AvaliacaoFundacao }> {
  const conteudo = await lerConteudoFundacao(dir);
  const avaliacao = avaliarFundacaoConteudo(conteudo, ctx);
  const state = qualityStateFundacao(avaliacao, skillVersion);
  await mkdir(path.join(dir, "quality"), { recursive: true });
  await writeFile(path.join(dir, FUNDACAO_QUALITY_FILE), JSON.stringify(state, null, 2), "utf8");
  return { state, avaliacao };
}

// Sessões headless podem ter a escrita em `.claude/` bloqueada pelo harness;
// nesse caso o arquiteto grava os agentes em `_agentes-para-instalar/` com um
// LEIA-ME. Instala deterministicamente o staging em `.claude/agents/` sem
// nunca sobrescrever agente existente (idempotente). Sem staging = no-op.
export async function instalarAgentesDeStaging(dir: string): Promise<string[]> {
  const staging = path.join(dir, "_agentes-para-instalar");
  let arquivos: string[] = [];
  try { arquivos = (await readdir(staging)).filter((f) => /^livro-[a-z-]+\.md$/.test(f)); } catch { return []; }
  if (!arquivos.length) return [];
  const destino = path.join(dir, ".claude", "agents");
  await mkdir(destino, { recursive: true });
  const instalados: string[] = [];
  for (const f of arquivos) {
    const alvo = path.join(destino, f);
    if ((await lerSeExiste(alvo)) !== null) continue; // nunca sobrescreve
    await writeFile(alvo, await readFile(path.join(staging, f), "utf8"), "utf8");
    instalados.push(f);
  }
  return instalados;
}

/** Hashes atuais dos arquivos da fundação no disco (para diff antes/depois do refino). */
export async function hashesFundacaoNoDisco(dir: string): Promise<Record<string, string>> {
  const c = await lerConteudoFundacao(dir);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.arquivos)) if (v !== null) h[k] = hashText(v);
  return h;
}

/** Arquivos cujo conteúdo mudou entre dois snapshots (inclui criados/removidos). */
export function diffFundacao(antes: Record<string, string>, depois: Record<string, string>): string[] {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...chaves].filter((k) => antes[k] !== depois[k]).sort();
}

// F-07: fundação mudou ⇒ aprovações de capítulo anteriores deixam de valer.
// Rebaixa para `stale` os quality/capitulo-NN.json atualmente aprovados
// (estados já bloqueados/rewrite continuam exigindo ação — não são tocados).
export async function invalidarQualityCapitulos(dir: string, motivo: string): Promise<string[]> {
  const qdir = path.join(dir, "quality");
  let nomes: string[] = [];
  try { nomes = await readdir(qdir); } catch { return []; }
  const invalidados: string[] = [];
  for (const nome of nomes) {
    if (!/^capitulo-\d+\.json$/.test(nome)) continue;
    const p = path.join(qdir, nome);
    const raw = await lerSeExiste(p);
    if (!raw) continue;
    let st: any;
    try { st = JSON.parse(raw); } catch { continue; }
    if (st.status !== "approved" && st.status !== "approved_with_exception") continue;
    st.status = "stale";
    st.blockers = [
      { code: "FUNDACAO_ALTERADA_POS_REFINO", message: motivo, severity: "critical" },
      ...(Array.isArray(st.blockers) ? st.blockers : []),
    ];
    st.reason = "A fundação mudou após esta aprovação; o capítulo precisa ser reavaliado.";
    st.requiredAction = "Reexecutar os gates do capítulo contra a fundação atual.";
    await writeFile(p, JSON.stringify(st, null, 2) + "\n", "utf8");
    invalidados.push(nome);
  }
  return invalidados;
}

/** Specs existentes (specs/Spec-Capitulo-NN.md) — afetadas quando a Estrutura muda. */
export async function specsExistentes(dir: string): Promise<string[]> {
  try {
    return (await readdir(path.join(dir, "specs"))).filter((f) => /^Spec-Capitulo-\d+\.md$/i.test(f)).sort();
  } catch {
    return [];
  }
}

/** Lê o Quality State persistido e o rebaixa para `stale` se os arquivos mudaram. */
export async function qualityStateFundacaoAtual(dir: string, ctx: ContextoFundacao): Promise<QualityState | null> {
  const raw = await lerSeExiste(path.join(dir, FUNDACAO_QUALITY_FILE));
  if (!raw) return null;
  let persisted: QualityState;
  try { persisted = JSON.parse(raw); } catch { return null; }
  const conteudo = await lerConteudoFundacao(dir);
  const avaliacao = avaliarFundacaoConteudo(conteudo, ctx);
  const atual = textoAgregadoFundacao(avaliacao.hashes);
  if (hashText(atual) === persisted.textHash) return persisted;
  return {
    ...persisted,
    status: "stale",
    blockers: [
      { code: "FUNDACAO_ALTERADA_APOS_AVALIACAO", message: "arquivos da fundação mudaram após a avaliação", severity: "critical" },
      ...persisted.blockers,
    ],
    reason: "A aprovação anterior pertence a outros hashes de fundação.",
    requiredAction: "Reexecutar o gate da fundação (avaliarFundacaoNoDisco).",
  };
}
