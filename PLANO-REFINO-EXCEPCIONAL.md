# Plano de refino — empurrar o teto da fundação de "competente" (7–8) para "excepcional" (8–9)

Auditoria das skills de fundação (`arquiteto-de-enredo`) e do laço, mirando as qualidades de 9–10 (voz inconfundível, revelação inevitável-e-surpreendente, tema fundido, imagem-assinatura, risco emocional). Tudo vive em `~/.claude/skills/` (fora do repo — editável na máquina, **não versiona**; salvar patch no repo para durar).

## Achado central (no código do portão)
`arquiteto-de-enredo` Fase 1.5 — "Princípio do piso: **qualquer dimensão maior < 6 → NÃO gere**". O portão é de **viabilidade** (não escrever fundação quebrada), não de **excelência**. Uma fundação "6–7 em tudo" passa e vira livro 7–8. **O teto é decidido na fundação, e o gate mira 6.** Por isso o platô em 7.3 é estrutural — anterior ao laço de reescrita. Refinar o gate é a maior alavancagem para 9.

## 1) Portão em DOIS níveis (viabilidade + ambição)
- **Mantém** o gate de viabilidade (`< 6` → não gera). Não escrever fundação quebrada.
- **Adiciona** um gate de **ambição** nas dimensões que fixam o teto (Premissa, Estrutura/Revelação, Personagens, Voz, Tema): exigir **≥ 8**. Abaixo de 8, NÃO aprovar em silêncio — **devolver ao bloco** para fortalecer, OU registrar honestamente no Diagnóstico de Fundação: "fundação competente, não excepcional — teto estimado ~8". Assim a **meta 9 do projeto se conecta à fundação**, não só ao laço.

## 2) Pontuar explicitamente as qualidades de 9 (que o Scorecard hoje não mede)
O Scorecard atual mede competência (e a auditoria adversarial caça defeitos: arrastado, twist sem fair-play, voz genérica). Falta **medir presença de excelência**. Adicionar como dimensões do portão, cada uma com piso de ambição:
- **Arquitetura de revelação / rereadability** — cada virada mapeada a (plante) + (o que ressignifica no retrovisor). Um livro 9 relê diferente; isso se projeta na fundação, não se descobre depois.
- **Fio temático único** — UMA pergunta humana que **toda** batida da Estrutura complica (não só uma premissa boa). Gate rejeita beat que não toca o tema.
- **Imagem/metáfora-mestra** — uma imagem de controle definida na Bíblia e rastreada para recorrer com sentido (não decoração). Já existe "imagem de abertura" no Bloco; elevar a *controlling image* do livro inteiro.
- **Custo irreversível** — cada ato tem um beat que custa ao protagonista algo que não se recupera (risco emocional que aterrissa, não melodrama).
- **Voz: assinatura positiva** — ver item 3.

## 3) `perfil-de-voz.md`: de "regras de evitar" para SPEC de assinatura positiva
Hoje a defesa de voz é negativa (a auditoria caça "voz genérica" ≈ piso 6–7). Voz de 9 é **inconfundível**, e isso se prescreve:
- Seção **"Assinatura positiva"**: hábitos sintáticos específicos, léxico controlado, um modo de *ver* (não só cadência/anti-maneirismo).
- **2–3 parágrafos-modelo** que o `livro-escritor` imita como alvo (emular técnica, nunca copiar obra protegida).
- **Diferenciação real por autor** (Mia ≠ Aria ≠ Iago ≠ Lena) — cada perfil com digital própria, não um molde comum.
- O gate passa a pontuar **distinção** ("você reconheceria de olhos vendados?"), não só ausência de generalidade.

## 4) No laço (runner/worker): passe de ELEVAÇÃO + best-of-N
Remoção de defeito converge a 8; para 9 precisa de objetivo de elevação (distinto):
- **Passe de elevação** por capítulo/cena: "qual o movimento mais ousado que tornaria isto inesquecível?" — e faz. Separado do passe de defeito.
- **Best-of-N nos picos** (abertura, clímax, revelações): gerar N drafts distintos e o crítico **seleciona/funde** o melhor. Diversidade + seleção alcança picos que refino linear não alcança. (Custa mais Max — usar com a auto-retomada.)
- (Já feito na fatia do worker: passadas por dimensão + linter de maneirismo + alcançabilidade. Estes elevam o piso; os de cima elevam o teto.)

## 5) Crítico em modo "excepcional"
`book-bestseller-review` mede prontidão (pisos). Adicionar um segundo olhar que critica contra as qualidades de 9 (distinção de voz, rereadability, fusão temática, imagem-assinatura, custo) e devolve **alvos de elevação** — para o laço ter um alvo de "excepcional", não só de "sem defeito". **Sem inflar nota** (a honestidade fica intacta; muda o que ele *pede*, não o que ele *assina*).

## Prioridade (do maior retorno ao menor)
1. **Gate de ambição na fundação (≥8) + dimensões de excelência** — fixa o teto antes de escrever. Maior alavancagem.
2. **`perfil-de-voz` como assinatura positiva, por autor** — a voz é metade do salto 8→9.
3. **Passe de elevação + best-of-N nos picos** — onde o pico de fato nasce.
4. **Crítico em modo excepcional** — dá ao laço um alvo de 9.

## Verdade honesta (sem expectativa falsa)
Isto sobe o teto autônomo de forma real — de ~7.3 para 8 sólido, com chance verdadeira de 9 nas dimensões alcançáveis. Mas a última milha do 9 (visão original, o que vem de um humano ter algo a dizer) é onde a **sua autoria** decide. O sistema te leva muito mais perto; não substitui essa milha. E mais passes/best-of-N custam mais geração no Max — há curva de custo.

## Implementação
Tudo aqui é **skill** (fora do git): `arquiteto-de-enredo/SKILL.md` (gate + Scorecard + perfil-de-voz template) e o runner/`livro-do-zero-ao-epub` (passe de elevação, best-of-N) + um modo no `book-bestseller-review`. Quando for implementar, **salvar os patches em `worker/skill-patches/` no repo** com passo de reinstalação — senão evapora no próximo install. Sugiro fazer em fatias, começando pelo gate de ambição (item 1), e testar numa fundação nova antes de propagar.
