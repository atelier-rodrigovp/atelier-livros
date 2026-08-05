# Teto humano: de onde vêm os limiares de molde (Engine V2)

**2026-08-05.** Fecha a armadilha da rodada `529cdc8..34fc73b`, que fixou os limiares
de molde no **máximo do próprio acervo da engine** — teto tirado do que estava sendo
medido, o que garante zero marcação por construção. Os limiares deste documento vêm de
fora: prosa humana publicada, independente da engine.

---

## A frase que impede a repetição do erro

> Limiar derivado de prosa humana publicada, independente do acervo da engine;
> **NUNCA recalibrar contra capítulos gerados pela própria engine.**

E a segunda regra, descoberta nesta mesma rodada:

> **O teto é do PAR (detector, corpus). Trocou o detector, remede o corpus.**

O plano original mandava fixar o teto de antítese em **7**. Esse 7 foi medido no mesmo
corpus humano, mas com o detector ANTIGO, que enxergava 3 das 8 formas reais. Rodando o
detector antigo sobre a extração deste documento, ele reproduz o número do plano
(Hoover máx 7, McFadden máx 7) — prova de que o 7 é do detector velho, não do corpus.

O corpus foi remedido **duas vezes** nesta rodada, uma a cada aperto do detector:

| versão do detector | máximo humano |
|---|---|
| antigo (6 regex de superfície, recall 3/8) | 7 |
| novo, primeira volta (o eco valia em qualquer ponto da coda) | 11 |
| **novo, final** (eco tem de ABRIR a coda) | **8** |

A volta do meio mediu 11 porque o caminho do eco marcava anáfora e réplica de diálogo
como antítese. Isso foi descoberto olhando as 14 marcações do capítulo 1 do canário
97dd7390 uma a uma: 6 eram falsas. Apertado o eco, o mesmo capítulo dá 7 marcações,
todas antíteses de verdade — e o teto humano cai de 11 para 8.

**A lição operacional:** contagem alta não é prova de tique. Sem ler as marcações uma a
uma, um detector impreciso vira um teto inflado, e o teto inflado absolve o acervo.

---

## Procedência do corpus

Três romances publicados em português, um por autor de referência das skills:

| obra | palavras | janelas de 2.500 |
|---|---|---|
| Dan Brown — *O Código Da Vinci* | 149.754 | 60 |
| Colleen Hoover — *Talvez Agora* | 99.601 | 40 |
| Freida McFadden — *Nunca Minta* | 68.583 | 28 |
| **total** | **317.938** | **128** |

Extração: `pdftotext -enc UTF-8`. Janela de 2.500 palavras = tamanho de capítulo da
engine, para comparar escala com escala. Medido em **2026-08-05**.

**O corpus NÃO é versionado.** São arquivos pessoais do autor, protegidos por direito
autoral. Versionam-se os NÚMEROS e a procedência — nunca trecho, citação ou cópia.

---

## Os números (detector desta versão de `worker/src/maneirismo.ts`)

Por janela de 2.500 palavras:

| molde | Brown | Hoover | McFadden | **máximo humano** | `limiarCap` |
|---|---|---|---|---|---|
| antítese por negação | 4 | **8** | 5 | **8** | 8 |
| "do jeito que/de" | 0 | 0 | **3** | **3** | 3 |
| símile-andaime ("como se / como quando") | 3 | **6** | 5 | **6** | 6 |
| clichê recorrente | — | — | — | **2** | 2 |
| "coisa(s)" *(léxico, `MULETAS`)* | 8 | **20** | 14 | **20** | 20 (V1) |

Taxa por 10.000 palavras, livro inteiro — a escala do `orc10k`:

| molde | Brown | Hoover | McFadden | **máximo humano** | `orc10k` |
|---|---|---|---|---|---|
| antítese por negação | 4,2 | 9,1 | **9,6** | **9,6** | 10 |
| "do jeito que/de" | 0,0 | 0,0 | **0,7** | **0,7** | 1 |
| símile-andaime | 4,5 | **11,7** | 10,4 | **11,7** | 12 |
| "coisa(s)" | 17,2 | 24,6 | **29,3** | **29,3** | 30 |
| "algo" | 2,5 | **9,8** | 7,6 | **9,8** | 10 |

**Regra do limiar:** fora da cota é **ESTRITAMENTE ACIMA** do máximo observado. Em 318
mil palavras de três romances comerciais, nenhuma janela de 2.500 palavras passou desses
valores. Verificação: **0 das 128 janelas humanas** fica acima de 8 antíteses.

---

## Os dois alarmes falsos que a medição derrubou

| detector | teto antigo | o que o humano faz | veredito |
|---|---|---|---|
| `"coisa(s)"` | 1 por capítulo / 4 por 10k | mediana 5 por janela, **máximo 20**; 29,3/10k no livro | **alarme falso.** A engine (mediana 5, máximo 19) está DENTRO do humano. O teto reprovava prosa humana normal. Afrouxado para 20/cap e 30/10k. |
| `"como se / quando"` | `limiarCap` 15 | mediana 1–3, **máximo 6** | O 15 era produto da tautologia. A engine (mediana 2, máximo 4) usa **menos** que o humano. Corrigido para 6 — o número humano. |

---

## O detector: uma regex no lugar de seis

As seis regex de antítese que existiam até `34fc73b` casavam **superfícies** ("não era
X. Era Y.", "não havia X, havia Y"…). Contra as 8 formas reais do acervo do autor, viam
3. E, por serem seis, contavam a MESMA ocorrência mais de uma vez — toda contagem
downstream inflava.

Viraram **uma** (`RE_ANTITESE`), que reconhece a FORMA: nega-se um termo e o segmento
seguinte reafirma o mesmo lugar sintático em contraste. Quatro caminhos:

1. coda copular depois de separador forte (`.` `!` `?` `:` `;` `—`);
2. com vírgula, só quando a própria negação é copular ("não era um pedido, era uma ordem");
3. a coda ABRE ecoando uma palavra de conteúdo do trecho negado (≥5 letras) — "Não limpa de A. Limpa de B.". O eco tem de ser a PRIMEIRA palavra da coda, e o trecho entre a negação e ela não pode atravessar separador: sem essas duas exigências entram anáfora ("não branqueável —, avalio trocanter, avalio orelha") e réplica de diálogo ("Não bato porque ela se assusta. — Ela se assusta?");
4. negação elíptica com dois-pontos, uma palavra de cada lado — "Não emperrada: fechada.";
5. "não X, **mas sim / e sim / senão** Y" — só conectivo inequívoco.

**Recall 8/8, zero falso positivo** contra as 8 formas reais e os 8 negativos de negação
legítima do mesmo capítulo, mais os 4 falsos positivos históricos de
`fixtures/quality-parity.json`. Provado em `worker/src/maneirismo.test.ts`, incluindo a
prova de que não há dupla contagem (uma ocorrência = uma marcação, um molde só).

O `"mas"` pelado saiu de propósito: `"Ela não sabia nomear o som, mas o timbre parecia
antigo"` é concessiva comum, não antítese. A regex antiga o contava — falso positivo
herdado.

**Armadilha do `\b`:** em JavaScript `\b` é definido sobre `[A-Za-z0-9_]`. Depois de
letra acentuada não existe fronteira de palavra, então `/é\b/` **nunca casa**. Os fins de
palavra em `RE_ANTITESE` usam lookahead negativo, nunca `\b`.

---

## O acervo medido contra o teto (2026-08-05)

787 capítulos em `C:/Users/Rodrigo Paiva/atelier-work/`, detector final:

| | mediana | p90 | máximo | teto humano |
|---|---|---|---|---|
| antítese por negação | 7 | 14 | 25 | **8** |
| "do jeito que/de" | 1 | 4 | 12 | **3** |

**383 de 787 capítulos (48,7%) passariam a bloquear** — 319 por antítese, 99 por "do
jeito" (alguns pelos dois). A mediana do acervo (7) é **7× a mediana humana (1)** e
encosta no teto; o pior capítulo tem 25, mais do que o triplo do máximo humano.

O limiar **não foi mexido** depois de ver este resultado. O teto veio de prosa humana e
não se move para caber no acervo: esse número É o diagnóstico.

Uma surpresa a registrar: o capítulo 1 do canário 97dd7390 — que o plano apontava como
o pior da engine, com 13 ocorrências — mede **7** com o detector final, dentro do teto,
e **não bloqueia**. As outras 6 marcações eram anáfora e réplica de diálogo, não
antítese. O tique daquele capítulo é real, mas é menor do que a contagem antiga dizia.

---

## O que bloqueia e o que só sinaliza

- **Classe 1 (auto-repetição, escala de capítulo)** — `limiarCap`. **BLOQUEIA** no gate
  universal `auto_repeticao` (`worker/src/v2/gates.ts`). 8 antíteses passam; 9 bloqueia.
- **Classe 2 (taxa absoluta, escala de livro)** — `orc10k`. **SINAL**, nunca gate:
  alimenta o parecer do revisor (`medirSinaisLivro`).
- **N-grama** (`LIMIAR_NGRAMA_CAP` = 13) — continua com teto do **acervo de controle**,
  não de prosa humana. Não foi remedido nesta rodada; é a dívida conhecida deste
  documento.

Paridade TS/Python garantida por `worker/fixtures/quality-parity.json`
(`worker/src/quality-parity.test.ts` + `tools/test_quality_parity.py`); o espelho Python
vive em `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py`.
