// Definition of Done da Engine V2, como DADO verificável (defeito D1).
//
// O comando de prontidão emitia IMPLEMENTACAO_APROVADA olhando só para as suítes
// que ele mesmo listava — de modo que uma garantia obrigatória AINDA NÃO
// IMPLEMENTADA simplesmente não aparecia, e o estado saía verde.
//
// A primeira correção declarou a DoD inteira aqui, mas conferia apenas se o
// ARQUIVO de teste citado existia. Isso ainda deixava a garantia evaporar por
// dentro: apagar o teste, ou marcá-lo `skip`, mantinha o arquivo no lugar e a
// implementação continuava aprovada. Existência de arquivo nunca foi prova de
// comportamento.
//
// Hoje cada garantia tem um ID ESTÁVEL, o teste que a prova declara esse ID no
// título (`[DOD:<id>]`) e a conferência (`dod-conferencia.ts`) lê o RESULTADO da
// execução: encontrado, executado e aprovado — ou a implementação reprova.
//
// Os IDs são imutáveis depois de atribuídos: renumerar quebra a rastreabilidade
// com os títulos dos testes. Garantia removida deixa o ID aposentado; garantia
// nova recebe o próximo número livre da fatia.

export interface GarantiaDoD {
  /** Fatia do plano (B–Q) ou defeito (D1–D7) a que a garantia pertence. */
  fatia: string;
  /**
   * `local` — a suíte da máquina prova, e a implementação local depende dela.
   * `externo` — só evidência contra o serviço real prova. NUNCA é aprovada por
   * teste local (mock não é integração), aparece como não comprovada e bloqueia
   * o release de produção até existir evidência estruturada.
   */
  escopo: "local" | "externo";
  /** Identificador estável, declarado por `[DOD:<id>]` no título do teste. */
  id: string;
  /** O que precisa ser verdade. Redigido como comportamento observável. */
  garantia: string;
  /** Arquivo(s) de teste que provam. Relativo a `worker/` ou à raiz do repo. */
  testes: string[];
}

export const INVENTARIO_DOD: GarantiaDoD[] = [
  // --- B: fiação solta ------------------------------------------------------
  { fatia: "B", escopo: "local", id: "B-01", garantia: "`pov_violado` reprova um capítulo", testes: ["src/v2/fiacao-decisoria.test.ts"] },
  { fatia: "B", escopo: "local", id: "B-02", garantia: "promessa não paga bloqueia o fechamento citando o identificador", testes: ["src/v2/fiacao-decisoria.test.ts"] },
  { fatia: "B", escopo: "local", id: "B-03", garantia: "capítulo que apenas planta promessa válida NÃO é reprovado", testes: ["src/v2/fiacao-decisoria.test.ts"] },

  // --- C/D2: escada de correção --------------------------------------------
  { fatia: "C", escopo: "local", id: "C-01", garantia: "falha de qualidade entra em escada com estratégias realmente distintas", testes: ["src/v2/correcao.test.ts"] },
  { fatia: "C", escopo: "local", id: "C-02", garantia: "ausência de progresso aciona circuit breaker", testes: ["src/v2/correcao.test.ts"] },
  { fatia: "D2", escopo: "local", id: "D2-01", garantia: "cada estratégia executa um CAMINHO diferente (não o mesmo com hash novo)", testes: ["src/v2/correcao.test.ts"] },
  { fatia: "D2", escopo: "local", id: "D2-02", garantia: "julgamento alternativo não chama o escritor e julga o mesmo hash", testes: ["src/v2/correcao.test.ts"] },

  // --- D/D5: execução encadeada --------------------------------------------
  { fatia: "D", escopo: "local", id: "D-01", garantia: "execução retoma por checkpoint sem reiniciar o livro", testes: ["src/v2/encadeamento.test.ts"] },
  { fatia: "D5", escopo: "local", id: "D5-01", garantia: "`max_novos_caps=1` não produz falso `done`", testes: ["src/v2/encadeamento.test.ts"] },
  { fatia: "D5", escopo: "local", id: "D5-02", garantia: "livro completo é derivado dos capítulos aprovados", testes: ["src/v2/encadeamento.test.ts"] },

  // --- E: entrevista e briefing --------------------------------------------
  { fatia: "E", escopo: "local", id: "E-01", garantia: "campo condicional aceita `não se aplica` explícito, nunca default silencioso", testes: ["src/v2/briefing-aprovacao.test.ts"] },
  { fatia: "E", escopo: "local", id: "E-02", garantia: "briefing contraditório ou não aprovado não gera fundação", testes: ["src/v2/briefing-aprovacao.test.ts"] },
  { fatia: "E", escopo: "local", id: "E-03", garantia: "briefing aprovado é persistido com hash e sem duplicidade com o wizard", testes: ["src/v2/briefing-aprovacao.test.ts"] },
  { fatia: "E", escopo: "local", id: "E-04", garantia: "entrevista V2 concluída não enfileira fundação antes da aprovação autoral", testes: ["src/entrevista.test.ts"] },
  { fatia: "E", escopo: "local", id: "E-05", garantia: "worker consome briefing_aprovado como coluna real e falha se ela não foi selecionada", testes: ["src/v2/fluxo-aprovacao.test.ts"] },

  // --- F/D6: fundação -------------------------------------------------------
  { fatia: "F", escopo: "local", id: "F-01", garantia: "fundação sem arco ou invariância explícita do protagonista é bloqueada", testes: ["src/v2/portao-fundacao.test.ts"] },
  { fatia: "F", escopo: "local", id: "F-02", garantia: "fundação com promessa vazia ou fio sem escalada é bloqueada", testes: ["src/v2/portao-fundacao.test.ts"] },
  { fatia: "F", escopo: "local", id: "F-03", garantia: "tensão que não escala entre atos é bloqueada", testes: ["src/v2/portao-fundacao.test.ts"] },
  { fatia: "D6", escopo: "local", id: "D6-01", garantia: "macro × micro cruzados por plantio, reforço, pagamento, fios, clímax, marcos, atos e tensão", testes: ["src/v2/portao-fundacao.test.ts"] },

  // --- G: conformidade ficha → prosa ---------------------------------------
  { fatia: "G", escopo: "local", id: "G-01", garantia: "capítulo bem escrito que não cumpre a virada da ficha é reprovado com evidência localizada", testes: ["src/v2/conformidade.test.ts"] },
  { fatia: "G", escopo: "local", id: "G-02", garantia: "afirmação de conformidade sem trecho localizável não sustenta aprovação", testes: ["src/v2/conformidade.test.ts"] },

  // --- H: memória derivada da prosa ----------------------------------------
  { fatia: "H", escopo: "local", id: "H-01", garantia: "promessa surgida apenas na prosa entra no ledger e exige payoff", testes: ["src/v2/memoria-prosa.test.ts"] },
  { fatia: "H", escopo: "local", id: "H-02", garantia: "conflito entre ficha e prosa gera evento explícito, nunca sobrescrita silenciosa", testes: ["src/v2/memoria-prosa.test.ts"] },
  { fatia: "H", escopo: "local", id: "H-03", garantia: "memória de prosa incompleta bloqueia o fechamento do livro", testes: ["src/v2/fiacao-decisoria.test.ts"] },
  { fatia: "H", escopo: "local", id: "H-04", garantia: "reprocessamento bem-sucedido resolve o bloqueio de memória incompleta", testes: ["src/v2/gravador.test.ts"] },

  // --- I: repetição ---------------------------------------------------------
  { fatia: "I", escopo: "local", id: "I-01", garantia: "repetição literal distante é detectada", testes: ["src/v2/repeticao.test.ts"] },
  { fatia: "I", escopo: "local", id: "I-02", garantia: "revelação parafraseada é detectada", testes: ["src/v2/repeticao.test.ts"] },
  { fatia: "I", escopo: "local", id: "I-03", garantia: "maneirismo repetido em cinco capítulos gera sinal acumulativo", testes: ["src/v2/repeticao.test.ts"] },
  { fatia: "I", escopo: "local", id: "I-04", garantia: "maneirismo não calibrado NÃO bloqueia automaticamente", testes: ["src/v2/repeticao.test.ts"] },
  { fatia: "I", escopo: "local", id: "I-05", garantia: "repetição semântica altera o veredito no pipeline de produção", testes: ["src/v2/fiacao-decisoria.test.ts"] },
  { fatia: "I", escopo: "local", id: "I-06", garantia: "maneirismo acumulado chega aos prompts de escritor e revisor", testes: ["src/v2/fiacao-decisoria.test.ts"] },

  // --- J: revisor, auditor e idioma ----------------------------------------
  { fatia: "J", escopo: "local", id: "J-01", garantia: "parecer abaixo do piso não aprova", testes: ["src/v2/revisor.test.ts"] },
  { fatia: "J", escopo: "local", id: "J-02", garantia: "evidência vazia ou não localizável não sustenta aprovação", testes: ["src/v2/revisor.test.ts"] },
  { fatia: "J", escopo: "local", id: "J-03", garantia: "gate de idioma reprova divergência injustificada e aceita diálogo intencional", testes: ["src/v2/idioma.test.ts"] },

  // --- K: revalidação transitiva -------------------------------------------
  { fatia: "K", escopo: "local", id: "K-01", garantia: "alteração no capítulo 4 reabre apenas os capítulos dependentes", testes: ["src/v2/revalidacao.test.ts"] },
  { fatia: "K", escopo: "local", id: "K-02", garantia: "revalidação não reescreve capítulo que continua válido", testes: ["src/v2/revalidacao.test.ts"] },
  { fatia: "K", escopo: "local", id: "K-03", garantia: "cascata acima do teto aciona decisão humana", testes: ["src/v2/revalidacao.test.ts"] },
  { fatia: "K", escopo: "local", id: "K-04", garantia: "onda transitiva reavalia todos e reescreve somente os reprovados", testes: ["src/v2/revalidacao.test.ts"] },
  { fatia: "K", escopo: "local", id: "K-05", garantia: "Meta9 executa revalidação transitiva no pipeline e preserva dependente válido", testes: ["src/v2/meta9.test.ts"] },

  // --- L: canário e invalidação --------------------------------------------
  { fatia: "L", escopo: "local", id: "L-01", garantia: "o perfil de voz deriva do snapshot aprovado do canário", testes: ["src/v2/canario-snapshot.test.ts"] },
  { fatia: "L", escopo: "local", id: "L-02", garantia: "alterar canário, briefing, skill ou total invalida artefatos dependentes", testes: ["src/v2/canario-snapshot.test.ts"] },

  // --- M/D3: certificado e autorização -------------------------------------
  { fatia: "M", escopo: "local", id: "M-01", garantia: "sem certificado válido nada executa", testes: ["src/v2/release-allowlist.test.ts"] },
  { fatia: "M", escopo: "local", id: "M-02", garantia: "com certificado e sem autorização o projeto não executa", testes: ["src/v2/release-allowlist.test.ts"] },
  { fatia: "M", escopo: "local", id: "M-03", garantia: "autorização não substitui certificado", testes: ["src/v2/release-allowlist.test.ts"] },
  { fatia: "D3", escopo: "local", id: "D3-01", garantia: "modo canário não cobre fundação, escrita nem avaliação", testes: ["src/v2/release-allowlist.test.ts"] },

  // --- N/D7: dados decisórios e documentos ---------------------------------
  { fatia: "N", escopo: "local", id: "N-01", garantia: "cada campo decisório muda uma decisão ou está na allowlist comentada", testes: ["src/v2/arco.test.ts"] },
  // D7 estava afirmando publicação e abertura REAIS com prova apenas local. As
  // duas coisas são verdadeiras em graus diferentes e por isso viram garantias
  // diferentes: o contrato local (materialização, caminho canônico, índice,
  // adaptador, consumo pela tela) a suíte prova; o upload no Storage do Supabase
  // e o download em sessão autenticada, não — e nenhum mock pode provar.
  { fatia: "D7", escopo: "local", id: "D7-01", garantia: "documentos V2 são materializados com caminho canônico, índice e hash, e a interface consome esse índice", testes: ["src/v2/documentos.test.ts", "../src/lib/documentosFundacao.test.ts"] },
  { fatia: "D7", escopo: "externo", id: "D7-02", garantia: "documentos V2 sobem ao Storage real e são baixados em sessão autenticada, com hash conferido", testes: [] },

  // --- O: interface ---------------------------------------------------------
  { fatia: "O", escopo: "local", id: "O-01", garantia: "a tela mostra promessas, pistas, ledger, gates, estratégias tentadas e afetados por reescrita", testes: ["../src/lib/painelEditorial.test.ts"] },
  { fatia: "O", escopo: "local", id: "O-02", garantia: "a interface não promete o que o motor não cumpre (reescrita de capítulo aprovado)", testes: ["../src/lib/painelEditorial.test.ts"] },
  { fatia: "O", escopo: "local", id: "O-03", garantia: "interface só habilita fundação V2 com entrevista, aprovação, autorização e release válidos", testes: ["../src/lib/precondicoesFundacaoV2.test.ts"] },

  // --- P/D4: histórico e RLS -----------------------------------------------
  { fatia: "P", escopo: "local", id: "P-01", garantia: "histórico protegido não aceita update/delete comum", testes: ["src/v2/historico.test.ts"] },
  { fatia: "P", escopo: "local", id: "P-02", garantia: "correção gera evento novo em vez de reescrever o anterior", testes: ["src/v2/historico.test.ts"] },
  { fatia: "D4", escopo: "local", id: "D4-01", garantia: "autorização: owner do projeto, campos históricos imutáveis, revogação sem reescrita", testes: ["src/v2/autorizacao-politica.test.ts"] },

  // --- Q: prontidão ---------------------------------------------------------
  { fatia: "Q", escopo: "local", id: "Q-01", garantia: "testes rodam da raiz e de `worker` sem depender do diretório corrente", testes: ["src/v2/rotulagem-csv.test.ts"] },
  { fatia: "Q", escopo: "local", id: "Q-02", garantia: "ciclo completo interface → worker → gates → Storage → Leitor passa com mock", testes: ["src/v2/integracao-mock.test.ts"] },
  // --- R: fila de custo por capítulo (cascata, pins, versão do código) -------
  { fatia: "R", escopo: "local", id: "R-01", garantia: "a decisão da cascata ACRESCENTA violação que a triagem descartou (não só derruba)", testes: ["src/v2/cascata.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-02", garantia: "`veredito_sugerido` da decisão não derruba gate universal", testes: ["src/v2/cascata-pipeline.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-03", garantia: "`MODELO_POR_PAPEL` é conjunto fechado: exceção nova quebra o teste", testes: ["src/v2/cascata-pipeline.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-04", garantia: "o worker carimba SHA e horário do código com que subiu", testes: ["src/versao-codigo.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-05", garantia: "worktree suja é declarada, nunca escondida atrás do SHA", testes: ["src/versao-codigo.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-06", garantia: "worker no mesmo SHA do repositório, worktree limpa, NÃO bloqueia", testes: ["../src/lib/versaoWorker.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-07", garantia: "worker em SHA diferente do repositório bloqueia, nomeando os dois SHAs", testes: ["../src/lib/versaoWorker.test.ts"] },
  { fatia: "R", escopo: "local", id: "R-08", garantia: "interface rejeita prontidão de outro SHA e build feito sobre arquivos rastreados modificados", testes: ["../src/lib/autorizacaoV2.test.ts"] },
];

/** Fatias que precisam estar comprovadas para a implementação ser aprovada. */
export function fatiasDoInventario(): string[] {
  return [...new Set(INVENTARIO_DOD.map((g) => g.fatia))].sort();
}
