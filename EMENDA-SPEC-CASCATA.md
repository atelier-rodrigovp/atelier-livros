# Emenda à spec da Parte 6a — cascata de julgamento

**Status: SPEC APROVADA, com três emendas.** Aprovado como está: delta em vez de parecer novo, mesma validação da triagem, `pipeline.ts` como dono único do veredito, duas linhas em `engine_reviews` marcadas por passada, e os quatro casos negativos. A análise bimodal que fixou o limiar em 3 está aceita — zero casos na faixa 1–2 significa que qualquer corte em [3, …] é equivalente nesses dados, e a borda conservadora é a escolha certa.

## Emenda 1 — acrescente o gatilho (d)

**Escala quando a triagem está prestes a FECHAR o capítulo** — aprovando, ou esgotando o orçamento de correção. **Não** em toda iteração do laço: reprovado intermediário será corrigido de qualquer forma e não precisa da passada cara.

Razão. Os gatilhos (a), (b) e (c) são todos ancorados em sinal de detector. Os seis eixos do parecer — progressão dramática, aderência, clareza, efeito emocional, continuidade, gancho — não têm gatilho nenhum. É neles que mora o capítulo competente-mas-morto, a revelação reapresentada em paráfrase e a promessa não paga: nenhum detector vê isso, e hoje só o Sonnet julga.

E a assimetria decide qual erro perseguir: **um falso reprovado custa uma rodada de correção; um falso aprovado entra no livro.** O erro caro é o de aprovar, e é justamente o que não escalava.

Reconte a taxa de escalada com (d) e reporte. Ela pode chegar perto de 100%, e isso é aceitável pelo seu próprio argumento: a economia vem do delta, não da raridade.

## Emenda 2 — a decisão não derruba gate universal

`veredito_sugerido` é sugestão, não veredito. Contradição factual comprovada, POV violado, conhecimento indevido e o gate de idioma reprovam o capítulo **independentemente** do delta. Sem isso, o delta vira um caminho para anular o auditor.

Teste negativo obrigatório: delta sugerindo `aprovado` com contradição bloqueante presente → capítulo continua reprovado.

## Emenda 3 — `MODELO_POR_PAPEL` como conjunto fechado

A extensão está aprovada: sem ela a 6b não é implementável sem forçar o enum. Mas mapa de exceção é a fresta clássica por onde uma abstração de capacidade se dissolve — daqui a três meses tem exceção para tudo e a classe não significa mais nada.

Portanto: cada entrada com justificativa escrita, e **um teste que afirma o conjunto exato de exceções**, de modo que acrescentar uma quarta amanhã quebre o teste e obrigue quem acrescentou a defender. O mecanismo de congelamento e o erro em `V2_MODEL_*` divergente permanecem intactos.

---

Implemente 6a, commite, e siga para 6b.
