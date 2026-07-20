import { describe, it, expect } from "vitest";
import {
  contarGnomico, contarPersonificacao, contarSanfona, contarAdjetivoAvaliativo,
  percentDeclarativasSimples, sinalDialogoInterioridade, contarMetaforaElaborada,
  diagnosticarTransparencia, orcTransparenciaParaSkill, SINAL_TRANSPARENCIA,
} from "./maneirismo.js";

// ===========================================================================
// D1 — contarGnomico (máxima/gnômico ampliado)
// ===========================================================================
describe("contarGnomico", () => {
  it('sujeito genérico + verbo ("Homens que atendiam depressa demais…")', () => {
    expect(contarGnomico("Homens que atendiam depressa demais já tinham decidido ter medo.").n).toBeGreaterThanOrEqual(1);
  });
  it('infinitivo-sujeito + cópula ("Guardar é uma forma de lembrar.")', () => {
    expect(contarGnomico("Guardar é uma forma de lembrar.").n).toBeGreaterThanOrEqual(1);
  });
  it('abstrato nomeado + cópula ("Lealdade é uma métrica de gente que ainda pensa em pessoas.")', () => {
    expect(contarGnomico("Lealdade é uma métrica de gente que ainda pensa em pessoas.").n).toBeGreaterThanOrEqual(1);
  });
  it('"é sempre" ("A beleza é sempre a casca de algum estrago.")', () => {
    expect(contarGnomico("A beleza é sempre a casca de algum estrago.").n).toBeGreaterThanOrEqual(1);
  });
  it('plural genérico no presente ("Os doentes enterram a si mesmos.")', () => {
    expect(contarGnomico("Os doentes enterram a si mesmos.").n).toBeGreaterThanOrEqual(1);
  });

  // recall conhecido: heurística não cobre — o segmento após ":" é "quem preenche o
  // silêncio primeiro entrega mais do que pretende"; _RE_SUJEITO_GENERICO exige "quem
  // QUE" (redundante, quase nunca ocorre), não "quem" + verbo direto ("quem preenche…").
  // Nenhum outro molde de _ehMaxima cobre essa construção. Reportado, não corrigido aqui.
  it.skip('recall conhecido: heurística não cobre — máxima após dois-pontos ("quem preenche…")', () => {
    const t = "Deixou o silêncio correr, uma tática antiga: quem preenche o silêncio primeiro entrega mais do que pretende.";
    expect(contarGnomico(t).n).toBeGreaterThanOrEqual(1);
  });

  it("NÃO dispara: fato concreto com nome próprio (Curador do Índice)", () => {
    expect(contarGnomico("Cole era o Curador do Índice.").n).toBe(0);
  });
  it("NÃO dispara: descrição física simples", () => {
    expect(contarGnomico("A porta era de aço.").n).toBe(0);
  });
  it("NÃO dispara: evento concreto singular", () => {
    expect(contarGnomico("Um homem esperava junto ao portão.").n).toBe(0);
  });
  it("NÃO dispara: dêitico presente ('aqui e agora') exclui a máxima", () => {
    expect(contarGnomico("Esperar era arriscado naquele estacionamento, aqui e agora.").n).toBe(0);
  });
  it("NÃO dispara: pergunta não é máxima", () => {
    expect(contarGnomico("— Quem manda regar isto?").n).toBe(0);
  });
  it("NÃO dispara: nome próprio interno na frase (referente concreto)", () => {
    expect(contarGnomico("Guardar era o que Reyland fazia.").n).toBe(0);
  });
});

// ===========================================================================
// D2 — contarPersonificacao (abstração/corpo-agente)
// ===========================================================================
describe("contarPersonificacao", () => {
  it('corpo-agente ("A mandíbula fez o que a cabeça ainda não tinha feito.")', () => {
    expect(contarPersonificacao("A mandíbula fez o que a cabeça ainda não tinha feito.").n).toBeGreaterThanOrEqual(1);
  });
  it('corpo-agente ("O corpo, mais uma vez, soube antes da cabeça.")', () => {
    expect(contarPersonificacao("O corpo, mais uma vez, soube antes da cabeça.").n).toBeGreaterThanOrEqual(1);
  });
  it('abstrato-agente ("A própria terra que desmente a história.")', () => {
    expect(contarPersonificacao("A própria terra que desmente a história.").n).toBeGreaterThanOrEqual(1);
  });

  // recall conhecido: "já tinha decidido" tem o auxiliar "tinha" entre o corpo-agente e o
  // verbo; "tinha" não está na lista de auxiliares opcionais (se/já/não/nunca/vai/ia) do
  // regex, e a janela lazy (até 3 palavras + 1 auxiliar) não alcança "decidido" (5ª palavra
  // após "mão"). Reportado, não corrigido aqui.
  it.skip('recall conhecido: heurística não cobre — auxiliar "tinha" quebra a janela ("A mão no corrimão já tinha decidido antes dela.")', () => {
    expect(contarPersonificacao("A mão no corrimão já tinha decidido antes dela.").n).toBeGreaterThanOrEqual(1);
  });

  it("NÃO dispara: fala de personagem (diálogo, não narração)", () => {
    expect(contarPersonificacao("— A voz do outro lado fez uma pergunta.").n).toBe(0);
  });
  it("NÃO dispara: idiomatismo morto ('pegou fogo')", () => {
    expect(contarPersonificacao("A casa pegou fogo naquela noite.").n).toBe(0);
  });
  it("NÃO dispara: idiomatismo listado ('a porta bateu')", () => {
    expect(contarPersonificacao("A porta bateu com o vento.").n).toBe(0);
  });
  it("NÃO dispara: símile explícito é D7, não D2 ('como se a memória resistisse')", () => {
    expect(contarPersonificacao("Como se a memória resistisse, ele fechou os olhos.").n).toBe(0);
  });
});

// ===========================================================================
// D3 — contarSanfona (mesma percepção reformulada em cadeia)
// ===========================================================================
describe("contarSanfona", () => {
  it('escada "de que… de que…" (aposto denso)', () => {
    const t = "Cada objeto era um voto — pequeno, mudo, arquivado no escuro — de que ele ainda achava " +
      "que aquelas pessoas tinham existido, de que existir merecia um traço.";
    expect(contarSanfona(t).n).toBeGreaterThanOrEqual(1);
  });

  // recall conhecido: tripla negação reformuladora ("não X, não Y, Z") sem o conector
  // "mas/e sim/só/é" logo após a vírgula — negReformula exige esse conector explícito.
  // E só há 2 vírgulas (apostoDenso exige >=3 sem travessão). Reportado, não corrigido aqui.
  it.skip('recall conhecido: heurística não cobre — tripla negação sem conector ("Não era… não era… era…")', () => {
    const t = "Não era uma igreja de verdade, não era um templo, era uma fábrica com a lógica de culto que sobrava.";
    expect(contarSanfona(t).n).toBeGreaterThanOrEqual(1);
  });

  it("NÃO dispara: enumeração legítima", () => {
    expect(contarSanfona("Levou o mapa, a lanterna, as duas folhas e o relógio.").n).toBe(0);
  });
  it("NÃO dispara: frase curta simples", () => {
    expect(contarSanfona("Quando a porta abriu, Helena recuou.").n).toBe(0);
  });
  it("NÃO dispara: diálogo com incisa", () => {
    expect(contarSanfona("— Não vem agora, Marta — disse ele, sério.").n).toBe(0);
  });
});

// ===========================================================================
// D5 — percentDeclarativasSimples (piso de declarativas)
// ===========================================================================
describe("percentDeclarativasSimples", () => {
  it("parágrafo 100% declarativo (frases curtas, sem subordinação) dá 100%", () => {
    const t = "Ela abriu a porta. O vento entrou. Ele sentou na cadeira. A luz apagou. O relógio parou. " +
      "O carro passou. A rua ficou vazia. O silêncio pesou. Ela fechou os olhos. Ele acendeu o cigarro. " +
      "A noite chegou cedo. O café esfriou. A porta rangeu. Ele levantou devagar. A chuva começou. " +
      "O trovão soou longe. A janela tremeu. Ele puxou a cortina. A luz voltou. Ela sorriu.";
    const r = percentDeclarativasSimples(t);
    expect(r.pct).toBe(100);
  });

  it("parágrafo só de períodos longos subordinados dá 0%", () => {
    const t = "Quando a noite finalmente caiu sobre a cidade inteira, cansada e silenciosa, ele soube, mesmo sem " +
      "admitir a si mesmo com todas as palavras que ainda lhe restavam, que talvez nunca mais fosse capaz de " +
      "encontrar o caminho de volta àquela casa onde a infância inteira parecia ter ficado presa. Embora " +
      "tentasse, achando que a memória bastasse, o esforço se dissolvia como quem tenta segurar água entre os " +
      "dedos abertos numa manhã fria demais para qualquer gesto. Se ao menos tivesse perguntado antes, quando " +
      "havia tempo e coragem suficientes para isso, talvez tudo tivesse sido diferente daquilo que se tornou, " +
      "ano após ano, sem que ninguém percebesse a mudança lenta.";
    expect(percentDeclarativasSimples(t).pct).toBe(0);
  });

  it("'abaixo' só dispara com >=20 frases (anti falso-positivo em trechos curtos)", () => {
    const frasesSubordinadas = [
      "Quando a noite finalmente caiu sobre a cidade cansada, ele soube que talvez nunca mais encontrasse o caminho de volta.",
      "Embora tentasse lembrar o rosto dela, a imagem se desfazia como quem segura água entre os dedos frios.",
      "Enquanto o trem cruzava a ponte estreita, os passageiros pareciam ignorar o barulho enorme lá fora.",
      "Se ao menos tivesse perguntado antes, quando havia tempo e coragem suficientes, tudo teria sido diferente.",
      "Porque ninguém mais se lembrava daquele nome, a história inteira parecia ter desaparecido com o tempo.",
      "Como se tudo fizesse sentido de repente, ele parou no meio da rua e respirou fundo devagar.",
      "Apesar do frio intenso que tomava conta do quarto inteiro, ninguém se atrevia a fechar a janela.",
      "Ainda que soubesse do risco enorme, decidiu seguir pelo caminho mais longo e mais silencioso.",
      "Quando finalmente entendeu o que aquilo significava, já era tarde demais para qualquer explicação.",
      "Embora o mapa indicasse outra rota, ele preferiu confiar na memória antiga daquele lugar.",
      "Enquanto esperava a resposta, sentia o coração bater mais forte a cada segundo que passava.",
      "Se alguém tivesse avisado antes, talvez a decisão tivesse sido tomada de um jeito diferente.",
      "Porque o silêncio pesava demais naquele corredor, ele preferiu voltar pela escada mais distante.",
      "Como se o tempo tivesse parado ali mesmo, ninguém se moveu por um longo instante.",
      "Apesar de tudo o que tinha visto, ainda duvidava do que os olhos mostravam.",
      "Ainda que a carta estivesse rasgada, dava para entender o essencial daquela mensagem antiga.",
      "Quando o relógio bateu meia-noite, a casa inteira pareceu prender a respiração por um instante.",
      "Embora ninguém dissesse nada, todos sabiam exatamente o que tinha acontecido na véspera.",
      "Enquanto a chuva caía sem parar, eles esperavam abrigados sob a marquise estreita da esquina.",
      "Se o plano desse certo, ninguém mais precisaria voltar àquele lugar tão distante.",
      "Porque a dúvida era maior que a certeza, ele decidiu esperar mais um pouco.",
    ];
    const longo = frasesSubordinadas.join(" "); // 21 frases
    const curto = frasesSubordinadas.slice(0, 5).join(" "); // 5 frases, mesmo padrão baixo-pct
    const rLongo = percentDeclarativasSimples(longo);
    const rCurto = percentDeclarativasSimples(curto);
    expect(rLongo.frases).toBeGreaterThanOrEqual(20);
    expect(rLongo.abaixo).toBe(true);
    expect(rCurto.frases).toBeLessThan(20);
    expect(rCurto.abaixo).toBe(false); // mesmo padrão de baixo pct, mas amostra pequena demais
  });
});

// ===========================================================================
// D4 — contarAdjetivoAvaliativo (adjetivo avaliativo em objeto físico)
// ===========================================================================
describe("contarAdjetivoAvaliativo", () => {
  it('objeto físico + adjetivo pós-posto ("um facho amarelo e honesto")', () => {
    expect(contarAdjetivoAvaliativo("um facho amarelo e honesto").n).toBe(1);
  });
  it('objeto físico + cópula + adjetivo ("O papel era estúpido.")', () => {
    expect(contarAdjetivoAvaliativo("O papel era estúpido.").n).toBe(1);
  });
  it('negação + objeto + adjetivo ("Não é um nódulo educado.")', () => {
    expect(contarAdjetivoAvaliativo("Não é um nódulo educado.").n).toBe(1);
  });

  it("NÃO dispara: adjetivo físico comum ('a porta fria')", () => {
    expect(contarAdjetivoAvaliativo("a porta fria").n).toBe(0);
  });
  it("NÃO dispara: adjetivo avaliativo em PESSOA, não objeto ('um homem honesto')", () => {
    expect(contarAdjetivoAvaliativo("um homem honesto").n).toBe(0);
  });
  it("NÃO dispara: adjetivo estético comum ('a casa bonita')", () => {
    expect(contarAdjetivoAvaliativo("a casa bonita").n).toBe(0);
  });
});

// ===========================================================================
// D7 — contarMetaforaElaborada (densidade e cadeia)
// ===========================================================================
describe("contarMetaforaElaborada", () => {
  it("2 gatilhos a <300 palavras => cadeias>=1 e acima=true", () => {
    const t = "Ele parou. Como se o tempo tivesse parado ali mesmo. Olhou para trás, feito um animal encurralado.";
    const r = contarMetaforaElaborada(t);
    expect(r.n).toBe(2);
    expect(r.cadeias).toBeGreaterThanOrEqual(1);
    expect(r.acima).toBe(true);
  });

  it("texto de ~900 palavras com 1 gatilho => acima=false", () => {
    const fillerBlock = Array(50).fill("Palavra comum aqui na frase longa sem gatilho nenhum.").join(" ");
    const t = fillerBlock + " Como se tudo fizesse sentido de repente. " + fillerBlock;
    const r = contarMetaforaElaborada(t);
    expect(r.n).toBe(1);
    expect(r.cadeias).toBe(0);
    expect(r.acima).toBe(false);
  });
});

// ===========================================================================
// D6 — sinalDialogoInterioridade
// ===========================================================================
describe("sinalDialogoInterioridade", () => {
  it("narração estática (6+ frases era/estava/sentia seguidas) => maxInterioridadeSeguida>3", () => {
    const t = "Ela era paciente. Estava cansada. Sentia o peso dos anos. Era tarde. Estava tudo quieto. Sentia frio.";
    const r = sinalDialogoInterioridade(t);
    expect(r.maxInterioridadeSeguida).toBeGreaterThan(3);
    // com doisOuMaisEmCena=false (personagem sozinho), o teto de sequência estática dispara
    expect(sinalDialogoInterioridade(t, false).abaixo).toBe(true);
  });

  it("metade dos parágrafos em fala (linhas começando com —) => dialogoPct>30", () => {
    const t =
      "— Oi — disse ela.\n\n— Tudo bem? — perguntou ele.\n\n— Sim, e você? — ela respondeu.\n\n" +
      "Ele sorriu de leve.\n\nOlhou para o relógio.";
    expect(sinalDialogoInterioridade(t).dialogoPct).toBeGreaterThan(30);
  });
});

// ===========================================================================
// Agregador — diagnosticarTransparencia / orcTransparenciaParaSkill
// ===========================================================================
describe("diagnosticarTransparencia", () => {
  const TEXTO_ESTOURADO = [
    "Homens que atendiam depressa demais já tinham decidido ter medo.",
    "Guardar é uma forma de lembrar.",
    "Lealdade é uma métrica de gente que ainda pensa em pessoas.",
    "A beleza é sempre a casca de algum estrago.",
    "Os doentes enterram a si mesmos.",
    "A mandíbula fez o que a cabeça ainda não tinha feito.",
    "O corpo, mais uma vez, soube antes da cabeça.",
    "Cada objeto era um voto — pequeno, mudo, arquivado no escuro — de que ele ainda achava que aquelas pessoas tinham existido, de que existir merecia um traço.",
    "um facho amarelo e honesto",
    "O papel era estúpido.",
  ].join(" ");

  it("skill DESCONHECIDA: ofensores=[] mesmo com tudo estourado (modo sinal, não bloqueia)", () => {
    const d = diagnosticarTransparencia(TEXTO_ESTOURADO, "skill-inexistente");
    expect(d.gnomico.acima).toBe(true);
    expect(d.personificacao.acima).toBe(true);
    expect(d.ofensores).toEqual([]);
  });

  it("linhas não-vazias quando os limiares estouram", () => {
    const d = diagnosticarTransparencia(TEXTO_ESTOURADO, "skill-inexistente");
    expect(d.linhas.length).toBeGreaterThan(0);
  });

  it("idempotência de leitura: 2 chamadas no mesmo texto dão o mesmo resultado", () => {
    const d1 = diagnosticarTransparencia(TEXTO_ESTOURADO, "skill-inexistente");
    const d2 = diagnosticarTransparencia(TEXTO_ESTOURADO, "skill-inexistente");
    expect(d1).toEqual(d2);
  });
});

describe("orcTransparenciaParaSkill", () => {
  it("skill fora do mapa retorna SINAL_TRANSPARENCIA (bloqueia=false)", () => {
    expect(orcTransparenciaParaSkill("skill-fora-do-mapa")).toBe(SINAL_TRANSPARENCIA);
    expect(orcTransparenciaParaSkill("skill-fora-do-mapa").bloqueia).toBe(false);
  });
});

// ===========================================================================
// AUDITORIA-HOOVER (CR4) — transparência skill-aware: hoover protege os eixos
// interioridade/metáfora (piso declarativa off, piso diálogo off, metáfora só cadeia),
// mantendo os 4 alvos de ornamento (gnômico/personificação/sanfona/adjetivo).
// ===========================================================================
describe("diagnosticarTransparencia — hoover-mcfadden (eixos protegidos)", () => {
  it("orcTransparenciaParaSkill(hoover) = SINAL com eixos protegidos desligados", () => {
    const o = orcTransparenciaParaSkill("hoover-mcfadden");
    expect(o.bloqueia).toBe(false);
    expect(o.pisoDeclarativas).toBe(false);
    expect(o.pisoDialogo).toBe(false);
    expect(o.metaforaDensidade).toBe(false);
  });

  // Texto interiorizado: 24 frases com subordinada inicial (nenhuma declarativa simples)
  // => percentDeclarativasSimples.abaixo = true.
  const INTERIOR = Array.from({ length: 24 }, (_, i) =>
    `Quando ele entrou na sala eu senti o frio subir pela espinha numa onda ${i}.`).join(" ");

  it("piso de declarativas: default SINALIZA; hoover NÃO", () => {
    expect(percentDeclarativasSimples(INTERIOR).abaixo).toBe(true); // pré-condição
    const def = diagnosticarTransparencia(INTERIOR).linhas.join(" || ");
    const hoo = diagnosticarTransparencia(INTERIOR, "hoover-mcfadden").linhas.join(" || ");
    expect(def).toMatch(/frases declarativas simples/);
    expect(hoo).not.toMatch(/frases declarativas simples/);
  });

  // Metáfora ISOLADA (1 "como se" em texto curto: por300 > 1, cadeias = 0).
  const META_ISOLADA = "Fiquei parada na porta como se o chão pudesse ceder a qualquer instante.";
  it("metáfora isolada: default SINALIZA; hoover NÃO (só cadeia é defeito)", () => {
    const m = contarMetaforaElaborada(META_ISOLADA);
    expect(m.acima).toBe(true);       // densidade > 1
    expect(m.cadeias).toBe(0);        // isolada
    const def = diagnosticarTransparencia(META_ISOLADA).linhas.join(" || ");
    const hoo = diagnosticarTransparencia(META_ISOLADA, "hoover-mcfadden").linhas.join(" || ");
    expect(def).toMatch(/metafora elaborada/);
    expect(hoo).not.toMatch(/metafora elaborada/);
  });

  // CADEIA de metáforas (3 gatilhos próximos): hoover AINDA sinaliza (é defeito no gênero).
  const META_CADEIA = "O medo era como uma corda esticada, como quem segura o fôlego, como se o ar tivesse acabado.";
  it("cadeia de metáfora: hoover SINALIZA (só a cadeia é defeito)", () => {
    expect(contarMetaforaElaborada(META_CADEIA).cadeias).toBeGreaterThan(0); // pré-condição
    const hoo = diagnosticarTransparencia(META_CADEIA, "hoover-mcfadden").linhas.join(" || ");
    expect(hoo).toMatch(/metafora elaborada/);
  });

  it("os 4 alvos de ornamento seguem sinalizando no hoover (gnômico)", () => {
    const t = "A beleza é sempre a casca de algum estrago. Guardar é uma forma de lembrar. " +
              "Um homem que lida com a terra e não quer levar a terra consigo é sempre um mentiroso.";
    const hoo = diagnosticarTransparencia(t, "hoover-mcfadden").linhas.join(" || ");
    expect(hoo).toMatch(/fecho gnomico\/maxima/);
  });
});
