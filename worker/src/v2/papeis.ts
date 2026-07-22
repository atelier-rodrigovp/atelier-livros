// Engine V2 — executor de papéis (F3).
// Um papel = uma chamada de modelo com pacote compilado + tarefa; a saída é validada
// e TUDO vira run no ledger (input_bundle_hash, output_hash, attempt, parent_run_id).
// Papéis nunca tocam disco: quem persiste é o gravador (worker).

import { hashJsonCanonico } from "./hash.js";
import type { Gravador } from "./gravador.js";
import { renderizarPacote, type PacoteCompilado } from "./compilador.js";
import { resolverModelo } from "./config.js";
import type { ProvedorModelo, RespostaModelo } from "./provedor.js";
import { ErroEngine, type MapaModelos, type Papel } from "./tipos.js";

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

export async function executarPapel<T>(e: ExecucaoPapel<T>): Promise<ResultadoPapel<T>> {
  const { capacidade, modelo } = resolverModelo(e.papel, e.mapa);
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
      resposta = await e.provedor.chamar({ papel: e.papel, capacidade, modelo, prompt, timeoutMs: e.timeoutMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await e.gravador.falharRun(runId, { codigo: "PROVEDOR_FALHOU", classe: "infra", mensagem: msg });
      // Limite do plano Max: NÃO é falha do papel — atravessa sem retry técnico
      // (retry local não ajuda; o loop do worker pausa com retry_at sem contar tentativa).
      if ((err as Error)?.name === "LimiteMaxError") throw err;
      if (tentativa === max) {
        throw new ErroEngine({ codigo: "PROVEDOR_FALHOU", classe: "infra", mensagem: `papel ${e.papel} falhou após ${max} tentativas: ${msg}` });
      }
      parent = runId;
      ultimoErro = msg;
      continue;
    }

    try {
      const valor = e.parse(resposta.texto);
      await e.gravador.concluirRun(runId, {
        output_hash: hashJsonCanonico(resposta.texto),
        tokens_in: resposta.tokensIn,
        tokens_out: resposta.tokensOut,
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
