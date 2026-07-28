// Fatia I — repetição literal, semântica e maneirismos.
import { describe, expect, it } from "vitest";
import {
  CAPITULOS_PARA_SINAL,
  decidirManeirismo,
  detectarRepeticaoLiteral,
  detectarRepeticaoSemantica,
  diagnosticoEntreLivros,
  frasesDe,
  medirManeirismosDoLivro,
  repeticaoSemanticaBloqueia,
  type PoliticaManeirismo,
  type SinalManeirismoLivro,
} from "./repeticao.js";
import type { EntradaMemoria } from "./memoria-prosa.js";

const FRASE = "A maré de sizígia descobre a entrada do túnel duas vezes por ano, em março e setembro.";

describe("camada 1 — repetição LITERAL contra TODOS os capítulos", () => {
  it("[DOD:I-01] pega a frase repetida DEZ capítulos atrás (o que o gate antigo não via)", () => {
    const anteriores = Array.from({ length: 10 }, (_, i) => ({
      numero: i + 1,
      texto: i === 0 ? `Marina desceu ao porão. ${FRASE}` : `Capítulo ${i + 1} sem nada em comum com o resto do livro.`,
    }));
    const achados = detectarRepeticaoLiteral(`Ela lembrou do que o velho dissera. ${FRASE}`, anteriores);
    expect(achados.length).toBeGreaterThan(0);
    expect(achados[0].capituloAnterior).toBe(1);
    expect(achados[0].similaridade).toBeGreaterThanOrEqual(0.72);
  });

  it("localiza os DOIS trechos", () => {
    const a = detectarRepeticaoLiteral(FRASE, [{ numero: 4, texto: FRASE }]);
    expect(a[0].trechoAtual).toContain("maré de sizígia");
    expect(a[0].trechoAnterior).toContain("maré de sizígia");
  });

  it("quase-literal (pontuação e caixa diferentes) ainda é pego", () => {
    const variante = FRASE.toUpperCase().replace(/,/g, "");
    expect(detectarRepeticaoLiteral(variante, [{ numero: 2, texto: FRASE }]).length).toBeGreaterThan(0);
  });

  it("PARÁFRASE não é trabalho desta camada — o limiar alto a deixa passar de propósito", () => {
    // Trocar palavras derruba o Jaccard de shingles abaixo do limiar. Isso é
    // desenho, não falha: baixar o limiar aqui produziria falso positivo em prosa
    // legítima. Paráfrase é responsabilidade da camada 2 (semântica).
    const parafrase = FRASE.replace("duas vezes por ano", "duas vezes ao ano").replace("descobre", "revela");
    expect(detectarRepeticaoLiteral(parafrase, [{ numero: 2, texto: FRASE }])).toEqual([]);
  });

  it("texto DIFERENTE sobre o mesmo assunto NÃO é repetição literal", () => {
    const outro = "O túnel só fica acessível quando a maré baixa muito, o que acontece duas vezes no ano.";
    expect(detectarRepeticaoLiteral(outro, [{ numero: 2, texto: FRASE }])).toEqual([]);
  });

  it("frases curtas não entram (coincidência não é repetição)", () => {
    expect(frasesDe("Ela parou. Ele olhou. Nada.")).toEqual([]);
  });

  it("livro sem capítulos anteriores não acusa nada", () => {
    expect(detectarRepeticaoLiteral(FRASE, [])).toEqual([]);
  });

  it("escala: 40 capítulos não explodem o detector", () => {
    const anteriores = Array.from({ length: 40 }, (_, i) => ({
      numero: i + 1,
      texto: `Capítulo ${i + 1}. ` + Array(40).fill(`A cena ${i} avança pelo corredor estreito do arquivo velho.`).join(" "),
    }));
    const t0 = Date.now();
    detectarRepeticaoLiteral(`Um texto novo qualquer que não repete nada do que veio antes neste livro.`, anteriores);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe("camada 2 — repetição SEMÂNTICA (mesma revelação, outras palavras)", () => {
  const memoria = (over: Partial<EntradaMemoria> = {}): EntradaMemoria => ({
    id: "M02.1",
    tipo: "revelacao",
    capitulo: 2,
    enunciado: "o irmão de Marina esteve no consulado em 1987",
    trecho: "o nome do irmão estava na linha de 1987, escrito à mão",
    confianca: "alta",
    text_hash: "h",
    origem: "prosa",
    estado: "aberta",
    ...over,
  });

  it("[DOD:I-02] PARÁFRASE da mesma revelação é detectada", () => {
    const a = detectarRepeticaoSemantica({
      capitulo: 9,
      novoEnunciado: "Marina descobre que o irmão passou pelo consulado no ano de 1987",
      trechoAtual: "então o irmão dela tinha estado ali, em 1987, e ninguém contara",
      ledger: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão de Marina esteve no consulado em 1987" }],
      memoria: [memoria()],
    });
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].capituloAnterior).toBe(2);
  });

  it("apresenta evidência dos DOIS pontos", () => {
    const a = detectarRepeticaoSemantica({
      capitulo: 9,
      novoEnunciado: "Marina descobre que o irmão passou pelo consulado no ano de 1987",
      trechoAtual: "então o irmão dela tinha estado ali, em 1987",
      ledger: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão de Marina esteve no consulado em 1987" }],
      memoria: [memoria()],
    });
    expect(a[0].trechoAnterior).toBeTruthy();
    expect(a[0].trechoAtual).toBeTruthy();
    expect(repeticaoSemanticaBloqueia(a[0])).toBe(true);
  });

  it("sem evidência do lado antigo, NÃO bloqueia (vira sinal para o revisor)", () => {
    const a = detectarRepeticaoSemantica({
      capitulo: 9,
      novoEnunciado: "Marina descobre que o irmão passou pelo consulado no ano de 1987",
      trechoAtual: "o irmão dela tinha estado ali",
      ledger: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão de Marina esteve no consulado em 1987" }],
      memoria: [], // nada localizável no capítulo 2
    });
    expect(a.length).toBeGreaterThan(0);
    expect(repeticaoSemanticaBloqueia(a[0])).toBe(false);
  });

  it("informação genuinamente nova não é acusada", () => {
    const a = detectarRepeticaoSemantica({
      capitulo: 9,
      novoEnunciado: "o farol foi automatizado por ordem do ministério",
      trechoAtual: "a placa dizia que o farol fora automatizado por ordem do ministério",
      ledger: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão de Marina esteve no consulado em 1987" }],
      memoria: [memoria()],
    });
    expect(a).toEqual([]);
  });

  it("não acusa contra o PRÓPRIO capítulo nem contra capítulos futuros", () => {
    const a = detectarRepeticaoSemantica({
      capitulo: 2,
      novoEnunciado: "o irmão de Marina esteve no consulado em 1987",
      trechoAtual: "o nome do irmão estava na linha de 1987",
      ledger: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão de Marina esteve no consulado em 1987" }],
      memoria: [memoria({ capitulo: 5 })],
    });
    expect(a).toEqual([]);
  });
});

describe("camada 3 — MANEIRISMO é sinal acumulativo", () => {
  const comPadrao = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      numero: i + 1,
      texto: `Capítulo ${i + 1}. Não era medo, era cansaço. Ela seguiu pelo corredor até o fim.`,
    }));

  it('mede "não era A, era B" ao longo do livro', () => {
    const s = medirManeirismosDoLivro(comPadrao(6));
    const padrao = s.find((x) => x.padrao === "nao_era_a_era_b");
    expect(padrao?.capitulos).toBe(6);
    expect(padrao?.ocorrencias[0].trecho).toContain("Não era medo");
  });

  it("[DOD:I-03] padrão em CINCO capítulos gera sinal acumulativo", () => {
    const s = medirManeirismosDoLivro(comPadrao(CAPITULOS_PARA_SINAL))[0];
    const d = decidirManeirismo(s, { calibrados: {}, excecoesDoAutor: [] });
    expect(d.acao).toBe("sinalizar");
    expect(d).toMatchObject({ motivo: expect.stringContaining("sinal acumulativo") });
  });

  it("padrão em POUCOS capítulos é ignorado (voz não é maneirismo)", () => {
    const s = medirManeirismosDoLivro(comPadrao(2))[0];
    expect(decidirManeirismo(s, { calibrados: {}, excecoesDoAutor: [] }).acao).toBe("ignorar");
  });

  it("[DOD:I-04] MANEIRISMO NÃO CALIBRADO NUNCA BLOQUEIA — nem com vinte capítulos", () => {
    const s = medirManeirismosDoLivro(comPadrao(20))[0];
    const d = decidirManeirismo(s, { calibrados: {}, excecoesDoAutor: [] });
    expect(d.acao).toBe("sinalizar");
    expect(d.acao).not.toBe("bloquear");
  });

  it("com limiar CALIBRADO por humano, bloqueia — citando o corpus", () => {
    const s = medirManeirismosDoLivro(comPadrao(8))[0];
    const politica: PoliticaManeirismo = {
      calibrados: { nao_era_a_era_b: { limiarCapitulos: 6, corpus_hash: "14c194fd4c49aaaa" } },
      excecoesDoAutor: [],
    };
    const d = decidirManeirismo(s, politica);
    expect(d.acao).toBe("bloquear");
    expect(d).toMatchObject({ motivo: expect.stringContaining("limiar calibrado") });
  });

  it("abaixo do limiar calibrado, continua só sinalizando", () => {
    const s = medirManeirismosDoLivro(comPadrao(5))[0];
    const politica: PoliticaManeirismo = {
      calibrados: { nao_era_a_era_b: { limiarCapitulos: 9, corpus_hash: "h" } },
      excecoesDoAutor: [],
    };
    expect(decidirManeirismo(s, politica).acao).toBe("sinalizar");
  });

  it("exceção de VOZ AUTORAL desliga o padrão sem desligar o detector", () => {
    const sinais = medirManeirismosDoLivro(comPadrao(20));
    const politica: PoliticaManeirismo = {
      calibrados: { nao_era_a_era_b: { limiarCapitulos: 6, corpus_hash: "h" } },
      excecoesDoAutor: [{ padrao: "nao_era_a_era_b", justificativa: "é a voz da narradora", em: "2026-07-28" }],
    };
    expect(decidirManeirismo(sinais[0], politica).acao).toBe("ignorar");
    // O detector continua medindo os OUTROS padrões.
    expect(sinais.length).toBeGreaterThanOrEqual(1);
  });

  it("detecta os demais padrões declarados", () => {
    const caps = [
      { numero: 1, texto: "As mãos dela se moveram antes que ela decidisse. Ele contou três segundos." },
      { numero: 2, texto: "O corpo dele reagiu antes de ele entender. Contou dez segundos até a porta abrir." },
    ];
    const ids = medirManeirismosDoLivro(caps).map((s) => s.padrao);
    expect(ids).toContain("corpo_antes_da_vontade");
    expect(ids).toContain("contagem_de_segundos");
  });
});

describe("comparação ENTRE LIVROS é diagnóstico, nunca bloqueio", () => {
  const sinal = (padrao: string, capitulos: number): SinalManeirismoLivro => ({
    padrao,
    descricao: padrao,
    capitulos,
    total: capitulos,
    ocorrencias: [],
  });

  it("aponta o padrão que atravessa livros do mesmo autor", () => {
    const d = diagnosticoEntreLivros(
      [sinal("nao_era_a_era_b", 7)],
      [{ titulo: "O Farol Cego", sinais: [sinal("nao_era_a_era_b", 9)] }]
    );
    expect(d).toHaveLength(1);
    expect(d[0].livros).toEqual(["O Farol Cego"]);
  });

  it("não aponta padrão que só existe no livro atual", () => {
    expect(diagnosticoEntreLivros([sinal("aforismo_de_fecho", 6)], [{ titulo: "Outro", sinais: [] }])).toEqual([]);
  });

  it("o diagnóstico não tem poder de decisão (só devolve informação)", () => {
    const d = diagnosticoEntreLivros([sinal("x", 9)], [{ titulo: "L", sinais: [sinal("x", 9)] }]);
    expect(Object.keys(d[0])).toEqual(["padrao", "descricao", "livros"]);
  });
});
