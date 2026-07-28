// D4 — política de acesso das autorizações V2, em duas camadas:
// (1) COMPORTAMENTO das regras (aqui, puro, sem Postgres);
// (2) CONTRATO do SQL: o arquivo de migração expressa as mesmas regras.
// Nenhuma das duas vale sozinha.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_HISTORICOS,
  podeApagar,
  podeAtualizar,
  podeInserir,
  podeLer,
  revogar,
  violaUnicidadeAtiva,
  type LinhaAutorizacao,
} from "./autorizacao-politica.js";

const EU = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const PROJETO = "8b11072c-097d-4964-8f89-abecb96eb16c";

function linha(over: Partial<LinhaAutorizacao> = {}): LinhaAutorizacao {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    owner: EU,
    project_id: PROJETO,
    modo: "producao",
    autorizado_por: "rodrigo",
    motivo: "produção do livro",
    ativo: true,
    created_at: "2026-07-28T00:00:00.000Z",
    revoked_at: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Comportamento
// ---------------------------------------------------------------------------

describe("SELECT — isolamento por proprietário", () => {
  it("o dono lê a própria autorização", () => {
    expect(podeLer(linha(), { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
  });
  it("outro usuário não lê", () => {
    expect(podeLer(linha(), { uid: OUTRO, donoDoProjeto: EU }).permitido).toBe(false);
  });
});

describe("INSERT — owner tem de ser o DONO DO PROJETO", () => {
  it("dono do projeto autoriza o próprio projeto", () => {
    const { id: _i, ...nova } = linha();
    expect(podeInserir(nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
  });

  it("REJEITA autorizar projeto de outra pessoa em nome próprio", () => {
    // O buraco que `owner = auth.uid()` sozinho deixava aberto.
    const { id: _i, ...nova } = linha({ owner: EU, project_id: PROJETO });
    const v = podeInserir(nova, { uid: EU, donoDoProjeto: OUTRO });
    expect(v.permitido).toBe(false);
    expect(v).toMatchObject({ motivo: expect.stringContaining("não é o dono do projeto") });
  });

  it("rejeita owner diferente do usuário autenticado", () => {
    const { id: _i, ...nova } = linha({ owner: OUTRO });
    expect(podeInserir(nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("rejeita projeto inexistente", () => {
    const { id: _i, ...nova } = linha();
    expect(podeInserir(nova, { uid: EU, donoDoProjeto: null }).permitido).toBe(false);
  });

  it("autorização nasce ATIVA — inserir já revogada suja a trilha", () => {
    const { id: _i, ...nova } = linha({ ativo: false, revoked_at: "2026-07-28T01:00:00.000Z" });
    expect(podeInserir(nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("rejeita autorizado_por ou motivo vazios (auditoria sem conteúdo não é auditoria)", () => {
    const semQuem = linha({ autorizado_por: "   " });
    const semPorque = linha({ motivo: "" });
    const { id: _a, ...a } = semQuem;
    const { id: _b, ...b } = semPorque;
    expect(podeInserir(a, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
    expect(podeInserir(b, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("no máximo uma autorização ATIVA por projeto", () => {
    expect(violaUnicidadeAtiva([linha()], { project_id: PROJETO })).toBe(true);
    expect(violaUnicidadeAtiva([linha({ ativo: false, revoked_at: "x" })], { project_id: PROJETO })).toBe(false);
  });
});

describe("UPDATE — revogar sem reescrever", () => {
  it("revogação é permitida e é a ÚNICA transição", () => {
    const antiga = linha();
    const nova = revogar(antiga, "2026-07-28T02:00:00.000Z");
    expect(podeAtualizar(antiga, nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
  });

  it("TODO campo histórico é imutável", () => {
    const antiga = linha();
    for (const campo of CAMPOS_HISTORICOS) {
      const nova = revogar({ ...antiga, [campo]: "adulterado" } as LinhaAutorizacao, "2026-07-28T02:00:00.000Z");
      const v = podeAtualizar(antiga, nova, { uid: EU, donoDoProjeto: EU });
      expect(v.permitido, `campo ${campo} deveria ser imutável`).toBe(false);
      expect(v).toMatchObject({ motivo: expect.stringContaining(campo) });
    }
  });

  it("não dá para promover canário a produção editando a linha", () => {
    const antiga = linha({ modo: "canario" });
    const nova = revogar({ ...antiga, modo: "producao" }, "2026-07-28T02:00:00.000Z");
    expect(podeAtualizar(antiga, nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("reativar uma autorização revogada é proibido", () => {
    const antiga = linha({ ativo: false, revoked_at: "2026-07-28T02:00:00.000Z" });
    const nova = { ...antiga, ativo: true, revoked_at: null };
    expect(podeAtualizar(antiga, nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("revogar sem carimbar revoked_at é proibido (estado ambíguo)", () => {
    const antiga = linha();
    const nova = { ...antiga, ativo: false, revoked_at: null };
    expect(podeAtualizar(antiga, nova, { uid: EU, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("usuário autenticado não altera autorização de outro", () => {
    const antiga = linha();
    expect(podeAtualizar(antiga, revogar(antiga, "x"), { uid: OUTRO, donoDoProjeto: EU }).permitido).toBe(false);
  });
});

describe("DELETE — histórico não é apagado", () => {
  it("sempre recusado", () => {
    expect(podeApagar().permitido).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contrato do SQL — o arquivo de migração expressa as MESMAS regras
// ---------------------------------------------------------------------------

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.resolve(aqui, "../../../supabase/engine_v2_autorizacoes.sql"), "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("contrato da migração de autorizações", () => {
  it("é aditiva: nenhum drop de tabela nem alteração destrutiva de coluna", () => {
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toMatch(/drop column/);
    expect(sql).not.toMatch(/alter column .* type/);
  });

  it("o INSERT exige que o usuário seja dono do projeto", () => {
    expect(sql).toContain("create or replace function public.engine_v2_dono_do_projeto");
    expect(sql).toContain("where p.id = p_project and p.owner = p_owner");
    expect(sql).toContain("public.engine_v2_dono_do_projeto(project_id, auth.uid())");
  });

  it("o INSERT exige autorização nascendo ativa e sem revogação", () => {
    expect(sql).toContain("and ativo and revoked_at is null");
  });

  it("o UPDATE só permite a revogação", () => {
    expect(sql).toContain("for update using (auth.uid() = owner and ativo)");
    expect(sql).toContain("with check (auth.uid() = owner and not ativo and revoked_at is not null)");
  });

  it("um trigger torna os campos históricos imutáveis mesmo para o service role", () => {
    expect(sql).toContain("create or replace function public.engine_autorizacoes_v2_imutavel");
    for (const campo of CAMPOS_HISTORICOS) {
      expect(sql, `campo ${campo} precisa estar protegido no trigger`).toContain(`new.${campo}`);
    }
    expect(sql).toContain("campos históricos são imutáveis");
    expect(sql).toContain("before update on public.engine_autorizacoes_v2");
  });

  it("delete é bloqueado por trigger, não só pela ausência de policy", () => {
    expect(sql).toContain("create or replace function public.engine_autorizacoes_v2_sem_delete");
    expect(sql).toContain("before delete on public.engine_autorizacoes_v2");
    expect(sql).not.toMatch(/for delete using/);
  });

  it("o par (ativo, revoked_at) é coerente por constraint", () => {
    expect(sql).toContain("engine_autorizacoes_v2_revogacao_coerente");
    expect(sql).toContain("(ativo and revoked_at is null) or (not ativo and revoked_at is not null)");
  });

  it("no máximo uma autorização ativa por projeto", () => {
    expect(sql).toContain("create unique index if not exists engine_autorizacoes_v2_projeto_ativo");
    expect(sql).toContain("where ativo");
  });

  it("RLS ligada e isolamento por proprietário", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select using (auth.uid() = owner)");
  });

  it("auditoria sem conteúdo é barrada no schema", () => {
    expect(sql).toContain("check (length(btrim(autorizado_por)) > 0)");
    expect(sql).toContain("check (length(btrim(motivo)) > 0)");
  });
});
