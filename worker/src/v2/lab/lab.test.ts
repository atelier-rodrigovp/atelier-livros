import { mkdtemp, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { carregarContrato } from "../contrato.js";
import { ProvedorMock } from "../provedor.js";
import { mapaModelosDoAmbiente } from "../config.js";
import { validarSpec } from "../spec.js";
import { DiscoPersistencia } from "../persistencia.js";
import { adaptarFichaParaSkill, CENAS_LAB } from "./cenas.js";
import { rodarLab, type ExecucaoLab } from "./rodar.js";
import { amostrasCegasParaUi, avaliarCego, ordenarAmostrasCegas, type AvaliacaoCega } from "./avaliar.js";
import { compararExecucoes, falhasAvaliacaoCega } from "./relatorio.js";

const SKILLS = ["dan-brown", "hoover-mcfadden", "romantasy"];
const mapa = mapaModelosDoAmbiente({} as NodeJS.ProcessEnv);

// Prosa mock distinta por skill (voz reconhecível; termina com pontuação; sem aforismo).
const PROSA: Record<string, string> = {
  "dan-brown": [
    "Marina cruzou o arquivo em três passos. O registro de 1987 estava aberto sobre a mesa.",
    "Alguém tinha raspado o nome com lâmina. Três volumes, três anos, o mesmo corte.",
    "Ela fotografou a página. No corredor, os passos de Heitor pararam diante da porta.",
    "A pergunta agora tinha dono. Faltava descobrir há quanto tempo ele sabia.",
  ].join("\n\n"),
  "hoover-mcfadden": [
    "Eu conto os azulejos do corredor enquanto espero a campainha da madrugada. Doze até a porta. Eu sei porque contei todas as noites desta semana.",
    "O diário dela está na minha bolsa. Eu não devia ter pegado. Eu peguei mesmo assim, e a culpa tem o peso exato de um caderno de capa dura.",
    "Quando o monitor apita, meu corpo responde antes de mim. É o que sobrou do que eu fiz há dez anos: reflexo, vergonha, mãos firmes.",
  ].join("\n\n"),
  romantasy: [
    "A maré obedece ao meu traço, e cobra. Desenho a rota nova para o corsário e sinto o nome da minha mãe escorrer do mapa para a água.",
    "— Você esqueceu de novo — diz ele, sem triunfo, me devolvendo a luva que eu não lembrava de ter tirado.",
    "O custo está tabelado no meu próprio corpo. Cada rota, uma lembrança. Cada lembrança, um pedaço do que eu jurei não entregar a ele.",
  ].join("\n\n"),
};

function mockEscritor(): ProvedorMock {
  const p = new ProvedorMock();
  for (const s of SKILLS) {
    for (let i = 0; i < CENAS_LAB.length; i++) p.enfileirar("escritor", PROSA[s]);
  }
  return p;
}

describe("lab — cenas fixas compatíveis com os 3 contratos (guarda)", () => {
  it("fichas adaptadas validam contra os contratos reais", () => {
    for (const skillId of SKILLS) {
      const c = carregarContrato(skillId).contrato;
      for (const cena of CENAS_LAB) {
        const ficha = adaptarFichaParaSkill(cena, c);
        const r = validarSpec(ficha, c);
        expect(r.erros, `${skillId}/${cena.categoria}: ${r.erros.join(" | ")}`).toEqual([]);
      }
    }
  });
});

describe("lab — rodarLab", () => {
  it("produz skills×cenas amostras com sinais, gates e arquivos", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lab-"));
    const exec = await rodarLab({ skills: SKILLS, provedor: mockEscritor(), mapa, dirSaida: dir });
    expect(exec.amostras).toHaveLength(SKILLS.length * CENAS_LAB.length);
    expect(exec.skills.map((s) => s.id)).toEqual(SKILLS);
    for (const a of exec.amostras) {
      expect(a.sinais.length).toBeGreaterThan(5);
      expect(a.gates.length).toBeGreaterThan(0);
      expect(a.textoHash).toMatch(/^[0-9a-f]{16,}/);
    }
    await access(path.join(dir, exec.id, "dan-brown", "abertura.md"));
    const salvo = JSON.parse(await readFile(path.join(dir, exec.id, "execucao.json"), "utf8")) as ExecucaoLab;
    expect(salvo.id).toBe(exec.id);
  });

  it("gancho é adaptado ao vocabulário de cada contrato", () => {
    for (const skillId of SKILLS) {
      const c = carregarContrato(skillId).contrato;
      const ficha = adaptarFichaParaSkill(CENAS_LAB[0], c);
      expect(c.tipos_gancho).toContain(ficha.gancho.tipo);
    }
  });
});

describe("lab — avaliação cega e relatório", () => {
  const notas = {
    voz: 4.5,
    cadencia: 4.2,
    interioridade: 4.1,
    revelacao: 4.3,
    encerramento: 4,
    inteligencia_narrativa: 4.4,
  };

  function respostaCega(skill: string) {
    return JSON.stringify({
      skill_adivinhada: skill,
      aderencia: 4.4,
      notas,
      tracos_distintivos: ["cadência e foco narrativo identificáveis no texto"],
      justificativa: "A voz, a distância psíquica e o modo de revelar informação correspondem ao contrato.",
    });
  }

  async function execComMock(): Promise<{ exec: ExecucaoLab; dir: string }> {
    const dir = await mkdtemp(path.join(tmpdir(), "lab-"));
    const exec = await rodarLab({ skills: SKILLS, provedor: mockEscritor(), mapa, dirSaida: dir, categorias: ["abertura", "confronto"] });
    return { exec, dir };
  }

  it("distinguibilidade e matriz de confusão", async () => {
    const { exec, dir } = await execComMock();
    const revisor = new ProvedorMock();
    // Palpites: acerta sempre; ordem pseudorrandômica é reproduzível pelo seed da execução.
    const ordenadas = ordenarAmostrasCegas(exec).amostras;
    for (const a of ordenadas) {
      revisor.enfileirar("revisor_literario", respostaCega(a.skillId));
    }
    const av = await avaliarCego(exec, { provedor: revisor, mapa, persistencia: new DiscoPersistencia(dir) });
    expect(av.schema).toBe("blind-evaluation/v2");
    expect(av.distinguibilidade).toBe(1);
    expect(av.matrizConfusao["dan-brown"]["dan-brown"]).toBe(2);
    expect(av.porAmostra.every((p) => p.acertou)).toBe(true);
    expect(av.porAmostra.every((p) => p.saidaBruta && p.runId)).toBe(true);
    expect(falhasAvaliacaoCega(av)).toEqual([]);
    // O pacote técnico é neutro: não revela qual dos contratos participantes gerou a amostra.
    for (const chamada of revisor.chamadas) {
      expect(chamada.prompt).toContain("Skill: avaliacao-cega@2");
      expect(chamada.prompt).not.toMatch(/Skill: (dan-brown|hoover-mcfadden|romantasy)@/);
    }
  });

  it("publica amostras humanas com IDs anônimos únicos e sem origem", async () => {
    const { exec } = await execComMock();
    const publicas = amostrasCegasParaUi(exec);
    expect(new Set(publicas.map((a) => a.amostraId)).size).toBe(publicas.length);
    expect(publicas.every((a) => /^A-\d{2}-[0-9a-f]{12}$/.test(a.amostraId))).toBe(true);
    expect(JSON.stringify(publicas)).not.toContain("skillId");
    expect(publicas.map((a) => a.hash)).toEqual(ordenarAmostrasCegas(exec).amostras.map((a) => a.textoHash));
  });

  it("relatório: sem anterior + avaliado → aprovar; regressão de tique → rejeitar", async () => {
    const { exec } = await execComMock();
    const itens = exec.amostras.map((a, i) => ({
      amostraAnonima: `A-${i}`,
      amostraId: a.id,
      skillReal: a.skillId,
      skillAdivinhada: a.skillId,
      acertou: true,
      aderencia: 4.4,
      notas,
      tracosDistintivos: ["voz reconhecível"],
      parecerResumo: "aderente",
      runId: `run-${i}`,
      saidaBruta: respostaCega(a.skillId),
      saidaBrutaHash: `hash-${i}`,
    }));
    const avaliacao: AvaliacaoCega = {
      schema: "blind-evaluation/v2",
      execucaoId: "blind-1",
      labExecucaoId: exec.id,
      executadaEm: "2026-07-25T12:00:00.000Z",
      seedOrdem: "seed",
      modeloAvaliador: "sonnet",
      porAmostra: itens,
      distinguibilidade: 1,
      matrizConfusao: Object.fromEntries(SKILLS.map((s) => [s, { [s]: 2 }])),
      mediaNotas: notas,
    };
    const r1 = compararExecucoes(exec, avaliacao, null);
    expect(r1.vazamentos).toEqual([]);
    expect(r1.decisao).toBe("aprovar");
    expect(r1.metricas["gnomico"].porSkill["dan-brown"]).toBeDefined();

    // Regressão fabricada: execução "anterior" com gnomico médio ~0 vs atual >1.
    const anterior: ExecucaoLab = {
      ...exec,
      id: "anterior",
      amostras: exec.amostras.map((a) => ({
        ...a,
        sinais: a.sinais.map((s) => (s.sinal === "gnomico" ? { ...s, valor: 0 } : s)),
      })),
    };
    const atualPior: ExecucaoLab = {
      ...exec,
      amostras: exec.amostras.map((a) => ({
        ...a,
        sinais: a.sinais.map((s) => (s.sinal === "gnomico" ? { ...s, valor: 4 } : s)),
      })),
    };
    const r2 = compararExecucoes(atualPior, avaliacao, anterior);
    expect(r2.decisao).toBe("rejeitar");
    expect(r2.regressoes.join()).toContain("gnomico");
  });

  it("sem avaliação cega → pendente; vazamento de POV → rejeitar", async () => {
    const { exec } = await execComMock();
    expect(compararExecucoes(exec, null, null).decisao).toBe("pendente");
    const comVazamento: ExecucaoLab = {
      ...exec,
      amostras: exec.amostras.map((a, i) =>
        i === 0 ? { ...a, gates: [...a.gates.filter((g) => g.gate !== "pov_impossivel"), { gate: "pov_impossivel" as const, passou: false, evidencia: "1ª pessoa dominante" }] } : a
      ),
    };
    const r = compararExecucoes(comVazamento, null, null);
    expect(r.decisao).toBe("rejeitar");
    expect(r.vazamentos.length).toBe(1);
  });

  it("não aprova avaliação existente porém indistinguível", async () => {
    const { exec } = await execComMock();
    const itens = exec.amostras.map((a, i) => ({
      amostraAnonima: `A-${i}`,
      amostraId: a.id,
      skillReal: a.skillId,
      skillAdivinhada: "dan-brown",
      acertou: a.skillId === "dan-brown",
      aderencia: 3,
      notas: { ...notas, inteligencia_narrativa: 2.5 },
      tracosDistintivos: ["mesma inteligência narrativa"],
      parecerResumo: "vozes confundidas",
      runId: `run-${i}`,
      saidaBruta: "{}",
      saidaBrutaHash: `hash-${i}`,
    }));
    const av: AvaliacaoCega = {
      schema: "blind-evaluation/v2",
      execucaoId: "blind-ruim",
      labExecucaoId: exec.id,
      executadaEm: "2026-07-25T12:00:00.000Z",
      seedOrdem: "seed",
      modeloAvaliador: "sonnet",
      porAmostra: itens,
      distinguibilidade: itens.filter((x) => x.acertou).length / itens.length,
      matrizConfusao: {},
      mediaNotas: { ...notas, inteligencia_narrativa: 2.5 },
    };
    const rel = compararExecucoes(exec, av, null);
    expect(rel.decisao).toBe("rejeitar");
    expect(rel.falhasDistincao.join(" | ")).toMatch(/distinguibilidade|aderência|inteligencia_narrativa/);
  });
});
