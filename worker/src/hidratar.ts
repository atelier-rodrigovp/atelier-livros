// Hidratação do WORK_DIR a partir do banco/Storage para LIVROS IMPORTADOS.
//
// Os importadores (scripts/importar-*.mjs) gravam em `projects`/`editions`/`chapters`
// (banco) e no Storage (`<owner>/<id>/manuscrito/NN-*.md`, `<id>/fundacao/*`), mas NÃO
// escrevem no WORK_DIR nem criam ESTADO_LIVRO.json. O worker lê "a verdade do disco"
// (chaptersOnDisk/readState no WORK_DIR) e nunca baixa do Storage → o app (lê o banco)
// mostra 32/32 e avaliar/refinar (leem o disco) veem 0/32 / "fundação ausente".
//
// hidratarWorkDir baixa os capítulos no layout do runner (capitulo-NN.md), baixa a
// fundação (se houver no Storage), semeia ESTADO_LIVRO.json e consolida o MESTRE.
// Idempotente: não rebaixa o que já tem conteúdo no disco, não duplica, não sobrescreve.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sb, OWNER } from "./supabase.js";
import { projDir, exists } from "./lib.js";

// ---- helpers puros (testáveis) -------------------------------------------
export function destinoCapitulo(numero: number): string {
  return `capitulo-${String(numero).padStart(2, "0")}.md`;
}

export interface ProjInfoHidratar {
  titulo: string;
  total_capitulos: number | null;
  skill_escrita: string | null;
  meta_nota: number | null;
  piso_palavras: number | null;
}

// ESTADO_LIVRO.json sintético: livro completo (todos os capítulos no disco) nasce em
// fase CONCLUIDO — evita que refinar/escrever o trate como parcial e reescreva à toa.
export function sintetizarEstado(proj: ProjInfoHidratar, nCapsDisco: number) {
  const total = Number(proj.total_capitulos ?? nCapsDisco) || nCapsDisco;
  const completo = nCapsDisco > 0 && nCapsDisco >= total;
  return {
    titulo: proj.titulo,
    total_capitulos_previstos: total,
    skill_escrita: proj.skill_escrita ?? null,
    fase_atual: completo ? "CONCLUIDO" : "ESCRITA",
    gerar_epub: true,
    meta_nota: Number(proj.meta_nota ?? 9.0),
    piso_palavras_cap: Number(proj.piso_palavras ?? 1400),
    importado: true,
  };
}

const FUND_ESSENCIAL = ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "perfil-de-voz.md"];
export function temFundacaoCompleta(arquivos: string[]): boolean {
  return FUND_ESSENCIAL.every((f) => arquivos.includes(f));
}

// ---- IO injetável (real = Supabase; fake nos testes) ---------------------
export interface HidratarIO {
  listarChapters(projectId: string): Promise<{ numero: number; storage_path: string }[]>;
  getProjeto(projectId: string): Promise<ProjInfoHidratar | null>;
  listarFundacao(projectId: string): Promise<string[]>;
  baixar(key: string): Promise<Buffer | null>;
  dir(projectId: string): string;
}

export function ioReal(): HidratarIO {
  return {
    async listarChapters(projectId) {
      const { data: eds } = await sb.from("editions").select("id,is_origem").eq("owner", OWNER).eq("project_id", projectId);
      const orig = (eds ?? []).find((e: any) => e.is_origem) ?? (eds ?? [])[0];
      if (!orig) return [];
      const { data } = await sb.from("chapters").select("numero,storage_path").eq("owner", OWNER).eq("edition_id", (orig as any).id).order("numero");
      return (data ?? [])
        .filter((c: any) => c.storage_path && c.numero != null)
        .map((c: any) => ({ numero: Number(c.numero), storage_path: String(c.storage_path) }));
    },
    async getProjeto(projectId) {
      const { data } = await sb.from("projects").select("titulo,total_capitulos,skill_escrita,meta_nota,piso_palavras").eq("owner", OWNER).eq("id", projectId).maybeSingle();
      return (data as any) ?? null;
    },
    async listarFundacao(projectId) {
      const { data } = await sb.storage.from("manuscritos").list(`${OWNER}/${projectId}/fundacao`, { limit: 100 });
      return (data ?? []).map((o: any) => o.name).filter((n: string) => /\.(md|json)$/i.test(n));
    },
    async baixar(key) {
      const { data, error } = await sb.storage.from("manuscritos").download(key);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    dir: (projectId) => projDir(projectId),
  };
}

async function temConteudo(p: string): Promise<boolean> {
  try {
    return (await readFile(p, "utf8")).trim().length > 0;
  } catch {
    return false;
  }
}

export interface Hidratacao {
  capitulos: number;       // capitulo-NN.md no disco após hidratar
  baixados: number;        // quantos foram efetivamente baixados neste run
  fundacao: string[];      // arquivos de fundação no Storage
  temFundacao: boolean;    // Biblia+Estrutura+perfil presentes
  estadoSemeado: boolean;  // ESTADO_LIVRO.json sintetizado agora
  mestre: boolean;         // MANUSCRITO-MESTRE.md presente/consolidado
}

export async function hidratarWorkDir(projectId: string, io: HidratarIO = ioReal()): Promise<Hidratacao> {
  const dir = io.dir(projectId);
  const manus = path.join(dir, "manuscrito");
  await mkdir(manus, { recursive: true });

  // 1) Capítulos: baixa por `numero` do banco → capitulo-NN.md (layout do runner).
  const chs = (await io.listarChapters(projectId)).slice().sort((a, b) => a.numero - b.numero);
  let baixados = 0;
  for (const c of chs) {
    const dest = path.join(manus, destinoCapitulo(c.numero));
    if (await temConteudo(dest)) continue; // idempotente: não rebaixa
    const buf = await io.baixar(c.storage_path);
    if (!buf) continue;
    await writeFile(dest, buf);
    baixados++;
  }

  // 2) Fundação (se existir no Storage) → raiz do projeto.
  const fundNomes = await io.listarFundacao(projectId);
  for (const nome of fundNomes) {
    const dest = path.join(dir, nome);
    if (await temConteudo(dest)) continue;
    const buf = await io.baixar(`${OWNER}/${projectId}/fundacao/${nome}`);
    if (buf) await writeFile(dest, buf);
  }

  // 3) Contagem real no disco.
  const arquivos = await readdir(manus).catch(() => [] as string[]);
  const capsDisco = arquivos.filter((f) => /^capitulo-\d{2}\.md$/.test(f)).sort();
  const nCaps = capsDisco.length;

  // 4) ESTADO_LIVRO.json — semeia se ausente (não sobrescreve fundação baixada).
  const estadoPath = path.join(dir, "ESTADO_LIVRO.json");
  let estadoSemeado = false;
  if (!(await exists(estadoPath))) {
    const proj = await io.getProjeto(projectId);
    if (proj) {
      await writeFile(estadoPath, JSON.stringify(sintetizarEstado(proj, nCaps), null, 2) + "\n", "utf8");
      estadoSemeado = true;
    }
  }

  // 5) MANUSCRITO-MESTRE.md — consolida do disco se ausente (avaliar/epub leem o MESTRE).
  const mestrePath = path.join(manus, "MANUSCRITO-MESTRE.md");
  let mestre = await exists(mestrePath);
  if (!mestre && nCaps > 0) {
    const partes: string[] = [];
    for (const f of capsDisco) partes.push((await readFile(path.join(manus, f), "utf8")).trim());
    await writeFile(mestrePath, partes.join("\n\n---\n\n") + "\n", "utf8");
    mestre = true;
  }

  return {
    capitulos: nCaps,
    baixados,
    fundacao: fundNomes,
    temFundacao: temFundacaoCompleta(fundNomes),
    estadoSemeado,
    mestre,
  };
}
