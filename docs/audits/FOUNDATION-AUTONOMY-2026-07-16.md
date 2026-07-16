# Fundação autônoma e bloqueios de escrita — auditoria e implementação

Data: 2026-07-16
Branch: `codex/foundation-autonomy`
Escopo de produção: somente leitura. Nenhum deploy, DDL, requeue ou edição de projeto real foi executado.

## Diagnóstico comprovado

### O Protocolo do Primeiro Eco

O gate pausou `criar_fundacao` com cinco blockers, mas os artefatos já existiam. Três causas eram mecânicas:

- os agentes foram gerados em `agentes/` com `LEIA-ME-MOVER.md`, porque a sessão não pôde escrever em `.claude/agents/`; o instalador reconhecia apenas `_agentes-para-instalar/`;
- `Estrutura-do-Livro.md` usa tabela com capítulos 1–90; o parser contava apenas cabeçalhos e observava 2;
- `briefing.protagonista.nome` contém nome e biografia; o gate procurava a string inteira nos documentos, embora Evelyn Hart estivesse presente.

### O Índice dos Abduzidos

O capítulo 48 está aprovado e sincronizado. O bloqueio real está no gate da spec do capítulo 49. A interface mostrava capítulo 48 porque o patch final do circuit breaker não persistia `quality_cap=49`.

A spec 49 já contém `H + R + C` e uma cena própria de Cole. O detector considerava apenas o primeiro token (`H`) ao medir presença e declarou o fio `C` ausente. O detector corrigido foi executado, em leitura, sobre a spec real e retornou aprovação (`None`). Nenhum dos 48 capítulos aprovados precisa ser alterado.

## Solução implementada

### Detectores e normalização

- parser de estrutura aceita cabeçalhos e a primeira coluna de tabelas, valida sequência, lacunas, duplicatas e números fora da faixa;
- protagonista é comparada por identidade canônica, separada da biografia e de honoríficos;
- staging de agentes aceita o diretório alternativo somente com evidência explícita de bloqueio de `.claude/agents`, valida frontmatter/modelo e nunca sobrescreve agente existente;
- presença de fio recorrente considera qualquer posição em uma composição (`H + R + C`), embora apenas fios que já foram primários possam se tornar recorrentes obrigatórios.

### Loop da fundação

O novo ciclo `avaliar → classificar → corrigir → reavaliar` tem no máximo três tentativas:

1. blockers puramente mecânicos usam normalizadores determinísticos;
2. blockers editoriais recuperáveis recebem refino mínimo e dirigido pelos códigos medidos;
3. decisão autoral explícita pausa imediatamente;
4. a mesma estratégia não é repetida sobre o mesmo hash e conjunto de blockers;
5. ausência de convergência abre circuit breaker; teto nunca aprova.

Cada tentativa é persistida em `quality/fundacao-correcao-ledger.json`, com hashes antes/depois, categoria, estratégia, arquivos alterados e resultado. O Quality State original continua sendo a única autoridade de aprovação.

Projetos novos usam esse loop também no preflight da escrita. Livros em andamento não sofrem refino estrutural implícito: os capítulos existentes seguem intactos e a pendência de fundação permanece separada até a publicação.

### Interface

- durante o ciclo: “Corrigindo a fundação automaticamente”; nenhum clique é necessário;
- em circuit breaker: documentos continuam disponíveis, diagnóstico e blockers ficam visíveis, sem oferecer “Gerar fundação” novamente;
- dashboard distingue geração, correção, circuit breaker e decisão autoral em projetos rascunho;
- circuit breaker de spec mostra o capítulo planejado correto (`quality_cap`), não o último capítulo produzido;
- a ação passa a ser “Revalidar spec do capítulo 49”, explica que os 48 aprovados permanecem intactos e lista as tentativas já realizadas;
- a contagem de tentativas no banner é por alvo/estágio, não o total histórico de correções do livro.

## Segurança e ativação

- implementação confinada ao worktree `ATELIER-LIVROS-FOUNDATION-AUTO`;
- branch principal e projetos reais não foram modificados;
- manifesto de skills atualizado para `1.0.4`, alinhado aos arquivos versionados;
- não houve deploy, reinício do worker, alteração SQL, requeue ou clique de retomada;
- para ativar posteriormente: revisar o diff, integrar a branch, aplicar o patch versionado da skill/runner pelo procedimento existente, publicar a web e reiniciar o worker de forma controlada;
- após ativação, “O Índice dos Abduzidos” deve ser retomado por revalidação da spec 49. O resultado esperado é o runner aceitar a spec atual e iniciar o capítulo 49, sem reescrever 1–48.

## Reconciliação automática dos jobs legados

O startup do worker agora executa uma auditoria de reconciliação antes de abrir os
pollers. O default é `LEGACY_RECONCILIATION_MODE=audit`: consulta e registra as
decisões, sem alterar jobs. `apply` precisa ser configurado explicitamente. A
allowlist opcional `LEGACY_RECONCILIATION_PROJECTS` limita a ativação a IDs
separados por vírgula.

Política aplicada:

- somente o job pausado mais recente de cada projeto/fluxo é candidato;
- projeto inexistente, pausa manual/global, job equivalente ativo, decisão
  autoral, circuit breaker operacional ou divergência disco/Storage produzem
  no-op;
- detector, hash dos artefatos e assinatura dos blockers formam a chave de
  idempotência;
- o claim é um update condicional da mesma linha (`paused` + `updated_at`), sem
  criar outro job; duas instâncias concorrentes resultam em um único vencedor;
- revalidação determinística não consome tentativa editorial;
- fundação legada pula integralmente o gerador: usa os documentos existentes,
  aplica os normalizadores seguros e roda o gate/loop limitado atual;
- spec/capítulo deriva o alvo de `quality_cap`, correção, Estado e somente então
  do próximo capítulo; o detector atual roda antes de qualquer LLM;
- circuit breaker de qualidade só reabre se o detector atual já aprovar o
  artefato; se ainda falhar, permanece pausado.

Cada retomada persiste `reconciliado_em`, `reconciliado_por`, versão do detector,
hash, blockers, estratégia, tentativa, resultado, motivo, job de origem/retomada
e `rollback_ref`, tanto no payload quanto no progresso. Atualizações posteriores
de progresso fazem merge e preservam esse ledger.

### Dry-run real em 16/07/2026

Com o detector novo e consultas somente leitura, apareceram exatamente dois
candidatos:

1. job `beca0287-a855-4647-a098-3843dbd9eb45`, projeto Primeiro Eco,
   `GATE_FUNDACAO`, documentos existentes coerentes entre disco e Storage;
2. job `330c62c9-437e-40fc-8178-9a6500ffbf46`, projeto Índice,
   `SPEC_CAPITULO`, alvo 49, aprovado pelo detector atual sem LLM.

Os jobs pausados mais antigos foram classificados como históricos. Nenhum job
foi modificado pelo dry-run.

## Baseline protegido

HEAD da principal e da implementação antes da entrega:
`62960b95e61764056fa2e22618a50cccb5fbdfcd`.

Índice dos Abduzidos, agregado determinístico `nome relativo + NUL + bytes`:

- capítulos 1–48: 48 arquivos,
  `57afc72902fcb97e10888055c0cd559c616cf9ab4a29e3ed402a7918dacb947c`;
- specs existentes até 49: 40 arquivos,
  `9af2a00741300f4f4fb98533f18479ee6f9057814a6621f488f36f2f5688fa01`;
- Estado + documentos centrais da fundação: 5 arquivos,
  `5e338d8d27b22dd1abc4da1b2603ce1c069247a5795c326c3b6c9e962a736109`.

Primeiro Eco, conjunto mínimo necessário à reconciliação (briefing, Bíblia,
Mapa, Estrutura e Estado): disco e Storage têm o mesmo hash agregado
`5051df9b0c5f6ed4fcb02433c3b56f836da2e895fca20ad75c3f4742c78b4450`.

Como nenhuma ativação foi executada, esses valores são simultaneamente o
baseline e o estado pós-implementação local.

## Plano de ativação que exige autorização

1. integrar o commit aprovado e instalar o patch versionado da skill/runner;
2. publicar web e worker, mantendo `LEGACY_RECONCILIATION_MODE=audit`;
3. encerrar o worker anterior e iniciar exatamente uma instância nova;
4. confirmar no log que somente os dois jobs acima são elegíveis;
5. definir `apply` com allowlist somente do Primeiro Eco e reiniciar uma vez;
6. homologar gate, documentos, UI e ausência de job duplicado;
7. voltar a `audit`, trocar a allowlist somente para o Índice, conferir o dry-run;
8. definir `apply`, revalidar a spec 49 e observar o início do capítulo 49;
9. recomputar imediatamente os hashes dos capítulos 1–48; qualquer diferença
   abre circuit breaker operacional e encerra a operação.

Mutações autorizáveis são somente o update condicional dos dois jobs existentes,
as gravações normais de Quality State/ledgers e o progresso normal do runner a
partir do capítulo 49. Não há DDL, exclusão, recriação de projeto, regeneração de
fundação nem reescrita de capítulos aprovados.

## Rollback executável

1. definir `LEGACY_RECONCILIATION_MODE=off` e parar a instância nova;
2. republicar o commit anterior `62960b95e61764056fa2e22618a50cccb5fbdfcd`;
3. para um job ainda não iniciado, restaurar condicionalmente `status`, `erro`,
   categoria e locks a partir de `progresso.reconciliacao_legada.rollback_ref`;
4. para job já iniciado, não apagar artefatos nem ledgers: pausar a mesma linha,
   preservar o diagnóstico e restaurar apenas o ponteiro operacional;
5. recomputar os hashes protegidos. Se algum capítulo 1–48 divergir, manter tudo
   pausado e restaurar somente a cópia byte a byte do baseline autorizado;
6. confirmar uma única instância do worker antes de qualquer nova tentativa.

## Validação

- 137 testes direcionados passaram;
- build web de produção passou;
- lint passou sem erros (três warnings preexistentes de Fast Refresh);
- detector Python corrigido aprovou a spec 49 real em leitura;
- a suíte funcional completa passou: 544 testes em 54 arquivos;
- 10 testes novos cobrem elegibilidade, dedupe, restart, pausas, circuit
  breaker, divergência disco/Storage, concorrência e fundação sem regeneração;
- os dois testes Python exigidos pelo manifesto (`test_gate_spec.py` e `test_runner_limite.py`) passaram;
- o E2E existente com runner real e LLM stubado continuou passando, incluindo bloqueio, correção, recontagem e avanço automático;
- validação visual local chegou à tela de autenticação; o navegador isolado não possuía sessão autenticada, portanto nenhuma ação na aplicação conectada foi executada.

## Critério de aceite operacional após futura ativação

1. projeto novo com o fixture do Primeiro Eco deve concluir a fundação sem pausa;
2. ledger deve mostrar convergência ou circuit breaker limitado, nunca aprovação forçada;
3. dashboard e aba Fundação devem apresentar o mesmo estado;
4. Índice deve apontar spec/capítulo 49 e preservar hashes/linhas dos capítulos 1–48;
5. publicação deve continuar bloqueada enquanto a pendência de fundação do Índice existir;
6. qualquer teste em produção deve usar projeto efêmero `AUDIT-*` e limpeza explícita autorizada.
