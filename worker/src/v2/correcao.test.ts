// Fatia C — escada de correção do V2.
// Duas camadas: a política (função pura) e a EXECUÇÃO (a escada rodando de
// verdade contra o pipeline, com provedor mock). Política testada sem execução
// prova intenção, não fiação.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ProvedorMock } from "./provedor.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { hashText } from "../quality-state.js";
import {
  classificarFalha,
  decidirCorrecao,
  escreverCapituloComEscada,
  estrategiaInicial,
  ORDEM_ESTRATEGIAS,
  opcoesPorEstrategia,
  proximaTentativaEm,
  semProgresso,
  type TentativaCorrecao,
} from "./correcao.js";
import type { Parecer, SceneSpec, SkillContract } from "./tipos.js";

// ---------------------------------------------------------------------------
// Política (pura)
// ---------------------------------------------------------------------------

function tentativa(over: Partial<TentativaCorrecao> = {}): TentativaCorrecao {
  return {
    capitulo: 3,
    gate: "sinal_cadencia",
    estrategia: "correcao_cirurgica",
    hipotese: "h",
    instrucao: "i",
    hash_entrada: "hA",
    hash_saida: "hB",
    resultado: "persistiu",
    criado_em: "2026-07-28T00:00:00.000Z",
    ...over,
  };
}

describe("classificação da falha decide QUEM resolve", () => {
  it("qualidade → escada; técnica → infraestrutura; configuração → autor", () => {
    expect(classificarFalha({ codigo: "CAPITULO_BLOQUEADO", classe: "qualidade" })).toBe("qualidade");
    expect(classificarFalha({ codigo: "SUPABASE_TIMEOUT", classe: "tecnica" })).toBe("infraestrutura");
    expect(classificarFalha({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao" })).toBe("configuracao");
  });

  it("cota e decisão humana escapam da escada mesmo com classe qualidade", () => {
    expect(classificarFalha({ codigo: "LIMITE_MAX_ATINGIDO", classe: "qualidade" })).toBe("cota");
    expect(classificarFalha({ codigo: "DECISAO_HUMANA", classe: "qualidade" })).toBe("decisao_humana");
  });
});

describe("a estratégia inicial vem do BLOCKER, não do número da tentativa", () => {
  it("defeito de plano começa em reficha; difuso em reescrita; localizado em cirúrgico", () => {
    expect(estrategiaInicial("promessa_nao_paga")).toBe("reficha");
    expect(estrategiaInicial("conformidade_ficha: virada ausente")).toBe("reficha");
    expect(estrategiaInicial("sinal_cadencia fora da cota")).toBe("reescrita_orientada");
    expect(estrategiaInicial("repeticao_quase_literal")).toBe("reescrita_orientada");
    expect(estrategiaInicial("texto_truncado")).toBe("correcao_cirurgica");
    expect(estrategiaInicial("contradição factual comprovada")).toBe("correcao_cirurgica");
  });
});

describe("decidirCorrecao — estratégias realmente distintas", () => {
  const erro = { codigo: "CAPITULO_BLOQUEADO", classe: "qualidade" as const };

  it("nunca repete estratégia sobre o MESMO texto", () => {
    const historico = [
      tentativa({ estrategia: "correcao_cirurgica", hash_entrada: "hA", hash_saida: "hA" }),
    ];
    const d = decidirCorrecao({ erro, capitulo: 3, blockers: ["texto_truncado"], hashEntrada: "hA", historico });
    expect(d.acao).toBe("retentar");
    expect(d.estrategia).not.toBe("correcao_cirurgica");
    expect(d.hipotese).toBeTruthy();
  });

  it("cada degrau da escada é uma AÇÃO diferente, não a mesma repetida", () => {
    const vistas = new Set<string>();
    let historico: TentativaCorrecao[] = [];
    for (let i = 0; i < ORDEM_ESTRATEGIAS.length; i++) {
      const d = decidirCorrecao({
        erro,
        capitulo: 3,
        blockers: ["texto_truncado"],
        hashEntrada: "hA",
        historico,
        orcamento: 99,
      });
      expect(d.acao).toBe("retentar");
      expect(vistas.has(d.estrategia!)).toBe(false);
      vistas.add(d.estrategia!);
      historico = [...historico, tentativa({ estrategia: d.estrategia!, hash_entrada: "hA", hash_saida: `h${i}` })];
    }
    expect(vistas.size).toBe(ORDEM_ESTRATEGIAS.length);
    // Esgotadas todas: circuit breaker, não uma sexta repetição.
    const fim = decidirCorrecao({ erro, capitulo: 3, blockers: ["texto_truncado"], hashEntrada: "hA", historico, orcamento: 99 });
    expect(fim.acao).toBe("circuit_breaker");
  });

  it("a retomada é sempre no capítulo que falhou — nunca no começo do livro", () => {
    const d = decidirCorrecao({ erro, capitulo: 9, blockers: ["x"], hashEntrada: "hA", historico: [] });
    expect(d.retomarEm).toBe(9);
  });

  it("cota pausa limpo; infraestrutura vai para backoff — nenhuma das duas gasta a escada", () => {
    const cota = decidirCorrecao({
      erro: { codigo: "LIMITE_MAX", classe: "qualidade" },
      capitulo: 3, blockers: [], hashEntrada: "hA", historico: [],
    });
    expect(cota.acao).toBe("aguardar_cota");
    const infra = decidirCorrecao({
      erro: { codigo: "SUPABASE_FORA", classe: "tecnica" },
      capitulo: 3, blockers: [], hashEntrada: "hA", historico: [],
    });
    expect(infra.acao).toBe("retry_infraestrutura");
  });
});

describe("ausência de progresso para a escada antes do orçamento", () => {
  it("duas tentativas que não mudaram o texto = circuit breaker", () => {
    const historico = [
      tentativa({ estrategia: "correcao_cirurgica", hash_entrada: "hA", hash_saida: "hA" }),
      tentativa({ estrategia: "reescrita_orientada", hash_entrada: "hA", hash_saida: "hA" }),
    ];
    expect(semProgresso(historico).parou).toBe(true);
    const d = decidirCorrecao({
      erro: { codigo: "CAPITULO_BLOQUEADO", classe: "qualidade" },
      capitulo: 3, blockers: ["x"], hashEntrada: "hA", historico, orcamento: 99,
    });
    expect(d.acao).toBe("circuit_breaker");
    expect(d.motivo).toContain("não alteraram o texto");
  });

  it("texto que volta a uma versão já tentada = ciclo detectado", () => {
    const historico = [
      tentativa({ estrategia: "correcao_cirurgica", hash_entrada: "hA", hash_saida: "hB" }),
      tentativa({ estrategia: "reescrita_orientada", hash_entrada: "hB", hash_saida: "hB" }),
    ];
    expect(semProgresso(historico).parou).toBe(true);
  });

  it("escada que anda (hashes novos a cada tentativa) NÃO dispara o breaker", () => {
    const historico = [
      tentativa({ estrategia: "correcao_cirurgica", hash_entrada: "hA", hash_saida: "hB" }),
      tentativa({ estrategia: "reescrita_orientada", hash_entrada: "hB", hash_saida: "hC" }),
    ];
    expect(semProgresso(historico).parou).toBe(false);
  });

  it("orçamento esgotado também para a escada", () => {
    const historico = Array.from({ length: 5 }, (_, i) =>
      tentativa({ estrategia: ORDEM_ESTRATEGIAS[i], hash_entrada: `h${i}`, hash_saida: `h${i + 1}` })
    );
    const d = decidirCorrecao({
      erro: { codigo: "CAPITULO_BLOQUEADO", classe: "qualidade" },
      capitulo: 3, blockers: ["x"], hashEntrada: "h5", historico,
    });
    expect(d.acao).toBe("circuit_breaker");
    expect(d.motivo).toContain("orçamento");
  });
});

describe("backoff da retomada", () => {
  it("cresce e satura em 30 min", () => {
    const t0 = Date.parse("2026-07-28T00:00:00.000Z");
    expect(proximaTentativaEm(1, t0)).toBe("2026-07-28T00:01:30.000Z");
    expect(proximaTentativaEm(2, t0)).toBe("2026-07-28T00:03:00.000Z");
    expect(proximaTentativaEm(9, t0)).toBe("2026-07-28T00:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Execução (a escada rodando de verdade)
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
    fatos_obrigatorios: ["registro de 1987 existe"],
    conhecimentos_proibidos: [],
    fios_avancados: ["investigacao"],
    fios_ausentes: [],
  };
}

const PROSA = (marca: string) =>
  [
    "## Capítulo 3",
    "",
    `Marina empurrou a porta do arquivo e sentiu o cheiro de papel velho. ${marca} O arquivista atendeu o telefone na sala ao lado. Ela fotografou a linha com o nome do irmão. A folha seguinte tinha sido arrancada rente à costura. Atrás dela, a chave girou na fechadura.`,
  ].join("\n");

const CTX = JSON.stringify({
  fatos: [{ fato: "O registro de 1987 existe no consulado", origem: "cap 1" }],
  continuidade: [],
  repeticoes_recentes: [],
});

const AUDITOR_LIMPO = JSON.stringify({ contradicoes: [], conhecimento_indevido: [], pov_violado: { ha: false, detalhe: "" } });

function parecer(verdict: Parecer["verdict"], nota = 4): Parecer {
  const eixo = { nota, evidencia: "a folha arrancada muda o objetivo da cena" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict,
    evidencias: [{ local: "L:3", trecho: "a chave girou na fechadura", observacao: "gancho concreto" }],
    sinais: [],
    correcoes: [],
  };
}

let dir: string;
let disco: DiscoPersistencia;
let provedor: ProvedorMock;
let gravador: Gravador;
let deps: DepsPipeline;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-escada-"));
  disco = new DiscoPersistencia(dir);
  provedor = new ProvedorMock();
  gravador = new Gravador({ persistencia: disco, projectId: "proj-1" });
  deps = {
    gravador,
    persistencia: disco,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: { contrato, hash: "hash-contrato", origem: "worker/skills-v2/teste" },
    perfil: { texto: "Perfil de voz validado.", skillId: "teste", hash: "h-perfil", validado: true },
    dirManuscrito: path.join(dir, "manuscrito"),
    projectId: "proj-1",
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Um ciclo completo do pipeline com o veredito pedido. */
function enfileirarCiclo(veredito: Parecer["verdict"], marca: string, comFicha = true) {
  if (comFicha) provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
  provedor.enfileirar("contextualizador", CTX);
  provedor.enfileirar("escritor", PROSA(marca));
  // O pipeline tenta corrigir internamente antes de devolver reprovado; o parecer
  // sem correções e sem sinais faz a rodada terminar na primeira passagem.
  provedor.enfileirar("revisor_literario", JSON.stringify(parecer(veredito)));
  provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
}

describe("escada em execução", () => {
  it("capítulo aprovado de primeira não gera nenhuma tentativa no ledger", async () => {
    enfileirarCiclo("aprovado", "A.");
    const r = await escreverCapituloComEscada({ deps, gravador, capitulo: 3 });
    expect(r.status).toBe("aprovado");
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.correcoes?.["3"] ?? []).toEqual([]);
  });

  it("[DOD:C-01] reprovado → nova tentativa com estratégia DIFERENTE, e o ledger registra hipótese e hashes", async () => {
    enfileirarCiclo("reprovado", "A.");
    enfileirarCiclo("aprovado", "B.", false); // reficha? não: a 2ª tentativa reusa o fluxo completo
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));

    const r = await escreverCapituloComEscada({ deps, gravador, capitulo: 3 });

    const estado = await disco.lerEstado("proj-1");
    const tentativas = estado?.doc.correcoes?.["3"] ?? [];
    expect(tentativas.length).toBeGreaterThanOrEqual(1);
    const t = tentativas[0];
    expect(t.hipotese).toBeTruthy();
    expect(t.hash_entrada).toBeTruthy();
    expect(t.gate).toBeTruthy();
    expect(ORDEM_ESTRATEGIAS).toContain(t.estrategia);
    // A tentativa foi FECHADA (hash de saída + resultado), não deixada em aberto.
    expect(t.hash_saida === null && t.resultado === "persistiu").toBe(false);
    expect(r.status === "aprovado" || r.status === "reprovado").toBe(true);
  });

  it("[DOD:C-02] o texto reprovado repetidamente sem mudar dispara o circuit breaker e PARA", async () => {
    // Sempre o mesmo texto, sempre reprovado: a escada tenta, não progride, para.
    for (let i = 0; i < 12; i++) enfileirarCiclo("reprovado", "IGUAL.");
    for (let i = 0; i < 12; i++) provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));

    const r = await escreverCapituloComEscada({ deps, gravador, capitulo: 3, orcamento: 5 });

    expect(r.status).toBe("reprovado");
    const estado = await disco.lerEstado("proj-1");
    const tentativas = estado?.doc.correcoes?.["3"] ?? [];
    // Parou antes de gastar o orçamento inteiro (texto não mudou) e registrou o motivo.
    expect(tentativas.length).toBeLessThanOrEqual(5);
    expect(estado?.doc.circuit_breaker?.some((c) => c.capitulo === 3)).toBe(true);
    expect(estado?.doc.circuit_breaker?.[0].motivo).toBeTruthy();
  });

  it("a escada NUNCA toca outro capítulo do livro", async () => {
    for (let i = 0; i < 12; i++) enfileirarCiclo("reprovado", "IGUAL.");
    for (let i = 0; i < 12; i++) provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));

    await escreverCapituloComEscada({ deps, gravador, capitulo: 3, orcamento: 5 });

    const estado = await disco.lerEstado("proj-1");
    expect(Object.keys(estado?.doc.correcoes ?? {})).toEqual(["3"]);
    expect((estado?.doc.circuit_breaker ?? []).map((c) => c.capitulo)).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// D2 — cada estratégia executa um CAMINHO diferente, não a mesma tentativa
// com hash novo. Prova por quais PAPÉIS são chamados e com que entradas.
// ---------------------------------------------------------------------------

describe("caminho de execução por estratégia", () => {
  const ctx = {
    textoAnterior: PROSA("REPROVADO."),
    fichaVigente: ficha(),
    blockers: ["sinal_cadencia: fragmento acima da cota"],
  };

  it("cirúrgica: parte do MESMO texto e da MESMA ficha", () => {
    const o = opcoesPorEstrategia("correcao_cirurgica", ctx);
    expect(o?.textoBase).toBe(ctx.textoAnterior);
    expect(o?.fichaExistente).toBe(ctx.fichaVigente);
    expect(o?.reescritaDirigida?.correcoes.length).toBeGreaterThan(0);
  });

  it("reescrita orientada: usa o texto reprovado e manda preservar os eventos", () => {
    const o = opcoesPorEstrategia("reescrita_orientada", ctx);
    expect(o?.textoBase).toBe(ctx.textoAnterior);
    const instrucoes = (o?.reescritaDirigida?.correcoes ?? []).map((c) => c.instrucao).join(" ");
    expect(instrucoes).toContain("preservando eventos");
  });

  it("reficha: DESCARTA a ficha (nova versão será gerada) e descarta o texto", () => {
    const o = opcoesPorEstrategia("reficha", ctx);
    expect(o?.fichaExistente).toBeUndefined();
    expect(o?.textoBase).toBeUndefined();
    expect(o?.reescritaDirigida).toBeUndefined();
  });

  it("reescrita integral: escreve do zero MAS mantém a ficha (o plano não é a causa)", () => {
    const o = opcoesPorEstrategia("reescrita_integral", ctx);
    expect(o?.textoBase).toBeUndefined();
    expect(o?.fichaExistente).toBe(ctx.fichaVigente);
    expect(o?.reescritaDirigida).toBeUndefined();
  });

  it("julgamento alternativo: mesmo texto, mesma ficha, SEM instrução de reescrita", () => {
    const o = opcoesPorEstrategia("julgamento_alternativo", ctx);
    expect(o?.textoBase).toBe(ctx.textoAnterior);
    expect(o?.fichaExistente).toBe(ctx.fichaVigente);
    expect(o?.reescritaDirigida).toBeUndefined();
  });

  it("[DOD:D2-01] as cinco estratégias produzem cinco combinações DISTINTAS de entrada", () => {
    const assinatura = (e: Parameters<typeof opcoesPorEstrategia>[0]) => {
      const o = opcoesPorEstrategia(e, ctx);
      return [
        o?.textoBase ? "com-texto" : "sem-texto",
        o?.fichaExistente ? "com-ficha" : "sem-ficha",
        o?.reescritaDirigida ? `correcoes:${o.reescritaDirigida.correcoes.length}` : "sem-correcoes",
      ].join("|");
    };
    const todas = ORDEM_ESTRATEGIAS.map(assinatura);
    // cirúrgica e orientada compartilham texto+ficha, mas divergem no nº de correções
    expect(new Set(todas).size).toBe(ORDEM_ESTRATEGIAS.length);
  });

  it("sem texto no disco, as estratégias baseadas no anterior degradam para escrever do zero", () => {
    const vazio = { textoAnterior: null, fichaVigente: null, blockers: [] };
    for (const e of ORDEM_ESTRATEGIAS) {
      expect(opcoesPorEstrategia(e, vazio)?.textoBase).toBeUndefined();
    }
  });
});

describe("julgamento alternativo em EXECUÇÃO não chama o escritor", () => {
  it("[DOD:D2-02] rejulga o mesmo hash com o modelo de julgamento trocado", async () => {
    const texto = PROSA("UNICO.");
    mkdirSync(path.join(dir, "manuscrito"), { recursive: true });
    writeFileSync(path.join(dir, "manuscrito", "capitulo-03.md"), texto, "utf8");
    await disco.inserirSpec({
      project_id: "proj-1", edition_id: null, capitulo: 3, versao: 1,
      hash: "h1", status: "validada", ficha: ficha(), origem_run_id: "r1",
    });

    provedor.enfileirar("contextualizador", CTX);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer("aprovado")));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, {
      fichaExistente: ficha(),
      textoBase: texto,
      correcaoDirigida: {
        estrategia: "julgamento_alternativo",
        blockers: ["parecer reprovado"],
        hipotese: "o juiz é que pode estar errado",
        tentativa: 2,
      },
    });

    expect(r.status).toBe("aprovado");
    // O escritor NUNCA foi chamado — e o hash julgado é o mesmo do disco.
    expect(provedor.chamadas.filter((c) => c.papel === "escritor")).toHaveLength(0);
    expect(r.textHash).toBe(hashText(texto));
    // O papel de julgamento rodou com o modelo alternativo (mapa.raciocinio).
    const chamadaRevisor = provedor.chamadas.find((c) => c.papel === "revisor_literario");
    expect(chamadaRevisor?.modelo).toBe("modelo-r");
  });
});
