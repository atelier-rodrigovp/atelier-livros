import { describe, expect, it } from "vitest";
import { sinaisGhostwriting, validarSpec } from "./spec.js";
import type { SceneSpec, SkillContract } from "./tipos.js";

const contratoBase: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "Skill de Teste",
  familia_editorial: "thriller_enigma",
  motor_narrativo: "pergunta → obstáculo → revelação → corte",
  unidade_dramatica: "cena com virada",
  pov: { pessoa: "terceira_multipla" },
  temporalidade: "relógio comprimido",
  faixa_palavras: { min: 900, alvo: 1200, max: 1600 },
  ritmo: { descricao: "curto e propulsivo" },
  acao_interioridade: { relacao: "acao_dominante", descricao: "interioridade funcional" },
  politica_exposicao: "dramatizada, nunca em bloco",
  politica_dialogo: { descricao: "diálogo avança a cena" },
  politica_metafora: { descricao: "rara e concreta", cota_por_capitulo: 1 },
  tipos_gancho: ["revelacao", "ameaca", "pergunta_aberta"],
  regras: [
    { id: "r1", texto: "Feche cada cena com consequência concreta", tipo: "alvo_positivo", papeis: ["escritor"] },
  ],
  testes_positivos: ["transparência"],
  sinais_negativos: ["gnomico"],
  excecoes: [],
  estruturas_exigidas: { docs: ["dossie-factual.md"], campos_spec: ["Dia/Hora"] },
  referencias: [],
  modelos_positivos: [],
};

function fichaValida(): SceneSpec {
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
    campos_skill: { "Dia/Hora": "Dia 2, 14h30 → 15h10" },
  };
}

describe("validarSpec — estrutura", () => {
  it("ficha válida passa", () => {
    const r = validarSpec(fichaValida(), contratoBase);
    expect(r.erros).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("campo obrigatório vazio reprova", () => {
    const f = fichaValida();
    f.virada = "";
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("virada");
  });

  it("gancho fora do vocabulário da skill reprova", () => {
    const f = fichaValida();
    f.gancho = { tipo: "cliffhanger_generico", descricao: "algo acontece" };
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("gancho.tipo");
  });

  it("campo exigido pela skill ausente reprova", () => {
    const f = fichaValida();
    delete f.campos_skill;
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("Dia/Hora");
  });

  it("exceção editorial referenciando regra inexistente reprova; existente passa", () => {
    const f = fichaValida();
    f.excecao_editorial = { regra_id: "nao-existe", justificativa: "cena de clímax" };
    expect(validarSpec(f, contratoBase).ok).toBe(false);
    f.excecao_editorial = { regra_id: "r1", justificativa: "cena de clímax fecha no corte" };
    expect(validarSpec(f, contratoBase).ok).toBe(true);
  });
});

describe("validarSpec — anti-ghostwriting", () => {
  it("diálogo redigido na ficha reprova", () => {
    const f = fichaValida();
    f.virada = '— Você não devia estar aqui — disse o arquivista, fechando a porta.';
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("diálogo redigido");
  });

  it("frase de abertura ditada reprova", () => {
    const f = fichaValida();
    f.objetivo = 'o capítulo abre com a frase "O passado tem cheiro de papel queimado" e segue a partir dela';
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("frase pronta");
  });

  it("campo com parágrafo redigido (longo demais) reprova", () => {
    const f = fichaValida();
    f.mudanca_estado = Array(70).fill("palavra").join(" ");
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("palavras");
  });

  it("aforismo pronto num campo vira AVISO (detector não decide sozinho), não bloqueio", () => {
    const s = sinaisGhostwriting("virada", "Ela entende que a memória é uma dívida que ninguém escolhe pagar.");
    expect(s.bloqueantes).toEqual([]);
    expect(s.avisos.length).toBeGreaterThan(0);
  });

  it("apontamento seco não dispara falso positivo", () => {
    const s = sinaisGhostwriting("acao_fisica", "ela fotografa o livro de registros e esconde o celular no casaco");
    expect(s.bloqueantes).toEqual([]);
    expect(s.avisos).toEqual([]);
  });

  // Caso real do canário hoover: fato devolvido como objeto explodia com
  // "v.trim is not a function" — mensagem inútil para o retry do arquiteto.
  it("campo não-string vira erro acionável, não TypeError", () => {
    const f = fichaValida();
    (f.fatos_obrigatorios as unknown[])[0] = { fato: "Marina em coma" };
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(false);
    expect(r.erros.join()).toContain("fatos_obrigatorios[0]: deve ser texto simples (recebido object)");
  });

  // Caso real do canário hoover: falso positivo de personificação num objetivo com
  // agente humano travava a ficha em loop determinístico (3 tentativas idênticas).
  it("falso positivo de personificação em objetivo NÃO bloqueia a ficha", () => {
    const f = fichaValida();
    f.objetivo = "Assumir o plantão da paciente em coma cumprindo a rotina de admissão sem chamar atenção sobre si";
    const r = validarSpec(f, contratoBase);
    expect(r.ok).toBe(true);
    expect(r.avisos.join()).toContain("personificação");
  });
});
