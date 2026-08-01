// Prova externa dos 11 papéis e da cascata real da Engine V2.
//
// Este runner NÃO escreve prosa, capítulo, review, spec, memória nem estado.
// Ele usa um capítulo já existente como amostra somente leitura e permite ao
// executor normal de papéis gravar apenas o ledger `engine_runs` no projeto
// exclusivo de prova. A saída é uma entrada factual para gerar-evidencia.ts.
//
// Uso (em worker/):
//   npx tsx scripts/v2-provar-papeis-reais.ts --confirmar

// O --confirmar não autoriza canário: confirma somente as cinco chamadas de
// julgamento/extração abaixo, todas incapazes de produzir ou persistir prosa.

import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aplicarDelta, precisaEscalar, validarDelta } from "../src/v2/cascata.js";
import { compilarPacote, type PacoteCompilado, type SecaoContexto } from "../src/v2/compilador.js";
import { conferirConformidade, medirConformidade, resumoConformidade, validarParecerConformidade } from "../src/v2/conformidade.js";
import { carregarContrato, MAPA_SKILL_V1_V2 } from "../src/v2/contrato.js";
import type { ExecucoesReaisEvidencia, RunRealEvidencia } from "../src/v2/evidencia-externa.js";
import { capturarHead } from "../src/v2/execucao.js";
import { Gravador } from "../src/v2/gravador.js";
import { decidirIdioma, medirIdioma, resumoIdioma, validarParecerIdioma } from "../src/v2/idioma.js";
import { derivarMemoriaDaProsa, validarExtracaoProsa } from "../src/v2/memoria-prosa.js";
import { executarPapel } from "../src/v2/papeis.js";
import { SupabasePersistencia } from "../src/v2/persistencia.js";
import { ProvedorClaudeCli } from "../src/v2/provedor.js";
import {
  conferirParecer,
  exigirDisposicaoCompleta,
  hidratarOcorrenciasCitadas,
  normalizarParecerBruto,
  validarParecer,
} from "../src/v2/revisor.js";
import { medirSinais, resumoSinais } from "../src/v2/sinais.js";
import {
  tarefaConformidade,
  tarefaDecisaoCascata,
  tarefaExtratorMemoria,
  tarefaIdioma,
  tarefaRevisor,
} from "../src/v2/tarefas.js";
import { PAPEIS_ENGINE_V2, type Papel, type Parecer, type SceneSpec } from "../src/v2/tipos.js";
import { mapaModelosDoAmbiente } from "../src/v2/config.js";
import { OWNER, sb } from "../src/supabase.js";

const PROJETO_PROVA = "8ba4cd11-7514-4f42-aeb1-c6f8544483a5";
const PROJETO_FONTE = "5ac9d614-1d1c-4fbd-8376-a731d1945ac6";
const CAPITULO_FONTE = 3;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR_WORKER = path.resolve(AQUI, "..");
const RAIZ = path.resolve(DIR_WORKER, "..");

interface ProjetoFonte {
  id: string;
  skill_escrita: string | null;
  idioma_origem: string | null;
}

interface RunBanco {
  id: string;
  project_id: string;
  papel: Papel;
  alvo: string;
  status: "ok";
  model_provider: string;
  model_name: string;
  parent_run_id: string | null;
  output_hash: string;
  started_at: string;
  finished_at: string;
}

function extrairJson(texto: string): unknown {
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((cercado ? cercado[1] : texto).trim());
}

function hashTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function exigirPacote(resultado: ReturnType<typeof compilarPacote>, papel: Papel): PacoteCompilado {
  if (!resultado.ok || !resultado.pacote) {
    throw new Error(`${papel}: compilação bloqueada: ${JSON.stringify(resultado.bloqueios)}`);
  }
  return resultado.pacote;
}

function conferirRunReal(row: RunBanco): RunRealEvidencia {
  if (row.status !== "ok") throw new Error(`${row.papel}: run ${row.id} não terminou ok`);
  const provedor = row.model_provider.toLowerCase();
  if (!provedor.includes("claude") || provedor.includes("mock") || provedor.includes("fixture")) {
    throw new Error(`${row.papel}: provedor não é real (${row.model_provider})`);
  }
  if (!row.finished_at) throw new Error(`${row.papel}: run ${row.id} sem finished_at`);
  return {
    papel: row.papel,
    run_id: row.id,
    project_id: row.project_id,
    alvo: row.alvo,
    status: "ok",
    model_provider: row.model_provider,
    model_name: row.model_name,
    parent_run_id: row.parent_run_id,
    output_hash: row.output_hash,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

async function lerRun(id: string): Promise<RunRealEvidencia> {
  const { data, error } = await sb
    .from("engine_runs")
    .select("id,project_id,papel,alvo,status,model_provider,model_name,parent_run_id,output_hash,started_at,finished_at")
    .eq("id", id)
    .eq("owner", OWNER)
    .single();
  if (error || !data) throw new Error(`engine_runs ${id}: ${error?.message ?? "ausente"}`);
  return conferirRunReal(data as RunBanco);
}

async function ultimoRunReal(papel: Papel): Promise<RunRealEvidencia> {
  const { data, error } = await sb
    .from("engine_runs")
    .select("id,project_id,papel,alvo,status,model_provider,model_name,parent_run_id,output_hash,started_at,finished_at")
    .eq("owner", OWNER)
    .eq("papel", papel)
    .eq("status", "ok")
    .ilike("model_provider", "%claude%")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`${papel}: nenhum run real bem-sucedido (${error?.message ?? "ledger vazio"})`);
  return conferirRunReal(data as RunBanco);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirmar")) {
    throw new Error("confirmação ausente; use --confirmar (isto não autoriza canário nem prosa)");
  }
  const workDir = process.env.WORK_DIR?.trim();
  const claudeBin = process.env.CLAUDE_BIN?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!workDir || !claudeBin || !supabaseUrl) throw new Error("WORK_DIR, CLAUDE_BIN e SUPABASE_URL são obrigatórios");

  // Fail-closed: o projeto exclusivo precisa existir, pertencer ao owner e estar
  // explicitamente autorizado em produção. Nenhuma linha é criada aqui.
  const [{ data: prova, error: erroProva }, { data: autorizacao, error: erroAut }] = await Promise.all([
    sb.from("projects").select("id").eq("id", PROJETO_PROVA).eq("owner", OWNER).single(),
    sb.from("engine_autorizacoes_v2").select("id,modo,ativo").eq("project_id", PROJETO_PROVA).eq("owner", OWNER).eq("ativo", true).maybeSingle(),
  ]);
  if (erroProva || !prova) throw new Error(`projeto exclusivo de prova ausente: ${erroProva?.message ?? PROJETO_PROVA}`);
  if (erroAut || !autorizacao || autorizacao.modo !== "producao") {
    throw new Error(`projeto de prova sem autorização ativa de produção: ${erroAut?.message ?? "ausente"}`);
  }

  const { data: fonte, error: erroFonte } = await sb
    .from("projects")
    .select("id,skill_escrita,idioma_origem")
    .eq("id", PROJETO_FONTE)
    .eq("owner", OWNER)
    .single();
  if (erroFonte || !fonte) throw new Error(`projeto-fonte somente leitura ausente: ${erroFonte?.message ?? PROJETO_FONTE}`);
  const projetoFonte = fonte as ProjetoFonte;
  const skillV1 = projetoFonte.skill_escrita?.trim() ?? "";
  const contrato = carregarContrato(MAPA_SKILL_V1_V2[skillV1] ?? skillV1);

  const dirFonte = path.join(workDir, PROJETO_FONTE);
  const dirProva = path.join(workDir, PROJETO_PROVA);
  const caminhoPerfil = path.join(dirFonte, "perfil-de-voz.md");
  const caminhoCapitulo = path.join(dirFonte, "manuscrito", `capitulo-${String(CAPITULO_FONTE).padStart(2, "0")}.md`);
  const [perfilTexto, texto] = await Promise.all([readFile(caminhoPerfil, "utf8"), readFile(caminhoCapitulo, "utf8")]);
  if (texto.split(/\s+/).filter(Boolean).length < 500) throw new Error("capítulo-fonte curto demais para julgamento real");

  const persistencia = new SupabasePersistencia();
  const ficha = await persistencia.lerFichaMaisRecente(PROJETO_FONTE, CAPITULO_FONTE);
  if (!ficha) throw new Error(`ficha real do capítulo ${CAPITULO_FONTE} ausente`);
  if (ficha.schema !== "scene-spec/v1") throw new Error(`ficha real com schema inesperado: ${String(ficha.schema)}`);

  const gravador = new Gravador({ persistencia, projectId: PROJETO_PROVA });
  const provedor = new ProvedorClaudeCli(claudeBin, dirProva);
  const mapa = mapaModelosDoAmbiente();
  const head = capturarHead(RAIZ);
  const alvo = `pre-canary:${head}`;
  const perfil = {
    texto: perfilTexto,
    skillId: contrato.contrato.id,
    hash: createHash("sha256").update(perfilTexto, "utf8").digest("hex"),
    validado: true,
  };
  const secaoTexto: SecaoContexto = { titulo: "TEXTO A AVALIAR", texto, fonte: `somente-leitura:${PROJETO_FONTE}:capitulo:${CAPITULO_FONTE}` };
  const pacote = (papel: Papel, textoAvaliado: string, incluirFicha = true) =>
    exigirPacote(
      compilarPacote({
        papel,
        alvo,
        contrato,
        perfil,
        ...(incluirFicha ? { ficha } : {}),
        fatos: [{ ...secaoTexto, texto: textoAvaliado }],
      }),
      papel
    );
  const base = { gravador, provedor, mapa, maxTentativas: 2, payload: { finalidade: "prova_pre_canary_sem_prosa", fonte_hash: hashTexto(texto) } };

  // 1) Triagem real, usando exatamente os parsers e medições do pipeline.
  const sinais = medirSinais(texto, contrato.contrato);
  const rRev = await executarPapel<Parecer>({
    ...base,
    papel: "revisor_literario",
    alvo,
    pacote: pacote("revisor_literario", texto),
    tarefa: tarefaRevisor(CAPITULO_FONTE, resumoSinais(sinais), contrato.contrato),
    parse: (saida) =>
      hidratarOcorrenciasCitadas(
        exigirDisposicaoCompleta(validarParecer(normalizarParecerBruto(extrairJson(saida), sinais)), sinais),
        sinais
      ),
  });
  const conferenciaTriagem = conferirParecer(rRev.valor, sinais);
  const escalada = precisaEscalar(rRev.valor, sinais, { vaiFechar: true });
  if (!escalada.escalar) throw new Error("cascata não escalou apesar do gatilho de fechamento");

  // 2) Decisão real: mesmo projeto e mesmo alvo da triagem, parent_run_id ligado.
  const rDec = await executarPapel({
    ...base,
    papel: "revisor_decisao",
    alvo,
    pacote: pacote("revisor_decisao", texto),
    tarefa: tarefaDecisaoCascata(CAPITULO_FONTE, resumoSinais(sinais), rRev.valor, escalada.motivo),
    parse: (saida) => validarDelta(extrairJson(saida), sinais),
    parentRunId: rRev.runId,
    payload: { finalidade: "prova_pre_canary_sem_prosa", passada: "decisao", gatilho: escalada.motivo, fonte_hash: hashTexto(texto) },
  });
  const consolidado = hidratarOcorrenciasCitadas(
    exigirDisposicaoCompleta(validarParecer(aplicarDelta(rRev.valor, rDec.valor, sinais)), sinais),
    sinais
  );
  const conferenciaFinal = conferirParecer(consolidado, sinais);

  // 3) Conformidade real + consumidor determinístico. Nada é persistido.
  const sinaisConformidade = medirConformidade(ficha, texto);
  const rConformidade = await executarPapel({
    ...base,
    papel: "conformidade_ficha",
    alvo,
    pacote: pacote("conformidade_ficha", texto),
    tarefa: tarefaConformidade(CAPITULO_FONTE, ficha, resumoConformidade(sinaisConformidade)),
    parse: (saida) => validarParecerConformidade(extrairJson(saida)),
  });
  const conformidade = conferirConformidade(rConformidade.valor, ficha, texto);

  // 4) Extração real + derivação pura. O resultado não vai ao estado.
  const rMemoria = await executarPapel({
    ...base,
    papel: "extrator_memoria",
    alvo,
    pacote: pacote("extrator_memoria", texto),
    tarefa: tarefaExtratorMemoria(CAPITULO_FONTE, ficha),
    parse: (saida) => validarExtracaoProsa(extrairJson(saida)),
  });
  const memoriaDerivada = derivarMemoriaDaProsa({
    capitulo: CAPITULO_FONTE,
    texto,
    ficha,
    extracao: rMemoria.valor,
    em: new Date().toISOString(),
  });

  // 5) Julgamento real de idioma. O texto técnico fixo existe apenas em memória,
  // garante que o detector acione o papel e nunca é tratado como capítulo.
  const textoIdioma = "O telemóvel ficou no autocarro. Ela procurou a casa de banho, abriu o ficheiro e anotou a morada antes de regressar ao passeio.";
  const sinalIdioma = medirIdioma(textoIdioma, projetoFonte.idioma_origem || "pt-BR");
  if (!sinalIdioma.divergentesNarracao.length && !sinalIdioma.divergentesDialogo.length) {
    throw new Error("fixture técnica não acionou o detector de variante");
  }
  const rIdioma = await executarPapel({
    ...base,
    papel: "julgamento_idioma",
    alvo,
    pacote: pacote("julgamento_idioma", textoIdioma, false),
    tarefa: tarefaIdioma(CAPITULO_FONTE, projetoFonte.idioma_origem || "pt-BR", resumoIdioma(sinalIdioma)),
    parse: (saida) => validarParecerIdioma(extrairJson(saida)),
  });
  const vereditoIdioma = decidirIdioma(sinalIdioma, rIdioma.valor);

  const produzidos = new Map<Papel, string>([
    ["revisor_literario", rRev.runId],
    ["revisor_decisao", rDec.runId],
    ["conformidade_ficha", rConformidade.runId],
    ["extrator_memoria", rMemoria.runId],
    ["julgamento_idioma", rIdioma.runId],
  ]);
  const papeis = await Promise.all(
    PAPEIS_ENGINE_V2.map((papel) => {
      const id = produzidos.get(papel);
      return id ? lerRun(id) : ultimoRunReal(papel);
    })
  );
  const porPapel = new Map(papeis.map((run) => [run.papel, run]));
  if (porPapel.size !== PAPEIS_ENGINE_V2.length) throw new Error(`ledger retornou ${porPapel.size}/11 papéis únicos`);

  const execucoesReais: ExecucoesReaisEvidencia = {
    papeis,
    cascata: {
      project_id: PROJETO_PROVA,
      alvo,
      triagem_run_id: rRev.runId,
      decisao_run_id: rDec.runId,
      gatilho: escalada.motivo,
      veredito_triagem: conferenciaTriagem.verdictEfetivo,
      veredito_consolidado: conferenciaFinal.verdictEfetivo,
    },
  };
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const saida = {
    tipo: "papeis_reais",
    ambiente: "producao",
    supabase_project_ref: projectRef,
    project_id: PROJETO_PROVA,
    executor_ref: "pre-canary-real-role-proof/v1",
    caminhosLimpeza: ["worker/src", "worker/scripts", "src"],
    passos: [
      { nome: "triagem literária real", exit_code: 0, saida: `run ${rRev.runId}; veredito efetivo ${conferenciaTriagem.verdictEfetivo}` },
      { nome: "segunda passada real da cascata", exit_code: 0, saida: `run ${rDec.runId}; gatilho ${escalada.motivo}; consolidado ${conferenciaFinal.verdictEfetivo}` },
      { nome: "conformidade ficha-prosa real", exit_code: 0, saida: `run ${rConformidade.runId}; conforme=${conformidade.conforme}; ${conformidade.validadas.length} afirmações localizadas` },
      { nome: "extração de memória real", exit_code: 0, saida: `run ${rMemoria.runId}; ${memoriaDerivada.entradas.length} entradas verificadas; ${memoriaDerivada.recusadas.length} recusadas` },
      { nome: "julgamento de idioma real", exit_code: 0, saida: `run ${rIdioma.runId}; passou=${vereditoIdioma.passou}` },
      { nome: "consulta completa do ledger", exit_code: 0, saida: `${papeis.length}/11 papéis reais únicos; cascata no projeto exclusivo e alvo ${alvo}` },
    ],
    execucoes_reais: execucoesReais,
  };
  const dirEvidencias = path.join(RAIZ, ".evidencias");
  await mkdir(dirEvidencias, { recursive: true });
  const destino = path.join(dirEvidencias, "papeis-reais-input.json");
  await writeFile(destino, JSON.stringify(saida, null, 2), "utf8");
  console.log(`PROVA_PAPEIS_REAIS_EXECUTADA: ${papeis.length}/11; cascata=${rRev.runId}->${rDec.runId}`);
  console.log(`ENTRADA_EVIDENCIA: ${destino}`);
  console.log("PROSA_GERADA=0; CAPITULOS_PERSISTIDOS=0; REVIEWS_PERSISTIDOS=0; ESTADO_MUTADO=0");
}

await main();
