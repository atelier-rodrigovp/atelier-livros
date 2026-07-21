// Testes da meta-nota (meta9.ts) com DiscoPersistencia + ProvedorMock.
// A fila do ProvedorMock é FIFO por papel: a avaliação de livro e a revisão do capítulo
// reescrito compartilham o papel "revisor_literario" — a ordem de enfileiramento reflete
// a ordem real de consumo (avaliação → revisão da reescrita → reavaliação).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { executarMeta9, type DepsMeta9 } from "./meta9.js";
import { ProvedorMock } from "./provedor.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

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

const PROSA_BASE = [
  "## Capítulo 1",
  "",
  "Marina abriu a porta e o corredor cheirava a papel velho. Ela guardou a câmera no bolso e desceu a escada. A chave girou na fechadura atrás dela.",
].join("\n");

const PROSA_REESCRITA = [
  "## Capítulo 1",
  "",
  "Marina abriu a porta e o corredor cheirava a papel velho. Ela guardou a câmera no bolso e desceu a escada devagar. Atrás dela, a chave girou na fechadura e a luz se apagou de vez.",
].join("\n");

const CTX_OK = JSON.stringify({
  fatos: [{ fato: "O registro de 1987 existe no consulado", origem: "cap 1" }],
  continuidade: [{ item: "Marina carrega a câmera do irmão", origem: "cap 1" }],
  repeticoes_recentes: [],
});

const AUDITOR_LIMPO = JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } });

function parecerCapitulo(): string {
  const eixo = { nota: 4, evidencia: "a folha arrancada muda a cena" };
  const p: Parecer = {
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
  return JSON.stringify(p);
}

function avaliacao(nota: number, reescrever: { capitulo: number; problemas: string[]; instrucoes: string[] }[] = []): string {
  return JSON.stringify({
    schema: "avaliacao-livro/v1",
    nota,
    pontos_fortes: ["gancho de abertura forte", "progressão clara"],
    pontos_fracos: nota >= 9 ? [] : ["final do capítulo 1 sem consequência"],
    capitulos_a_reescrever: reescrever,
    resumo: `avaliação com nota ${nota}`,
  });
}

// ---------------------------------------------------------------------------

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let gravador: Gravador;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-meta9-"));
  disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  gravador = new Gravador({ persistencia: disco, projectId: "proj-1" });
  // Semeia 1 capítulo aprovado + ficha persistida + fase revisao_final.
  mkdirSync(path.join(dir, "manuscrito"), { recursive: true });
  const caminho = path.join(dir, "manuscrito", "capitulo-01.md");
  writeFileSync(caminho, PROSA_BASE, "utf8");
  await disco.inserirSpec({ project_id: "proj-1", edition_id: null, capitulo: 1, versao: 1, hash: "h1", status: "validada", ficha: fichaDe(1) });
  await gravador.mudarFase("estrutura");
  await gravador.mudarFase("escrita");
  await gravador.registrarCapituloEscrito(1, caminho, { palavras: 26, spec_versao: 1, spec_hash: "h1" });
  await gravador.mudarFase("revisao_final");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps(over: Partial<DepsMeta9> = {}): DepsMeta9 {
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
    ...over,
  };
}

function lerReviews(): { op: string; registro: Record<string, unknown> }[] {
  const destino = path.join(dir, "engine-v2", "reviews.jsonl");
  if (!existsSync(destino)) return [];
  return readFileSync(destino, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

describe("executarMeta9", () => {
  it("retomada: fase já em avaliacao não tenta transição inválida e conclui", async () => {
    // Simula um crash anterior: a fase ficou em "avaliacao" (consolidação já feita).
    await gravador.mudarFase("consolidacao");
    await gravador.mudarFase("avaliacao");
    provedor.enfileirar("revisor_literario", avaliacao(9.1));

    const r = await executarMeta9(deps({ meta: 9 }));

    expect(r).toMatchObject({ atingiu: true, nota: 9.1, iteracoes: 1 });
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.fase).toBe("concluido");
  });

  it("nota ≥ meta na 1ª avaliação: consolida, salva relatório, review de livro e conclui", async () => {
    provedor.enfileirar("revisor_literario", avaliacao(9.3));

    const r = await executarMeta9(deps({ meta: 9 }));

    expect(r).toMatchObject({ atingiu: true, nota: 9.3, iteracoes: 1 });
    // MANUSCRITO-MESTRE.md consolidado
    expect(existsSync(path.join(dir, "MANUSCRITO-MESTRE.md"))).toBe(true);
    // Relatório REAL salvo
    expect(existsSync(path.join(dir, "avaliacoes", "avaliacao-01.json"))).toBe(true);
    // Review de livro (capitulo null) persistida
    const reviews = lerReviews().filter((x) => x.registro.capitulo === null);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].registro).toMatchObject({ verdict: "aprovado", capitulo: null });
    // Estado com nota e fase concluido
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.avaliacao?.nota).toBe(9.3);
    expect(estado?.doc.fase).toBe("concluido");
  });

  it("nota abaixo: reescreve o capítulo apontado (com as instruções do avaliador) e reavalia até a meta", async () => {
    // FIFO revisor_literario: avaliação baixa → revisão do capítulo reescrito → reavaliação alta
    provedor.enfileirar("revisor_literario", avaliacao(7, [{ capitulo: 1, problemas: ["final sem consequência"], instrucoes: ["feche com uma consequência concreta"] }]));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_REESCRITA);
    provedor.enfileirar("revisor_literario", parecerCapitulo());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("revisor_literario", avaliacao(9.1));

    const r = await executarMeta9(deps({ meta: 9 }));

    expect(r).toMatchObject({ atingiu: true, nota: 9.1 });
    // A reescrita usou o modo reescrita e a instrução do avaliador
    const escritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    expect(escritor).toHaveLength(1);
    expect(escritor[0].prompt).toContain("Reescreva o capítulo");
    expect(escritor[0].prompt).toContain("feche com uma consequência concreta");
    // O capítulo no disco é a versão reescrita
    expect(readFileSync(path.join(dir, "manuscrito", "capitulo-01.md"), "utf8")).toBe(PROSA_REESCRITA);
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.fase).toBe("concluido");
    expect(estado?.doc.avaliacao?.nota).toBe(9.1);
  });

  it("orçamento esgotado: reescreve, não atinge a meta, bloqueia e lança META_NAO_ATINGIDA", async () => {
    provedor.enfileirar("revisor_literario", avaliacao(7, [{ capitulo: 1, problemas: ["final fraco"], instrucoes: ["feche melhor"] }]));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_REESCRITA);
    provedor.enfileirar("revisor_literario", parecerCapitulo());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("revisor_literario", avaliacao(7.5)); // 2ª avaliação ainda abaixo

    await expect(executarMeta9(deps({ meta: 9, maxIteracoes: 2 }))).rejects.toMatchObject({
      name: "ErroEngine",
      codigo: "META_NAO_ATINGIDA",
      classe: "qualidade",
    });

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.bloqueios.some((b) => b.codigo === "META_NAO_ATINGIDA" && b.alvo === "livro")).toBe(true);
    // Review de livro reprovada persistida
    const reprovadas = lerReviews().filter((x) => x.registro.capitulo === null && x.registro.verdict === "reprovado");
    expect(reprovadas.length).toBeGreaterThanOrEqual(1);
  });
});
