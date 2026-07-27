// Engine V2 — sincronização hash-bound do manuscrito aprovado para a plataforma
// (editions + chapters + Storage). Fecha a Quebra 3 da auditoria: o livro V2
// passa a existir para Leitor, catálogo, tradução, capa, EPUB e venda.
//
// Mesmo contrato de dados da V1 (jobs.ts::sincronizarAprovados): upsert por
// (edition_id, numero) com text_sha256/palavras/storage_path; SÓ capítulo
// aprovado no estado canônico sobe; Storage primeiro, banco depois; falha de
// rede não derruba o job de escrita (retry + warning). Idempotente: capítulo já
// durável com o mesmo hash é pulado.

import { promises as fs } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import type { EstadoCanonico } from "./tipos.js";

export interface CapituloAprovado {
  numero: number;
  textHash: string;
  palavras?: number;
}

/** Capítulos com aprovação hash-bound no estado canônico (puro; testável). */
export function capitulosAprovados(estado: EstadoCanonico): CapituloAprovado[] {
  const out: CapituloAprovado[] = [];
  for (const [chave, cap] of Object.entries(estado.doc.capitulos ?? {})) {
    const numero = Number(chave);
    if (!Number.isInteger(numero) || numero < 1) continue;
    if (cap.status !== "aprovado" && cap.status !== "aprovado_com_excecao") continue;
    const textHash = cap.aprovacao?.text_hash ?? cap.text_hash;
    if (!textHash) continue; // aprovação sem hash não é evidência — não sobe
    out.push({ numero, textHash, palavras: cap.palavras });
  }
  return out.sort((a, b) => a.numero - b.numero);
}

/** Título = primeiro heading markdown do capítulo (mesma regra da V1). */
export function tituloDoCapitulo(texto: string): string | null {
  return texto.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim() ?? null;
}

function contarPalavras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

/**
 * Garante a edição de ORIGEM do projeto (projects.idioma_origem) e devolve o id.
 * Não rebaixa status: edição existente só avança pendente → escrevendo.
 */
export async function garantirEdicaoOrigem(projectId: string, idioma: string): Promise<string> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data: existente, error } = await sb
    .from("editions")
    .select("id,status,is_origem")
    .eq("owner", OWNER)
    .eq("project_id", projectId)
    .eq("idioma", idioma)
    .maybeSingle();
  if (error) throw new Error(`editions.select (origem ${idioma}): ${error.message}`);
  if (existente) {
    const patch: Record<string, unknown> = {};
    if ((existente as { status?: string }).status === "pendente") patch.status = "escrevendo";
    if (!(existente as { is_origem?: boolean }).is_origem) patch.is_origem = true;
    if (Object.keys(patch).length) {
      await sb.from("editions").update(patch).eq("owner", OWNER).eq("id", (existente as { id: string }).id);
    }
    return (existente as { id: string }).id;
  }
  const { data, error: erroInsert } = await sb
    .from("editions")
    .upsert(
      { owner: OWNER, project_id: projectId, idioma, is_origem: true, status: "escrevendo" },
      { onConflict: "project_id,idioma" }
    )
    .select("id")
    .single();
  if (erroInsert || !data) throw new Error(`editions.upsert (origem ${idioma}): ${erroInsert?.message ?? "sem linha"}`);
  return (data as { id: string }).id;
}

/** Edição concluída pela escrita V2 entra em revisão (nunca rebaixa publicada). */
export async function marcarEdicaoEmRevisao(editionId: string): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  await sb
    .from("editions")
    .update({ status: "revisao" })
    .eq("owner", OWNER)
    .eq("id", editionId)
    .in("status", ["pendente", "escrevendo"]);
}

export interface ResultadoSincronizacao {
  sincronizados: number[];
  removidos: number[];
  avisos: string[];
}

/**
 * Sincroniza TODOS os capítulos aprovados do estado canônico para Storage +
 * chapters, e remove linhas além do total (renumeração/fusão da edição
 * estrutural). Chamável a cada capítulo aprovado — idempotente e barata para
 * capítulos já duráveis. Erros por capítulo viram avisos (a escrita continua).
 */
export async function sincronizarCapitulosAprovados(opts: {
  projectId: string;
  editionId: string;
  dirManuscrito: string;
  estado: EstadoCanonico;
  /** Total vigente (após edição estrutural): linhas com numero > total são removidas. */
  totalFinal?: number;
}): Promise<ResultadoSincronizacao> {
  const { sb, OWNER } = await import("../supabase.js");
  const { storageKey, uploadFile } = await import("../lib.js");
  const aprovados = capitulosAprovados(opts.estado);
  const avisos: string[] = [];
  const sincronizados: number[] = [];

  const { data: rows, error } = await sb
    .from("chapters")
    .select("numero,text_sha256")
    .eq("owner", OWNER)
    .eq("edition_id", opts.editionId);
  if (error) {
    avisos.push(`chapters.select: ${error.message}`);
    return { sincronizados, removidos: [], avisos };
  }
  const hashNoBanco = new Map<number, string | null>(
    (rows ?? []).map((r) => [Number((r as { numero: number }).numero), ((r as { text_sha256?: string }).text_sha256 ?? null)])
  );

  for (const cap of aprovados) {
    if (hashNoBanco.get(cap.numero) === cap.textHash) continue; // já durável com o mesmo hash
    const nn = String(cap.numero).padStart(2, "0");
    const caminho = path.join(opts.dirManuscrito, `capitulo-${nn}.md`);
    try {
      const texto = await fs.readFile(caminho, "utf8");
      const hashDisco = hashText(texto);
      if (hashDisco !== cap.textHash) {
        avisos.push(`cap ${nn}: hash do disco ${hashDisco.slice(0, 12)}… difere do aprovado ${cap.textHash.slice(0, 12)}… — não sincronizado`);
        continue;
      }
      const key = storageKey(opts.projectId, "origem", `capitulo-${nn}.md`);
      await uploadFile("manuscritos", key, caminho); // Storage PRIMEIRO; banco só aponta p/ objeto existente
      let ultimoErro: string | null = null;
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        const { error: erroUpsert } = await sb.from("chapters").upsert(
          {
            owner: OWNER,
            edition_id: opts.editionId,
            numero: cap.numero,
            titulo: tituloDoCapitulo(texto),
            palavras: cap.palavras ?? contarPalavras(texto),
            storage_path: key,
            text_sha256: cap.textHash,
            quality_status: "approved",
            quality_stage: "ENGINE_V2",
            approved_at: new Date().toISOString(),
          },
          { onConflict: "edition_id,numero" }
        );
        if (!erroUpsert) {
          ultimoErro = null;
          break;
        }
        ultimoErro = erroUpsert.message;
        await new Promise((r) => setTimeout(r, 800 * tentativa));
      }
      if (ultimoErro) {
        avisos.push(`cap ${nn}: upsert falhou após 3 tentativas: ${ultimoErro}`);
        continue;
      }
      sincronizados.push(cap.numero);
    } catch (e) {
      avisos.push(`cap ${nn}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Renumeração/fusão: capítulos além do total vigente saem da plataforma.
  const removidos: number[] = [];
  const total = opts.totalFinal ?? opts.estado.doc.total_capitulos ?? 0;
  if (total > 0) {
    const alem = [...hashNoBanco.keys()].filter((n) => n > total);
    if (alem.length) {
      const { error: erroDelete } = await sb
        .from("chapters")
        .delete()
        .eq("owner", OWNER)
        .eq("edition_id", opts.editionId)
        .gt("numero", total);
      if (erroDelete) avisos.push(`chapters.delete (> ${total}): ${erroDelete.message}`);
      else removidos.push(...alem.sort((a, b) => a - b));
    }
  }

  for (const aviso of avisos) console.warn(`[engine-v2/chapters] ${aviso}`);
  return { sincronizados, removidos, avisos };
}
