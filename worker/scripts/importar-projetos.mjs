// Importador de projetos existentes -> plataforma Atelier (Supabase + Storage).
// Roda NA MÁQUINA DO RODRIGO (precisa alcançar o Supabase com a service_role do worker).
//
// Uso (na pasta worker/):
//   node scripts/importar-projetos.mjs --dry     # só mostra o plano, não grava nada
//   node scripts/importar-projetos.mjs           # importa (pula o que já existe)
//   node scripts/importar-projetos.mjs --force   # reimporta (apaga e recria os mesmos títulos)
//
// Lê credenciais de worker/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID.
// Pastas-fonte: por padrão as do Windows; sobrescreva com env LIVROS_ROOT / SAGA_ROOT.

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

const LIVROS_ROOT = process.env.LIVROS_ROOT || "C:\\Users\\Rodrigo Paiva\\Desktop\\PESSOAL\\LIVROS";
const SAGA_ROOT = process.env.SAGA_ROOT || "C:\\Users\\Rodrigo Paiva\\Desktop\\PESSOAL\\Saga";

const FUND = ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md"];

// ---------- manifesto dos 9 projetos selecionados ----------
const L = (p) => path.join(LIVROS_ROOT, p);
const obras = [
  { serie: "A Linhagem das Cinzas", autor: "Mia Peducci", genero: "Suspense histórico", base: SAGA_ROOT, fundacaoDir: ".",
    volumes: [
      { volume: 1, titulo: "O Pecado das Cinzas", chaptersDir: "manuscrito/Livro-01-O-Pecado-das-Cinzas", capa: "Capas/Livro I.png" },
      { volume: 2, titulo: "A Primeira Renovação", chaptersDir: "manuscrito/Livro-02-A-Primeira-Renovacao", capa: "Capas/Livro II.png" },
      { volume: 3, titulo: "O Século da Dúvida", chaptersDir: "manuscrito/Livro-03-O-Seculo-da-Duvida", capa: "Capas/Livro III.png" },
    ] },
  { autor: "Aria Nolan", genero: "Suspense literário", base: L("Aria Nolan/- O Colecionador de Silêncios"),
    volumes: [{ volume: 1, titulo: "O Colecionador de Silêncios", chaptersDir: "manuscrito", fundacaoDir: ".", capa: "Capa.png", epub: "O Colecionador de Silencios.epub" }] },
  { serie: "Vésper", autor: "Iago Provardi", genero: "Fantasia sombria", base: L("Iago Provardi/VESPER"),
    volumes: [{ volume: 1, titulo: "Vésper", chaptersDir: ".", chapterInclude: /^\d.*\.md$/i, fundacaoDir: ".", capa: "Capa livro 1.png" }] },
  { autor: "Mia Peducci", base: L("Mia Peducci/- A Memória dos Outros"),
    volumes: [{ volume: 1, titulo: "A Memória dos Outros", chaptersDir: "manuscrito", fundacaoDir: ".", capaDir: "Capas", epub: "A-Memoria-dos-Outros.epub" }] },
  { autor: "Mia Peducci", base: L("Mia Peducci/- O que a Maré Esconde"),
    volumes: [{ volume: 1, titulo: "O que a Maré Esconde", chaptersDir: "manuscrito", fundacaoDir: ".", capaDir: "Capa O que a Maré Esconde", epub: "O-Que-a-Mare-Esconde.epub" }] },
  { autor: "Mia Peducci", base: L("Mia Peducci/A Última Carta de Vênus"),
    volumes: [{ volume: 1, titulo: "A Última Carta de Vênus", chaptersDir: "manuscrito", chapterInclude: /^Capitulo-\d.*\.md$/i, fundacaoDir: "." }] },
  { autor: "Mia Peducci", base: L("Mia Peducci/Enquanto Você Dormia em Lisboa"),
    volumes: [{ volume: 1, titulo: "Enquanto Você Dormia em Lisboa", chaptersDir: "manuscrito", fundacaoDir: ".", capaDir: "Capas", capaPrefer: "BT" }] },
  { serie: "Última Chamada para o Embarque", autor: "Mia Peducci", base: L("Mia Peducci/Última Chamada para o Embarque"),
    volumes: [
      { volume: 1, titulo: "Última Chamada para o Embarque", chaptersDir: "manuscrito", chapterInclude: /^cap-\d.*\.md$/i, fundacaoDir: ".", capa: "Capas/1 BR.png" },
      { volume: 2, titulo: "Última Chamada para o Embarque — Vol. 2", chaptersDir: "Livro-II/manuscrito", fundacaoDir: "Livro-II", capa: "Capas/2 BR.png" },
    ] },
  { autor: "Mia Peducci", base: L("Mia Peducci/A Casa que Conta"),
    volumes: [{ volume: 1, titulo: "A Casa que Conta", chaptersDir: "manuscrito", fundacaoDir: ".", capaDir: "Capas" }] },
];

// ---------- helpers ----------
const naturalSort = (a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function listChapters(dir, include) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => !/completo|consolidad|biblia-da-obra|estrutura-do-livro|mapa-de-personagens|perfil-de-voz|claude|agents|readme|changelog|relatorio|avaliacao|briefing|runbook|como-usar|style-sheet|metadados|pacote/i.test(f))
    .filter((f) => (include ? include.test(f) : true))
    .sort(naturalSort);
}
function tituloDoArquivo(fn) {
  let s = fn.replace(/\.md$/i, "").replace(/^\d+[-_\s]*/, "").replace(/^Capitulo[-_\s]*\d+[-_\s]*/i, "").replace(/^cap[-_\s]*\d+[-_\s]*/i, "");
  s = s.replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}
const wordCount = (txt) => (txt.trim().match(/\S+/g) || []).length;
function pickCapa(base, vol) {
  if (vol.capa && exists(path.join(base, vol.capa))) return path.join(base, vol.capa);
  const dir = vol.capaDir ? path.join(base, vol.capaDir) : base;
  if (!exists(dir)) return null;
  let imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
  if (!imgs.length) return null;
  if (vol.capaPrefer) { const pref = imgs.filter((f) => f.toUpperCase().includes(vol.capaPrefer.toUpperCase())); if (pref.length) imgs = pref; }
  imgs.sort(naturalSort);
  return path.join(dir, imgs[0]);
}
function findEpub(base, vol) {
  if (vol.epub && exists(path.join(base, vol.epub))) return path.join(base, vol.epub);
  if (!exists(base)) return null;
  const e = fs.readdirSync(base).filter((f) => /\.epub$/i.test(f)).sort(naturalSort);
  return e.length ? path.join(base, e[0]) : null;
}
function fundacaoFiles(base, vol) {
  const dir = path.join(base, vol.fundacaoDir || ".");
  return FUND.map((f) => ({ name: f, full: path.join(dir, f) })).filter((x) => exists(x.full));
}

// ---------- Supabase (só fora do dry) ----------
let sb = null, OWNER = null;
async function initSb() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  OWNER = process.env.OWNER_USER_ID;
  if (!url || !key || !OWNER) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_USER_ID no worker/.env");
  sb = createClient(url, key, { auth: { persistSession: false } });
}
const skey = (projectId, ...parts) => [OWNER, projectId, ...parts].join("/");
async function up(bucket, key, full, contentType) {
  const buf = fs.readFileSync(full);
  const { error } = await sb.storage.from(bucket).upload(key, buf, { upsert: true, contentType });
  if (error) throw new Error(`upload ${bucket}/${key}: ${error.message}`);
}

async function importarVolume(obra, vol) {
  const base = obra.base;
  const chDir = path.join(base, vol.chaptersDir || "manuscrito");
  const chs = listChapters(chDir, vol.chapterInclude);
  const fund = fundacaoFiles(base, vol);
  const capa = pickCapa(base, vol);
  const epub = findEpub(base, vol);
  const status = epub ? "pronto" : chs.length ? "revisao" : "rascunho";

  console.log(`\n• ${obra.serie ? obra.serie + " — " : ""}${vol.titulo}  [${obra.autor}]`);
  console.log(`   capítulos:${chs.length}  fundação:${fund.length}/4  capa:${capa ? "sim" : "—"}  epub:${epub ? "sim" : "—"}  status:${status}`);
  if (DRY) return { ok: true };

  // idempotência
  let q = sb.from("projects").select("id").eq("owner", OWNER).eq("titulo", vol.titulo).eq("volume", vol.volume);
  q = obra.serie ? q.eq("serie", obra.serie) : q.is("serie", null);
  const { data: ex } = await q;
  if (ex && ex.length) {
    if (!FORCE) { console.log("   já existe — pulando (use --force para refazer)"); return { ok: true, skipped: true }; }
    await sb.from("projects").delete().eq("id", ex[0].id);
    console.log("   --force: projeto antigo removido");
  }

  const { data: proj, error: pe } = await sb.from("projects").insert({
    owner: OWNER, titulo: vol.titulo, serie: obra.serie ?? null, volume: vol.volume,
    genero: obra.genero ?? null, idioma_origem: "pt-BR", status,
    total_capitulos: chs.length || null,
    briefing: { importado: true, autor: obra.autor, origem: base },
  }).select("id").single();
  if (pe) throw new Error(`projects: ${pe.message}`);
  const pid = proj.id;

  const { data: ed, error: ee } = await sb.from("editions").insert({
    owner: OWNER, project_id: pid, idioma: "pt-BR", is_origem: true,
    status: epub ? "pronto" : "revisao",
  }).select("id").single();
  if (ee) throw new Error(`editions: ${ee.message}`);

  for (const f of fund) await up("manuscritos", skey(pid, "fundacao", f.name), f.full, "text/markdown");

  let n = 0;
  for (const fn of chs) {
    n++;
    const full = path.join(chDir, fn);
    const key = skey(pid, "manuscrito", String(n).padStart(2, "0") + "-" + fn.replace(/[^\w.\- ]+/g, "_"));
    await up("manuscritos", key, full, "text/markdown");
    const palavras = wordCount(fs.readFileSync(full, "utf8"));
    const { error } = await sb.from("chapters").insert({ owner: OWNER, edition_id: ed.id, numero: n, titulo: tituloDoArquivo(fn), palavras, storage_path: key });
    if (error) throw new Error(`chapters #${n}: ${error.message}`);
  }

  if (capa) {
    const ext = path.extname(capa).toLowerCase() || ".png";
    const key = skey(pid, "capa" + ext);
    await up("capas", key, capa, ext === ".png" ? "image/png" : "image/jpeg");
    await sb.from("artifacts").insert({ owner: OWNER, edition_id: ed.id, tipo: "capa", storage_path: key, meta: { origem: path.basename(capa) } });
  }
  if (epub) {
    const key = skey(pid, path.basename(epub).replace(/[^\w.\- ]+/g, "_"));
    await up("epubs", key, epub, "application/epub+zip");
    await sb.from("artifacts").insert({ owner: OWNER, edition_id: ed.id, tipo: "epub", storage_path: key, meta: { origem: path.basename(epub) } });
  }
  console.log(`   ✔ importado (project ${pid}) — ${n} capítulos`);
  return { ok: true, pid };
}

async function main() {
  console.log(DRY ? "== DRY-RUN (nada será gravado) ==" : FORCE ? "== IMPORT (--force) ==" : "== IMPORT ==");
  console.log("LIVROS_ROOT:", LIVROS_ROOT);
  console.log("SAGA_ROOT  :", SAGA_ROOT);
  if (!DRY) await initSb();
  let projetos = 0, caps = 0, falhas = 0;
  for (const obra of obras) {
    if (!exists(obra.base)) { console.log(`\n!! pasta não encontrada: ${obra.base}`); falhas++; continue; }
    for (const vol of obra.volumes) {
      try { const r = await importarVolume(obra, vol); if (!r.skipped) projetos++; }
      catch (e) { console.log(`   ✖ ERRO: ${e.message}`); falhas++; }
    }
  }
  console.log(`\nResumo: ${projetos} volume(s) processado(s), ${falhas} falha(s).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
