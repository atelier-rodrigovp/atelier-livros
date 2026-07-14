// Executores por tipo de job. Cada um ORQUESTRA uma skill do Claude Code (ou um
// script determinístico da skill) — NÃO reimplementa a lógica das skills.
// Verdade do disco: o worker confere arquivos reais antes de gravar status.
import { mkdir, writeFile, rm, cp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sb, OWNER } from "./supabase.js";
import {
  projDir,
  storageKey,
  run,
  runClaude,
  readText,
  countWords,
  chaptersOnDisk,
  uploadFile,
  signedUrl,
  exists,
  RUNNER_PATH,
  PY_BIN,
  MODEL,
  MODEL_ORQUESTRADOR,
  CLAUDE_BIN,
  WORK_DIR,
  CLAUDE_PERMISSION_MODE,
} from "./lib.js";
import { normalizarModelosAgentes } from "./modelos-agentes.js";
import { normalizarVozRegra4 } from "./voz-regra4.js";
import { normalizarCraftSkill } from "./craft-skill.js";
import {
  avaliarFundacaoNoDisco,
  diffFundacao,
  hashesFundacaoNoDisco,
  instalarAgentesDeStaging,
  invalidarQualityCapitulos,
  registrarConsistenciaVozNoDisco,
  specsExistentes,
  FUNDACAO_QUALITY_FILE,
} from "./fundacao-gate.js";
import { normalizarCraftNosAgentes } from "./craft-agentes.js";
import { exigenciasParaSkill, normalizarExigenciasSkill } from "./exigencias-skill.js";
import { normalizarLexicoPtbr } from "./lexico-ptbr.js";
import { hidratarWorkDir } from "./hidratar.js";
import { coletarTelemetria } from "./telemetria.js";
import { gerarImagem, providerAtivo, providerLabel } from "./imagegen.js";
import { sanitizarCapitulo, metaResidual } from "./sanitize.js";
import { LimiteMaxError, limiteMaxRetryAt, pareceLimiteMax } from "./limite-max.js";
import { comRetrySb } from "./retry.js";
import { contarManeirismos, resumoManeirismo, diagnosticarRepeticao } from "./maneirismo.js";
import { existsSync } from "node:fs";
import { InfrastructureRetryError, QualityBlockedError } from "./job-errors.js";
import { decidePublication, verificarEpubFonte } from "./publication-gate.js";
import { createHash } from "node:crypto";
import { applyQualityException, decideQualityState, hashText, type QualityState } from "./quality-state.js";
import { resolveChapterState, deveSincronizar } from "./chapter-state.js";
import { executePublicationTransaction, type PublicationFile } from "./publication-transaction.js";
import { advanceEditionStatus, type EditionStatus } from "./state-machine.js";
import { classifyRunnerOutcome } from "./runner-outcome.js";
import { promptEntrevista, validarSaidaEntrevista } from "./entrevista.js";
import { concluirCorrecoesAprovadas, resumoCorrecaoDoDisco } from "./correcao-fluxo.js";

export interface Job {
  id: string;
  tipo: string;
  payload: any;
  project_id: string | null;
  edition_id: string | null;
}
export type Heartbeat = (extra?: Record<string, unknown>) => Promise<void>;

// Diretório das skills (derivado do RUNNER_PATH: .../skills/livro-do-zero-ao-epub/assets/livro_runner.py)
function skillsDir(): string {
  if (!RUNNER_PATH) return "";
  return path.dirname(path.dirname(path.dirname(RUNNER_PATH)));
}
function edicaoKindleScript(name: string): string {
  return path.join(skillsDir(), "edicao-kindle", "scripts", name);
}

// ---------------------------------------------------------------------------
// Trava antivazamento: nenhum meta-texto de pipeline pode chegar ao livro.
// ---------------------------------------------------------------------------
const GATE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "gate_manuscrito.py");
const SKILLS_ESCRITA_CONHECIDAS = ["skill-dan-brown", "hoover-mcfadden", "skill-jk-rowling", "vesper-escritor-de-capitulos", "skill-romantasy"];

// Preflight: a skill_escrita configurada precisa existir no ambiente. FALHA ALTO
// (job error) — nunca degrada em silêncio nem escreve nota de fallback no texto.
function assertSkillInstalada(skillEscrita: string | null | undefined): void {
  const s = String(skillEscrita || "").trim();
  if (!s || /^nenhuma$/i.test(s)) return; // sem skill: metodologia padrão, ok
  const dir = skillsDir();
  if (dir && existsSync(path.join(dir, s))) return;
  throw new Error(
    `Skill '${s}' não instalada no worker — instale-a em ${dir || "~/.claude/skills"} ` +
      `ou troque o estilo do projeto. Escrita não iniciada. ` +
      `(skills de escrita: ${SKILLS_ESCRITA_CONHECIDAS.join(", ")})`
  );
}

// Sanitiza um capítulo NO DISCO antes de salvar/subir: remove meta-texto (com
// backup do original se mudou) e aplica o GATE — rejeita se restar marcador.
// Retorna true se removeu algo. Lança erro se meta-texto persistir (rejeição).
async function sanitizarArquivoCap(file: string, ctx: string): Promise<boolean> {
  const orig = await readText(file);
  if (!orig) return false;
  const { texto, removidos } = sanitizarCapitulo(orig);
  if (removidos.length) {
    try { await writeFile(file + ".orig.bak", orig, "utf8"); } catch {}
    await writeFile(file, texto, "utf8");
    console.log(`[sanitize] ${ctx} ${path.basename(file)}: removido ${removidos.join("; ")}`);
  }
  const resid = metaResidual(texto);
  if (resid) {
    throw new Error(
      `Meta-texto proibido em ${path.basename(file)} (${ctx}): ${resid}. ` +
        `Capítulo rejeitado — peça reescrita. Nada com meta-texto é aceito.`
    );
  }
  return removidos.length > 0;
}

// Pré-passe: limpa todos os capitulo-NN.md de uma pasta no disco (best-effort,
// sem gate) antes do runner remontar o manuscrito/EPUB. Retorna quantos mudaram.
async function sanitizarPastaCapitulos(subDir: string): Promise<number> {
  let files: string[] = [];
  try { files = (await readdir(subDir)).filter((f) => /^capitulo-\d{2}\.md$/.test(f)); } catch { return 0; }
  let mudou = 0;
  for (const f of files) {
    const file = path.join(subDir, f);
    const orig = await readText(file);
    const { texto, removidos } = sanitizarCapitulo(orig);
    if (removidos.length) {
      try { await writeFile(file + ".orig.bak", orig, "utf8"); } catch {}
      await writeFile(file, texto, "utf8");
      console.log(`[sanitize:pré] ${path.basename(subDir)}/${f}: removido ${removidos.join("; ")}`);
      mudou++;
    }
  }
  return mudou;
}

// Gate de compilação/EPUB: roda tools/gate_manuscrito.py sobre a pasta do
// manuscrito; se achar <!--/fence/assinatura, falha com mensagem clara.
async function gateManuscrito(subDir: string): Promise<void> {
  if (!existsSync(GATE_SCRIPT)) {
    // gate ausente não bloqueia o build (sanitize+metaResidual por capítulo seguem
    // ativos), mas o degrade era MUDO — avisar alto para não sumir em silêncio.
    console.warn(`[gate] ${GATE_SCRIPT} ausente — compilação SEM gate de vazamento book-wide.`);
    return;
  }
  const r = await run(PY_BIN, [GATE_SCRIPT, subDir]);
  if (r.code !== 0) {
    throw new Error(`Gate de compilação reprovou o manuscrito: ${(r.out || r.err).trim().slice(-400)}`);
  }
}

// ---- DB helpers -----------------------------------------------------------
// Falha alto: lança se a escrita no banco retornar erro (evita job "done" divergente).
// Forma fábrica `must(() => sb...)`: re-tenta falha DE REDE com backoff — usar SÓ
// em write idempotente (update/upsert); insert puro fica na forma direta (resposta
// perdida + retry = linha duplicada; a reclassificação de rede no processarJob cobre).
async function must<T extends { error: unknown }>(p: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
  const r = typeof p === "function" ? await comRetrySb(p, { rotulo: "escrita no banco" }) : await p;
  const err = (r as { error: { message?: string } | null }).error;
  if (err) throw new Error("erro de escrita no banco: " + (err.message ?? String(err)));
  return r;
}
async function upsertArtifact(row: Record<string, unknown>) {
  return must(() => sb.from("artifacts").upsert(row, { onConflict: "edition_id,tipo,storage_path" }));
}
async function getProject(id: string) {
  const { data, error } = await sb.from("projects").select("*").eq("owner", OWNER).eq("id", id).single();
  if (error) throw new Error("projeto não encontrado: " + error.message);
  return data;
}
async function getEdition(id: string) {
  const { data, error } = await sb.from("editions").select("*").eq("owner", OWNER).eq("id", id).single();
  if (error) throw new Error("edição não encontrada: " + error.message);
  return data;
}
// Resumo humano e curto do progresso (linha autoexplicativa na UI, persiste mesmo
// depois de concluído). Derivado dos campos crus por fase; conservador — devolve
// undefined quando não reconhece a fase, e aí a UI cai para detalheProgresso/tipoLabel.
function resumoProgresso(p: Record<string, any>): string | undefined {
  const fase = p.fase ? String(p.fase) : "";
  const cap = p.cap_atual != null && p.total ? `cap ${p.cap_atual}/${p.total}` : null;
  const idiomas = Array.isArray(p.idiomas) ? p.idiomas.map((x: unknown) => String(x).toUpperCase()).join(", ") : null;
  const idi = p.idioma ? String(p.idioma).toUpperCase() : null;
  switch (fase) {
    // — pré-escrita / fundação —
    case "PING": return "Teste do worker (ping)";
    case "ENTREVISTA": return p.completo ? "Entrevista de fundação concluída" : "Entrevista de fundação";
    case "ESTRUTURA":
      return p.concluido || p.total_capitulos
        ? `Estrutura pronta · ${p.total_capitulos ?? "?"} caps`
        : `Fundação · ${p.etapa ?? "estrutura"}`;
    case "REFINO": return p.concluido ? "Fundação refinada" : `Fundação · ${p.etapa ?? "refino"}`;
    case "VOLUMES": return p.concluido ? `${p.criados ?? 0} volume(s) criado(s)` : `Criando vol. ${p.volume ?? "?"}`;
    // — escrita (fases do runner) —
    case "ESCRITA": return cap ? `${cap} · escrevendo` : "Escrevendo capítulos";
    case "CONSOLIDACAO": return "Consolidando manuscrito";
    case "REVIEW": return "Avaliando (book-bestseller-review)";
    case "REESCRITA": return "Reescrevendo (pós-review)";
    case "DESMANEIRISMO": return "Desmaneirização (book-wide)";
    case "EPUB": return p.versao ? `EPUB ${p.versao} gerado` : "Gerando EPUB";
    case "CONCLUIDO": return p.nota != null ? `Livro pronto · nota ${p.nota}` : "Livro pronto";
    // — pós-produção (jobs próprios) —
    case "TRADUCAO":
      return p.concluido
        ? `Tradução pronta${idiomas ? ` · ${idiomas}` : ""}`
        : `Traduzindo${idi ? ` · ${idi}` : ""}${cap ? ` · ${cap}` : ""}`;
    case "AVALIACAO": return p.nota != null ? `book-bestseller-review · nota ${p.nota}` : `Avaliando${idi ? ` · ${idi}` : ""}`;
    case "REVISAO": return p.concluido ? `Revisão pronta${p.nota != null ? ` · nota ${p.nota}` : ""}` : `Revisão${p.etapa ? ` · ${p.etapa}` : ""}`;
    case "CAPA": return p.concluido ? "Capa pronta" : `Capa · ${p.etapa ?? "gerando"}`;
    case "PACOTE": return "Pacote comercial pronto";
    case "VENDAS": return `Planilha de vendas${p.linhas != null ? ` · ${p.linhas} linhas` : ""}`;
    case "POST": return p.etapa === "pronto" ? `Posts gerados${p.variacoes != null ? ` · ${p.variacoes}` : ""}` : `Post${p.etapa ? ` · ${p.etapa}` : ""}`;
    case "QUALITY_EXCEPTION": return `Exceção humana registrada${p.cap_atual ? ` · cap ${p.cap_atual}` : ""}`;
    default: return undefined;
  }
}
async function setProgress(jobId: string, progresso: Record<string, unknown>) {
  const resumo = resumoProgresso(progresso as Record<string, any>);
  const comResumo = resumo ? { ...progresso, resumo } : progresso;
  // Update idempotente com retry curto; ao esgotar, LOGA e segue (progresso é
  // cosmético — o poller de 20s corrige no tick seguinte; antes era perda muda).
  const { error } = await comRetrySb(
    () => sb.from("jobs").update({ progresso: comResumo, locked_at: new Date().toISOString() }).eq("owner", OWNER).eq("id", jobId),
    { tentativas: 3, baseMs: 500 }
  );
  if (error) console.warn(`[progresso ${jobId}] não gravado: ${String(error.message ?? error).slice(0, 200)}`);
}
// Telemetria por projeto (tokens/tempo por agente + throughput), schema-free: uma
// linha `jobs` tipo='telemetria', status='paused' (nunca reivindicada pelo picker).
// O painel de observabilidade lê daqui. Best-effort: nunca derruba o job de escrita.
async function gravarTelemetriaProjeto(projectId: string): Promise<void> {
  try {
    const dir = projDir(projectId);
    // conta as pausas de "falso limite" (branch jobs.ts "não avançou") já registradas
    // no progresso deste projeto — sinal de throughput desperdiçado.
    const { data: js } = await sb.from("jobs").select("erro").eq("owner", OWNER)
      .eq("project_id", projectId).eq("tipo", "escrever_livro").limit(50);
    const pausas = (js ?? []).filter((j: any) => /não avançou neste run|nao avancou neste run/i.test(String(j.erro ?? ""))).length;
    const tel = await coletarTelemetria(dir, { pausasFalsoLimite: pausas });
    if (!tel) return;
    const { data: ex } = await sb.from("jobs").select("id").eq("owner", OWNER)
      .eq("project_id", projectId).eq("tipo", "telemetria").limit(1);
    if (ex?.length) {
      await sb.from("jobs").update({ payload: tel }).eq("owner", OWNER).eq("id", (ex[0] as any).id);
    } else {
      await sb.from("jobs").insert({ owner: OWNER, project_id: projectId, tipo: "telemetria", status: "paused", payload: tel });
    }
  } catch (e: any) {
    console.warn(`[telemetria] projeto ${projectId}: ${String(e?.message ?? e).slice(0, 200)}`);
  }
}
async function ensureEdition(projectId: string, idioma: string, isOrigem: boolean, status = "pendente") {
  const { data: existing, error: existingError } = await sb.from("editions").select("*")
    .eq("owner", OWNER).eq("project_id", projectId).eq("idioma", idioma).maybeSingle();
  if (existingError) throw new Error("erro ao localizar edição: " + existingError.message);
  if (existing) {
    // Nunca rebaixa uma edição pronta e nunca a promove por mero efeito colateral.
    const atual = String((existing as any).status ?? "pendente") as EditionStatus;
    const next = advanceEditionStatus(atual, status as EditionStatus);
    if (next !== atual || Boolean((existing as any).is_origem) !== isOrigem) {
      const { data, error } = await sb.from("editions").update({ status: next, is_origem: isOrigem })
        .eq("owner", OWNER).eq("id", (existing as any).id).select().single();
      if (error) throw new Error("erro ao atualizar edição: " + error.message);
      return data;
    }
    return existing;
  }
  const { data } = await must(() =>
    sb
      .from("editions")
      .upsert(
        { owner: OWNER, project_id: projectId, idioma, is_origem: isOrigem, status },
        { onConflict: "project_id,idioma" }
      )
      .select()
      .single()
  );
  return data;
}

// ---- briefing.md a partir do projects.briefing ----------------------------
function renderBriefing(proj: any): string {
  const b = proj.briefing || {};
  const p = b.protagonista || {};
  const L = (v: any) => (v == null || v === "" ? "" : String(v));
  return `# Briefing do Livro

## Ideia central
${L(b.ideia_central)}

## Gênero
${L(b.genero ?? proj.genero)}

## Protagonista
- **Nome / quem é:** ${L(p.nome)}
- **Ferida (o trauma/falta que o move):** ${L(p.ferida)}
- **Segredo:** ${L(p.segredo)}
- **Desejo ativo:** ${L(p.desejo)}

## Antagonista
${L(b.antagonista)}

## Elenco (nº de personagens nomeados por papel)
${(() => { const pe = b.personagens || {}; const parts = []; if (pe.protagonistas) parts.push(`protagonistas: ${pe.protagonistas}`); if (pe.antagonistas) parts.push(`antagonistas: ${pe.antagonistas}`); if (pe.apoio) parts.push(`apoio: ${pe.apoio}`); return parts.length ? parts.join("; ") + ". Cada personagem de apoio deve carregar um FIO/subtrama próprio (densidade por entrelaçamento)." : L(b.personagens); })()}

## Série / saga
${b.serie ? `Série "${b.serie}" — ${L(b.serie_total) || "?"} livros no total; este é o volume ${L(b.volume) || proj.volume || 1}. IMPORTANTE: planeje arcos e subtramas que ATRAVESSEM os ${L(b.serie_total) || "N"} livros (não resolva tudo neste volume); cast e fios devem sustentar a saga inteira.` : "Livro único."}

## Tom / voz / ponto de vista / tempo verbal
- **Tom e voz:** ${L(b.tom)}
- **Ponto de vista (PdV):** ${L(b.pdv)}
- **Tempo verbal:** ${L(b.tempo_verbal)}

## Número de capítulos
${L(b.num_capitulos ?? proj.total_capitulos)}

## Meta de palavras
${L(b.meta_palavras)}

## Páginas-alvo
${L(b.paginas_alvo ?? proj.paginas_alvo)}

## Linha do tempo
${L(b.linha_tempo)}

## Final
${L(b.final)}

## Cânone e restrições
- **Idioma:** ${L(proj.idioma_origem || "pt-BR")}
- **Fixos (não mudar):** ${L(b.canone)}
- **Proibido:** ${L(b.proibido)}
- **Skill de escrita (skill_escrita):** ${L(proj.skill_escrita)}
- **Na dúvida:** assumir o default da skill e registrar como suposição na Bíblia.
`;
}

async function readState(dir: string): Promise<any | null> {
  const t = await readText(path.join(dir, "ESTADO_LIVRO.json"));
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

// LIVRO IMPORTADO: o WORK_DIR nasce vazio (importador grava só banco/Storage). Se não
// há ESTADO_LIVRO.json no disco, hidrata do Storage (capítulos→capitulo-NN.md, fundação,
// ESTADO semeado, MESTRE) antes da ação. Idempotente; no-op para projeto normal (já tem
// ESTADO). Falha alto NÃO: hidratar é melhor-esforço; o handler decide o que exigir.
async function hidratarSeNecessario(projectId: string | null): Promise<void> {
  if (!projectId) return;
  if (await exists(path.join(projDir(projectId), "ESTADO_LIVRO.json"))) return;
  try {
    const r = await hidratarWorkDir(projectId);
    console.log(
      `[hidratar] ${projectId}: ${r.capitulos} caps (baixou ${r.baixados}), ` +
        `fundação=${r.temFundacao ? "sim" : "não"}, mestre=${r.mestre}, estado=${r.estadoSemeado ? "semeado" : "—"}`
    );
  } catch (e) {
    console.warn(`[hidratar] ${projectId}: ${(e as Error).message}`);
  }
}

// Fundação Atelier presente no disco? (agentes livro-* — o runner precisa deles p/ refinar).
async function temFundacaoAtelier(dir: string): Promise<boolean> {
  return exists(path.join(dir, ".claude", "agents", "livro-escritor.md"));
}

// ===========================================================================
// ping — smoke test (FASE 0)
// ===========================================================================
async function ping(job: Job) {
  await setProgress(job.id, { fase: "PING", recebido_em: new Date().toISOString(), payload: job.payload ?? {} });
}

// ===========================================================================
// entrevistar — 1 turno da entrevista do arquiteto-de-enredo (perguntas com
// recomendação) a partir de uma ideia única; valida e, ao fim, dispara criar_fundacao.
// ===========================================================================
async function entrevistar(job: Job, hb?: Heartbeat) {
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  await mkdir(dir, { recursive: true });
  const briefing = proj.briefing || {};
  const idea = briefing.ideia_central || briefing.idea || proj.titulo || "";
  const qa: any[] = Array.isArray(briefing.qa) ? briefing.qa : [];
  await hb?.({ fase: "ENTREVISTA", turnos: qa.length });

  const forcarConclusao = qa.length >= 12; // teto rígido: ~4 blocos (encerra a AUTOMAÇÃO; nunca aprova sozinho)
  const outFile = path.join(dir, "entrevista-out.json");
  try { await rm(outFile); } catch {}

  const prompt = promptEntrevista({ idea, qa, forcarConclusao });
  const r = await runClaude(prompt, dir);

  const raw = await readText(outFile);
  if (!raw) throw new Error("entrevista sem saída (entrevista-out.json). rc=" + r.code + " " + r.err.slice(-300));

  // Contrato determinístico: a saída do agente nunca atualiza o projeto sem validação.
  const resultado = validarSaidaEntrevista(raw, qa);

  if (resultado.tipo === "invalido") {
    throw new Error("entrevista-out.json reprovado no contrato: " + resultado.erros.join("; "));
  }

  if (resultado.tipo === "concluir") {
    const b = resultado.briefing;
    const merged = { ...b, idea, qa, _interview: { completo: true, avisos: resultado.avisos } };
    await must(
      sb.from("projects").update({
        briefing: merged,
        genero: b.genero ?? proj.genero ?? null,
        serie: b.serie ?? proj.serie ?? null,
        volume: b.volume ?? proj.volume ?? 1,
        total_capitulos: b.num_capitulos ?? proj.total_capitulos ?? null,
        paginas_alvo: b.paginas_alvo ?? proj.paginas_alvo ?? null,
        piso_palavras: b.piso_palavras ?? proj.piso_palavras ?? 1400,
        meta_nota: b.meta_nota ?? proj.meta_nota ?? 9.0,
        skill_escrita: b.skill_escrita ?? proj.skill_escrita ?? null,
        idioma_origem: b.idioma ?? proj.idioma_origem ?? "pt-BR",
      }).eq("owner", OWNER).eq("id", job.project_id!)
    );
    // entrevista validada -> dispara a fundação automaticamente
    await must(sb.from("jobs").insert({ owner: OWNER, tipo: "criar_fundacao", project_id: job.project_id }));
    await setProgress(job.id, { fase: "ENTREVISTA", completo: true });
  } else {
    const perguntas = resultado.perguntas;
    const merged = { ...briefing, idea, qa, _interview: { completo: false, pending: perguntas, avisos: resultado.avisos } };
    await must(sb.from("projects").update({ briefing: merged }).eq("owner", OWNER).eq("id", job.project_id!));
    await setProgress(job.id, { fase: "ENTREVISTA", perguntas: perguntas.length });
  }
}

// ===========================================================================
// Normalizadores determinísticos da fundação — sequência ÚNICA e idempotente,
// usada por criar_fundacao, refinar_fundacao e pelo preflight de escrever_livro
// (garante que refino/retomada nunca percam craft, voz, cota e exigências).
// ===========================================================================
async function aplicarNormalizadoresFundacao(dir: string, skill: string | null | undefined) {
  // Agentes gerados em staging (sessão headless com `.claude/` bloqueado)
  // são instalados deterministicamente antes de qualquer normalizador.
  for (const a of await instalarAgentesDeStaging(dir))
    console.log(`[agentes] instalado de _agentes-para-instalar: ${a}`);
  // Pina o MODELO POR PAPEL dos agentes (o arquiteto os emite por prosa,
  // então o model: vinha não-determinístico — editor às vezes opus).
  for (const a of await normalizarModelosAgentes(path.join(dir, ".claude", "agents")))
    console.log(`[modelos] ${a.agente}: ${a.de ?? "(sem model)"} -> ${a.para}${a.mudou ? " [corrigido]" : ""}`);
  // Cota de cadência (Regra 4) + guarda dos parágrafos-modelo no perfil/Estrutura.
  for (const v of await normalizarVozRegra4(dir)) {
    if (v.mudou) console.log(`[voz] Regra 4 / guarda injetada em ${v.arquivo}`);
    if (v.aviso) console.warn(`[voz] AVISO ${v.arquivo}: ${v.aviso}`);
  }
  // Léxico pt-BR (anti-contaminação de português de Portugal — FASE -1).
  { const l = await normalizarLexicoPtbr(dir); if (l.mudou) console.log(`[voz] léxico pt-BR injetado em ${l.arquivo}`); }
  // Resumo de craft da skill no perfil (motor + regras como alvo positivo).
  {
    const c = await normalizarCraftSkill(dir, skill);
    if (c.mudou) console.log(`[craft] resumo da skill '${c.skill}' injetado no perfil-de-voz.md`);
    else if (!c.reconhecida && skill) console.warn(`[craft] skill '${skill}' sem bloco de craft — perfil segue sem resumo`);
  }
  // Escritor lê a craft direto + revisor reprova "competente e chato".
  {
    const a = await normalizarCraftNosAgentes(path.join(dir, ".claude", "agents"));
    if (a.escritor) console.log("[craft] livro-escritor: leitura de craft por capítulo injetada");
    if (a.revisor) console.log("[craft] livro-revisor: veredito de propulsão injetado");
  }
  // Exigências estruturais por skill (rotação de fios, spec completa, dossiê).
  for (const e of await normalizarExigenciasSkill(dir, skill)) {
    if (e.mudou) console.log(`[exigencias] ${e.arquivo}: bloco injetado`);
    if (e.aviso) console.warn(`[exigencias] AVISO ${e.arquivo}: ${e.aviso}`);
  }
  // Consistência de voz IDEMPOTENTE: craft comprovada ⇒ alinhamento auditável
  // gravado na Bíblia; divergência autoral existente é preservada.
  const v = await registrarConsistenciaVozNoDisco(dir, skill);
  console.log(`[voz-consistencia] ${v.motivo}`);
}

// ===========================================================================
// criar_fundacao — skill arquiteto-de-enredo (não interativo) -> fundação no disco
// ===========================================================================
async function criarFundacao(job: Job, hb?: Heartbeat) {
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  await mkdir(path.join(dir, "manuscrito"), { recursive: true });
  await mkdir(path.join(dir, "review"), { recursive: true });
  await writeFile(path.join(dir, "briefing.md"), renderBriefing(proj), "utf8");
  await setProgress(job.id, { fase: "ESTRUTURA", etapa: "gerando fundação" });
  await hb?.({ fase: "ESTRUTURA" });

  const prompt =
    "Você está em modo headless (orquestrador externo). Trabalhe SOMENTE nesta pasta.\n" +
    "FASE ESTRUTURA: rode a skill `arquiteto-de-enredo` em modo NÃO INTERATIVO a partir de ./briefing.md.\n" +
    "- Não faça perguntas; para cada decisão use o briefing; quando omisso, adote o default e registre em " +
    "'## SUPOSIÇÕES ASSUMIDAS' no topo de Biblia-da-Obra.md.\n" +
    "- Gere: Biblia-da-Obra.md, Mapa-de-Personagens.md, Estrutura-do-Livro.md, as pastas " +
    "(manuscrito/, specs/, contexto/, estado/, review/) e os 5 agentes em .claude/agents/.\n" +
    (proj.skill_escrita
      ? `- OBRIGATÓRIO — INGIRA A CRAFT DA SKILL: leia os documentos de craft da skill \`${proj.skill_escrita}\` ` +
        `(em ~/.claude/skills/${proj.skill_escrita}/references/, sobretudo voz-e-oficio.md e metamodelo-thriller.md se existirem) ` +
        "e TRADUZA o motor + as regras em ALVOS CONCRETOS E POSITIVOS no perfil-de-voz.md (com exemplos) e nas Notas de Execução " +
        "da Estrutura-do-Livro.md. O perfil NÃO pode ser voz genérico-literária: é a voz DESTA skill para esta obra.\n"
      : "") +
    // SPEC-DB1/DB3: exigências estruturais por skill (matriz de fios, colunas
    // POV/Dia-Hora, dossiê factual) — skill sem entrada não adiciona nada.
    (exigenciasParaSkill(proj.skill_escrita)?.promptFundacao ?? "") +
    "- Grave a SEMENTE ESTADO_LIVRO.json na raiz, já na fase ESCRITA, com: titulo, total_capitulos_previstos " +
    "(número de capítulos da Estrutura), skill_escrita" +
    (proj.skill_escrita ? ` ('${proj.skill_escrita}')` : " (null)") +
    ", fase_atual='ESCRITA', gerar_epub=true, meta_nota, max_iteracoes_reescrita=4, piso_palavras_cap.\n" +
    "- NÃO dispare /goal e NÃO escreva capítulos.";

  const r = await runClaude(prompt, dir);
  // Verdade do disco
  const okBiblia = await exists(path.join(dir, "Biblia-da-Obra.md"));
  const okEstrutura = await exists(path.join(dir, "Estrutura-do-Livro.md"));
  const state = await readState(dir);
  const total = Number(state?.total_capitulos_previstos ?? 0);
  if (!okBiblia || !okEstrutura || !(total > 0)) {
    throw new Error(
      `fundação incompleta no disco (biblia=${okBiblia} estrutura=${okEstrutura} total=${total}). rc=${r.code}. ` +
        r.err.slice(-400)
    );
  }

  // Normalizadores determinísticos da fundação (sequência única, idempotente —
  // a MESMA usada por refinar_fundacao e pelo preflight de escrever_livro).
  await aplicarNormalizadoresFundacao(dir, proj.skill_escrita);

  // GATE DA FUNDAÇÃO: presença + parseabilidade + coerência cruzada + craft +
  // voz. Grava Quality State vinculado aos hashes (quality/fundacao.quality.json).
  const gate = await avaliarFundacaoNoDisco(dir, {
    skill: proj.skill_escrita ?? null,
    protagonistaNome: proj.briefing?.protagonista?.nome ?? null,
  });
  for (const w of gate.state.warnings) console.warn(`[fundacao] AVISO: ${w}`);

  // Sync: sobe a fundação (e o Quality State dela) ao Storage
  for (const f of ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md", "ESTADO_LIVRO.json", "briefing.md"]) {
    if (await exists(path.join(dir, f))) {
      await uploadFile("manuscritos", storageKey(job.project_id!, "fundacao", f), path.join(dir, f));
    }
  }
  if (await exists(path.join(dir, FUNDACAO_QUALITY_FILE))) {
    await uploadFile("manuscritos", storageKey(job.project_id!, "fundacao", "fundacao.quality.json"), path.join(dir, FUNDACAO_QUALITY_FILE));
  }

  if (gate.state.status !== "approved") {
    // Artefatos ficam no disco/Storage para refino; o projeto NÃO vira 'fundacao'.
    throw new QualityBlockedError(
      "GATE_FUNDACAO",
      gate.state.blockers.map((b) => b.code),
      "fundação reprovada no gate de qualidade — corrija via refinar_fundacao ou decisão autoral"
    );
  }

  // Edição de origem + status do projeto. Projeto EFÊMERO de auditoria
  // (título AUDIT-*) nunca perde a marcação — o título gerado vira sufixo
  // (a limpeza e as guardas do harness dependem do prefixo).
  let tituloFinal = state?.titulo || proj.titulo;
  if (typeof proj.titulo === "string" && proj.titulo.startsWith("AUDIT-") && !String(tituloFinal).startsWith("AUDIT-")) {
    tituloFinal = `${proj.titulo.split(" — ")[0]} — ${tituloFinal}`;
  }
  await ensureEdition(job.project_id!, proj.idioma_origem || "pt-BR", true, "pendente");
  await must(
    sb
      .from("projects")
      .update({
        status: "fundacao",
        titulo: tituloFinal,
        total_capitulos: total,
        paginas_alvo: state?.paginas_alvo ?? proj.paginas_alvo,
      })
      .eq("owner", OWNER)
      .eq("id", job.project_id!)
  );
  await setProgress(job.id, { fase: "ESTRUTURA", total_capitulos: total, concluido: true });
}

// ===========================================================================
// refinar_fundacao — melhora a fundação EXISTENTE conforme instruções do autor
// (ex.: mais personagens, subtramas, arcos de série), sem reescrever do zero.
// ===========================================================================
async function refinarFundacao(job: Job, hb?: Heartbeat) {
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  if (!(await exists(path.join(dir, "Biblia-da-Obra.md"))))
    throw new Error("não há fundação para refinar — gere a fundação primeiro.");
  const instrucoes = String(job.payload?.instrucoes || "").trim();
  if (!instrucoes) throw new Error("informe as instruções de melhoria.");
  await setProgress(job.id, { fase: "REFINO", etapa: "ajustando fundação" });
  await hb?.({ fase: "REFINO" });

  // Snapshot ANTES do refino: base do diff verificável apresentado ao autor
  // e da invalidação de aprovações dependentes (F-07).
  const hashesAntes = await hashesFundacaoNoDisco(dir);

  const prompt =
    "Modo headless. Trabalhe SOMENTE nesta pasta de projeto. Use a metodologia da skill `arquiteto-de-enredo`.\n" +
    "REFINE a fundação EXISTENTE (não recomece do zero; preserve o que está bom) aplicando as instruções do autor abaixo.\n\n" +
    "INSTRUÇÕES DO AUTOR:\n" + instrucoes + "\n\n" +
    "DIRETRIZES:\n" +
    "- Atualize Biblia-da-Obra.md, Mapa-de-Personagens.md e Estrutura-do-Livro.md de forma COERENTE entre si.\n" +
    "- Se ampliar o elenco: cada personagem novo precisa de FUNÇÃO NARRATIVA distinta e um FIO/subtrama próprio que entrelaça (densidade por entrelaçamento; evite redundância).\n" +
    "- Se for série/trilogia/saga: distribua arcos e subtramas pelos volumes; não resolva tudo neste; deixe ganchos.\n" +
    "- Atualize estado/ (ledger, Mapa de Entrelaçamento) e o ESTADO_LIVRO.json se total_capitulos_previstos mudar. Mantenha a fase ESCRITA.\n" +
    "- NÃO escreva capítulos. NÃO dispare /goal.";
  const r = await runClaude(prompt, dir);

  const okBiblia = await exists(path.join(dir, "Biblia-da-Obra.md"));
  const okEstrutura = await exists(path.join(dir, "Estrutura-do-Livro.md"));
  const state = await readState(dir);
  const total = Number(state?.total_capitulos_previstos ?? proj.total_capitulos ?? 0);
  if (!okBiblia || !okEstrutura) throw new Error(`refino falhou (docs ausentes). rc=${r.code} ${r.err.slice(-300)}`);

  // Re-executa os MESMOS normalizadores da criação: refino não pode perder
  // craft, voz, cota de cadência nem exigências da skill (F-07).
  await aplicarNormalizadoresFundacao(dir, proj.skill_escrita);

  // Diff verificável + invalidação: fundação mudou ⇒ aprovações de capítulo
  // ficam stale e as specs existentes são listadas como afetadas.
  const hashesDepois = await hashesFundacaoNoDisco(dir);
  const alterados = diffFundacao(hashesAntes, hashesDepois);
  let capsInvalidados: string[] = [];
  let specsAfetadas: string[] = [];
  if (alterados.length) {
    capsInvalidados = await invalidarQualityCapitulos(
      dir,
      `refino alterou a fundação (${alterados.join(", ")})`
    );
    if (alterados.includes("Estrutura-do-Livro.md")) specsAfetadas = await specsExistentes(dir);
    await mkdir(path.join(dir, "estado"), { recursive: true });
    await writeFile(
      path.join(dir, "estado", "refino-impacto.json"),
      JSON.stringify(
        {
          em: new Date().toISOString(),
          instrucoes,
          arquivos_alterados: alterados,
          capitulos_invalidados: capsInvalidados,
          specs_afetadas: specsAfetadas,
          acao_necessaria:
            capsInvalidados.length || specsAfetadas.length
              ? "reexecutar gates dos capítulos afetados e revalidar specs contra a Estrutura atual"
              : null,
        },
        null,
        2
      ),
      "utf8"
    );
  }

  // Reavalia o gate da fundação: o Quality State anterior pertence a outros hashes.
  const gate = await avaliarFundacaoNoDisco(dir, {
    skill: proj.skill_escrita ?? null,
    protagonistaNome: proj.briefing?.protagonista?.nome ?? null,
  });
  for (const w of gate.state.warnings) console.warn(`[fundacao] AVISO: ${w}`);

  for (const f of ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md", "ESTADO_LIVRO.json"]) {
    if (await exists(path.join(dir, f))) {
      await uploadFile("manuscritos", storageKey(job.project_id!, "fundacao", f), path.join(dir, f));
    }
  }
  if (await exists(path.join(dir, FUNDACAO_QUALITY_FILE))) {
    await uploadFile("manuscritos", storageKey(job.project_id!, "fundacao", "fundacao.quality.json"), path.join(dir, FUNDACAO_QUALITY_FILE));
  }

  if (gate.state.status !== "approved") {
    throw new QualityBlockedError(
      "GATE_FUNDACAO",
      gate.state.blockers.map((b) => b.code),
      "refino deixou a fundação reprovada no gate — novo refino ou decisão autoral necessários"
    );
  }

  if (total > 0) await must(sb.from("projects").update({ total_capitulos: total }).eq("owner", OWNER).eq("id", job.project_id!));
  await setProgress(job.id, {
    fase: "REFINO",
    concluido: true,
    total_capitulos: total,
    arquivos_alterados: alterados,
    capitulos_invalidados: capsInvalidados.length,
    specs_afetadas: specsAfetadas.length,
  });
}

// ===========================================================================
// criar_volumes — cria os volumes 2..N da SAGA como projetos encadeados,
// herdando a fundação (mundo/elenco/voz) e gerando a Estrutura de cada volume.
// ===========================================================================
async function criarVolumes(job: Job, hb?: Heartbeat) {
  const proj = await getProject(job.project_id!);
  const b = proj.briefing || {};
  const serie = proj.serie || b.serie;
  if (!serie) throw new Error("este projeto não é uma série/saga.");
  const total = Number(b.serie_total || job.payload?.total || 0);
  const volBase = Number(proj.volume || 1);
  if (!(total > volBase)) throw new Error(`nada a criar: total de volumes (${total}) <= volume atual (${volBase}).`);
  const srcDir = projDir(job.project_id!);
  if (!(await exists(path.join(srcDir, "Biblia-da-Obra.md"))))
    throw new Error("gere (e refine) a fundação deste volume antes de criar a saga.");

  // idempotência: pula só volumes COMPLETOS (status 'fundacao'); incompletos são retomados.
  const { data: existentes } = await sb.from("projects").select("id,volume,status").eq("owner", OWNER).eq("serie", serie);
  const porVol = new Map<number, any>((existentes || []).map((x: any) => [x.volume, x]));

  const criados: number[] = [];
  for (let k = volBase + 1; k <= total; k++) {
    const exist = porVol.get(k);
    if (exist && exist.status === "fundacao") continue; // já completo
    await hb?.({ fase: "VOLUMES", volume: k });
    await setProgress(job.id, { fase: "VOLUMES", volume: k, criados });

    const titulo = `${serie} — Vol. ${k}`;
    let novoId: string;
    if (exist) {
      novoId = exist.id; // retoma volume incompleto
    } else {
      const briefingVol = { ...b, volume: k, serie, serie_total: total, _saga: { origem: job.project_id, volume: k }, _herdado: true, _interview: { completo: true } };
      const ins = await must(
        sb.from("projects").insert({
          owner: OWNER, titulo, serie, volume: k, genero: proj.genero, idioma_origem: proj.idioma_origem,
          skill_escrita: proj.skill_escrita, piso_palavras: proj.piso_palavras, meta_nota: proj.meta_nota,
          total_capitulos: proj.total_capitulos, paginas_alvo: proj.paginas_alvo, status: "rascunho", briefing: briefingVol,
        }).select().single()
      );
      novoId = (ins.data as any).id;
    }
    const dstDir = projDir(novoId);
    await mkdir(dstDir, { recursive: true });

    // herda (ou re-herda, se faltar) mundo/elenco/voz/agentes/estado do volume base
    for (const f of ["Biblia-da-Obra.md", "Mapa-de-Personagens.md", "perfil-de-voz.md", "CLAUDE.md"]) {
      if ((await exists(path.join(srcDir, f))) && !(await exists(path.join(dstDir, f)))) await cp(path.join(srcDir, f), path.join(dstDir, f));
    }
    for (const d of [".claude", "estado", "specs"]) {
      if ((await exists(path.join(srcDir, d))) && !(await exists(path.join(dstDir, d)))) await cp(path.join(srcDir, d), path.join(dstDir, d), { recursive: true });
    }
    if (!(await exists(path.join(dstDir, "briefing.md")))) {
      await writeFile(
        path.join(dstDir, "briefing.md"),
        renderBriefing({ ...proj, titulo, volume: k, briefing: { ...b, serie, serie_total: total } }) +
          `\n\n## SAGA\nVolume ${k} de ${total} da série "${serie}". Mundo, elenco e voz são HERDADOS do vol. 1 (ver Biblia/Mapa nesta pasta). ` +
          "Avance os arcos e subtramas plantados; novo conflito central deste volume; deixe ganchos para o próximo.\n",
        "utf8"
      );
    }

    // gera SOMENTE a Estrutura deste volume (com 1 retry), sem recriar a fundação herdada
    const prompt =
      "Modo headless. Trabalhe SOMENTE nesta pasta. Use a metodologia da skill `arquiteto-de-enredo`.\n" +
      "A FUNDAÇÃO HERDADA já existe nesta pasta (Biblia-da-Obra.md, Mapa-de-Personagens.md, perfil-de-voz.md, agentes em .claude/agents/, estado/) — NÃO a recrie nem sobrescreva o mundo/elenco.\n" +
      `Gere a Estrutura-do-Livro.md DESTE volume (vol ${k} de ${total} da série "${serie}"): novo conflito central do volume, avançando os arcos/subtramas plantados (use o Mapa de Entrelaçamento), com ganchos para o próximo volume.\n` +
      `Grave/atualize ESTADO_LIVRO.json com titulo="${titulo}", total_capitulos_previstos (nº de capítulos da nova Estrutura), skill_escrita, fase_atual='ESCRITA', gerar_epub=true, meta_nota, piso_palavras_cap.\n` +
      "NÃO escreva capítulos. NÃO dispare /goal.";
    let okE = await exists(path.join(dstDir, "Estrutura-do-Livro.md"));
    let ultimo: any = null;
    for (let tentativa = 0; tentativa < 2 && !okE; tentativa++) {
      ultimo = await runClaude(prompt, dstDir);
      okE = await exists(path.join(dstDir, "Estrutura-do-Livro.md"));
    }
    const state = await readState(dstDir);
    const tot = Number(state?.total_capitulos_previstos ?? proj.total_capitulos ?? 0);

    for (const f of ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md", "ESTADO_LIVRO.json", "briefing.md"]) {
      if (await exists(path.join(dstDir, f))) await uploadFile("manuscritos", storageKey(novoId, "fundacao", f), path.join(dstDir, f));
    }
    await ensureEdition(novoId, proj.idioma_origem || "pt-BR", true, "pendente");
    await must(sb.from("projects").update({ status: okE ? "fundacao" : "rascunho", total_capitulos: tot || proj.total_capitulos }).eq("owner", OWNER).eq("id", novoId));
    // falha-alto: não esconder que a IA não gerou a estrutura (ex.: saldo Claude esgotado)
    if (!okE) {
      const err = String(ultimo?.err || ultimo?.out || "");
      const semSaldo = /credit balance is too low/i.test(err);
      throw new Error(
        `vol ${k}: Estrutura-do-Livro.md não gerada (rc=${ultimo?.code}).` +
          (semSaldo ? " Saldo da conta Claude esgotado — recarregue os créditos e rode 'Criar volumes' de novo." : ` ${err.slice(-300)}`)
      );
    }
    criados.push(k);
  }
  await setProgress(job.id, { fase: "VOLUMES", concluido: true, criados });
}

// ===========================================================================
// escrever_livro — livro_runner.py (opus) até CONCLUIDO; verdade do disco
// ===========================================================================
// Re-enfileira escrever_livro de um projeto SEM duplicar: se já existe um job
// queued aberto desse projeto, não cria outro (mata os "2× Na fila").
async function enfileirarEscritaSeNovo(projectId: string): Promise<void> {
  const { data } = await sb.from("jobs").select("id").eq("owner", OWNER)
    .eq("project_id", projectId).eq("tipo", "escrever_livro").eq("status", "queued").limit(1);
  if ((data?.length ?? 0) > 0) return;
  await must(sb.from("jobs").insert({ owner: OWNER, tipo: "escrever_livro", project_id: projectId, status: "queued" }));
}

// Upsert de capítulo resiliente: um erro de rede transitório ("fetch failed") não
// pode abortar a sincronização dos demais capítulos. Tenta 3×, depois loga e segue.
async function upsertCapResiliente(row: Record<string, unknown>): Promise<void> {
  for (let i = 1; i <= 3; i++) {
    try {
      const { error } = await sb.from("chapters").upsert(row, { onConflict: "edition_id,numero" });
      if (!error) return;
      if (i === 3) return void console.error(`[chapters] upsert falhou após 3 tentativas: ${error.message}`);
    } catch (e: any) {
      if (i === 3) return void console.error(`[chapters] upsert exceção após 3 tentativas: ${String(e?.message ?? e)}`);
    }
    await new Promise((res) => setTimeout(res, 800 * i));
  }
}

// Persistência incremental (contrato de progresso S3/1.2): sincroniza ao
// Storage + banco SÓ os capítulos APROVADOS (hash-bound, via resolveChapterState),
// de forma idempotente — pula os já duráveis com o mesmo hash. Torna o aprovado
// durável ANTES de o próximo bloquear: a reprovação do N+1 nunca oculta o N
// aprovado (corrige a perda do caso 36/37/38). Só aprovados vão ao leitor.
async function sincronizarAprovados(projectId: string, dir: string, editionId: string, piso: number): Promise<number[]> {
  const caps = await chaptersOnDisk(path.join(dir, "manuscrito"), piso);
  const { data: rows } = await sb.from("chapters").select("numero,text_sha256").eq("owner", OWNER).eq("edition_id", editionId);
  const dbHash = new Map<number, string | null>((rows ?? []).map((r: any) => [Number(r.numero), (r.text_sha256 ?? null) as string | null]));
  const sincronizados: number[] = [];
  for (const c of caps) {
    const nn = String(c.numero).padStart(2, "0");
    let quality: QualityState | null = null;
    try { quality = JSON.parse(await readFile(path.join(dir, "quality", `capitulo-${nn}.json`), "utf8")) as QualityState; } catch { quality = null; }
    const diskText = await readText(c.file);
    const st = resolveChapterState({
      numero: c.numero, piso, diskExists: true, diskText, qualityState: quality,
      dbRow: dbHash.has(c.numero) ? { text_sha256: dbHash.get(c.numero) ?? null } : null,
    });
    if (!deveSincronizar(st, dbHash.get(c.numero) ?? null)) continue; // só aprovados hash-bound ainda não duráveis
    // Sanitiza antes de subir; se a limpeza alterar o texto, a aprovação não vale
    // para o novo conteúdo → não sincroniza mismatch (o gate final de compilação trata).
    await sanitizarArquivoCap(c.file, "sync-aprovado");
    const txt = await readText(c.file);
    const hash = hashText(txt);
    if (hash !== st.hashDisco) { console.warn(`[sync-aprovado] cap ${nn}: sanitização alterou o texto aprovado — adiado`); continue; }
    const key = storageKey(projectId, "origem", `capitulo-${nn}.md`);
    await uploadFile("manuscritos", key, c.file); // Storage PRIMEIRO (compensação: banco só aponta p/ objeto existente)
    const titulo = txt.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim() ?? null;
    await upsertCapResiliente({
      owner: OWNER, edition_id: editionId, numero: c.numero, titulo, palavras: countWords(txt), storage_path: key,
      text_sha256: hash, quality_status: quality?.status ?? "approved", quality_stage: quality?.stage ?? null, approved_at: new Date().toISOString(),
    }); // banco DEPOIS
    sincronizados.push(c.numero);
  }
  return sincronizados;
}

async function escreverLivro(job: Job, hb?: Heartbeat) {
  if (!RUNNER_PATH) throw new Error("RUNNER_PATH não configurado no worker/.env");
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  // Livro importado: hidrata o WORK_DIR do Storage (capítulos + fundação se houver + ESTADO).
  await hidratarSeNecessario(job.project_id);
  if (!(await exists(path.join(dir, "ESTADO_LIVRO.json"))))
    throw new Error("fundação ausente — rode criar_fundacao antes de escrever_livro");
  // Refinar/escrever exige a fundação ATELIER (agentes livro-* que o runner delega). Um
  // livro importado SEM essa fundação não pode ser refinado — erro CLARO e acionável
  // (não run cru): avalie/publique, ou reconstrua a fundação a partir do manuscrito.
  if (!(await temFundacaoAtelier(dir))) {
    throw new Error(
      "Livro importado sem fundação do Atelier (agentes/Bíblia ausentes) — não dá para refinar. " +
        "Use Avaliar/Publicar, ou reconstrua a fundação a partir do manuscrito para habilitar o refino."
    );
  }

  // Preflight: skill de escrita precisa existir — falha alto, sem fallback silencioso.
  assertSkillInstalada(proj.skill_escrita);
  // Normalizadores determinísticos (sequência única, idempotente): corrige projetos
  // vivos — do próximo capítulo em diante o escritor escreve com o DNA da skill.
  await aplicarNormalizadoresFundacao(dir, proj.skill_escrita);
  // Pré-passe: limpa meta-texto já no disco antes do runner remontar manuscrito/EPUB.
  await sanitizarPastaCapitulos(path.join(dir, "manuscrito"));

  const piso = Number(proj.piso_palavras ?? 1400);

  // GATE DA FUNDAÇÃO no preflight: escrever NÃO começa só porque o status é
  // 'fundacao'. Início de escrita (0 capítulos no piso) exige gate aprovado.
  // Retomada de livro em andamento não é brickada: o estado é gravado e o
  // aviso fica alto — a publicação continua protegida pelo gate final.
  // SG7: a pendência de fundação é PERSISTIDA no progresso (fundacao_status),
  // separada do bloqueio editorial do capítulo — a UI mostra as duas sem misturar.
  let fundacaoInfo: Record<string, unknown> = {};
  {
    const gate = await avaliarFundacaoNoDisco(dir, {
      skill: proj.skill_escrita ?? null,
      protagonistaNome: proj.briefing?.protagonista?.nome ?? null,
    });
    if (gate.state.status !== "approved") {
      const codes = gate.state.blockers.map((b) => b.code);
      const capsExistentes = (await chaptersOnDisk(path.join(dir, "manuscrito"), piso)).length;
      if (capsExistentes === 0) {
        throw new QualityBlockedError(
          "GATE_FUNDACAO",
          codes,
          "escrita não inicia com fundação reprovada — corrija a fundação (refinar_fundacao) ou registre decisão autoral"
        );
      }
      fundacaoInfo = { fundacao_status: "reprovada", fundacao_blockers: codes };
      console.warn(
        `[fundacao] AVISO: retomada com fundação reprovada no gate (${codes.join(", ")}) — ` +
          `livro em andamento (${capsExistentes} caps) continua; resolver antes de publicar`
      );
    }
  }
  // Espelho do ledger de correção automática (SG3/SG6): a UI acompanha degrau/
  // tentativa/retry sem carregar o ledger; atualizado após o run pelo fechamento.
  let correcaoResumo = await resumoCorrecaoDoDisco(dir, job.project_id!).catch(() => null);
  const meta = Number(proj.meta_nota ?? 9.0);
  // Teto de reescritas por execução do runner. Mais passadas perseguem melhor a
  // meta; com a auto-retomada do Max, não custam tempo. Configurável por projeto
  // (payload.max_reescritas) ou env (MAX_REESCRITAS), default 6.
  const maxReescritas = Math.max(1, Math.min(12, Number(job.payload?.max_reescritas ?? process.env.MAX_REESCRITAS ?? 6)));
  await sb.from("projects").update({ status: "escrevendo" }).eq("owner", OWNER).eq("id", job.project_id!);
  // baseline para detectar progresso (escrita longa é retomável do disco)
  const capsAntes = (await chaptersOnDisk(path.join(dir, "manuscrito"), piso)).length;
  // Revisão do micro-loop TAMBÉM é progresso (grava review/_revcap-NN.done), mas não
  // cria capítulo novo. Sem contar isto, um run que só revisou cai no branch "não
  // avançou" e o worker pausa ~15min achando que é limite do Max (falso: a conta não
  // está throttada). Contar os marcadores fecha o descasamento worker↔runner.
  const contarRevMarkers = async () =>
    (await readdir(path.join(dir, "review")).catch(() => []))
      .filter((f) => /^_revcap-\d+\.done$/.test(f)).length;
  const revAntes = await contarRevMarkers();
  // Neutralidade de engine (S10/1.7): registra quem executa. Alinhado aos campos de
  // engine_calls (provedor/modelo). A engine atual é o Claude Code; o escritor (papel
  // que produz a prosa) roda no modelo pesado (MODEL). Quando a engine hospedada
  // entrar, estes campos virão de engine_calls/engine_chapter_provenance.
  const engineInfo = { engine: "claude-code", provedor: "anthropic", modelo: MODEL };
  // Grava a contagem REAL do disco JÁ no início (antes do poller de 20s). Run curto
  // que aborta em ~13s não pode mais reportar "0/N" com capítulos no disco.
  await setProgress(job.id, {
    ...engineInfo,
    ...fundacaoInfo,
    correcao: correcaoResumo,
    fase: "ESCRITA", cap_atual: capsAntes,
    total: Number(proj.total_capitulos ?? 0), continua: true,
  });

  // Edição de origem criada JÁ (antes do poller): a persistência incremental dos
  // aprovados precisa dela durante o run e antes de qualquer bloqueio (S3/1.2).
  const edicao = await ensureEdition(job.project_id!, proj.idioma_origem || "pt-BR", true, "escrevendo");

  // Poller de progresso (verdade do disco) enquanto o runner roda. Além dos
  // contadores, torna DURÁVEL cada capítulo aprovado em ~20s (sync incremental).
  let sincronizando = false;
  const poll = setInterval(async () => {
    const st = await readState(dir);
    const caps = await chaptersOnDisk(path.join(dir, "manuscrito"), piso);
    await setProgress(job.id, {
      ...engineInfo,
      ...fundacaoInfo,
      correcao: correcaoResumo,
      fase: st?.fase_atual ?? "ESCRITA",
      cap_atual: caps.length,
      total: Number(st?.total_capitulos_previstos ?? proj.total_capitulos ?? 0),
      nota: st?.ultima_nota ?? null,
      palavras: st?.palavras_totais ?? 0,
    });
    // Sync incremental dos aprovados (idempotente; guarda contra ticks sobrepostos).
    if (!sincronizando) {
      sincronizando = true;
      try { await sincronizarAprovados(job.project_id!, dir, edicao.id, piso); }
      catch (e: any) { console.warn(`[sync-incremental] ${String(e?.message ?? e).slice(0, 200)}`); }
      finally { sincronizando = false; }
    }
    await hb?.({ fase: st?.fase_atual, caps: caps.length });
  }, 20_000);

  const args = [
    RUNNER_PATH,
    "--projeto", dir,
    "--briefing", path.join(dir, "briefing.md"),
    "--epub",
    "--meta", String(meta),
    "--max-reescritas", String(maxReescritas),
    "--piso", String(piso),
    // Orquestrador (roteia/delega): sonnet por padrão. Subagente escritor segue opus
    // pelo frontmatter; fases inline pesadas (ESTRUTURA/REVIEW/REESCRITA) sobem para --model-pesado.
    "--model", MODEL_ORQUESTRADOR,
    "--model-pesado", MODEL,
    "--claude-bin", CLAUDE_BIN,
    "--permission-mode", CLAUDE_PERMISSION_MODE,
  ];
  // Micro-loop escritor→revisor→editor por capítulo é o PADRÃO (camada central de
  // qualidade). Escape hatch para baratear: env REVISAO_POR_CAPITULO=0 ou
  // payload.sem_revisao_por_capitulo → desliga.
  if (process.env.REVISAO_POR_CAPITULO === "0" || job.payload?.sem_revisao_por_capitulo) {
    args.push("--sem-revisao-por-capitulo");
    // Redução de qualidade REGISTRADA (não silenciosa): rótulo no progresso do
    // job + log alto. A publicação segue protegida pelo DESMANEIRISMO book-wide
    // e pelo gate final (aprovações por hash continuam obrigatórias).
    console.warn(
      "[qualidade] REDUÇÃO ATIVA: micro-loop revisor/editor por capítulo DESLIGADO " +
        `(${job.payload?.sem_revisao_por_capitulo ? "payload do job" : "env REVISAO_POR_CAPITULO=0"}).`
    );
    await setProgress(job.id, { reducao_qualidade: "sem_revisao_por_capitulo", continua: true });
  }
  // Opcional (default off, custo Max): eleva o veredito de propulsão do revisor a opus.
  if (process.env.REVISOR_CRAFT_OPUS === "1" || job.payload?.revisor_craft_opus) {
    args.push("--revisor-craft-opus");
  }
  let r;
  try {
    r = await run(PY_BIN, args, { cwd: dir });
  } finally {
    clearInterval(poll);
  }
  // Diagnóstico SEMPRE visível: rc + tail do stderr em TODO retorno do runner,
  // inclusive nos caminhos de limite/interrupção (que antes descartavam a causa —
  // a "morte silenciosa" ficava invisível no worker.log).
  const errTail = (r.err || "").trim().slice(-400);
  console.log(
    `[job ${job.id}] runner rc=${r.code}${errTail ? ` err_tail=${JSON.stringify(errTail)}` : ""}`
  );

  // Telemetria (tokens/tempo por agente + throughput) — verdade do disco, best-effort.
  await gravarTelemetriaProjeto(job.project_id!);

  // Verdade do disco
  const state = await readState(dir);
  // PERSISTÊNCIA INCREMENTAL (S3/1.2): torna DURÁVEL todo capítulo aprovado ANTES
  // de propagar qualquer bloqueio/interrupção. A reprovação do N+1 (ex.: cap-38)
  // nunca impede a persistência do N aprovado (cap-37). Fix do Bug A (jobs.ts:959
  // lançava ANTES do sync — o aprovado só ficava no disco e podia se perder).
  await sincronizarAprovados(job.project_id!, dir, edicao.id, piso);
  // Fecha no ledger de correção as tentativas cujo capítulo o gate APROVOU neste
  // run (ciclo correção→reavaliação→aprovação auditável, SG3) — ANTES de propagar
  // qualquer novo bloqueio, para a pendência antiga não contaminar a decisão.
  try {
    correcaoResumo = await concluirCorrecoesAprovadas(dir, job.project_id!);
  } catch (e: any) {
    console.warn(`[correcao-ledger] fechamento pós-run falhou: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  if ((state as any)?.quality_status === "blocked_quality") {
    throw new QualityBlockedError(
      String((state as any)?.quality_stage ?? "runner"),
      Array.isArray((state as any)?.quality_blockers) ? (state as any).quality_blockers.map(String) : [],
      String((state as any)?.quality_reason ?? "Runner bloqueou a progressão por pós-condição de qualidade reprovada.")
    );
  }
  const total = Number(state?.total_capitulos_previstos ?? proj.total_capitulos ?? 0);
  const caps = await chaptersOnDisk(path.join(dir, "manuscrito"), piso);
  const revDepois = await contarRevMarkers();
  const completo = total > 0 && caps.length >= total;
  const runnerOutcome = classifyRunnerOutcome(r);
  if (runnerOutcome.kind !== "ok") {
    throw new InfrastructureRetryError(`runner-${runnerOutcome.kind}`, runnerOutcome.message);
  }

  // Status da edição (idempotente; nunca rebaixa). A edição já foi criada antes do
  // poller e os aprovados já foram sincronizados incrementalmente acima.
  await ensureEdition(job.project_id!, proj.idioma_origem || "pt-BR", true, completo ? "revisao" : "escrevendo");
  // Sanitiza TODOS os caps do disco (proteção antivazamento do EPUB que o runner
  // remontou) → sinaliza EPUB suspeito. NÃO sobe capítulo aqui: só os APROVADOS
  // vão ao leitor (S2: disco ≥ piso ≠ aprovado), via sincronizarAprovados.
  let sujeiraAposRunner = false; // texto sujo gerado NESTE run → EPUB suspeito
  for (const c of caps) {
    if (await sanitizarArquivoCap(c.file, "escrita")) sujeiraAposRunner = true;
  }
  await sincronizarAprovados(job.project_id!, dir, edicao.id, piso);
  // Reporta a contagem REAL do disco APÓS o run, antes de qualquer branch/throw —
  // assim a UI nunca fica em "0/N" mesmo num run curto que pausa/erra.
  await setProgress(job.id, {
    ...fundacaoInfo,
    correcao: correcaoResumo,
    fase: state?.fase_atual ?? "ESCRITA", cap_atual: caps.length, total,
    nota: state?.ultima_nota ?? null, palavras: state?.palavras_totais ?? 0,
    continua: !completo,
  });

  // Incompleto: escrita longa é retomável (verdade do disco). Se ESTA execução avançou,
  // re-enfileira para continuar (interrupção/limite de sessão não mata o livro). Só falha
  // de verdade se não escreveu NENHUM capítulo novo (travamento real).
  if (!completo) {
    // LIMITE DO MAX por QUALQUER de 3 fontes (defesa em profundidade — não confiar
    // só no tail volátil do CLI): (a) saída deste run, (b) marca limpa do runner
    // (RUNNER_LIMITE_MAX / estado.aguardando_reset), (c) tail do runner.log.
    const saidaRun = `${r.out}\n${r.err}`.slice(-3000);
    const marca = /RUNNER_LIMITE_MAX\s+reset=(\S+)/.exec(r.out || "");
    const logTail = (await readText(path.join(dir, "runner.log"))).slice(-2000);
    const backoff = () => new Date(Date.now() + 35 * 60_000).toISOString();
    let retryAt: string | null = limiteMaxRetryAt(saidaRun);
    if (!retryAt && (marca || (state as any)?.aguardando_reset)) {
      const hint = marca?.[1] || (state as any)?.reset_at || "";
      retryAt = limiteMaxRetryAt("usage limit reached. resets at " + hint) ?? backoff();
    }
    if (!retryAt && pareceLimiteMax(logTail)) retryAt = limiteMaxRetryAt(logTail) ?? backoff();
    if (retryAt) {
      const hh = new Date(retryAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      throw new LimiteMaxError(
        `Limite de uso do plano Max atingido. Escrita em ${caps.length}/${total} capítulos; ` +
          `retoma automaticamente ~${hh} (do disco).`,
        retryAt
      );
    }
    // Avançou (capítulo NOVO ou REVISÃO do micro-loop): re-enfileira (com dedupe) e
    // segue NA HORA, sem a pausa de ~15min. O branch de limite REAL do Max (acima,
    // via RUNNER_LIMITE_MAX / aguardando_reset / "resets at") segue intacto.
    if (caps.length > capsAntes || revDepois > revAntes) {
      await enfileirarEscritaSeNovo(job.project_id!);
      await setProgress(job.id, { ...fundacaoInfo, correcao: correcaoResumo, fase: "ESCRITA", cap_atual: caps.length, total, continua: true });
      return;
    }
    // NÃO avançou, mas o livro está ÍNTEGRO e incompleto (caps>0): o run foi
    // INTERROMPIDO sem completar o passo (morte intermitente), NÃO travamento e NÃO
    // limite do Max. Como o runner é RETOMÁVEL do disco, re-tenta rápido (~2min) SEM
    // queimar tentativa e com rótulo HONESTO (não mentir "limite do Max" — o bloco de
    // limite REAL, acima, é o único que reporta throttle). Um limite genuíno já teria
    // sido pego antes (retry_at parseado); aqui é só interrupção.
    if (caps.length > 0) {
      throw new InfrastructureRetryError(
        "runner",
        `Run interrompido sem progresso em ${caps.length}/${total} (livro íntegro); ` +
          `retomável do disco, sujeito à política de circuit breaker.`
      );
    }
    const log = logTail.slice(-300);
    throw new Error(`escrita não avançou em ${caps.length}/${total} (rc=${r.code}). ${(r.err || r.out || log).slice(-300)}`);
  }

  // Manuscrito-mestre — sanitiza (o runner pode tê-lo montado de capítulos sujos)
  // e passa pelo gate de compilação antes de publicar.
  const mestre = path.join(dir, "manuscrito", "MANUSCRITO-MESTRE.md");
  if (await exists(mestre)) {
    if (await sanitizarArquivoCap(mestre, "manuscrito-mestre")) sujeiraAposRunner = true;
  }
  await gateManuscrito(path.join(dir, "manuscrito"));

  // Se houve meta-texto NESTE run, o EPUB construído pelo runner é suspeito:
  // NÃO publica manuscrito/EPUB; re-enfileira para remontar do texto já limpo.
  if (sujeiraAposRunner) {
    await enfileirarEscritaSeNovo(job.project_id!);
    await setProgress(job.id, { ...fundacaoInfo, correcao: correcaoResumo, fase: "ESCRITA", cap_atual: caps.length, total, sanitizado: true, continua: true });
    console.log("[sanitize] meta-texto removido neste run; EPUB não publicado, re-enfileirado para rebuild limpo.");
    return;
  }

  // Gate único de promoção: aprovação pertence aos hashes dos arquivos atuais.
  const qualityStates = new Map<number, QualityState | null>();
  for (const c of caps) {
    const qPath = path.join(dir, "quality", `capitulo-${String(c.numero).padStart(2, "0")}.json`);
    try { qualityStates.set(c.numero, JSON.parse(await readFile(qPath, "utf8")) as QualityState); }
    catch { qualityStates.set(c.numero, null); }
  }
  const mestreText = await readText(mestre);
  const epubRel = state?.epub_caminho;
  const epubPath = epubRel ? path.join(dir, epubRel) : "";
  // EPUB↔mestre por hash (A17): mestre alterado após a construção ⇒ EPUB_STALE.
  let epubCoerenteComMestre = false;
  if (epubPath && (await exists(epubPath))) {
    const epubSha = createHash("sha256").update(await readFile(epubPath)).digest("hex");
    const fontePath = path.join(dir, "quality", "epub-fonte.json");
    let registro = null;
    try { registro = JSON.parse(await readFile(fontePath, "utf8")); } catch { /* primeiro registro */ }
    const v = verificarEpubFonte(registro, hashText(mestreText), epubSha);
    if (v.novoRegistro) {
      await mkdir(path.join(dir, "quality"), { recursive: true });
      await writeFile(fontePath, JSON.stringify(v.novoRegistro, null, 2) + "\n", "utf8");
    }
    epubCoerenteComMestre = v.coerente;
    if (!v.coerente) console.warn(`[epub] ${v.motivo}`);
  }
  const decision = decidePublication({
    chaptersExpected: total,
    chapters: await Promise.all(caps.map(async (c) => ({ numero: c.numero, text: await readText(c.file), quality: qualityStates.get(c.numero) ?? null }))),
    manuscriptText: mestreText,
    manuscriptMatchesChapters: (await Promise.all(caps.map(async (c) => mestreText.includes((await readText(c.file)).trim())))).every(Boolean),
    epubPresent: Boolean(epubPath && await exists(epubPath)),
    epubMatchesManifest: Boolean(state?.epub_gerado) && epubCoerenteComMestre,
    metaTextFree: true,
    continuityValid: [...qualityStates.values()].every((q) => q?.status === "approved" || q?.status === "approved_with_exception"),
    skillManifestValid: true, // o processo só inicia após preflight de hashes em index.ts
  });
  if (decision.decision !== "approved") {
    throw new QualityBlockedError("PUBLICATION_GATE", decision.blockers.map((b) => `${b.code}: ${b.message}`), "Gate final de publicação reprovado.");
  }

  const publicationFiles: PublicationFile[] = [];
  for (const c of caps) {
    const txt = await readText(c.file);
    publicationFiles.push({
      kind: "chapter", bucket: "manuscritos", localPath: c.file,
      filename: `capitulo-${String(c.numero).padStart(2, "0")}.md`, numero: c.numero,
      titulo: txt.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim() ?? null,
      palavras: countWords(txt),
    });
  }
  publicationFiles.push({ kind: "manuscript", bucket: "manuscritos", localPath: mestre, filename: "MANUSCRITO-MESTRE.md" });
  publicationFiles.push({ kind: "epub", bucket: "epubs", localPath: epubPath, filename: path.basename(epubPath) });
  await executePublicationTransaction({ owner: OWNER, projectId: job.project_id!, editionId: edicao.id, files: publicationFiles }, {
    read: (p) => readFile(p),
    upload: (bucket, key, localPath) => uploadFile(bucket, key, localPath),
    writeManifest: async (manifest) => {
      await mkdir(path.join(dir, "quality"), { recursive: true });
      await writeFile(path.join(dir, "quality", "publication-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    },
    promote: async ({ owner, projectId, editionId, manifest, chapters, artifacts }) => {
      const { error } = await sb.rpc("promote_publication", {
        p_owner: owner, p_project_id: projectId, p_edition_id: editionId,
        p_manifest: manifest, p_chapters: chapters, p_artifacts: artifacts,
      });
      if (error) throw new InfrastructureRetryError("supabase-promote-publication", `Promoção transacional falhou: ${error.message}`);
    },
  });

  const nota = state?.ultima_nota != null ? Number(state.ultima_nota) : null;
  // nota_review = AVALIAÇÃO independente (jobs avaliar/revisar). A auto-nota da
  // escrita (state.ultima_nota) NÃO sobrescreve a nota oficial — fica só no
  // progresso do job, rotulada como provisória na UI.
  // statuses foram promovidos na mesma transação dos capítulos/artefatos.
  await setProgress(job.id, { fase: "CONCLUIDO", cap_atual: caps.length, total, nota, palavras: state?.palavras_totais ?? 0 });
}

// ===========================================================================
// gerar_epub — DETERMINÍSTICO via edicao-kindle/scripts/build_epub.py
// ===========================================================================
async function gerarEpub(job: Job) {
  const edicao = await getEdition(job.edition_id!);
  await hidratarSeNecessario(edicao.project_id); // livro importado: WORK_DIR do Storage
  const proj = await getProject(edicao.project_id);
  const dir = projDir(edicao.project_id);
  const sub = edicao.is_origem ? path.join(dir, "manuscrito") : path.join(dir, "traducoes", edicao.idioma);
  const manuscrito = path.join(sub, "MANUSCRITO-MESTRE.md");
  if (!(await exists(manuscrito))) throw new Error("MANUSCRITO-MESTRE.md ausente para a edição " + edicao.idioma);

  // CAPA OBRIGATÓRIA: o EPUB sai sempre com a capa aprovada do idioma.
  const capaPng = path.join(dir, "capas", `${edicao.idioma}.png`);
  if (!(await exists(capaPng)))
    throw new Error(`Gere e aprove a capa do idioma ${edicao.idioma} antes (o EPUB exige a capa aprovada).`);

  // Título/subtítulo do idioma (usa o texto traduzido da capa, se houver)
  let titulo = proj.titulo;
  let subtitulo = proj.briefing?.subtitulo || "";
  const textos = await readText(path.join(dir, "capas", "textos.json"));
  if (textos) {
    try {
      const t = JSON.parse(textos)[edicao.idioma];
      if (t?.titulo) titulo = t.titulo;
      if (t?.subtitulo) subtitulo = t.subtitulo;
    } catch {}
  }

  // versão sequencial por edição (mantém histórico de versões)
  const { count } = await sb
    .from("artifacts")
    .select("id", { count: "exact", head: true })
    .eq("owner", OWNER)
    .eq("edition_id", edicao.id)
    .eq("tipo", "epub");
  const versao = (count ?? 0) + 1;

  // config.json (sem comentários)
  const langShort = (edicao.idioma || "pt-BR").split("-")[0];
  const config = {
    title: titulo,
    subtitle: subtitulo,
    authors: [proj.briefing?.autor || "Atelier de Livros IA"],
    language: edicao.idioma || "pt-BR",
    publisher: "",
    year: new Date().getFullYear(),
    isbn: "",
    rights: `© ${new Date().getFullYear()} ${proj.briefing?.autor || ""}. Todos os direitos reservados.`,
    description: "",
    uuid: "",
    chapter_level: 1,
    number_chapters: true,
    chapter_label: (({ pt: "Capítulo", en: "Chapter", es: "Capítulo", it: "Capitolo", de: "Kapitel", fr: "Chapitre" } as Record<string, string>)[langShort]) || "",
    front_matter_titles: [],
    back_matter_titles: [],
    dedication: "",
    epigraph: "",
    body_font: "georgia",
    embed_font: "",
  };
  await mkdir(path.join(dir, "epub"), { recursive: true });
  const cfgPath = path.join(dir, "epub", `config-${edicao.idioma}-v${versao}.json`);
  await writeFile(cfgPath, JSON.stringify(config, null, 2), "utf8");
  const out = path.join(dir, "epub", `${proj.titulo || "livro"}-${edicao.idioma}-v${versao}.epub`);

  // capa SEMPRE embutida (obrigatória)
  const args = [edicaoKindleScript("build_epub.py"), "--manuscript", manuscrito, "--config", cfgPath, "--output", out, "--cover", capaPng];
  const r = await run(PY_BIN, args, { cwd: dir });
  if (!(await exists(out))) throw new Error(`build_epub falhou (rc=${r.code}): ${(r.err || r.out).slice(-400)}`);

  // Validação (não bloqueante se epubcheck ausente)
  const v = await run(PY_BIN, [edicaoKindleScript("validate_epub.py"), out], { cwd: dir });

  const caps = await chaptersOnDisk(sub, 1);
  const editionQualityDir = path.join(dir, "quality", edicao.id);
  const legacyQualityDir = path.join(dir, "quality");
  const qualityStates = new Map<number, QualityState | null>();
  for (const c of caps) {
    const name = `capitulo-${String(c.numero).padStart(2, "0")}.json`;
    let q: QualityState | null = null;
    for (const qPath of [path.join(editionQualityDir, name), path.join(legacyQualityDir, name)]) {
      try { q = JSON.parse(await readFile(qPath, "utf8")) as QualityState; break; } catch {}
    }
    qualityStates.set(c.numero, q);
  }
  const mestreText = await readText(manuscrito);
  const decision = decidePublication({
    chaptersExpected: Number(proj.total_capitulos ?? caps.length),
    chapters: await Promise.all(caps.map(async (c) => ({ numero: c.numero, text: await readText(c.file), quality: qualityStates.get(c.numero) ?? null }))),
    manuscriptText: mestreText,
    manuscriptMatchesChapters: (await Promise.all(caps.map(async (c) => mestreText.includes((await readText(c.file)).trim())))).every(Boolean),
    epubPresent: true, epubMatchesManifest: true, metaTextFree: true,
    continuityValid: [...qualityStates.values()].every((q) => q?.status === "approved" || q?.status === "approved_with_exception"),
    skillManifestValid: true,
  });
  if (decision.decision !== "approved") throw new QualityBlockedError("EPUB_PUBLICATION_GATE", decision.blockers.map((b) => `${b.code}: ${b.message}`));
  const publicationFiles: PublicationFile[] = await Promise.all(caps.map(async (c) => {
    const txt = await readText(c.file);
    return { kind: "chapter" as const, bucket: "manuscritos" as const, localPath: c.file, filename: `capitulo-${String(c.numero).padStart(2, "0")}.md`, numero: c.numero, titulo: txt.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim() ?? null, palavras: countWords(txt) };
  }));
  publicationFiles.push({ kind: "manuscript", bucket: "manuscritos", localPath: manuscrito, filename: "MANUSCRITO-MESTRE.md" });
  publicationFiles.push({ kind: "epub", bucket: "epubs", localPath: out, filename: path.basename(out) });
  await executePublicationTransaction({ owner: OWNER, projectId: edicao.project_id, editionId: edicao.id, files: publicationFiles }, {
    read: (p) => readFile(p), upload: (bucket, key, localPath) => uploadFile(bucket, key, localPath),
    writeManifest: async (manifest) => { await mkdir(editionQualityDir, { recursive: true }); await writeFile(path.join(editionQualityDir, "publication-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8"); },
    promote: async ({ owner, projectId, editionId, manifest, chapters, artifacts }) => {
      const { error } = await sb.rpc("promote_publication", { p_owner: owner, p_project_id: projectId, p_edition_id: editionId, p_manifest: manifest, p_chapters: chapters, p_artifacts: artifacts });
      if (error) throw new InfrastructureRetryError("supabase-promote-publication", `Promoção transacional falhou: ${error.message}`);
    },
  });
  await setProgress(job.id, { fase: "EPUB", concluido: true, versao, validado: v.code === 0 });
}

// Lança LimiteMaxError se a saída do `claude` indicar throttle do plano Max
// (não é erro: o loop do worker pausa e retoma sozinho no reset, do disco).
function lancarSeLimiteMax(saidaClaude: string, contexto: string): void {
  const retryAt = limiteMaxRetryAt(saidaClaude);
  if (retryAt) {
    const hh = new Date(retryAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    throw new LimiteMaxError(`Limite de uso do plano Max atingido — ${contexto}. Retoma automaticamente ~${hh}.`, retryAt);
  }
}

// ===========================================================================
// traduzir — skill traducao-editorial (PT-BR -> idiomas-meta)
// ===========================================================================
async function traduzir(job: Job, hb?: Heartbeat) {
  await hidratarSeNecessario(job.project_id); // livro importado: WORK_DIR do Storage
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  const idiomas: string[] = job.payload?.idiomas ?? [];
  if (!idiomas.length) throw new Error("nenhum idioma informado em payload.idiomas");
  const piso = Number(proj.piso_palavras ?? 1400);
  const origemCaps = await chaptersOnDisk(path.join(dir, "manuscrito"), 1);
  if (!origemCaps.length) throw new Error("manuscrito de origem ausente — escreva o livro antes de traduzir");

  for (const idioma of idiomas) {
    if (idioma === (proj.idioma_origem || "pt-BR")) continue;
    await setProgress(job.id, { fase: "TRADUCAO", idioma });
    await hb?.({ fase: "TRADUCAO", idioma });
    const destino = path.join(dir, "traducoes", idioma);
    await mkdir(destino, { recursive: true });
    const ed = await ensureEdition(job.project_id!, idioma, false, "traduzindo");

    const prompt =
      "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
      `TRADUÇÃO para ${idioma}. Use a skill \`traducao-editorial\` (pipeline de 3 passos: tradução, ` +
      "glossário canônico, revisão adversarial), preservando voz, fidelidade e cadência.\n" +
      `- Traduza cada capítulo de manuscrito/capitulo-NN.md para traducoes/${idioma}/capitulo-NN.md (mesma numeração, dois dígitos).\n` +
      `- Ao final, consolide tudo em traducoes/${idioma}/MANUSCRITO-MESTRE.md (capítulos em ordem, headings preservados).\n` +
      "- NÃO altere o manuscrito de origem. NÃO dispare /goal.";
    const r = await runClaude(prompt, dir);

    // Verdade do disco
    const transCaps = await chaptersOnDisk(destino, 1);
    if (transCaps.length < origemCaps.length) {
      // Limite do Max → pausa/retoma sozinho (sem gastar tentativa). Senão, erro real.
      lancarSeLimiteMax(`${r.err}\n${r.out}`, `tradução ${idioma} em ${transCaps.length}/${origemCaps.length}`);
      throw new Error(`tradução ${idioma} incompleta: ${transCaps.length}/${origemCaps.length} caps. rc=${r.code} ${r.err.slice(-300)}`);
    }
    for (const c of transCaps) {
      await sanitizarArquivoCap(c.file, `tradução ${idioma}`);
      const key = storageKey(job.project_id!, idioma, `capitulo-${String(c.numero).padStart(2, "0")}.md`);
      await uploadFile("manuscritos", key, c.file);
      await must(sb.from("chapters").upsert(
        { owner: OWNER, edition_id: ed.id, numero: c.numero, palavras: c.palavras, storage_path: key },
        { onConflict: "edition_id,numero" }
      ));
    }
    const mestre = path.join(destino, "MANUSCRITO-MESTRE.md");
    if (await exists(mestre)) {
      await sanitizarArquivoCap(mestre, `tradução ${idioma} (mestre)`);
      await gateManuscrito(destino);
      await uploadFile("manuscritos", storageKey(job.project_id!, idioma, "MANUSCRITO-MESTRE.md"), mestre);
    }
    // Tradução completa ainda precisa da revisão/gates; não é publicação pronta.
    await must(sb.from("editions").update({ status: "revisao" }).eq("owner", OWNER).eq("id", ed.id));
  }
  await setProgress(job.id, { fase: "TRADUCAO", concluido: true, idiomas });
}

// ===========================================================================
// avaliar — book-bestseller-review numa edição (origem OU tradução).
// Gera relatório legível (review/REVIEW-<idioma>.md) + grava nota_review.
// ===========================================================================
// Pasta do manuscrito de uma edição (mesma regra do gerar_epub).
function edicaoDir(dir: string, edicao: any): string {
  return edicao.is_origem ? path.join(dir, "manuscrito") : path.join(dir, "traducoes", edicao.idioma);
}

// Relatório de alcançabilidade HONESTO: quando platôa abaixo da meta, diz o que
// segura a nota (dimensões < 8 + maneirismo) e que 9 costuma pedir polimento
// humano. Anexado ao relatório da skill (renderizado como seção na UI).
function montarAlcancabilidade(relTxt: string, nota: number | null, meta: number, manuscrito: string): string {
  const dims: string[] = [];
  for (const m of relTxt.matchAll(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*\*?\*?\s*([\d.,]+)\s*\*?\*?\s*\|/gm)) {
    const n = Number(m[2].replace(",", "."));
    if (!Number.isNaN(n) && n < 8) dims.push(`${m[1].trim()} (${n})`);
  }
  const lint = contarManeirismos(manuscrito);
  const gap = nota != null ? Math.round((meta - nota) * 10) / 10 : null;
  return [
    "",
    "## Alcançabilidade (worker)",
    "",
    nota != null
      ? `- **Nota atual:** ${nota} · **meta:** ${meta}${gap != null && gap > 0 ? ` · **faltam ${gap}**` : " · meta atingida"}`
      : `- **Meta:** ${meta}`,
    dims.length ? `- **Dimensões abaixo de 8 (o que segura a nota):** ${dims.join("; ")}.` : "- Nenhuma dimensão major abaixo de 8.",
    `- ${resumoManeirismo(lint)}`,
    "",
    gap != null && gap > 0
      ? "Caminho honesto para subir: levantar as dimensões acima por passadas temáticas (botão \"Pedir melhorias\" — prosa/anti-maneirismo, coerência, gancho). Um 9 num avaliador rigoroso costuma exigir, além disso, polimento humano final; esta nota mede o que está na página agora."
      : "Meta atingida na avaliação independente. Mudanças posteriores no texto pedem reavaliação.",
    "",
  ].join("\n");
}

async function avaliarEdicao(projectId: string, edicao: any, jobId?: string): Promise<number | null> {
  const dir = projDir(projectId);
  const sub = edicaoDir(dir, edicao);
  const mestre = path.join(sub, "MANUSCRITO-MESTRE.md");
  if (!(await exists(mestre))) throw new Error(`MANUSCRITO-MESTRE.md ausente para ${edicao.idioma} — escreva/traduza antes de avaliar`);

  await mkdir(path.join(dir, "review"), { recursive: true });
  const relRel = path.join("review", `REVIEW-${edicao.idioma}.md`);
  const notaRel = path.join("review", `NOTA-${edicao.idioma}.json`);
  const prompt =
    "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
    `AVALIAÇÃO editorial da edição em ${edicao.idioma}. Use a skill \`book-bestseller-review\`.\n` +
    `- Leia o manuscrito em ${edicaoDir("", edicao).replace(/^[\\/]/, "")}/MANUSCRITO-MESTRE.md (e os capitulo-NN.md, se precisar).\n` +
    `- Escreva um relatório legível em ${relRel} com: nota global (0–10), notas por critério, pontos fortes e uma LISTA PRIORIZADA E ACIONÁVEL de pontos fracos (cada item: o problema, onde ocorre — capítulo/cena — e o que mudar).\n` +
    `- Grave ${notaRel} com APENAS {"nota": <número 0-10>}.\n` +
    "- NÃO altere o manuscrito. NÃO dispare /goal.";
  await runClaude(prompt, dir);

  const relPath = path.join(dir, relRel);
  if (!(await exists(relPath))) throw new Error(`avaliação não gerou ${relRel} (verifique a skill book-bestseller-review / saldo)`);

  // nota: do JSON, com fallback para regex no relatório
  let relTxt = await readText(relPath);
  let nota: number | null = null;
  const nj = await readText(path.join(dir, notaRel));
  if (nj) { try { const n = Number(JSON.parse(nj).nota); if (!Number.isNaN(n)) nota = n; } catch { /* ignore */ } }
  if (nota == null) {
    const m = relTxt.match(/nota\s*(?:global)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*\/?\s*10/i);
    if (m) nota = Number(m[1].replace(",", "."));
  }

  // anexa o relatório de alcançabilidade honesto (se ainda não houver)
  if (!/##\s*Alcançabilidade/i.test(relTxt)) {
    const meta = Number((await getProject(projectId)).meta_nota ?? 9);
    relTxt += montarAlcancabilidade(relTxt, nota, meta, await lerManuscrito(sub));
    await writeFile(relPath, relTxt, "utf8");
  }

  // upload do relatório (com a seção de alcançabilidade) como artifact "review"
  const relKey = storageKey(projectId, edicao.idioma, `REVIEW-${edicao.idioma}.md`);
  await uploadFile("manuscritos", relKey, relPath);
  await upsertArtifact({ owner: OWNER, edition_id: edicao.id, tipo: "review", storage_path: relKey });

  await must(sb.from("editions").update({ nota_review: nota }).eq("owner", OWNER).eq("id", edicao.id));
  if (jobId) await setProgress(jobId, { fase: "AVALIACAO", idioma: edicao.idioma, nota, concluido: true });
  return nota;
}

async function avaliar(job: Job, _hb?: Heartbeat) {
  const edicao = await getEdition(job.edition_id!);
  // Livro importado: hidrata o WORK_DIR do Storage antes (capítulos + MESTRE + ESTADO).
  await hidratarSeNecessario(edicao.project_id);
  // Avaliação só roda em livro COMPLETO — nunca em manuscrito parcial (ex.: 3/32).
  const proj = await getProject(edicao.project_id);
  const sub = edicaoDir(projDir(edicao.project_id), edicao);
  const state = await readState(projDir(edicao.project_id));
  const total = Number(state?.total_capitulos_previstos ?? proj.total_capitulos ?? 0);
  const have = (await chaptersOnDisk(sub, edicao.is_origem ? Number(proj.piso_palavras ?? 1) : 1)).length;
  // Livro CONCLUIDO (incl. importado completo) já é completo por definição — não aplica
  // o portão de parcialidade (alguns capítulos podem ficar abaixo do piso e não contar).
  if (state?.fase_atual !== "CONCLUIDO" && total > 0 && have < total) {
    throw new Error(
      `Avaliação só roda com o livro completo — atualmente ${have}/${total} capítulos. Conclua a escrita antes de avaliar.`
    );
  }
  await setProgress(job.id, { fase: "AVALIACAO", idioma: edicao.idioma });
  await avaliarEdicao(edicao.project_id, edicao, job.id);
}

// ===========================================================================
// revisar — revisão por DIMENSÃO: em vez de só remendar os itens citados (que
// converge para um platô), faz passadas temáticas no livro inteiro — prosa/
// anti-maneirismo, coerência, gancho/stakes — para levantar dimensões inteiras
// (ataca o "teto distribuído"). Reupa o manuscrito e re-avalia.
// ===========================================================================

// Lê o manuscrito consolidado (MESTRE; senão concatena os capítulos do disco).
async function lerManuscrito(sub: string): Promise<string> {
  const m = await readText(path.join(sub, "MANUSCRITO-MESTRE.md"));
  if (m) return m;
  const cs = await chaptersOnDisk(sub, 1);
  const partes = await Promise.all(cs.map((c) => readText(c.file)));
  return partes.join("\n\n");
}

// Passadas temáticas, cada uma sob UMA lente, aplicadas ao livro todo.
const PASSES_REVISAO = [
  { key: "prosa", rotulo: "prosa & anti-maneirismo",
    foco: "Elimine tiques e repetições de CONSTRUÇÃO no livro inteiro: antíteses mecânicas (\"não era X. Era Y.\"), fragmentos antitéticos, metáforas-clichê repetidas. Varie ritmo e sintaxe; preserve sentido e voz." },
  { key: "coerencia", rotulo: "coerência & cronologia",
    foco: "Resolva furos de continuidade e cronologia ponta a ponta (relógios temporais, FATOS, nomes, regras do mundo). Garanta que prazos/datas/instrumentos citados fechem entre si." },
  { key: "gancho", rotulo: "gancho & stakes",
    foco: "Encarne a ameaça mais cedo e fortaleça ganchos de capítulo e tensão: stakes concretos por cena, aberturas que fisgam e fechamentos que impulsionam. Foque onde o relatório aponta hook/final fracos." },
];

// Passe de prosa DIRIGIDO POR CONTAGEM: reescreve reduzindo os moldes
// sobre-representados e RE-CONTA, iterando até tudo ficar abaixo do orçamento (ou
// um teto de iterações). Determinístico — a saída é verificável, não prometida.
const MAX_PROSA_ITERS = 3;
async function passeProsaCountDriven(job: Job, dir: string, sub: string, subRel: string, skill: string, idioma: string) {
  for (let it = 1; it <= MAX_PROSA_ITERS; it++) {
    const caps = await chaptersOnDisk(sub, 1);
    const textos = await Promise.all(caps.map((c) => readText(c.file)));
    const diag = diagnosticarRepeticao(textos.join("\n\n"), textos);
    if (!diag.algumAcima) {
      console.log(`[prosa] iter ${it}: dentro do orçamento — encerra.`);
      break;
    }
    const alvos = [
      ...diag.muletas.map((m) => `- MULETA ${m.termo}: ${m.n}× (${m.por10k}/10k) → reduza para ≤ ${m.alvo} (troque pela coisa concreta a que se refere; nunca "coisa").`),
      ...diag.moldes.map((m) => `- ${m.nome}: ${m.n}× (${m.por10k}/10k) → reduza para ≤ ${m.alvo}.`),
      diag.fecho.acima ? `- Fecho epigramático isolado (frase curta sozinha no fim do capítulo): ${diag.fecho.n}/${diag.fecho.total} capítulos → ≤ ${Math.ceil(diag.fecho.total / 3)} (varie os fechamentos).` : "",
      ...diag.ngramas.slice(0, 6).map((h) => `- repetição "${h.gram}": ${h.n}× → varie/reduza.`),
      ...diag.cadencia.slice(0, 8).map((c) => `- CADÊNCIA cap ${c.capitulo}: ${c.tiques.map((q) => `${q.nome} ${q.n}×${q.densidade != null ? ` (${q.densidade}%)` : ""}→≤${q.alvo}`).join("; ")} → VARIE O RITMO (funda frases curtas, encadeie onde for revelação), não só corte palavra.`),
    ].filter(Boolean).join("\n");
    await setProgress(job.id, { fase: "REVISAO", idioma, etapa: `prosa: desadensando tiques (iter ${it}/${MAX_PROSA_ITERS})`, repeticao: { moldes: diag.moldes.length, fecho: diag.fecho.n } });
    const prompt =
      "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
      `REVISÃO DE PROSA — anti-repetição, edição em ${idioma}. Use a skill \`${skill}\`.\n` +
      "- Os MOLDES abaixo estão SOBRE-REPRESENTADOS (contagem real do detector). Reduza CADA UM ao alvo, no LIVRO TODO, DESADENSANDO o tique: reescreva a construção repetida com sintaxe variada, PRESERVANDO sentido e voz. NÃO reescreva cena à toa — só desfaça o tique.\n" +
      alvos + "\n" +
      `- Edite os capítulos afetados em ${subRel}/capitulo-NN.md e reconsolide ${subRel}/MANUSCRITO-MESTRE.md.\n` +
      "- NÃO altere outras edições/idiomas. NÃO dispare /goal.";
    const r = await runClaude(prompt, dir);
    lancarSeLimiteMax(`${r.err}\n${r.out}`, `revisão de ${idioma} (prosa iter ${it})`);
  }
  const capsFinais = await chaptersOnDisk(sub, 1);
  const textosFinais = await Promise.all(capsFinais.map((c) => readText(c.file)));
  const final = diagnosticarRepeticao(textosFinais.join("\n\n"), textosFinais);
  if (final.algumAcima) {
    const blockers = [
      ...final.muletas.map((m) => `MULETA ${m.termo}: ${m.n}x > ${m.alvo}`),
      ...final.moldes.map((m) => `${m.nome}: ${m.n}x > ${m.alvo}`),
      ...(final.fecho.acima ? [`fecho epigramático: ${final.fecho.n}/${final.fecho.total}`] : []),
      ...final.ngramas.map((n) => `repetição ${n.gram}: ${n.n}x`),
      ...final.cadencia.map((c) => `cadência cap ${c.capitulo}`),
    ];
    throw new QualityBlockedError("REVISAO_PROSA", blockers, "Teto da revisão de prosa atingido com blockers residuais.");
  }
}

async function persistirQualityStatesEdicao(dir: string, edicaoId: string, caps: Awaited<ReturnType<typeof chaptersOnDisk>>, stage: string) {
  const qDir = path.join(dir, "quality", edicaoId);
  await mkdir(qDir, { recursive: true });
  for (const c of caps) {
    const text = await readText(c.file);
    const qPath = path.join(qDir, `capitulo-${String(c.numero).padStart(2, "0")}.json`);
    let previous: QualityState | null = null;
    try { previous = JSON.parse(await readFile(qPath, "utf8")) as QualityState; } catch {}
    const metricsAfter = { words: countWords(text), residualBlockers: 0 };
    const state = decideQualityState({
      text, detectorVersion: "maneirismo-ts-v1", skillVersion: "edition-review-v1", stage,
      decisionBy: "worker/revisar", attempts: (previous?.attempts ?? 0) + 1,
      maxAttempts: MAX_PROSA_ITERS,
      metricsBefore: previous?.metricsAfter ?? { firstEvaluation: true },
      metricsAfter, targets: { residualBlockers: 0 }, blockers: [],
    });
    await writeFile(qPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}

async function revisar(job: Job, _hb?: Heartbeat) {
  const edicao = await getEdition(job.edition_id!);
  const projectId = edicao.project_id;
  const dir = projDir(projectId);
  const sub = edicaoDir(dir, edicao);
  const relRel = path.join("review", `REVIEW-${edicao.idioma}.md`);
  if (!(await exists(path.join(dir, relRel)))) throw new Error("avalie a edição antes de pedir melhorias (relatório ausente)");
  const instrucoes = String(job.payload?.instrucoes ?? "").trim();
  const proj = await getProject(projectId);
  const skill = edicao.is_origem ? proj.skill_escrita || "edicao-kindle" : "traducao-editorial";
  const subRel = edicaoDir("", edicao).replace(/^[\\/]/, "");

  await must(sb.from("editions").update({ status: "revisao" }).eq("owner", OWNER).eq("id", edicao.id));

  // Fila de passadas por dimensão (+ uma final para as instruções do autor).
  const fila = [...PASSES_REVISAO];
  if (instrucoes) fila.push({ key: "autor", rotulo: "instruções do autor", foco: `Aplique com prioridade estas instruções do autor: """${instrucoes}""".` });

  const markerDir = path.join(dir, "review");
  await mkdir(markerDir, { recursive: true });
  for (let i = 0; i < fila.length; i++) {
    const pass = fila[i];
    const marker = path.join(markerDir, `_revpass-${job.id}-${pass.key}.done`);
    if (await exists(marker)) continue; // já feita neste job (retoma após limite do Max sem refazer)
    await setProgress(job.id, { fase: "REVISAO", idioma: edicao.idioma, etapa: `passada ${i + 1}/${fila.length}: ${pass.rotulo}`, total: fila.length, cap_atual: i });

    if (pass.key === "prosa") {
      // Prosa = passe verificado por contagem (itera até abaixo do orçamento).
      await passeProsaCountDriven(job, dir, sub, subRel, skill, edicao.idioma);
    } else {
      const prompt =
        "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
        `REVISÃO POR DIMENSÃO — ${pass.rotulo} — da edição em ${edicao.idioma}. Use a skill \`${skill}\`.\n` +
        `- Leia o relatório ${relRel} (pontos fracos priorizados) e a fundação (Bíblia/Mapa/perfil-de-voz), se precisar.\n` +
        `- ${pass.foco}\n` +
        `- Faça UMA passada no LIVRO TODO sob ESTA lente, editando os capítulos afetados em ${subRel}/capitulo-NN.md; preserve o que já está bom (não reescreva à toa).\n` +
        `- Reconsolide ${subRel}/MANUSCRITO-MESTRE.md (capítulos em ordem, headings preservados).\n` +
        "- NÃO altere outras edições/idiomas. NÃO dispare /goal.";
      const r = await runClaude(prompt, dir);
      // Limite do Max no meio de uma passada → pausa/retoma sozinho; o marcador
      // garante que as passadas já concluídas não são refeitas na retomada.
      lancarSeLimiteMax(`${r.err}\n${r.out}`, `revisão de ${edicao.idioma} (${pass.rotulo})`);
    }
    await writeFile(marker, new Date().toISOString(), "utf8");
  }

  // reupload do manuscrito revisado (verdade do disco)
  const caps = await chaptersOnDisk(sub, 1);
  const idiomaKey = edicao.is_origem ? "origem" : edicao.idioma;
  for (const c of caps) {
    await sanitizarArquivoCap(c.file, `revisão ${idiomaKey}`);
    const key = storageKey(projectId, idiomaKey, `capitulo-${String(c.numero).padStart(2, "0")}.md`);
    await uploadFile("manuscritos", key, c.file);
    await must(sb.from("chapters").upsert(
      { owner: OWNER, edition_id: edicao.id, numero: c.numero, palavras: c.palavras, storage_path: key },
      { onConflict: "edition_id,numero" }
    ));
  }
  const mestre = path.join(sub, "MANUSCRITO-MESTRE.md");
  if (await exists(mestre)) {
    await sanitizarArquivoCap(mestre, `revisão ${idiomaKey} (mestre)`);
    await gateManuscrito(sub);
    await uploadFile("manuscritos", storageKey(projectId, idiomaKey, "MANUSCRITO-MESTRE.md"), mestre);
  }

  // re-avalia para atualizar a nota e o relatório
  await setProgress(job.id, { fase: "REVISAO", idioma: edicao.idioma, etapa: "reavaliando" });
  const nota = await avaliarEdicao(projectId, edicao, job.id);
  const meta = Number(proj.meta_nota ?? 9);
  if (nota == null || nota < meta) {
    throw new QualityBlockedError("REAVALIACAO_FINAL", [`nota ${nota ?? "ausente"} abaixo da meta ${meta}`], "Reavaliação final não comprovou a meta editorial.");
  }
  // Passes posteriores à prosa também podem reintroduzir tiques: reconta tudo no fim.
  const textosFinais = await Promise.all(caps.map((c) => readText(c.file)));
  const diagFinal = diagnosticarRepeticao(textosFinais.join("\n\n"), textosFinais);
  if (diagFinal.algumAcima) throw new QualityBlockedError("REVISAO_FINAL", [
    ...diagFinal.muletas.map((m) => `MULETA ${m.termo}: ${m.n}x > ${m.alvo}`),
    ...diagFinal.moldes.map((m) => `${m.nome}: ${m.n}x > ${m.alvo}`),
    ...diagFinal.ngramas.map((n) => `repetição ${n.gram}: ${n.n}x`),
    ...diagFinal.cadencia.map((c) => `cadência cap ${c.capitulo}`),
  ], "Passes posteriores reintroduziram blockers determinísticos.");
  await persistirQualityStatesEdicao(dir, edicao.id, caps, "REVISAO_FINAL");
  // Permanece em revisão até gerar_epub comprovar hashes e promover a publicação.
  await must(sb.from("editions").update({ status: "revisao" }).eq("owner", OWNER).eq("id", edicao.id));
  // limpa os marcadores de passada deste job (sucesso) — não acumular no projeto.
  for (const pass of fila) { try { await rm(path.join(markerDir, `_revpass-${job.id}-${pass.key}.done`)); } catch {} }
  await setProgress(job.id, { fase: "REVISAO", idioma: edicao.idioma, nota, concluido: true });
}

// Compositor determinístico (Pillow) — garante layout idêntico entre idiomas.
const COMPOSER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "compose_cover.py");
// Logo Maremonti (branca/transparente), aplicada em TODAS as capas (centro-inferior).
const LOGO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "maremonti-white.png");

// Direções de composição para diversificar as 5 opções (não 5 quase iguais).
const COMPOSICOES = [
  "tight emotional close-up of the protagonist, shallow depth of field",
  "wide atmospheric establishing shot of the setting, cinematic scale",
  "a single symbolic object in dramatic chiaroscuro light, minimalist",
  "two figures separated by tension or distance, charged negative space",
  "moody architectural or environmental detail, evocative and ominous",
];

function artPromptCapa(genero: string, brief: string, premissa: string, composicao?: string): string {
  return (
    `Book cover background art, portrait orientation, genre: ${genero || "literary fiction"}. ` +
    (composicao ? `Composition: ${composicao}. ` : "") +
    (brief ? `Art direction: ${brief}. ` : "Strong, original direction fitting the genre. ") +
    (premissa ? `Mood/context: ${premissa}. ` : "") +
    "Cinematic, atmospheric, richly detailed, professional illustration, dramatic lighting, high quality, sharp focus. " +
    "Absolutely NO text, no letters, no title, no typography, no watermark, no frame. Avoid an AI look. " +
    "Keep the top and bottom areas cleaner for text overlay."
  );
}

// Diretor de arte (LLM leve): lê o contexto do livro e escreve UM prompt de imagem
// rico e profissional para a ARTE DE FUNDO (sem texto). Cai no template se falhar.
async function direcaoDeArte(proj: any, brief: string, premissa: string, cwd: string): Promise<string> {
  const autor = proj.briefing?.autor || "";
  const sin = premissa || proj.briefing?.sinopse || "";
  const meta =
    "Você é diretor de arte de capas de livro premiadas. Escreva UM ÚNICO prompt de imagem em INGLÊS, " +
    "denso e cinematográfico, para a ARTE DE FUNDO (sem NENHUM texto) da capa do livro abaixo.\n" +
    `LIVRO: "${proj.titulo}"${proj.serie ? ` (${proj.serie})` : ""}. Gênero: ${proj.genero || "ficção literária"}.` +
    (autor ? ` Autor/estilo: ${autor}.` : "") + (sin ? ` Premissa: ${sin}.` : "") +
    (brief ? ` Direção do autor: ${brief}.` : "") + "\n" +
    "O prompt deve especificar: figura/assunto central, composição em ORIENTAÇÃO RETRATO com ESPAÇO NEGATIVO " +
    "deliberado no TOPO (título) e na BASE (autor/logo), iluminação, paleta e mood do gênero, lente/" +
    "enquadramento, referência de estilo e acabamento editorial. " +
    'Termine SEMPRE com: "no text, no letters, no title, no typography, no watermark, no logo, no frame. Avoid an AI look."\n' +
    "Responda APENAS com o prompt (texto corrido, sem aspas, sem rótulos, sem explicação).";
  try {
    const r = await run(CLAUDE_BIN, ["-p", meta, "--permission-mode", CLAUDE_PERMISSION_MODE, "--model", POST_MODEL], { cwd, timeoutMs: 120000 });
    const out = (r.out || "").trim().replace(/^["']+|["']+$/g, "");
    return out.length > 60 ? out : "";
  } catch {
    return "";
  }
}

// Gera UMA arte-mestra (sem texto) pela cadeia de provedores; grava em outPath.
async function gerarArteMestra(prompt: string, outPath: string, seed?: number): Promise<boolean> {
  const r = await gerarImagem(prompt, { width: 1024, height: 1536, seed });
  if (!r) return false;
  await writeFile(outPath, r.bytes);
  return true;
}

// Traduz título/subtítulo e compõe a capa de cada idioma a partir de uma master
// única (mesma arte, layout fixo, só o texto muda) + logo Maremonti.
async function comporCapasDeMaster(
  projectId: string, proj: any, masterPng: string, idiomas: string[], brief: string, subOrig: string, hb?: Heartbeat, jobId?: string
) {
  const origem = proj.idioma_origem || "pt-BR";
  const dir = projDir(projectId);
  const capasDir = path.join(dir, "capas");
  const fontsDir = path.join(skillsDir(), "canvas-design", "canvas-fonts");
  const autor = proj.briefing?.autor || "Atelier de Livros IA";
  const tituloOrig = proj.titulo;

  await hb?.({ fase: "CAPA", etapa: "textos" });
  const textosFile = path.join(capasDir, "textos.json");
  try { await rm(textosFile); } catch {}
  const promptTxt =
    "Modo headless. Trabalhe SOMENTE nesta pasta.\n" +
    "Traduza o TÍTULO e o SUBTÍTULO de um livro para os idiomas pedidos, soando nativo e preservando o sentido " +
    "(como a skill `traducao-editorial` faria para título de capa; preserve nomes próprios).\n" +
    `Idioma de origem: ${origem}. Título: "${tituloOrig}". Subtítulo: "${subOrig}".\n` +
    `Idiomas pedidos: ${idiomas.join(", ")}.\n` +
    'Grave SOMENTE capas/textos.json no formato {"<idioma>": {"titulo":"...","subtitulo":"..."}}, ' +
    `incluindo ${origem} com o título/subtítulo ORIGINAIS. Nada além do JSON.`;
  const rt = await runClaude(promptTxt, dir);
  let textos: Record<string, any> = {};
  const rawTxt = await readText(textosFile);
  if (rawTxt) {
    try { textos = JSON.parse(rawTxt); } catch { const m = rawTxt.match(/\{[\s\S]*\}/); textos = m ? JSON.parse(m[0]) : {}; }
  }
  // Fallback robusto: se a tradução falhar, ao menos compõe o idioma de origem.
  if (!Object.keys(textos).length) {
    if (idiomas.length === 1 && idiomas[0] === origem) textos = { [origem]: { titulo: tituloOrig, subtitulo: subOrig } };
    else throw new Error("tradução de textos falhou (textos.json). rc=" + rt.code);
  }

  for (const idioma of idiomas) {
    await hb?.({ fase: "CAPA", etapa: "compondo", idioma });
    const t = textos[idioma] || {};
    const titulo = String(t.titulo || tituloOrig);
    const subtitulo = String(t.subtitulo ?? (idioma === origem ? subOrig : ""));
    const outPng = path.join(capasDir, `${idioma}.png`);
    const outPdf = path.join(capasDir, `${idioma}.pdf`);
    const cfgFile = path.join(capasDir, `_cfg-${idioma}.json`);
    await writeFile(
      cfgFile,
      JSON.stringify({ art: masterPng, out: outPng, pdf: outPdf, title: titulo, subtitle: subtitulo, author: autor, genre: proj.genero || "", fonts_dir: fontsDir, logo: LOGO_PATH }),
      "utf8"
    );
    const rc = await run(PY_BIN, [COMPOSER, "--config", cfgFile], { cwd: dir });
    if (!(await exists(outPng))) throw new Error(`composição da capa ${idioma} falhou. ${(rc.err || rc.out).slice(-300)}`);

    const ed = await ensureEdition(projectId, idioma, idioma === origem, "pendente");
    const keyPng = storageKey(projectId, idioma, "capa.png");
    await uploadFile("capas", keyPng, outPng);
    const url = await signedUrl("capas", keyPng);
    const meta: any = { briefing: brief || null, titulo, master: true };
    if (await exists(outPdf)) {
      const keyPdf = storageKey(projectId, idioma, "capa.pdf");
      await uploadFile("capas", keyPdf, outPdf);
      meta.pdf = keyPdf;
    }
    await sb.from("artifacts").delete().eq("owner", OWNER).eq("edition_id", ed.id).eq("tipo", "capa");
    await upsertArtifact({ owner: OWNER, edition_id: ed.id, tipo: "capa", storage_path: keyPng, url_publica: url, meta });
  }
  if (jobId) await setProgress(jobId, { fase: "CAPA", concluido: true, idiomas });
}

// ===========================================================================
// gerar_capas — UMA arte-mestra (sem texto) + tradução de título/subtítulo +
// composição DETERMINÍSTICA por idioma (mesma "fotografia", layout padronizado).
// Aceita payload {idiomas:[...], briefing, subtitulo?, novo_art?} OU edition_id (1 idioma).
// ===========================================================================
async function gerarCapas(job: Job, hb?: Heartbeat) {
  let projectId = job.project_id;
  let idiomas: string[] = Array.isArray(job.payload?.idiomas) ? job.payload.idiomas.filter(Boolean) : [];
  if (job.edition_id) {
    const ed = await getEdition(job.edition_id);
    projectId = ed.project_id;
    if (!idiomas.length) idiomas = [ed.idioma];
  }
  if (!projectId) throw new Error("gerar_capas: faltou project_id");
  const proj = await getProject(projectId);
  const origem = proj.idioma_origem || "pt-BR";
  if (!idiomas.length) idiomas = [origem];

  const dir = projDir(projectId);
  const capasDir = path.join(dir, "capas");
  await mkdir(capasDir, { recursive: true });
  const subOrig = job.payload?.subtitulo || proj.briefing?.subtitulo || "";
  const premissa = proj.briefing?.ideia_central || "";
  const brief = String(job.payload?.briefing || "").trim();
  const masterPng = path.join(capasDir, "master.png");
  const novoArt = job.payload?.novo_art !== false; // default: (re)gerar arte

  // 1) Arte-mestra SEM TEXTO (uma só, compartilhada por todos os idiomas)
  if (novoArt || !(await exists(masterPng))) {
    await hb?.({ fase: "CAPA", etapa: "arte-mestra" });
    await setProgress(job.id, { fase: "CAPA", etapa: "arte-mestra" });
    try { await rm(masterPng); } catch {}
    const baseArt = (await direcaoDeArte(proj, brief, premissa, dir)) || artPromptCapa(proj.genero || "", brief, premissa);
    const ok = await gerarArteMestra(baseArt, masterPng);
    if (!ok) {
      // Fallback: canvas-design (Claude) se a cadeia de imagem falhar.
      const promptArt =
        "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
        "Crie SOMENTE a ARTE DE FUNDO de uma capa de livro — SEM NENHUM TEXTO, sem letras, sem título, sem nome — " +
        "usando a skill `canvas-design`.\n" +
        `- Gênero: "${proj.genero || ""}".` + (premissa ? ` Premissa: "${premissa}".` : "") + "\n" +
        "- Direção de arte: " + (brief || "proponha algo forte, original e coerente com o gênero.") + "\n" +
        "- Formato RETRATO 1600×2560 px, RGB, qualidade editorial; FOCO visual dominante. " +
        "Deixe o TOPO e a BASE mais limpos/respirando (o texto será sobreposto depois pelo sistema).\n" +
        "- EVITE cara de IA. NÃO escreva NENHUM texto/letra na imagem.\n" +
        "ENTREGA: salve em capas/master.png (1600×2560). Não gere mais nada.";
      const r = await runClaude(promptArt, dir);
      if (!(await exists(masterPng))) throw new Error(`arte-mestra não gerada (cadeia de imagem e canvas-design falharam). rc=${r.code} ${r.err.slice(-300)}`);
    }
    await uploadFile("capas", storageKey(projectId, "master.png"), masterPng);
  }

  // 2-3) Traduzir textos + compor cada idioma da MESMA master (+ logo)
  await comporCapasDeMaster(projectId, proj, masterPng, idiomas, brief, subOrig, hb, job.id);
}

// ===========================================================================
// gerar_capas_opcoes — N artes-mestra SEM TEXTO (default 5), diversas, para escolha.
// Sobe como artifacts tipo='capa_opcao' na edição de origem (meta.idx/seed/provider).
// ===========================================================================
async function gerarCapasOpcoes(job: Job, hb?: Heartbeat) {
  const projectId = job.project_id;
  if (!projectId) throw new Error("gerar_capas_opcoes: faltou project_id");
  const proj = await getProject(projectId);
  const origem = proj.idioma_origem || "pt-BR";
  const dir = projDir(projectId);
  const opcoesDir = path.join(dir, "capas", "opcoes");
  await mkdir(opcoesDir, { recursive: true });
  const brief = String(job.payload?.briefing || "").trim();
  const premissa = proj.briefing?.ideia_central || "";
  const n = Math.min(8, Math.max(2, Number(job.payload?.n ?? 5)));
  const provPref = providerLabel(providerAtivo());
  let provReal: string | null = null; // provedor que DE FATO entregou (pode cair no fallback)

  // edição de origem ancora as opções; limpa as opções antigas (db + storage best-effort)
  const ed = await ensureEdition(projectId, origem, true, "pendente");
  const { data: antigas } = await sb.from("artifacts").select("storage_path").eq("owner", OWNER).eq("edition_id", ed.id).eq("tipo", "capa_opcao");
  for (const a of antigas ?? []) { try { await sb.storage.from("capas").remove([(a as any).storage_path]); } catch {} }
  await sb.from("artifacts").delete().eq("owner", OWNER).eq("edition_id", ed.id).eq("tipo", "capa_opcao");

  // Diretor de arte: UM prompt-base rico pro livro; cada opção varia a composição.
  await hb?.({ fase: "CAPA", etapa: "direção de arte", provedor: provPref });
  const baseArt = await direcaoDeArte(proj, brief, premissa, dir);

  let geradas = 0;
  for (let i = 0; i < n; i++) {
    await hb?.({ fase: "CAPA", etapa: `opção ${i + 1}/${n}`, provedor: provReal || provPref });
    await setProgress(job.id, { fase: "CAPA", etapa: `opção ${i + 1}/${n}`, provedor: provReal || provPref, total: n, cap_atual: i });
    const seed = Math.floor(Math.random() * 1_000_000);
    const comp = COMPOSICOES[i % COMPOSICOES.length];
    const prompt = baseArt
      ? `${baseArt} Composition variation ${i + 1}: ${comp}.`
      : artPromptCapa(proj.genero || "", brief, premissa, comp);
    const r = await gerarImagem(prompt, { width: 1024, height: 1536, seed });
    if (!r) continue;
    provReal = providerLabel(r.provider);
    const localPng = path.join(opcoesDir, `opcao-${i}.png`);
    await writeFile(localPng, r.bytes);
    const key = storageKey(projectId, "opcoes", `opcao-${i}.png`);
    await uploadFile("capas", key, localPng);
    const url = await signedUrl("capas", key);
    await upsertArtifact({ owner: OWNER, edition_id: ed.id, tipo: "capa_opcao", storage_path: key, url_publica: url, meta: { idx: i, seed, provider: r.provider } });
    geradas++;
  }
  if (!geradas) throw new Error("nenhuma opção de capa gerada (cadeia de imagem falhou). Verifique tokens em worker/.env ou tente de novo.");
  await setProgress(job.id, { fase: "CAPA", etapa: "opções prontas", concluido: true, total: n, cap_atual: geradas, provedor: provReal || provPref });
}

// ===========================================================================
// compor_capas — fixa UMA opção escolhida como master e compõe a capa final
// (texto + logo) do idioma de origem e de cada idioma pedido (mesma master).
// payload: { opcao: <storage_path da capa_opcao>, idiomas?:[...], briefing?, subtitulo? }
// ===========================================================================
async function comporCapas(job: Job, hb?: Heartbeat) {
  const projectId = job.project_id;
  if (!projectId) throw new Error("compor_capas: faltou project_id");
  const proj = await getProject(projectId);
  const origem = proj.idioma_origem || "pt-BR";
  let idiomas: string[] = Array.isArray(job.payload?.idiomas) ? job.payload.idiomas.filter(Boolean) : [];
  if (!idiomas.length) idiomas = [origem];
  const opcaoPath = String(job.payload?.opcao || "").trim();
  if (!opcaoPath) throw new Error("compor_capas: faltou a opção escolhida (payload.opcao)");

  const dir = projDir(projectId);
  const capasDir = path.join(dir, "capas");
  await mkdir(capasDir, { recursive: true });
  const masterPng = path.join(capasDir, "master.png");

  // baixa a opção escolhida -> master.png e registra como master
  await hb?.({ fase: "CAPA", etapa: "fixando master" });
  const { data: blob, error: de } = await sb.storage.from("capas").download(opcaoPath);
  if (de || !blob) throw new Error("não baixei a opção escolhida: " + (de?.message ?? ""));
  await writeFile(masterPng, Buffer.from(await blob.arrayBuffer()));
  await uploadFile("capas", storageKey(projectId, "master.png"), masterPng);
  const edOrigem = await ensureEdition(projectId, origem, true, "pendente");
  await sb.from("artifacts").delete().eq("owner", OWNER).eq("edition_id", edOrigem.id).eq("tipo", "capa_master");
  await sb.from("artifacts").insert({ owner: OWNER, edition_id: edOrigem.id, tipo: "capa_master", storage_path: storageKey(projectId, "master.png"), meta: { from: opcaoPath } });

  const subOrig = job.payload?.subtitulo || proj.briefing?.subtitulo || "";
  const brief = String(job.payload?.briefing || "").trim();
  await comporCapasDeMaster(projectId, proj, masterPng, idiomas, brief, subOrig, hb, job.id);
}

// ===========================================================================
// gerar_pacote — edicao-kindle (pacote comercial) -> publishing_packages
// ===========================================================================
async function gerarPacote(job: Job, hb?: Heartbeat) {
  const edicao = await getEdition(job.edition_id!);
  const proj = await getProject(edicao.project_id);
  const dir = projDir(edicao.project_id);
  const sub = edicao.is_origem ? path.join(dir, "manuscrito") : path.join(dir, "traducoes", edicao.idioma);
  await hb?.({ fase: "PACOTE", idioma: edicao.idioma });
  const outJson = path.join(sub, "pacote-kdp.json");

  const prompt =
    "Modo headless. Trabalhe SOMENTE nesta pasta.\n" +
    "Monte o PACOTE COMERCIAL KDP com a skill `edicao-kindle` (Passo 3, references/kdp-comercial.md) " +
    `sobre ${path.relative(dir, path.join(sub, "MANUSCRITO-MESTRE.md")).replace(/\\/g, "/")}, no idioma ${edicao.idioma}.\n` +
    `- Gere: sinopse curta; descrição de vendas em HTML (gancho nas 2 primeiras linhas, até ~4000 chars); ` +
    "EXATAMENTE 7 keywords (≤50 chars, sem vírgula, sem nome de autor/marca); EXATAMENTE 3 categorias reais do marketplace; " +
    "subtítulo; preço sugerido (número).\n" +
    `- Grave o resultado como JSON em ${path.relative(dir, outJson).replace(/\\/g, "/")} com as chaves: ` +
    '{"sinopse","descricao_html","keywords":[7],"categorias":[3],"subtitulo","autor","preco_sugerido"}.';
  const r = await runClaude(prompt, dir);

  const raw = await readText(outJson);
  if (!raw) throw new Error(`pacote não gerado (pacote-kdp.json ausente). rc=${r.code} ${r.err.slice(-300)}`);
  let pkg: any;
  try {
    pkg = JSON.parse(raw);
  } catch {
    // tolera cercas de código
    const m = raw.match(/\{[\s\S]*\}/);
    pkg = m ? JSON.parse(m[0]) : null;
  }
  if (!pkg) throw new Error("pacote-kdp.json inválido");

  const { error: pkgErr } = await sb.from("publishing_packages").upsert(
    {
      owner: OWNER,
      edition_id: edicao.id,
      sinopse: pkg.sinopse ?? null,
      descricao_html: pkg.descricao_html ?? null,
      keywords: pkg.keywords ?? null,
      categorias: pkg.categorias ?? null,
      subtitulo: pkg.subtitulo ?? null,
      autor: pkg.autor ?? proj.briefing?.autor ?? null,
      preco_sugerido: pkg.preco_sugerido ?? null,
      status: "pronto",
    },
    { onConflict: "edition_id" }
  );
  if (pkgErr) throw new Error("falha ao gravar publishing_packages: " + pkgErr.message);
  // sobe o JSON também
  await uploadFile("pacotes", storageKey(edicao.project_id, edicao.idioma, "pacote-kdp.json"), outJson);
  await setProgress(job.id, { fase: "PACOTE", concluido: true });
}

// ===========================================================================
// importar_vendas — parse CSV KDP (de Storage) -> sales_rows
// ===========================================================================
function parseKdpCsv(text: string): any[] {
  const linhas = text.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = linhas[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const idx = (cands: string[]) => head.findIndex((h) => cands.some((c) => h.includes(c)));
  const cData = idx(["royalty date", "date", "data"]);
  const cMkt = idx(["marketplace", "loja"]);
  const cUn = idx(["net units", "units sold", "units", "unidades"]);
  const cRoy = head.findIndex((h) => !h.includes("date") && (h.includes("royalty") || h.includes("royalties") || h === "valor"));
  const cMoeda = idx(["currency", "moeda"]);
  const cIdioma = idx(["language", "idioma"]);
  const rows: any[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const num = (s: string) => {
      const v = parseFloat((s || "").replace(/\./g, "").replace(",", "."));
      return Number.isFinite(v) ? v : null;
    };
    rows.push({
      data: cData >= 0 && cols[cData] ? cols[cData] : null,
      marketplace: cMkt >= 0 ? cols[cMkt] : null,
      idioma: cIdioma >= 0 ? cols[cIdioma] : null,
      unidades: cUn >= 0 ? Math.round(num(cols[cUn]) ?? 0) : null,
      royalty: cRoy >= 0 ? num(cols[cRoy]) : null,
      moeda: cMoeda >= 0 ? cols[cMoeda] : null,
    });
  }
  return rows;
}

async function importarVendas(job: Job) {
  const importId = job.payload?.import_id;
  const csvPath = job.payload?.csv_path; // chave no bucket 'pacotes' (ou caminho local)
  if (!importId || !csvPath) throw new Error("payload deve ter import_id e csv_path");
  let text = "";
  if (await exists(csvPath)) {
    text = await readText(csvPath);
  } else {
    const { data, error } = await sb.storage.from("pacotes").download(csvPath);
    if (error) throw new Error("não consegui baixar o CSV: " + error.message);
    text = Buffer.from(await data.arrayBuffer()).toString("utf8");
  }
  const rows = parseKdpCsv(text).filter((r) => r.unidades != null || r.royalty != null);
  if (rows.length) {
    await must(sb.from("sales_rows").insert(rows.map((r) => ({ owner: OWNER, import_id: importId, ...r }))));
  }
  await setProgress(job.id, { fase: "VENDAS", linhas: rows.length });
}

// ---- dispatch -------------------------------------------------------------
// ===========================================================================
// gerar_post_social — rascunho de post de rede social NA VOZ do autor (modelo leve).
// Sem postagem real: só gera variações + hashtags e grava em social_posts.
// ===========================================================================
const POST_MODEL = process.env.POST_MODEL || "sonnet"; // leve/barato; voz não precisa de Opus

const SPEC_REDE: Record<string, string> = {
  instagram: "Instagram: legenda envolvente; a 1ª linha é um gancho forte; 3 a 6 hashtags relevantes (sem spam); inclua um CTA ('link na bio'); emojis com moderação conforme a voz do autor.",
  x: "X (Twitter): no máximo 280 caracteres; punchy; 0 a 2 hashtags; nada de emoji se a voz do autor for seca.",
  tiktok: "TikTok: roteiro curto e nativo — gancho nos primeiros 3 segundos + legenda; sugira UMA ideia visual entre colchetes no fim.",
  threads: "Threads: conversacional, sem spam de hashtag; termine convidando uma resposta.",
  youtube: "YouTube: conforme o objetivo, um TÍTULO + DESCRIÇÃO de vídeo, ou um post de comunidade curto.",
  site: "Site/blog: uma nota ou parágrafo curto, tom um pouco mais formal, sem hashtags.",
};

function extrairJson(s: string): any {
  // tenta achar o último bloco { ... } (o claude -p pode imprimir texto antes)
  const matches = s.match(/\{[\s\S]*\}/g);
  if (!matches) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    try { return JSON.parse(matches[i]); } catch { /* tenta o próximo */ }
  }
  return null;
}

async function gerarPostSocial(job: Job, hb?: Heartbeat): Promise<void> {
  const p = job.payload || {};
  if (!p.author_id || !p.rede) throw new Error("payload incompleto (author_id, rede)");
  const { data: autor, error: ea } = await sb
    .from("authors").select("nome,estilo,genero,bio,personalidade,referencias").eq("owner", OWNER).eq("id", p.author_id).single();
  if (ea || !autor) throw new Error("autor não encontrado: " + (ea?.message ?? ""));

  // contexto da obra (opcional)
  let obraCtx = "";
  if (p.project_id) {
    const { data: proj } = await sb.from("projects").select("titulo,genero,serie,volume").eq("owner", OWNER).eq("id", p.project_id).single();
    let sinopse = "";
    const { data: eds } = await sb.from("editions").select("id").eq("owner", OWNER).eq("project_id", p.project_id).eq("is_origem", true).limit(1);
    if (eds?.[0]) {
      const { data: pkg } = await sb.from("publishing_packages").select("sinopse").eq("owner", OWNER).eq("edition_id", eds[0].id).limit(1);
      sinopse = pkg?.[0]?.sinopse ?? "";
    }
    if (proj) obraCtx = `\nOBRA ANCORADA: "${proj.titulo}"${proj.serie ? ` (${proj.serie}, vol. ${proj.volume})` : ""}${proj.genero ? ` — ${proj.genero}` : ""}.${sinopse ? ` Sinopse: ${sinopse}` : ""}`;
  }

  const n = Math.min(6, Math.max(1, Number(p.n_variantes ?? 3)));
  const spec = SPEC_REDE[p.rede] ?? `Rede ${p.rede}.`;
  await setProgress(job.id, { fase: "POST", etapa: `${autor.nome} · ${p.rede}` });
  await hb?.({ fase: "POST", autor: autor.nome, rede: p.rede });

  const prompt = [
    `Você é um ghostwriter de redes sociais. Escreva NA VOZ do autor abaixo (um pseudônimo literário). É um RASCUNHO — não publique nada.`,
    `\n=== VOZ DO AUTOR (contrato, siga à risca) ===`,
    `Nome: ${autor.nome}`,
    autor.estilo ? `Estilo: ${autor.estilo}` : "",
    autor.genero ? `Gênero: ${autor.genero}` : "",
    autor.personalidade ? `Personalidade: ${autor.personalidade}` : "",
    autor.referencias ? `Referências: ${autor.referencias}` : "",
    autor.bio ? `Bio: ${autor.bio}` : "",
    `\n=== TAREFA ===`,
    `Rede: ${p.rede}. ${spec}`,
    `Objetivo: ${p.objetivo || "engajamento"}.`,
    p.tema ? `Tema: ${p.tema}.` : "",
    obraCtx,
    `Idioma: pt-BR (a menos que o objetivo peça outro).`,
    `\nGere ${n} VARIAÇÕES distintas do post (não numere dentro do texto) e uma lista de hashtags sugeridas coerentes com a rede.`,
    `\n=== SAÍDA ===`,
    `Responda APENAS com um JSON válido, sem cercas de código e sem texto antes ou depois, no formato exato:`,
    `{"variantes": ["texto da variação 1", "texto da variação 2"], "hashtags": ["#exemplo"]}`,
  ].filter(Boolean).join("\n");

  await mkdir(WORK_DIR, { recursive: true });
  const r = await run(CLAUDE_BIN, ["-p", prompt, "--permission-mode", CLAUDE_PERMISSION_MODE, "--model", POST_MODEL], { cwd: WORK_DIR });

  if (/credit balance is too low|insufficient/i.test(r.out + r.err))
    throw new Error("Saldo/limite da conta de IA esgotado — tente novamente após o reset.");

  const parsed = extrairJson(r.out);
  let variantes: string[] = Array.isArray(parsed?.variantes) ? parsed.variantes.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  let hashtags: string[] = Array.isArray(parsed?.hashtags) ? parsed.hashtags.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  if (!variantes.length) {
    const cru = r.out.trim();
    if (!cru) throw new Error(`geração vazia (rc=${r.code}). ${r.err.slice(-200)}`);
    variantes = [cru]; // fallback: usa o texto cru se não veio JSON
  }

  await must(sb.from("social_posts").insert({
    owner: OWNER, author_id: p.author_id, project_id: p.project_id ?? null,
    rede: p.rede, objetivo: p.objetivo ?? null, tema: p.tema ?? null,
    conteudo: variantes[0], variantes, hashtags, status: "rascunho",
  }));
  await setProgress(job.id, { fase: "POST", etapa: "pronto", variacoes: variantes.length });
}

async function aceitarExcecaoQualidade(job: Job): Promise<void> {
  if (!job.project_id) throw new Error("exceção de qualidade exige project_id");
  const numero = Number(job.payload?.capitulo);
  const reason = String(job.payload?.motivo ?? "").trim();
  const blockerCodes = Array.isArray(job.payload?.blocker_codes) ? job.payload.blocker_codes.map(String) : [];
  if (!Number.isInteger(numero) || numero < 1 || !reason || !blockerCodes.length) {
    throw new Error("exceção exige capitulo, motivo e blocker_codes explícitos");
  }
  const dir = projDir(job.project_id);
  let qDir = path.join(dir, "quality");
  let chapterDir = path.join(dir, "manuscrito");
  if (job.edition_id) {
    const ed = await getEdition(job.edition_id);
    if (ed.project_id !== job.project_id) throw new Error("edição fora do projeto da exceção");
    qDir = path.join(dir, "quality", ed.id);
    chapterDir = ed.is_origem ? path.join(dir, "manuscrito") : path.join(dir, "traducoes", ed.idioma);
  }
  const name = `capitulo-${String(numero).padStart(2, "0")}`;
  const qPath = path.join(qDir, `${name}.json`);
  const textPath = path.join(chapterDir, `${name}.md`);
  const state = JSON.parse(await readFile(qPath, "utf8")) as QualityState;
  const text = await readFile(textPath, "utf8");
  const accepted = applyQualityException(state, text, {
    acceptedBy: OWNER,
    acceptedAt: new Date().toISOString(),
    reason,
    blockerCodes,
  });
  await writeFile(qPath, JSON.stringify(accepted, null, 2) + "\n", "utf8");
  await setProgress(job.id, { fase: "QUALITY_EXCEPTION", cap_atual: numero, resumo: `Exceção humana registrada no capítulo ${numero}` });
}

export async function executarJob(job: Job, hb?: Heartbeat): Promise<void> {
  switch (job.tipo) {
    case "ping": return ping(job);
    case "entrevistar": return entrevistar(job, hb);
    case "criar_fundacao": return criarFundacao(job, hb);
    case "refinar_fundacao": return refinarFundacao(job, hb);
    case "criar_volumes": return criarVolumes(job, hb);
    case "escrever_livro": return escreverLivro(job, hb);
    case "gerar_epub": return gerarEpub(job);
    case "traduzir": return traduzir(job, hb);
    case "avaliar": return avaliar(job, hb);
    case "revisar": return revisar(job, hb);
    case "gerar_capa": return gerarCapas(job, hb);
    case "gerar_capas": return gerarCapas(job, hb);
    case "gerar_capas_opcoes": return gerarCapasOpcoes(job, hb);
    case "compor_capas": return comporCapas(job, hb);
    case "gerar_pacote": return gerarPacote(job, hb);
    case "importar_vendas": return importarVendas(job);
    case "gerar_post_social": return gerarPostSocial(job, hb);
    case "aceitar_excecao_qualidade": return aceitarExcecaoQualidade(job);
    default: throw new Error("tipo de job desconhecido: " + job.tipo);
  }
}

export { parseKdpCsv };
