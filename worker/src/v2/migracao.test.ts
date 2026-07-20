// Testes da migração V1 → V2 com fixtures V1 reais montadas em mkdtemp.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { migrarProjetoV1, reverterMigracao } from "./migracao.js";
import { DiscoPersistencia } from "./persistencia.js";
import type { EstadoCanonicoDoc } from "./tipos.js";

let dir: string;
let disco: DiscoPersistencia;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-migra-"));
  disco = new DiscoPersistencia(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function escrever(rel: string, conteudo: string): void {
  const destino = path.join(dir, rel);
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo, "utf8");
}

/** quality/capitulo-NN.json no formato QualityState V1 (campos que a migração lê). */
function qualityJson(texto: string, status: string, opts?: { textHash?: string; reason?: string }): string {
  return JSON.stringify({
    status,
    stateVersion: "1.0.0",
    detectorVersion: "d1",
    skillVersion: "s1",
    textHash: opts?.textHash ?? hashText(texto),
    evaluatedAt: "2026-07-01T00:00:00.000Z",
    stage: "revcap",
    decisionBy: "quality-engine",
    attempts: 1,
    maxAttempts: 3,
    metricsBefore: {},
    metricsAfter: {},
    targets: {},
    blockers: [],
    warnings: [],
    reason: opts?.reason ?? "ok",
    requiredAction: null,
  });
}

const CAP1 = "Ela abriu a porta e o vento apagou a vela do corredor.";
const CAP2 = "O telefone tocou três vezes antes do silêncio completo.";
const CAP3 = "A carta ainda estava na gaveta quando ele voltou.";

/** Projeto V1 completo: 3 capítulos (2 aprovados com evidência, 1 só com .done) + fundação. */
function montarProjetoCompleto(fase = "CONCLUIDO"): void {
  escrever("manuscrito/capitulo-01.md", CAP1);
  escrever("manuscrito/capitulo-02.md", CAP2);
  escrever("manuscrito/capitulo-03.md", CAP3);
  escrever("manuscrito/MANUSCRITO-MESTRE.md", `${CAP1}\n${CAP2}\n${CAP3}`);
  escrever("quality/capitulo-01.json", qualityJson(CAP1, "approved"));
  escrever("quality/capitulo-02.json", qualityJson(CAP2, "approved_with_exception"));
  escrever("review/_revcap-01.done", "ok");
  escrever("review/_revcap-02.done", "ok");
  escrever("review/_revcap-03.done", "ok");
  // Fundação nos DOIS layouts: 2 docs na raiz, 2 em fundacao/
  escrever("Biblia-da-Obra.md", "# Bíblia");
  escrever("Estrutura-do-Livro.md", "# Estrutura");
  escrever("fundacao/Mapa-de-Personagens.md", "# Personagens");
  escrever("fundacao/perfil-de-voz.md", "# Voz");
  escrever(
    "ESTADO_LIVRO.json",
    JSON.stringify({ fase_atual: fase, total_capitulos_previstos: 3, capitulos_aprovados: 3, palavras_totais: 30 })
  );
}

async function migrar(skill?: { id: string; versao: string; hash: string }) {
  return migrarProjetoV1({ projectId: "proj-1", dirProjeto: dir, persistencia: disco, skill });
}

describe("migrarProjetoV1 — projeto V1 completo (a)", () => {
  it("migra aprovados com evidência, .done vira legado_sem_evidencia, fundação com 4 hashes", async () => {
    montarProjetoCompleto();
    const rel = await migrar({ id: "hoover-mcfadden", versao: "1.0.0", hash: "h-skill" });

    expect(rel.fase).toBe("concluido");
    expect(rel.totalCapitulos).toBe(3);
    expect(rel.divergencias).toEqual([]);
    expect(rel.idempotente).toBe(false);
    expect(Object.keys(rel.fundacao.docs).sort()).toEqual([
      "Biblia-da-Obra.md",
      "Estrutura-do-Livro.md",
      "Mapa-de-Personagens.md",
      "perfil-de-voz.md",
    ]);
    expect(rel.fundacao.ausentes).toEqual([]);
    expect(rel.fundacao.docs["Biblia-da-Obra.md"]).toBe(hashText("# Bíblia"));

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.versao).toBe(1);
    expect(estado?.doc.fase).toBe("concluido");
    expect(estado?.doc.total_capitulos).toBe(3);
    expect(estado?.doc.skill).toEqual({ id: "hoover-mcfadden", versao: "1.0.0", hash: "h-skill" });
    expect(estado?.doc.migracao).toMatchObject({ origem: "v1", divergencias: 0 });

    // Aprovação documenta a origem legada — SEM inventar review_id V2 (top-level ausente)
    expect(estado?.doc.capitulos["1"]).toMatchObject({
      status: "aprovado",
      text_hash: hashText(CAP1),
      aprovacao: { review_id: "legado:quality-state", text_hash: hashText(CAP1), em: "2026-07-01T00:00:00.000Z" },
    });
    expect(estado?.doc.capitulos["1"]?.review_id).toBeUndefined();
    expect(estado?.doc.capitulos["2"]?.status).toBe("aprovado_com_excecao");
    // Marcador .done NÃO é evidência de parecer
    expect(estado?.doc.capitulos["3"]?.status).toBe("legado_sem_evidencia");

    const linha3 = rel.capitulos.find((c) => c.numero === 3);
    expect(linha3).toMatchObject({
      origem: { arquivo: true, qualityState: null, marcadorDone: true },
      destino: "legado_sem_evidencia",
    });

    // Relatório gravado em disco; arquivos V1 intocados
    expect(existsSync(path.join(dir, "engine-v2", "migracao-relatorio.json"))).toBe(true);
    expect(readFileSync(path.join(dir, "manuscrito", "capitulo-01.md"), "utf8")).toBe(CAP1);
    expect(JSON.parse(readFileSync(path.join(dir, "ESTADO_LIVRO.json"), "utf8")).fase_atual).toBe("CONCLUIDO");
  });
});

describe("migrarProjetoV1 — hash divergente (b)", () => {
  it("arquivo editado depois da aprovação vira legado_sem_evidencia com divergência", async () => {
    escrever("manuscrito/capitulo-01.md", "Texto editado depois da aprovação.");
    escrever("quality/capitulo-01.json", qualityJson("texto antigo aprovado", "approved"));
    escrever("ESTADO_LIVRO.json", JSON.stringify({ fase_atual: "ESCRITA", capitulos_aprovados: 1 }));

    const rel = await migrar();
    expect(rel.divergencias).toHaveLength(1);
    expect(rel.divergencias[0]).toContain("capitulo 1");
    expect(rel.divergencias[0]).toContain("hash");

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]).toMatchObject({
      status: "legado_sem_evidencia",
      text_hash: hashText("Texto editado depois da aprovação."),
    });
    expect(estado?.doc.capitulos["1"]?.aprovacao).toBeUndefined();
  });
});

describe("migrarProjetoV1 — idempotência (c)", () => {
  it("2ª execução: idempotente=true e a versão do estado NÃO incrementa", async () => {
    montarProjetoCompleto();
    const rel1 = await migrar();
    expect(rel1.idempotente).toBe(false);
    const estado1 = await disco.lerEstado("proj-1");
    expect(estado1?.versao).toBe(1);

    const rel2 = await migrar();
    expect(rel2.idempotente).toBe(true);
    const estado2 = await disco.lerEstado("proj-1");
    expect(estado2?.versao).toBe(1); // nada gravado de novo
    expect(estado2?.doc).toEqual(estado1?.doc);
  });
});

describe("migrarProjetoV1 — não-rebaixamento de estado V2 (d)", () => {
  it("cap com aprovação V2 real (review_id) é preservado; divergência registrada", async () => {
    escrever("manuscrito/capitulo-01.md", CAP1);
    escrever("ESTADO_LIVRO.json", JSON.stringify({ fase_atual: "ESCRITA", capitulos_aprovados: 1 }));

    // Estado V2 preexistente: aprovação REAL (review_id V2), hash do texto atual
    const docV2: EstadoCanonicoDoc = {
      schema: "engine-state/v1",
      fase: "escrita",
      capitulos: {
        "1": {
          status: "aprovado",
          text_hash: hashText(CAP1),
          review_id: "rev-uuid-real",
          aprovacao: { review_id: "rev-uuid-real", text_hash: hashText(CAP1), em: "2026-07-10T00:00:00.000Z" },
        },
      },
      bloqueios: [],
    };
    await disco.gravarEstado({ project_id: "proj-1", engine_version: "2.0.0", versao: 0, doc: docV2 });

    const rel = await migrar();
    const estado = await disco.lerEstado("proj-1");
    // V1 (sem quality-state) indicaria legado_sem_evidencia — mas o V2 real fica intacto
    expect(estado?.doc.capitulos["1"]).toMatchObject({ status: "aprovado", review_id: "rev-uuid-real" });
    expect(rel.divergencias.some((d) => d.includes("capitulo 1") && d.includes("preservado"))).toBe(true);
    expect(rel.capitulos.find((c) => c.numero === 1)?.destino).toBe("aprovado");
  });
});

describe("reverterMigracao (e)", () => {
  it("remove os migrados, preserva os V2 reais, limpa doc.migracao e registra histórico", async () => {
    montarProjetoCompleto();
    await migrar(); // caps 1-3 migrados (versão 1)

    // Acrescenta um capítulo com aprovação V2 REAL depois da migração
    const estado = (await disco.lerEstado("proj-1"))!;
    estado.doc.capitulos["4"] = {
      status: "aprovado",
      text_hash: "hash-v2-real",
      review_id: "rev-uuid-real",
      aprovacao: { review_id: "rev-uuid-real", text_hash: "hash-v2-real", em: "2026-07-19T00:00:00.000Z" },
    };
    await disco.gravarEstado(estado); // versão 2

    const { capitulosRemovidos } = await reverterMigracao({ projectId: "proj-1", dirProjeto: dir, persistencia: disco });
    expect(capitulosRemovidos).toEqual([1, 2, 3]);

    const depois = await disco.lerEstado("proj-1");
    expect(Object.keys(depois!.doc.capitulos)).toEqual(["4"]);
    expect(depois?.doc.capitulos["4"]?.review_id).toBe("rev-uuid-real");
    expect(depois?.doc.migracao).toBeUndefined();

    // Arquivos V1 intocados; relatório ganha histórico de reversão
    expect(readFileSync(path.join(dir, "manuscrito", "capitulo-01.md"), "utf8")).toBe(CAP1);
    const relatorio = JSON.parse(readFileSync(path.join(dir, "engine-v2", "migracao-relatorio.json"), "utf8"));
    expect(relatorio.historico).toHaveLength(1);
    expect(relatorio.historico[0]).toMatchObject({ evento: "reversao", capitulos_removidos: [1, 2, 3] });
  });
});

describe("migrarProjetoV1 — contagem sem arquivo (f)", () => {
  it("ESTADO_LIVRO conta 5, só 3 arquivos → divergências; total_capitulos=5", async () => {
    escrever("manuscrito/capitulo-01.md", CAP1);
    escrever("manuscrito/capitulo-02.md", CAP2);
    escrever("manuscrito/capitulo-03.md", CAP3);
    escrever(
      "ESTADO_LIVRO.json",
      JSON.stringify({ fase_atual: "ESCRITA", total_capitulos_previstos: 5, capitulos_aprovados: 5 })
    );

    const rel = await migrar();
    expect(rel.totalCapitulos).toBe(5);
    expect(rel.fase).toBe("escrita");
    expect(rel.divergencias.filter((d) => d.includes("sem arquivo no disco"))).toHaveLength(2); // caps 4 e 5

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.total_capitulos).toBe(5);
    // Sem arquivo → NÃO entra em capitulos do doc
    expect(Object.keys(estado!.doc.capitulos).sort()).toEqual(["1", "2", "3"]);
  });
});

describe("migrarProjetoV1 — quality bloqueado (regra 5)", () => {
  it("blocked_quality vira bloqueado com LEGADO_BLOQUEADO e entrada em doc.bloqueios", async () => {
    escrever("manuscrito/capitulo-01.md", CAP1);
    escrever("quality/capitulo-01.json", qualityJson(CAP1, "blocked_quality", { reason: "teto atingido com blockers" }));
    escrever("ESTADO_LIVRO.json", JSON.stringify({ fase_atual: "ESCRITA", capitulos_aprovados: 0 }));

    const rel = await migrar();
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]).toMatchObject({
      status: "bloqueado",
      bloqueio: { codigo: "LEGADO_BLOQUEADO", detalhe: "teto atingido com blockers" },
    });
    expect(estado?.doc.bloqueios).toHaveLength(1);
    expect(estado?.doc.bloqueios[0]).toMatchObject({ codigo: "LEGADO_BLOQUEADO", alvo: "capitulo:1" });
    expect(rel.capitulos[0]?.destino).toBe("bloqueado");

    // Idempotência também com bloqueio (timestamps "desde" estáveis entre execuções)
    const rel2 = await migrar();
    expect(rel2.idempotente).toBe(true);
    expect((await disco.lerEstado("proj-1"))?.versao).toBe(1);
  });
});

describe("migrarProjetoV1 — fase ausente (regra 6)", () => {
  it("sem fase_atual: escrita se há capítulos, fundacao se não há", async () => {
    escrever("manuscrito/capitulo-01.md", CAP1);
    escrever("ESTADO_LIVRO.json", JSON.stringify({ capitulos_aprovados: 0 }));
    const rel = await migrar();
    expect(rel.fase).toBe("escrita");

    // Projeto vazio (outro diretório/projeto)
    const dir2 = mkdtempSync(path.join(tmpdir(), "engine-v2-migra-vazio-"));
    try {
      const disco2 = new DiscoPersistencia(dir2);
      const rel2 = await migrarProjetoV1({ projectId: "proj-2", dirProjeto: dir2, persistencia: disco2 });
      expect(rel2.fase).toBe("fundacao");
      expect(rel2.fundacao.ausentes).toHaveLength(4);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
