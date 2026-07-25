export type EstadoEsperaWizardV2 =
  | "concluido"
  | "falha"
  | "pausado"
  | "throttle"
  | "worker_offline"
  | "producao_pausada"
  | "demora_excessiva"
  | "executando"
  | "na_fila";

export interface EntradaEsperaWizardV2 {
  status?: string | null;
  createdAt?: string | null;
  progresso?: { aguardando_reset?: boolean; retry_at?: string | null } | null;
  workerOnline: boolean;
  producaoAtiva: boolean;
  agora?: number;
  timeoutMs?: number;
}

/** Resolve o que o usuário realmente precisa saber enquanto aguarda o worker. */
export function resolverEsperaWizardV2(e: EntradaEsperaWizardV2): EstadoEsperaWizardV2 {
  if (e.status === "done") return "concluido";
  if (e.status === "error" || e.status === "canceled") return "falha";
  if (e.progresso?.aguardando_reset || (e.progresso?.retry_at && Date.parse(e.progresso.retry_at) > (e.agora ?? Date.now()))) {
    return "throttle";
  }
  if (e.status === "paused") return "pausado";
  if (!e.producaoAtiva) return "producao_pausada";
  if (!e.workerOnline) return "worker_offline";
  if (e.status === "running") return "executando";
  const inicio = e.createdAt ? Date.parse(e.createdAt) : NaN;
  if (
    Number.isFinite(inicio) &&
    (e.agora ?? Date.now()) - inicio > (e.timeoutMs ?? 120_000)
  ) {
    return "demora_excessiva";
  }
  return "na_fila";
}

export const TEXTO_ESPERA_WIZARD_V2: Record<
  EstadoEsperaWizardV2,
  { titulo: string; detalhe: string }
> = {
  concluido: {
    titulo: "Etapa concluída",
    detalhe: "O resultado já está disponível.",
  },
  falha: {
    titulo: "A etapa falhou",
    detalhe: "Leia a mensagem do worker e tente novamente depois da correção.",
  },
  pausado: {
    titulo: "A etapa está pausada",
    detalhe: "O worker pediu uma decisão ou encontrou um bloqueio que não pode resolver sozinho.",
  },
  throttle: {
    titulo: "Aguardando o limite da IA",
    detalhe: "A tentativa será retomada automaticamente no horário indicado; não crie outro job.",
  },
  worker_offline: {
    titulo: "Worker offline",
    detalhe: "O projeto está salvo. A etapa começa quando o worker local voltar a responder.",
  },
  producao_pausada: {
    titulo: "Produção pausada",
    detalhe: "O projeto está salvo, mas a fila global precisa ser reativada nas configurações.",
  },
  demora_excessiva: {
    titulo: "A espera passou de 2 minutos",
    detalhe: "O job continua auditável. Confira o worker e use tentar novamente somente se ele tiver falhado.",
  },
  executando: {
    titulo: "Worker executando",
    detalhe: "A página acompanha o job e libera a próxima decisão quando ele terminar.",
  },
  na_fila: {
    titulo: "Na fila",
    detalhe: "O projeto está salvo e aguarda o próximo ciclo do worker.",
  },
};
