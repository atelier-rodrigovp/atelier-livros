# Relatório — PASSO 1.5: uma régua só, e o CI onde o código chega (2026-08-03)

Pré-requisito do PASSO 2. Custo ZERO de modelo, nenhuma evidência gerada. Toda
afirmação vem com a saída do comando que a sustenta.

---

## Placar

| # | Objetivo | Veredito |
|---|---|---|
| 1 | Uma só implementação da regra | ✅ `gerar-evidencia.ts` importa `fingerprintsAtuais`; `listar`/`hashDe`/`fingerprints` locais deixaram de existir |
| 2 | Teste que falha se uma segunda voltar | ✅ 4 testes; **prova negativa: 2 vermelhos**, e o teste **nomeia o arquivo culpado** |
| 3 | CI em push para master | ✅ diff colado |
| 4 | Impressões idênticas a `bebac0e` | ✅ os quatro pares, medidos antes e depois |

**Terceira cópia da regra: não existe.** Varredura colada no F0.

---

## F0 — O problema, medido

### A tabela comparativa

Rodei as duas receitas sobre os mesmos quatro conjuntos. A receita "escritor" é
**cópia literal** de `gerar-evidencia.ts` (linhas 34–67 em `df21cc4`); a "leitor" é
o módulo real `fingerprints.ts`.

```
raiz: C:/Users/Rodrigo Paiva/Desktop/PESSOAL/LIVROS/ATELIER-LIVROS
```

| campo | ESCRITOR (gerar-evidencia) | LEITOR (fingerprints.ts) | bate? |
|---|---|---|---|
| `migrations_source_hash` | `b41950bfcd2989bd` | `94f4fef631059f5e` | **NÃO** |
| `contratos_hash` | `57f28413d35eb76c` | `28e6eb44e879e07e` | **NÃO** |
| `worker_hash` | `2e7eb06ecab2f841` | `0825a803a792cd25` | **NÃO** |
| `interface_hash` | `1bf3b7749908b454` | `fcd4dd3f03e17cf2` | **NÃO** |

```
0/4 campos batem.
```

**Nenhum dos quatro campos batia.** Toda evidência que o PASSO 2 gerasse nasceria
inválida nos quatro, com a mensagem `fingerprints.* mudou desde a verificação` —
que é literalmente a mesma mensagem de quando o código mudou de verdade. O
diagnóstico errado era quase garantido, e custaria uma rodada inteira de cota para
descobrir.

**Detalhe que confirma o diagnóstico:** o `contratos_hash` do escritor é
`57f28413d35eb76c` — exatamente o valor gravado nas evidências antigas (o que o
relatório da Onda 1 registrou como "prova de que nenhum contrato foi tocado").
Ou seja, o escritor continuava produzindo pela régua de antes do PASSO 1.

### Não existe terceira cópia

```
$ grep -rn "migrations_source_hash" --include=*.ts --include=*.tsx worker src | grep -v ".test."
worker/scripts/gerar-evidencia.ts:62:    migrations_source_hash: hashDe(listar(path.join(RAIZ, "supabase"), /\.sql$/)),
worker/src/v2/evidencia-externa.ts:68:  migrations_source_hash: string;          <- declaração do TIPO
worker/src/v2/evidencia-externa.ts:156:  "migrations_source_hash",                <- lista de campos a validar
worker/src/v2/evidencia-externa.ts:260:      if (r.remote_schema_hash === fp?.migrations_source_hash) {
worker/src/v2/fingerprints.ts:18://      git sem `git status` acusar nada …      <- comentário
worker/src/v2/fingerprints.ts:71:    migrations_source_hash: hashDeArquivos(raiz, listarArquivos(…)),
```

Só duas **implementações** (as duas que produzem o objeto); o resto é o tipo, a
lista de campos e comentário. Confirmado também por varredura de todos os
`createHash` do repo fora de teste: os demais são de outro propósito (EPUB,
`skill-manifest`, `documentos`, `publication-transaction`, canário), nenhum monta
as quatro impressões.

---

## F1 — Unificação

```diff
--- a/worker/scripts/gerar-evidencia.ts
+++ b/worker/scripts/gerar-evidencia.ts
@@ -12,14 +12,12 @@
 import { existsSync, readFileSync } from "node:fs";
 import path from "node:path";
 import { fileURLToPath } from "node:url";
-import { createHash } from "node:crypto";
-import { readdirSync } from "node:fs";
 import { gerarEvidencia } from "../src/v2/gerador-evidencia.js";
+import { fingerprintsAtuais } from "../src/v2/fingerprints.js";
 import type {
   ArtefatoEvidencia,
   EstadoRemoto,
   ExecucoesReaisEvidencia,
-  FingerprintsCodigo,
   TipoEvidencia,
 } from "../src/v2/evidencia-externa.js";
@@ -32,39 +30,14 @@ function arg(nome: string): string | undefined {
-function listar(dir: string, filtro: RegExp): string[] {
-  if (!existsSync(dir)) return [];
-  const saida: string[] = [];
-  for (const e of readdirSync(dir, { withFileTypes: true })) {
-    const p = path.join(dir, e.name);
-    if (e.isDirectory()) saida.push(...listar(p, filtro));
-    else if (filtro.test(e.name)) saida.push(p);
-  }
-  return saida;
-}
-
-function hashDe(arquivos: string[]): string {
-  const h = createHash("sha256");
-  for (const a of arquivos.sort()) {
-    h.update(a);
-    try {
-      h.update(readFileSync(a));
-    } catch {
-      h.update("<ausente>");
-    }
-  }
-  return h.digest("hex").slice(0, 16);
-}
-
-/** Mesma receita do `prontidao.ts`: a evidência caduca junto com o código. */
-function fingerprints(): FingerprintsCodigo {
-  return {
-    migrations_source_hash: hashDe(listar(path.join(RAIZ, "supabase"), /\.sql$/)),
-    contratos_hash: hashDe(listar(path.join(DIR_WORKER, "skills-v2"), /contrato\.json$/)),
-    worker_hash: hashDe(listar(path.join(DIR_WORKER, "src"), /\.ts$/).filter((f) => !/\.test\.ts$/.test(f))),
-    interface_hash: hashDe(listar(path.join(RAIZ, "src"), /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f))),
-  };
-}
+// A impressão do código vem de `fingerprintsAtuais` — a MESMA função que a
+// prontidão e o gate do CI usam para LER. Este arquivo já teve uma cópia local
+// da receita, com o comentário "Mesma receita do prontidao.ts": era verdade até
+// o PASSO 1 mudar a régua do leitor (caminho relativo + EOL normalizado) e não a
+// daqui. O resultado seria evidência nascendo inválida nos QUATRO campos, com a
+// mensagem "fingerprints.* mudou desde a verificação" — indistinguível de código
+// que mudou de verdade. Escritor e leitor agora compartilham uma implementação
+// só, e um teste quebra se uma segunda voltar a aparecer.
@@ -94,7 +67,7 @@ const r = await gerarEvidencia({
-  fingerprints: fingerprints(),
+  fingerprints: fingerprintsAtuais(RAIZ, DIR_WORKER),
```

### Grep provando que não sobrou receita própria

```
$ for s in createHash hashDe readdirSync "function listar" "function fingerprints"; do
    echo "  $s: $(grep -c "$s" worker/scripts/gerar-evidencia.ts) ocorrencia(s)"; done
  createHash: 0 ocorrencia(s)
  hashDe: 0 ocorrencia(s)
  readdirSync: 0 ocorrencia(s)
  function listar: 0 ocorrencia(s)
  function fingerprints: 0 ocorrencia(s)
```

Nenhuma linha de `worker/src/**` foi tocada — o conserto coube inteiro em
`worker/scripts/`, que não entra em nenhuma das quatro impressões.

---

## F2 — Teste anti-regressão

`worker/src/v2/regua-unica.test.ts`, 4 testes. O que ele trava:

1. **`só fingerprints.ts monta o objeto das quatro impressões`** — varre
   `worker/src`, `worker/scripts` e `src` inteiros e lista todo arquivo que atribua
   os quatro campos. A lista tem de ser exatamente `["worker/src/v2/fingerprints.ts"]`.
   Este é o teste que pega uma segunda cópia **em qualquer lugar** — inclusive uma
   terceira, que o conserto de hoje não previu.
2. **`o ESCRITOR importa a função única e não tem receita própria`** — contrato
   sobre o fonte de `gerar-evidencia.ts`: precisa importar de `fingerprints.js`,
   chamar `fingerprintsAtuais(`, e não pode conter `createHash`, `readdirSync`,
   `function hashDe`, `function listar` nem `function fingerprints`.
3. **`os LEITORES usam a mesma função única`** — `prontidao.ts` e
   `v2-verificar-release.ts` importam de `fingerprints.js` e não têm `createHash`.
   Foi por eles terem migrado sozinhos que o escritor ficou para trás.
4. **`a função única devolve o mesmo resultado para a mesma raiz`** — determinismo.

Não basta os números baterem hoje: o que os testes 1 e 2 tornam impossível é a
**existência** de uma segunda implementação.

### Verde

```
$ npx vitest run src/v2/regua-unica.test.ts
 ✓ src/v2/regua-unica.test.ts (4 tests) 83ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### PROVA NEGATIVA (DoD)

Reintroduzi a receita local em `gerar-evidencia.ts` (mesmo `createHash`, mesmo
`hashDe`, mesmo `listar`, mesmo `fingerprints`) e rodei o teste:

```
$ grep -c "createHash\|function hashDe" scripts/gerar-evidencia.ts
3

$ npx vitest run src/v2/regua-unica.test.ts
   × a impressão do código tem UMA implementação > só `fingerprints.ts` monta o objeto das quatro impressões 26ms
   × a impressão do código tem UMA implementação > o ESCRITOR de evidência importa a função única e não tem receita própria 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

**E o teste nomeia o arquivo culpado**, em vez de só dizer "falhou":

```
AssertionError: expected [ …(2) ] to deeply equal [ 'worker/src/v2/fingerprints.ts' ]

- Expected
+ Received

  Array [
    "worker/src/v2/fingerprints.ts",
+   "worker/scripts/gerar-evidencia.ts",
  ]
```

Receita local removida e verde de volta:

```
$ cp /tmp/gerar-evidencia.bak.ts scripts/gerar-evidencia.ts
$ grep -c "createHash\|function hashDe" scripts/gerar-evidencia.ts
0
$ npx vitest run src/v2/regua-unica.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
$ npm run typecheck
> tsc --noEmit
```

---

## F3 — CI em push para master

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,10 +1,15 @@
 name: CI
 
+# `master` entra no gatilho de push porque o gate mais estrito do projeto estava
+# fora do caminho que se usa: o commit de congelamento do PASSO 1 foi push direto
+# no master e não rodou UMA execução de CI. Gate correto que não roda onde o
+# código chega não protege nada.
 on:
   pull_request:
     branches: [master]
   push:
     branches:
+      - master
       - "codex/**"
   workflow_dispatch: {}
```

**Consequência imediata e esperada:** este próprio commit vai disparar CI no
`master`, e o CI **vai reprovar** com `GATE_EXIT=2` / `EVIDENCIA_EXTERNA_VENCIDA`,
porque as cinco evidências continuam carimbadas em `928938d`. Está correto: é o
gate fazendo exatamente o que foi construído para fazer. Não contornei, não
adicionei exceção, não fiz o gate ignorar. Ver "decisão pendente" no fim.

---

## F4 — As quatro impressões não se moveram

Medidas com a mesma função (`fingerprintsAtuais`), uma vez no commit congelado
`bebac0e` (worktree limpo criado com `git worktree add`) e uma vez no working tree
atual, já com todas as mudanças deste passo:

| campo | ANTES (`bebac0e`) | DEPOIS (working tree) | mudou? |
|---|---|---|---|
| `migrations_source_hash` | `94f4fef631059f5e` | `94f4fef631059f5e` | não |
| `contratos_hash` | `28e6eb44e879e07e` | `28e6eb44e879e07e` | não |
| `worker_hash` | `0825a803a792cd25` | `0825a803a792cd25` | não |
| `interface_hash` | `fcd4dd3f03e17cf2` | `fcd4dd3f03e17cf2` | não |

Saídas literais:

```
=== ANTES (commit congelado bebac0e, worktree limpo) ===
{
  "migrations_source_hash": "94f4fef631059f5e",
  "contratos_hash": "28e6eb44e879e07e",
  "worker_hash": "0825a803a792cd25",
  "interface_hash": "fcd4dd3f03e17cf2"
}

=== DEPOIS (working tree atual) ===
{
  "migrations_source_hash": "94f4fef631059f5e",
  "contratos_hash": "28e6eb44e879e07e",
  "worker_hash": "0825a803a792cd25",
  "interface_hash": "fcd4dd3f03e17cf2"
}
```

Era o esperado, e dá para ver por quê pelo inventário do que mudou:

```
$ git diff --name-only bebac0e
.github/workflows/ci.yml                    <- não entra em nenhuma impressão
RELATORIO-PASSO1-2026-08-03.md              <- não entra
worker/autostart/instalar-autostart.ps1     <- não entra (pré-existente, não meu)
worker/autostart/worker-wrapper.cmd         <- não entra (pré-existente, não meu)
worker/scripts/gerar-evidencia.ts           <- worker/scripts NÃO entra (só worker/src)

$ git status --short | grep "^??" | grep -E "worker/src|src/|supabase|\.github"
?? worker/src/v2/regua-unica.test.ts        <- .test.ts é EXCLUÍDO do worker_hash
```

Nenhum arquivo das quatro impressões foi tocado — fronteira respeitada, e agora
comprovada por hash e não por inspeção.

---

## F5 — Regressão obrigatória

```
### npm test -- --run
 Test Files  138 passed (138)
      Tests  1748 passed (1748)
EXIT_TEST=0
### typecheck worker
EXIT_TYPECHECK=0
### build
EXIT_BUILD=0
### lint
✖ 3 problems (0 errors, 3 warnings)
EXIT_LINT=0
```

**1744 → 1748 testes, 137 → 138 arquivos. Não caiu.** Os 3 avisos de lint são os
mesmos pré-existentes (`react-refresh/only-export-components` em `CoverArt.tsx`,
`ui/badge.tsx`, `ui/button.tsx`).

<!-- CONGELAMENTO -->

<!-- PRONTIDAO -->

---

## O que ficou pior ou não fechou

### 1. O CI vai reprovar — agora também no master, e de propósito

Esta é a consequência combinada da TAREFA C do PASSO 1 (gate enxerga evidência
vencida) com o F3 de hoje (CI roda no master). Até o PASSO 2 regenerar as
evidências, **todo push no master vai ficar vermelho** com:

```
EVIDÊNCIA EXTERNA VENCIDA — o código mudou desde a verificação
- migracoes_remotas (testou 928938d): fingerprints.* mudou desde a verificação
GATE_EXIT=2
```

É o comportamento correto e o motivo de o gate existir. **Não contornei.**

**Decisão pendente do autor:** o `master` fica com CI vermelho até o PASSO 2. As
opções são (a) seguir assim — recomendado, é honesto e temporário; ou (b) rodar o
PASSO 2 antes de qualquer outro commit no master. Não há terceira opção que não
seja afrouxar o gate, e isso está fora das fronteiras.

### 2. Este passo NÃO conserta as evidências que já existem

A unificação garante que evidência **nova** nasça com a régua certa. As cinco
evidências atuais em `.evidencias/` continuam carimbadas em `928938d` com a régua
velha e seguem inválidas. Só o PASSO 2 as substitui. **Não regenerei nenhuma** —
custa cota e está fora do escopo.

### 3. Não executei o escritor de ponta a ponta

`gerar-evidencia.ts` foi provado por três caminhos — typecheck, contrato sobre o
fonte (importa e chama a função única, sem receita própria) e a medição da função
única. Mas **NÃO VERIFICADO** por execução real: rodá-lo escreveria em
`.evidencias/`, que é exatamente o PASSO 2 e está proibido aqui. A primeira
execução real será a do PASSO 2, e é lá que os quatro campos gravados devem bater
com os quatro campos lidos.

### 4. Nada piorou

Nenhuma regressão introduzida: a suíte subiu (testes novos), lint permanece nos
mesmos 3 avisos pré-existentes, e as quatro impressões estão idênticas. O único
efeito negativo é o CI vermelho do item 1 — que é o gate funcionando, não um
defeito.

### 5. Fronteiras — nada tocado

Nenhum arquivo de `supabase/**/*.sql`, `worker/skills-v2/**/contrato.json`,
`worker/src/**/*.ts` (não-teste) ou `src/**/*.tsx?` (não-teste) foi alterado —
provado pelo `git diff --name-only bebac0e` acima e pelas quatro impressões
idênticas. Nenhum `meta_nota`, `max_reescritas`, limiar ou cota. Nenhuma cota de
modelo gasta. Nenhuma evidência gerada. Nenhum livro antigo tocado.
