// Limitações conhecidas dos detectores de transparência.
//
// Três construções estavam registradas como `it.skip` em `transparencia.test.ts`
// com o comentário "heurística não cobre". Ao tirar os skips, DUAS passaram: os
// detectores já cobriam os casos havia tempo, e os comentários eram de uma
// versão antiga do regex. Ninguém percebeu porque teste pulado nunca roda —
// então nunca desmente a si mesmo. É a razão de não existir mais `skip` naquele
// arquivo: um `skip` não é um lembrete, é um ponto cego.
//
// Sobrou UMA limitação real. Ela vira DADO aqui: o falso negativo é fixado por
// teste de caracterização e o `prontidao` a reporta como NÃO COMPROVADA — que
// não é bloqueio, é ausência de prova nomeada, item por item.
//
// QUEM DECIDE (resolvido em 2026-08-03, PASSO 1):
// os detectores de transparência são CONSULTIVOS. O número que eles produzem
// NUNCA confirma violação sozinho — está escrito assim em `tarefas.ts`
// (`tarefaRevisor`, REGRA DOS SINAIS DE CONTAGEM): para dispor
// `violacao_confirmada` o revisor precisa citar, em `ocorrencias_citadas`, o
// ÍNDICE de cada ocorrência que julgou defeito real; ocorrência não citada conta
// como falso positivo, e citadas + `falsos_positivos` têm de fechar o valor
// medido. Quem decide é o revisor-modelo, sobre o texto; o detector só aponta
// onde olhar.
//
// Isso está medido, não suposto: `docs/engine-v2/investigacao-sanfona-hoover.md`
// mediu a precisão de `contarSanfona` na voz hoover em 0–15% (0–2 sanfonas
// genuínas em 13 contadas), porque o critério aposto-denso captura descrição
// concreta por acúmulo e gradação emocional — features validadas daquela voz.
//
// Consequência para o recall: um falso NEGATIVO de detector consultivo não deixa
// nada passar sozinho, porque não era ele que reprovava. Por isso REC-03 deixou
// de depender de "amostra rotulada por humano" — esse fluxo está ENCERRADO
// (`calibracao-humana/README.md`) e não é requisito de nada.
//
// Por que ainda não foi corrigida — CORRIGIDO EM 2026-08-05 contra o código, que
// desmentia as duas justificativas escritas aqui:
//
// (1) "dan-brown já tem cotas bloqueantes" era FALSO, e nunca foi verdade.
//     `ORC_TRANSPARENCIA_POR_SKILL` (maneirismo.ts) tem UMA entrada —
//     hoover-mcfadden — e ela é `bloqueia: false`. O default
//     (`SINAL_TRANSPARENCIA`) também é `bloqueia: false`, e `ofensores` só se
//     preenche quando `orc.bloqueia` (maneirismo.ts, `diagnosticarTransparencia`):
//     NENHUMA skill tem gate duro de transparência, dan-brown menos que as outras
//     — ela nunca esteve no mapa em commit nenhum. O espelho Python diz o mesmo
//     ("SO SINAL: alimenta o prompt do revisor; nao bloqueia nada",
//     livro-do-zero-ao-epub/assets/livro_runner.py). A promoção a gate duro é
//     per-skill e exige skill validada no benchmark com zero falso-positivo nos
//     capítulos-controle — critério que nenhuma skill cumpriu até hoje.
//
// (2) "a régua dos contratos 1.0.0 está CONGELADA" era FALSO no número: os três
//     contratos estão em 1.2.0. O congelamento existe, mas é de PROCESSO, não de
//     versão: o laboratório de calibração nunca move uma cota ativa sozinho
//     ("cota ativa congelada; promoção exige alteração de código, laboratório
//     cego e canários", v2/calibracao.ts). Isso vale em qualquer versão.
//
// A razão REAL de não afrouxar o molde ad hoc, essa sim sustentada pelo código:
// o detector consultivo não bloqueia, mas também não é inócuo. Sinal FORA DA COTA
// obriga disposição do revisor — parecer que não dispõe de um sinal fora da cota
// é REPROVADO (`v2/revisor.ts`), e cota `sem_excecao` fora da cota rebaixa
// "excecao_valida" a violação. Ou seja: trocar falso negativo por falso positivo
// não trava a produção deterministicamente, mas custa rodada de reprovação em
// capítulo bom. Recalibrar exige processo separado — corpus automático
// versionado, precisão/recall e holdout — ou decisão explícita do autor.
// Ajuste ad hoc em detector que alimenta cota é regressão.

export interface LimitacaoConhecida {
  id: string;
  detector: string;
  /** O texto que deveria acender o detector e não acende. */
  exemplo: string;
  /** Por que a heurística não alcança, em termos do próprio regex. */
  causa: string;
  /** O que passa a valer enquanto a limitação existe, e o que a destravaria. */
  destrava: string;
}

export const LIMITACOES_RECALL: LimitacaoConhecida[] = [
  {
    id: "REC-03",
    detector: "contarSanfona",
    exemplo: "Não era uma igreja de verdade, não era um templo, era uma fábrica com a lógica de culto que sobrava.",
    causa:
      "a negação reformuladora exige conector explícito (`mas`/`e sim`/`só`/`é`) logo após a vírgula, e o aposto denso exige " +
      "≥3 vírgulas sem travessão — a tripla negação tem 2 vírgulas e nenhum conector",
    destrava:
      "O QUE VALE: o detector é consultivo — sanfona só reprova quando o revisor-modelo cita o ÍNDICE da ocorrência " +
      "em `ocorrencias_citadas` (tarefaRevisor, violacao_confirmada), então este falso negativo não deixa capítulo ruim passar sozinho. " +
      "O QUE DESTRAVARIA: reconhecer `não X, não Y, Z` sem conector aproxima o detector de enumeração legítima " +
      "(`Levou o mapa, a lanterna, o relógio`), e a precisão medida na voz hoover é de 0–15% — recalibrar exige processo " +
      "separado (corpus automático versionado, precisão/recall, holdout) ou decisão explícita do autor. " +
      "NÃO depende de rotulagem humana: esse fluxo está encerrado (calibracao-humana/README.md).",
  },
];

/** Uma linha por limitação, para o relatório de prontidão. */
export function resumoLimitacoes(): string[] {
  return LIMITACOES_RECALL.map((l) => `${l.id} (${l.detector}): ${l.causa}`);
}
