// Engine V2 — persistência do estado canônico (Supabase com fallback em disco).
// Semântica de versão otimista: o chamador entrega o EstadoCanonico com a versão
// LIDA (0 = nunca persistido); gravarEstado grava versao+1 e, no sucesso, atualiza
// estado.versao em memória. Versão divergente no destino => ErroConcorrencia.
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EstadoCanonico, ReviewRegistro, RunRegistro, SpecRegistro } from "./tipos.js";

/** Tabelas da engine V2 ainda não criadas no banco (DDL manual pendente). */
export class TabelasV2AusentesError extends Error {
  constructor(detalhe: string) {
    super(
      `Tabelas da Engine V2 ausentes no banco (${detalhe}). ` +
        `Aplique supabase/engine_v2.sql no SQL Editor do dashboard Supabase.`
    );
    this.name = "TabelasV2AusentesError";
  }
}

/** Gravação otimista falhou: a versão no destino não é a esperada. */
export class ErroConcorrencia extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroConcorrencia";
  }
}

export interface PersistenciaV2 {
  /** Insere um run e retorna o id. */
  inserirRun(run: RunRegistro): Promise<string>;
  atualizarRun(id: string, patch: Partial<RunRegistro>): Promise<void>;
  inserirReview(review: ReviewRegistro): Promise<string>;
  inserirSpec(spec: SpecRegistro): Promise<string>;
  /** Maior versão de spec já persistida para (projeto, capítulo); 0 se nenhuma. */
  maiorVersaoSpec(projectId: string, capitulo: number): Promise<number>;
  lerEstado(projectId: string): Promise<EstadoCanonico | null>;
  /** Grava com versao+1 (optimistic lock); ErroConcorrencia se a versão esperada divergir. */
  gravarEstado(estado: EstadoCanonico): Promise<void>;
  disponivel(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Supabase (produção pós-DDL)
// ---------------------------------------------------------------------------

/** Erro PostgREST de tabela inexistente (DDL não aplicada). */
function tabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return (
    erro.code === "42P01" ||
    erro.code === "PGRST205" ||
    (erro.message ?? "").includes("Could not find the table")
  );
}

export class SupabasePersistencia implements PersistenciaV2 {
  // Import tardio: módulos que só usam DiscoPersistencia (testes) não exigem .env.
  private async cliente() {
    const { sb, OWNER } = await import("../supabase.js");
    return { sb, OWNER };
  }

  private conferir(erro: { code?: string; message?: string } | null, contexto: string): void {
    if (!erro) return;
    if (tabelaAusente(erro)) throw new TabelasV2AusentesError(contexto);
    throw new Error(`${contexto}: ${erro.message ?? JSON.stringify(erro)}`);
  }

  async inserirRun(run: RunRegistro): Promise<string> {
    const { sb, OWNER } = await this.cliente();
    const { data, error } = await sb
      .from("engine_runs")
      .insert({ ...run, owner: OWNER })
      .select("id")
      .single();
    this.conferir(error, "engine_runs.insert");
    return (data as { id: string }).id;
  }

  async atualizarRun(id: string, patch: Partial<RunRegistro>): Promise<void> {
    const { sb, OWNER } = await this.cliente();
    const { error } = await sb.from("engine_runs").update(patch).eq("id", id).eq("owner", OWNER);
    this.conferir(error, "engine_runs.update");
  }

  async inserirReview(review: ReviewRegistro): Promise<string> {
    const { sb, OWNER } = await this.cliente();
    const { data, error } = await sb
      .from("engine_reviews")
      .insert({ ...review, owner: OWNER })
      .select("id")
      .single();
    this.conferir(error, "engine_reviews.insert");
    return (data as { id: string }).id;
  }

  async inserirSpec(spec: SpecRegistro): Promise<string> {
    const { sb, OWNER } = await this.cliente();
    const { data, error } = await sb
      .from("engine_scene_specs")
      .insert({ ...spec, owner: OWNER })
      .select("id")
      .single();
    this.conferir(error, "engine_scene_specs.insert");
    return (data as { id: string }).id;
  }

  async maiorVersaoSpec(projectId: string, capitulo: number): Promise<number> {
    const { sb, OWNER } = await this.cliente();
    const { data, error } = await sb
      .from("engine_scene_specs")
      .select("versao")
      .eq("project_id", projectId)
      .eq("capitulo", capitulo)
      .eq("owner", OWNER)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();
    this.conferir(error, "engine_scene_specs.select");
    return (data as { versao: number } | null)?.versao ?? 0;
  }

  async lerEstado(projectId: string): Promise<EstadoCanonico | null> {
    const { sb, OWNER } = await this.cliente();
    const { data, error } = await sb
      .from("engine_state")
      .select("project_id, engine_version, versao, doc, updated_at")
      .eq("project_id", projectId)
      .eq("owner", OWNER)
      .maybeSingle();
    this.conferir(error, "engine_state.select");
    return (data as EstadoCanonico | null) ?? null;
  }

  async gravarEstado(estado: EstadoCanonico): Promise<void> {
    const { sb, OWNER } = await this.cliente();
    const proxima = estado.versao + 1;
    if (estado.versao === 0) {
      // Insert inicial: só quando a linha não existe; conflito de chave = corrida perdida.
      const { error } = await sb.from("engine_state").insert({
        project_id: estado.project_id,
        owner: OWNER,
        engine_version: estado.engine_version,
        versao: proxima,
        doc: estado.doc,
      });
      if (error && error.code === "23505") {
        throw new ErroConcorrencia(`engine_state já existe para ${estado.project_id} (insert inicial perdeu a corrida)`);
      }
      this.conferir(error, "engine_state.insert");
    } else {
      const { data, error } = await sb
        .from("engine_state")
        .update({ engine_version: estado.engine_version, versao: proxima, doc: estado.doc })
        .eq("project_id", estado.project_id)
        .eq("owner", OWNER)
        .eq("versao", estado.versao)
        .select("project_id");
      this.conferir(error, "engine_state.update");
      if (!data || data.length === 0) {
        throw new ErroConcorrencia(
          `engine_state de ${estado.project_id}: versão esperada ${estado.versao} não encontrada (gravação concorrente)`
        );
      }
    }
    estado.versao = proxima;
  }

  async disponivel(): Promise<boolean> {
    const { sb, OWNER } = await this.cliente();
    const { error } = await sb.from("engine_state").select("project_id").eq("owner", OWNER).limit(1);
    this.conferir(error, "engine_state.probe");
    return true;
  }
}

// ---------------------------------------------------------------------------
// Disco (fallback pré-DDL + testes) — grava em <dir>/engine-v2/
// ---------------------------------------------------------------------------

type LinhaJsonl =
  | { op: "insert"; registro: Record<string, unknown> }
  | { op: "update"; id: string; patch: Record<string, unknown> };

export class DiscoPersistencia implements PersistenciaV2 {
  private readonly base: string;

  constructor(dirProjeto: string) {
    this.base = path.join(dirProjeto, "engine-v2");
  }

  private caminho(nome: string): string {
    mkdirSync(this.base, { recursive: true });
    return path.join(this.base, nome);
  }

  private anexar(arquivo: string, linha: LinhaJsonl): void {
    appendFileSync(this.caminho(arquivo), JSON.stringify(linha) + "\n", "utf8");
  }

  /** Gravação atômica: escreve em .tmp e renomeia por cima. */
  private gravarAtomico(arquivo: string, conteudo: string): void {
    const destino = this.caminho(arquivo);
    const tmp = `${destino}.tmp`;
    writeFileSync(tmp, conteudo, "utf8");
    renameSync(tmp, destino);
  }

  private lerJsonl(arquivo: string): LinhaJsonl[] {
    const destino = path.join(this.base, arquivo);
    if (!existsSync(destino)) return [];
    return readFileSync(destino, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as LinhaJsonl);
  }

  async inserirRun(run: RunRegistro): Promise<string> {
    const id = run.id ?? randomUUID();
    this.anexar("runs.jsonl", { op: "insert", registro: { ...run, id } });
    return id;
  }

  async atualizarRun(id: string, patch: Partial<RunRegistro>): Promise<void> {
    this.anexar("runs.jsonl", { op: "update", id, patch: patch as Record<string, unknown> });
  }

  /** Reconstrói os runs a partir do jsonl (insert + updates aplicados em ordem). */
  async lerRuns(): Promise<RunRegistro[]> {
    const porId = new Map<string, RunRegistro>();
    for (const linha of this.lerJsonl("runs.jsonl")) {
      if (linha.op === "insert") {
        const registro = linha.registro as unknown as RunRegistro;
        porId.set(registro.id!, registro);
      } else {
        const atual = porId.get(linha.id);
        if (atual) porId.set(linha.id, { ...atual, ...(linha.patch as Partial<RunRegistro>) });
      }
    }
    return [...porId.values()];
  }

  async inserirReview(review: ReviewRegistro): Promise<string> {
    const id = review.id ?? randomUUID();
    this.anexar("reviews.jsonl", { op: "insert", registro: { ...review, id } });
    return id;
  }

  async inserirSpec(spec: SpecRegistro): Promise<string> {
    const id = spec.id ?? randomUUID();
    this.anexar("specs.jsonl", { op: "insert", registro: { ...spec, id } });
    return id;
  }

  async maiorVersaoSpec(projectId: string, capitulo: number): Promise<number> {
    let maior = 0;
    for (const linha of this.lerJsonl("specs.jsonl")) {
      if (linha.op !== "insert") continue;
      const r = linha.registro as { project_id?: string; capitulo?: number; versao?: number };
      if (r.project_id === projectId && r.capitulo === capitulo && typeof r.versao === "number" && r.versao > maior) {
        maior = r.versao;
      }
    }
    return maior;
  }

  async lerEstado(projectId: string): Promise<EstadoCanonico | null> {
    const destino = path.join(this.base, "estado.json");
    if (!existsSync(destino)) return null;
    const estado = JSON.parse(readFileSync(destino, "utf8")) as EstadoCanonico;
    return estado.project_id === projectId ? estado : null;
  }

  async gravarEstado(estado: EstadoCanonico): Promise<void> {
    const atual = await this.lerEstado(estado.project_id);
    const versaoNoDisco = atual?.versao ?? 0;
    if (versaoNoDisco !== estado.versao) {
      throw new ErroConcorrencia(
        `estado.json de ${estado.project_id}: versão esperada ${estado.versao}, no disco ${versaoNoDisco}`
      );
    }
    const proxima = estado.versao + 1;
    this.gravarAtomico(
      "estado.json",
      JSON.stringify({ ...estado, versao: proxima, updated_at: new Date().toISOString() }, null, 2)
    );
    estado.versao = proxima;
  }

  async disponivel(): Promise<boolean> {
    mkdirSync(this.base, { recursive: true });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Fábrica: Supabase quando as tabelas existem; disco enquanto a DDL não roda
// ---------------------------------------------------------------------------

export interface PersistenciaCriada {
  persistencia: PersistenciaV2;
  /** true = tabelas V2 ausentes; operando em disco até a migração (UI mostra aviso). */
  migracaoPendente: boolean;
}

export async function criarPersistencia(opts: { dirProjeto: string }): Promise<PersistenciaCriada> {
  const supa = new SupabasePersistencia();
  try {
    await supa.disponivel();
    return { persistencia: supa, migracaoPendente: false };
  } catch (e) {
    if (!(e instanceof TabelasV2AusentesError)) throw e;
    console.warn(
      `[engine-v2] ${e.message} Operando em fallback de disco (${path.join(opts.dirProjeto, "engine-v2")}) até a migração.`
    );
    return { persistencia: new DiscoPersistencia(opts.dirProjeto), migracaoPendente: true };
  }
}
