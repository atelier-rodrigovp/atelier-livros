import { describe, it, expect } from "vitest";
import {
  contarManeirismos, resumoManeirismo, fechoEpigramatico,
  ngramasSobrerepresentados, diagnosticarRepeticao, contarMuletas,
  dividirFrases, diagnosticarCadencia, cadenciaAcima,
} from "./maneirismo.js";

describe("contarMuletas — palavra-muleta ('coisa')", () => {
  it("conta 'coisa'/'coisas' como palavra inteira, case-insensitive", () => {
    const r = contarMuletas("A coisa era estranha. Coisas assim. COISA de novo.");
    const c = r.find((m) => /coisa/.test(m.termo));
    expect(c?.n).toBe(3);
  });
  it("NÃO conta substrings ('coisinha', 'coisas' dentro de outra palavra)", () => {
    const r = contarMuletas("Uma coisinha pequena, coisíssima, recoisado — nada disso conta.");
    expect(r.find((m) => /coisa/.test(m.termo))).toBeUndefined(); // 0 → filtrado
  });
  it("orçamento APERTADO: 'coisa' estoura fácil (alvo baixo)", () => {
    // 6× 'coisa' em ~12 palavras → muito acima do alvo
    const r = contarMuletas("coisa coisa coisa coisa coisa coisa e mais texto aqui ok fim");
    const c = r.find((m) => /coisa/.test(m.termo))!;
    expect(c.acima).toBe(true);
  });
  it("conta expressões-muleta ('meio que', 'na verdade')", () => {
    const r = contarMuletas("Ele meio que sumiu. Na verdade, meio que voltou.");
    expect(r.find((m) => /meio que/.test(m.termo))?.n).toBe(2);
    expect(r.find((m) => /na verdade/.test(m.termo))?.n).toBe(1);
  });
  it("prosa sem muletas → lista vazia", () => {
    expect(contarMuletas("A manhã clara desceu sobre o cais e os barcos.")).toEqual([]);
  });
});

describe("contarManeirismos — moldes nomeados", () => {
  it("conta antíteses 'não era X. Era Y.' (várias formas)", () => {
    const t = "Não era medo. Era algo pior. Não foi sorte. Foi cálculo. Não era pergunta; era ordem.";
    const r = contarManeirismos(t);
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.padroes.some((p) => /antítese|aposto/.test(p.nome))).toBe(true);
  });

  it("conta o molde 'do jeito que/de'", () => {
    const r = contarManeirismos("Ela fez do jeito que sempre fez, do jeito de antes, do jeito como mandava.");
    const m = r.padroes.find((p) => /do jeito/.test(p.nome));
    expect(m?.n).toBe(3);
  });

  it("marca 'acima' quando passa do alvo proporcional ao tamanho", () => {
    // texto curto → alvo=1; 3 ocorrências do mesmo molde → acima
    const r = contarManeirismos("Não era A. Era B. Não era C. Era D. Não era E. Era F.");
    const m = r.padroes.find((p) => /antítese "não era/.test(p.nome));
    expect(m?.n).toBeGreaterThanOrEqual(3);
    expect(m?.acima).toBe(true);
    expect(r.acimaDoOrcamento).toBe(true);
  });

  it("prosa limpa → nada acima do orçamento", () => {
    const r = contarManeirismos("A manhã chegou devagar sobre a cidade, e ela seguiu pela rua tranquila até o cais.");
    expect(r.acimaDoOrcamento).toBe(false);
  });

  it("resumo legível", () => {
    expect(resumoManeirismo(contarManeirismos("Não era frio. Era pânico. Não era frio. Era pânico."))).toMatch(/Maneirismo:/);
    expect(resumoManeirismo(contarManeirismos("Texto calmo e claro."))).toMatch(/nenhum tique/);
  });
});

describe("fechoEpigramatico", () => {
  it("flag quando >1/3 dos capítulos terminam em frase curta isolada", () => {
    const caps = [
      "Começo do capítulo um, com várias palavras de prosa normal aqui.\n\nE então tudo mudou.",
      "Capítulo dois seguia o rio abaixo por linhas e linhas de texto comum.\n\nEla sabia.",
      "Capítulo três, longo e detalhado, terminava de um jeito expansivo e completo sem corte seco.",
    ];
    const f = fechoEpigramatico(caps);
    expect(f.n).toBe(2);
    expect(f.acima).toBe(true); // 2/3 > 1/3
    expect(f.capitulos).toEqual([1, 2]);
  });

  it("não flag quando fechos são longos", () => {
    const caps = ["Texto.\n\nO fim deste capítulo se estende numa frase longa e respirada que não é epigrama."];
    expect(fechoEpigramatico(caps).acima).toBe(false);
  });
});

describe("ngramasSobrerepresentados — genérico", () => {
  it("pega um n-grama de conteúdo repetido acima do limiar", () => {
    const frase = "a luz fria do amanhecer caía sobre tudo. ";
    const hits = ngramasSobrerepresentados(frase.repeat(6), { min: 4, limiarPor10k: 1 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].gram).toContain("luz fria");
  });

  it("ignora n-gramas quase-só stopword", () => {
    const hits = ngramasSobrerepresentados("e a cada um dos que se ".repeat(8), { min: 4, limiarPor10k: 1 });
    expect(hits.length).toBe(0);
  });
});

describe("dividirFrases", () => {
  it("separa por pontuação terminal e ignora headings", () => {
    const fr = dividirFrases("# Título\n\nDavam datas. Davam horas. Ele riu!");
    expect(fr).toEqual(["Davam datas.", "Davam horas.", "Ele riu!"]);
  });
});

describe("diagnosticarCadencia — ritmo (tiques reais do livro)", () => {
  const nome = (q: { nome: string }) => q.nome;
  it("pega fragmentos colados + anáfora ('Davam datas. Davam horas.')", () => {
    const r = diagnosticarCadencia("Davam datas. Davam horas. Davam nomes que ninguém pedira.");
    const acima = cadenciaAcima("Davam datas. Davam horas. Davam nomes que ninguém pedira.").map(nome);
    expect(acima.join(" ")).toMatch(/colados|anáfora/);
    expect(r.acima).toBe(true);
  });

  it("pega clipe de negação curto recorrente ('Não precisava.' / 'Não precisavam.')", () => {
    const t = "Marsh não anotava nada. Não precisava. Olhou de novo o arquivo aberto. Não precisavam.";
    const acima = cadenciaAcima(t).map(nome).join(" ");
    expect(acima).toMatch(/clipe de negação/);
  });

  it("pega staccato denso (capítulo majoritariamente picado)", () => {
    const t = "Ele parou. Olhou. Não viu. O vento soprou. A porta rangeu. Ninguém veio. Esperou. Nada. Foi embora.";
    const r = diagnosticarCadencia(t);
    const stac = r.tiques.find((q) => /staccato/.test(q.nome))!;
    expect(stac.acima).toBe(true);
    expect(stac.densidade!).toBeGreaterThan(35);
  });

  it("pega epigrama antitético ('o silêncio fazia o trabalho que a pergunta estragava')", () => {
    const acima = cadenciaAcima("Ali, o silêncio fazia o trabalho que a pergunta estragava, e ele aprendeu isso cedo. O silêncio fazia o serviço que a palavra perdia também.").map(nome).join(" ");
    expect(acima).toMatch(/epigrama/);
  });

  it("cobra a cota da Regra 4: fragmentos de ênfase colados nunca são permitidos", () => {
    // dois fragmentos 1-3 palavras colados → estoura (alvo 0)
    const t = "Ele entrou na sala devagar, medindo cada passo até a mesa. Impossível. Não pode ser. Depois sentou e respirou fundo antes de abrir o envelope lacrado.";
    const q = diagnosticarCadencia(t).tiques.find((x) => /COLADOS/.test(x.nome))!;
    expect(q.acima).toBe(true);
  });

  it("FALSO-POSITIVO: ritmo legítimo (mix longo/curto, um único fragmento) NÃO dispara", () => {
    const t =
      "A manhã desceu devagar sobre o porto, e o velho atravessou o cais sem pressa, " +
      "contando os barcos amarrados como quem reza um terço gasto pelo uso. Parou. " +
      "Depois seguiu em frente, porque o mar não esperava por homem nenhum e ele já " +
      "aprendera, havia muito tempo, a não pedir o que a maré não estava disposta a dar. " +
      "Na esquina do armazém, a luz acendeu cedo e alguém assobiava uma canção antiga, " +
      "fora de tom, sem que isso parecesse incomodar ninguém naquela hora mansa.";
    const r = diagnosticarCadencia(t);
    expect(r.acima).toBe(false);
  });
});

describe("diagnosticarRepeticao — agregado", () => {
  it("junta moldes acima + fecho + n-gramas", () => {
    const cap = "Não era paz. Era guerra. Não era paz. Era guerra. A sombra longa do muro.";
    const d = diagnosticarRepeticao(cap.repeat(3), [cap, cap, cap]);
    expect(d.algumAcima).toBe(true);
    expect(d.moldes.length).toBeGreaterThan(0);
  });
});
