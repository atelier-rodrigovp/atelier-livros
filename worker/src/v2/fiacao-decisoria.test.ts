// Fatia B — testes de MUTAÇÃO da fiação decisória.
//
// A regra: uma garantia só existe se MUDAR A ENTRADA MUDAR A DECISÃO. Cada teste
// aqui roda o mesmo cenário duas vezes, alterando UM único campo, e exige que o
// veredito observável mude. Presença de função, de campo ou de leitor não conta.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import { avaliarFechamentoLivro } from "./fechamento.js";
import { itensExigidos } from "./conformidade.js";
import { conformidadeOk, conformidadeReprovando } from "./fixtures-teste.js";
import type { ArcoFundacao, Parecer, SceneSpec, SkillContract } from "./tipos.js";

// ---------------------------------------------------------------------------
// Fixtures mínimas (espelham pipeline.test.ts)
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
  faixa_palavras: { alvo: 60 },
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

function ficha(over: Partial<SceneSpec> = {}): SceneSpec {
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
    ...over,
  };
}

const PROSA_OK = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. O arquivista atendeu o telefone na sala ao lado e baixou a voz. Ela abriu o livro de registros de 1987 e fotografou a linha com o nome do irmão. A folha seguinte tinha sido arrancada rente à costura. Atrás dela, a chave girou na fechadura.",
].join("\n");

const CTX_OK = JSON.stringify({
  fatos: [{ fato: "O registro de 1987 existe no consulado", origem: "cap 1" }],
  continuidade: [{ item: "Marina carrega a câmera emprestada do irmão", origem: "cap 2" }],
  repeticoes_recentes: ["cheiro de papel queimado"],
});

const auditor = (pov: { ha: boolean; detalhe: string }) =>
  JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: pov });

function parecerAprovado(): Parecer {
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
  };
}

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let deps: DepsPipeline;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-fiacao-"));
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

// ---------------------------------------------------------------------------
// B1. pov_violado
// ---------------------------------------------------------------------------

describe("mutação: pov_violado decide o veredito do capítulo", () => {
  function enfileirarCiclo(povViolado: { ha: boolean; detalhe: string }, rodadas = 1) {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    for (let i = 0; i < rodadas; i++) {
      provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
      provedor.enfileirar("auditor_factual", auditor(povViolado));
      if (i < rodadas - 1) provedor.enfileirar("escritor", PROSA_OK);
    }
  }

  it("CONTROLE: pov_violado.ha=false com o revisor aprovando → aprovado", async () => {
    enfileirarCiclo({ ha: false, detalhe: "" });
    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");
    expect(r.problemas.filter((p) => p.startsWith("POV violado"))).toEqual([]);
  });

  it("[DOD:B-01] MUTAÇÃO: só `pov_violado.ha` vira true → o MESMO capítulo, com o MESMO parecer aprovado, reprova", async () => {
    // 3 rodadas: o pipeline tenta corrigir (orçamento 2) antes de reprovar.
    enfileirarCiclo({ ha: true, detalhe: "parágrafo 2 entra na cabeça do arquivista, fora do POV de Marina" }, 3);
    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("reprovado");
    expect(r.problemas.some((p) => p.startsWith("POV violado"))).toBe(true);
    expect(r.problemas.join(" ")).toContain("entra na cabeça do arquivista");
  });

  it("a violação de POV vira correção dirigida ao escritor (não morre sem tentativa)", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: true, detalhe: "narrador acessa o arquivista" }));
    provedor.enfileirar("escritor", PROSA_OK.replace("Atrás dela", "Marina ouviu atrás de si"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");

    const chamadasEscritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    expect(chamadasEscritor).toHaveLength(2);
    expect(chamadasEscritor[1].prompt).toContain("POV violado");
    expect(chamadasEscritor[1].prompt).toContain("terceira_proxima");
  });

  it("pov_violado.ha=true SEM detalhe é protocolo violado (retry técnico), nunca reprova sem evidência", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: true, detalhe: "   " })); // evidência vazia
    provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" })); // retry do auditor

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");

    const chamadasAuditor = provedor.chamadas.filter((c) => c.papel === "auditor_factual");
    expect(chamadasAuditor).toHaveLength(2);
    expect(chamadasAuditor[1].prompt).toContain("CORREÇÃO");
    expect(chamadasAuditor[1].prompt).toContain("detalhe");
  });
});

// ---------------------------------------------------------------------------
// B2. gate de fechamento: promessa não paga
// ---------------------------------------------------------------------------

const arcoComPromessa: ArcoFundacao = {
  atos: [{ numero: 1, do_capitulo: 1, ao_capitulo: 3, funcao: "abertura", tensao_alvo: 4 }],
  promessas: [{ id: "P7", enunciado: "o farol volta a funcionar", plantada_em: 1, reforcada_em: [], paga_em: 3 }],
  fios: [],
  arcos: [],
};

async function aprovarCapituloComFicha(n: number, over: Partial<SceneSpec> = {}) {
  const f = ficha({ capitulo: n, ...over });
  // "Verdade no disco": o gravador só aprova capítulo cujo arquivo existe.
  const caminho = path.join(dir, "manuscrito", `capitulo-0${n}.md`);
  const texto = PROSA_OK.replace("Capítulo 3", `Capítulo ${n}`);
  mkdirSync(path.dirname(caminho), { recursive: true });
  writeFileSync(caminho, texto, "utf8");
  await disco.inserirSpec({
    project_id: "proj-1",
    edition_id: null,
    capitulo: n,
    versao: 1,
    hash: `h-${n}`,
    status: "validada",
    ficha: f,
    origem_run_id: `run-${n}`,
  });
  await deps.gravador.aprovarCapitulo(
    n,
    { id: `rev-${n}`, text_hash: hashText(texto), verdict: "aprovado", parecer: parecerAprovado() },
    caminho,
    []
  );
}

describe("mutação: promessa não paga bloqueia o FECHAMENTO do livro", () => {
  it("[DOD:H-03] memória incompleta bloqueia o fechamento, mesmo sem arco", async () => {
    await deps.gravador.registrarMemoriaIncompleta(2);
    const r = await avaliarFechamentoLivro({
      projectId: "proj-1",
      total: 3,
      arco: undefined,
      estado: await deps.gravador.carregarEstado(),
      persistencia: disco,
    });
    expect(r.passou).toBe(false);
    expect(r.gates).toEqual([
      expect.objectContaining({
        gate: "memoria_prosa_incompleta",
        passou: false,
        evidencia: expect.stringContaining("capitulo:2"),
      }),
    ]);
  });

  it("CONTROLE: promessa plantada e paga na ficha do capítulo 3 → fechamento passa", async () => {
    await aprovarCapituloComFicha(1, { promessas_tocadas: [{ id: "P7", acao: "planta" }] });
    await aprovarCapituloComFicha(2);
    await aprovarCapituloComFicha(3, { promessas_tocadas: [{ id: "P7", acao: "paga" }] });

    const r = await avaliarFechamentoLivro({
      projectId: "proj-1",
      total: 3,
      arco: arcoComPromessa,
      estado: await deps.gravador.carregarEstado(),
      persistencia: disco,
    });
    expect(r.passou).toBe(true);
  });

  it("[DOD:B-02] MUTAÇÃO: a MESMA promessa deixa de ser paga na ficha → fechamento bloqueia citando o id", async () => {
    await aprovarCapituloComFicha(1, { promessas_tocadas: [{ id: "P7", acao: "planta" }] });
    await aprovarCapituloComFicha(2);
    await aprovarCapituloComFicha(3, { promessas_tocadas: [{ id: "P9", acao: "paga" }] }); // paga OUTRA

    const r = await avaliarFechamentoLivro({
      projectId: "proj-1",
      total: 3,
      arco: arcoComPromessa,
      estado: await deps.gravador.carregarEstado(),
      persistencia: disco,
    });
    expect(r.passou).toBe(false);
    expect(r.gates[0].gate).toBe("promessa_nao_paga");
    expect(r.gates[0].evidencia).toContain("P7");
    expect(r.gates[0].evidencia).toContain("o farol volta a funcionar");
  });

  it("fundação sem arco (v2) = no-op EXPLÍCITO, nunca aprovação silenciosa", async () => {
    const r = await avaliarFechamentoLivro({
      projectId: "proj-1",
      total: 3,
      arco: undefined,
      estado: await deps.gravador.carregarEstado(),
      persistencia: disco,
    });
    expect(r.passou).toBe(true);
    expect(r.naoAplicavel).toContain("sem grade de arco");
  });
});

describe("o gate de fechamento NÃO reprova o capítulo que apenas planta a promessa", () => {
  it("[DOD:B-03] capítulo 1 planta P7 (a pagar no 3) e é aprovado normalmente no ciclo do capítulo", async () => {
    const fichaPlanta = ficha({ capitulo: 1, promessas_tocadas: [{ id: "P7", acao: "planta" }] });
    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaPlanta));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK.replace("Capítulo 3", "Capítulo 1"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));

    const r = await escreverCapitulo(deps, 1);

    expect(r.status).toBe("aprovado");
    expect(r.gatesFalhos.map((g) => g.gate)).not.toContain("promessa_nao_paga");

    // E o fechamento, com o livro ainda em 1 de 3, é que acusa a pendência.
    const fech = await avaliarFechamentoLivro({
      projectId: "proj-1",
      total: 3,
      arco: arcoComPromessa,
      estado: await deps.gravador.carregarEstado(),
      persistencia: disco,
    });
    expect(fech.passou).toBe(false);
    expect(fech.gates[0].evidencia).toContain("capitulo_de_pagamento_nao_aprovado");
  });
});

describe("fiação das três camadas de repetição no pipeline", () => {
  it("[DOD:I-05] repetição semântica com evidência nos dois capítulos bloqueia antes do revisor", async () => {
    await aprovarCapituloComFicha(1, {
      informacao_nova: "o nome do irmão consta como acompanhante",
    });
    const textoAnterior = PROSA_OK.replace("Capítulo 3", "Capítulo 1");
    await deps.gravador.registrarMemoriaDaProsa(1, [{
      id: "M01.1",
      tipo: "revelacao",
      capitulo: 1,
      enunciado: "o nome do irmão consta como acompanhante",
      trecho: "fotografou a linha com o nome do irmão",
      confianca: "alta",
      text_hash: hashText(textoAnterior),
      origem: "prosa",
      estado: "aberta",
    }], []);

    const atual = ficha({
      capitulo: 3,
      informacao_nova: "o nome do irmão consta como acompanhante",
    });
    const textoAtual = [
      "## Capítulo 3",
      "",
      "Marina leu a coluna final do registro. Ao lado do nome do irmão, a palavra acompanhante surgia em tinta azul. Ela fechou o livro quando a maçaneta começou a girar.",
    ].join("\n");
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", textoAtual);

    const r = await escreverCapitulo(
      { ...deps, maxCorrecoes: 0 },
      3,
      { fichaExistente: atual, anteriores: [{ numero: 1, trecho: textoAnterior }] }
    );

    expect(r.status).toBe("bloqueado");
    expect(r.gatesFalhos.some((g) => g.gate === "repeticao_semantica")).toBe(true);
    expect(provedor.chamadas.some((c) => c.papel === "revisor_literario")).toBe(false);
  });

  it("[DOD:I-06] maneirismo em cinco capítulos entra nos prompts de escrita e julgamento", async () => {
    const anteriores = Array.from({ length: 5 }, (_, indice) => ({
      numero: indice + 1,
      trecho: `## Capítulo ${indice + 1}\n\nNão era medo, era cálculo. A porta fechou atrás dela.`,
    }));
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha({ capitulo: 6 })));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK.replace("Capítulo 3", "Capítulo 6"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));

    const r = await escreverCapitulo(deps, 6, { anteriores });
    expect(r.status).toBe("aprovado");
    expect(provedor.chamadas.find((c) => c.papel === "escritor")?.prompt).toContain("MANEIRISMO ACUMULADO");
    expect(provedor.chamadas.find((c) => c.papel === "revisor_literario")?.prompt).toContain("MANEIRISMO ACUMULADO");
  });
});

// ---------------------------------------------------------------------------
// Fatia G — a conformidade ficha→prosa decide no PIPELINE REAL
// ---------------------------------------------------------------------------

describe("mutação: conformidade ficha → prosa decide o veredito", () => {
  function cicloBase() {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
  }

  it("CONTROLE: conformidade conforme + revisor aprovando → aprovado", async () => {
    cicloBase();
    provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
    provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));
    provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(), PROSA_OK));

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");
  });

  it("MUTAÇÃO: o MESMO capítulo, com o MESMO parecer aprovado, reprova quando a VIRADA não é cumprida", async () => {
    cicloBase();
    for (let i = 0; i < 3; i++) {
      provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
      provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));
      provedor.enfileirar(
        "conformidade_ficha",
        conformidadeReprovando(ficha(), PROSA_OK, "virada", "a página arrancada é mencionada, mas nada muda por causa dela")
      );
      if (i < 2) provedor.enfileirar("escritor", PROSA_OK);
    }

    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("reprovado");
    const problema = r.problemas.find((p) => p.startsWith("conformidade [virada]"));
    expect(problema).toBeDefined();
    expect(problema).toContain("nada muda por causa dela");
  });

  it("MUTAÇÃO: trecho citado que NÃO existe no capítulo não sustenta aprovação", async () => {
    cicloBase();
    const inventado = JSON.stringify({
      afirmacoes: itensExigidos(ficha()).map((item) => ({
        item,
        cumprido: true,
        trecho: "o arquivista sacou uma arma e apontou para Marina sem dizer nada",
        justificativa: "entrega o item",
      })),
    });
    for (let i = 0; i < 3; i++) {
      provedor.enfileirar("revisor_literario", JSON.stringify(parecerAprovado()));
      provedor.enfileirar("auditor_factual", auditor({ ha: false, detalhe: "" }));
      provedor.enfileirar("conformidade_ficha", inventado);
      if (i < 2) provedor.enfileirar("escritor", PROSA_OK);
    }

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("reprovado");
    expect(r.problemas.some((p) => p.includes("trecho_ausente_no_texto"))).toBe(true);
  });
});
