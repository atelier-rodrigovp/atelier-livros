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
import { avaliarCego } from "./avaliar.js";
import { compararExecucoes } from "./relatorio.js";

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
  async function execComMock(): Promise<{ exec: ExecucaoLab; dir: string }> {
    const dir = await mkdtemp(path.join(tmpdir(), "lab-"));
    const exec = await rodarLab({ skills: SKILLS, provedor: mockEscritor(), mapa, dirSaida: dir, categorias: ["abertura", "confronto"] });
    return { exec, dir };
  }

  it("distinguibilidade e matriz de confusão", async () => {
    const { exec, dir } = await execComMock();
    const revisor = new ProvedorMock();
    // Palpites: acerta sempre que o texto contém marca da skill (determinístico via ordem por hash).
    const ordenadas = [...exec.amostras].sort((a, b) => a.textoHash.localeCompare(b.textoHash));
    for (const a of ordenadas) {
      revisor.enfileirar("revisor_literario", JSON.stringify({ skill_adivinhada: a.skillId, aderencia: 4, justificativa: "voz casa com o contrato" }));
    }
    const av = await avaliarCego(exec, { provedor: revisor, mapa, persistencia: new DiscoPersistencia(dir) });
    expect(av.distinguibilidade).toBe(1);
    expect(av.matrizConfusao["dan-brown"]["dan-brown"]).toBe(2);
    expect(av.porAmostra.every((p) => p.acertou)).toBe(true);
  });

  it("relatório: sem anterior + avaliado → aprovar; regressão de tique → rejeitar", async () => {
    const { exec } = await execComMock();
    const avaliacao = { porAmostra: [], distinguibilidade: 1, matrizConfusao: {} };
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
});
