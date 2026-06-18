// Executores por tipo de job. Cada um ORQUESTRA uma skill do Claude Code (ou um
// script determinístico da skill) — NÃO reimplementa a lógica das skills.
// Verdade do disco: o worker confere arquivos reais antes de gravar status.
import { mkdir, writeFile, rm } from "node:fs/promises";
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
  CLAUDE_BIN,
} from "./lib.js";

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

// ---- DB helpers -----------------------------------------------------------
// Falha alto: lança se a escrita no banco retornar erro (evita job "done" divergente).
async function must<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  const err = (r as { error: { message?: string } | null }).error;
  if (err) throw new Error("erro de escrita no banco: " + (err.message ?? String(err)));
  return r;
}
async function getProject(id: string) {
  const { data, error } = await sb.from("projects").select("*").eq("id", id).single();
  if (error) throw new Error("projeto não encontrado: " + error.message);
  return data;
}
async function getEdition(id: string) {
  const { data, error } = await sb.from("editions").select("*").eq("id", id).single();
  if (error) throw new Error("edição não encontrada: " + error.message);
  return data;
}
async function setProgress(jobId: string, progresso: Record<string, unknown>) {
  await sb.from("jobs").update({ progresso, locked_at: new Date().toISOString() }).eq("id", jobId);
}
async function ensureEdition(projectId: string, idioma: string, isOrigem: boolean, status = "pendente") {
  const { data } = await must(
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

  const qaText = qa.length
    ? qa.map((x, i) => `${i + 1}. P: ${x.pergunta}\n   R: ${x.resposta}`).join("\n")
    : "nenhuma";
  const outFile = path.join(dir, "entrevista-out.json");
  try { await rm(outFile); } catch {}

  const prompt =
    "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n" +
    "Conduza a ENTREVISTA de fundação de um livro com a metodologia da skill `arquiteto-de-enredo` " +
    "(entrevista em blocos, perguntas com opção recomendada; portão de qualidade antes de gerar).\n\n" +
    `IDEIA DO AUTOR:\n${idea}\n\n` +
    `RESPOSTAS ATÉ AGORA (${qa.length} no total):\n${qaText}\n\n` +
    "REGRA DE CONVERGÊNCIA (importante): esta é uma entrevista CURTA, de no máximo 3 blocos. " +
    `Já foram respondidas ${qa.length} perguntas. Se já houver ${qa.length} >= 6 respostas, CONCLUA AGORA ` +
    "(não faça mais perguntas), adotando defaults sensatos e coerentes para tudo que faltar (registre como suposição).\n\n" +
    "SUA TAREFA (UMA rodada):\n" +
    "- Se ainda faltam informações ESSENCIAIS e você ainda não atingiu 3 blocos, gere o PRÓXIMO BLOCO de NO MÁXIMO 3 perguntas. " +
    "Cubra ao longo dos blocos: gênero/subgênero; protagonista (ferida, segredo, desejo ativo); antagonista; tom/PdV/tempo verbal; " +
    "OBRIGATÓRIO nº de capítulos E páginas-alvo; meta de palavras; OBRIGATÓRIO skill de escrita; final; cânone/proibições/idioma; autor.\n" +
    "- Cada pergunta tem: campo (id curto), pergunta, 2–4 opções, UMA 'recomendada' (a mais forte) e 'porque' (1 frase). " +
    "Para skill de escrita as opções devem ser: skill-dan-brown, hoover-mcfadden, skill-jk-rowling, vesper-escritor-de-capitulos, Nenhuma.\n" +
    "- Se já há o suficiente (adotando defaults razoáveis para o que faltar), CONCLUA.\n\n" +
    "SAÍDA: grave APENAS o arquivo entrevista-out.json, exatamente em UMA destas formas:\n" +
    'CONTINUAR: {"completo": false, "perguntas": [{"campo":"genero","pergunta":"...","opcoes":["A","B"],"recomendada":"A","porque":"...","multipla":false}]}\n' +
    'CONCLUIR: {"completo": true, "briefing": {"ideia_central":"...","genero":"...","protagonista":{"nome":"...","ferida":"...","segredo":"...","desejo":"..."},"antagonista":"...","tom":"...","pdv":"...","tempo_verbal":"...","num_capitulos":12,"paginas_alvo":200,"meta_palavras":60000,"linha_tempo":"...","final":"...","canone":"...","proibido":"...","autor":"...","skill_escrita":null,"piso_palavras":1400,"meta_nota":9.0,"idioma":"pt-BR"}}\n' +
    "NÃO escreva nada além do JSON nesse arquivo. NÃO rode /goal nem gere a fundação agora.";
  const r = await runClaude(prompt, dir);

  const raw = await readText(outFile);
  if (!raw) throw new Error("entrevista sem saída (entrevista-out.json). rc=" + r.code + " " + r.err.slice(-300));
  let out: any;
  try { out = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); out = m ? JSON.parse(m[0]) : null; }
  if (!out) throw new Error("entrevista-out.json inválido");

  if (out.completo && out.briefing) {
    const b = out.briefing;
    const merged = { ...b, idea, qa, _interview: { completo: true } };
    await must(
      sb.from("projects").update({
        briefing: merged,
        genero: b.genero ?? proj.genero ?? null,
        total_capitulos: b.num_capitulos ?? proj.total_capitulos ?? null,
        paginas_alvo: b.paginas_alvo ?? proj.paginas_alvo ?? null,
        piso_palavras: b.piso_palavras ?? proj.piso_palavras ?? 1400,
        meta_nota: b.meta_nota ?? proj.meta_nota ?? 9.0,
        skill_escrita: b.skill_escrita ?? proj.skill_escrita ?? null,
        idioma_origem: b.idioma ?? proj.idioma_origem ?? "pt-BR",
      }).eq("id", job.project_id!)
    );
    // entrevista validada -> dispara a fundação automaticamente
    await must(sb.from("jobs").insert({ owner: OWNER, tipo: "criar_fundacao", project_id: job.project_id }));
    await setProgress(job.id, { fase: "ENTREVISTA", completo: true });
  } else {
    const perguntas = Array.isArray(out.perguntas) ? out.perguntas : [];
    const merged = { ...briefing, idea, qa, _interview: { completo: false, pending: perguntas } };
    await must(sb.from("projects").update({ briefing: merged }).eq("id", job.project_id!));
    await setProgress(job.id, { fase: "ENTREVISTA", perguntas: perguntas.length });
  }
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

  // Sync: sobe a fundação ao Storage
  for (const f of ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md", "ESTADO_LIVRO.json", "briefing.md"]) {
    if (await exists(path.join(dir, f))) {
      await uploadFile("manuscritos", storageKey(job.project_id!, "fundacao", f), path.join(dir, f));
    }
  }

  // Edição de origem + status do projeto
  await ensureEdition(job.project_id!, proj.idioma_origem || "pt-BR", true, "pendente");
  await must(
    sb
      .from("projects")
      .update({
        status: "fundacao",
        titulo: state?.titulo || proj.titulo,
        total_capitulos: total,
        paginas_alvo: state?.paginas_alvo ?? proj.paginas_alvo,
      })
      .eq("id", job.project_id!)
  );
  await setProgress(job.id, { fase: "ESTRUTURA", total_capitulos: total, concluido: true });
}

// ===========================================================================
// escrever_livro — livro_runner.py (opus) até CONCLUIDO; verdade do disco
// ===========================================================================
async function escreverLivro(job: Job, hb?: Heartbeat) {
  if (!RUNNER_PATH) throw new Error("RUNNER_PATH não configurado no worker/.env");
  const proj = await getProject(job.project_id!);
  const dir = projDir(job.project_id!);
  if (!(await exists(path.join(dir, "ESTADO_LIVRO.json"))))
    throw new Error("fundação ausente — rode criar_fundacao antes de escrever_livro");

  const piso = Number(proj.piso_palavras ?? 1400);
  const meta = Number(proj.meta_nota ?? 9.0);
  await sb.from("projects").update({ status: "escrevendo" }).eq("id", job.project_id!);

  // Poller de progresso (verdade do disco) enquanto o runner roda
  const poll = setInterval(async () => {
    const st = await readState(dir);
    const caps = await chaptersOnDisk(path.join(dir, "manuscrito"), piso);
    await setProgress(job.id, {
      fase: st?.fase_atual ?? "ESCRITA",
      cap_atual: caps.length,
      total: Number(st?.total_capitulos_previstos ?? proj.total_capitulos ?? 0),
      nota: st?.ultima_nota ?? null,
      palavras: st?.palavras_totais ?? 0,
    });
    await hb?.({ fase: st?.fase_atual, caps: caps.length });
  }, 20_000);

  const args = [
    RUNNER_PATH,
    "--projeto", dir,
    "--briefing", path.join(dir, "briefing.md"),
    "--epub",
    "--meta", String(meta),
    "--max-reescritas", "4",
    "--piso", String(piso),
    "--model", MODEL,
    "--claude-bin", CLAUDE_BIN,
  ];
  let r;
  try {
    r = await run(PY_BIN, args, { cwd: dir });
  } finally {
    clearInterval(poll);
  }

  // Verdade do disco
  const state = await readState(dir);
  const total = Number(state?.total_capitulos_previstos ?? proj.total_capitulos ?? 0);
  const caps = await chaptersOnDisk(path.join(dir, "manuscrito"), piso);
  if (total > 0 && caps.length < total) {
    const log = (await readText(path.join(dir, "runner.log"))).slice(-600);
    throw new Error(`livro incompleto: ${caps.length}/${total} capítulos >= piso. rc=${r.code}. ${log}`);
  }

  // Edição de origem
  const edicao = await ensureEdition(job.project_id!, proj.idioma_origem || "pt-BR", true, "revisao");

  // Sync capítulos -> Storage + tabela chapters
  for (const c of caps) {
    const key = storageKey(job.project_id!, "origem", `capitulo-${String(c.numero).padStart(2, "0")}.md`);
    await uploadFile("manuscritos", key, c.file);
    const titulo = (await readText(c.file)).split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim() ?? null;
    await must(sb.from("chapters").upsert(
      { owner: OWNER, edition_id: edicao.id, numero: c.numero, titulo, palavras: c.palavras, storage_path: key },
      { onConflict: "edition_id,numero" }
    ));
  }
  // Manuscrito-mestre
  const mestre = path.join(dir, "manuscrito", "MANUSCRITO-MESTRE.md");
  if (await exists(mestre)) {
    const key = storageKey(job.project_id!, "origem", "MANUSCRITO-MESTRE.md");
    await uploadFile("manuscritos", key, mestre);
    await must(sb.from("artifacts").insert({ owner: OWNER, edition_id: edicao.id, tipo: "manuscrito", storage_path: key }));
  }
  // EPUB (se o runner gerou)
  const epubRel = state?.epub_caminho;
  if (epubRel && (await exists(path.join(dir, epubRel)))) {
    const key = storageKey(job.project_id!, "origem", path.basename(epubRel));
    await uploadFile("epubs", key, path.join(dir, epubRel));
    const url = await signedUrl("epubs", key);
    await must(sb.from("artifacts").insert({ owner: OWNER, edition_id: edicao.id, tipo: "epub", storage_path: key, url_publica: url }));
  }

  const nota = state?.ultima_nota != null ? Number(state.ultima_nota) : null;
  await must(sb.from("editions").update({ status: "pronto", nota_review: nota }).eq("id", edicao.id));
  await must(sb.from("projects").update({ status: "pronto" }).eq("id", job.project_id!));
  await setProgress(job.id, { fase: "CONCLUIDO", cap_atual: caps.length, total, nota, palavras: state?.palavras_totais ?? 0 });
}

// ===========================================================================
// gerar_epub — DETERMINÍSTICO via edicao-kindle/scripts/build_epub.py
// ===========================================================================
async function gerarEpub(job: Job) {
  const edicao = await getEdition(job.edition_id!);
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

  const key = storageKey(edicao.project_id, edicao.idioma, path.basename(out));
  await uploadFile("epubs", key, out);
  const url = await signedUrl("epubs", key);
  await must(sb.from("artifacts").insert({
    owner: OWNER,
    edition_id: edicao.id,
    tipo: "epub",
    storage_path: key,
    url_publica: url,
    meta: { versao, idioma: edicao.idioma, com_capa: true, validado: v.code === 0, validacao: v.out.slice(-1200) },
  }));
  await setProgress(job.id, { fase: "EPUB", concluido: true, versao, validado: v.code === 0 });
}

// ===========================================================================
// traduzir — skill traducao-editorial (PT-BR -> idiomas-meta)
// ===========================================================================
async function traduzir(job: Job, hb?: Heartbeat) {
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
      throw new Error(`tradução ${idioma} incompleta: ${transCaps.length}/${origemCaps.length} caps. rc=${r.code} ${r.err.slice(-300)}`);
    }
    for (const c of transCaps) {
      const key = storageKey(job.project_id!, idioma, `capitulo-${String(c.numero).padStart(2, "0")}.md`);
      await uploadFile("manuscritos", key, c.file);
      await must(sb.from("chapters").upsert(
        { owner: OWNER, edition_id: ed.id, numero: c.numero, palavras: c.palavras, storage_path: key },
        { onConflict: "edition_id,numero" }
      ));
    }
    const mestre = path.join(destino, "MANUSCRITO-MESTRE.md");
    if (await exists(mestre)) {
      await uploadFile("manuscritos", storageKey(job.project_id!, idioma, "MANUSCRITO-MESTRE.md"), mestre);
    }
    await must(sb.from("editions").update({ status: "pronto" }).eq("id", ed.id));
  }
  await setProgress(job.id, { fase: "TRADUCAO", concluido: true, idiomas });
}

// Compositor determinístico (Pillow) — garante layout idêntico entre idiomas.
const COMPOSER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "compose_cover.py");

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
  const fontsDir = path.join(skillsDir(), "canvas-design", "canvas-fonts");
  const autor = proj.briefing?.autor || "Atelier de Livros IA";
  const tituloOrig = proj.titulo;
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
    if (!(await exists(masterPng)))
      throw new Error(`arte-mestra não gerada (capas/master.png). rc=${r.code} ${r.err.slice(-300)}`);
    await uploadFile("capas", storageKey(projectId, "master.png"), masterPng);
  }

  // 2) Traduzir título/subtítulo (uma vez) para os idiomas pedidos
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
  if (!Object.keys(textos).length) throw new Error("tradução de textos falhou (textos.json). rc=" + rt.code);

  // 3) Compor cada idioma DETERMINISTICAMENTE (mesma arte, layout idêntico)
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
      JSON.stringify({ art: masterPng, out: outPng, pdf: outPdf, title: titulo, subtitle: subtitulo, author: autor, fonts_dir: fontsDir }),
      "utf8"
    );
    const rc = await run(PY_BIN, [COMPOSER, "--config", cfgFile], { cwd: dir });
    if (!(await exists(outPng)))
      throw new Error(`composição da capa ${idioma} falhou. ${(rc.err || rc.out).slice(-300)}`);

    const ed = await ensureEdition(projectId, idioma, idioma === origem, idioma === origem ? "pronto" : "pendente");
    const keyPng = storageKey(projectId, idioma, "capa.png");
    await uploadFile("capas", keyPng, outPng);
    const url = await signedUrl("capas", keyPng);
    const meta: any = { briefing: brief || null, titulo, master: true };
    if (await exists(outPdf)) {
      const keyPdf = storageKey(projectId, idioma, "capa.pdf");
      await uploadFile("capas", keyPdf, outPdf);
      meta.pdf = keyPdf;
    }
    await sb.from("artifacts").delete().eq("edition_id", ed.id).eq("tipo", "capa");
    await must(sb.from("artifacts").insert({ owner: OWNER, edition_id: ed.id, tipo: "capa", storage_path: keyPng, url_publica: url, meta }));
  }
  await setProgress(job.id, { fase: "CAPA", concluido: true, idiomas });
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
export async function executarJob(job: Job, hb?: Heartbeat): Promise<void> {
  switch (job.tipo) {
    case "ping": return ping(job);
    case "entrevistar": return entrevistar(job, hb);
    case "criar_fundacao": return criarFundacao(job, hb);
    case "escrever_livro": return escreverLivro(job, hb);
    case "gerar_epub": return gerarEpub(job);
    case "traduzir": return traduzir(job, hb);
    case "gerar_capa": return gerarCapas(job, hb);
    case "gerar_capas": return gerarCapas(job, hb);
    case "gerar_pacote": return gerarPacote(job, hb);
    case "importar_vendas": return importarVendas(job);
    default: throw new Error("tipo de job desconhecido: " + job.tipo);
  }
}

export { parseKdpCsv };
