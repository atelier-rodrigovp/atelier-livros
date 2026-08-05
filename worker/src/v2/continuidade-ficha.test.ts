// META B — continuidade FICHA × PROSA APROVADA.
//
// Caso de reprodução: canário 2 (RELATORIO-COMPLETO-2026-08-05.md §3.1). No
// capítulo 1 aprovado, Beatriz é a paciente acamada com traqueostomia e dieta
// enteral. No capítulo 2, a ficha regenerada pela retomada colocou OTÁVIO na
// cama — e as quatro camadas de continuidade existentes deixaram passar.
//
// Os dois consertos nomeados no relatório, um teste cada:
//   1. gate ficha nova × memoria_prosa (contradição reprova ANTES da escrita);
//   2. a retomada REUTILIZA a ficha já validada em vez de regerá-la.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gravador } from "./gravador.js";
import { conflitosFichaContraMemoria } from "./memoria-prosa.js";
import { DiscoPersistencia } from "./persistencia.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import type { EntradaMemoria } from "./memoria-prosa.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

// ---------------------------------------------------------------------------
// O caso real, reduzido ao mínimo que o reproduz
// ---------------------------------------------------------------------------

const TRECHO_CAP1 =
  "Beatriz está na cama há dois meses, com a cânula de traqueostomia presa " +
  "por cadarço e a dieta enteral pendurada no suporte.";

/** Memória derivada da PROSA APROVADA do capítulo 1 (fatia H). */
const MEMORIA_CAP1: EntradaMemoria[] = [
  {
    id: "M01.1",
    tipo: "condicao_fisica",
    capitulo: 1,
    enunciado: "Beatriz está acamada há dois meses, com cânula de traqueostomia e dieta enteral",
    trecho: TRECHO_CAP1,
    quem: "Beatriz",
    confianca: "alta",
    text_hash: "h-cap1",
    origem: "prosa",
    estado: "aberta",
  },
  {
    id: "M01.2",
    tipo: "condicao_fisica",
    capitulo: 1,
    enunciado: "Otávio anda, fala e dirige o carro até o posto",
    trecho: "Otávio desceu a escada, pegou a chave e dirigiu até o posto sem dizer nada.",
    quem: "Otávio",
    confianca: "alta",
    text_hash: "h-cap1",
    origem: "prosa",
    estado: "aberta",
  },
];

function fichaCap2(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 2,
    pov: "Marina",
    local: "quarto dos fundos",
    tempo: "Dia 3, 21h00",
    objetivo: "trocar o curativo antes que o irmão chegue",
    obstaculo: "o aspirador de secreção parou de funcionar",
    acao_fisica: "ela abre o kit de curativo e testa o aspirador na tomada da cabeceira",
    informacao_nova: "o plano cortou a visita da enfermeira",
    virada: "o aspirador liga sozinho no meio da troca",
    mudanca_estado: "de contida para exposta: ela chora na frente do irmão",
    gancho: { tipo: "ameaca", descricao: "a campainha toca fora de hora" },
    fatos_obrigatorios: [],
    conhecimentos_proibidos: [],
    fios_avancados: ["cuidado"],
    fios_ausentes: [],
    ...over,
  };
}

describe("META B.1 — gate ficha × memória da prosa aprovada", () => {
  it("REPRODUÇÃO: a ficha põe Otávio acamado; a prosa aprovada diz que é Beatriz", () => {
    const ficha = fichaCap2({
      fatos_obrigatorios: [
        "Otávio está acamado há dois meses, com cânula de traqueostomia e dieta enteral",
      ],
    });
    const conflitos = conflitosFichaContraMemoria(ficha, MEMORIA_CAP1);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].quemNaProsa).toBe("Beatriz");
    expect(conflitos[0].quemNaFicha).toBe("Otávio");
    // Evidência: o trecho LITERAL da prosa aprovada, como o resto do repositório exige.
    expect(conflitos[0].trecho).toBe(TRECHO_CAP1);
  });

  it("a MESMA pessoa no mesmo estado não é conflito", () => {
    const ficha = fichaCap2({
      fatos_obrigatorios: [
        "Beatriz continua acamada há dois meses, com cânula de traqueostomia e dieta enteral",
      ],
    });
    expect(conflitosFichaContraMemoria(ficha, MEMORIA_CAP1)).toEqual([]);
  });

  it("ficha sem nada a ver com a memória não é conflito (falso positivo proibido)", () => {
    expect(conflitosFichaContraMemoria(fichaCap2(), MEMORIA_CAP1)).toEqual([]);
  });

  it("mudança que a PRÓPRIA prosa registrou não é conflito", () => {
    // A prosa do capítulo 2 já pôs Otávio no mesmo estado: o livro mudou, não a ficha.
    const memoria: EntradaMemoria[] = [
      ...MEMORIA_CAP1,
      {
        id: "M02.1",
        tipo: "condicao_fisica",
        capitulo: 2,
        enunciado: "Otávio está acamado há dois meses, com cânula de traqueostomia e dieta enteral",
        trecho: "Otávio agora ocupa a cama, com a mesma cânula de traqueostomia e a dieta enteral.",
        quem: "Otávio",
        confianca: "alta",
        text_hash: "h-cap2",
        origem: "prosa",
        estado: "aberta",
      },
    ];
    const ficha = fichaCap2({
      fatos_obrigatorios: [
        "Otávio está acamado há dois meses, com cânula de traqueostomia e dieta enteral",
      ],
    });
    expect(conflitosFichaContraMemoria(ficha, memoria)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// META B.2 — a retomada reutiliza a ficha validada
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

function fichaCap3(pov: string): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 3,
    pov,
    local: "arquivo do consulado",
    tempo: "Dia 2, 14h30",
    objetivo: "obter o registro de entrada de 1987",
    obstaculo: "o arquivista exige autorização que ela não tem",
    acao_fisica: "ela fotografa o livro de registros enquanto o arquivista atende o telefone",
    informacao_nova: "o nome do irmão consta como acompanhante",
    virada: "a página seguinte foi arrancada",
    mudanca_estado: "de confiante para exposta: o arquivista percebe a câmera",
    gancho: { tipo: "ameaca", descricao: "o arquivista tranca a porta ao telefone com alguém" },
    fatos_obrigatorios: ["registro de 1987 existe"],
    conhecimentos_proibidos: [],
    fios_avancados: ["investigacao"],
    fios_ausentes: [],
  };
}

const PROSA = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. O arquivista atendeu o telefone na sala ao lado e baixou a voz. Ela abriu o livro de registros de 1987 e fotografou a linha com o nome do irmão. A folha seguinte tinha sido arrancada rente à costura. Atrás dela, a chave girou na fechadura.",
].join("\n");

const CTX = JSON.stringify({
  fatos: [{ fato: "O registro de 1987 existe no consulado", origem: "cap 1" }],
  continuidade: [],
  repeticoes_recentes: [],
});

const AUDITOR_LIMPO = JSON.stringify({
  contradicoes: [],
  conhecimento_indevido: [],
  pov_violado: { ha: false, detalhe: "" },
});

function parecer(): Parecer {
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
    evidencias: [{ local: "L:5", trecho: "a chave girou na fechadura", observacao: "gancho concreto" }],
    sinais: [],
    correcoes: [],
  };
}

describe("META B.2 — retomada REUTILIZA a ficha validada, não regenera", () => {
  let dir: string;
  let disco: DiscoPersistencia;
  let provedor: ProvedorMock;
  let deps: DepsPipeline;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "engine-v2-retomada-"));
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
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function enfileirarCapitulo() {
    provedor.enfileirar("contextualizador", CTX);
    provedor.enfileirar("escritor", PROSA);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
  }

  it("na segunda passagem o arquiteto de cena NÃO é chamado de novo", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaCap3("Marina")));
    enfileirarCapitulo();
    const r1 = await escreverCapitulo(deps, 3);
    expect(r1.status).toBe("aprovado");

    // Retomada: mesma execução, mesmo capítulo. Se o pipeline regenerar a ficha,
    // ele consome esta — que traca o POV, como a v2 do canário 2 trocou o paciente.
    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaCap3("Otávio")));
    provedor.chamadas.length = 0;
    enfileirarCapitulo();
    const r2 = await escreverCapitulo(deps, 3);

    expect(r2.status).toBe("aprovado");
    expect(provedor.chamadas.map((c) => c.papel)).not.toContain("arquiteto_cena");
  });

  it("a estratégia `reficha` continua regenerando (é o ponto dela)", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaCap3("Marina")));
    enfileirarCapitulo();
    await escreverCapitulo(deps, 3);

    provedor.enfileirar("arquiteto_cena", JSON.stringify(fichaCap3("Marina")));
    provedor.chamadas.length = 0;
    enfileirarCapitulo();
    await escreverCapitulo(deps, 3, {
      correcaoDirigida: {
        estrategia: "reficha",
        blockers: ["a cena não avança"],
        hipotese: "o plano é a causa",
        tentativa: 1,
      },
    });

    expect(provedor.chamadas.map((c) => c.papel)).toContain("arquiteto_cena");
  });
});
