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
