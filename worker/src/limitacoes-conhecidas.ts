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
// teste de caracterização e o `prontidao` a lista como bloqueio formal. Não
// existe RELEASE_PRODUCAO_CERTIFICADO com limitação de recall em aberto.
//
// Por que não foi simplesmente corrigida: afrouxar o molde do detector mexe em
// algo que vira GATE DURO por skill (`ORC_TRANSPARENCIA_POR_SKILL`; dan-brown já
// tem cotas bloqueantes). Trocar falso negativo por falso positivo reprova
// capítulo bom. A regra do projeto é explícita: só ganha `bloqueia:true` a skill
// validada com zero falso-positivo em capítulos de controle. Enquanto a rotulagem
// humana não fecha, mexer aqui é adivinhação — e adivinhação em gate é regressão.

export interface LimitacaoConhecida {
  id: string;
  detector: string;
  /** O texto que deveria acender o detector e não acende. */
  exemplo: string;
  /** Por que a heurística não alcança, em termos do próprio regex. */
  causa: string;
  /** O que destrava a correção. */
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
      "reconhecer `não X, não Y, Z` sem conector aproxima o detector de enumeração legítima (`Levou o mapa, a lanterna, o relógio`) — " +
      "o limiar depende de amostra rotulada por humano",
  },
];

/** Uma linha por limitação, para o relatório de prontidão. */
export function resumoLimitacoes(): string[] {
  return LIMITACOES_RECALL.map((l) => `${l.id} (${l.detector}): ${l.causa}`);
}
