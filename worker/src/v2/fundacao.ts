// Engine V2 — fundação (arquiteto_enredo) como caminho ÚNICO.
// Usada por criar_fundacao (integracao, roteado por engine_mode) e pelo canário —
// nenhum script reimplementa geração/materialização de fundação.
// O modelo PROPÕE (JSON validado); quem grava disco e estado é ESTE módulo.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BriefingFundacao } from "./briefing.js";
import { compilarPacote } from "./compilador.js";
import { validarSaidaJson } from "./gates.js";
import type { Gravador } from "./gravador.js";
import { hashJsonCanonico } from "./hash.js";
import { executarPapel } from "./papeis.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { tarefaArquitetoEnredo } from "./tarefas.js";
import { ErroEngine, type ContratoCompilado, type MapaModelos } from "./tipos.js";

export interface PersonagemMapa {
  nome: string;
  papel: string;
  ferida: string;
  segredo: string;
  desejo: string;
  voz: string;
  arco: string;
}

export interface FundacaoV2 {
  perfil_voz: string;
  biblia: string;
  mapa_personagens: PersonagemMapa[];
  estrutura: { capitulo: number; fio: string; resumo_estrutural: string }[];
  fios: string[];
  promessa_editorial: string;
}

const CAMPOS_PERSONAGEM: (keyof PersonagemMapa)[] = ["nome", "papel", "ferida", "segredo", "desejo", "voz", "arco"];

export function parseFundacao(texto: string): FundacaoV2 {
  const r = validarSaidaJson<FundacaoV2>(texto, (o) => {
    const f = o as FundacaoV2;
    if (typeof f?.perfil_voz !== "string" || f.perfil_voz.trim().length < 80) throw new Error("perfil_voz ausente/curto");
    if (typeof f?.biblia !== "string" || f.biblia.trim().length < 200) throw new Error("biblia ausente/curta");
    if (!Array.isArray(f.mapa_personagens) || f.mapa_personagens.length < 1) throw new Error("mapa_personagens vazio");
    for (const p of f.mapa_personagens) {
      for (const campo of CAMPOS_PERSONAGEM) {
        if (typeof p?.[campo] !== "string") throw new Error(`personagem inválido (campo ${campo})`);
      }
      if (!p.nome.trim()) throw new Error("personagem sem nome");
    }
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
  briefing: BriefingFundacao
): Promise<{ fundacao: FundacaoV2; runId: string }> {
  const perfilTexto = [
    `Briefing do autor: ${briefing.premissa}`,
    briefing.detalhes ? `Decisões do autor na entrevista:\n${briefing.detalhes}` : "",
    `Idioma da obra: ${briefing.idioma}`,
  ].filter(Boolean).join("\n\n");
  const comp = compilarPacote({
    papel: "arquiteto_enredo",
    alvo: "fundacao",
    contrato: deps.contrato,
    perfil: {
      texto: perfilTexto,
      skillId: deps.contrato.contrato.id,
      hash: hashJsonCanonico(perfilTexto),
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
    // Fundação completa (perfil + bíblia + mapa + estrutura por capítulo) é a
    // maior geração única da engine: 5 min estourava com briefing rico.
    timeoutMs: 900000,
  });
  return { fundacao: r.valor, runId: r.runId };
}

/** Materializa a fundação: disco (perfil/bíblia/mapa/estrutura) + estado canônico + fases. */
export async function materializarFundacao(
  deps: DepsFundacao,
  fundacao: FundacaoV2,
  totalCaps: number
): Promise<void> {
  await fs.mkdir(path.join(deps.dirProjeto, "fundacao"), { recursive: true });
  await fs.writeFile(path.join(deps.dirProjeto, "perfil-de-voz.md"), fundacao.perfil_voz, "utf8");
  await fs.writeFile(path.join(deps.dirProjeto, "fundacao", "biblia-da-obra.md"), fundacao.biblia, "utf8");
  const mapaJson = JSON.stringify({ personagens: fundacao.mapa_personagens }, null, 2);
  await fs.writeFile(path.join(deps.dirProjeto, "fundacao", "mapa-personagens.json"), mapaJson, "utf8");
  await fs.writeFile(
    path.join(deps.dirProjeto, "estrutura.json"),
    JSON.stringify({ estrutura: fundacao.estrutura, fios: fundacao.fios, promessa: fundacao.promessa_editorial }, null, 2),
    "utf8"
  );
  const estado = await deps.gravador.carregarEstado();
  estado.doc.skill = { id: deps.contrato.contrato.id, versao: deps.contrato.contrato.versao, hash: deps.contrato.hash };
  estado.doc.fundacao = {
    versao: "2",
    hash: hashJsonCanonico(fundacao),
    docs: {
      "perfil-de-voz.md": createHash("sha256").update(fundacao.perfil_voz, "utf8").digest("hex"),
      "fundacao/biblia-da-obra.md": createHash("sha256").update(fundacao.biblia, "utf8").digest("hex"),
      "fundacao/mapa-personagens.json": hashJsonCanonico(fundacao.mapa_personagens),
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
