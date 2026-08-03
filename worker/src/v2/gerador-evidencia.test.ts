// O gerador existe para tornar impossível o que a v1 permitia: um JSON escrito
// à mão certificando produção. Estes testes provam a recusa, não a aprovação.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rodarComando } from "./execucao.js";
import {
  DIR_EVIDENCIAS,
  SCHEMA_EVIDENCIA,
  contemSegredo,
  hashIntrospeccao,
  sanitizarLog,
  validarEvidencia,
  type EsperadoEvidencia,
  type EvidenciaExterna,
  type FingerprintsCodigo,
} from "./evidencia-externa.js";
import { ErroGerador, gerarEvidencia, type PassoExecutavel } from "./gerador-evidencia.js";

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

let repo: string;

/** Um repositório git de verdade: o gerador captura HEAD e status reais. */
beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "evid-"));
  rodarComando(repo, "git", ["init", "-q"]);
  rodarComando(repo, "git", ["config", "user.email", "t@t"]);
  rodarComando(repo, "git", ["config", "user.name", "t"]);
  writeFileSync(path.join(repo, "a.txt"), "conteudo\n", "utf8");
  rodarComando(repo, "git", ["add", "-A"]);
  rodarComando(repo, "git", ["commit", "-q", "-m", "inicial"]);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const passoOk = (nome: string): PassoExecutavel => ({
  nome,
  comando: `echo ${nome}`,
  executar: () => ({ exit_code: 0, saida: `${nome} concluído` }),
});

function opcoesBase(over: Record<string, unknown> = {}) {
  return {
    tipo: "integracao_real" as const,
    ambiente: "producao" as const,
    supabase_project_ref: REF,
    project_id: "proj-1",
    executor_ref: "owner-hash-1",
    raiz: repo,
    fingerprints: FP,
    caminhosLimpeza: ["a.txt"],
    passos: [passoOk("upload"), passoOk("download")],
    introspectar: async () => introspeccao,
    baixarArtefatos: async () => [{ nome: "estrutura.json", hash: "h1", bytes: 812 }],
    agora: () => "2026-07-28T12:00:00.000Z",
    ...over,
  };
}

describe("execução aprovada gera evidência válida", () => {
  it("grava o arquivo e a validação aceita", async () => {
    const r = await gerarEvidencia(opcoesBase());
    expect(existsSync(r.caminho)).toBe(true);
    expect(r.caminho).toContain(DIR_EVIDENCIAS);
    expect(r.evidencia.tested_code_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(validarEvidencia(r.evidencia, ESPERADO)).toEqual({ valida: true, motivos: [] });
  });

  it("o commit gravado é o HEAD REAL do repositório", async () => {
    const head = rodarComando(repo, "git", ["rev-parse", "HEAD"]).stdout.trim();
    const r = await gerarEvidencia(opcoesBase());
    expect(r.evidencia.tested_code_commit).toBe(head);
  });

  it("o hash do schema remoto NÃO é o hash das fontes locais", async () => {
    const r = await gerarEvidencia(opcoesBase());
    expect(r.evidencia.remoto?.remote_schema_hash).toBe(hashIntrospeccao(introspeccao));
    expect(r.evidencia.remoto?.remote_schema_hash).not.toBe(FP.migrations_source_hash);
  });
});

describe("execução que não aprova NÃO produz arquivo", () => {
  it("passo com exit_code != 0 aborta e não escreve nada", async () => {
    const passos = [passoOk("upload"), { nome: "download", executar: () => ({ exit_code: 7, saida: "404" }) }];
    await expect(gerarEvidencia(opcoesBase({ passos }))).rejects.toThrow(ErroGerador);
    expect(existsSync(path.join(repo, DIR_EVIDENCIAS, "integracao_real.json"))).toBe(false);
  });

  it("passo que lança exceção também aborta", async () => {
    const passos = [{ nome: "upload", executar: () => { throw new Error("conexão caiu"); } }];
    await expect(gerarEvidencia(opcoesBase({ passos }))).rejects.toThrow(ErroGerador);
    expect(existsSync(path.join(repo, DIR_EVIDENCIAS, "integracao_real.json"))).toBe(false);
  });

  it("worktree suja aborta antes de executar qualquer passo", async () => {
    writeFileSync(path.join(repo, "a.txt"), "mexido\n", "utf8");
    let executou = false;
    const passos = [{ nome: "upload", executar: () => { executou = true; return { exit_code: 0, saida: "x" }; } }];
    await expect(gerarEvidencia(opcoesBase({ passos }))).rejects.toThrow(/worktree suja/);
    expect(executou).toBe(false);
  });

  it("download vazio (0 byte) aborta", async () => {
    const baixarArtefatos = async () => [{ nome: "vazio.md", hash: "h", bytes: 0 }];
    await expect(gerarEvidencia(opcoesBase({ baixarArtefatos }))).rejects.toThrow(/0 byte/);
  });

  it("tipo que toca o banco sem introspecção aborta", async () => {
    await expect(gerarEvidencia(opcoesBase({ introspectar: undefined }))).rejects.toThrow(/introspecção/);
  });

  it("papeis_reais sem consulta do ledger aborta", async () => {
    await expect(
      gerarEvidencia(
        opcoesBase({
          tipo: "papeis_reais",
          introspectar: undefined,
          baixarArtefatos: undefined,
        })
      )
    ).rejects.toThrow(/ledger engine_runs/);
  });

  it("não existe parâmetro que declare aprovação", async () => {
    // Passar `resultado: "aprovado"` não tem efeito: o campo é derivado.
    const passos = [{ nome: "x", executar: () => ({ exit_code: 3, saida: "falhou" }) }];
    await expect(gerarEvidencia(opcoesBase({ passos, resultado: "aprovado" }))).rejects.toThrow(ErroGerador);
  });
});

describe("JSON artesanal não certifica", () => {
  const artesanal = {
    schema: SCHEMA_EVIDENCIA,
    tipo: "integracao_real",
    executado_em: "2026-07-28T12:00:00.000Z",
    ambiente: "producao",
    supabase_project_ref: REF,
    project_id: "proj-1",
    executor_ref: "owner-1",
    tested_code_commit: "a".repeat(40),
    worktree_limpa: true,
    fingerprints: FP,
    remoto: { ...introspeccao, remote_schema_hash: "x" },
    passos: [],
    artefatos: [{ nome: "x.md", hash: "h", bytes: 10 }],
    erros: [],
    resultado: "aprovado",
  };

  it("sem passos não comprova execução", () => {
    const r = validarEvidencia(artesanal, ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não comprova execução");
  });

  it("passo sem log não comprova execução", () => {
    const ev = { ...artesanal, passos: [{ passo: "upload", exit_code: 0, resultado: "aprovado", log: "" }] };
    const r = validarEvidencia(ev, ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("sem log");
  });

  it("passo com log mas exit_code diferente de zero não aprova", () => {
    const ev = { ...artesanal, passos: [{ passo: "upload", exit_code: 1, resultado: "aprovado", log: "saiu" }] };
    expect(validarEvidencia(ev, ESPERADO).valida).toBe(false);
  });

  it("HEAD que não é SHA não certifica", () => {
    const ev = {
      ...artesanal,
      tested_code_commit: "desconhecido",
      passos: [{ passo: "u", exit_code: 0, resultado: "aprovado", log: "ok" }],
    };
    const r = validarEvidencia(ev, ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não é um SHA");
  });

  it("worktree suja declarada não certifica", () => {
    const ev = {
      ...artesanal,
      worktree_limpa: false,
      passos: [{ passo: "u", exit_code: 0, resultado: "aprovado", log: "ok" }],
    };
    expect(validarEvidencia(ev, ESPERADO).valida).toBe(false);
  });

  it("remote_schema_hash copiado das fontes locais é denunciado", () => {
    const ev = {
      ...artesanal,
      passos: [{ passo: "u", exit_code: 0, resultado: "aprovado", log: "ok" }],
      remoto: { ...introspeccao, remote_schema_hash: FP.migrations_source_hash },
    };
    const r = validarEvidencia(ev, ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("não houve introspecção real");
  });

  it("sem introspecção do banco não certifica migração remota", () => {
    const ev = {
      ...artesanal,
      tipo: "migracoes_remotas",
      remoto: null,
      passos: [{ passo: "u", exit_code: 0, resultado: "aprovado", log: "ok" }],
    };
    const r = validarEvidencia(ev, { ...ESPERADO, tipo: "migracoes_remotas" });
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("introspecção");
  });
});

describe("caducidade e escopo", () => {
  it("fingerprint alterada invalida", async () => {
    const r = await gerarEvidencia(opcoesBase());
    const v = validarEvidencia(r.evidencia, { ...ESPERADO, fingerprints: { ...FP, worker_hash: "wrk-2" } });
    expect(v.valida).toBe(false);
    expect(v.motivos.join(" ")).toContain("worker_hash");
  });

  it("projeto Supabase diferente é recusado", async () => {
    const r = await gerarEvidencia(opcoesBase());
    const v = validarEvidencia(r.evidencia, { ...ESPERADO, supabase_project_ref: "outro-ref" });
    expect(v.valida).toBe(false);
    expect(v.motivos.join(" ")).toContain("projeto Supabase");
  });

  it("ambiente diferente é recusado", async () => {
    const r = await gerarEvidencia(opcoesBase({ ambiente: "local" }));
    expect(validarEvidencia(r.evidencia, ESPERADO).valida).toBe(false);
  });

  it("mudar só a documentação NÃO invalida (é o ponto do modelo)", async () => {
    // A v1 se contradizia: commitar a evidência mudava o HEAD e a invalidava.
    // Aqui o vínculo é por fingerprint do código, não pelo commit corrente.
    const r = await gerarEvidencia(opcoesBase());
    writeFileSync(path.join(repo, "LEIAME.md"), "doc nova\n", "utf8");
    rodarComando(repo, "git", ["add", "-A"]);
    rodarComando(repo, "git", ["commit", "-q", "-m", "doc"]);
    const novoHead = rodarComando(repo, "git", ["rev-parse", "HEAD"]).stdout.trim();
    expect(novoHead).not.toBe(r.evidencia.tested_code_commit);
    expect(validarEvidencia(r.evidencia, ESPERADO).valida).toBe(true);
  });

});

describe("segredo não entra na evidência", () => {
  it("o sanitizador remove jwt, chave, url do supabase e e-mail", () => {
    const sujo =
      "conectando https://abcdefgh.supabase.co com Bearer eyJhbGciOi.AAAAAAAAAA.BBBBBBBBBB " +
      "user rodrigo@exemplo.com key sb_secret_ABCDEFGHIJKLMNOPQRS";
    const limpo = sanitizarLog(sujo);
    expect(contemSegredo(limpo)).toBe(false);
    expect(limpo).toContain("<url-supabase-removida>");
    expect(limpo).toContain("<email-removido>");
  });

  it("evidência que carrega segredo é RECUSADA na validação", async () => {
    const passos = [
      { nome: "upload", executar: () => ({ exit_code: 0, saida: "ok" }) },
    ];
    const r = await gerarEvidencia(opcoesBase({ passos }));
    const contaminada = { ...r.evidencia, executor_ref: "rodrigo@exemplo.com" };
    const v = validarEvidencia(contaminada, ESPERADO);
    expect(v.valida).toBe(false);
    expect(v.motivos.join(" ")).toContain("credencial");
  });

  it("o log gravado pelo gerador já sai sanitizado", async () => {
    const passos = [
      { nome: "upload", executar: () => ({ exit_code: 0, saida: "token Bearer eyJhbGciOi.XXXXXXXXXX.YYYYYYYYYY" }) },
    ];
    const r = await gerarEvidencia(opcoesBase({ passos }));
    expect(contemSegredo(r.evidencia.passos[0].log)).toBe(false);
  });
});
