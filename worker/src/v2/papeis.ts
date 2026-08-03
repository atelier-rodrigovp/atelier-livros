// Engine V2 — executor de papéis (F3).
// Um papel = uma chamada de modelo com pacote compilado + tarefa; a saída é validada
// e TUDO vira run no ledger (input_bundle_hash, output_hash, attempt, parent_run_id).
// Papéis nunca tocam disco: quem persiste é o gravador (worker).

import { hashJsonCanonico } from "./hash.js";
import { LimiteMaxError } from "../limite-max.js";
import type { Gravador } from "./gravador.js";
import { renderizarPacote, type PacoteCompilado } from "./compilador.js";
import { resolverModelo } from "./config.js";
import { ErroProvedor, type ProvedorModelo, type RespostaModelo } from "./provedor.js";
import { ErroEngine, EXECUCAO_POR_PAPEL, type MapaModelos, type Papel } from "./tipos.js";

export interface ExecucaoPapel<T> {
  papel: Papel;
  alvo: string;
  pacote: PacoteCompilado;
  tarefa: string;                       // instrução da tarefa (tarefas.ts)
  parse: (texto: string) => T;          // valida/parseia a saída; lança em caso inválido
  gravador: Gravador;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  jobId?: string | null;
  editionId?: string | null;
  parentRunId?: string | null;
  maxTentativas?: number;               // default 2 (1 retry técnico com instrução corretiva)
  timeoutMs?: number;
  /** Metadados auditáveis da chamada (ex.: modo_correcao) — vão ao run do ledger. */
  payload?: Record<string, unknown>;
}

export interface ResultadoPapel<T> {
  valor: T;
  runId: string;
  resposta: RespostaModelo;
  tentativas: number;
}

// Teto duro de falhas de infra por (execução, papel) — incidente 2026-07-21/22:
// 1.299 runs 'falha' do arquiteto_cena em cima de um 429 não classificado.
// Limite do Max (LimiteMaxError) NÃO conta aqui: quota pausa, não é falha.
export const TETO_FALHAS_INFRA = 5;
const falhasInfraPorExecucao = new Map<string, number>();

/** Zera o contador (testes; opcionalmente por escopo de job). */
export function zerarFalhasInfra(escopo?: string): void {
  if (!escopo) {
    falhasInfraPorExecucao.clear();
    return;
  }
  for (const chave of [...falhasInfraPorExecucao.keys()]) {
    if (chave.startsWith(`${escopo}:`)) falhasInfraPorExecucao.delete(chave);
  }
}

function registrarFalhaInfra(escopo: string, papel: Papel): number {
  const chave = `${escopo}:${papel}`;
  const n = (falhasInfraPorExecucao.get(chave) ?? 0) + 1;
  falhasInfraPorExecucao.set(chave, n);
  return n;
}

export async function executarPapel<T>(e: ExecucaoPapel<T>): Promise<ResultadoPapel<T>> {
  const { capacidade, modelo } = resolverModelo(e.papel, e.mapa);
  const execucao = EXECUCAO_POR_PAPEL[e.papel];
  // Versao do CLI vai para o run: sem ela nao da para dizer, depois, com que
  // binario um capitulo foi produzido.
  const versaoCli = typeof e.provedor.versao === "function" ? e.provedor.versao() : "nao-informada";
  const max = e.maxTentativas ?? 2;
  let parent: string | null | undefined = e.parentRunId;
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= max; tentativa++) {
    const runId = await e.gravador.iniciarRun({
      papel: e.papel,
      capacidade,
      model_provider: e.provedor.nome,
      model_name: modelo,
      alvo: e.alvo,
      input_bundle_hash: e.pacote.hash,
      skill_id: e.pacote.skill.id,
      skill_version: e.pacote.skill.versao,
      job_id: e.jobId ?? null,
      edition_id: e.editionId ?? null,
      parent_run_id: parent ?? null,
      attempt: tentativa,
      evidencias: [],
      ...(e.payload ? { payload: e.payload } : {}),
    });

    const correcao = tentativa > 1
      ? `\n\n## CORREÇÃO (tentativa ${tentativa})\nA saída anterior foi rejeitada: ${ultimoErro}\nRetorne EXATAMENTE no formato pedido.`
      : "";
    const prompt = `${renderizarPacote(e.pacote)}\n\n## TAREFA\n${e.tarefa}${correcao}`;

    let resposta: RespostaModelo;
    try {
      // Esforco e timeout sao propriedade do PAPEL (EXECUCAO_POR_PAPEL), nao
      // parametro de quem chama. `e.timeoutMs` sobrevive so como override
      // explicito; sem ele, a tabela decide — era daqui que vinham os
      // `timeout apos 300000ms` do arquiteto_enredo.
      resposta = await e.provedor.chamar({
        papel: e.papel,
        capacidade,
        modelo,
        prompt,
        timeoutMs: e.timeoutMs ?? execucao.timeoutMs,
        esforco: execucao.esforco,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Limite do plano Max: NÃO é falha do papel — atravessa sem retry técnico
      // (retry local não ajuda; o loop do worker pausa com retry_at sem contar tentativa).
      if (err instanceof LimiteMaxError || (err as Error)?.name === "LimiteMaxError") {
        const limite = err as LimiteMaxError;
        await e.gravador.falharRun(runId, {
          codigo: "PROVEDOR_LIMITE",
          classe: "quota",
          mensagem: msg,
          detalhe: { retry_at: limite.retryAt, aguardando_reset: limite.aguardandoReset },
        });
        throw err;
      }
      await e.gravador.falharRun(runId, { codigo: "PROVEDOR_FALHOU", classe: "infra", mensagem: msg });
      // Fallback/deriva de modelo é configuração inválida, não instabilidade:
      // repetir a mesma chamada apenas consumiria cota no modelo errado.
      if (err instanceof ErroProvedor && err.codigo === "PROVEDOR_MODELO_DIVERGENTE") {
        throw new ErroEngine({
          codigo: err.codigo,
          classe: "configuracao",
          mensagem: msg,
          detalhe: err.detalhe,
        });
      }
      // Teto duro por (execução, papel): mais de TETO_FALHAS_INFRA falhas de infra
      // seguidas é padrão de tempestade (provedor fora do ar ou limite não
      // classificado) — abortar com classe 'quota' em vez de continuar queimando.
      const falhasInfra = registrarFalhaInfra(e.jobId ?? "sem-job", e.papel);
      if (falhasInfra > TETO_FALHAS_INFRA) {
        throw new ErroEngine({
          codigo: "TETO_FALHAS_INFRA",
          classe: "quota",
          mensagem: `papel ${e.papel}: ${falhasInfra} falhas de infra na mesma execução (teto ${TETO_FALHAS_INFRA}) — abortando para proteger a cota`,
          detalhe: { falhas: falhasInfra, teto: TETO_FALHAS_INFRA, ultimo_erro: msg.slice(0, 300) },
        });
      }
      if (tentativa === max) {
        throw new ErroEngine({ codigo: "PROVEDOR_FALHOU", classe: "infra", mensagem: `papel ${e.papel} falhou após ${max} tentativas: ${msg}` });
      }
      parent = runId;
      ultimoErro = msg;
      continue;
    }

    if (resposta.modeloExecutado !== modelo) {
      const mensagem =
        `papel ${e.papel}: modelo solicitado ${modelo}; ` +
        `executado ${resposta.modeloExecutado ?? "não informado"}`;
      await e.gravador.falharRun(runId, {
        codigo: "PROVEDOR_MODELO_DIVERGENTE",
        classe: "configuracao",
        mensagem,
      });
      throw new ErroEngine({
        codigo: "PROVEDOR_MODELO_DIVERGENTE",
        classe: "configuracao",
        mensagem,
      });
    }

    try {
      const valor = e.parse(resposta.texto);
      await e.gravador.concluirRun(runId, {
        output_hash: hashJsonCanonico(resposta.texto),
        tokens_in: resposta.tokensIn,
        tokens_out: resposta.tokensOut,
        evidencias: [
          { tipo: "metrica", referencia: "modelo_executado", detalhe: resposta.modeloExecutado },
          // Sem o esforco gravado, a medicao de qualidade de amanha nao consegue
          // dizer em que nivel cada capitulo foi produzido — e o experimento
          // vira anedota.
          { tipo: "metrica", referencia: "esforco_solicitado", detalhe: execucao.esforco },
          { tipo: "metrica", referencia: "cli_versao", detalhe: versaoCli },
          // Duracao da CHAMADA, medida no spawn. `finished_at` mede a linha, e ja
          // saiu 27 min depois do trabalho (run 889f9fc9) — nao serve para medir ganho.
          { tipo: "metrica", referencia: "duracao_chamada_ms", detalhe: String(resposta.duracaoMs ?? "") },
        ],
      });
      return { valor, runId, resposta, tentativas: tentativa };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await e.gravador.falharRun(runId, { codigo: "FORA_DO_SCHEMA", classe: "tecnica", mensagem: msg });
      if (tentativa === max) {
        throw new ErroEngine({ codigo: "FORA_DO_SCHEMA", classe: "tecnica", mensagem: `papel ${e.papel}: saída inválida após ${max} tentativas: ${msg}` });
      }
      parent = runId;
      ultimoErro = msg;
    }
  }
  // inalcançável (o loop retorna ou lança), mas o TS exige:
  throw new ErroEngine({ codigo: "PROVEDOR_FALHOU", classe: "infra", mensagem: "loop de tentativas esgotado" });
}
