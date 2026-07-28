// Ciclo COMPLETO com mock: interface → worker → gates → Storage → Leitor.
//
// Prova o caminho inteiro sem cota, sem modelo real e sem tocar projeto remoto:
// o que a tela envia (briefing aprovado, autorização) chega ao worker; o worker
// roda os papéis com ProvedorMock, os gates decidem, o capítulo aprovado vira
// arquivo no "Storage" (adapter local) e o Leitor o renderiza.
//
// Nada aqui gera canário nem escreve O Farol Cego.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { ProvedorMock } from "./provedor.js";
import { escreverCapituloComEscada } from "./correcao.js";
import { avaliarFechamentoLivro } from "./fechamento.js";
import { aprovarBriefing, autorizarFundacao } from "./briefing-aprovacao.js";
import { exigirReleaseAtual, type AutorizacaoProjetoV2 } from "./release.js";
import { chaveStorage, documentosDaFundacao, indiceDeDocumentos } from "./documentos.js";
import { conformidadeOk } from "./fixtures-teste.js";
import { montarPainel } from "../../../src/lib/painelEditorial.js";
import { documentosParaExibir } from "../../../src/lib/documentosFundacao.js";
import { mdToHtml, primeiroTitulo } from "../../../src/lib/reader.js";
import type { BriefingAutor } from "./briefing.js";
import type { FundacaoV2 } from "./fundacao.js";
import type { ArcoFundacao, Parecer, SceneSpec, SkillContract } from "./tipos.js";

// ---------------------------------------------------------------------------
// Adapter local de Storage: mesma forma de chave que o worker usa em produção.
// ---------------------------------------------------------------------------

class StorageLocal {
  constructor(private readonly raiz: string) {}
  subir(chave: string, conteudo: string): void {
    const destino = path.join(this.raiz, chave);
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo, "utf8");
  }
  baixar(chave: string): string | null {
    const destino = path.join(this.raiz, chave);
    return existsSync(destino) ? readFileSync(destino, "utf8") : null;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER = "owner-1";
const PROJETO = "proj-mock";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Skill de Teste",
  familia_editorial: "thriller",
  motor_narrativo: "pergunta → virada",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: { alvo: 60 },
  ritmo: { descricao: "médio" },
  acao_interioridade: { relacao: "equilibrio", descricao: "equilíbrio" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "funcional" },
  politica_metafora: { descricao: "rara" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  estruturas_exigidas: { docs: ["dossie-factual.md"], campos_spec: [] },
  referencias: [],
  modelos_positivos: [],
};

const briefing: BriefingAutor = {
  ideia_central: "uma faroleira descobre um arquivo escondido no farol",
  autor: "Rodrigo Paiva",
  idioma: "pt-BR",
  genero: "thriller de enigma",
  tom: "seco",
  pdv: "terceira pessoa próxima",
  tempo_verbal: "pretérito",
  linha_tempo: "linear",
  final: "fechado",
  antagonista: "Helena Duarte",
  canone: "a maré de sizígia ocorre em março",
  proibido: "violência gratuita",
  protagonista: { nome: "Marina Alencar", ferida: "perdeu o irmão", desejo: "saber a verdade", segredo: "falsificou um registro" },
};

const arco: ArcoFundacao = {
  atos: [
    { numero: 1, cap_inicio: 1, cap_fim: 1, funcao: "instala", tensao_alvo: 2 },
    { numero: 2, cap_inicio: 2, cap_fim: 2, funcao: "paga", tensao_alvo: 5 },
  ],
  promessas: [{ id: "P1", enunciado: "o arquivo do farol vem à luz", plantada_em: 1, reforcada_em: [], paga_em: 2 }],
  fios: [{ id: "investigacao", nome: "investigacao", abre: 1, escalada: [1], climax: 2, fecha: 2 }],
  arcos: [
    {
      personagem: "Marina Alencar",
      marcos: [
        { capitulo: 1, estado: "acomodada" },
        { capitulo: 2, estado: "expõe a verdade" },
      ],
    },
  ],
};

const fundacao: FundacaoV2 = {
  perfil_voz: "Voz seca, frase curta, sem ornamento. ".repeat(4),
  biblia: "Marina cuida do farol de Ponta Rasa. Helena comanda o TPEA. A virada está no arquivo submerso. ".repeat(4),
  mapa_personagens: [
    { nome: "Marina Alencar", papel: "protagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "de guardiã acomodada a denunciante" },
    { nome: "Helena Duarte", papel: "antagonista", ferida: "f", segredo: "s", desejo: "d", voz: "v", arco: "de controladora a exposta" },
  ],
  estrutura: [
    { capitulo: 1, fio: "investigacao", resumo_estrutural: "Marina encontra a gravura no farol" },
    { capitulo: 2, fio: "investigacao", resumo_estrutural: "a verdade sobre o arquivo vem a público" },
  ],
  fios: ["investigacao"],
  promessa_editorial: "um thriller de enigma marítimo com pagamento honesto",
  arco,
  docs_exigidos: {
    "dossie-factual.md":
      "# Dossiê factual\n\nO farol de Ponta Rasa foi construído em 1911 e automatizado em 1987. " +
      "A maré de sizígia descobre o túnel duas vezes por ano. O TPEA operou entre 1984 e 1991 sob supervisão do ministério.",
  },
};

function ficha(capitulo: number, over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo,
    pov: "Marina",
    local: "farol de Ponta Rasa",
    tempo: `Dia ${capitulo}`,
    objetivo: "abrir o alçapão do farol",
    obstaculo: "a fechadura está emperrada",
    acao_fisica: "força a dobradiça com a chave de fenda",
    informacao_nova: `o alçapão esconde um arquivo do capítulo ${capitulo}`,
    virada: "o alçapão cede e revela degraus",
    mudanca_estado: "de curiosa a comprometida",
    gancho: { tipo: "ameaca", descricao: "passos no cais" },
    fatos_obrigatorios: [],
    conhecimentos_proibidos: [],
    fios_avancados: ["investigacao"],
    fios_ausentes: [],
    ato: capitulo,
    tensao_alvo: capitulo === 1 ? 2 : 5,
    promessas_tocadas: capitulo === 1 ? [{ id: "P1", acao: "planta" }] : [{ id: "P1", acao: "paga" }],
    marcos_arco: [{ personagem: "Marina Alencar", marco: capitulo === 1 ? "acomodada" : "expõe a verdade" }],
    ...over,
  };
}

const prosa = (capitulo: number) =>
  [
    `## Capítulo ${capitulo}`,
    "",
    `Marina encostou o ombro na porta do farol e sentiu o ferro ceder um dedo. A fechadura estava emperrada desde o inverno.`,
    `Ela forçou a dobradiça com a chave de fenda até o alçapão do capítulo ${capitulo} abrir sobre degraus de pedra.`,
    `Lá embaixo havia caixas de arquivo empilhadas contra a parede úmida. No cais, alguém caminhava devagar.`,
  ].join("\n");

function parecer(): Parecer {
  const eixo = { nota: 4, evidencia: "o alçapão que cede muda o rumo da cena" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "aprovado",
    evidencias: [{ local: "L:4", trecho: "No cais, alguém caminhava devagar", observacao: "gancho de ameaça localizado" }],
    sinais: [],
    correcoes: [],
  };
}

const CTX = JSON.stringify({ fatos: [], continuidade: [], repeticoes_recentes: [] });
const AUDITOR = JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } });

const memoriaDe = (capitulo: number, texto: string) =>
  JSON.stringify({
    entradas: [
      {
        tipo: "pista",
        enunciado: `há caixas de arquivo no subsolo do farol (cap ${capitulo})`,
        trecho: "havia caixas de arquivo empilhadas contra a parede úmida",
        confianca: "alta",
        origem: "prosa",
      },
    ],
    divergencias: [],
  });

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let gravador: Gravador;
let deps: DepsPipeline;
let storage: StorageLocal;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-mock-"));
  disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  gravador = new Gravador({ persistencia: disco, projectId: PROJETO });
  storage = new StorageLocal(path.join(dir, "storage"));
  deps = {
    gravador,
    persistencia: disco,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: { contrato, hash: "hash-contrato", origem: "worker/skills-v2/teste" },
    perfil: { texto: fundacao.perfil_voz, skillId: "teste", hash: "h-perfil", validado: true },
    dirManuscrito: path.join(dir, "manuscrito"),
    projectId: PROJETO,
    idioma: "pt-BR",
    fundacao: {
      biblia: fundacao.biblia,
      mapaPersonagens: JSON.stringify(fundacao.mapa_personagens),
      estrutura: fundacao.estrutura,
      arco,
    },
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// O ciclo
// ---------------------------------------------------------------------------

describe("ciclo completo com mock: interface → worker → gates → Storage → Leitor", () => {
  it("[DOD:Q-02] percorre o caminho inteiro e o capítulo aprovado chega legível ao Leitor", async () => {
    // --- 1. INTERFACE: o autor aprova o briefing e autoriza o projeto --------
    const aprovacao = aprovarBriefing(briefing, "rodrigo", "2026-07-28T00:00:00.000Z");
    expect(autorizarFundacao(briefing, aprovacao).permitido).toBe(true);

    const autorizacao: AutorizacaoProjetoV2 = {
      project_id: PROJETO,
      modo: "canario",
      autorizado_por: "rodrigo",
      motivo: "prova de integração com mock",
    };
    // Autorização de canário NÃO libera escrita de livro (fatia M/D3).
    expect(() => exigirReleaseAtual("teste", PROJETO, autorizacao, "escrita")).toThrow(/certificado/);

    // --- 2. FUNDAÇÃO: documentos no disco e no Storage -----------------------
    const docs = documentosDaFundacao(fundacao);
    for (const d of docs) storage.subir(chaveStorage(OWNER, PROJETO, d.caminho), d.conteudo);
    const indice = indiceDeDocumentos(docs, "2026-07-28T00:00:00.000Z");
    expect(indice.documentos.length).toBe(docs.length);

    // A interface abre o que existe (e só o que existe).
    const paraExibir = documentosParaExibir({ documentos: indice.documentos });
    for (const d of paraExibir) {
      expect(storage.baixar(chaveStorage(OWNER, PROJETO, d.caminho)), d.caminho).not.toBeNull();
    }
    expect(paraExibir.some((d) => d.origem === "contrato")).toBe(true);

    // --- 3. WORKER: escreve os dois capítulos pela escada --------------------
    for (const n of [1, 2]) {
      provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha(n)));
      provedor.enfileirar("contextualizador", CTX);
      provedor.enfileirar("escritor", prosa(n));
      provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
      provedor.enfileirar("auditor_factual", AUDITOR);
      provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(n), prosa(n)));
      provedor.enfileirar("extrator_memoria", memoriaDe(n, prosa(n)));

      const r = await escreverCapituloComEscada({ deps, gravador, capitulo: n });
      expect(r.status, `capítulo ${n}`).toBe("aprovado");
      expect(r.textHash).toBe(hashText(prosa(n)));
    }

    // --- 4. GATES DE FECHAMENTO: promessas cruzadas -------------------------
    const estado = await gravador.carregarEstado();
    const fechamento = await avaliarFechamentoLivro({
      projectId: PROJETO,
      total: 2,
      arco,
      estado,
      persistencia: disco,
    });
    // A pista aberta pela PROSA (fatia H) é cobrada: o livro não fecha limpo.
    expect(fechamento.passou).toBe(false);
    expect(fechamento.gates.some((g) => g.evidencia?.includes("caixas de arquivo"))).toBe(true);

    // --- 5. STORAGE: capítulos aprovados sobem -------------------------------
    for (const n of [1, 2]) {
      const caminho = path.join(deps.dirManuscrito, `capitulo-0${n}.md`);
      expect(existsSync(caminho)).toBe(true);
      storage.subir(chaveStorage(OWNER, PROJETO, `capitulo-0${n}.md`), readFileSync(caminho, "utf8"));
    }

    // --- 6. LEITOR: o capítulo é renderizado ---------------------------------
    const doStorage = storage.baixar(chaveStorage(OWNER, PROJETO, "capitulo-01.md"))!;
    expect(doStorage).toBe(prosa(1));
    expect(primeiroTitulo(doStorage)).toBe("Capítulo 1");
    const html = mdToHtml(doStorage);
    expect(html).toContain("Marina encostou o ombro na porta do farol");
    expect(html).not.toContain("<script");

    // --- 7. INTERFACE: o painel editorial mostra o que a engine sabe ---------
    const painel = montarPainel(estado.doc as never);
    expect(painel.promessasAbertas.length).toBeGreaterThan(0);
    expect(painel.promessasAbertas[0].trecho).toContain("caixas de arquivo");
    expect(painel.promessasAbertas[0].origem).toBe("prosa");
  });

  it("o estado canônico fica hash-bound e a memória da prosa é registrada", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha(1)));
    provedor.enfileirar("contextualizador", CTX);
    provedor.enfileirar("escritor", prosa(1));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR);
    provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(1), prosa(1)));
    provedor.enfileirar("extrator_memoria", memoriaDe(1, prosa(1)));

    await escreverCapitulo(deps, 1);

    const estado = await disco.lerEstado(PROJETO);
    expect(estado?.doc.capitulos["1"]).toMatchObject({ status: "aprovado", text_hash: hashText(prosa(1)) });
    const memoria = estado?.doc.memoria_prosa ?? [];
    expect(memoria).toHaveLength(1);
    expect(memoria[0].text_hash).toBe(hashText(prosa(1)));
    expect(memoria[0].origem).toBe("prosa");
  });

  it("capítulo REPROVADO não chega ao Storage nem ao Leitor", async () => {
    const ruim = parecer();
    ruim.continuity = { nota: 1, evidencia: "a cena contradiz o capítulo anterior" };

    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha(1)));
    provedor.enfileirar("contextualizador", CTX);
    provedor.enfileirar("escritor", prosa(1));
    for (let i = 0; i < 3; i++) {
      provedor.enfileirar("revisor_literario", JSON.stringify(ruim));
      provedor.enfileirar("auditor_factual", AUDITOR);
      provedor.enfileirar("conformidade_ficha", conformidadeOk(ficha(1), prosa(1)));
      if (i < 2) provedor.enfileirar("escritor", prosa(1));
    }

    const r = await escreverCapitulo(deps, 1);
    expect(r.status).toBe("reprovado");

    const estado = await disco.lerEstado(PROJETO);
    expect(estado?.doc.capitulos["1"]?.status).not.toBe("aprovado");
    // Nada foi publicado: o Storage do capítulo continua vazio.
    expect(storage.baixar(chaveStorage(OWNER, PROJETO, "capitulo-01.md"))).toBeNull();
  });

  it("briefing NÃO aprovado impede o ciclo antes de qualquer chamada de modelo", () => {
    const r = autorizarFundacao(briefing, null);
    expect(r.permitido).toBe(false);
    expect(provedor.chamadas).toHaveLength(0);
  });
});
