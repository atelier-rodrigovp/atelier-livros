import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.resolve(here, "../../supabase/reliability.sql"), "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("contrato da migração de confiabilidade", () => {
  it("serializa claims concorrentes por projeto e não reivindica job fora do owner", () => {
    expect(sql).toContain("create or replace function public.claim_job");
    expect(sql).toContain("where id = p_job_id and owner = p_owner and status = 'queued'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("owner = p_owner and project_id = v_project and status = 'running'");
    expect(sql).toContain("set status = 'running', locked_by = p_worker, locked_at = now()");
  });

  it("fecha a corrida de enqueue duplicado no banco (índice parcial)", () => {
    expect(sql).toContain("create unique index if not exists jobs_one_queued_per_project_tipo_uidx");
    expect(sql).toContain("where status = 'queued' and project_id is not null");
  });

  it("mantém identidade idempotente dos artefatos de staging", () => {
    expect(sql).toContain("create unique index if not exists artifacts_identity_uidx");
    expect(sql).toContain("on public.artifacts (edition_id, tipo, storage_path)");
    expect(sql).toContain("on conflict (edition_id, tipo, storage_path) do update");
  });

  it("promove capítulos, artefatos, edição e projeto dentro de uma única função", () => {
    expect(sql).toContain("create or replace function public.promote_publication");
    expect(sql).toContain("where id = p_edition_id and project_id = p_project_id and owner = p_owner");
    expect(sql).toContain("on conflict (edition_id, numero) do update");
    expect(sql).toContain("update public.editions set status = 'pronto'");
    expect(sql).toContain("update public.projects set status = 'pronto'");
    expect(sql).toContain("'manifest_id', p_manifest->>'id'");
  });

  it("usa os privilégios do chamador e fixa o search_path", () => {
    expect(sql.match(/security invoker/g)).toHaveLength(3);
    expect(sql.match(/set search_path = public/g)).toHaveLength(3);
  });

  it("guarda no banco: status='pronto' só pela promoção transacional", () => {
    expect(sql).toContain("create or replace function public.guard_edition_pronto");
    expect(sql).toContain("create trigger editions_guard_pronto");
    expect(sql).toContain("current_setting('app.promotion_gate', true)");
    // promote_publication marca a transação ANTES do update de status
    const marca = sql.indexOf("perform set_config('app.promotion_gate', '1', true)");
    const update = sql.indexOf("update public.editions set status = 'pronto'");
    expect(marca).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(marca);
  });
});
