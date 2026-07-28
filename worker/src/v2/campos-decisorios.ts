// Engine V2 — inventário de campos DECISÓRIOS e a allowlist de exceções.
//
// A regra da fatia N: todo campo relevante ou muda uma decisão observável, ou sai
// do contrato/persistência/interface. Este arquivo é o registro auditável de
// quem cumpre o quê — e é lido pelo nível 1 do comando de prontidão, que exige
// que cada entrada `decide: true` tenha um consumidor que altere um veredito.
//
// O que este arquivo NÃO é: um consumidor artificial criado para satisfazer
// varredura estática. Nada aqui é importado pelo pipeline.

export interface CampoDecisorio {
  campo: string;
  /** Onde a decisão acontece (arquivo#função). */
  decideEm: string;
  /** Que decisão observável muda. */
  decisao: string;
  /** Teste que prova a mutação. */
  teste: string;
}

/** Campos cuja alteração muda um veredito, com o teste que o demonstra. */
export const CAMPOS_DECISORIOS: CampoDecisorio[] = [
  {
    campo: "SceneSpec.fios_ausentes",
    decideEm: "arco.ts#gateRotacaoPov",
    decisao: "fio declarado ausente por mais capítulos que `max_caps_fio_ausente` reprova a ficha",
    teste: "arco.test.ts",
  },
  {
    campo: "SceneSpec.ato / SceneSpec.tensao_alvo",
    decideEm: "arco.ts#gateFichaContraArco",
    decisao: "divergência do ato/tensão-alvo da grade reprova a ficha no planejamento",
    teste: "arco.test.ts",
  },
  {
    campo: "SceneSpec.promessas_tocadas",
    decideEm: "arco.ts#gateFichaContraArco + fechamento.ts#avaliarFechamentoLivro",
    decisao: "ação fora do previsto reprova a ficha; ausência de pagamento bloqueia o fechamento do livro",
    teste: "arco.test.ts, fiacao-decisoria.test.ts",
  },
  {
    campo: "SceneSpec.marcos_arco",
    decideEm: "arco.ts#gateFichaContraArco",
    decisao: "marco em capítulo que a grade não prevê reprova a ficha",
    teste: "arco.test.ts",
  },
  {
    campo: "SceneSpec.informacao_nova",
    decideEm: "ledger.ts#gateRevelacaoRepetida",
    decisao: "revelação já entregue ao leitor reprova a ficha",
    teste: "ledger.test.ts",
  },
  {
    campo: "SceneSpec.conhecimentos_proibidos",
    decideEm: "gates.ts#gateConhecimentoProibido",
    decisao: "menção literal do proibido bloqueia o capítulo",
    teste: "gates.test.ts",
  },
  {
    campo: "SaidaAuditor.pov_violado",
    decideEm: "pipeline.ts (decisão do capítulo)",
    decisao: "violação de POV reprova o capítulo e gera correção dirigida",
    teste: "fiacao-decisoria.test.ts",
  },
  {
    campo: "FundacaoV2.promessa_editorial",
    decideEm: "portao-fundacao.ts#avaliarFundacaoV2",
    decisao: "vazia reprova a fundação (PROMESSA_EDITORIAL_VAZIA)",
    teste: "portao-fundacao.test.ts",
  },
  {
    campo: "FundacaoV2.estrutura[].resumo_estrutural",
    decideEm: "portao-fundacao.ts#paresDeResumosSimilares",
    decisao: "capítulos com função intercambiável reprovam a fundação",
    teste: "portao-fundacao.test.ts",
  },
  {
    campo: "ArcoFundacao.atos[].tensao_alvo",
    decideEm: "portao-fundacao.ts#progressaoDeTensao",
    decisao: "série plana ou sem pico reprova a fundação",
    teste: "portao-fundacao.test.ts",
  },
  {
    campo: "SkillContract.estruturas_exigidas.docs",
    decideEm: "portao-fundacao.ts (DOC_EXIGIDO_AUSENTE / DOC_PLACEHOLDER)",
    decisao: "documento ausente ou placeholder reprova a fundação inteira",
    teste: "portao-fundacao.test.ts",
  },
  {
    campo: "SkillContract.politica_metafora.cota_por_capitulo / politica_dialogo.piso_percentual",
    decideEm: "sinais.ts#medirSinais → revisor.ts#conferirParecer",
    decisao: "fora da cota exige disposição do revisor; violação confirmada reprova o capítulo",
    teste: "cotas-vivas.test.ts",
  },
];

/**
 * Exceções DOCUMENTADAS: campos que existem, são lidos, e cuja leitura NÃO muda
 * um branch de código. Cada um precisa de uma razão — e a razão nunca pode ser
 * "ainda não deu tempo".
 */
export const EXCECOES_NAO_DECISORIAS: { campo: string; razao: string }[] = [
  {
    campo: "briefing.genero",
    razao:
      "é declaração do autor e entra no pacote do arquiteto de enredo como contexto. Não vira gate porque " +
      "não existe vocabulário fechado de gênero que case com `familia_editorial` sem falso positivo — e detector " +
      "com falso positivo não bloqueia (lição permanente da auditoria de estilo). Quem decide a skill é `skill_escrita`.",
  },
  {
    campo: "projects.paginas_alvo / projects.piso_palavras",
    razao:
      "colunas da V1. Na V2 a faixa de palavras vem de `contrato.faixa_palavras`, que é o que o medidor de sinais lê. " +
      "Não são selecionadas pelo caminho V2 (removidas do SELECT em `prepararProjetoV2`) e não são exibidas como se decidissem algo.",
  },
  {
    campo: "SceneSpec.revelacoes",
    razao:
      "revelações extras alimentam o ledger na aprovação (memória), não um gate próprio: o gate de repetição " +
      "roda sobre o ledger inteiro, então elas decidem indiretamente, no capítulo seguinte.",
  },
];
