// Engine V2 — avaliação CEGA do laboratório (F7): o avaliador não sabe qual
// skill produziu cada amostra; recebe só os resumos dos contratos participantes.

import path from "node:path";
import { promises as fs } from "node:fs";
import { carregarContrato } from "../contrato.js";
import type { PacoteCompilado } from "../compilador.js";
import { executarPapel } from "../papeis.js";
import { validarSaidaJson } from "../gates.js";
import { Gravador } from "../gravador.js";
import { hashJsonCanonico } from "../hash.js";
import type { PersistenciaV2 } from "../persistencia.js";
import type { MapaModelos } from "../tipos.js";
import type { ProvedorModelo } from "../provedor.js";
import type { ExecucaoLab } from "./rodar.js";

export interface NotasCegas {
  voz: number;
  cadencia: number;
  interioridade: number;
  revelacao: number;
  encerramento: number;
  inteligencia_narrativa: number;
}

export interface AvaliacaoCega {
  schema: "blind-evaluation/v2";
  execucaoId: string;
  labExecucaoId: string;
  executadaEm: string;
  seedOrdem: string;
  modeloAvaliador: string;
  porAmostra: {
    amostraAnonima: string;
    amostraId: string;
    skillReal: string;
    skillAdivinhada: string;
    acertou: boolean;
    aderencia: number;
    notas: NotasCegas;
    tracosDistintivos: string[];
    parecerResumo: string;
    runId: string;
    modeloExecutado: string;
    saidaBruta: string;
    saidaBrutaHash: string;
  }[];
  distinguibilidade: number;
  matrizConfusao: Record<string, Record<string, number>>;
  mediaNotas: NotasCegas;
}

interface PalpiteCego {
  skill_adivinhada: string;
  aderencia: number;
  notas: NotasCegas;
  tracos_distintivos: string[];
  justificativa: string;
}

function resumoContrato(id: string): string {
  const c = carregarContrato(id).contrato;
  return [
    `### ${c.id}`,
    `- motor: ${c.motor_narrativo}`,
    `- ação/interioridade: ${c.acao_interioridade.relacao} — ${c.acao_interioridade.descricao.slice(0, 140)}`,
    `- POV: ${c.pov.pessoa}`,
    `- metáfora: ${c.politica_metafora.descricao.slice(0, 100)}`,
    `- identidade: ${c.testes_positivos.slice(0, 3).join("; ")}`,
  ].join("\n");
}

function pacoteCego(ids: string[]): PacoteCompilado {
  const base: Omit<PacoteCompilado, "hash"> = {
    schema: "context-bundle/v1",
    papel: "revisor_literario",
    alvo: "avaliacao-cega",
    skill: {
      id: "avaliacao-cega",
      versao: "2",
      hash: hashJsonCanonico(ids.slice().sort()),
    },
    instrucoes: [],
    secoes: [{
      titulo: "PROTOCOLO CEGO",
      texto: "A origem da amostra não é fornecida. Não use ferramentas, arquivos, metadados externos ou conhecimento sobre execuções anteriores.",
      fonte: "blind-evaluation/v2",
    }],
    repeticoesRecentes: [],
    contradicoes: [],
  };
  return { ...base, hash: hashJsonCanonico(base) };
}

export function ordenarAmostrasCegas(exec: ExecucaoLab): {
  seed: string;
  amostras: ExecucaoLab["amostras"];
} {
  const seed = hashJsonCanonico({ finalidade: "blind-evaluation/v2", labExecucaoId: exec.id });
  const amostras = [...exec.amostras].sort((a, b) =>
    hashJsonCanonico({ seed, textoHash: a.textoHash }).localeCompare(
      hashJsonCanonico({ seed, textoHash: b.textoHash })
    )
  );
  return { seed, amostras };
}

export function amostrasCegasParaUi(exec: ExecucaoLab): {
  amostraId: string;
  hash: string;
  categoria: string;
  texto: string;
}[] {
  return ordenarAmostrasCegas(exec).amostras.map((amostra, indice) => ({
    amostraId: `A-${String(indice + 1).padStart(2, "0")}-${amostra.textoHash.slice(0, 12)}`,
    hash: amostra.textoHash,
    categoria: amostra.categoria,
    texto: amostra.texto,
  }));
}

function validarNotas(notas: NotasCegas): NotasCegas {
  const nomes: (keyof NotasCegas)[] = [
    "voz",
    "cadencia",
    "interioridade",
    "revelacao",
    "encerramento",
    "inteligencia_narrativa",
  ];
  for (const nome of nomes) {
    const valor = notas?.[nome];
    if (typeof valor !== "number" || valor < 0 || valor > 5) {
      throw new Error(`nota ${nome} fora de 0-5`);
    }
  }
  return notas;
}

function medias(itens: AvaliacaoCega["porAmostra"]): NotasCegas {
  const nomes = [
    "voz",
    "cadencia",
    "interioridade",
    "revelacao",
    "encerramento",
    "inteligencia_narrativa",
  ] as const;
  return Object.fromEntries(
    nomes.map((nome) => [
      nome,
      itens.length ? itens.reduce((soma, item) => soma + item.notas[nome], 0) / itens.length : 0,
    ])
  ) as unknown as NotasCegas;
}

export async function avaliarCego(
  exec: ExecucaoLab,
  opts: { provedor: ProvedorModelo; mapa: MapaModelos; persistencia: PersistenciaV2 }
): Promise<AvaliacaoCega> {
  const gravador = new Gravador({ persistencia: opts.persistencia, projectId: "lab" });
  const ids = exec.skills.map((s) => s.id);
  const resumos = ids.map(resumoContrato).join("\n\n");
  const { seed, amostras } = ordenarAmostrasCegas(exec);
  const pacote = pacoteCego(ids);
  const execucaoId = hashJsonCanonico({
    schema: "blind-evaluation/v2",
    labExecucaoId: exec.id,
    seed,
    modelo: opts.mapa.julgamento,
    contratos: exec.skills,
  }).slice(0, 16);

  const porAmostra: AvaliacaoCega["porAmostra"] = [];
  const matriz: Record<string, Record<string, number>> = {};
  for (const [indice, a] of amostras.entries()) {
    const amostraAnonima = `A-${String(indice + 1).padStart(2, "0")}`;
    const tarefa = [
      `Você recebe RESUMOS de ${ids.length} contratos de skill e UMA amostra anônima.`,
      `A origem não é fornecida. Adivinhe a skill e avalie a diferenciação estrutural da voz — não apenas ausência de tiques.`,
      `## CONTRATOS PARTICIPANTES`,
      resumos,
      `## AMOSTRA ${amostraAnonima} — categoria ${a.categoria}`,
      a.texto,
      `Responda APENAS JSON: {`,
      `  "skill_adivinhada": um de [${ids.map((i) => `"${i}"`).join(", ")}],`,
      `  "aderencia": 0-5,`,
      `  "notas": { "voz": 0-5, "cadencia": 0-5, "interioridade": 0-5, "revelacao": 0-5, "encerramento": 0-5, "inteligencia_narrativa": 0-5 },`,
      `  "tracos_distintivos": [1 a 5 observações concretas encontradas no texto],`,
      `  "justificativa": string (≤120 palavras)`,
      `}.`,
    ].join("\n\n");
    const r = await executarPapel<PalpiteCego>({
      papel: "revisor_literario",
      alvo: `avaliacao-cega:${amostraAnonima}:${a.categoria}`,
      pacote,
      tarefa,
      parse: (t) => {
        const v = validarSaidaJson<PalpiteCego>(t, (o) => {
          const p = o as PalpiteCego;
          if (!ids.includes(p?.skill_adivinhada)) throw new Error(`skill_adivinhada inválida: ${String(p?.skill_adivinhada)}`);
          if (typeof p.aderencia !== "number" || p.aderencia < 0 || p.aderencia > 5) throw new Error("aderencia fora de 0-5");
          validarNotas(p.notas);
          if (!Array.isArray(p.tracos_distintivos) || p.tracos_distintivos.length < 1 || p.tracos_distintivos.length > 5) {
            throw new Error("tracos_distintivos exige 1-5 itens");
          }
          if (p.tracos_distintivos.some((x) => typeof x !== "string" || !x.trim())) {
            throw new Error("traco distintivo vazio/inválido");
          }
          if (typeof p.justificativa !== "string") throw new Error("justificativa ausente");
          if (p.justificativa.trim().split(/\s+/).length > 120) throw new Error("justificativa excede 120 palavras");
          return p;
        });
        if (!v.ok) throw new Error(v.gate.evidencia ?? "JSON inválido");
        return v.valor;
      },
      gravador,
      provedor: opts.provedor,
      mapa: opts.mapa,
      timeoutMs: 300000,
    });
    const g = r.valor;
    porAmostra.push({
      amostraAnonima,
      amostraId: a.id,
      skillReal: a.skillId,
      skillAdivinhada: g.skill_adivinhada,
      acertou: g.skill_adivinhada === a.skillId,
      aderencia: g.aderencia,
      notas: g.notas,
      tracosDistintivos: g.tracos_distintivos,
      parecerResumo: g.justificativa,
      runId: r.runId,
      modeloExecutado: r.resposta.modeloExecutado!,
      saidaBruta: r.resposta.texto,
      saidaBrutaHash: hashJsonCanonico(r.resposta.texto),
    });
    matriz[a.skillId] = matriz[a.skillId] ?? {};
    matriz[a.skillId][g.skill_adivinhada] = (matriz[a.skillId][g.skill_adivinhada] ?? 0) + 1;
  }

  const distinguibilidade = porAmostra.length ? porAmostra.filter((p) => p.acertou).length / porAmostra.length : 0;
  return {
    schema: "blind-evaluation/v2",
    execucaoId,
    labExecucaoId: exec.id,
    executadaEm: new Date().toISOString(),
    seedOrdem: seed,
    modeloAvaliador: opts.mapa.julgamento,
    porAmostra,
    distinguibilidade,
    matrizConfusao: matriz,
    mediaNotas: medias(porAmostra),
  };
}

export async function gravarAvaliacaoCega(dirSaida: string, avaliacao: AvaliacaoCega): Promise<string> {
  const caminho = path.join(dirSaida, avaliacao.labExecucaoId, "avaliacao-cega.json");
  await fs.mkdir(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(avaliacao, null, 2), "utf8");
  await fs.rename(tmp, caminho);
  return caminho;
}

export async function lerAvaliacaoCega(dirSaida: string, labExecucaoId: string): Promise<AvaliacaoCega | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(dirSaida, labExecucaoId, "avaliacao-cega.json"), "utf8")
    ) as AvaliacaoCega;
  } catch {
    return null;
  }
}
