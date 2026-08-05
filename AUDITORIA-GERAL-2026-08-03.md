# Auditoria geral do Atelier — 2026-08-03

**Pergunta:** já existe um sistema capaz de escrever um livro de qualidade publicável?

**Resposta: não. E a distância que falta não é de código.**

Você tem uma fábrica montada, ligada, com todos os sensores calibrados, zero peça
solta — e nenhuma peça fabricada. A arquitetura está no ponto mais alto que já
esteve. O que não existe é **uma única prova de que ela escreve um livro bom**, e —
o achado mais grave desta auditoria — **não existe sequer o mecanismo que produziria
essa prova**: `prova_literaria` é uma constante escrita à mão no relatório de
prontidão, não uma medição.

---

## 1. Método — o que é provado e o que é presumido

Auditoria **read-only**, feita hoje direto no disco da pasta conectada
(`ATELIER-LIVROS`), sem gerar uma palavra de prosa e sem alterar nada.

**Alcancei:** repositório, histórico git, `worker/src` (222 arquivos),
`worker/src/v2` (118 arquivos), `src` (78 arquivos), `.prontidao`, `.evidencias`,
`calibracao-humana`, `docs/`, workflows do GitHub, contratos das skills.

**NÃO alcancei** (e por isso nada aqui depende disso): Supabase (sem DNS na
sandbox), `WORK_DIR` (`C:/Users/Rodrigo Paiva/atelier-work`, fora da pasta
conectada) e a API do GitHub (proxy 403). Três coisas ficam, portanto, **não
verificadas** e listadas como pendência de checagem, não como achado.

Regra que segui: **call-site de produção, não import** — o erro de 28/07 que me
custou uma correção pública.

---

## 2. Placar por camada

| Camada | Estado | Base |
|---|---|---|
| Interface web | **Verde** | 1.691/1.691 testes da raiz; páginas, componentes renderizados e rotas cobertos; fluxo de aprovação de briefing existe de verdade |
| Engine V2 | **Verde** | 63/63 garantias DoD locais + 1 externa; 13 campos decisórios com call-site nomeado; worker roda o código do repo |
| Agentes (11 papéis) | **Verde** | `PAPEIS_REAIS_APROVADOS` — evidência externa com modelo real e cascata em duas passadas |
| Skills / contratos | **Amarelo** | Só 3 vozes têm contrato V2; o resto do catálogo cai na V1 |
| Gates de qualidade | **Amarelo** | Fiados e apertados, mas com 1 falso-negativo declarado e sem caminho de correção |
| **Resultado literário** | **Não medido** | Nunca houve livro. Melhor amostra: 6 capítulos (2 por skill), 4 deles `aprovado_com_excecao` |
| Entrega / produção | **Vermelho** | 20 commits presos numa branch; o que está no ar é de 29/07 |

---

## 3. O que está genuinamente provado (não repetir como achado)

Verifiquei hoje, no disco:

1. **Suíte inteira verde.** 1.691/1.691 testes a partir da raiz (579 suítes),
   1.465/1.465 a partir de `worker/`, typecheck limpo nos dois lados, build de
   produção OK, lint com 0 erros (3 avisos, reportados). `.prontidao/suite-raiz.json`,
   gerado em 2026-08-01.
2. **DoD fechada.** 64 garantias inventariadas: 63 locais, todas encontradas,
   executadas e aprovadas; 1 externa (D7-02) comprovada. Zero órfãs, zero sem teste,
   zero duplicadas.
3. **As quatro funções órfãs de 29/07 estão ligadas.** Conferi call-site, não import:
   - `detectarRepeticaoSemantica` → chamada em `pipeline.ts:626`;
   - `planejarAposReavaliacao` → consumida em `revalidacao.ts:291`, no caminho
     `integracao.ts → meta9.ts → revalidacao.ts`;
   - `MEMORIA_PROSA_INCOMPLETA` → o bloqueio que o gravador registra
     (`gravador.ts:422`) agora é lido em `fechamento.ts:58`;
   - `briefing_aprovado` → deixou de ser cast. Virou fronteira tipada com
     fail-closed (`integracao.ts:88-93`: se a coluna não vier, o worker **lança**),
     com botão real na interface (`Projeto.tsx:270` e `:798`) e verificação de que a
     aprovação ainda corresponde ao briefing atual.
4. **Cinco evidências externas válidas e amarradas ao SHA** `928938d`: migrações
   remotas, integração real, UI autenticada, smoke do provedor real, e **11 papéis
   com modelo real + cascata em duas passadas** — isto fecha o buraco de 29/07, em
   que 4 dos 11 papéis nunca tinham rodado fora de mock.
5. **A régua não foi afrouxada.** `git diff master..HEAD` nos três `contrato.json`:
   **vazio**. A única mudança em `sinais.ts` nos 20 commits é um flag de
   compatibilidade do corpus legado que **não toca contagem nem cota**; e a mudança
   em `revisor.ts` **aperta** (índice órfão de detector sem exemplos passou a ser
   problema, era aceito em silêncio).
6. **Rotulagem humana foi aposentada por decisão registrada**, não esquecida
   (`calibracao-humana/README.md`). Não é mais bloqueio de nada. Ver, porém, o furo 6.

---

## 4. Os furos, em ordem de gravidade

### F1 — `prova_literaria` é uma constante, não uma medição **[crítico]**

`worker/scripts/prontidao.ts:766` grava literalmente a string
`"PROVA_LITERARIA_NAO_EXECUTADA"`. O tipo na linha 56 prevê
`PROVA_LITERARIA_APROVADA` e `PROVA_LITERARIA_REPROVADA` — e **não existe um único
produtor desses valores em todo o repositório**.

O que isso significa, sem eufemismo: o sistema mede exaustivamente **a si mesmo** e
**nada** sobre o livro. Todo o aparato de prontidão pode ficar verde para sempre com
um manuscrito ilegível no Storage. É o inverso exato da regra de ouro do projeto
("provar na PÁGINA, não no marcador") — o marcador que deveria representar a página
é o único do painel que ninguém liga na tomada.

### F2 — A entrega está congelada numa branch; o que está no ar é de 29/07 **[crítico]**

- HEAD real: `90bc032`, branch `codex/pre-canary-ready`, último commit **2026-08-01**.
- `master` e `origin/master`: `e905030`, **2026-07-29**.
- `master..HEAD` = **20 commits, 111 arquivos, +4.396 / −1.158**. `HEAD..master` = 0.
- `deploy.yml` publica o front **só em push no master**.

Logo: a aprovação de briefing na interface, a pausa limpa por cota semanal, a
canonicalização dos sinais da cascata, o fechamento do julgamento autônomo, a
remoção dos gates manuais de revisão e a evidência de papéis reais **existem no seu
disco e não existem no ar**. É exatamente a falha de 27/07 ("nenhuma entrega termina
em worktree isolado") repetida com outra roupa: agora não é um worktree, é uma
branch. Não consegui confirmar se há PR aberto (proxy bloqueou o GitHub).

### F3 — O relatório de prontidão está 2 commits atrás do código **[alto]**

`.prontidao/prontidao.json` tem `head = 928938d`. O HEAD é `90bc032`. Os dois
commits de diferença **mudam comportamento** (`fix(engine-v2): canonicalize cascade
signal names` e `fix(engine-v2): pause cleanly on weekly quota`), não documentação.
As cinco evidências externas estão carimbadas contra `928938d` — no critério do
próprio verificador, elas ficam vencidas no HEAD atual. O painel diz verde apoiado
em prova de um código que não é mais o que roda.

### F4 — Sustentação no miolo do livro nunca foi testada **[alto]**

A melhor amostra literária que existe é de 27/07: **2 capítulos por skill, 6 no
total, e 4 dos 6 aprovados por exceção** — não plenos. A V1 desandava justamente
entre os capítulos 20 e 40. Seis capítulos de abertura não dizem nada sobre isso, e
o próprio fechamento de 27/07 registrou essa ressalva. Nada mudou desde então.

### F5 — Só três vozes existem na V2 **[alto]**

`worker/src/v2/contrato.ts:13-15` mapeia exatamente três skills: `skill-dan-brown`,
`hoover-mcfadden`, `skill-romantasy`. `engine_mode` ausente, nulo ou desconhecido →
**V1, por desenho fail-safe** (`integracao.ts:168-171`). Qualquer livro fora dessas
três vozes — jk-rowling, vésper, qualquer projeto novo em outro gênero — roda no
engine cujo resultado você mesmo classificou como lixo. A cobertura da V2 é de três
livros possíveis, não de um catálogo.

### F6 — Uma contradição declarada dentro do próprio código **[médio]**

`worker/src/limitacoes-conhecidas.ts` registra o falso-negativo REC-03 do detector
`contarSanfona` e diz, textualmente, que o que **destrava** a correção é "amostra
rotulada por humano". `calibracao-humana/README.md` diz, textualmente, que a
rotulagem humana está **encerrada** e "não é requisito de nada".

As duas afirmações são incompatíveis: REC-03 fica aberto **para sempre**, e nenhum
documento assume isso. Some-se o dado de `docs/engine-v2/investigacao-sanfona-hoover.md`
— precisão do detector na voz hoover medida em **0–15%** — e o desenho fica
explícito: os detectores são consultivos, quem decide é o revisor-modelo. Isso pode
até estar certo, mas então a página de prontidão está atribuindo rigor a um
instrumento que o projeto já sabe ser impreciso. As 778 linhas do CSV, aliás, têm
**778 justificativas com o texto-placeholder** `SUBSTITUIR POR JUSTIFICATIVA
HUMANA ESPECÍFICA` — nenhuma foi preenchida.

### F7 — A V2 não tem caminho até o artefato publicável **[médio]**

`TIPOS_V2` (`integracao.ts:141-148`) cobre `escrever_livro`, `criar_fundacao`,
`laboratorio_v2`, `revisar`, `refinar_fundacao`, `avaliar`. **Não cobre publicação.**
O gate de publicação e a geração de EPUB continuam na V1
(`publication-gate.ts`, `EPUB_PUBLICATION_GATE` em `correcao-automatica.ts:46`,
`livro_runner.py`). O livro V2 termina como manuscrito sincronizado no Storage
(`capitulos-db.ts:142`). Entre "manuscrito aprovado pela V2" e "arquivo que se
publica na KDP" existe um degrau que hoje é manual (skill `edicao-kindle`) — o que é
aceitável, desde que **assumido**, e hoje não está.

### F8 — Custo por livro não é modelado **[médio]**

O commit mais recente do projeto ensina o worker a **pausar limpo por cota semanal**
— confirmação de que a cota é o gargalo de primeira ordem. Mas não existe, em lugar
nenhum, uma estimativa de **quanto custa um livro na V2**. O único número histórico é
da V1 (323k tokens/capítulo no Índice dos Abduzidos → ~19M tokens para 60
capítulos). Sem esse número na V2, "capaz de escrever um livro" é uma pergunta sem
resposta mesmo que a qualidade seja excelente: pode ser capaz e inviável.

Registro explícito: **não estou propondo mexer em `meta_nota` nem em
`max_reescritas`.** Essa alavanca está fora da mesa por decisão sua, e continua fora.
O que proponho medir é desperdício, não rigor.

### F9 — Três coisas que não consegui verificar e você precisa checar **[pendência]**

1. A autorização aberta em `engine_autorizacoes_v2` sobre **O Farol Cego**
   (`67d19ea0…`, `modo=producao`, `ativo=true`) foi criada em 28/07 só para a prova
   do D7-02. Enquanto estiver ativa, o fail-closed **não protege esse livro**.
2. Os artefatos de canário/laboratório de 21/07 provavelmente estão em
   `C:/Users/Rodrigo Paiva/atelier-work`. Se estiverem lá e forem válidos sob os
   contratos 1.0.0, o certificado pode sair **sem gerar canário novo**.
3. Não existe `worker/release/` no disco — o certificado nunca foi emitido. É o único
   item em `bloqueios_producao`.

---

## 5. Veredito

**Arquitetura: pronta.** Sem ressalva relevante. Os buracos que eu mesmo apontei em
29/07 — funções órfãs, papéis sem run real, `briefing_aprovado` fantasma — foram
fechados de verdade, com call-site e evidência carimbada. Isso é raro e merece ser
dito sem hedge.

**Resultado: desconhecido.** Não "ruim" — desconhecido. Não há livro, não há
certificado, não há medição literária, e o único mecanismo que emitiria um veredito
sobre a página é uma string fixa.

**O gargalo não é técnico: é que a regra de 28/07 já foi cumprida e ninguém a
revogou.** Você escreveu "nenhuma palavra de prosa até que toda a arquitetura esteja
comprovadamente aplicada". A condição está satisfeita — `PRE_CANARY_READY`,
`CANARIO_AUTORIZADO_PELO_GATE`, 63/63 DoD, 5/5 evidências externas. A regra virou,
sem querer, um impedimento permanente: o certificado exige canários, canários exigem
prosa, e a regra proíbe prosa. **Revogar essa regra é o primeiro item do plano.**

---

## 6. Plano de ação

Três ondas. A ordem importa: cada onda torna a seguinte mensurável.

### Onda 1 — desencalhar (1–2 dias, custo de API ≈ zero)

| # | Ação | Por quê |
|---|---|---|
| **A1** | Merge de `codex/pre-canary-ready` → `master` via PR, com CI verde, e deploy | 20 commits de comportamento não estão no ar. Auditar um sistema que não roda é auditar ficção |
| **A2** | Regerar `.prontidao` no HEAD pós-merge | Prova carimbada em `928938d` está vencida |
| **A3** | Revogar a autorização de produção do Farol Cego | O fail-closed está desligado para aquele livro desde 28/07 |
| **A4** | Varrer o `WORK_DIR` atrás dos artefatos de canário/lab de 21/07 | Pode economizar um ciclo inteiro de canário |

### Onda 2 — dar olhos ao sistema (2–3 dias, custo baixo)

| # | Ação | Por quê |
|---|---|---|
| **B1** | Implementar o produtor de `prova_literaria`: script que roda o `book-bestseller-review` sobre o manuscrito V2 e grava `PROVA_LITERARIA_APROVADA/REPROVADA` com o relatório real anexado | Sem isso, nenhuma onda 3 é mensurável. É o furo F1 |
| **B2** | Instrumentar custo por capítulo na V2 (tokens/papel, tokens/capítulo, projeção por livro) e expor em Observabilidade | F8. Responde "quanto custa um livro" antes de gastar um livro descobrindo |
| **B3** | Fechar a contradição REC-03 × rotulagem encerrada: decidir e **escrever** que os detectores são consultivos e o revisor decide — ou reabrir a rotulagem | F6. Uma das duas frases tem que ser corrigida |

### Onda 3 — a prova que decide tudo (1 livro curto, custo real de cota)

| # | Ação | Por quê |
|---|---|---|
| **C1** | **Canário longo**: um livro inteiro de 12–15 capítulos numa skill só (recomendo hoover-mcfadden — é a voz com maior histórico de sanfona, o teste mais duro), pela fila normal, com medição de deriva no miolo (caps 8–15 vs. 1–4) | F4. É a única pergunta que sobrou, e nenhuma quantidade de teste unitário a responde |
| **C2** | Emitir o certificado de release com os artefatos do C1 + laboratório cego | Único bloqueio de produção restante |
| **C3** | Decidir o degrau V2 → EPUB: automatizar ou assumir por escrito que é manual via `edicao-kindle` | F7 |
| **C4** | Só depois: 4ª voz / contrato genérico, se você quiser escrever fora das 3 skills | F5. Não antes — ampliar cobertura de um motor não provado multiplica o desconhecido |

### O que eu não faria agora

- Escrever o Farol Cego ou qualquer livro "de verdade" antes do C1. Um canário de
  15 capítulos descartável custa uma fração e responde a mesma pergunta.
- Mexer em qualquer limiar, cota ou contrato. Eles estão congelados e provados
  congelados — é um dos poucos ativos incontestáveis do projeto.
- Abrir a V2 para novas skills antes de provar uma.

---

## 7. Resposta em uma linha

Você tem o melhor sistema de **garantias** que já teve e nenhuma **garantia sobre o
livro**. Falta uma onda de trabalho barato (desencalhar + instrumentar) e um canário
longo. Depois disso, e só depois, a pergunta "isto escreve um livro publicável?"
passa a ter uma resposta em vez de uma opinião.

---

*Auditoria read-only. Nenhum arquivo alterado, nenhum job criado, nenhuma palavra de
prosa gerada. Prompts executáveis para cada item em `PROMPTS-PLANO-2026-08-03.md`.*
