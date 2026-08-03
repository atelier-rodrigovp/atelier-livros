// Prova literária — o medidor de qualidade DO LIVRO.
//
// Por que este arquivo existe: `prontidao.ts` gravava a string
// "PROVA_LITERARIA_NAO_EXECUTADA" LITERALMENTE, e o tipo previa APROVADA e
// REPROVADA sem que existisse nenhum produtor no repositório. O sistema media
// exaustivamente a si mesmo e nada sobre o livro.
//
// Estes testes fecham o buraco dos DOIS lados, e é de propósito que sejam de
// INTEGRAÇÃO e não de unidade: teste de unidade verde com função órfã já
// escondeu exatamente este tipo de buraco neste projeto. Aqui, remover o
// produtor ou fazer o consumidor voltar a ser constante deixa o arquivo
// VERMELHO.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ProvedorMock } from "./provedor.js";
import {
  DIR_PROVA_LITERARIA,
  SCHEMA_PROVA_LITERARIA,
  arquivoProva,
  derivarEstadoProvaLiteraria,
  executarProvaLiteraria,
  validarProvaLiteraria,
  type DepsProvaLiteraria,
  type ProvaLiteraria,
} from "./prova-literaria.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

const HEAD = "a".repeat(40);
const OUTRO_HEAD = "b".repeat(40);

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Skill de Teste",
  familia_editorial: "suspense_intimista",
  motor_narrativo: "pergunta → obstáculo → revelação",
  unidade_dramatica: "cena com virada",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: { alvo: 30 },
  ritmo: { descricao: "médio" },
  acao_interioridade: { relacao: "equilibrio", descricao: "interioridade funcional" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "diálogo avança a cena" },
  politica_metafora: { descricao: "rara e concreta" },
  tipos_gancho: ["ameaca", "revelacao"],
  regras: [],
  testes_positivos: ["virada concreta por cena"],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

const PROSA = [
  "## Capítulo 1",
  "",
  "Marina abriu a porta e o corredor cheirava a papel velho. Ela guardou a câmera no bolso e desceu a escada. A chave girou na fechadura atrás dela.",
].join("\n");

function fichaDe(cap: number): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: cap,
    pov: "Marina",
    local: "arquivo do consulado",
    tempo: "Dia 2, 14h30",
    objetivo: "obter o registro de 1987",
    obstaculo: "o arquivista exige autorização",
    acao_fisica: "fotografa o livro de registros",
    informacao_nova: "o nome do irmão consta",
    virada: "a página foi arrancada",
    mudanca_estado: "de confiante para exposta",
    gancho: { tipo: "ameaca", descricao: "a chave gira na fechadura" },
    fatos_obrigatorios: ["registro de 1987 existe"],
    conhecimentos_proibidos: ["Marina não sabe quem arrancou a página"],
    fios_avancados: ["investigacao"],
    fios_ausentes: ["romance"],
  };
}

function parecerAprovado(): Parecer {
  const eixo = { nota: 4, evidencia: "a folha arrancada muda a cena" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "aprovado",
    evidencias: [{ local: "L:3", trecho: "a chave girou na fechadura", observacao: "gancho concreto" }],
    sinais: [],
    correcoes: [],
  };
}

const CHAVES = [
  "hook_abertura", "premissa_originalidade", "estrutura_ritmo", "personagens",
  "prosa_oficio", "payoff", "coerencia_consistencia", "final", "encaixe_mercado", "acabamento",
] as const;

/** Todas as dimensões com a mesma nota: a média ponderada devolve o próprio valor. */
function avaliacaoBruta(nota: number): string {
  return JSON.stringify({
    schema: "avaliacao-livro/v2",
    dimensoes: Object.fromEntries(
      CHAVES.map((c) => [c, { nota, evidencia: `evidência localizada de ${c} (L:3, 'a chave girou na fechadura')` }])
    ),
    pontos_fortes: ["gancho de abertura forte"],
    pontos_fracos: nota >= 9 ? [] : ["final sem consequência"],
    capitulos_a_reescrever: [],
    resumo: `avaliação com nota ${nota}`,
  });
}

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let gravador: Gravador;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-prova-lit-"));
  disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  gravador = new Gravador({ persistencia: disco, projectId: "proj-1" });
  mkdirSync(path.join(dir, "manuscrito"), { recursive: true });
  const caminho = path.join(dir, "manuscrito", "capitulo-01.md");
  writeFileSync(caminho, PROSA, "utf8");
  await disco.inserirSpec({ project_id: "proj-1", edition_id: null, capitulo: 1, versao: 1, hash: "h1", status: "validada", ficha: fichaDe(1) });
  await gravador.mudarFase("estrutura");
  await gravador.mudarFase("escrita");
  await gravador.registrarCapituloEscrito(1, caminho, { palavras: 26, spec_versao: 1, spec_hash: "h1" });
  const parecer = parecerAprovado();
  const reviewId = await disco.inserirReview({
    project_id: "proj-1", edition_id: null, capitulo: 1,
    text_hash: hashText(PROSA), verdict: "aprovado", parecer,
  });
  await gravador.aprovarCapitulo(1, { id: reviewId, text_hash: hashText(PROSA), verdict: "aprovado", parecer }, caminho);
  await gravador.mudarFase("revisao_final");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps(over: Partial<DepsProvaLiteraria> = {}): DepsProvaLiteraria {
  return {
    gravador,
    persistencia: disco,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: { contrato, hash: "hash-contrato", origem: "worker/skills-v2/teste" },
    perfil: { texto: "Perfil validado.", skillId: "teste", hash: "h-perfil", validado: true },
    dirProjeto: dir,
    dirManuscrito: path.join(dir, "manuscrito"),
    projectId: "proj-1",
    editionId: null,
    head: HEAD,
    meta: 9,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// PRODUTOR — o que não existia
// ---------------------------------------------------------------------------

describe("executarProvaLiteraria (produtor)", () => {
  it("avalia o livro pelo caminho de provedor da V2 e assina o artefato", async () => {
    provedor.enfileirar("revisor_literario", avaliacaoBruta(9));
    const prova = await executarProvaLiteraria(deps());

    expect(prova.schema).toBe(SCHEMA_PROVA_LITERARIA);
    expect(prova.project_id).toBe("proj-1");
    expect(prova.tested_code_commit).toBe(HEAD);
    // Nota por dimensão preservada, íntegra.
    expect(Object.keys(prova.dimensoes).sort()).toEqual([...CHAVES].sort());
    // Nota agregada e piso derivados PELO CÓDIGO.
    expect(prova.nota).toBe(9);
    expect(prova.floor.nota).toBe(9);
    expect(prova.aprovada).toBe(true);
    // sha256 do manuscrito de fato avaliado.
    expect(prova.manuscrito_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prova.manuscrito_sha256).toBe(hashText(readFileSync(path.join(dir, "MANUSCRITO-MESTRE.md"), "utf8")));
    // Relatório textual íntegro (não um resumo do resumo).
    expect(prova.relatorio).toContain("avaliação com nota 9");
    expect(prova.relatorio.length).toBeGreaterThan(0);
    // Passou pelo ledger — é o mesmo caminho de provedor, não uma segunda via.
    expect(prova.runs.length).toBeGreaterThan(0);
    expect(provedor.chamadas.some((c) => c.papel === "revisor_literario")).toBe(true);
  });

  it("reprova sem inflar: nota abaixo da meta sai REPROVADA, não arredondada", async () => {
    provedor.enfileirar("revisor_literario", avaliacaoBruta(6));
    const prova = await executarProvaLiteraria(deps());
    expect(prova.nota).toBe(6);
    expect(prova.aprovada).toBe(false);
  });

  it("grava o artefato onde a prontidão o procura", async () => {
    provedor.enfileirar("revisor_literario", avaliacaoBruta(9));
    const prova = await executarProvaLiteraria(deps({ raizArtefato: dir }));
    const destino = arquivoProva(dir, "proj-1");
    expect(destino).toContain(DIR_PROVA_LITERARIA);
    const gravado = JSON.parse(readFileSync(destino, "utf8")) as ProvaLiteraria;
    expect(gravado.nota).toBe(prova.nota);
    expect(gravado.manuscrito_sha256).toBe(prova.manuscrito_sha256);
  });
});

// ---------------------------------------------------------------------------
// A3 — a nota NUNCA é somada pelo modelo avaliador
// ---------------------------------------------------------------------------

describe("a nota agregada sai do código, nunca do modelo", () => {
  it("ignora a nota que o modelo tentar declarar e recalcula das dimensões", async () => {
    // O modelo devolve dimensões 6 mas afirma nota 10 e floor 10.
    const mentiroso = JSON.parse(avaliacaoBruta(6)) as Record<string, unknown>;
    mentiroso.nota = 10;
    mentiroso.floor = { dimensao: "payoff", nota: 10 };
    provedor.enfileirar("revisor_literario", JSON.stringify(mentiroso));

    const prova = await executarProvaLiteraria(deps());
    expect(prova.nota).toBe(6);
    expect(prova.floor.nota).toBe(6);
    expect(prova.aprovada).toBe(false);
  });

  it("artefato com nota adulterada é INVÁLIDO (o validador recalcula)", async () => {
    provedor.enfileirar("revisor_literario", avaliacaoBruta(6));
    const prova = await executarProvaLiteraria(deps());
    const adulterado = { ...prova, nota: 9.9, aprovada: true };
    const v = validarProvaLiteraria(adulterado, { head: HEAD, manuscrito_sha256: prova.manuscrito_sha256 });
    expect(v.valida).toBe(false);
    expect(v.motivos.join(" ")).toMatch(/nota/i);
  });
});

// ---------------------------------------------------------------------------
// A2 — CONSUMIDOR fail-closed
// ---------------------------------------------------------------------------

describe("derivarEstadoProvaLiteraria (consumidor fail-closed)", () => {
  async function provaValida(nota: number): Promise<ProvaLiteraria> {
    provedor.enfileirar("revisor_literario", avaliacaoBruta(nota));
    return executarProvaLiteraria(deps());
  }

  it("artefato ausente => NAO_EXECUTADA", () => {
    const r = derivarEstadoProvaLiteraria(null, { head: HEAD, manuscrito_sha256: "x".repeat(64) });
    expect(r.estado).toBe("PROVA_LITERARIA_NAO_EXECUTADA");
    expect(r.motivos.join(" ")).toMatch(/ausente/i);
  });

  it("gerada em SHA diferente do HEAD => NAO_EXECUTADA", async () => {
    const prova = await provaValida(9);
    const r = derivarEstadoProvaLiteraria(prova, { head: OUTRO_HEAD, manuscrito_sha256: prova.manuscrito_sha256 });
    expect(r.estado).toBe("PROVA_LITERARIA_NAO_EXECUTADA");
    expect(r.motivos.join(" ")).toMatch(/commit|HEAD/i);
  });

  it("hash do manuscrito divergente => NAO_EXECUTADA (nota velha não vale para texto novo)", async () => {
    const prova = await provaValida(9);
    const r = derivarEstadoProvaLiteraria(prova, { head: HEAD, manuscrito_sha256: "c".repeat(64) });
    expect(r.estado).toBe("PROVA_LITERARIA_NAO_EXECUTADA");
    expect(r.motivos.join(" ")).toMatch(/manuscrito/i);
  });

  it("manuscrito inexistente no disco => NAO_EXECUTADA", async () => {
    const prova = await provaValida(9);
    const r = derivarEstadoProvaLiteraria(prova, { head: HEAD, manuscrito_sha256: null });
    expect(r.estado).toBe("PROVA_LITERARIA_NAO_EXECUTADA");
  });

  it("artefato válido e aprovado => APROVADA", async () => {
    const prova = await provaValida(9);
    const r = derivarEstadoProvaLiteraria(prova, { head: HEAD, manuscrito_sha256: prova.manuscrito_sha256 });
    expect(r.estado).toBe("PROVA_LITERARIA_APROVADA");
  });

  it("artefato válido e abaixo da meta => REPROVADA (nunca some, nunca vira ausência)", async () => {
    const prova = await provaValida(6);
    const r = derivarEstadoProvaLiteraria(prova, { head: HEAD, manuscrito_sha256: prova.manuscrito_sha256 });
    expect(r.estado).toBe("PROVA_LITERARIA_REPROVADA");
  });

  it("floor abaixo do mínimo reprova mesmo com média acima da meta", async () => {
    provedor.enfileirar("revisor_literario", JSON.stringify({
      schema: "avaliacao-livro/v2",
      dimensoes: Object.fromEntries(
        CHAVES.map((c) => [c, { nota: c === "payoff" ? 4 : 10, evidencia: `evidência de ${c} (L:3)` }])
      ),
      pontos_fortes: [], pontos_fracos: ["payoff frágil"], capitulos_a_reescrever: [], resumo: "média alta, piso baixo",
    }));
    const prova = await executarProvaLiteraria(deps({ meta: 8 }));
    expect(prova.nota).toBeGreaterThanOrEqual(8);
    expect(prova.floor.nota).toBe(4);
    expect(prova.aprovada).toBe(false);
    const r = derivarEstadoProvaLiteraria(prova, { head: HEAD, manuscrito_sha256: prova.manuscrito_sha256 });
    expect(r.estado).toBe("PROVA_LITERARIA_REPROVADA");
  });

  // O consumidor tem de ser uma FUNÇÃO do artefato. Uma constante — que foi
  // exatamente o defeito original — não consegue passar por aqui.
  it("o estado VARIA com a entrada (uma constante reprovaria este teste)", async () => {
    const aprovada = await provaValida(9);
    const reprovada = await provaValida(6);
    const estados = new Set([
      derivarEstadoProvaLiteraria(aprovada, { head: HEAD, manuscrito_sha256: aprovada.manuscrito_sha256 }).estado,
      derivarEstadoProvaLiteraria(reprovada, { head: HEAD, manuscrito_sha256: reprovada.manuscrito_sha256 }).estado,
      derivarEstadoProvaLiteraria(null, { head: HEAD, manuscrito_sha256: null }).estado,
    ]);
    expect(estados.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// A4 — guarda anti-regressão sobre o CONSUMIDOR REAL (prontidao.ts)
// ---------------------------------------------------------------------------

describe("prontidao.ts consome a prova literária de verdade", () => {
  const fonte = () =>
    readFileSync(path.resolve(import.meta.dirname, "..", "..", "scripts", "prontidao.ts"), "utf8");

  it("não grava mais o estado como string literal constante", () => {
    const texto = fonte();
    // O defeito original, exatamente como estava escrito.
    expect(texto).not.toMatch(/prova_literaria:\s*"PROVA_LITERARIA_[A-Z_]+"/);
  });

  it("importa e usa o derivador do artefato", () => {
    const texto = fonte();
    expect(texto).toContain("derivarEstadoProvaLiteraria");
    expect(texto).toContain("prova-literaria.js");
  });
});
