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
import { entradasDaFicha, TETO_LEDGER_NO_PACOTE } from "./ledger.js";
import { medirSinais } from "./sinais.js";
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
    // 7 papéis no capítulo aprovado: ficha, contexto, escritor, revisor, auditor,
    // conformidade e extrator de memória (este só roda depois da aprovação).
    expect(r.runs).toHaveLength(8); // + revisor_decisao: o capitulo fechou, gatilho (d)

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
    expect(runs.length).toBeGreaterThanOrEqual(7);
    for (const run of runs) expect(run.input_bundle_hash).toBeTruthy();
    expect(runs.every((run) => run.status === "ok")).toBe(true);
  });
});

describe("escreverCapitulo — retry técnico da ficha", () => {
  it("ficha com diálogo redigido falha no parse; retry com ficha corrigida segue até aprovado", async () => {
    // Ghostwriting DIRETO (diálogo redigido) segue bloqueante; ornamento por
    // detector (aforismo/personificação) virou aviso — ver spec.test.ts.
    const fichaRuim = { ...ficha(), virada: "— Você não devia estar aqui — disse o arquivista, fechando a porta." };
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
    expect(r.runs).toHaveLength(9); // escritor duas vezes (+ conformidade + memoria + decisao)

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
  it("conferirParecer rebaixa; correção roda; parecer seguinte reprova sem carregar problema vencido", async () => {
    deps.maxCorrecoes = 1;
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
    expect(r.problemas).not.toContain("aprovação sem evidência positiva");
    expect(r.textHash).toBe(hashText(PROSA_CORRIGIDA));
    expect(r.runs).toHaveLength(9); // ctx + escritor + (rev+aud+conf) + escritor + (rev+aud+conf)

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

describe("escreverCapitulo — auditoria factual alimenta correção (caso do canário dan-brown)", () => {
  it("contradição bloqueante + revisor sem correções → tentativa de correção dirigida; auditor limpo aprova", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer())); // aprovado com evidência, SEM correções
    provedor.enfileirar("auditor_factual", AUDITOR_CONTRADICAO);
    // A correção derivada do AUDITOR alimenta o escritor (antes: beco sem uma tentativa)
    provedor.enfileirar("escritor", PROSA_CORRIGIDA);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("aprovado");
    expect(r.problemas.some((p) => p.startsWith("contradição factual comprovada"))).toBe(false);
    expect(r.textHash).toBe(hashText(PROSA_CORRIGIDA));

    // O prompt da correção carrega a contradição do auditor (local + fato + instrução)
    const chamadasEscritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    expect(chamadasEscritor).toHaveLength(2);
    expect(chamadasEscritor[1].prompt).toContain("contradição factual");
    expect(chamadasEscritor[1].prompt).toContain("O registro de 1987 existe no consulado");
    // Sem instrução global de cadência → modo cirúrgico
    expect(chamadasEscritor[1].prompt).toContain("SOMENTE as correções listadas");
  });

  it("contradição persistente esgota o orçamento e reprova COM as tentativas no ledger", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    for (let i = 0; i < 3; i++) {
      provedor.enfileirar("revisor_literario", JSON.stringify(parecer())); // nunca lista correções
      provedor.enfileirar("auditor_factual", AUDITOR_CONTRADICAO); // contradição persiste
      if (i < 2) provedor.enfileirar("escritor", i === 0 ? PROSA_CORRIGIDA : PROSA_OK);
    }

    const r = await escreverCapitulo(deps, 3);

    expect(r.status).toBe("reprovado");
    // 1 escrita + 2 correções (orçamento default maxCorrecoes=2) — não morre sem tentativa
    expect(provedor.chamadas.filter((c) => c.papel === "escritor")).toHaveLength(3);
    const reviews = lerJsonl("reviews.jsonl");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].registro).toMatchObject({ verdict: "reprovado" });
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.bloqueios.some((b) => b.codigo === "QUALIDADE_REPROVADA")).toBe(true);
  });
});

describe("escreverCapitulo — violação difusa entra em modo reescrita (caso do canário hoover)", () => {
  const PROSA_SANFONA = [
    "## Capítulo 3",
    "",
    "Marina não sabia o que dizer, mas não podia ficar parada diante do arquivista. Ela não entendia o registro, mas não ousava perguntar nada ali dentro. O arquivista atendeu o telefone na sala ao lado. Ela fotografou a linha com o nome do irmão. A chave girou na fechadura.",
  ].join("\n");
  const sinaisSanfona = medirSinais(PROSA_SANFONA, contrato);
  const disposicaoMedida = (nome: string) => {
    const medido = sinaisSanfona.find((s) => s.sinal === nome)!;
    const ocorrencias = medido.exemplos.length
      ? {
          ocorrencias_citadas: [{ trecho: medido.exemplos[0] }],
          falsos_positivos: Number(medido.valor) - 1,
        }
      : {};
    return {
      sinal: medido.sinal,
      valor: medido.valor,
      disposicao: "violacao_confirmada" as const,
      evidencia: "violação confirmada no texto",
      ...ocorrencias,
    };
  };
  // A régua universal de molde (FASE 2) também exige disposição quando estoura;
  // aqui o alvo do teste é o fluxo da sanfona, então o resto sai como FP.
  const disporForaDaCotaComoFP = (exceto: string[]) =>
    sinaisSanfona
      .filter((s) => s.fora_da_cota && !exceto.includes(s.sinal))
      .map((s) => ({
        sinal: s.sinal,
        valor: s.valor,
        disposicao: "falso_positivo" as const,
        evidencia: "medição não configura defeito neste texto de teste",
      }));

  it("violacao_confirmada de sinal medido → instrução global com trechos flagrados + modo reescrita; platô de 1 rodada é tolerado", async () => {
    deps.maxCorrecoes = 3;
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    const parecerSanfona = () =>
      JSON.stringify(
        parecer({
          verdict: "reprovado",
          sinais: [disposicaoMedida("sanfona"), ...disporForaDaCotaComoFP(["sanfona"])],
          correcoes: [], // revisor não listou correção cirúrgica — só a violação difusa
        })
      );
    // Rodada 1: reprovado (saldo 1) → corrige (reescrita). Rodada 2: mesmo saldo (platô 1,
    // tolerado) → corrige de novo. Rodada 3: mesmo saldo (platô 2) → para reprovado.
    provedor.enfileirar("revisor_literario", parecerSanfona());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    provedor.enfileirar("revisor_literario", parecerSanfona());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    provedor.enfileirar("revisor_literario", parecerSanfona());
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, { fichaExistente: ficha() });

    expect(r.status).toBe("reprovado");
    const chamadasEscritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    // 1 escrita + 2 correções: o anti-loop por saldo tolerou 1 rodada de platô
    // (a regra antiga 9→9 matava na 1ª) e parou na 2ª sem melhora líquida.
    expect(chamadasEscritor).toHaveLength(3);
    // Modo reescrita orientada, nunca "preserve palavra por palavra"
    expect(chamadasEscritor[1].prompt).toContain("Reescreva o capítulo");
    expect(chamadasEscritor[1].prompt).toContain("PRESERVE integralmente");
    expect(chamadasEscritor[1].prompt).not.toContain("palavra por palavra");
    // A instrução global carrega o trecho que o detector flagrou (o escritor sabe QUAIS frases contam)
    expect(chamadasEscritor[1].prompt).toContain("Ocorrências confirmadas pelo revisor");
    expect(chamadasEscritor[1].prompt).toContain("não sabia o que dizer");
  });

  it("melhora líquida entre rodadas zera o platô e a correção continua", async () => {
    deps.maxCorrecoes = 3;
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    const parecerViol = (n: number) => {
      const confirmados = ["sanfona", "declarativas_pct", "dialogo_pct"].slice(0, n);
      return JSON.stringify(
        parecer({
          verdict: "reprovado",
          sinais: [...confirmados.map(disposicaoMedida), ...disporForaDaCotaComoFP(confirmados)],
          correcoes: [{ local: "L:1", problema: "reformulação", instrucao: "corte a reformulação" }],
        })
      );
    };
    // saldos 3 → 3 (platô 1) → 2 (melhora, platô zera) → aprovação na 4ª rodada
    provedor.enfileirar("revisor_literario", parecerViol(3));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    provedor.enfileirar("revisor_literario", parecerViol(3));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_SANFONA);
    provedor.enfileirar("revisor_literario", parecerViol(2));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);
    provedor.enfileirar("escritor", PROSA_CORRIGIDA);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, { fichaExistente: ficha() });

    expect(r.status).toBe("aprovado");
    expect(provedor.chamadas.filter((c) => c.papel === "escritor")).toHaveLength(4);
    expect(r.textHash).toBe(hashText(PROSA_CORRIGIDA));
  });
});

describe("escreverCapitulo — docs factuais no pacote", () => {
  it("dossie-factual entra no pacote do revisor e do auditor (não no do escritor)", async () => {
    deps.docsFactuais = [
      { titulo: "DOC FACTUAL: dossie-factual.md", texto: "O manuscrito de 1987 tem 214 páginas numeradas.", fonte: "dossie-factual.md" },
    ];
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, { fichaExistente: ficha() });
    expect(r.status).toBe("aprovado");

    const prompt = (papel: string) => provedor.chamadas.find((c) => c.papel === papel)?.prompt ?? "";
    expect(prompt("revisor_literario")).toContain("DOC FACTUAL: dossie-factual.md");
    expect(prompt("revisor_literario")).toContain("214 páginas numeradas");
    expect(prompt("auditor_factual")).toContain("214 páginas numeradas");
    expect(prompt("escritor")).not.toContain("214 páginas numeradas");
  });
});

describe("escreverCapitulo — ofício da skill no pacote", () => {
  it("o escritor E o revisor literário recebem o MESMO ofício verbatim; papéis de fatos não", async () => {
    deps.oficio = {
      skillId: "teste",
      texto: "A frase-sanfona é defeito mesmo atravessando o ponto final. Diga uma vez, a melhor.",
      hash: "h-oficio",
    };
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3);
    expect(r.status).toBe("aprovado");

    const prompt = (papel: string) => provedor.chamadas.find((c) => c.papel === papel)?.prompt ?? "";
    // escritor e revisor julgam pelo MESMO documento — a divergência entre o que
    // se escreve e o que se cobra é o que este mecanismo existe para matar.
    expect(prompt("escritor")).toContain("OFÍCIO DA SKILL (teste)");
    expect(prompt("escritor")).toContain("A frase-sanfona é defeito mesmo atravessando o ponto final.");
    expect(prompt("revisor_literario")).toContain("OFÍCIO DA SKILL (teste)");
    expect(prompt("revisor_literario")).toContain("A frase-sanfona é defeito mesmo atravessando o ponto final.");
    // papéis de fatos/planejamento não carregam o ofício (custo e foco)
    expect(prompt("arquiteto_cena")).not.toContain("OFÍCIO DA SKILL");
    expect(prompt("contextualizador")).not.toContain("OFÍCIO DA SKILL");
    expect(prompt("auditor_factual")).not.toContain("OFÍCIO DA SKILL");
  });
});

describe("escreverCapitulo — reescrita dirigida (meta-nota)", () => {
  it("usa fichaExistente + textoBase; pula arquiteto e escrita inicial; 1ª chamada do escritor é a correção em modo reescrita", async () => {
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_CORRIGIDA); // a própria correção (não há escrita inicial)
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 3, {
      fichaExistente: ficha(),
      textoBase: PROSA_OK,
      reescritaDirigida: {
        correcoes: [{ local: "capítulo 3", problema: "final fraco", instrucao: "feche com uma consequência concreta" }],
      },
    });

    expect(r.status).toBe("aprovado");
    // Nenhuma chamada ao arquiteto (usa fichaExistente); exatamente uma ao escritor (a correção)
    expect(provedor.chamadas.filter((c) => c.papel === "arquiteto_cena")).toHaveLength(0);
    const escritor = provedor.chamadas.filter((c) => c.papel === "escritor");
    expect(escritor).toHaveLength(1);
    expect(escritor[0].prompt).toContain("Reescreva o capítulo"); // modo reescrita
    expect(escritor[0].prompt).toContain("PRESERVE integralmente");
    expect(escritor[0].prompt).toContain("feche com uma consequência concreta"); // instrução do avaliador
    expect(escritor[0].prompt).not.toContain("palavra por palavra");
    // O texto no disco é a versão corrigida (não a base)
    expect(readFileSync(path.join(dir, "manuscrito", "capitulo-03.md"), "utf8")).toBe(PROSA_CORRIGIDA);
    expect(r.textHash).toBe(hashText(PROSA_CORRIGIDA));
    // fichaExistente: nenhuma spec nova inserida
    expect(lerJsonl("specs.jsonl")).toHaveLength(0);
  });

  it("reescrita dirigida sem fichaExistente lança REESCRITA_SEM_FICHA", async () => {
    await expect(
      escreverCapitulo(deps, 3, { textoBase: PROSA_OK, reescritaDirigida: { correcoes: [] } })
    ).rejects.toMatchObject({ name: "ErroEngine", codigo: "REESCRITA_SEM_FICHA" });
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

// ---------------------------------------------------------------------------
// Memória de longo alcance: ledger de revelações no pacote e no gate
// ---------------------------------------------------------------------------

/** Semeia N capítulos aprovados: fichas persistidas + ledger no estado canônico. */
async function semearPassado(ate: number): Promise<void> {
  const estado = (await disco.lerEstado("proj-1")) ?? {
    project_id: "proj-1",
    engine_version: "2.0.0",
    versao: 0,
    doc: { schema: "engine-state/v1", fase: "escrita", capitulos: {}, bloqueios: [] },
  };
  const ledger = [];
  for (let n = 1; n <= ate; n++) {
    const f: SceneSpec = {
      ...ficha(),
      capitulo: n,
      pov: n % 2 === 0 ? "Helena" : "Marina",
      tempo: `Dia ${n}, 09h`,
      informacao_nova: `o registro ${n} aponta para o cais ${n}`,
    };
    await disco.inserirSpec({
      project_id: "proj-1",
      capitulo: n,
      versao: 1,
      hash: `h-${n}`,
      status: "validada",
      ficha: f,
    });
    ledger.push(...entradasDaFicha(n, f));
    estado.doc.capitulos[String(n)] = { status: "aprovado", text_hash: `t-${n}`, spec_versao: 1 };
  }
  estado.doc.ledger_revelacoes = ledger;
  await disco.gravarEstado(estado as never);
}

describe("arquiteto de cena enxerga o passado", () => {
  it("pacote do capítulo 8 com 7 capítulos aprovados traz o ledger e as fichas anteriores", async () => {
    await semearPassado(7);

    const f8 = { ...ficha(), capitulo: 8, informacao_nova: "o cofre do consulado tem fundo falso" };
    provedor.enfileirar("arquiteto_cena", JSON.stringify(f8));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK.replace("Capítulo 3", "Capítulo 8"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 8);
    expect(r.status).toBe("aprovado");

    const promptArquiteto = provedor.chamadas.find((c) => c.papel === "arquiteto_cena")!.prompt;
    // O ledger inteiro chega ao pacote (7 revelações, com capítulo de origem).
    expect(promptArquiteto).toContain("LEDGER DE REVELAÇÕES");
    for (let n = 1; n <= 7; n++) {
      expect(promptArquiteto).toContain(`o registro ${n} aponta para o cais ${n}`);
      expect(promptArquiteto).toContain(`R0${n}.1`);
    }
    // E o passado condensado, uma linha por capítulo.
    expect(promptArquiteto).toContain("CAPÍTULOS ANTERIORES (fichas condensadas)");
    expect(promptArquiteto).toContain("Cap 7 [Marina]");
    expect(promptArquiteto).toContain("Cap 2 [Helena]");
  });

  it("o contextualizador também recebe ledger e passado (para de inventar)", async () => {
    await semearPassado(7);
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    await escreverCapitulo(deps, 8, { fichaExistente: { ...ficha(), capitulo: 8 } });

    const promptCtx = provedor.chamadas.find((c) => c.papel === "contextualizador")!.prompt;
    expect(promptCtx).toContain("LEDGER DE REVELAÇÕES");
    expect(promptCtx).toContain("CAPÍTULOS ANTERIORES (fichas condensadas)");
    expect(promptCtx).toContain("o registro 3 aponta para o cais 3");
  });
});

describe("gate de revelação repetida no pipeline", () => {
  it("revelação já no ledger reprova a ficha e o RETRY recebe a entrada exata", async () => {
    await semearPassado(7);

    // 1ª tentativa: repete literalmente a revelação do capítulo 3.
    provedor.enfileirar(
      "arquiteto_cena",
      JSON.stringify({ ...ficha(), capitulo: 8, informacao_nova: "o registro 3 aponta para o cais 3" })
    );
    // 2ª tentativa: revelação genuinamente nova.
    provedor.enfileirar(
      "arquiteto_cena",
      JSON.stringify({ ...ficha(), capitulo: 8, informacao_nova: "o cofre do consulado tem fundo falso" })
    );
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK.replace("Capítulo 3", "Capítulo 8"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 8);
    expect(r.status).toBe("aprovado");

    // A 1ª tentativa foi reprovada pelo gate, com o capítulo de origem citado.
    const runsArq = (await disco.lerRuns()).filter((run) => run.papel === "arquiteto_cena");
    expect(runsArq).toHaveLength(2);
    expect(runsArq[0].status).toBe("falha");
    expect(runsArq[0].erro?.mensagem).toContain("capítulo 3");
    expect(runsArq[0].erro?.mensagem).toContain("R03.1");

    // ADENDO §1: o prompt do retry carrega a ENTRADA LITERAL do ledger.
    const promptRetry = provedor.chamadas.filter((c) => c.papel === "arquiteto_cena")[1].prompt;
    expect(promptRetry).toContain("CORREÇÃO (tentativa 2)");
    expect(promptRetry).toContain("o registro 3 aponta para o cais 3");
    expect(promptRetry).toContain("capítulo 3");
  });

  it("o retry vê a entrada mesmo quando ela está FORA da janela do pacote", async () => {
    await semearPassado(TETO_LEDGER_NO_PACOTE + 30);

    // Repete a revelação do capítulo 1, que a janela do pacote não mostra.
    provedor.enfileirar(
      "arquiteto_cena",
      JSON.stringify({ ...ficha(), capitulo: 200, informacao_nova: "o registro 1 aponta para o cais 1" })
    );
    provedor.enfileirar(
      "arquiteto_cena",
      JSON.stringify({ ...ficha(), capitulo: 200, informacao_nova: "o cofre do consulado tem fundo falso" })
    );
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK.replace("Capítulo 3", "Capítulo 200"));
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    const r = await escreverCapitulo(deps, 200);
    expect(r.status).toBe("aprovado");

    const chamadas = provedor.chamadas.filter((c) => c.papel === "arquiteto_cena");
    // O pacote da 1ª tentativa DEGRADOU: a entrada do capítulo 1 não estava lá.
    expect(chamadas[0].prompt).toContain("omitidas por tamanho");
    expect(chamadas[0].prompt).not.toContain("[R01.1 · cap 1]");
    // Mas o retry recebe a entrada exata — sem isso o teto de tentativas
    // seria consumido em silêncio (adendo §1 do autor).
    expect(chamadas[1].prompt).toContain("o registro 1 aponta para o cais 1");
    expect(chamadas[1].prompt).toContain("capítulo 1");
  });

  it("aprovar um capítulo alimenta o ledger deterministicamente", async () => {
    provedor.enfileirar("arquiteto_cena", JSON.stringify(ficha()));
    provedor.enfileirar("contextualizador", CTX_OK);
    provedor.enfileirar("escritor", PROSA_OK);
    provedor.enfileirar("revisor_literario", JSON.stringify(parecer()));
    provedor.enfileirar("auditor_factual", AUDITOR_LIMPO);

    await escreverCapitulo(deps, 3);

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.ledger_revelacoes).toEqual([
      { id: "R03.1", capitulo: 3, enunciado: "o nome do irmão consta como acompanhante" },
    ]);
  });
});
