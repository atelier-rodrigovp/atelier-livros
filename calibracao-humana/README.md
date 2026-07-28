# Rotulagem humana — 14 amostras, uma rodada

Este é o único item que só você pode fechar. Enquanto ele não fechar, o
`prontidao` mantém `ACURACIA_AGUARDANDO_ROTULAGEM` e
`RELEASE_PRODUCAO_BLOQUEADO`. Nenhum atalho de código muda isso.

**Arquivo:** `rotulos-pendentes.csv` — 14 amostras, 596 ocorrências, 182
atestações. Separador `;`, UTF-8 com BOM (abre direto no Excel).

| skill | amostras |
|---|---|
| dan-brown | 4 |
| hoover-mcfadden | 6 |
| romantasy | 4 |

## O que responder

Cada linha é **uma ocorrência que um detector marcou**. Você julga se o detector
acertou. São só duas colunas para preencher:

**`rotulo`** — escolha uma:

- `legitima` — o detector acusou, mas o texto está certo. É voz do autor,
  diálogo, citação, uso deliberado. **Isto é um falso positivo do detector.**
- `maneirismo` — o detector acertou. O trecho é ornamento, muleta ou tique.
- `duvidosa` — você não decidiria nem num sentido nem no outro. Use com
  parcimônia: `duvidosa` demais não calibra nada.

**`justificativa`** — uma frase sua dizendo **por quê**. O texto
`SUBSTITUIR POR JUSTIFICATIVA HUMANA ESPECÍFICA` que já está lá é um marcador:
o importador recusa o arquivo inteiro enquanto qualquer linha continuar com ele.
Isso é de propósito — planilha devolvida sem leitura não vale como rotulagem.

Não altere nenhuma outra coluna. `amostra_id`, `texto_sha256`, `sinal`,
`indice_detector` e `trecho` são a identidade da ocorrência; mexer nelas faz o
importador recusar o pacote.

## Como devolver

```bash
cd worker

# 1. Confere sem gravar nada (rode primeiro, sempre)
npx tsx scripts/v2-rotulos-humanos.ts --import ../calibracao-humana/rotulos-pendentes.csv --revisor "Seu Nome"

# 2. Só depois de passar limpo, aplica
npx tsx scripts/v2-rotulos-humanos.ts --import ../calibracao-humana/rotulos-pendentes.csv --revisor "Seu Nome" --apply
```

## O que o importador recusa

Não são avisos — cada um aborta o pacote inteiro:

- amostra removida da planilha;
- identidade alterada (`amostra_id`, hash, sinal, índice);
- ocorrência omitida;
- falsa negativa inventada (ocorrência que o detector não mediu);
- rótulo fora do vocabulário;
- justificativa ausente, genérica ou ainda com o marcador;
- amostra já validada sendo sobrescrita;
- atestação persistida adulterada.

O manifesto só é promovido **depois** que tudo passa — nunca no meio. As provas
dessas recusas estão em `worker/src/v2/rotulagem-csv.test.ts`.

## Por que isso destrava mais do que a acurácia

A limitação de recall REC-03 (`worker/src/limitacoes-conhecidas.ts`) está em
aberto justamente por falta deste corpus: afrouxar o detector sem amostra
rotulada troca falso negativo por falso positivo, e falso positivo em gate duro
reprova capítulo bom. Sua rotulagem é o que permite calibrar o limiar com
contraprova em vez de palpite.
