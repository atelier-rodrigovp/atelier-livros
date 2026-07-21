# Calibração de cotas — contratos 1.1.0 (2026-07-21) — **REJEITADA**

> **DECISÃO (auditoria externa validada pelo autor, 2026-07-21):** esta calibração foi
> REJEITADA e os contratos ativos voltaram a **1.0.0**. Motivo: cota = máximo observado de
> n=3 amostras NEUTRALIZA o detector (sanfona 1→18) sem rotular ocorrência a ocorrência o
> que é violação real vs falso positivo. A régua está CONGELADA; recalibração só por
> processo separado (corpus reproduzível e versionado, ocorrências rotuladas,
> precisão/recall do detector, holdout) ou decisão explícita do autor. Regra interina: o
> número do detector nunca confirma violação sozinho — ver
> `investigacao-sanfona-hoover.md`. Este documento permanece como registro histórico da
> medição (os números medidos continuam válidos como dados).

**Problema (defeito nº 4 da auditoria de fechamento):** as cotas 1.0.0 eram idênticas nas
três skills (`sanfona max 1`, `gnômico max 2`) — a régua do dan-brown aplicada à voz
confessional do hoover e à romantasy, sem nenhuma derivação de corpus. Medido com os
detectores reais, **o próprio corpus aprovado pelo autor estourava as cotas 1.0.0 em todas
as skills**: a régua não discriminava aprovado de reprovado — reprovava tudo.

**Método:** `worker/scripts/v2-calibrar-cotas.ts` roda `medirSinais` (o mesmo caminho do
pipeline: `contarGnomico`, `contarPersonificacao`, `contarSanfona`,
`percentDeclarativasSimples`, `contarMetaforaElaborada`, `diagnosticarCadencia`) sobre o
corpus do manifest `worker/scripts/v2-calibracao-corpus.json`.
**Cota 1.1.0 = max(cota 1.0.0, máximo observado no corpus aprovado)** — percentil generoso
(com n=3, p90 = máximo), nunca abaixo do que o corpus aprovado mede, e nunca reduzindo cota
sem dado. Pisos: mantidos apenas quando ficam abaixo do mínimo aprovado. A normalização por
comprimento foi usada como verificação (registrada abaixo), não como extrapolação: cota em
contagem absoluta, sem especular além do medido.

## Corpus (origem de cada amostra)

| skill | grupo | amostra | palavras | sha256(12) | origem |
|---|---|---|---|---|---|
| dan-brown | aprovado | 53abdade cap-05 | 1864 | 94b727a5d7bb | benchmark A/B dan-brown 2026-07-18 (regenerado e aceito; HANDOFF-CORRECAO-ESTILO §3) |
| dan-brown | aprovado | 53abdade cap-37 | 2084 | 35f506e057fc | idem (pior baseline → aprovado 3/3) |
| dan-brown | aprovado | 53abdade cap-38 | 2291 | f556d452820e | idem (aceito) |
| dan-brown | contraste | canário V2 cap-01 | 1377 | 3ad3871ea03a | canário 2026-07-21 (reprovado) |
| hoover-mcfadden | aprovado | bench-hoover caps 01–03 | 2851/2841/2528 | 934039ab6617 / 6581e727f42e / ac8f1939536d | benchmark hoover 2026-07-18, PASSA 3/3 (HANDOFF §4) |
| hoover-mcfadden | contraste | baselines pré-correção + canário V2 | 2823/2979/2372 | 7d91ae4188e9 / 7b24acd64536 / 421bfdfe03d1 | reprovados na régua 2026-07-18; canário 2026-07-21 |
| romantasy | aprovado | piloto SPEC-RM3 caps 01–03 | 1147/1096/923 | 5b4312775809 / 1435b5c39350 / be449a5d1281 | AUDITORIA-HOOVER-ROMANTASY — julgados conformes à craft na página (única prosa romantasy avaliada positivamente) |
| romantasy | contraste | canário V2 cap-01 | 2833 | 28e9537613cb | canário 2026-07-21 (reprovado) |

Cópia estável do corpus romantasy: `C:\Users\Rodrigo Paiva\atelier-work\calibracao-v2-corpus\romantasy\`.

## Tabela corpus → cota

Valores por capítulo; "aprovado" lista as medições das amostras na ordem do manifest.

### dan-brown (faixa 1300–2200)

| sinal | aprovado | máx | cota 1.0.0 | **cota 1.1.0** | contraste (canário) |
|---|---|---|---|---|---|
| gnômico | 1, 1, 4 | 4 | 2 | **4** | 1 |
| personificação | 1, 3, 2 | 3 | 2 | **3** | 1 |
| sanfona | 3, 7, 18 | 18 | 1 | **18** ⚠ | 2 |
| declarativas % (piso) | 64,7 / 52,8 / 51,6 | mín 51,6 | ≥50 | **≥50** (mantido) | 57,8 |
| cadência: colados | 9, 5, 3 | 9 | 1 | **9** | 3 |
| cadência: clipeNeg | 2, 0, 3 | 3 | 1 | **3** | 0 |
| cadência: anáfora | 2, 2, 1 | 2 | 1 | **2** | 2 |
| cadência: fragEnfase | 13, 6, 15 | 15 | 2 | **15** | 1 |
| cadência: fragColados | 1, 0, 3 | 3 | 0 | **3** | 0 |
| cadência: itálico / retórica / epigrama | 2 / 2 / 0 | — | 3 / 2 / 1 | **mantidas** | 4 / 0 / 0 |

⚠ `contarSanfona` superconta apostos e enumerações concretas (spread 3–18 dentro do
aprovado). A cota 18 é teto anti-degeneração; o julgamento fino continua no revisor, que
recebe valor + exemplos flagrados e pode confirmar violação DENTRO da cota.

### hoover-mcfadden (faixa 2000–2800)

| sinal | aprovado | máx | cota 1.0.0 | **cota 1.1.0** | contraste (baselines; canário) |
|---|---|---|---|---|---|
| gnômico | 4, 3, 2 | 4 | 2 | **4** | 5, 4; 3 |
| personificação | 2, 4, 4 | 4 | 2 | **4** | 2, 1; 2 |
| sanfona | 13, 10, 4 | 13 | 1 | **13** | 16, 11; 9 |
| cadência: colados | 16, 4, 7 | 16 | 8 | **16** | 5, 5; 13 |
| cadência: clipeNeg | 5, 4, 1 | 5 | 3 | **5** | 3, 0; 0 |
| cadência: anáfora | 6, 5, 5 | 6 | 2 | **6** | 5, 1; 6 |
| cadência: fragEnfase | 24, 13, 11 | 24 | 20 | **24** | 19, 4; 12 |
| cadência: itálico | 6, 2, 10 | 10 | 3 | **10** | 3, 3; 3 |
| cadência: fragColados / retórica | 3 / 0 | — | 6 / 2 | **mantidas** | — |

Sem piso de declarativas nem teto de interioridade/metáfora (lição CR4 preservada).

### romantasy (faixa 2000–3200)

| sinal | aprovado | máx | cota 1.0.0 | **cota 1.1.0** | contraste (canário) |
|---|---|---|---|---|---|
| gnômico | 1, 3, 1 | 3 | 2 | **3** | 3 |
| personificação | 0, 1, 1 | 1 | 2 | **2** (mantida) | 0 |
| sanfona | 2, 4, 3 | 4 | 1 | **4** | 9 → ainda discrimina ✅ |
| muleta-coisa | (sem medição V2) | — | 1 | **1** (mantida) | — |
| cadência: colados | 2, 1, 1 | 2 | 1 | **2** | 1 |
| cadência: fragEnfase / fragColados / anáfora / itálico / retórica / clipeNeg | 5 / 1 / 2 / 3 / 2 / 1 | — | 6 / 1 / 2 / 3 / 2 / 1 | **mantidas** | 5 / 0 / 7 / 6 / 0 / 1 |

Ressalva: corpus romantasy tem ~metade do comprimento da faixa (923–1147 palavras) — cota
em contagem absoluta é conservadora para capítulos na faixa; excesso legítimo é disposto
pelo revisor como `excecao_valida` (mecanismo existente).

## Verificação de discriminação (a régua nova ainda pega o ruim?)

- romantasy: canário reprovado mede sanfona 9 > cota 4 ✅; itálico 6 e anáfora 7 acima das
  cotas de cadência ✅ (passam a valer com o conserto do casamento label→chave — defeito
  descoberto nesta calibração: `sinais.ts` comparava o rótulo humano do tique com as chaves
  do orçamento e nunca marcava cadência como fora da cota).
- hoover: baseline pré-correção cap-01 mede sanfona 16 > 13 ✅ e gnômico 5 > 4 ✅.
- dan-brown: a discriminação fica principalmente com o revisor (o canário reprovado mede
  ABAIXO do corpus aprovado na maioria dos sinais — o problema dele era outra coisa:
  auditor factual + correção morta, defeitos 1–3).
- Em nenhuma skill a cota nova reprova qualquer amostra do corpus aprovado (por construção).

## Versionamento

Os três contratos passam a `versao: "1.1.0"`, com `calibracao_1_1_0` por regra alterada e
bloco `calibracao` no topo. Rollback: reverter os `contrato.json` para o commit anterior
(1.0.0). A validação cega no Laboratório (1.0.0 vs 1.1.0) roda na fase de canários — mesma
janela de modelo — e seu resultado é registrado neste diretório.
