// Importação mecânica, executada uma única vez, do manifesto legado com caminhos
// absolutos para um corpus autocontido/versionável. Gera pré-rótulos explícitos
// como PENDENTES; nenhum deles entra no cálculo antes de validação humana.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEMA_CORPUS_CALIBRACAO,
  SCHEMA_ROTULOS_CALIBRACAO,
  type AmostraCalibracao,
  type CorpusCalibracao,
  type RotulosAmostra,
} from "../src/v2/calibracao.js";
import { carregarContrato } from "../src/v2/contrato.js";
import { ehSinalEscalar } from "../src/v2/revisor.js";
import { medirSinais } from "../src/v2/sinais.js";

interface Legada {
  skill: string;
  grupo: "aprovado" | "contraste";
  caminho: string;
  origem: string;
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(aqui, "..");
const origemPath = path.join(aqui, "v2-calibracao-corpus.json");
const destino = path.join(workerDir, "calibration", "v1");

function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function main(): void {
  if (existsSync(path.join(destino, "corpus.json"))) {
    throw new Error(`corpus já existe em ${destino}; remova-o conscientemente antes de reimportar`);
  }
  const legado = JSON.parse(readFileSync(origemPath, "utf8")) as { amostras: Legada[] };
  const porGrupo = new Map<string, Legada[]>();
  for (const a of legado.amostras) {
    const chave = `${a.skill}:${a.grupo}`;
    porGrupo.set(chave, [...(porGrupo.get(chave) ?? []), a]);
  }

  mkdirSync(path.join(destino, "samples"), { recursive: true });
  mkdirSync(path.join(destino, "labels"), { recursive: true });
  const contadores = new Map<string, number>();
  const amostras: AmostraCalibracao[] = [];

  for (const a of legado.amostras) {
    if (!existsSync(a.caminho)) throw new Error(`amostra ausente: ${a.caminho}`);
    const chave = `${a.skill}:${a.grupo}`;
    const indice = (contadores.get(chave) ?? 0) + 1;
    contadores.set(chave, indice);
    const todas = porGrupo.get(chave)!;
    const split = indice === todas.length ? "holdout" : "calibracao";
    const id = `${slug(a.skill)}-${a.grupo}-${String(indice).padStart(2, "0")}`;
    const relTexto = `samples/${slug(a.skill)}/${a.grupo}-${String(indice).padStart(2, "0")}.md`;
    const relRotulos = `labels/${slug(a.skill)}/${a.grupo}-${String(indice).padStart(2, "0")}.json`;
    const absTexto = path.join(destino, relTexto);
    const absRotulos = path.join(destino, relRotulos);
    mkdirSync(path.dirname(absTexto), { recursive: true });
    mkdirSync(path.dirname(absRotulos), { recursive: true });
    copyFileSync(a.caminho, absTexto);

    const texto = readFileSync(absTexto, "utf8");
    const hash = sha256(texto);
    const contrato = carregarContrato(a.skill).contrato;
    const sinais = medirSinais(texto, contrato).filter(
      (s) => typeof s.valor === "number" && s.sinal !== "gancho_final" && !ehSinalEscalar(s.sinal)
    );
    const rotulos: RotulosAmostra = {
      schema: SCHEMA_ROTULOS_CALIBRACAO,
      amostra_id: id,
      texto_sha256: hash,
      sinais: sinais.map((s) => ({
        sinal: s.sinal,
        ocorrencias: s.exemplos.map((trecho, i) => ({
          indice_detector: i + 1,
          trecho,
          rotulo: "legitima",
          justificativa: "PRÉ-RÓTULO AUTOMÁTICO: substituir por julgamento humano específico antes de validar",
        })),
        nao_detectadas: [],
      })),
    };
    writeFileSync(absRotulos, JSON.stringify(rotulos, null, 2) + "\n", "utf8");
    amostras.push({
      id,
      skill: a.skill,
      split,
      classe: a.grupo === "aprovado" ? "aprovada" : "contraste",
      arquivo: relTexto.replaceAll("\\", "/"),
      sha256: hash,
      origem: a.origem,
      rotulos: {
        arquivo: relRotulos.replaceAll("\\", "/"),
        status: "pendente_humano",
      },
    });
  }

  const corpus: CorpusCalibracao = {
    schema: SCHEMA_CORPUS_CALIBRACAO,
    versao: "1.0.0",
    descricao: "Corpus inicial autocontido da calibração Engine V2; splits congelados antes da rotulagem humana.",
    amostras,
  };
  writeFileSync(path.join(destino, "corpus.json"), JSON.stringify(corpus, null, 2) + "\n", "utf8");
  console.log(`corpus importado: ${amostras.length} amostras em ${destino}`);
  console.log("todos os rótulos permanecem pendente_humano; nenhuma cota pode ser promovida ainda");
}

main();
