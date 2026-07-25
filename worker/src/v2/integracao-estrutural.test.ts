import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { hashJsonCanonico } from "./hash.js";
import { prepararEdicaoEstrutural } from "./integracao.js";
import { DiscoPersistencia } from "./persistencia.js";
import type { DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Teste",
  familia_editorial: "thriller",
  motor_narrativo: "pergunta → virada",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: { alvo: 100 },
  ritmo: { descricao: "médio" },
  acao_interioridade: { relacao: "equilibrio", descricao: "equilíbrio" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "funcional" },
  politica_metafora: { descricao: "rara" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: ["virada"],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

function ficha(capitulo: number): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo,
    pov: "Marina",
    local: `arquivo ${capitulo}`,
    tempo: `dia ${capitulo}`,
    objetivo: `obter pista ${capitulo}`,
    obstaculo: `porta ${capitulo}`,
    acao_fisica: `abre pasta ${capitulo}`,
    informacao_nova: `pista ${capitulo}`,
    virada: `ameaça ${capitulo}`,
    mudanca_estado: `muda ${capitulo}`,
    gancho: { tipo: "ameaca", descricao: `passos ${capitulo}` },
    fatos_obrigatorios: [`fato ${capitulo}`],
    conhecimentos_proibidos: [],
    fios_avancados: ["mistério"],
    fios_ausentes: [],
  };
}

const eixo = { nota: 4, evidencia: "fusão mantém a unidade e a virada" };
const parecer: Parecer = {
  schema: "parecer/v1",
  dramatic_progression: eixo,
  skill_adherence: eixo,
  clarity: eixo,
  emotional_effect: eixo,
  continuity: eixo,
  hook_effectiveness: eixo,
  verdict: "aprovado",
  evidencias: [{ local: "final", trecho: "Os passos pararam", observacao: "gancho concreto" }],
  sinais: [],
  correcoes: [],
};

let dir: string;
let persistencia: DiscoPersistencia;
let gravador: Gravador;
let provedor: ProvedorMock;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "integracao-estrutural-"));
  persistencia = new DiscoPersistencia(dir);
  gravador = new Gravador({ persistencia, projectId: "p" });
  provedor = new ProvedorMock();
  mkdirSync(path.join(dir, "manuscrito"), { recursive: true });
  await gravador.mudarFase("estrutura");
  await gravador.mudarFase("escrita");
  for (let cap = 1; cap <= 2; cap++) {
    const texto = `## Capítulo ${cap}\n\nMarina abriu a pasta ${cap}. Encontrou a pista. Os passos pararam diante da porta.`;
    const arquivo = path.join(dir, "manuscrito", `capitulo-0${cap}.md`);
    writeFileSync(arquivo, texto, "utf8");
    const f = ficha(cap);
    await persistencia.inserirSpec({
      project_id: "p",
      capitulo: cap,
      versao: 1,
      hash: hashJsonCanonico(f),
      status: "validada",
      ficha: f,
    });
    await gravador.registrarCapituloEscrito(cap, arquivo, {
      palavras: 14,
      spec_versao: 1,
      spec_hash: hashJsonCanonico(f),
    });
    const reviewId = await persistencia.inserirReview({
      project_id: "p",
      capitulo: cap,
      text_hash: hashText(texto),
      verdict: "aprovado",
      parecer,
    });
    await gravador.aprovarCapitulo(
      cap,
      { id: reviewId, text_hash: hashText(texto), verdict: "aprovado", parecer },
      arquivo
    );
  }
  await gravador.mudarFase("revisao_final");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pré-validação estrutural", () => {
  it("aprova fusão no staging com ledger real sem alterar manuscrito/estado canônicos", async () => {
    const contexto = JSON.stringify({ fatos: [], continuidade: [], repeticoes_recentes: [] });
    const auditor = JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } });
    provedor.enfileirar("contextualizador", contexto);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer));
    provedor.enfileirar("auditor_factual", auditor);
    const estadoAntes = (await persistencia.lerEstado("p"))!;
    const arquivosAntes = [1, 2].map((n) =>
      readFileSync(path.join(dir, "manuscrito", `capitulo-0${n}.md`), "utf8")
    );
    const deps: DepsPipeline = {
      gravador,
      persistencia,
      provedor,
      mapa: { raciocinio: "r", fatos: "f", prosa: "p", julgamento: "j" },
      contrato: { contrato, hash: "contrato", origem: "teste" },
      perfil: { texto: "perfil", skillId: "teste", hash: "perfil", validado: true },
      dirManuscrito: path.join(dir, "manuscrito"),
      projectId: "p",
      jobId: "job",
    };

    const r = await prepararEdicaoEstrutural({
      plano: {
        schema: "structural-edit/v1",
        propostas: [{ tipo: "fusao", capitulos: [1, 2], justificativa: "mesma unidade" }],
      },
      total: 2,
      deps,
      persistencia,
      estado: estadoAntes,
      dirProjeto: dir,
      jobId: "job",
    });

    expect(r.fusoes).toHaveLength(1);
    expect(r.fusoes[0]).toMatchObject({ origens: [1, 2], destino: 1 });
    expect(r.fusoes[0].conteudo.match(/^## Capítulo/gm)).toHaveLength(1);
    expect([1, 2].map((n) =>
      readFileSync(path.join(dir, "manuscrito", `capitulo-0${n}.md`), "utf8")
    )).toEqual(arquivosAntes);
    expect(await persistencia.lerEstado("p")).toEqual(estadoAntes);
    expect(existsSync(path.join(dir, "engine-v2", "edicoes-candidatas", "job", "fusao-1-2", "manuscrito", "capitulo-01.md"))).toBe(true);
    const reviews = readFileSync(path.join(dir, "engine-v2", "reviews.jsonl"), "utf8");
    expect(reviews).toContain(r.fusoes[0].reviewId);
  });
});
