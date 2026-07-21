// Engine V2 — fundação (arquiteto_enredo) como caminho ÚNICO.
// Usada por criar_fundacao (integracao, roteado por engine_mode) e pelo canário —
// nenhum script reimplementa geração/materialização de fundação.
// O modelo PROPÕE (JSON validado); quem grava disco e estado é ESTE módulo.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { compilarPacote } from "./compilador.js";
import { validarSaidaJson } from "./gates.js";
import type { Gravador } from "./gravador.js";
import { hashJsonCanonico } from "./hash.js";
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { tarefaArquitetoEnredo } from "./tarefas.js";
import { ErroEngine, type ContratoCompilado, type MapaModelos } from "./tipos.js";

export interface FundacaoV2 {
  perfil_voz: string;
  estrutura: { capitulo: number; fio: string; resumo_estrutural: string }[];
  fios: string[];
  promessa_editorial: string;
}

export function parseFundacao(texto: string): FundacaoV2 {
  const r = validarSaidaJson<FundacaoV2>(texto, (o) => {
    const f = o as FundacaoV2;
    if (typeof f?.perfil_voz !== "string" || f.perfil_voz.trim().length < 80) throw new Error("perfil_voz ausente/curto");
    if (!Array.isArray(f.estrutura) || f.estrutura.length < 1) throw new Error("estrutura vazia");
    for (const e of f.estrutura) {
      if (!Number.isInteger(e.capitulo) || typeof e.fio !== "string" || typeof e.resumo_estrutural !== "string") {
        throw new Error("item de estrutura inválido");
      }
    }
    if (!Array.isArray(f.fios) || f.fios.length < 1) throw new Error("fios vazios");
    return f;
  });
  if (!r.ok) throw new Error(`fundação fora do schema: ${r.gate.evidencia}`);
  return r.valor;
}

export interface DepsFundacao {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  dirProjeto: string;
  jobId?: string | null;
}

/** Gera a fundação pelo papel arquiteto_enredo (pacote compilado; run no ledger). */
export async function gerarFundacaoV2(
  deps: DepsFundacao,
  briefing: { titulo: string; premissa: string; totalCapitulos: number }
): Promise<{ fundacao: FundacaoV2; runId: string }> {
  const comp = compilarPacote({
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    contrato: deps.contrato,
    perfil: {
      texto: `Briefing do autor: ${briefing.premissa}`,
      skillId: deps.contrato.contrato.id,
      hash: hashJsonCanonico(briefing.premissa),
      validado: true,
    },
  });
  if (!comp.ok) {
    throw new ErroEngine({
      codigo: "FUNDACAO_BLOQUEADA",
      classe: "configuracao",
      mensagem: `compilação da fundação bloqueada: ${comp.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  const r = await executarPapel<FundacaoV2>({
    gravador: deps.gravador,
    provedor: deps.provedor,
    mapa: deps.mapa,
    jobId: deps.jobId ?? null,
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    pacote: comp.pacote!,
    tarefa: tarefaArquitetoEnredo(briefing, deps.contrato.contrato),
    parse: parseFundacao,
    timeoutMs: 300000,
  });
  return { fundacao: r.valor, runId: r.runId };
}

/** Materializa a fundação: disco (perfil/estrutura) + estado canônico + fases. */
export async function materializarFundacao(
  deps: DepsFundacao,
  fundacao: FundacaoV2,
  totalCaps: number
): Promise<void> {
  await fs.mkdir(deps.dirProjeto, { recursive: true });
  await fs.writeFile(path.join(deps.dirProjeto, "perfil-de-voz.md"), fundacao.perfil_voz, "utf8");
  await fs.writeFile(
    path.join(deps.dirProjeto, "estrutura.json"),
    JSON.stringify({ estrutura: fundacao.estrutura, fios: fundacao.fios, promessa: fundacao.promessa_editorial }, null, 2),
    "utf8"
  );
  const estado = await deps.gravador.carregarEstado();
  estado.doc.skill = { id: deps.contrato.contrato.id, versao: deps.contrato.contrato.versao, hash: deps.contrato.hash };
  estado.doc.fundacao = {
    versao: "1",
    hash: hashJsonCanonico(fundacao),
    docs: {
      "perfil-de-voz.md": createHash("sha256").update(fundacao.perfil_voz, "utf8").digest("hex"),
      "estrutura.json": hashJsonCanonico(fundacao.estrutura),
    },
  };
  estado.doc.total_capitulos = totalCaps;
  await deps.persistencia.gravarEstado(estado);
  if ((await deps.gravador.carregarEstado()).doc.fase === "fundacao") {
    await deps.gravador.mudarFase("estrutura");
    await deps.gravador.mudarFase("escrita");
  }
}
