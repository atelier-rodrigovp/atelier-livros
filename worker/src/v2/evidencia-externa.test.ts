// Testes do VALIDADOR. A geração fica em `gerador-evidencia.test.ts`; aqui o
// alvo é só a pergunta "este documento certifica?" — e a resposta precisa ser
// "não" em toda variação plausível de documento bem formado porém falso.

import { describe, expect, it } from "vitest";
import {
  SCHEMA_EVIDENCIA,
  TIPOS_COM_ARTEFATO,
  TIPOS_COM_REMOTO,
  hashIntrospeccao,
  validarEvidencia,
  type EsperadoEvidencia,
  type EvidenciaExterna,
  type FingerprintsCodigo,
} from "./evidencia-externa.js";
import { PAPEIS_ENGINE_V2 } from "./tipos.js";

const FP: FingerprintsCodigo = {
  migrations_source_hash: "mig-1",
  contratos_hash: "ctr-1",
  worker_hash: "wrk-1",
  interface_hash: "ui-1",
};

const REF = "projref123";

const ESPERADO: EsperadoEvidencia = {
  tipo: "integracao_real",
  ambiente: "producao",
  supabase_project_ref: REF,
  fingerprints: FP,
};

const introspeccao = {
  migrations_applied: ["engine_v2_historico.sql"],
  tabelas: ["engine_eventos_v2"],
  columns: ["public.projects.briefing_aprovado:jsonb"],
  constraints: ["public.projects.projects_briefing_aprovado_schema:check"],
  policies: ["engine_eventos_v2_select"],
  triggers: ["engine_eventos_v2_sem_update"],
  indexes: ["engine_eventos_v2_projeto"],
};

function evidencia(over: Partial<EvidenciaExterna> = {}): EvidenciaExterna {
  return {
    schema: SCHEMA_EVIDENCIA,
    tipo: "integracao_real",
    executado_em: "2026-07-28T12:00:00.000Z",
    ambiente: "producao",
    supabase_project_ref: REF,
    project_id: "proj-teste",
    executor_ref: "owner-hash-9f2",
    tested_code_commit: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    worktree_limpa: true,
    fingerprints: { ...FP },
    remoto: { ...introspeccao, remote_schema_hash: hashIntrospeccao(introspeccao) },
    passos: [{ passo: "upload ao Storage", comando: "node subir.mjs", exit_code: 0, resultado: "aprovado", log: "200 OK" }],
    artefatos: [{ nome: "estrutura.json", hash: "h-estrutura", bytes: 812 }],
    erros: [],
    resultado: "aprovado",
    ...over,
  };
}

const UUIDS = PAPEIS_ENGINE_V2.map((_, i) => `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000000`);
const PROJETO_PROVA = "99999999-0000-4000-8000-000000000000";

function execucoesReais() {
  const papeis = PAPEIS_ENGINE_V2.map((papel, i) => ({
    papel,
    run_id: UUIDS[i],
    project_id: papel === "revisor_literario" || papel === "revisor_decisao" ? PROJETO_PROVA : `77777777-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    alvo: papel === "revisor_literario" || papel === "revisor_decisao" ? "pre-canary:sha" : `historico:${papel}`,
    status: "ok" as const,
    model_provider: "claude-code-cli",
    model_name: "claude-sonnet-5",
    parent_run_id: papel === "revisor_decisao" ? UUIDS[PAPEIS_ENGINE_V2.indexOf("revisor_literario")] : null,
    output_hash: "a".repeat(64),
    started_at: "2026-08-01T12:00:00.000Z",
    finished_at: "2026-08-01T12:01:00.000Z",
  }));
  return {
    papeis,
    cascata: {
      project_id: PROJETO_PROVA,
      alvo: "pre-canary:sha",
      triagem_run_id: UUIDS[PAPEIS_ENGINE_V2.indexOf("revisor_literario")],
      decisao_run_id: UUIDS[PAPEIS_ENGINE_V2.indexOf("revisor_decisao")],
      gatilho: "(d) triagem vai fechar",
      veredito_triagem: "aprovado",
      veredito_consolidado: "aprovado",
    },
  };
}

describe("evidência completa e atual", () => {
  it("vale quando tudo confere", () => {
    expect(validarEvidencia(evidencia(), ESPERADO)).toEqual({ valida: true, motivos: [] });
  });

  it("não certifica schema remoto sem colunas e constraints introspectadas", () => {
    const semColunas = { ...introspeccao, columns: [], constraints: [] };
    const resultado = validarEvidencia(
      evidencia({
        remoto: {
          ...semColunas,
          remote_schema_hash: hashIntrospeccao(semColunas),
        },
      }),
      ESPERADO
    );
    expect(resultado.valida).toBe(false);
    expect(resultado.motivos).toContain("nenhuma coluna observada");
    expect(resultado.motivos).toContain("nenhuma constraint observada");
  });
});

describe("o vínculo é com o CÓDIGO, não com o commit corrente", () => {
  it("commit diferente do HEAD atual NÃO invalida — é o ponto do modelo v2", () => {
    // A v1 exigia igualdade com o HEAD e por isso se autodestruía: commitar a
    // própria evidência criava um commit novo e a invalidava.
    const r = validarEvidencia(evidencia({ tested_code_commit: "f".repeat(40) }), ESPERADO);
    expect(r.valida).toBe(true);
  });

  const campos: (keyof FingerprintsCodigo)[] = [
    "migrations_source_hash",
    "contratos_hash",
    "worker_hash",
    "interface_hash",
  ];
  for (const campo of campos) {
    it(`mudança em ${campo} invalida a evidência dependente`, () => {
      const r = validarEvidencia(evidencia(), { ...ESPERADO, fingerprints: { ...FP, [campo]: "outro" } });
      expect(r.valida).toBe(false);
      expect(r.motivos.join(" ")).toContain(campo);
    });
  }

  it("fingerprint faltando invalida", () => {
    const fp = { ...FP } as Partial<FingerprintsCodigo>;
    delete fp.worker_hash;
    const r = validarEvidencia(evidencia({ fingerprints: fp as FingerprintsCodigo }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("worker_hash ausente");
  });
});

describe("escopo: ambiente, tipo, schema e projeto", () => {
  it("ambiente diferente não vale (local não certifica produção)", () => {
    const r = validarEvidencia(evidencia({ ambiente: "local" }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("ambiente local");
  });

  it("tipo diferente não atesta a garantia pedida", () => {
    expect(validarEvidencia(evidencia({ tipo: "provedor_real" }), ESPERADO).valida).toBe(false);
  });

  it("schema desconhecido não vale", () => {
    expect(validarEvidencia(evidencia({ schema: "outro/v9" as never }), ESPERADO).valida).toBe(false);
  });

  it("projeto Supabase diferente é recusado", () => {
    const r = validarEvidencia(evidencia({ supabase_project_ref: "outro-projeto" }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("projeto Supabase");
  });

  it("evidência ausente não vale", () => {
    expect(validarEvidencia(null, ESPERADO).valida).toBe(false);
  });
});

describe("execução precisa deixar rastro", () => {
  it("sem passos não comprova execução", () => {
    const r = validarEvidencia(evidencia({ passos: [] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não comprova execução");
  });

  it("passo sem log não comprova execução", () => {
    const r = validarEvidencia(
      evidencia({ passos: [{ passo: "upload", exit_code: 0, resultado: "aprovado", log: "" }] }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("sem log");
  });

  it("exit_code diferente de zero não aprova, mesmo com resultado 'aprovado'", () => {
    const r = validarEvidencia(
      evidencia({ passos: [{ passo: "upload", exit_code: 1, resultado: "aprovado", log: "erro" }] }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("exit_code 1");
  });

  it("exit_code null (processo nem existiu) não aprova", () => {
    const r = validarEvidencia(
      evidencia({ passos: [{ passo: "upload", exit_code: null, resultado: "aprovado", log: "spawn falhou" }] }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
  });

  it("HEAD que não é SHA não certifica", () => {
    const r = validarEvidencia(evidencia({ tested_code_commit: "desconhecido" }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não é um SHA");
  });

  it("worktree suja declarada não certifica", () => {
    expect(validarEvidencia(evidencia({ worktree_limpa: false }), ESPERADO).valida).toBe(false);
  });
});

describe("falha não vira aprovação", () => {
  it("resultado reprovado não aprova", () => {
    expect(validarEvidencia(evidencia({ resultado: "reprovado" }), ESPERADO).valida).toBe(false);
  });

  it("um passo reprovado derruba a evidência inteira", () => {
    const r = validarEvidencia(
      evidencia({
        passos: [
          { passo: "upload", exit_code: 0, resultado: "aprovado", log: "ok" },
          { passo: "download", exit_code: 4, resultado: "reprovado", log: "404" },
        ],
      }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("download");
  });

  it("erro registrado impede aprovação mesmo com resultado 'aprovado'", () => {
    const r = validarEvidencia(evidencia({ erros: ["timeout no bucket"] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("erro(s) registrados");
  });
});

describe("hash local não passa por schema remoto", () => {
  it("todo tipo que toca o banco exige introspecção", () => {
    for (const tipo of TIPOS_COM_REMOTO) {
      const r = validarEvidencia(evidencia({ tipo, remoto: null }), { ...ESPERADO, tipo });
      expect(r.valida, tipo).toBe(false);
      expect(r.motivos.join(" ")).toContain("introspecção");
    }
  });

  it("remote_schema_hash igual ao das fontes locais é denunciado", () => {
    const r = validarEvidencia(
      evidencia({ remoto: { ...introspeccao, remote_schema_hash: FP.migrations_source_hash } }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não houve introspecção real");
  });

  it("introspecção sem policy ou trigger observados não certifica RLS", () => {
    const r = validarEvidencia(
      evidencia({ remoto: { ...introspeccao, policies: [], triggers: [], remote_schema_hash: "h" } }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("policy");
  });

  it("nenhuma migration observada como aplicada não certifica", () => {
    const r = validarEvidencia(
      evidencia({ remoto: { ...introspeccao, migrations_applied: [], remote_schema_hash: "h" } }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
  });
});

describe("download precisa provar o que baixou", () => {
  it("todo tipo com artefato exige ao menos um", () => {
    for (const tipo of TIPOS_COM_ARTEFATO) {
      const r = validarEvidencia(evidencia({ tipo, artefatos: [] }), { ...ESPERADO, tipo });
      expect(r.valida, tipo).toBe(false);
      expect(r.motivos.join(" ")).toContain("artefato");
    }
  });

  it("artefato com 0 byte é download que não aconteceu", () => {
    const r = validarEvidencia(evidencia({ artefatos: [{ nome: "x.md", hash: "h", bytes: 0 }] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("0 byte");
  });

  it("artefato sem hash não prova conteúdo", () => {
    const r = validarEvidencia(evidencia({ artefatos: [{ nome: "x.md", hash: "", bytes: 10 }] }), ESPERADO);
    expect(r.valida).toBe(false);
  });
});

describe("11 papéis reais e cascata não viram um checkbox vazio", () => {
  const esperadoPapeis: EsperadoEvidencia = { ...ESPERADO, tipo: "papeis_reais" };
  const base = () =>
    evidencia({
      tipo: "papeis_reais",
      project_id: PROJETO_PROVA,
      remoto: null,
      artefatos: [],
      execucoes_reais: execucoesReais(),
    });

  it("aprova somente com os 11 papéis e as duas passadas no mesmo alvo", () => {
    expect(validarEvidencia(base(), esperadoPapeis)).toEqual({ valida: true, motivos: [] });
  });

  it("remover um papel real derruba PRE_CANARY", () => {
    const ev = base();
    ev.execucoes_reais!.papeis = ev.execucoes_reais!.papeis.filter((r) => r.papel !== "extrator_memoria");
    const r = validarEvidencia(ev, esperadoPapeis);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("extrator_memoria");
  });

  it("mock não passa por modelo real", () => {
    const ev = base();
    ev.execucoes_reais!.papeis.find((r) => r.papel === "julgamento_idioma")!.model_provider = "ProvedorMock";
    expect(validarEvidencia(ev, esperadoPapeis).motivos.join(" ")).toContain("provedor não comprova modelo real");
  });

  it("decisão em outro alvo não comprova cascata", () => {
    const ev = base();
    ev.execucoes_reais!.papeis.find((r) => r.papel === "revisor_decisao")!.alvo = "outro-alvo";
    expect(validarEvidencia(ev, esperadoPapeis).motivos.join(" ")).toContain("mesmo alvo");
  });

  it("decisão sem parent_run_id da triagem não comprova cascata", () => {
    const ev = base();
    ev.execucoes_reais!.papeis.find((r) => r.papel === "revisor_decisao")!.parent_run_id = null;
    expect(validarEvidencia(ev, esperadoPapeis).motivos.join(" ")).toContain("parent_run_id");
  });

  it("run sem hash de saída não comprova execução concluída", () => {
    const ev = base();
    ev.execucoes_reais!.papeis.find((r) => r.papel === "extrator_memoria")!.output_hash = "";
    expect(validarEvidencia(ev, esperadoPapeis).motivos.join(" ")).toContain("output_hash");
  });
});

describe("segredo dentro da evidência é recusa", () => {
  it("e-mail no executor_ref é recusado", () => {
    const r = validarEvidencia(evidencia({ executor_ref: "rodrigo@exemplo.com" }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("credencial");
  });

  it("URL do Supabase no log é recusada", () => {
    const r = validarEvidencia(
      evidencia({ passos: [{ passo: "u", exit_code: 0, resultado: "aprovado", log: "GET https://abcd.supabase.co/x" }] }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
  });
});
