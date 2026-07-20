// Testes do ciclo por capítulo (pipeline.ts) com DiscoPersistencia + ProvedorMock.
// As respostas dos papéis são roteirizadas na ordem: arquiteto_cena, contextualizador,
// escritor, revisor_literario, auditor_factual.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
  faixa_palavras: { alvo: 60 }, // sem min/max: sinal "palavras" nunca sai da cota nos testes
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

function ficha(): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 3,
    pov: "Marina",
    local: "arquivo do consulado",
    tempo: "Dia 2, 14h30",
    objetivo: "obter o registro de entrada de 1987",
    obstaculo: "o arquivista exige autorização que ela não tem",
    acao_fisica: "ela fotografa o livro de registros enquanto o arquivista atende o telefone",
    informacao_nova: "o nome do irmão consta como acompanhante",
    virada: "a página seguinte foi arrancada",
    mudanca_estado: "de confiante para exposta: o arquivista percebe a câmera",
    gancho: { tipo: "ameaca", descricao: "o arquivista tranca a porta ao telefone com alguém" },
    fatos_obrigatorios: ["registro de 1987 existe", "irmão esteve no consulado"],
    conhecimentos_proibidos: ["Marina não sabe quem arrancou a página"],
    fios_avancados: ["investigacao"],
    fios_ausentes: ["romance"],
  };
}

const PROSA_OK = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. O arquivista atendeu o telefone na sala ao lado e baixou a voz. Ela abriu o livro de registros de 1987 e fotografou a linha com o nome do irmão. A folha seguinte tinha sido arrancada rente à costura. Atrás dela, a chave girou na fechadura.",
].join("\n");

const PROSA_CORRIGIDA = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. O arquivista atendeu o telefone na sala ao lado e baixou a voz. Ela abriu o livro de registros de 1987 e fotografou a linha com o nome do irmão. A folha seguinte tinha sido arrancada rente à costura. O arquivista desligou o telefone e caminhou até a porta com a chave na mão.",
].join("\n");

// Termina em conector, sem pontuação terminal → gate texto_truncado falha.
const PROSA_TRUNCADA = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. Ela abriu o livro de registros de 1987 e",
].join("\n");

const CTX_OK = JSON.stringify({
  fatos: [{ fato: "O registro de 1987 existe no consulado", origem: "cap 1" }],
  continuidade: [{ item: "Marina carrega a câmera emprestada do irmão", origem: "cap 2" }],
  repeticoes_recentes: ["cheiro de papel queimado"],
});

// Item com 80 palavras = prosa disfarçada de fato → parse rejeita.
const CTX_PROSA = JSON.stringify({
  fatos: [{ fato: Array(80).fill("palavra").join(" "), origem: "cap 1" }],
  continuidade: [],
  repeticoes_recentes: [],
});

const AUDITOR_LIMPO = JSON.stringify({
  contradicoes: [],
  conhecimento_indevido: [],
  pov_violado: { ha: false, detalhe: "" },
});

const AUDITOR_CONTRADICAO = JSON.stringify({
  contradicoes: [
    {
      fato_estabelecido: "O registro de 1987 existe no consulado",
      trecho_do_capitulo: "o livro de registros de 1987",
      gravidade: "bloqueante",
    },
  ],
  conhecimento_indevido: [],
  pov_violado: { ha: false, detalhe: "" },
});

function parecer(over: Partial<Parecer> = {}): Parecer {
  const eixo = { nota: 4, evidencia: "a folha arrancada muda o objetivo da cena" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "aprovado",
    evidencias: [
      { local: "L:5", trecho: "a chave girou na fechadura", observacao: "gancho de ameaça concreto e localizado" },
    ],
    sinais: [],
    correcoes: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let deps: DepsPipeline;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-pipe-"));
  disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  deps = {
    gravador: new Gravador({ persistencia: disco, projectId: "proj-1" }),
    persistencia: disco,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: { contrato, hash: "hash-contrato", origem: "worker/skills-v2/teste" },
    perfil: { texto: "Perfil de voz validado do livro de teste.", skillId: "teste", hash: "h-perfil", validado: true },
    dirManuscrito: path.join(dir, "manuscrito"),
    projectId: "proj-1",
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function lerJsonl(nome: string): { op: string; registro: Record<string, unknown> }[] {
  const destino = path.join(dir, "engine-v2", nome);
  if (!existsSync(destino)) return [];
  return readFileSync(destino, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { op: string; registro: Record<string, unknown> });
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

describe("escreverCapitulo — caminho feliz", () => {
  it("ficha → contexto → prosa → gates → parecer → auditor → aprovado", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("aprovado");
    expect(r.capitulo).toBe(3);
    expect(r.textHash).toBe(hashText(PROSA_OK));
    expect(r.gatesFalhos).toEqual([]);
    expect(r.problemas).toEqual([]);
    expect(r.runs).toHaveLength(5);

    // Arquivo no disco escrito pelo pipeline (não pelo modelo)
    const caminho = path.join(dir, "manuscrito", "capitulo-03.md");
    expect(existsSync(caminho)).toBe(true);
    expect(readFileSync(caminho, "utf8")).toBe(PROSA_OK);

    // Estado canônico com aprovação hash-bound
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["3"]).toMatchObject({
      status: "aprovado",
      text_hash: hashText(PROSA_OK),
      review_id: r.reviewId,
      spec_versao: 1,
    });

    // Review persistida no jsonl
    const reviews = lerJsonl("reviews.jsonl");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].registro).toMatchObject({
      capitulo: 3,
      verdict: "aprovado",
      text_hash: hashText(PROSA_OK),
      project_id: "proj-1",
    });

    // Spec persistida (versão 1, validada, com run de origem)
    const specs = lerJsonl("specs.jsonl");
    expect(specs).toHaveLength(1);
    expect(specs[0].registro).toMatchObject({ capitulo: 3, versao: 1, status: "validada" });
    expect(specs[0].registro.origem_run_id).toBeTruthy();

    // Runs no ledger, todos com input_bundle_hash preenchido
    const runs = await disco.lerRuns();
    expect(runs.length).toBeGreaterThanOrEqual(5);
    for (const run of runs) expect(run.input_bundle_hash).toBeTruthy();
    expect(runs.every((run) => run.status === "ok")).toBe(true);
  });
});

describe("escreverCapitulo — retry técnico da ficha", () => {
  it("ficha com aforismo falha no parse; retry com ficha corrigida segue até aprovado", async () => {
    const fichaRuim = { ...ficha(), virada: "Ela entende que a memória é uma dívida que ninguém escolhe pagar." };
    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaRuim));
    provedor.enfileirar("arquiteto_cena", "```json\n" + JSON.stringify(ficha()) + "\n```"); // cerca aceita
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");

    // O executor fez o retry técnico com a mensagem do erro no prompt
    const chamadasArquiteto = provedor.chamadas.filter((c) => c.papel === "arquiteto_cena");
    expect(chamadasArquiteto).toHaveLength(2);
    expect(chamadasArquiteto[1].prompt).toContain("CORREÇÃO");
    expect(chamadasArquiteto[1].prompt).toContain("ficha inválida");

    // Ledger: primeira tentativa falha (FORA_DO_SCHEMA), segunda ok
    const runsArquiteto = (await disco.lerRuns()).filter((run) => run.papel === "arquiteto_cena");
    expect(runsArquiteto.map((run) => run.status).sort()).toEqual(["falha", "ok"]);
    expect(runsArquiteto.find((run) => run.status === "falha")?.erro?.codigo).toBe("FORA_DO_SCHEMA");
  });
});

describe("escreverCapitulo — correção de gate", () => {
  it("prosa truncada falha o gate; uma correção dirigida resolve e aprova", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_TRUNCADA);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");
    expect(r.runs).toHaveLength(6); // escritor rodou duas vezes

    // A correção dirigida citou o gate falho e o texto atual
    const chamadasEscritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    expect(chamadasEscritor).toHaveLength(2);
    expect(chamadasEscritor[1].prompt).toContain("CORREÇÕES");
    expect(chamadasEscritor[1].prompt).toContain("texto_truncado");

    // O arquivo final é a prosa corrigida
    expect(readFileSync(path.join(dir, "manuscrito", "capitulo-03.md"), "utf8")).toBe(PROSA_OK);
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["3"]?.status).toBe("aprovado");
    expect(estado?.doc.capitulos["3"]?.text_hash).toBe(hashText(PROSA_OK));
  });
});

describe("escreverCapitulo — aprovação sem evidência rebaixa", () => {
  it("conferirParecer rebaixa; correção roda; parecer seguinte reprova e bloqueia", async () => {
    // fichaExistente: pula o arquiteto e NÃO insere spec
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    // Parecer "aprovado" SEM evidências, mas com correções → rebaixado, vira correção dirigida
    provedor.enfileirar(
      "revisor_literario",
      JSON.stringify(
        parecer({
          evidencias: [],
          correcoes: [{ local: "L:3", problema: "cena sem consequência", instrucao: "feche com consequência concreta" }],
        })
      )
    );
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_CORRIGIDA);
    // Segunda revisão reprova sem correções → encerra reprovado
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer({ verdict: "reprovado", evidencias: [], correcoes: [] })));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, { fichaExistente: ficha() });

    expect(r.status).toBe("reprovado");
    expect(r.problemas).toContain("aprovação sem evidência positiva");
    expect(r.textHash).toBe(hashText(PROSA_CORRIGIDA));
    expect(r.runs).toHaveLength(7); // ctx + escritor + (rev+aud) + escritor + (rev+aud)

    // Review reprovada persistida + bloqueio registrado no estado
    const reviews = lerJsonl("reviews.jsonl");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].registro).toMatchObject({ verdict: "reprovado", text_hash: hashText(PROSA_CORRIGIDA) });
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.bloqueios.some((b) => b.codigo === "QUALIDADE_REPROVADA" && b.alvo === "capitulo:3")).toBe(true);
    expect(estado?.doc.capitulos["3"]?.status).toBe("bloqueado");

    // fichaExistente: nenhuma spec inserida
    expect(lerJsonl("specs.jsonl")).toHaveLength(0);
  });
});

describe("escreverCapitulo — auditoria factual", () => {
  it("contradição bloqueante reprova mesmo com parecer aprovado", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer())); // aprovado com evidência
    provedor.enfileirar("auditor_factual", AUDITOR_CONTRADICAO);

    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("reprovado");
    expect(r.problemas.some((p) => p.startsWith("contradição factual comprovada"))).toBe(true);

    const reviews = lerJsonl("reviews.jsonl");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].registro).toMatchObject({ verdict: "reprovado" });
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.bloqueios.some((b) => b.codigo === "QUALIDADE_REPROVADA")).toBe(true);
  });
});

describe("escreverCapitulo — contextualizador fora do schema", () => {
  it("item com 80 palavras rejeita; segunda saída inválida propaga ErroEngine FORA_DO_SCHEMA", async () => {
    provedor.enfileirar("contextualizador", CTX_PROSA);
    provedor.enfileirar("contextualizador", CTX_PROSA); // retry também inválido

    await expect(escreverCapitulo(deps, 3, { fichaExistente: ficha() })).rejects.toMatchObject({
      name: "ErroEngine",
      codigo: "FORA_DO_SCHEMA",
    });

    // As duas tentativas ficaram no ledger como falha
    const runsCtx = (await disco.lerRuns()).filter((run) => run.papel === "contextualizador");
    expect(runsCtx).toHaveLength(2);
    expect(runsCtx.every((run) => run.status === "falha")).toBe(true);
    expect(runsCtx.every((run) => run.erro?.codigo === "FORA_DO_SCHEMA")).toBe(true);
  });
});
