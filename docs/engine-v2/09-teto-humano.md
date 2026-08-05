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
(Hoover máx 7, McFadden máx 7). O detector atual, sobre o MESMO corpus, dá **11**.
Aplicar 7 ao detector novo reprovaria prosa humana — o erro da tautologia, ao contrário.

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
| antítese por negação | 5 | **11** | 8 | **11** | 11 |
| "do jeito que/de" | 0 | 0 | **3** | **3** | 3 |
| símile-andaime ("como se / como quando") | 3 | **6** | 5 | **6** | 6 |
| clichê recorrente | — | — | — | **2** | 2 |
| "coisa(s)" *(léxico, `MULETAS`)* | 8 | **20** | 14 | **20** | 20 (V1) |

Taxa por 10.000 palavras, livro inteiro — a escala do `orc10k`:

| molde | Brown | Hoover | McFadden | **máximo humano** | `orc10k` |
|---|---|---|---|---|---|
| antítese por negação | 5,8 | **17,2** | 16,5 | **17,2** | 18 |
| "do jeito que/de" | 0,0 | 0,0 | **0,7** | **0,7** | 1 |
| símile-andaime | 4,5 | **11,7** | 10,4 | **11,7** | 12 |
| "coisa(s)" | 17,2 | 24,6 | **29,3** | **29,3** | 30 |
| "algo" | 2,5 | **9,8** | 7,6 | **9,8** | 10 |

**Regra do limiar:** fora da cota é **ESTRITAMENTE ACIMA** do máximo observado. Em 318
mil palavras de três romances comerciais, nenhuma janela de 2.500 palavras passou desses
valores. Verificação: **0 das 128 janelas humanas** fica acima de 11 antíteses.

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
3. a coda ECOA uma palavra de conteúdo do trecho negado (≥5 letras) — "Não limpa de A. Limpa de B.";
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

## O que bloqueia e o que só sinaliza

- **Classe 1 (auto-repetição, escala de capítulo)** — `limiarCap`. **BLOQUEIA** no gate
  universal `auto_repeticao` (`worker/src/v2/gates.ts`). 11 antíteses passam; 12 bloqueia.
- **Classe 2 (taxa absoluta, escala de livro)** — `orc10k`. **SINAL**, nunca gate:
  alimenta o parecer do revisor (`medirSinaisLivro`).
- **N-grama** (`LIMIAR_NGRAMA_CAP` = 13) — continua com teto do **acervo de controle**,
  não de prosa humana. Não foi remedido nesta rodada; é a dívida conhecida deste
  documento.

Paridade TS/Python garantida por `worker/fixtures/quality-parity.json`
(`worker/src/quality-parity.test.ts` + `tools/test_quality_parity.py`); o espelho Python
vive em `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py`.
