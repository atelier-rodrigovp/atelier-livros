import { describe, expect, it } from "vitest";
import {
  gateArtefatoPresente,
  gateConhecimentoProibido,
  gatePovImpossivel,
  gateRepeticaoQuaseLiteral,
  gateTruncamento,
  validarSaidaJson,
} from "./gates.js";
import { medirSinais } from "./sinais.js";
import type { SceneSpec, SkillContract } from "./tipos.js";

const base: SkillContract = {
  schema: "skill-contract/v1",
  id: "t",
  versao: "1.0.0",
  nome: "T",
  familia_editorial: "x",
  motor_narrativo: "m",
  unidade_dramatica: "u",
  pov: { pessoa: "terceira_multipla" },
  temporalidade: "linear",
  faixa_palavras: { min: 10, max: 2000 },
  ritmo: { descricao: "r" },
  acao_interioridade: { relacao: "acao_dominante", descricao: "d" },
  politica_exposicao: "e",
  politica_dialogo: { descricao: "d" },
  politica_metafora: { descricao: "m" },
  tipos_gancho: ["revelacao"],
  regras: [
    { id: "cota.gnomico", texto: "Aforismo raro", tipo: "cota", cota: { max: 2, por: "capitulo" }, papeis: [] },
  ],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

describe("gates universais", () => {
  it("artefato ausente reprova; texto presente passa", () => {
    expect(gateArtefatoPresente(null).passou).toBe(false);
    expect(gateArtefatoPresente("  ").passou).toBe(false);
    expect(gateArtefatoPresente("Texto real.").passou).toBe(true);
  });

  it("truncamento: final sem pontuação terminal reprova", () => {
    expect(gateTruncamento("Ela abriu a porta e").passou).toBe(false);
    expect(gateTruncamento("Ela abriu a porta,").passou).toBe(false);
    expect(gateTruncamento("Ela abriu a porta.").passou).toBe(true);
    expect(gateTruncamento("— Quem está aí?").passou).toBe(true);
  });

  it("repetição quase literal cross-capítulo reprova", () => {
    const aforismo = "A memória é uma dívida que ninguém escolhe pagar.";
    const texto = `Ela caminhou até o arquivo. ${aforismo} Depois fechou a gaveta.`;
    const r = gateRepeticaoQuaseLiteral(texto, [{ numero: 2, trecho: aforismo }]);
    expect(r.passou).toBe(false);
    const limpo = gateRepeticaoQuaseLiteral("Ela fechou a gaveta e saiu pela porta lateral.", [{ numero: 2, trecho: aforismo }]);
    expect(limpo.passou).toBe(true);
  });

  it("POV impossível: 1ª pessoa dominante com contrato de terceira reprova", () => {
    const texto = Array(20).fill("Eu sabia que o meu erro tinha sido meu e só meu, e eu voltei comigo mesma ao arquivo porque eu precisava.").join(" ");
    expect(gatePovImpossivel(texto, base).passou).toBe(false);
    const ok = "Marina sabia que o erro fora dela. Voltou ao arquivo antes do anoitecer.";
    expect(gatePovImpossivel(ok, base).passou).toBe(true);
  });

  it("POV primeira pessoa sem nenhuma marca de 1ª pessoa reprova", () => {
    const c: SkillContract = { ...base, pov: { pessoa: "primeira" } };
    const semEu = Array(30).fill("Marina abriu a porta do arquivo e olhou os registros do consulado com atenção.").join(" ");
    expect(gatePovImpossivel(semEu, c).passou).toBe(false);
  });

  it("conhecimento proibido mencionado dispara gate", () => {
    const ficha = {
      schema: "scene-spec/v1",
      capitulo: 1,
      conhecimentos_proibidos: ["Marina não pode saber do Protocolo Vesper ainda"],
      fatos_obrigatorios: [],
      fios_avancados: [],
      fios_ausentes: [],
    } as unknown as SceneSpec;
    expect(gateConhecimentoProibido("Ela leu a palavra Vesper no rodapé.", ficha).passou).toBe(false);
    expect(gateConhecimentoProibido("Ela leu o rodapé sem entender.", ficha).passou).toBe(true);
  });

  it("conhecimento proibido: ano puro e vocabulário da própria ficha não bloqueiam (regressão canário 1)", () => {
    const ficha = {
      schema: "scene-spec/v1",
      capitulo: 1,
      objetivo: "decifrar o inventário de Alcobaça",
      obstaculo: "",
      acao_fisica: "",
      informacao_nova: "o inventário de 1834 tem três terços",
      virada: "",
      mudanca_estado: "",
      local: "",
      tempo: "",
      gancho: { tipo: "x", descricao: "" },
      conhecimentos_proibidos: ["Motivo pelo qual o inventário foi suprimido em 1834", "Marina não conhece o Prior de Alcobaça ainda"],
      fatos_obrigatorios: ["o inventário de 1834 existe"],
      fios_avancados: [],
      fios_ausentes: [],
    } as unknown as SceneSpec;
    // "1834" e "Alcobaça" aparecem no vocabulário visível da ficha → legítimos.
    expect(gateConhecimentoProibido("Ela estudou o inventário de 1834 em Alcobaça a noite inteira.", ficha).passou).toBe(true);
    // "Prior" é distintivo e NÃO está no vocabulário visível → bloqueia.
    expect(gateConhecimentoProibido("O Prior a esperava na porta.", ficha).passou).toBe(false);
  });

  it("validarSaidaJson: JSON válido passa, inválido vira gate fora_do_schema", () => {
    const ok = validarSaidaJson('```json\n{"a":1}\n```', (o) => o as { a: number });
    expect(ok.ok).toBe(true);
    const ruim = validarSaidaJson("não é json", (o) => o);
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(ruim.gate.gate).toBe("fora_do_schema");
  });
});

describe("sinais com cota do contrato (anti-CR4)", () => {
  const textoComAforismos = [
    "Marina fechou o arquivo com cuidado e olhou o corredor vazio.",
    "A lealdade é uma moeda que só circula entre os fracos.",
    "A memória é uma dívida que ninguém escolhe pagar.",
    "O medo é um idioma que todos fingem não falar.",
    "Ela desceu a escada e trancou a porta dupla do consulado.",
  ].join(" ");

  it("cota declarada no contrato marca fora_da_cota", () => {
    const sinais = medirSinais(textoComAforismos, base);
    const gn = sinais.find((s) => s.sinal === "gnomico")!;
    expect(Number(gn.valor)).toBeGreaterThan(2);
    expect(gn.cota).toEqual({ min: undefined, max: 2 });
    expect(gn.fora_da_cota).toBe(true);
  });

  it("sem cota no contrato, o mesmo sinal é só informativo (nunca 'fora')", () => {
    const semCota: SkillContract = { ...base, regras: [] };
    const sinais = medirSinais(textoComAforismos, semCota);
    const gn = sinais.find((s) => s.sinal === "gnomico")!;
    expect(Number(gn.valor)).toBeGreaterThan(2);
    expect(gn.cota).toBeUndefined();
    expect(gn.fora_da_cota).toBe(false);
  });
});
