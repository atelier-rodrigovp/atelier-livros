# Verificação — tudo o que combinamos nesta conversa
**2026-07-28** · Conferido contra o código em `master` e o banco de produção

## Implementado e verificado

| O que combinamos | Estado | Prova |
|---|---|---|
| Detecção estruturada de 429 + teto de falhas por infra | ✅ | regex em `limite-max.ts` cobre `api_error_status:429`, `rate_limit_error`, HTTP 429 |
| Pins de modelo fixos (Opus 5 escritor) | ✅ | `engine_runs`: escritor = `claude-opus-5` em 100% dos runs |
| Alias legado (`MODEL=opus`) não derruba o boot | ✅ | `modeloFixo()` em `lib.ts` |
| Consolidação em `master`, 6 worktrees removidos | ✅ | `git worktree list` = 1 linha |
| Idioma como dado de 1ª classe + precedência | ✅ | `briefing.ts:57-63`; campo no wizard; projeto EN produziu cena nativa |
| V2 grava em `chapters` | ✅ | `capitulos-db.ts`; O Farol Cego tem 2 capítulos publicados |
| Camadas 3 e 7 do compilador vivas | ✅ | `preferencias:` em `integracao.ts:721`, `meta9.ts:536`, `pipeline.ts:245` |
| `engine_mode` visível na interface | ✅ | `Projeto.tsx:473-476`; `livro_runner.py` só no ramo V1 |
| `revisar` e `refinar_fundacao` roteados para V2 | ✅ | `TIPOS_V2` |
| **Ledger de revelações** | ✅ | `ledger.ts`; gate `revelacao_repetida`; reconstrução para livros antigos (`integracao.ts:297-308`) |
| O ledger chega a quem decide | ✅ | seção no pacote do arquiteto de cena (`tarefas.ts:20`), do contextualizador (`:51`) e do revisor (`:146`) |
| O contextualizador parou de inventar | ✅ | regra de procedência dura: todo item tem de citar seção e capítulo (`tarefas.ts:52`) |
| **Arco verificável** (atos, promessas, fios, arcos) | ✅ | `arco.ts`; gates `promessa_nao_paga` e `rotacao_pov_violada` |
| Rotação de POV finalmente aplicada | ✅ | `arco.ts:371-435` lê `max_caps_mesmo_fio` / `max_caps_fio_ausente` |
| **Portão de qualidade da fundação** | ✅ | `portao-fundacao.ts`; gates `fundacao_estrutura_incoerente` e `fundacao_arco_incompleto` |
| Cotas vivas | ⚠️ parcial | tabela regra→sinal→cota em `docs/engine-v2/03-cotas-regra-sinal.md`; `muleta_coisa` retido por decisão sua |
| Continuidade na reescrita | ✅ | `meta9.ts:122-149` passa **todos** os capítulos anteriores |
| Compatibilidade com livros antigos | ✅ | fundação v2 continua rodando; gates de arco viram no-op com aviso |

Regressão: 928 testes passando (linha de base era 833), typecheck limpo.

## Em curso agora

`escrever_livro` **running** desde 08:58 — *O Farol Cego*, **capítulo 3 de 12**, skill dan-brown, com o ledger ativo. É a prova que decide.

## Não implementado — e por quê

| Pendência | Impacto | Motivo |
|---|---|---|
| **Autorização por projeto** (allowlist ainda é lista de UUIDs em código) | **Você não consegue rodar um livro seu** sem editar `release.ts` | Ficou fora do prompt do ciclo; é o `PROMPT-IDIOMA-E-DESTRAVAR-V2.md` que nunca rodou |
| **Gate de idioma/variante** | Se uma premissa ambientada em Portugal puxar pt-PT, ninguém pega | Mesmo prompt não rodado |
| Push dos 4 commits novos | CI não rodou neles | Fatias B–F ainda não foram enviadas |
| `avaliar` ainda é caminho V1 | Botão "Avaliar" não funciona em livro V2 | Fora do escopo das fatias |
| Worker na tarefa do agendador | Some no próximo reboot | Rodando por `Start-Process` |
| Corpus de calibração 100% pré-rotulado por máquina | Nenhum certificado de release é possível | 596 ocorrências aguardam julgamento humano seu |

## Resposta à pergunta

**A máquina existe e está ligada.** Os quatro defeitos estruturais que a auditoria encontrou — engine sem memória, fundação sem portão, cotas inertes, reescrita sem continuidade — foram corrigidos, e eu conferi a fiação, não só a existência dos arquivos.

**Ela está escrevendo um livro agora**, capítulo 3 de 12, e é a primeira vez que faz isso com memória do que já contou.

**O que ainda não é seu**: enquanto a allowlist for código, a plataforma escreve livros de teste, não os seus. Isso é uma rodada curta, não um mês.

**O que ainda não está provado**: se a prosa aguenta doze capítulos sem repetir. Isso ninguém responde por análise — só lendo o que sair.
