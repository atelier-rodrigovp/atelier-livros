// Importa as obras locais (pastas) para a plataforma Atelier (Supabase + Storage).
// Uso: node scripts/importar-obras.mjs            -> SURVEY (só imprime o plano)
//      node scripts/importar-obras.mjs --apply    -> grava de verdade (idempotente)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER = process.env.OWNER_USER_ID;
if (!URL || !KEY || !OWNER) { console.error("Faltam SUPABASE_URL/SERVICE_ROLE/OWNER no worker/.env"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const PESSOAL = "C:/Users/Rodrigo Paiva/Desktop/PESSOAL";
const SAGA = `${PESSOAL}/Saga`;
const LIV = `${PESSOAL}/LIVROS`;
const MP = `${LIV}/Mia Peducci`;
const UC = `${MP}/Última Chamada para o Embarque`;

// Excluir arquivos que não são capítulos (fundação/consolidados/relatórios).
const EXCLUDE = /(biblia|estrutura|mapa-de-personagens|perfil-de-voz|completo|consolidad|relatorio|avaliacao|briefing|runbook|changelog|style-sheet|agents|claude|readme|metadados|pacote)/i;
const FUNDACAO = ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md"];

const OBRAS = [
  { titulo: "O Pecado das Cinzas", serie: "A Linhagem das Cinzas", volume: 1, genero: "Suspense histórico", autor: "Mia Peducci",
    chaptersDir: `${SAGA}/manuscrito/Livro-01-O-Pecado-das-Cinzas`, fundacaoDir: SAGA, capaFile: `${SAGA}/Capas/Livro I.png` },
  { titulo: "A Primeira Renovação", serie: "A Linhagem das Cinzas", volume: 2, genero: "Suspense histórico", autor: "Mia Peducci",
    chaptersDir: `${SAGA}/manuscrito/Livro-02-A-Primeira-Renovacao`, fundacaoDir: SAGA, capaFile: `${SAGA}/Capas/Livro II.png` },
  { titulo: "O Século da Dúvida", serie: "A Linhagem das Cinzas", volume: 3, genero: "Suspense histórico", autor: "Mia Peducci",
    chaptersDir: `${SAGA}/manuscrito/Livro-03-O-Seculo-da-Duvida`, fundacaoDir: SAGA, capaFile: `${SAGA}/Capas/Livro III.png` },
  { titulo: "O Colecionador de Silêncios", serie: null, volume: 1, autor: "Aria Nolan",
    base: `${LIV}/Aria Nolan/- O Colecionador de Silêncios`, chaptersSub: "manuscrito", capaFileName: "Capa.png", epub: "O Colecionador de Silencios.epub" },
  { titulo: "Vésper", serie: "Vésper", volume: 1, autor: "Iago Provardi",
    base: `${LIV}/Iago Provardi/VESPER`, chaptersDir: `${LIV}/Iago Provardi/VESPER`, chaptersPattern: /^\d{2}-(Prologo|Capitulo)/i, capaFileName: "Capa livro 1.png" },
  { titulo: "A Memória dos Outros", serie: null, volume: 1, autor: "Mia Peducci",
    base: `${MP}/- A Memória dos Outros`, chaptersSub: "manuscrito", capaFolder: "Capas", epub: "A-Memoria-dos-Outros.epub" },
  { titulo: "O que a Maré Esconde", serie: null, volume: 1, autor: "Mia Peducci",
    base: `${MP}/- O que a Maré Esconde`, chaptersSub: "manuscrito", capaFolder: "Capa O que a Maré Esconde", epub: "O-Que-a-Mare-Esconde.epub" },
  { titulo: "A Última Carta de Vênus", serie: null, volume: 1, autor: "Mia Peducci",
    base: `${MP}/A Última Carta de Vênus`, chaptersSub: "manuscrito" },
  { titulo: "Enquanto Você Dormia em Lisboa", serie: null, volume: 1, autor: "Mia Peducci",
    base: `${MP}/Enquanto Você Dormia em Lisboa`, chaptersSub: "manuscrito", capaFolder: "Capas", capaPrefer: "BT" },
  { titulo: "Última Chamada para o Embarque", serie: "Última Chamada para o Embarque", volume: 1, autor: "Mia Peducci",
    base: UC, chaptersSub: "manuscrito", capaFile: `${UC}/Capas/1 BR.png` },
  { titulo: "Última Chamada para o Embarque — Vol. 2", serie: "Última Chamada para o Embarque", volume: 2, autor: "Mia Peducci",
    chaptersDir: `${UC}/Livro-II/manuscrito`, fundacaoDir: `${UC}/Livro-II`, capaFile: `${UC}/Capas/2 BR.png` },
  { titulo: "A Casa que Conta", serie: null, volume: 1, autor: "Mia Peducci",
    base: `${MP}/A Casa que Conta`, chaptersSub: "manuscrito", capaFolder: "Capas" },
];

const nat = (a, b) => a.localeCompare(b, "pt", { numeric: true, sensitivity: "base" });
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function resolveObra(o) {
  const base = o.base ?? null;
  const chaptersDir = o.chaptersDir ?? path.join(base, o.chaptersSub ?? "manuscrito");
  const fundacaoDir = o.fundacaoDir ?? base;
  // capítulos
  let caps = [];
  if (exists(chaptersDir)) {
    caps = fs.readdirSync(chaptersDir).filter((f) => f.toLowerCase().endsWith(".md"));
    caps = o.chaptersPattern ? caps.filter((f) => o.chaptersPattern.test(f)) : caps.filter((f) => !EXCLUDE.test(f));
    caps.sort(nat);
  }
  // fundação
  const fund = fundacaoDir ? FUNDACAO.filter((f) => exists(path.join(fundacaoDir, f))) : [];
  // capa
  let capa = null;
  if (o.capaFile && exists(o.capaFile)) capa = o.capaFile;
  else if (o.capaFileName && base && exists(path.join(base, o.capaFileName))) capa = path.join(base, o.capaFileName);
  else if (o.capaFolder && base) {
    const dir = path.join(base, o.capaFolder);
    if (exists(dir)) {
      let imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort(nat);
      if (o.capaPrefer) { const pref = imgs.find((f) => f.toUpperCase().includes(o.capaPrefer.toUpperCase())); if (pref) imgs = [pref]; }
      if (imgs.length) capa = path.join(dir, imgs[0]);
    }
  }
  // epub
  let epub = null;
  if (o.epub && base && exists(path.join(base, o.epub))) epub = path.join(base, o.epub);
  return { chaptersDir, fundacaoDir, caps, fund, capa, epub };
}

const tituloCap = (file, content) => {
  const m = content.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim().slice(0, 200);
  return path.basename(file, ".md").replace(/[-_]+/g, " ").trim().slice(0, 200);
};
const contar = (s) => (s.trim().match(/\S+/g) || []).length;
const ctype = (f) => f.endsWith(".md") ? "text/markdown" : /\.png$/i.test(f) ? "image/png" : /\.jpe?g$/i.test(f) ? "image/jpeg" : /\.webp$/i.test(f) ? "image/webp" : f.endsWith(".epub") ? "application/epub+zip" : "application/octet-stream";

async function up(bucket, key, file, contentType) {
  const buf = fs.readFileSync(file);
  for (let t = 0; t < 2; t++) {
    const { error } = await sb.storage.from(bucket).upload(key, buf, { contentType, upsert: true });
    if (!error) return true;
    if (t === 1) { console.warn(`     ! upload falhou (${bucket}/${key}): ${error.message}`); return false; }
  }
}

async function jaExiste(o) {
  let q = sb.from("projects").select("id").eq("owner", OWNER).eq("titulo", o.titulo).eq("volume", o.volume);
  q = o.serie === null ? q.is("serie", null) : q.eq("serie", o.serie);
  const { data } = await q.limit(1);
  return data?.[0]?.id ?? null;
}

async function importar(o) {
  const r = resolveObra(o);
  const status = r.epub ? "pronto" : r.caps.length ? "revisao" : "rascunho";
  const edStatus = r.epub ? "pronto" : "revisao";
  const tag = `${o.titulo}${o.serie ? ` [${o.serie} v${o.volume}]` : ""}`;
  console.log(`\n• ${tag}\n    capítulos=${r.caps.length}  fundação=${r.fund.length}  capa=${r.capa ? path.basename(r.capa) : "—"}  epub=${r.epub ? path.basename(r.epub) : "—"}  status=${status}`);
  if (!r.caps.length) { console.warn("    ! sem capítulos — pulando"); return { titulo: o.titulo, serie: o.serie, volume: o.volume, caps: 0, capa: !!r.capa, epub: !!r.epub, status: "SKIP(sem caps)" }; }

  if (!APPLY) return { titulo: o.titulo, serie: o.serie, volume: o.volume, caps: r.caps.length, capa: !!r.capa, epub: !!r.epub, status };

  const jaId = await jaExiste(o);
  if (jaId) { console.log("    = já existe no banco — pulando"); return { titulo: o.titulo, serie: o.serie, volume: o.volume, caps: r.caps.length, capa: !!r.capa, epub: !!r.epub, status: "JÁ EXISTE" }; }

  // project + edition
  const { data: proj, error: ep } = await sb.from("projects").insert({
    owner: OWNER, titulo: o.titulo, serie: o.serie, volume: o.volume, genero: o.genero ?? null,
    idioma_origem: "pt-BR", status, total_capitulos: r.caps.length, briefing: { autor: o.autor ?? null, importado: true },
  }).select("id").single();
  if (ep) throw new Error(`project: ${ep.message}`);
  const pid = proj.id;
  const { data: ed, error: ee } = await sb.from("editions").insert({
    owner: OWNER, project_id: pid, idioma: "pt-BR", is_origem: true, status: edStatus,
  }).select("id").single();
  if (ee) throw new Error(`edition: ${ee.message}`);
  const eid = ed.id;

  // capítulos (upload + linha), em lotes
  let okCaps = 0;
  for (let i = 0; i < r.caps.length; i += 8) {
    const lote = r.caps.slice(i, i + 8);
    await Promise.all(lote.map(async (file, j) => {
      const numero = i + j + 1;
      const full = path.join(r.chaptersDir, file);
      const content = fs.readFileSync(full, "utf8");
      const key = `${OWNER}/${pid}/manuscrito/${String(numero).padStart(2, "0")}-${file}`;
      const okUp = await up("manuscritos", key, full, "text/markdown");
      if (!okUp) return;
      const { error } = await sb.from("chapters").insert({
        owner: OWNER, edition_id: eid, numero, titulo: tituloCap(file, content), palavras: contar(content), storage_path: key,
      });
      if (error) { console.warn(`     ! chapter ${numero}: ${error.message}`); return; }
      okCaps++;
    }));
    process.stdout.write(`\r    capítulos: ${okCaps}/${r.caps.length}`);
  }
  process.stdout.write("\n");

  // capa
  if (r.capa) {
    const ext = path.extname(r.capa).toLowerCase() || ".png";
    const key = `${OWNER}/${pid}/capa${ext}`;
    if (await up("capas", key, r.capa, ctype(r.capa)))
      await sb.from("artifacts").insert({ owner: OWNER, edition_id: eid, tipo: "capa", storage_path: key });
  }
  // epub
  if (r.epub) {
    const key = `${OWNER}/${pid}/${path.basename(r.epub)}`;
    if (await up("epubs", key, r.epub, "application/epub+zip"))
      await sb.from("artifacts").insert({ owner: OWNER, edition_id: eid, tipo: "epub", storage_path: key });
  }
  // fundação (só preserva no Storage; sem linha de artifact)
  for (const f of r.fund) {
    await up("manuscritos", `${OWNER}/${pid}/fundacao/${f}`, path.join(r.fundacaoDir, f), "text/markdown");
  }

  console.log(`    ✓ importado (project ${pid}) — ${okCaps} capítulos`);
  return { titulo: o.titulo, serie: o.serie, volume: o.volume, caps: okCaps, capa: !!r.capa, epub: !!r.epub, status };
}

(async () => {
  console.log(APPLY ? "=== IMPORTANDO (apply) ===" : "=== SURVEY (sem gravar) — rode com --apply para valer ===");
  const res = [];
  for (const o of OBRAS) {
    try { res.push(await importar(o)); }
    catch (e) { console.error(`  ✗ ERRO em ${o.titulo}: ${e.message}`); res.push({ titulo: o.titulo, serie: o.serie, volume: o.volume, status: `ERRO: ${e.message}` }); }
  }
  console.log("\n\n===== RESUMO =====");
  for (const r of res) console.log(`${(r.status || "").padEnd(14)} | ${String(r.caps ?? "-").padStart(3)} caps | capa:${r.capa ? "S" : "N"} epub:${r.epub ? "S" : "N"} | ${r.serie ? `[${r.serie} v${r.volume}] ` : ""}${r.titulo}`);
})();
