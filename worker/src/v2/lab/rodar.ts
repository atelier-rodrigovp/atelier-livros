// Engine V2 — laboratório de regressão literária (F7): execução das amostras.
// Roda as cenas fixas (cenas.ts) contra cada skill com o pipeline mínimo
// (contrato → ficha adaptada → escritor → sinais + gates) e grava tudo em disco.
// Determinístico onde importa: o id da execução é hash do conteúdo, nunca Date.now.

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../../quality-state.js";
import { compilarPacote } from "../compilador.js";
import { carregarContrato } from "../contrato.js";
import { rodarGatesCapitulo } from "../gates.js";
import { Gravador } from "../gravador.js";
import { hashJsonCanonico } from "../hash.js";
import { executarPapel } from "../papeis.js";
import { DiscoPersistencia, type PersistenciaV2 } from "../persistencia.js";
import type { ProvedorModelo } from "../provedor.js";
import { medirSinais, type SinalMedido } from "../sinais.js";
import { tarefaEscritor } from "../tarefas.js";
import { ENGINE_V2_VERSION, ErroEngine, type MapaModelos, type ResultadoGate } from "../tipos.js";
import { CENAS_LAB, adaptarFichaParaSkill, type CategoriaCena } from "./cenas.js";

export interface AmostraLab {
  id: string;
  skillId: string;
  skillVersao: string;
  contratoHash: string;
  categoria: CategoriaCena;
  capitulo: number;
  texto: string;
  textoHash: string;
  sinais: SinalMedido[];
  gates: ResultadoGate[];
  palavras: number;
  runId: string;
}

export interface ExecucaoLab {
  id: string;
  executadaEm: string;
  engineVersion: string;
  skills: { id: string; versao: string; hash: string }[];
  amostras: AmostraLab[];
}

/** Perfil sintético do laboratório: sem perfil de projeto, só o contrato manda. */
function perfilLab(skillId: string): { texto: string; skillId: string; hash: string; validado: boolean } {
  return { texto: "Laboratório: siga exclusivamente o contrato da skill.", skillId, hash: "lab", validado: true };
}

function contarPalavras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

/** Prosa do escritor: só valida presença — o conteúdo é medido por sinais/gates. */
function parseProsa(t: string): string {
  const limpo = t.trim();
  if (!limpo) throw new Error("prosa vazia");
  return limpo;
}

/** Gravação atômica (tmp + rename), criando o diretório se preciso. */
function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, conteudo, "utf8");
  renameSync(tmp, caminho);
}

export async function rodarLab(opts: {
  skills: string[];
  categorias?: CategoriaCena[];
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  dirSaida: string;
  persistencia?: PersistenciaV2;
}): Promise<ExecucaoLab> {
  if (opts.skills.length === 0) {
    throw new ErroEngine({ codigo: "LAB_SEM_SKILLS", classe: "configuracao", mensagem: "rodarLab exige ao menos 1 skill" });
  }
  const cenas = opts.categorias ? CENAS_LAB.filter((c) => opts.categorias!.includes(c.categoria)) : CENAS_LAB;
  if (cenas.length === 0) {
    throw new ErroEngine({ codigo: "LAB_SEM_CENAS", classe: "configuracao", mensagem: `nenhuma cena do laboratório casa com as categorias pedidas (${(opts.categorias ?? []).join(", ")})` });
  }

  const persistencia = opts.persistencia ?? new DiscoPersistencia(opts.dirSaida);
  const gravador = new Gravador({ persistencia, projectId: "lab" });

  const skills: ExecucaoLab["skills"] = [];
  const amostras: AmostraLab[] = [];

  for (const skillId of opts.skills) {
    const contrato = carregarContrato(skillId);
    skills.push({ id: contrato.contrato.id, versao: contrato.contrato.versao, hash: contrato.hash });

    for (const cena of cenas) {
      const ficha = adaptarFichaParaSkill(cena, contrato.contrato);
      const alvo = `lab:${skillId}:${cena.categoria}`;
      const comp = compilarPacote({
        papel: "escritor",
        alvo,
        contrato,
        perfil: perfilLab(contrato.contrato.id),
        ficha,
      });
      if (!comp.ok) {
        throw new ErroEngine({
          codigo: "LAB_COMPILACAO_BLOQUEADA",
          classe: "configuracao",
          mensagem: `compilação bloqueada em ${alvo}: ${comp.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
        });
      }

      const r = await executarPapel<string>({
        papel: "escritor",
        alvo,
        pacote: comp.pacote!,
        tarefa: tarefaEscritor(ficha, contrato.contrato),
        parse: parseProsa,
        gravador,
        provedor: opts.provedor,
        mapa: opts.mapa,
      });

      const texto = r.valor;
      amostras.push({
        id: `${skillId}:${cena.categoria}`,
        skillId: contrato.contrato.id,
        skillVersao: contrato.contrato.versao,
        contratoHash: contrato.hash,
        categoria: cena.categoria,
        capitulo: cena.base.capitulo,
        texto,
        textoHash: hashText(texto),
        sinais: medirSinais(texto, contrato.contrato),
        gates: rodarGatesCapitulo({ texto, contrato: contrato.contrato, ficha }),
        palavras: contarPalavras(texto),
        runId: r.runId,
      });
    }
  }

  // Id determinístico: hash curto do conteúdo (skill + categoria + hash do texto).
  const id = hashJsonCanonico(amostras.map((a) => ({ skill: a.skillId, categoria: a.categoria, texto: a.textoHash }))).slice(0, 12);
  const exec: ExecucaoLab = {
    id,
    executadaEm: new Date().toISOString(),
    engineVersion: ENGINE_V2_VERSION,
    skills,
    amostras,
  };

  for (const a of exec.amostras) {
    gravarAtomico(path.join(opts.dirSaida, exec.id, a.skillId, `${a.categoria}.md`), a.texto);
  }
  gravarAtomico(path.join(opts.dirSaida, exec.id, "execucao.json"), JSON.stringify(exec, null, 2));

  return exec;
}
