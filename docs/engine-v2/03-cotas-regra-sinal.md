# Cotas: regra → sinal → cota (Engine V2)

**2026-07-28.** Fecha a fatia E ("cotas vivas"). Antes, metade das cotas era inerte:
`politica_metafora.cota_por_capitulo` e `politica_dialogo.piso_percentual` não existiam
em nenhum dos três contratos, e as regras `piso-densidade` e `muleta-coisa` não casavam
com sinal nenhum.

**Nenhuma linha desta tabela fica em branco sem justificativa escrita.** Há três estados
legítimos além de "cota ativa":

- **ausência justificada** — o contrato decide, com todas as letras, não ter cota ali.
  Não é cota morta: é política declarada.
- **emissão retida** — a regra existe, o detector existe, e a emissão está segurada por
  uma dependência externa nomeada. Uma cota retida em silêncio é pior que uma cota morta.
- **semântica sem número** — a regra guarda o comportamento; o número tem fonte única
  em outro campo.

---

## dan-brown 1.1.0 · faixa 1300–1700–2200

| regra | tipo | sinal medido | cota | estado |
|---|---|---|---|---|
| `fecho-concreto-gnomico` | cota | `gnomico` | máx 2/cap | ativa |
| `agente-humano-personificacao` | cota | `personificacao` | máx 2/cap | ativa |
| `uma-vez-sanfona` | cota | `sanfona` | máx 1/cap | ativa |
| `piso-declarativas` | cota | `declarativas_pct` | mín 50% | ativa |
| *(política)* `politica_metafora` | — | `metafora_elaborada` | **máx 6/cap** | **ativada nesta fatia** — "≈≤1 por página" × alvo 1700 palavras ≈ 6 páginas |
| *(política)* `politica_dialogo` | — | `dialogo_pct` | **mín 5%** | **ativado nesta fatia** — o contrato registra "3 capítulos com 0% de diálogo aprovados" como defeito; o piso existe para tornar o **zero** fora de cota, não para impor capítulo dialogado |
| *(faixa)* `faixa_palavras` | — | `palavras` | 1300–2200 | ativa |
| *(ritmo)* `ritmo.cadencia` (12 chaves) | — | `cadencia.*` | por chave | ativa |
| `fair-play-honesto`, `exposicao-dramatizada`, `corte-no-pico`, `relogio-avanca`, `fato-vs-dossie`, `sem-coincidencia`, `rotacao-de-fios`, `interioridade-funcional` | alvo_positivo | — | — | sem cota **por desenho**: alvo positivo entra no pacote como instrução, julgado pelo revisor |
| `narrador-invisivel` | proibicao | — | — | sem cota **por desenho** |

## hoover-mcfadden 1.1.0 · faixa 2000–2400–2800

| regra | tipo | sinal medido | cota | estado |
|---|---|---|---|---|
| `anti-gnomico-empilhado` | cota | `gnomico` | máx 2/cap | ativa |
| `anti-personificacao-abstracao` | cota | `personificacao` | máx 2/cap | ativa |
| `anti-sanfona` | cota | `sanfona` | máx 1/cap | ativa |
| `piso-densidade` | alvo_positivo | `palavras` | **número movido** para `faixa_palavras.min` = 2000 | **semântica sem número** — a regra guarda a isenção (abaixo); o número tem fonte única |
| *(faixa)* `faixa_palavras.isencao_piso` | — | `palavras` | piso dispensado | **ativada nesta fatia** — "o fio-M é isento do piso". O fio-M é definido pelo próprio contrato como o fio de memória **em itálico**, então a condição é medível (`fracaoItalico > 0.5`). Vocabulário fechado, sem condicional por skill no núcleo |
| *(política)* `politica_dialogo` | — | `dialogo_pct` | **sem piso** | **ausência justificada** — "sem piso de diálogo nem de declarativas (lição CR4); densidade de sentimento é a voz; o evento é cobrado pela régua de interioridade-sem-evento, nunca como 'pouca declarativa'" |
| *(política)* `politica_metafora` | — | `metafora_elaborada` | **sem cota** | **ausência justificada** — "metáfora sentimental isolada é feature; o defeito é a CADEIA de 2+ em poucas linhas", medida por sanfona/cadência |
| *(ritmo)* `ritmo.cadencia` (12 chaves) | — | `cadencia.*` | por chave | ativa — teto largo (fragEnfase 20, colados 8): a régua invertida do dan-brown |
| `primeira-pessoa-presente`, `interioridade-e-feature`, `relogio-move`, `pista-antes-do-pagamento`, `narradora-fair-play`, `gancho-varia`, `custo-emocional-aterrissado` | alvo_positivo | — | — | sem cota **por desenho** |

**`pov.rotacao` ausente** neste contrato: narradora única em 1ª pessoa. O gate de rotação
é no-op aqui — correto, não esquecido.

## romantasy 1.1.0 · faixa 2000–2700–3200

| regra | tipo | sinal medido | cota | estado |
|---|---|---|---|---|
| `anti-gnomico` | cota | `gnomico` | máx 2/cap | ativa |
| `anti-personificacao` | cota | `personificacao` | máx 2/cap | ativa |
| `anti-sanfona` | cota | `sanfona` | máx 1/cap | ativa |
| `piso-densidade` | alvo_positivo · `sem_excecao: true` | `palavras` | **número movido** para `faixa_palavras.min` = 2000 | **semântica sem número** — "abaixo do piso é reprovação, não 'ou justificado'": `conferirParecer` REBAIXA `excecao_valida` a violação, e o pipeline gera correção dirigida para o rebaixado |
| **`muleta-coisa`** | cota | **`muleta_coisa`** | máx 1/cap | **⚠ EMISSÃO RETIDA** — ver abaixo |
| *(política)* `politica_dialogo` | — | `dialogo_pct` | **mín 10%** | **ativado nesta fatia** — "a química nasce de cena e diálogo, não de declaração" |
| *(política)* `politica_metafora` | — | `metafora_elaborada` | **sem cota** | **ausência justificada** — o defeito declarado é a **cadeia** ("sem cadeia de metáforas"), medida por sanfona/cadência, não uma contagem por capítulo |
| *(ritmo)* `ritmo.cadencia` (12 chaves) | — | `cadencia.*` | por chave | ativa |
| `pov-alterna-com-informacao`, `slow-burn-por-merito`, `custo-de-magia-escala`, `gancho-cruel`, `frase-soco`, `fair-play-duplo`, `fundacao-dois-arcos`, `arco-avanca` | alvo_positivo | — | — | sem cota **por desenho** |

---

## ⚠ `muleta_coisa` — declarada, detector pronto, emissão retida

**Estado:** a cota existe no contrato (`max: 1, por: capitulo`). O detector existe e está
testado (`ocorrenciasMuletaGenerica`, em `sinais.ts`, com ocorrências citáveis). A linha
de emissão em `medirSinais()` está **comentada e nomeada**, não ausente.

**Por que está retida.** Emitir o sinal faz `calibracao.ts:190` exigir um bloco de rótulos
`muleta_coisa` em cada uma das 4 amostras romantasy do corpus — 13 ocorrências que pedem
julgamento humano *legítima × tique*. `worker/calibration/` está fora do escopo da tarefa
que criou esta tabela.

**Por que não vale forçar** (decisão do autor, 2026-07-28): os 14 arquivos de
`worker/calibration/v1/labels/` carregam `PRÉ-RÓTULO AUTOMÁTICO` e **nenhum** foi revisado
por humano — o corpus já não valida nada hoje, e é justamente essa dívida que bloqueia o
certificado de release. Um 15º bloco de pré-rótulos não desbloquearia certificação
nenhuma; só aprofundaria a dívida. Julgamento fabricado num corpus que não certifica nada
é custo sem retorno.

**Alcance da retenção:** o sinal só existiria para contratos que declaram a regra — apenas
romantasy. dan-brown e hoover têm o conjunto de sinais inalterado.

**Como sair da retenção**, quando o corpus for revisado por humano:
1. rotular as 4 amostras romantasy (as 13 ocorrências de `coisa`/`coisas`/`algo`);
2. descomentar a emissão em `medirSinais()` (o bloco marcado nomeia esta seção);
3. `npx vitest run worker/src/v2/calibracao.test.ts` volta a passar.

O teste `cotas-vivas.test.ts` fixa a retenção: se alguém ligar a emissão sem rotular o
corpus, o teste que afirma "nenhum contrato emite o sinal" falha e obriga a passar por aqui.
