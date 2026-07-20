import { describe, expect, it } from "vitest";
import { compilarPacote, instrucoesDoContrato, renderizarPacote, type EntradaCompilacao } from "./compilador.js";
import type { ContratoCompilado, SkillContract } from "./tipos.js";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Teste",
  familia_editorial: "thriller_enigma",
  motor_narrativo: "pergunta → revelação",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_multipla" },
  temporalidade: "linear",
  faixa_palavras: { min: 900, max: 1600 },
  ritmo: { descricao: "propulsivo" },
  acao_interioridade: { relacao: "acao_dominante", descricao: "funcional" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "avança cena" },
  politica_metafora: { descricao: "rara" },
  tipos_gancho: ["revelacao"],
  regras: [
    { id: "r-escritor", texto: "Feche a cena em consequência concreta", tipo: "alvo_positivo", papeis: ["escritor"] },
    { id: "r-revisor", texto: "Cobre gancho externo", tipo: "alvo_positivo", papeis: ["revisor_literario"] },
    { id: "cota.gnomico", texto: "Aforismo raro", tipo: "cota", cota: { max: 2, por: "capitulo" }, papeis: ["escritor", "revisor_literario"] },
  ],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

const compilado: ContratoCompilado = { contrato, hash: "abc123", origem: "worker/skills-v2/teste" };

function entradaBase(): EntradaCompilacao {
  return {
    papel: "escritor",
    alvo: "capitulo:3",
    contrato: compilado,
    perfil: { texto: "Perfil de voz do livro.", skillId: "teste", hash: "h-perfil", validado: true },
  };
}

describe("compilarPacote", () => {
  it("recorta instruções por papel", () => {
    const r = compilarPacote(entradaBase());
    expect(r.ok).toBe(true);
    const textos = r.pacote!.instrucoes.map((i) => i.fonte);
    expect(textos).toContain("contrato:r-escritor");
    expect(textos).toContain("contrato:cota.gnomico");
    expect(textos).not.toContain("contrato:r-revisor");
  });

  it("bloqueia perfil de skill incompatível", () => {
    const e = entradaBase();
    e.perfil = { ...e.perfil, skillId: "outra-skill" };
    const r = compilarPacote(e);
    expect(r.ok).toBe(false);
    expect(r.bloqueios[0].codigo).toBe("SKILL_PERFIL_INCOMPATIVEL");
  });

  it("bloqueia perfil não validado", () => {
    const e = entradaBase();
    e.perfil = { ...e.perfil, validado: false };
    expect(compilarPacote(e).bloqueios[0].codigo).toBe("PERFIL_NAO_VALIDADO");
  });

  it("bloqueia documento de fundação substituído (hash divergente)", () => {
    const e = entradaBase();
    e.fundacaoEsperada = { "Biblia-da-Obra.md": "hash-canonico" };
    e.fundacaoRecebida = { "Biblia-da-Obra.md": "hash-antigo" };
    const r = compilarPacote(e);
    expect(r.ok).toBe(false);
    expect(r.bloqueios[0].codigo).toBe("DOCUMENTO_SUBSTITUIDO");
  });

  it("deduplica instruções com texto equivalente", () => {
    const e = entradaBase();
    e.preferencias = [
      { texto: "feche a cena em consequência   CONCRETA", camada: "preferencia", fonte: "pref:1" },
    ];
    const r = compilarPacote(e);
    const iguais = r.pacote!.instrucoes.filter((i) => /consequência concreta/i.test(i.texto));
    expect(iguais).toHaveLength(1);
    expect(iguais[0].camada).toBe("contrato"); // camada mais forte venceu
  });

  it("contradição por chave: camada superior vence e o descarte fica registrado", () => {
    const e = entradaBase();
    e.instrucoesAutor = [
      { texto: "Aforismo liberado neste livro", camada: "decisao_autor", fonte: "autor:decisao-1", chave: "cota.gnomico" },
    ];
    e.preferencias = [
      { texto: "Nenhum aforismo jamais", camada: "preferencia", fonte: "pref:2", chave: "cota.gnomico" },
    ];
    const r = compilarPacote(e);
    expect(r.ok).toBe(true);
    // contrato (camada 2) vence autor (3) e preferência (7) na mesma chave
    const finais = r.pacote!.instrucoes.filter((i) => i.chave === "cota.gnomico");
    expect(finais).toHaveLength(1);
    expect(finais[0].camada).toBe("contrato");
    expect(r.pacote!.contradicoes.length).toBe(2);
    expect(r.pacote!.contradicoes.every((c) => c.resolucao === "precedencia")).toBe(true);
  });

  it("contradição na MESMA camada bloqueia (sem resolução silenciosa)", () => {
    const e = entradaBase();
    e.instrucoesAutor = [
      { texto: "Interioridade alta neste livro", camada: "decisao_autor", fonte: "autor:a", chave: "interioridade" },
      { texto: "Interioridade mínima neste livro", camada: "decisao_autor", fonte: "autor:b", chave: "interioridade" },
    ];
    const r = compilarPacote(e);
    expect(r.ok).toBe(false);
    expect(r.bloqueios[0].codigo).toBe("CONTRADICAO_MESMA_CAMADA");
  });

  it("hash do pacote é determinístico e sensível ao conteúdo", () => {
    const a = compilarPacote(entradaBase()).pacote!.hash;
    const b = compilarPacote(entradaBase()).pacote!.hash;
    expect(a).toBe(b);
    const e = entradaBase();
    e.repeticoesRecentes = ["a última faixa de luz"];
    expect(compilarPacote(e).pacote!.hash).not.toBe(a);
  });

  it("renderização inclui precedência, seções e não-repetição", () => {
    const e = entradaBase();
    e.repeticoesRecentes = ["cheiro de papel queimado"];
    e.fatos = [{ titulo: "FATOS", texto: "- O registro é de 1987", fonte: "contextualizador" }];
    const txt = renderizarPacote(compilarPacote(e).pacote!);
    expect(txt).toContain("ordem de precedência");
    expect(txt).toContain("NÃO REPETIR");
    expect(txt).toContain("cheiro de papel queimado");
    expect(txt).toContain("PERFIL DO LIVRO");
    expect(txt).toContain("FATOS");
  });

  it("instrucoesDoContrato injeta cota legível", () => {
    const ins = instrucoesDoContrato(compilado, "escritor");
    const cota = ins.find((i) => i.chave === "cota.gnomico");
    expect(cota?.texto).toContain("máx 2 por capitulo");
  });
});
