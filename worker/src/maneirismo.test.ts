import { describe, it, expect } from "vitest";
import {
  contarManeirismos, resumoManeirismo, fechoEpigramatico,
  ngramasSobrerepresentados, diagnosticarRepeticao, contarMuletas,
  dividirFrases, diagnosticarCadencia, cadenciaAcima, interioridadeSemEvento,
  orcCadenciaParaSkill, ORC_CADENCIA,
} from "./maneirismo.js";

const TRECHO_EVANGELHO =
  "Não havia nada na borda do fragmento, porque a margem era ausência por definição. " +
  "Havia só o branco. Como quando se entra num cômodo conhecido e um detalhe está fora " +
  "do lugar, como se a parede tivesse recuado. Aqui não havia móvel nem quadro. Havia só o branco.";

describe("detector — tiques que ESCAPAVAM (haver-antítese, símile-andaime)", () => {
  it('pega antítese com "haver" ("Não havia X… Havia Y") — antes escapava', () => {
    const r = contarManeirismos(TRECHO_EVANGELHO);
    expect(r.padroes.some((p) => /haver/.test(p.nome) && p.n >= 1)).toBe(true);
  });
  it('pega símile-andaime ("como se / como quando")', () => {
    const r = contarManeirismos(TRECHO_EVANGELHO);
    const s = r.padroes.find((p) => /símile-andaime/.test(p.nome));
    expect(s?.n).toBe(2); // "Como quando" + "como se"
  });
  it("o trecho real estoura o orçamento (a rede antiga deixava passar)", () => {
    expect(contarManeirismos(TRECHO_EVANGELHO).acimaDoOrcamento).toBe(true);
  });
});

describe("interioridadeSemEvento (heurística)", () => {
  it("FLAGA capítulo cópula/percepção sem diálogo (o trecho do Evangelho)", () => {
    const longo = TRECHO_EVANGELHO + " A ausência tinha peso. O silêncio era um objeto. " +
      "Tudo parecia recuado, como se o quarto respirasse devagar. Nada se movia. Havia apenas a espera.";
    expect(interioridadeSemEvento(longo).acima).toBe(true);
  });
  it("FALSO-POSITIVO: cena com diálogo e ação NÃO dispara", () => {
    const cena =
      "— Abre a porta — disse ele, e empurrou a mesa para o lado. Ela girou a chave duas vezes. " +
      "O trinco cedeu. Lá fora, um carro acelerou e sumiu na esquina. Ela correu até a janela e gritou o nome dele. " +
      "Ninguém respondeu, então ela desceu a escada de três em três degraus e abriu o portão.";
    expect(interioridadeSemEvento(cena).acima).toBe(false);
  });
});

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

  it("DIÁLOGO não conta como tique de ritmo (fala curta é fala) — vira sinal fragDialogo", () => {
    // Falas curtas em sequência + narração longa e sã: nada acima; falas contadas no sinal.
    const t =
      "— Desculpe. Ainda está aberto?\n\n— Está. Entre.\n\n— Obrigada. Já vou.\n\n" +
      "Ela atravessou a loja devagar, medindo as prateleiras com o olhar de quem procura " +
      "uma memória e não um produto, e o dono voltou ao jornal dobrado sobre o balcão, " +
      "porque naquela cidade ninguém tinha pressa de vender o que o tempo mesmo traria. " +
      "A campainha da porta descansou no silêncio morno da tarde enquanto lá fora o " +
      "calçamento guardava o calor do meio-dia como um animal grande e manso. " +
      "Ninguém mais entrou naquela hora, e a poeira dançava na régua de luz da vitrine, " +
      "indiferente ao que as pessoas chamavam de pressa nas cidades maiores do vale.";
    const r = diagnosticarCadencia(t);
    expect(r.acima).toBe(false); // nenhum tique de narração disparado pelas falas
    expect(r.fragDialogo).toBeGreaterThan(0); // mas o sinal existe p/ o revisor
  });

  it("ORÇAMENTO POR SKILL: prosa 'curta e cheia' do hoover reprova no default e PASSA no orçamento da skill", () => {
    // Narração de staccato deliberado (assinatura hoover-mcfadden), sem molde de IA:
    // ~46% de frases curtas e 5 fragmentos de ênfase espaçados (default: fragEnfase 2,
    // staccato 35% → reprova; hoover: fragEnfase 6, staccato 55% → conforme).
    const t =
      "Bato uma porta na outra. Quando fecham, respiro. " +
      "O corredor inteiro cheirava a cera velha e a alguma memória de escola que eu não pedi para ter. " +
      "Doze. " +
      "Era o número de passos entre a escada e a sala, o mesmo de ontem, o mesmo da semana passada, e eu contava porque contar segura as mãos. " +
      "Contei os passos. " +
      "A pasta continuava sobre a mesa, exatamente onde eu a deixara na sexta-feira à noite, " +
      "e o bilhete dentro dela dizia menos do que eu precisava e mais do que eu queria saber. " +
      "Guardei o bilhete. " +
      "Lá fora um carro passou devagar demais para quem tem destino, e eu fiquei olhando a rua até as luzes dobrarem a esquina. " +
      "Respirei fundo. " +
      "Depois apaguei a luz da sala e fechei a porta com o cuidado de quem não quer acordar a própria culpa. " +
      "Ninguém viu.";
    const padrao = diagnosticarCadencia(t);
    const hoover = diagnosticarCadencia(t, orcCadenciaParaSkill("hoover-mcfadden"));
    expect(padrao.acima).toBe(true); // o orçamento único criminalizava esta voz
    expect(hoover.acima).toBe(false); // a mesma prosa é CONFORME na skill dela
  });

  it("orcCadenciaParaSkill: skill desconhecida/ausente → default intacto", () => {
    expect(orcCadenciaParaSkill("skill-dan-brown")).toBe(ORC_CADENCIA);
    expect(orcCadenciaParaSkill(null)).toBe(ORC_CADENCIA);
    expect(orcCadenciaParaSkill(undefined)).toBe(ORC_CADENCIA);
    expect(orcCadenciaParaSkill("hoover-mcfadden").staccatoFrac).toBeGreaterThan(ORC_CADENCIA.staccatoFrac);
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
