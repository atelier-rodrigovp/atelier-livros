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

  it("6 antíteses por negação em ~2.500 palavras: sinal medido com exemplos citáveis, informativo (dentro do teto humano, 8)", () => {
    // Contrato SEM regra de molde (V7: nenhum contrato tem) — o limiar de
    // capítulo vem de maneirismo.ts (limiarCap, derivado de PROSA HUMANA
    // PUBLICADA). A taxa absoluta (orc10k) é avaliada na escala de LIVRO
    // (medirSinaisLivro).
    const sinais = medirSinais(TEXTO_2500, contratoSintetico());
    const molde = sinais.find((x) => x.sinal.startsWith("molde.") && x.sinal.includes("antítese por negação"))!;
    expect(molde).toBeDefined();
    expect(Number(molde.valor)).toBe(6);
    expect(molde.cota?.max).toBe(8);            // limiar de auto-repetição existe SEM contrato declarar
    expect(molde.fora_da_cota).toBe(false);     // 6 ≤ 8: o romance humano chega aí
    expect(molde.exemplos.length).toBe(6);       // todas citáveis (adendo 2)
    expect(molde.exemplos[0]).toContain("Não era medo");
  });

  it("a régua de auto-repetição vale para TODA skill (dan-brown, hoover, romantasy) — não é identidade de skill", () => {
    const TREZE = (() => {
      const extras = Array.from({ length: 7 }, (_, i) =>
        `Não era ${["rotina", "cansaço", "raiva", "pena", "culpa", "sono", "fome"][i]}. Era outra coisa por dentro.`
      );
      return TEXTO_2500 + "\n\n" + extras.join("\n\n");
    })();
    for (const id of ["dan-brown", "hoover-mcfadden", "romantasy"]) {
      const sinais = medirSinais(TREZE, carregarContrato(id).contrato);
      const molde = sinais.find((x) => x.sinal.startsWith("molde.") && x.sinal.includes("antítese por negação"))!;
      expect(Number(molde.valor), id).toBe(13);
      expect(molde?.fora_da_cota, id).toBe(true);
    }
  });

  it("dentro do orçamento não sai da cota (1 antítese em capítulo longo é legítima)", () => {
    const texto = TEXTO_2500.split("\n\n").filter((p) => !ANTITESES.slice(1).includes(p)).join("\n\n");
    const molde = medirSinais(texto, contratoSintetico()).find(
      (x) => x.sinal.startsWith("molde.") && x.sinal.includes("antítese por negação")
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

  it("5 repetições da mesma construção de 4 palavras produzem sinal com o n-grama e a contagem (informativo: 5 ≤ 13)", () => {
    const s = medirSinais(TEXTO_NGRAMA, contratoSintetico()).find((x) => x.sinal === "ngrama_sobrerrepresentado")!;
    expect(s).toBeDefined();
    expect(s.fora_da_cota).toBe(false); // A1: fora só além do máximo do acervo de controle (13)
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

  it("'coisa' repetida é medida com contexto citável; informativa no capítulo (A1: taxa absoluta é escala de livro)", () => {
    const s = medirSinais(TEXTO_COISA, contratoSintetico()).find((x) => x.sinal === "muleta.coisa/coisas")!;
    expect(s).toBeDefined();
    expect(Number(s.valor)).toBe(3);
    expect(s.fora_da_cota).toBe(false);
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

  it("uso raro também é informativo, nunca fora da cota no capítulo", () => {
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
  it("FASE 5: o molde chega ao revisor pelo NOME, com contagem e ocorrências numeradas", () => {
    // Antes, o molde chegava disfarçado de 'sanfona'/'personificação' e o revisor
    // absolvia corretamente a pergunta errada (V8). Agora a linha nomeia o molde.
    const texto = [
      "## Capítulo 8",
      "",
      "Não era medo. Era método. Ela repassou a lista mais uma vez antes de sair.",
      "Não era pressa. Era fome de acabar logo. O corredor seguia vazio até a escada.",
      "Não era frieza. Era manutenção. O elevador desceu sem parar em andar nenhum.",
    ].join("\n\n");
    const resumo = resumoSinais(medirSinais(texto, contratoSintetico()));
    const linha = resumo.split("\n").find((l) => l.includes("molde.antítese por negação"))!;
    expect(linha).toBeDefined();
    expect(linha).toContain(": 3");         // contagem
    expect(linha).not.toContain("FORA");    // A1: 3 ≤ limiar 7 — informativo, o revisor julga
    // ocorrências numeradas logo abaixo da linha do molde (o revisor só pode
    // confirmar violação citando cada uma — regra do adendo 2)
    const bloco = resumo.slice(resumo.indexOf(linha));
    expect(bloco).toMatch(/ {4}1\. .*[Nn]ão era medo/);
    expect(bloco).toMatch(/ {4}2\. /);
    expect(bloco).toMatch(/ {4}3\. /);
  });

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

// ---------------------------------------------------------------------------
// A1 (plano escala-retenção, 2026-08-05): duas CLASSES de sinal, cada uma na
// sua escala. Classe 2 (taxa absoluta, orçamento orc10k feito para LIVRO) não
// é mais avaliada contra cota na escala de capítulo — o piso max(1,…) dava a
// um capítulo inteiro direito a UM "como se" (10/11 canários e 8/8 controles
// estouravam pela régua, não pela prosa). Classe 1 (auto-repetição do MESMO
// molde dentro do capítulo) mantém avaliação por capítulo, com limiar derivado
// do acervo (máximo observado em 539 capítulos de controle + 1).
// ---------------------------------------------------------------------------
describe("A1 — classe 2 (taxa absoluta) é informativa no capítulo; classe 1 (auto-repetição) sai fora", () => {
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
  function capitulo(palavrasAlvo: number, inserir: string[]): string {
    const blocos: string[] = ["## Capítulo 9", ""];
    let i = 0;
    while (blocos.join(" ").split(/\s+/).length < palavrasAlvo) {
      blocos.push(FRASES_NEUTRAS[i % FRASES_NEUTRAS.length]);
      if (i < inserir.length) blocos.push(inserir[i]);
      i++;
    }
    return blocos.join("\n\n");
  }

  it("3 'como se' em ~2.800 palavras é português normal: sinal presente, informativo, NUNCA fora da cota", () => {
    const texto = capitulo(2800, [
      "Ela fechou a porta como se o corredor pudesse ouvir.",
      "Ele dobrou o jornal como se o gesto encerrasse a conversa.",
      "A casa rangeu como se acomodasse o próprio peso.",
    ]);
    const s = medirSinais(texto, contratoSintetico()).find(
      (x) => x.sinal.startsWith("molde.") && x.sinal.includes("como se")
    )!;
    expect(s).toBeDefined();
    expect(Number(s.valor)).toBe(3);
    expect(s.fora_da_cota).toBe(false);   // classe 2: sem cota na escala de capítulo
    expect(s.exemplos.length).toBe(3);    // o revisor continua vendo tudo
  });

  const TERMOS_13 = ["medo", "pressa", "frieza", "cuidado", "descanso", "rotina", "cansaço", "raiva", "pena", "culpa", "sono", "fome", "frio"];
  const capComAntiteses = (quantas: number) =>
    capitulo(2800, Array.from({ length: quantas }, (_, i) => `Não era ${TERMOS_13[i]}. Era outra coisa por dentro.`));
  const moldeAntitese = (texto: string) =>
    medirSinais(texto, contratoSintetico()).find(
      (x) => x.sinal.startsWith("molde.") && x.sinal.includes("antítese por negação")
    )!;

  it("13× o MESMO molde de antítese num capítulo sai FORA por auto-repetição (teto humano: 8+1)", () => {
    const s = moldeAntitese(capComAntiteses(13));
    expect(Number(s.valor)).toBe(13);
    expect(s.cota?.max).toBe(8);          // teto humano medido; acima é auto-repetição
    expect(s.fora_da_cota).toBe(true);
  });

  it("repetição NO teto humano (8×) ainda NÃO sai fora — o romance humano chega aí", () => {
    const s = moldeAntitese(capComAntiteses(8));
    expect(Number(s.valor)).toBe(8);
    expect(s.fora_da_cota).toBe(false);
  });

  it("9× — o primeiro passo fora da faixa humana — sai fora", () => {
    const s = moldeAntitese(capComAntiteses(9));
    expect(Number(s.valor)).toBe(9);
    expect(s.fora_da_cota).toBe(true);
  });

  it("muleta lexical (classe 2) vira informativa no capítulo; tolerância zero (typo/PT-PT) continua fora", () => {
    const texto = capitulo(1200, [
      "Ela pegou aquela coisa da mesa e guardou na bolsa.",
      "Havia uma coisa errada na sala, uma coisa que ela não sabia nomear.",
      "Pero ele não respondeu quando ela chamou do corredor.",
    ]);
    const sinais = medirSinais(texto, contratoSintetico());
    const coisa = sinais.find((x) => x.sinal === "muleta.coisa/coisas")!;
    expect(Number(coisa.valor)).toBe(3);
    expect(coisa.fora_da_cota).toBe(false); // classe 2: taxa absoluta pede escala de livro
    const typo = sinais.find((x) => x.sinal === "muleta.léxico estrangeiro (typo de geração)")!;
    expect(typo.fora_da_cota).toBe(true);   // alvo 0 independe de escala: defeito em qualquer tamanho
  });

  it("n-grama (classe 1): repetido além do máximo do acervo (13) sai fora; abaixo é informativo", () => {
    // Preenchimento lexicalmente VARIADO (módulos coprimos): sem 4-gramas
    // espúrios — só a frase inserida repete.
    // Itens de ≤3 palavras: nenhum 4-grama cabe DENTRO de um item; combinações
    // entre módulos coprimos (7·5·11·13) não repetem no tamanho do capítulo.
    const S = ["A porteira", "A costureira", "O padeiro", "A florista", "O relojoeiro", "A bibliotecária", "O jardineiro"];
    const V = ["ajeitou", "guardou", "verificou", "dobrou", "carregou"];
    const O = ["as cartas", "o caixote", "as luvas", "o abajur", "as xícaras", "o rádio", "as sementes", "o mapa", "as moedas", "o banquinho", "as fitas"];
    const L = ["perto da escada", "atrás do balcão", "sob a lona", "no quintal", "junto ao portão", "diante do espelho", "na bancada", "perto do fogão", "na prateleira", "sob a mesa", "entre os vasos", "no corredor", "além da cerca"];
    const T = ["ontem", "cedo", "devagar", "depois", "enfim", "logo", "antes", "agora", "sempre", "ainda", "primeiro", "calmamente", "rapidamente", "outra vez", "em silêncio", "sem pressa", "com cuidado"];
    function capVariado(inserir: string[]): string {
      const blocos: string[] = ["## Capítulo 9", ""];
      let i = 0;
      while (blocos.join(" ").split(/\s+/).length < 2800) {
        blocos.push(`${S[i % 7]} ${V[i % 5]} ${O[i % 11]} ${L[i % 13]} ${T[i % 17]}.`);
        if (i < inserir.length) blocos.push(inserir[i]);
        i++;
      }
      return blocos.join("\n\n");
    }
    const frase = "Ela anotou o recado na borda vermelha do caderno.";
    const quinze = capVariado(Array.from({ length: 15 }, () => frase));
    const sFora = medirSinais(quinze, contratoSintetico()).find((x) => x.sinal === "ngrama_sobrerrepresentado")!;
    expect(sFora).toBeDefined();
    expect(sFora.fora_da_cota).toBe(true);

    const cinco = capVariado(Array.from({ length: 5 }, () => frase));
    const sInfo = medirSinais(cinco, contratoSintetico()).find((x) => x.sinal === "ngrama_sobrerrepresentado")!;
    expect(sInfo).toBeDefined();            // o revisor ainda vê a repetição
    expect(sInfo.fora_da_cota).toBe(false); // relógio/epíteto legítimo chega a 13 no acervo
  });
});

describe("A1 — classe 2 acumula e é avaliada na ESCALA DO LIVRO (medirSinaisLivro)", () => {
  it("o mesmo uso que é normal num capítulo estoura quando o livro inteiro repete", async () => {
    const { medirSinaisLivro } = await import("./sinais.js");
    // 10 capítulos de ~1.000 palavras, cada um com 4 "como se": 40 no livro de
    // ~10k palavras = 40/10k, contra orçamento 2,5/10k → fora na escala certa.
    const FRASES = [
      "Ela guardou a chave na gaveta e fechou o escritório antes das seis.",
      "O ônibus passou cheio e ela decidiu ir a pé pela rua do mercado.",
      "A vizinha regava as plantas da varanda quando ela cruzou o portão.",
    ];
    function cap(n: number): string {
      const blocos = [`## Capítulo ${n}`, ""];
      let i = 0;
      while (blocos.join(" ").split(/\s+/).length < 1000) {
        blocos.push(FRASES[i % FRASES.length]);
        if (i < 4) blocos.push(`Ela olhou para trás como se alguém tivesse falado o nome dela.`);
        i++;
      }
      return blocos.join("\n\n");
    }
    const capitulos = Array.from({ length: 10 }, (_, i) => ({ numero: i + 1, texto: cap(i + 1) }));
    const sinais = medirSinaisLivro(capitulos);
    const comoSe = sinais.find((s) => s.sinal.startsWith("molde.") && s.sinal.includes("como se"))!;
    expect(comoSe).toBeDefined();
    expect(Number(comoSe.valor)).toBe(40);
    expect(comoSe.fora_da_cota).toBe(true);  // 40 ≫ orçamento 2,5/10k × ~10k palavras

    // e o uso raro no livro inteiro fica dentro (2 no livro de ~10k ≤ alvo ~3)
    let mantidas = 0;
    const capitulosLimpos = capitulos.map((c) => ({
      numero: c.numero,
      texto: c.texto.replace(/como se alguém tivesse falado o nome dela/g, () =>
        mantidas++ < 2 ? "como se alguém tivesse falado o nome dela" : "porque achou ter ouvido o nome dela"
      ),
    }));
    const limpo = medirSinaisLivro(capitulosLimpos).find((s) => s.sinal.startsWith("molde.") && s.sinal.includes("como se"));
    expect(Number(limpo?.valor)).toBe(2);
    expect(limpo?.fora_da_cota ?? false).toBe(false);
  });
});
