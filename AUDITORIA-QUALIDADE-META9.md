# Auditoria — por que um livro com meta 9.0 termina em 7.3

Você pediu: se o sistema conhece os critérios do 9, por que não age para alcançá-lo? Abri os mecanismos (worker `jobs.ts`, skill `livro-do-zero-ao-epub`, `book-bestseller-review`, `arquiteto-de-enredo`). Resumo: **o sistema já tenta chegar ao 9 — mas para antes, revisa de forma que tem teto, e o avaliador é honesto de propósito.** Nenhum dos três é "bug"; juntos explicam o 7.3.

## Como a máquina realmente funciona
O fluxo é: **fundação** (`arquiteto-de-enredo`) → **escrita** capítulo a capítulo (runner em Python, `--model opus`) → **avaliação** independente (`book-bestseller-review`, gera nota + lista de pontos fracos) → **reescrita** dos pontos fracos → **re-avalia**. O runner roda com `--meta 9.0 --max-reescritas 4`. Ou seja: existe, sim, um laço escrever→avaliar→reescrever mirando 9.

## Por que para em 7.3 — três causas reais

**1. A condição de parada é o teto de iterações, não a meta.**
O laço para em **`max-reescritas = 4`** ou em **"estagnação real"** — *não* em "atingiu 9". Um livro que platôa em 7.3 depois de 4 passadas é aceito como "concluído" **abaixo da meta**. A meta 9.0 é um *alvo*, mas o *gatilho de parada* é o limite de passadas. Foi exatamente o que aconteceu.

**2. A reescrita é cirúrgica — e cirurgia não levanta "teto distribuído".**
A revisão "reescreve SÓ os pontos fracos do último relatório". Isso conserta defeitos localizados, mas o próprio relatório diz que **não há buraco estrutural; há um teto de 7 distribuído** por quase todas as dimensões. Remendo pontual sobe a dimensão remendada; as outras ficam. Revisão cirúrgica **converge para um platô**, não para o 9. Para sair de um 7-em-tudo você precisa de **passadas que levantam dimensões inteiras** (uma passada só de prosa, uma só de coerência, uma só de gancho), não só de tapar os itens citados.

**3. O avaliador é honesto de propósito — e isso é uma qualidade, não um defeito.**
O `book-bestseller-review` tem um "contrato de honestidade" explícito: **não infla a nota para bater a meta**, e uma única dimensão abaixo de 7 derruba o veredito por mais alta que seja a média. Todo o pipeline foi construído **"à prova de trapaça"** — a própria skill cita um caso real anterior de um "livro 8,58 / 70k palavras" que no disco eram 22k. Ou seja: o 7.3 é **medição honesta de ofício**, não má vontade. Se o sistema "simplesmente desse 9", você teria o pior dos mundos — um número falso sobre um livro que não é 9.

## A verdade desconfortável (mas importante)
"Conhecer os critérios do 9" **não é** "executar ofício nível 9 em 4 passadas cirúrgicas". Um 9 num avaliador rigoroso é **raro e caro até para best-sellers humanos** — exige prosa sem maneirismo, coerência sem furo, ameaça encarnada desde a página 1. O sistema diagnostica isso muito bem (achou o furo do relógio jurídico, **contou 43 maneirismos**, achou o BOM nos caps 15/19) — o que falta é **transformar diagnóstico em ofício**, repetidas vezes, sem mentir a nota. O caminho certo é **subir o teto real**, não fazer o avaliador piscar.

## Melhorias propostas (do mais alto impacto ao menor)

1. **Parar pela meta, não pelo teto de passadas.** Continuar iterando enquanto `nota < meta` **e** ainda houver ganho real (Δnota ≥ ε). Tornar `max-reescritas` adaptativo (com a auto-retomada do Max, mais passadas não custam tempo seu). Só aceitar abaixo da meta em **estagnação genuína** — e, aí, reportar com honestidade, não fingir.

2. **Passadas que levantam dimensões inteiras, não só os pontos citados.** Converter a lista priorizada do review em **passes temáticos** sobre o livro todo: uma passada só anti-maneirismo, uma só de coerência (o relógio jurídico), uma só de encarnar a ameaça/gancho. Iterar por dimensão até cada uma ≥ limiar. É isso que tira um livro do "7 em tudo".

3. **Portão de qualidade por capítulo, na hora de escrever (não só no fim).** Hoje só há piso de palavras e anti-linguiça. Adicionar um checklist de ofício por capítulo (orçamento de maneirismo, densidade de cena em 7 camadas, gancho, stakes encarnados) que **rejeita o capítulo** antes de aceitá-lo — pegar o teto na origem, não remendar 32 capítulos depois.

4. **Orçamento de maneirismo mecânico.** O review **conta** os tiques ("não era X. Era Z.", "clareza fria", "mar de chumbo"). Isso é automatizável: um linter que conta por livro e força revisão quando passa do orçamento — controlar durante a geração, não só diagnosticar depois.

5. **Fundação calibrada para "9-capaz".** A fundação desta obra já foi razoável (premissa 8, personagens 8) — o teto está na **execução**, não nela. Ainda assim, embutir no `perfil-de-voz` regras anti-maneirismo e de encarnação ajuda o escritor a nascer mais alto.

6. **Relatório de alcançabilidade honesto.** Quando platôa abaixo da meta, dizer a verdade: "chegou a 7.3 em N passadas; dimensões ainda < 8: prosa, coerência, gancho; teto autônomo estimado ~8.x; para 9, falta polimento humano em X/Y/Z" — em vez de aceitar em silêncio ou fingir.

## Recomendação
O ganho mais barato e mais honesto é o par **(1) parar pela meta** + **(2) passadas por dimensão**: juntos atacam o "teto distribuído" que segura a nota, sem reescrever o livro inteiro e sem tocar no avaliador. Em seguida, **(3) portão por capítulo** + **(4) orçamento de maneirismo** atacam o problema na origem, para os próximos livros já nascerem mais alto. O **(6)** garante que, quando o 9 autônomo não vier, você saiba exatamente o que falta — confiança em vez de número bonito.

Importante: mesmo com tudo isso, nem todo livro vai bater 9 sozinho — e tudo bem. O objetivo certo não é "9 sempre", é **subir o mais alto que o ofício honesto permite e te contar a verdade sobre o resto**.
