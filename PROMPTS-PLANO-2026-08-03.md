# Prompts executáveis — plano da auditoria de 2026-08-03

Cada prompt é **auto-contido**: cole numa sessão nova do Claude Code, sem contexto
prévio. Rode na ordem. Não pule a Onda 1 — as outras dependem dela.

Regras de ouro que valem para **todos** os prompts abaixo (já embutidas em cada um):

1. Provar na PÁGINA / no dado real, nunca no marcador.
2. Consertar no MOLDE (worker/fábrica), nunca na instância.
3. **Proibido** alterar `meta_nota`, `max_reescritas`, qualquer limiar, cota ou
   `contrato.json`. Qualidade é restrição de primeira ordem. Otimização só vale se
   for eliminação de desperdício, jamais redução de rigor.
4. Nada termina em branch isolada: toda entrega fecha em `master` com o worker
   rodando o código novo.
5. Nunca inflar nota de review. Nunca declarar "resolvido" sem evidência anexada.
6. Restart do worker no Windows: `Stop-ScheduledTask AtelierWorker` **não** mata o
   node filho — sempre `Stop-Process -Force` no PID do node antes de
   `Start-ScheduledTask`. Use `powershell.exe` (não existe `pwsh` no host) e
   `claude.exe` (nunca `claude.cmd`).

---

## PROMPT 1 — Onda 1: desencalhar a entrega

```
Você está no repositório ATELIER-LIVROS (C:\Users\Rodrigo Paiva\Desktop\PESSOAL\LIVROS\ATELIER-LIVROS),
plataforma que escreve livros com uma engine própria (Engine V2, em worker/src/v2)
e uma interface web (src/, publicada no GitHub Pages pelo deploy.yml em todo push
no master).

CONTEXTO FACTUAL (verificado em 2026-08-03, confirme antes de agir):
- HEAD está em codex/pre-canary-ready @ 90bc032 (2026-08-01).
- master e origin/master estão em e905030 (2026-07-29).
- master..HEAD = 20 commits, 111 arquivos, +4396/-1158. HEAD..master = 0.
- deploy.yml publica o front SOMENTE em push no master, ignorando worker/** e *.md.
- .prontidao/prontidao.json tem head=928938d — dois commits atrás do HEAD real.
- bloqueios_producao = ["CERTIFICADO_RELEASE"], único item aberto.

OBJETIVO MENSURÁVEL:
Ao final, TODAS estas afirmações devem ser verdadeiras e provadas com saída de
comando colada no relatório:
 (1) origin/master contém os 20 commits (git rev-list --count origin/master..HEAD == 0);
 (2) CI verde no PR que fez o merge;
 (3) o deploy do front rodou e o gh-pages tem o build do commit novo;
 (4) .prontidao/prontidao.json regenerado com head == HEAD atual, e o conjunto de
     estados formais impresso no relatório;
 (5) o worker de produção roda o código do HEAD (item "versao_worker" ok:true);
 (6) o estado da autorização em engine_autorizacoes_v2 do projeto "O Farol Cego"
     (5ac9d614) está documentado, e revogado se não estiver em uso;
 (7) inventário do que existe em C:/Users/Rodrigo Paiva/atelier-work relacionado a
     canário/laboratório de 2026-07-21 (arquivos, datas, tamanhos, e se contêm
     execucao.json / avaliacao-cega.json / relatorio.json).

GROUNDING (leia antes de agir, não presuma):
- CLAUDE.md, .github/workflows/ci.yml, .github/workflows/deploy.yml
- worker/scripts/prontidao.ts, worker/scripts/v2-verificar-release.ts
- git log --oneline master..HEAD

FRONTEIRAS (proibido):
- Alterar qualquer limiar, cota, contrato.json, meta_nota ou max_reescritas.
- Criar job de escrita, gerar prosa, ou religar produção que esteja pausada.
  Se worker_control.enabled == false, NÃO religue: registre e siga.
- Force-push, rebase de master, ou merge sem CI verde.

AÇÕES IRREVERSÍVEIS QUE VOCÊ VAI EXECUTAR (nomeie no relatório antes de cada uma):
- push da branch, abertura e merge do PR, push no master (dispara deploy público),
- revogação da autorização de produção (se aplicável).
Para o merge: use --no-ff, mensagem descrevendo o lote. Se o CI reprovar, PARE e
relate — não conserte o CI afrouxando teste.

FASES (cada uma tem DoD; não avance sem cumprir):
F1. Diagnóstico: confirme os 6 fatos do contexto acima com comando. DoD: saída colada.
F2. PR: push da branch, abra PR para master, aguarde CI. DoD: link do PR + status.
F3. Merge + deploy. DoD: origin/master == HEAD; run do deploy.yml concluído.
F4. Atualizar o worker de produção para o código novo (pull + install + restart com
    o procedimento de Stop-Process descrito). DoD: worker.log com PID novo e
    reconexão; versao_worker ok:true na prontidão.
F5. Regerar prontidão. DoD: prontidao.json com head == HEAD, estados formais colados.
F6. Autorização + inventário do WORK_DIR. DoD: saída da consulta e listagem colada.

REGRESSÃO OBRIGATÓRIA (antes do merge): npm test -- --run na raiz,
npm run typecheck --prefix worker, npm run build, npm run lint. Todos verdes.
Se algum falhar, PARE.

ORÇAMENTO E PARADA: no máximo 3 tentativas por fase. Se uma fase falhar 3 vezes,
pare e escreva o relatório com o bloqueio explícito. Não invente caminho alternativo.

ANTI-FALSIFICAÇÃO: nenhuma afirmação de sucesso sem a saída do comando que a
sustenta, colada literalmente. "Presumo que", "deve estar" e "provavelmente" são
proibidos — se não mediu, escreva NÃO VERIFICADO.

ENTREGA: relatório em RELATORIO-ONDA1-2026-08-03.md, commitado.
```

---

## PROMPT 2 — Onda 2 / B1: dar olhos ao sistema (`prova_literaria` de verdade)

```
Repositório ATELIER-LIVROS. A Engine V2 (worker/src/v2) escreve livros e
worker/scripts/prontidao.ts emite o relatório de prontidão do sistema.

ACHADO QUE ORIGINA ESTA TAREFA (confirme antes de agir):
worker/scripts/prontidao.ts linha ~766 grava literalmente a string
"PROVA_LITERARIA_NAO_EXECUTADA" no campo estados.prova_literaria. O tipo na linha
~56 prevê também PROVA_LITERARIA_APROVADA e PROVA_LITERARIA_REPROVADA, e NÃO EXISTE
NENHUM PRODUTOR desses dois valores em todo o repositório (verifique com
grep -rn "PROVA_LITERARIA" worker src --include=*.ts | grep -v ".test.").
Consequência: o sistema mede exaustivamente a si mesmo e nada sobre o livro. Todo o
painel pode ficar verde com um manuscrito ilegível no Storage.

OBJETIVO MENSURÁVEL:
Passar a existir um produtor real do estado literário, tal que:
 (1) exista worker/scripts/v2-prova-literaria.ts que recebe um projeto/edição, lê o
     manuscrito consolidado da V2 (o mesmo que capitulos-db.ts sincroniza para o
     Storage), roda a avaliação editorial completa (skill book-bestseller-review,
     pelo mesmo caminho de provedor que o resto da V2 usa — nunca uma segunda via)
     e grava um artefato assinado por hash com: nota por dimensão, nota agregada,
     piso, relatório textual íntegro, sha256 do manuscrito avaliado e o SHA do
     código;
 (2) prontidao.ts passe a LER esse artefato e derivar
     PROVA_LITERARIA_APROVADA | PROVA_LITERARIA_REPROVADA | PROVA_LITERARIA_NAO_EXECUTADA,
     com fail-closed: artefato ausente, com hash de manuscrito divergente, ou gerado
     em SHA diferente do HEAD => NAO_EXECUTADA (nunca APROVADA);
 (3) exista teste que FALHE se o produtor for removido ou se o consumidor voltar a
     ser constante (teste de integração, não de unidade — o erro histórico deste
     projeto foi teste verde com função órfã);
 (4) a nota NUNCA é somada nem arredondada pelo próprio modelo avaliador — reuse a
     regra já implementada em worker/src/v2/meta9.ts ("o modelo nunca soma a
     própria nota").

GROUNDING (leia antes):
worker/scripts/prontidao.ts, worker/src/v2/meta9.ts, worker/src/v2/capitulos-db.ts,
worker/src/v2/release.ts, worker/src/v2/provedor.ts, worker/src/v2/gravador.ts,
worker/skill-patches/manifest.json.

FRONTEIRAS (proibido):
- Alterar meta_nota, max_reescritas, limiares, cotas ou contrato.json. Nenhum.
- Inflar, arredondar para cima ou "normalizar" nota. Se o avaliador der 6.2, o
  artefato registra 6.2.
- Rodar o produtor contra um livro real de produção nesta tarefa. Nesta fase o
  produtor é exercitado com fixture determinística (ProvedorMock) e com um
  manuscrito de teste. A execução com modelo real fica para o PROMPT 5.
- Reimplementar a avaliação: reusar o caminho existente, não criar segunda régua.

FASES:
F1. Confirmar o achado com grep e colar a saída. DoD: prova de que não há produtor.
F2. Desenhar o artefato (schema + hash + fail-closed) e escrever o teste que falha
    ANTES da implementação. DoD: teste vermelho pelo motivo certo.
F3. Implementar o produtor. DoD: teste verde com ProvedorMock, zero cota gasta.
F4. Ligar o consumidor em prontidao.ts + teste de integração que falha se o
    consumidor virar constante de novo. DoD: os dois testes verdes; remova o
    produtor temporariamente e prove que o teste FICA VERMELHO (cole a saída).
F5. Regressão completa + commit + merge em master + prontidão regenerada.

REGRESSÃO OBRIGATÓRIA: npm test -- --run (raiz), typecheck worker, build, lint.
1691+ testes verdes (o número atual é 1691; não pode cair).

ORÇAMENTO E PARADA: máximo 4 iterações por fase. Se a F3 exigir mudar a interface
do provedor ou do gravador, PARE e relate — mudança estrutural aí não estava
prevista e merece decisão do autor.

ANTI-FALSIFICAÇÃO: a F4 exige a prova negativa (remover o produtor e mostrar o
teste vermelho). Sem essa saída colada, a tarefa não está feita.

ENTREGA: RELATORIO-PROVA-LITERARIA.md commitado, com o schema do artefato e as
saídas dos testes.
```

---

## PROMPT 3 — Onda 2 / B2 + B3: custo por livro e a contradição REC-03

```
Repositório ATELIER-LIVROS, Engine V2 (worker/src/v2).

DOIS ACHADOS INDEPENDENTES, ambos de medição/documentação. NENHUM envolve alterar
comportamento de qualidade.

ACHADO A — custo por livro não é modelado.
O commit 90bc032 ("pause cleanly on weekly quota") confirma que a cota semanal é o
gargalo de primeira ordem. Mas não existe estimativa de quanto custa UM LIVRO na
V2. O único número histórico é da V1: 323k tokens/capítulo no projeto "O Índice dos
Abduzidos" (~19M tokens para 60 capítulos). Sem o número da V2, "o sistema escreve
um livro" é indecidível mesmo com qualidade excelente.

ACHADO B — contradição declarada no código.
worker/src/limitacoes-conhecidas.ts registra o falso-negativo REC-03 do detector
contarSanfona e diz que o que DESTRAVA a correção é "amostra rotulada por humano".
calibracao-humana/README.md diz que a rotulagem humana está ENCERRADA e não é
requisito de nada. As duas afirmações são incompatíveis. Contexto adicional:
docs/engine-v2/investigacao-sanfona-hoover.md mediu a precisão do detector na voz
hoover em 0–15%, e calibracao-humana/rotulos.local.csv tem 778 linhas com 778
justificativas ainda no texto-placeholder "SUBSTITUIR POR JUSTIFICATIVA HUMANA
ESPECÍFICA".

OBJETIVO MENSURÁVEL:
 (1) worker/src/v2 passa a emitir, por execução, custo em tokens por PAPEL e por
     CAPÍTULO (entrada, saída, e total), persistido pelo mesmo caminho que a
     telemetria já usa — sem DDL nova, seguindo o padrão de linha `jobs` de tipo
     próprio já usado por `qualidade_editorial`;
 (2) existe uma projeção "custo estimado do livro completo" = f(custo médio por
     capítulo medido, total_capitulos do projeto), exibida na tela de
     Observabilidade, e rotulada explicitamente como PROJEÇÃO, nunca como medida;
 (3) src/pages/Observabilidade.tsx passa a renderizar a quebra `por_modelo`, que
     telemetria.ts já calcula e persiste e que hoje NÃO aparece em lugar nenhum;
 (4) a contradição do Achado B está resolvida em UMA direção, escrita e commitada:
     ou (i) documenta-se que os detectores são consultivos e o revisor-modelo é
     quem decide — e limitacoes-conhecidas.ts deixa de prometer um destrave que não
     virá; ou (ii) reabre-se um caminho mínimo de rotulagem. Escolha (i) é a
     recomendada e a que bate com o desenho atual; se escolher (i), o texto de
     REC-03 deve dizer o que passa a valer, não sumir.

GROUNDING: worker/src/telemetria.ts, src/pages/Observabilidade.tsx,
worker/src/v2/papeis.ts, worker/src/v2/gravador.ts, worker/src/estado-editorial.ts
(padrão de persistência schema-free), worker/src/limitacoes-conhecidas.ts,
calibracao-humana/README.md, docs/engine-v2/03-cotas-regra-sinal.md.

FRONTEIRAS (proibido, sem exceção):
- Alterar meta_nota, max_reescritas, qualquer limiar, cota ou contrato.json.
- Propor, mesmo como opção, reduzir rigor para economizar token. A única otimização
  aceitável neste projeto é eliminar trabalho REDUNDANTE.
- DDL nova no banco (regra do CLAUDE.md).
- Mexer no detector contarSanfona. O Achado B é de documentação, não de heurística.

FASES:
F1. Confirmar os dois achados com grep/saída colada.
F2. Instrumentação de custo (molde: onde o papel executa, não em cada call-site).
    DoD: teste que prova que um papel executado registra tokens por papel.
F3. UI: por_modelo + projeção rotulada. DoD: teste de componente renderizado.
F4. Resolver a contradição por escrito. DoD: os dois arquivos coerentes entre si,
    diff colado no relatório.
F5. Regressão + commit + merge em master.

REGRESSÃO: suíte da raiz (1691+ verde), typecheck worker, build, lint.

ORÇAMENTO E PARADA: 3 iterações por fase. Se a instrumentação de custo exigir tocar
o provedor de forma que mude o contrato de chamada, PARE e relate.

ANTI-FALSIFICAÇÃO: nenhum número de custo pode ser estimado por leitura de código —
todos vêm de execução real (ProvedorMock serve para provar o caminho; o número real
sai no PROMPT 5). Marque cada número como MEDIDO ou PROJETADO.

ENTREGA: RELATORIO-CUSTO-E-REC03.md commitado.
```

---

## PROMPT 4 — Onda 3 / C1: o canário longo (a prova que decide tudo)

> **Este é o único prompt que gasta cota e gera prosa.** Não rode antes dos
> PROMPTS 1 e 2 estarem fechados — sem eles, o resultado não é mensurável.

```
Repositório ATELIER-LIVROS, Engine V2. Esta tarefa GERA PROSA e CONSOME COTA.
Confirme com o autor antes de iniciar a fase de escrita.

POR QUE ESTA TAREFA EXISTE:
A melhor amostra literária que a Engine V2 já produziu são 6 capítulos (2 por
skill), dos quais 4 foram aprovados POR EXCEÇÃO, em 2026-07-27. A V1 desandava entre
os capítulos 20 e 40. Nenhum teste unitário responde se a V2 sustenta o miolo de um
livro — só um livro sustenta. Este é o experimento que responde.

OBJETIVO MENSURÁVEL:
Escrever, pela fila normal e no engine V2, UM livro curto e DESCARTÁVEL de 12 a 15
capítulos, na skill hoover-mcfadden (escolhida por ser a voz com maior histórico de
sanfona — é o teste mais duro), em projeto novo criado só para isto, e produzir:
 (1) o livro completo, com todos os capítulos aprovados PLENAMENTE ou com a lista
     explícita dos que ficaram em aprovado_com_excecao e por quê;
 (2) MEDIÇÃO DE DERIVA: comparar capítulos 1–4 contra 9–15 nas métricas que o
     sistema já calcula (sinais fora de cota, regens por capítulo, maneirismos por
     10k, repetição verbatim cross-capítulo, monotonia de POV, exposition_risk).
     A pergunta a responder com número: a qualidade cai no miolo? Em quanto?
 (3) CUSTO REAL: tokens por capítulo e total do livro, com a projeção para 60
     capítulos;
 (4) a PROVA LITERÁRIA rodada pelo produtor construído no PROMPT 2, com o relatório
     do book-bestseller-review íntegro anexado e a nota SEM NENHUM ajuste;
 (5) leitura direta, feita por você, de 3 capítulos (um do início, um do meio, um do
     fim) com veredito honesto em prosa — e o cruzamento explícito: algum capítulo
     que você considerou fraco passou limpo pelos gates? Se sim, isso é um
     FALSO-NEGATIVO dos gates e é o achado mais importante do relatório.

PRÉ-CONDIÇÕES (verifique e PARE se alguma falhar):
- origin/master contém o merge do PROMPT 1; worker roda o HEAD.
- O produtor de prova_literaria do PROMPT 2 existe e tem teste verde.
- Existe autorização em engine_autorizacoes_v2 para ESTE projeto novo — nunca reuse
  a autorização de um livro real. Ao final, REVOGUE.
- worker_control.enabled só pode ser religado com confirmação explícita do autor;
  cota semanal é restrição de primeira ordem.

FRONTEIRAS (proibido):
- Usar um projeto real (O Farol Cego, O Índice dos Abduzidos, qualquer obra do
  catálogo). Projeto novo, descartável, nomeado como canário.
- Alterar meta_nota, max_reescritas, limiares, cotas ou contrato.json — nem para
  "caber na cota", nem para "o canário passar". Se o livro reprovar, o resultado é
  REPROVADO e isso é informação valiosa.
- Reescrever capítulo à mão para melhorar o resultado. O que sai da máquina é o
  dado.
- Declarar sucesso com o livro incompleto.

FASES:
F1. Pré-condições + criação do projeto + autorização. DoD: saída colada.
F2. Fundação (criar_fundacao) e portão de fundação. DoD: fundação aprovada pelo
    portão, documentos íntegros, hash conferido.
F3. Escrita encadeada até o último capítulo, pela fila normal. Registre a cada
    capítulo: nº de regens, motivo de cada regen, tokens, tempo, gates que
    dispararam. DoD: N capítulos aprovados, log por capítulo colado.
F4. Medição de deriva (1–4 vs 9–15) com os números lado a lado. DoD: tabela.
F5. Prova literária + leitura direta de 3 capítulos + caça a falso-negativo.
F6. Revogar a autorização. Relatório.

ORÇAMENTO E PARADA: se a cota semanal esgotar, o worker pausa limpo (é o
comportamento do commit 90bc032) — retome, não force. Se um mesmo capítulo estourar
8 regens, PARE e relate: isso é achado, não obstáculo a contornar. Se o custo
projetado do livro de 60 capítulos passar de 3x o do canário por capítulo, relate
como risco antes de continuar.

ANTI-FALSIFICAÇÃO:
- Nenhuma nota ajustada, arredondada ou "contextualizada". A nota crua vai no
  relatório.
- Se você achar que a prosa está fraca e os gates disserem que está boa, escreva
  isso em destaque. A regra deste projeto é que gate verde com prosa ruim é o pior
  resultado possível, pior que gate vermelho.
- Não use a leitura de outra IA como prova. Leia você mesmo os 3 capítulos.

ENTREGA: RELATORIO-CANARIO-LONGO.md commitado, com as tabelas, os logs e o
veredito honesto. Este relatório é o insumo do certificado de release.
```

---

## PROMPT 5 — Onda 3 / C2: emitir o certificado de release

> Só depois do PROMPT 4 fechado com resultado aceitável.

```
Repositório ATELIER-LIVROS. Único item em bloqueios_producao da prontidão:
CERTIFICADO_RELEASE. Não existe worker/release/ no disco — o certificado nunca foi
emitido.

OBJETIVO MENSURÁVEL:
 (1) worker/scripts/v2-certificar-release.ts executado com sucesso, produzindo
     worker/release/engine-v2.json, versionado no Git;
 (2) .prontidao/prontidao.json regenerado passa a mostrar
     release_producao = "RELEASE_PRODUCAO_CERTIFICADO" e bloqueios_producao = [];
 (3) o gate do CI (npx tsx scripts/v2-verificar-release.ts) aceita o certificado.

INSUMOS EXIGIDOS PELO SCRIPT (leia o cabeçalho do próprio script antes):
 --canarios <resumo.json>  --lab-dir <dir com execucao.json, avaliacao-cega.json e
 relatorio.json>  --por "<nome>"  --commit <sha completo>
Antes de gerar canário novo, PROCURE os artefatos existentes em
C:/Users/Rodrigo Paiva/atelier-work (execução de 2026-07-21: 7 jobs canario_voz
done, 1 laboratorio_v2 done). Se existirem e forem válidos sob os contratos 1.0.0,
use-os e economize um ciclo. Se forem inválidos, diga POR QUE são inválidos antes
de descartar.

FRONTEIRAS (proibido):
- Emitir certificado com insumo fabricado, incompleto ou de commit diferente.
- Afrouxar qualquer verificação de estadoAtualRelease/criarCertificadoRelease para
  o certificado "sair". Se ele não sai, o motivo é o entregável.
- Sobrescrever um certificado existente (o script já recusa — não contorne).

FASES:
F1. Inventariar os insumos disponíveis (WORK_DIR + saída do PROMPT 4). DoD: lista.
F2. Rodar o laboratório cego se faltar. DoD: execucao.json + avaliacao-cega.json +
    relatorio.json com hashes.
F3. Emitir o certificado. DoD: arquivo gerado + conteúdo colado.
F4. Regenerar prontidão e rodar o gate do CI. DoD: RELEASE_PRODUCAO_CERTIFICADO.
F5. Commit + merge em master + deploy.

ORÇAMENTO E PARADA: 3 tentativas. Se o certificado recusar por divergência de
engine_version, hash ou contrato, PARE e relate a divergência exata — não a
"resolva" regravando artefato.

ANTI-FALSIFICAÇÃO: cole a saída literal do script de certificação e do
v2-verificar-release.ts. O estado formal impresso pela prontidão é a prova.

ENTREGA: RELATORIO-CERTIFICADO.md commitado.
```

---

## Ordem recomendada e custo

| Ordem | Prompt | Duração estimada | Custo de cota |
|---|---|---|---|
| 1 | PROMPT 1 — desencalhar | 1 sessão | ~zero |
| 2 | PROMPT 2 — prova literária | 1–2 sessões | ~zero (ProvedorMock) |
| 3 | PROMPT 3 — custo + REC-03 | 1 sessão | ~zero |
| 4 | PROMPT 4 — canário longo | vários dias de fila | **real, significativo** |
| 5 | PROMPT 5 — certificado | 1 sessão | baixo/médio (lab cego) |

Os três primeiros custam quase nada e transformam o quarto de "tentativa" em
"experimento medido". Rodar o canário longo antes deles é gastar cota sem
instrumento.
