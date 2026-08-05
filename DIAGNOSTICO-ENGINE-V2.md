# Diagnóstico da Engine V2 — o que ela não faz
**2026-07-28** · Auditoria papel por papel, com evidência em código

## A raiz: a engine escreve às cegas

Cada papel é uma chamada isolada, sem histórico. Só existe o que entra no pacote. Isto é o que cada um vê do passado do livro ao trabalhar no capítulo N:

| papel | capítulos anteriores que enxerga |
|---|---|
| arquiteto de cena | **nenhum** |
| contextualizador | **nenhum** |
| escritor | **3 parágrafos finais do capítulo N−1** |
| revisor literário | **nenhum** |
| auditor factual | **nenhum** |

O detalhe que fecha o diagnóstico: o contextualizador é instruído a listar "fatos estabelecidos, com origem (documento/capítulo)" e "repetições recentes que o escritor não deve repetir" (`tarefas.ts:26-29`) — **sem receber um único capítulo**. Ele não tem de onde tirar isso. O mecanismo anti-repetição da engine é inventado a cada capítulo.

E nada do que é gravado volta: fichas, pareceres e avaliações são persistidos e nunca relidos durante a escrita. O único cross-capítulo que existe é o gate de repetição quase-literal — que só roda contra N−1 e só pega texto quase idêntico. A mesma revelação parafraseada dez capítulos depois passa.

## A fundação é rasa demais para governar 40 capítulos

Cerca de 3.000 palavras de fundação para ~100.000 palavras de livro. Uma linha de **até 25 palavras** por capítulo é tudo o que o arquiteto de cena recebe para planejar o capítulo 20.

- `promessa_editorial` é gravada em `estrutura.json` e **nunca relida por ninguém** (`fundacao.ts:134`; `integracao.ts:339-343` só extrai `estrutura`).
- `fios` é uma lista de **nomes**. Sem capítulo de abertura, de clímax ou de fechamento.
- Arco de personagem é uma string de 25 palavras. Sem marcos por capítulo.
- Pontos de virada e escalada não existem no schema.
- Os documentos que os contratos exigem (`dossie-factual.md`, `matriz-de-relogios.md`, `regras-da-narradora.md`) **a fundação não gera** — a leitura falha e o erro é engolido num `catch` (`integracao.ts:298-306`).

## Não existe portão de qualidade da fundação

A V1 tem `fundacao-gate.ts` com oito critérios. A V2 não importa esse arquivo em lugar nenhum. A validação da V2 é de formato: bíblia com mais de 200 caracteres, ao menos um personagem, `estrutura.length >= 1`. **A estrutura pode vir com 12 capítulos num livro de 40 e passa.**

Também morreu o mecanismo que invalidava capítulos quando a fundação mudava: `DOCUMENTO_SUBSTITUIDO` existe em `compilador.ts:109-118`, mas os campos que o disparam nunca são preenchidos.

## Metade das cotas está inerte

- `politica_metafora.cota_por_capitulo` e `politica_dialogo.piso_percentual` são **nulos nos três contratos**. Metáfora e diálogo, portanto, **nunca ficam fora de cota** — enquanto o próprio contrato do dan-brown registra "3 capítulos com 0% de diálogo aprovados" como defeito conhecido.
- As regras `piso-densidade` e `muleta-coisa` não casam com nenhum sinal medido: cotas silenciosamente mortas.
- `pov.rotacao` (`max_caps_mesmo_fio`, `max_caps_fio_ausente`) é validado no schema e **nunca aplicado**.
- `fios_ausentes` não tem um único consumidor.

## O que ninguém verifica em lugar nenhum

Repetição de informação já revelada (parafraseada) · promessa plantada e nunca paga · personagem que desaparece · linha do tempo inconsistente · subtrama abandonada · escalada de tensão que não escala · clímax sem preparação · coincidência resolvendo a trama · arco que não fecha.

Nenhum desses tem detector. Alguns existem como palavra em prompt; o resto não existe.

## Reescrever quebra a continuidade

- A meta-9 reescreve capítulos **sem passar os anteriores** (`meta9.ts:728-732`): o gate de repetição nem chega a rodar, e os capítulos seguintes não são reavaliados. A decisão de manter ou reverter é por **nota agregada**, nunca por continuidade.
- A edição estrutural **só renomeia arquivos** (`estrutural.ts:316-319`). A prosa não é tocada: o título `## Capítulo N` antigo permanece, e os vizinhos — escritos consumindo o gancho do antigo N−1 — não são reescritos nem revalidados.

## A meta-9 é julgamento livre

Dez dimensões de 1 a 10, decididas pelo modelo, **sem um único detector ou contagem**. O contraste está no revisor de capítulo, que tem cross-check justamente porque ninguém confia no julgamento solto — a avaliação do livro inteiro não tem nada disso.

---

## O que precisa existir

O autor descreveu a solução corretamente: **uma especificação de capítulo que carregue a história do que já foi contado.** Em concreto:

1. **Ledger de revelações** — o que foi revelado ao leitor, por capítulo; entregue ao arquiteto de cena e ao revisor; gate que barra `informacao_nova` já presente no ledger.
2. **Promessas como objetos** — `{id, plantada_em, reforçada_em[], paga_em}`, validadas (toda promessa paga antes do fim; plantio antes do pagamento) e injetadas no planejamento de cada capítulo.
3. **Fios como objetos** — `{id, abre, escalada[], clímax, fecha}` em vez de nomes soltos, com a rotação do contrato finalmente aplicada.
4. **Arco de personagem em marcos por capítulo**, no lugar da string de 25 palavras.
5. **Grade de atos** com tensão-alvo, cobrindo 1..N.
6. **Ficha de capítulo ampliada**: função no ato, promessas tocadas, revelação, marcos de arco, tensão alvo, e o que ainda não pode acontecer.
7. **Portão de qualidade da fundação**, portando os oito critérios da V1 — começando pelo mais barato e mais grave: a estrutura tem exatamente N capítulos, numerados 1..N, sem furo nem duplicata.
8. **Fundação em duas passadas** — macro (atos, promessas, fios, revelações) validada antes da micro (linha por capítulo). Hoje tudo sai de uma geração única, o que força o modelo a ser raso justamente no arco.
9. **Ativar as cotas mortas** — preencher `cota_por_capitulo` e `piso_percentual` nos três contratos e casar as regras órfãs com sinais reais.
10. **Reescrita com continuidade** — meta-9 e edição estrutural passam a receber e revalidar a vizinhança.
