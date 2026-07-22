# Investigação — discrepância do detector de sanfona na voz hoover (2026-07-21)

**Pergunta (adendo do autor):** por que `contarSanfona` mede 13/10/4 nos capítulos do
bench-hoover que o benchmark de 2026-07-18 aprovou com "sanfona 1–2"?

**Método:** varredura determinística do cap-01 aprovado (sha 934039ab6617) expondo TODAS
as ocorrências e o critério interno que disparou cada uma
(`worker/scripts/.tmp/investigar-sanfona2.ts`), seguida de julgamento semântico
ocorrência a ocorrência.

## Resultado

11 ocorrências expostas (o detector oficial conta 13; a diferença vem de aproximações de
segmentação de frase na varredura — mesma ordem de grandeza). Todas dispararam pelo
critério **aposto-denso** (≥3 vírgulas ou ≥2 travessões + ≥18 palavras + negação/cópula),
nenhuma por escada-de-que ou negação-reformulada. Julgamento:

| # | ocorrência (início) | julgamento |
|---|---|---|
| 1 | "Umas doze, treze lajes de pedra clara, dispostas em duas fileiras…" | falso positivo — descrição espacial concreta |
| 2 | "Cada laje tem, à cabeceira, um pé vivo enraizado…" | falso positivo — descrição concreta |
| 3 | "É um velho, magro, de calça amarrada com barbante e mãos que são só osso…" | falso positivo — retrato por acúmulo concreto (eco leve "mãos… mãos") |
| 4 | "…autoridade que não vem de posse — vem de saber —…" | fronteira — 1 antítese-reformulação funcional |
| 5 | "Não pisada, não murcha — arrancada de raiz, o torrão inteiro…" | fronteira/feature — gradação intencional (clímax de imagem) |
| 6 | "Um pedaço de oleado escuro… dobrado sobre um volume e amarrado com barbante — barbante novo" | falso positivo — descrição concreta |
| 7 | "Hesito com a mão no ar, um segundo, dois, e depois…" | falso positivo — cadência temporal concreta |
| 8 | "Envelopes amarelados, amarrados de novo por uma fita que já foi de cetim…" | falso positivo — descrição sensorial |
| 9–11 | "Nunca vi carta…, nunca vi bilhete…, nada — nada…" e acúmulos emocionais em 1ª pessoa | feature — anáfora/gradação da narradora confessional, explicitamente preservada pelo benchmark do autor ("interioridade e calor preservados") |

**Conclusão:** precisão do detector na voz hoover ≈ 0–15% (0–2 sanfonas genuínas em 13
contadas). O critério aposto-denso captura majoritariamente descrição concreta por
acúmulo e gradação emocional — features validadas da voz. A régua do benchmark de 18/07
julgava semanticamente (por isso "1–2"); o detector conta padrões sintáticos.

**Implicação operacional (já aplicada):** o número do detector NUNCA confirma violação
sozinho. `tarefaRevisor` exige, para `violacao_confirmada` em sinais de contagem, citação
literal de cada ocorrência julgada real; ocorrência não citada = falso positivo. A régua
(contratos 1.0.0) está CONGELADA — recalibração só por processo separado com corpus
rotulado, precisão/recall e holdout, ou decisão explícita do autor.

**Status da calibração 1.1.0:** REJEITADA (auditoria externa): cota = máximo de n=3
amostras neutraliza o detector (sanfona 1→18) sem rotular violação real vs falso
positivo. O relatório `calibracao-cotas-1.1.0.md` permanece como registro histórico da
medição; os contratos ativos voltaram a 1.0.0.
