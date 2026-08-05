// Tarefa 2.1 (plano ofício-inteiro, 2026-08-05): sinais.ts não tinha teste
// próprio (V9 da auditoria). Este arquivo fixa o comportamento ATUAL de
// medirSinais/resumoSinais ANTES de ligar os detectores universais da FASE 2.
import { describe, expect, it } from "vitest";
import { carregarContrato } from "./contrato.js";
import { medirSinais, resumoSinais } from "./sinais.js";
import type { SkillContract } from "./tipos.js";

function contratoSintetico(over: Partial<SkillContract> = {}): SkillContract {
  return {
    schema: "skill-contract/v1",
    id: "teste",
    versao: "1.0.0",
    nome: "Teste",
    familia_editorial: "suspense_intimista",
    motor_narrativo: "pergunta → revelação",
    unidade_dramatica: "cena",
    pov: { pessoa: "terceira_proxima" },
    temporalidade: "linear",
    faixa_palavras: { alvo: 60 },
    ritmo: { descricao: "médio" },
    acao_interioridade: { relacao: "equilibrio", descricao: "funcional" },
    politica_exposicao: "dramatizada",
    politica_dialogo: { descricao: "avança cena" },
    politica_metafora: { descricao: "rara" },
    tipos_gancho: ["revelacao"],
    regras: [],
    testes_positivos: ["virada por cena"],
    sinais_negativos: [],
    excecoes: [],
    referencias: [],
    modelos_positivos: [],
    ...over,
  };
}

// Uma máxima gnômica clara ("é sempre" + sujeito abstrato, sem nome próprio).
const TEXTO_GNOMICO = [
  "## Capítulo 1",
  "",
  "Ela lavou o copo e trancou a veneziana antes de apagar a luz da cozinha.",
  "A beleza é sempre a superfície de algo enterrado.",
  "Depois desceu a escada com o casaco dobrado no braço e abriu o portão.",
].join("\n\n");

describe("medirSinais — cotas vêm SÓ do contrato (comportamento atual)", () => {
  it("regra tipo cota cujo id contém o nome do sinal liga a cota", () => {
    const contrato = contratoSintetico({
      regras: [{ id: "anti-gnomico", texto: "Sem máxima na narração", tipo: "cota", cota: { max: 0, por: "capitulo" }, papeis: ["revisor_literario"] }],
    });
    const s = medirSinais(TEXTO_GNOMICO, contrato).find((x) => x.sinal === "gnomico")!;
    expect(Number(s.valor)).toBeGreaterThanOrEqual(1);
    expect(s.cota).toEqual({ min: undefined, max: 0 });
    expect(s.fora_da_cota).toBe(true);
    expect(s.exemplos.length).toBeGreaterThanOrEqual(1);
  });

  it("sem cota declarada, o MESMO texto é medição informativa (fora_da_cota=false)", () => {
    const s = medirSinais(TEXTO_GNOMICO, contratoSintetico()).find((x) => x.sinal === "gnomico")!;
    expect(Number(s.valor)).toBeGreaterThanOrEqual(1);
    expect(s.cota).toBeUndefined();
    expect(s.fora_da_cota).toBe(false);
  });

  it("políticas do contrato viram cota: metáfora (dan-brown máx 6) e diálogo (mín 5%)", () => {
    const db = carregarContrato("dan-brown").contrato;
    const sinais = medirSinais(TEXTO_GNOMICO, db);
    expect(sinais.find((x) => x.sinal === "metafora_elaborada")!.cota).toEqual({ max: 6 });
    const dialogo = sinais.find((x) => x.sinal === "dialogo_pct")!;
    expect(dialogo.cota).toEqual({ min: 5 });
    expect(dialogo.fora_da_cota).toBe(true); // texto sem nenhuma linha de diálogo
  });

  it("hoover não tem piso de diálogo (ausência justificada — lição CR4)", () => {
    const hoover = carregarContrato("hoover-mcfadden").contrato;
    const dialogo = medirSinais(TEXTO_GNOMICO, hoover).find((x) => x.sinal === "dialogo_pct")!;
    expect(dialogo.cota).toBeUndefined();
    expect(dialogo.fora_da_cota).toBe(false);
  });

  it("cadência: só a CHAVE declarada em ritmo.cadencia sai da cota", () => {
    const texto = [
      "## Capítulo 2",
      "",
      "Ela conferiu o trinco duas vezes antes de dormir. E se ele voltasse antes do combinado?",
      "O corredor continuava vazio quando ela apagou a última lâmpada do andar de cima.",
    ].join("\n\n");
    const declarado = contratoSintetico({ ritmo: { descricao: "médio", cadencia: { retorica: 0 } } });
    const comCota = medirSinais(texto, declarado).find((x) => x.sinal.startsWith("cadencia.pergunta retórica"))!;
    expect(Number(comCota.valor)).toBeGreaterThanOrEqual(1);
    expect(comCota.cota).toEqual({ max: 0 });
    expect(comCota.fora_da_cota).toBe(true);

    const semCota = medirSinais(texto, contratoSintetico()).find((x) => x.sinal.startsWith("cadencia.pergunta retórica"))!;
    expect(semCota.cota).toBeUndefined();
    expect(semCota.fora_da_cota).toBe(false);
  });

  it("palavras: o piso vem de faixa_palavras (fonte única)", () => {
    const s = medirSinais(TEXTO_GNOMICO, contratoSintetico({ faixa_palavras: { min: 2000, alvo: 2400 } }))
      .find((x) => x.sinal === "palavras")!;
    expect(s.cota?.min).toBe(2000);
    expect(s.fora_da_cota).toBe(true);
  });

  it("gancho_final é string informativa, nunca fora da cota", () => {
    const s = medirSinais(TEXTO_GNOMICO, contratoSintetico()).find((x) => x.sinal === "gancho_final")!;
    expect(typeof s.valor).toBe("string");
    expect(s.fora_da_cota).toBe(false);
  });
});

describe("FASE 2 — moldes nomeados como sinal UNIVERSAL (orçamento do maneirismo.ts, não do contrato)", () => {
  // 6 antíteses por negação num capítulo de ~2.500 palavras: o caso real do
  // canário 2 (13 ocorrências absolvidas 20/20) em miniatura.
  const ANTITESES = [
    "Não era medo. Era método.",
    "Não era pressa. Era fome de acabar logo.",
    "Não era frieza. Era manutenção.",
    "Não era silêncio. Era espera armada.",
    "Não era cuidado. Era vigilância.",
    "Não era descanso. Era rendição adiada.",
  ];
  const FRASES_NEUTRAS = [
    "Ela guardou a chave na gaveta e fechou o escritório antes das seis.",
    "O ônibus passou cheio e ela decidiu ir a pé pela rua do mercado.",
    "A vizinha regava as plantas da varanda quando ela cruzou o portão.",
    "No fim do corredor, a lâmpada piscou duas vezes e se firmou.",
    "Ela pendurou o casaco no gancho e ligou a chaleira elétrica.",
    "O telefone vibrou sobre a mesa com um número que ela não salvou.",
    "A janela da sala batia de leve com o vento que vinha do quintal.",
    "Ela separou as contas por data e pagou as duas mais antigas.",
  ];
  const TEXTO_2500 = (() => {
    const blocos: string[] = ["## Capítulo 5", ""];
    let i = 0;
    while (blocos.join(" ").split(/\s+/).length < 2500) {
      blocos.push(FRASES_NEUTRAS[i % FRASES_NEUTRAS.length]);
      if (i < ANTITESES.length) blocos.push(ANTITESES[i]);
      i++;
    }
    return blocos.join("\n\n");
  })();

  it("6 antíteses por negação em ~2.500 palavras saem FORA da cota, com nome do molde e exemplos citáveis", () => {
    // Contrato SEM regra de molde (V7: nenhum contrato tem) — o orçamento tem de
    // vir de maneirismo.ts (orc10k do próprio molde), régua universal.
    const sinais = medirSinais(TEXTO_2500, contratoSintetico());
    const molde = sinais.find((x) => x.sinal.startsWith("molde.") && x.sinal.includes("não era X. Era Y."))!;
    expect(molde).toBeDefined();
    expect(Number(molde.valor)).toBe(6);
    expect(molde.cota?.max).toBeDefined();      // orçamento existe SEM contrato declarar
    expect(molde.fora_da_cota).toBe(true);
    expect(molde.exemplos.length).toBe(6);       // todas citáveis (adendo 2)
    expect(molde.exemplos[0]).toContain("Não era medo");
  });

  it("a régua vale para TODA skill (dan-brown, hoover, romantasy) — não é identidade de skill", () => {
    for (const id of ["dan-brown", "hoover-mcfadden", "romantasy"]) {
      const sinais = medirSinais(TEXTO_2500, carregarContrato(id).contrato);
      const molde = sinais.find((x) => x.sinal.startsWith("molde.") && x.sinal.includes("não era X. Era Y."))!;
      expect(molde?.fora_da_cota, id).toBe(true);
    }
  });

  it("dentro do orçamento não sai da cota (1 antítese em capítulo longo é legítima)", () => {
    const texto = TEXTO_2500.split("\n\n").filter((p) => !ANTITESES.slice(1).includes(p)).join("\n\n");
    const molde = medirSinais(texto, contratoSintetico()).find(
      (x) => x.sinal.startsWith("molde.") && x.sinal.includes("não era X. Era Y.")
    )!;
    expect(Number(molde.valor)).toBe(1);
    expect(molde.fora_da_cota).toBe(false);
  });

  it("compatibilidadeCorpusV1: o corpus congelado NÃO ganha sinais novos (calibração intocada)", () => {
    const sinais = medirSinais(TEXTO_2500, contratoSintetico(), { compatibilidadeCorpusV1: true });
    expect(sinais.find((x) => x.sinal.startsWith("molde."))).toBeUndefined();
  });
});

describe("FASE 2 — n-grama sobre-representado (pega molde que NINGUÉM nomeou)", () => {
  // A mesma construção de 4 palavras, 5 vezes, em prosa curta e variada.
  const TEXTO_NGRAMA = [
    "## Capítulo 6",
    "",
    "Ela fechou a agenda do jeito que doía e olhou o relógio da parede.",
    "O elevador subiu vazio até o quarto andar enquanto ela esperava na escada.",
    "A recepcionista trocou o vaso de lugar e voltou ao balcão sem pressa.",
    "Ele dobrou o guardanapo do jeito que doía, com os polegares alinhados.",
    "Na sala ao lado, alguém arrastou uma cadeira e pediu licença ao entrar.",
    "Ela assinou o protocolo do jeito que doía e devolveu a caneta emprestada.",
    "O motorista estacionou junto ao meio-fio e desligou os faróis baixos.",
    "Ele guardou a aliança do jeito que doía, no bolso pequeno da calça.",
    "A campainha tocou uma única vez e ninguém se levantou para atender.",
    "Ela apagou a mensagem do jeito que doía e virou o telefone para baixo.",
  ].join("\n\n");

  it("5 repetições da mesma construção de 4 palavras produzem sinal com o n-grama e a contagem", () => {
    const s = medirSinais(TEXTO_NGRAMA, contratoSintetico()).find((x) => x.sinal === "ngrama_sobrerrepresentado")!;
    expect(s).toBeDefined();
    expect(s.fora_da_cota).toBe(true);
    expect(s.exemplos.join(" ")).toContain("do jeito que");
    expect(s.exemplos.join(" ")).toContain("5×");
  });

  it("prosa variada não produz o sinal", () => {
    const texto = TEXTO_NGRAMA.replace(/do jeito que doía/g, "com um cuidado novo a cada vez");
    // substituição uniforme criaria outro n-grama: varia manualmente
    const variado = [
      "## Capítulo 6",
      "",
      "Ela fechou a agenda com cuidado e olhou o relógio da parede.",
      "O elevador subiu vazio até o quarto andar enquanto ela esperava na escada.",
      "A recepcionista trocou o vaso de lugar e voltou ao balcão sem pressa.",
      "Ele dobrou o guardanapo devagar, com os polegares alinhados.",
      "Na sala ao lado, alguém arrastou uma cadeira e pediu licença ao entrar.",
    ].join("\n\n");
    void texto;
    const s = medirSinais(variado, contratoSintetico()).find((x) => x.sinal === "ngrama_sobrerrepresentado");
    expect(s?.fora_da_cota ?? false).toBe(false);
  });

  it("o corpus congelado não ganha o sinal (compatibilidadeCorpusV1)", () => {
    const s = medirSinais(TEXTO_NGRAMA, contratoSintetico(), { compatibilidadeCorpusV1: true })
      .find((x) => x.sinal === "ngrama_sobrerrepresentado");
    expect(s).toBeUndefined();
  });
});

describe("FASE 2 — léxico de muleta como sinal universal (orçamento de MULETAS)", () => {
  const TEXTO_COISA = [
    "## Capítulo 7",
    "",
    "Ela pegou aquela coisa da mesa e guardou na bolsa antes que ele voltasse.",
    "Havia uma coisa errada na sala, uma coisa que ela não sabia nomear ainda.",
    "O porteiro entregou as chaves e anotou a placa do carro no caderno.",
  ].join("\n\n");

  it("'coisa' acima do orçamento de MULETAS sai fora da cota, com contexto citável", () => {
    const s = medirSinais(TEXTO_COISA, contratoSintetico()).find((x) => x.sinal === "muleta.coisa/coisas")!;
    expect(s).toBeDefined();
    expect(Number(s.valor)).toBe(3);
    expect(s.fora_da_cota).toBe(true);
    expect(s.exemplos.length).toBe(3);
    expect(s.exemplos[0]).toContain("coisa");
  });

  it("a RETENÇÃO do sinal de contrato muleta_coisa (decisão 2026-07-28) segue intacta", () => {
    // A régua universal não descomenta nem substitui o bloco retido: o sinal de
    // cota do contrato continua não-emitido para todos os contratos.
    for (const id of ["dan-brown", "hoover-mcfadden", "romantasy"]) {
      const sinais = medirSinais(TEXTO_COISA, carregarContrato(id).contrato);
      expect(sinais.find((x) => x.sinal === "muleta_coisa"), id).toBeUndefined();
    }
  });

  it("uso dentro do orçamento não sai da cota", () => {
    const texto = TEXTO_COISA.replace(/coisa que ela não sabia nomear ainda/, "dobra que ela não sabia nomear ainda")
      .replace(/uma coisa errada/, "uma sombra errada");
    const s = medirSinais(texto, contratoSintetico()).find((x) => x.sinal === "muleta.coisa/coisas")!;
    expect(Number(s.valor)).toBe(1);
    expect(s.fora_da_cota).toBe(false);
  });

  it("o corpus congelado não ganha o sinal (compatibilidadeCorpusV1)", () => {
    const s = medirSinais(TEXTO_COISA, contratoSintetico(), { compatibilidadeCorpusV1: true })
      .find((x) => x.sinal.startsWith("muleta."));
    expect(s).toBeUndefined();
  });
});

describe("resumoSinais — medições reais, numeradas, para o revisor", () => {
  it("numera as ocorrências e marca FORA quando há cota estourada", () => {
    const contrato = contratoSintetico({
      regras: [{ id: "anti-gnomico", texto: "Sem máxima", tipo: "cota", cota: { max: 0, por: "capitulo" }, papeis: ["revisor_literario"] }],
    });
    const resumo = resumoSinais(medirSinais(TEXTO_GNOMICO, contrato));
    expect(resumo).toContain("- gnomico:");
    expect(resumo).toContain("FORA");
    expect(resumo).toMatch(/\n {4}1\. /); // ocorrência numerada e citável
  });
});
