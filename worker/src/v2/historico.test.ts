// Fatia P — histórico append-only e RLS, em duas camadas:
// (1) COMPORTAMENTO das regras; (2) CONTRATO do SQL que as impõe no banco.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cadeiaDeCorrecoes,
  corrigirEvento,
  eventoVigente,
  podeAlterarReview,
  podeApagarEvento,
  podeAtualizarEvento,
  podeAtualizarPreferencia,
  podeAtualizarRun,
  podeInserirEvento,
  podeLerEvento,
  STATUS_RUN_CONCLUIDO,
  TIPOS_EVENTO,
  type EventoAuditoria,
} from "./historico.js";

const EU = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const PROJ = "8b11072c-097d-4964-8f89-abecb96eb16c";

function evento(over: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    id: "e1",
    owner: EU,
    project_id: PROJ,
    tipo: "capitulo_aprovado",
    capitulo: 3,
    text_hash: "h3",
    payload: { review_id: "r3" },
    criado_em: "2026-07-28T00:00:00.000Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Comportamento
// ---------------------------------------------------------------------------

describe("leitura e escrita de eventos", () => {
  it("o dono lê os próprios eventos", () => {
    expect(podeLerEvento(evento(), { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
  });

  it("outro usuário não lê", () => {
    expect(podeLerEvento(evento(), { uid: OUTRO, donoDoProjeto: EU }).permitido).toBe(false);
  });

  it("o worker anexa eventos novos (é como o histórico cresce)", () => {
    const { id: _i, criado_em: _c, ...novo } = evento();
    expect(podeInserirEvento(novo, { uid: "", donoDoProjeto: null, ehWorker: true }).permitido).toBe(true);
  });

  it("usuário só insere no PRÓPRIO projeto", () => {
    const { id: _i, criado_em: _c, ...novo } = evento();
    expect(podeInserirEvento(novo, { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
    expect(podeInserirEvento(novo, { uid: EU, donoDoProjeto: OUTRO }).permitido).toBe(false);
  });

  it("tipo de evento fora do vocabulário é recusado", () => {
    const { id: _i, criado_em: _c, ...novo } = evento({ tipo: "coisa_qualquer" as never });
    const v = podeInserirEvento(novo, { uid: EU, donoDoProjeto: EU });
    expect(v.permitido).toBe(false);
    expect(v).toMatchObject({ motivo: expect.stringContaining("desconhecido") });
  });

  it("o vocabulário cobre os fatos que a engine produz", () => {
    for (const t of ["capitulo_aprovado", "correcao_tentada", "circuit_breaker", "revalidacao", "premissa_alterada"]) {
      expect(TIPOS_EVENTO).toContain(t);
    }
  });
});

describe("HISTÓRICO PROTEGIDO não aceita update nem delete", () => {
  it("[DOD:P-01] update é recusado — nem para o worker", () => {
    const v = podeAtualizarEvento();
    expect(v.permitido).toBe(false);
    expect(v).toMatchObject({ motivo: expect.stringContaining("corrige_id") });
  });

  it("[DOD:P-01] delete é recusado", () => {
    expect(podeApagarEvento().permitido).toBe(false);
  });

  it("parecer (review) não é reescrito nem apagado", () => {
    expect(podeAlterarReview().permitido).toBe(false);
  });

  it("run CONCLUÍDO é congelado; run em curso ainda aceita update", () => {
    for (const s of STATUS_RUN_CONCLUIDO) expect(podeAtualizarRun(s).permitido).toBe(false);
    expect(podeAtualizarRun("running").permitido).toBe(true);
  });
});

describe("correção gera EVENTO NOVO, não reescreve o anterior", () => {
  it("[DOD:P-02] o evento corrigido referencia o original e o original permanece intacto", () => {
    const original = evento();
    const antes = JSON.stringify(original);
    const correcao = corrigirEvento(original, {
      id: "e2",
      payload: { review_id: "r3", observacao: "hash corrigido após reprocessamento" },
      criado_em: "2026-07-28T01:00:00.000Z",
    });
    expect(correcao.id).toBe("e2");
    expect(correcao.corrige_id).toBe("e1");
    expect(JSON.stringify(original)).toBe(antes);
  });

  it("a cadeia mostra o original e todas as correções, na ordem", () => {
    const e1 = evento();
    const e2 = corrigirEvento(e1, { id: "e2", payload: { v: 2 }, criado_em: "t2" });
    const e3 = corrigirEvento(e2, { id: "e3", payload: { v: 3 }, criado_em: "t3" });
    const cadeia = cadeiaDeCorrecoes([e1, e2, e3], "e1");
    expect(cadeia.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("o valor VIGENTE é o último da cadeia — e o original nunca some", () => {
    const e1 = evento();
    const e2 = corrigirEvento(e1, { id: "e2", payload: { v: 2 }, criado_em: "t2" });
    expect(eventoVigente([e1, e2], "e1")?.id).toBe("e2");
    expect([e1, e2].find((e) => e.id === "e1")).toBeDefined();
  });

  it("evento sem correções é o próprio vigente", () => {
    expect(eventoVigente([evento()], "e1")?.id).toBe("e1");
  });
});

describe("preferência do usuário é MUTÁVEL e separada do histórico", () => {
  const pref = { owner: EU, project_id: PROJ, chave: "mostrar_ledger", valor: { ativo: true } };

  it("o dono do projeto escreve e reescreve à vontade", () => {
    const ctx = { uid: EU, donoDoProjeto: EU };
    expect(podeAtualizarPreferencia(pref, ctx).permitido).toBe(true);
    expect(podeAtualizarPreferencia({ ...pref, valor: { ativo: false } }, ctx).permitido).toBe(true);
  });

  it("não escreve preferência em projeto alheio", () => {
    expect(podeAtualizarPreferencia(pref, { uid: EU, donoDoProjeto: OUTRO }).permitido).toBe(false);
  });

  it("a diferença é o ponto: preferência muda, histórico não", () => {
    expect(podeAtualizarPreferencia(pref, { uid: EU, donoDoProjeto: EU }).permitido).toBe(true);
    expect(podeAtualizarEvento().permitido).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contrato do SQL
// ---------------------------------------------------------------------------

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.resolve(aqui, "../../../supabase/engine_v2_historico.sql"), "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("contrato da migração de histórico", () => {
  it("é aditiva", () => {
    expect(sql).not.toMatch(/drop table/);
    expect(sql).not.toMatch(/drop column/);
  });

  it("eventos: RLS ligada, select e insert por dono do projeto", () => {
    expect(sql).toContain("alter table public.engine_eventos_v2 enable row level security");
    expect(sql).toContain("for select using (auth.uid() = owner)");
    expect(sql).toContain("public.engine_v2_dono_do_projeto(project_id, auth.uid())");
  });

  it("eventos: SEM policy de update e SEM policy de delete", () => {
    expect(sql).not.toMatch(/on public\.engine_eventos_v2 for update/);
    expect(sql).not.toMatch(/on public\.engine_eventos_v2 for delete/);
  });

  it("eventos: triggers barram update e delete mesmo para o service role", () => {
    expect(sql).toContain("create or replace function public.engine_eventos_v2_append_only");
    expect(sql).toContain("before update on public.engine_eventos_v2");
    expect(sql).toContain("before delete on public.engine_eventos_v2");
    expect(sql).toContain("append-only");
  });

  it("correção é encadeada por corrige_id, não sobrescrita", () => {
    expect(sql).toContain("corrige_id");
    expect(sql).toContain("insira outro com corrige_id apontando para ele");
  });

  it("runs concluídos são congelados; reviews são imutáveis", () => {
    expect(sql).toContain("create or replace function public.engine_runs_congelar_concluido");
    expect(sql).toContain("old.status in ('ok', 'falha', 'cancelado')");
    expect(sql).toContain("create or replace function public.engine_reviews_imutavel");
    expect(sql).toContain("before delete on public.engine_reviews");
  });

  it("preferências ficam em OUTRA tabela, essa sim mutável", () => {
    expect(sql).toContain("create table if not exists public.engine_preferencias_v2");
    expect(sql).toContain("on public.engine_preferencias_v2 for all");
  });

  it("exceção administrativa existe, é explícita e exige motivo", () => {
    expect(sql).toContain("create table if not exists public.engine_excecoes_admin_v2");
    expect(sql).toContain("check (length(btrim(motivo)) > 0)");
    expect(sql).toContain("check (length(btrim(autorizada_por)) > 0)");
  });

  it("o vocabulário de tipos do SQL casa com o do código", () => {
    for (const t of TIPOS_EVENTO) expect(sql).toContain(`'${t}'`);
  });
});
