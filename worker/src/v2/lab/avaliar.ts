// Engine V2 — avaliação CEGA do laboratório (F7): o avaliador não sabe qual
// skill produziu cada amostra; recebe só os resumos dos contratos participantes.

import { carregarContrato } from "../contrato.js";
import { compilarPacote } from "../compilador.js";
import { executarPapel } from "../papeis.js";
import { validarSaidaJson } from "../gates.js";
import { Gravador } from "../gravador.js";
import type { PersistenciaV2 } from "../persistencia.js";
import type { MapaModelos } from "../tipos.js";
import type { ProvedorModelo } from "../provedor.js";
import type { ExecucaoLab } from "./rodar.js";

export interface AvaliacaoCega {
  porAmostra: {
    amostraId: string;
    skillReal: string;
    skillAdivinhada: string;
    acertou: boolean;
    aderencia: number;
    parecerResumo: string;
  }[];
  distinguibilidade: number;
  matrizConfusao: Record<string, Record<string, number>>;
}

interface PalpiteCego {
  skill_adivinhada: string;
  aderencia: number;
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

export async function avaliarCego(
  exec: ExecucaoLab,
  opts: { provedor: ProvedorModelo; mapa: MapaModelos; persistencia: PersistenciaV2 }
): Promise<AvaliacaoCega> {
  const gravador = new Gravador({ persistencia: opts.persistencia, projectId: "lab" });
  const ids = exec.skills.map((s) => s.id);
  const resumos = ids.map(resumoContrato).join("\n\n");
  // Embaralhamento determinístico: ordena por hash do texto (não pela skill).
  const amostras = [...exec.amostras].sort((a, b) => a.textoHash.localeCompare(b.textoHash));

  const porAmostra: AvaliacaoCega["porAmostra"] = [];
  const matriz: Record<string, Record<string, number>> = {};
  for (const a of amostras) {
    // Pacote neutro: contrato da primeira skill só para satisfazer o compilador?
    // NÃO — avaliação cega não usa contrato de skill: monta prompt direto.
    const contrato = carregarContrato(a.skillId); // usado apenas p/ pacote técnico; instruções abaixo são cegas
    const pacote = compilarPacote({
      papel: "revisor_literario",
      alvo: `canario:${a.categoria}`,
      contrato,
      perfil: { texto: "Avaliação cega de laboratório. Ignore qualquer suposição sobre a origem do texto.", skillId: contrato.contrato.id, hash: "lab-cego", validado: true },
    });
    if (!pacote.ok) throw new Error(`avaliação cega: compilação bloqueada (${a.id})`);
    // Deliberado: o pacote NÃO inclui as instruções do contrato na tarefa cega — a tarefa
    // apresenta os resumos de TODOS os contratos sem revelar qual gerou o texto.
    const tarefa = [
      `Você recebe RESUMOS de ${ids.length} contratos de skill e UM texto de capítulo.`,
      `Não é dito qual skill gerou o texto. Adivinhe e avalie a aderência ao contrato adivinhado.`,
      `## CONTRATOS PARTICIPANTES`,
      resumos,
      `## TEXTO`,
      a.texto,
      `Responda APENAS JSON: { "skill_adivinhada": um de [${ids.map((i) => `"${i}"`).join(", ")}], "aderencia": 0-5, "justificativa": string (≤60 palavras) }.`,
    ].join("\n\n");
    const r = await executarPapel<PalpiteCego>({
      papel: "revisor_literario",
      alvo: `canario:${a.categoria}`,
      pacote: pacote.pacote!,
      tarefa,
      parse: (t) => {
        const v = validarSaidaJson<PalpiteCego>(t, (o) => {
          const p = o as PalpiteCego;
          if (!ids.includes(p?.skill_adivinhada)) throw new Error(`skill_adivinhada inválida: ${String(p?.skill_adivinhada)}`);
          if (typeof p.aderencia !== "number" || p.aderencia < 0 || p.aderencia > 5) throw new Error("aderencia fora de 0-5");
          if (typeof p.justificativa !== "string") throw new Error("justificativa ausente");
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
      amostraId: a.id,
      skillReal: a.skillId,
      skillAdivinhada: g.skill_adivinhada,
      acertou: g.skill_adivinhada === a.skillId,
      aderencia: g.aderencia,
      parecerResumo: g.justificativa,
    });
    matriz[a.skillId] = matriz[a.skillId] ?? {};
    matriz[a.skillId][g.skill_adivinhada] = (matriz[a.skillId][g.skill_adivinhada] ?? 0) + 1;
  }

  const distinguibilidade = porAmostra.length ? porAmostra.filter((p) => p.acertou).length / porAmostra.length : 0;
  return { porAmostra, distinguibilidade, matrizConfusao: matriz };
}
