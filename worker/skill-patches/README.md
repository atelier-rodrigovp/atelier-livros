# Skill patches — edições locais de skills que vivem fora do git

As skills do Claude Code ficam em `~/.claude/skills/` (fora deste repo) e são
**sobrescritas num reinstall**. Para as nossas edições não evaporarem, a versão
final de cada skill editada fica versionada aqui, com um passo de reinstalação.

## Reaplicar depois de um reinstall

```powershell
pwsh worker/skill-patches/instalar-skills.ps1   # ou: powershell -File worker\skill-patches\instalar-skills.ps1
```

O script copia cada `worker/skill-patches/<skill>/` por cima de
`~/.claude/skills/<skill>/`, fazendo backup do que existia (`<skill>.bak-<timestamp>`).

## Patches atuais

### `arquiteto-de-enredo/` — Portão de ambição + voz com assinatura (v6.3)

**v6.3 (Refino C):** `perfil-de-voz.md` deixa de ser só defesa negativa
(anti-maneirismo) e ganha **assinatura positiva** (REFERÊNCIA EMBUTIDA C): hábitos
sintáticos, léxico, modo de ver, **2–3 parágrafos-modelo** (emular técnica, nunca
copiar obra protegida) e **diferenciação por autor** (Mia ≠ Aria ≠ Iago ≠ Lena). O
gate de Voz pontua **distinção** ("reconheceria de olhos vendados?"), não só
ausência de genérico.

**v6.2 (Refino A+B):** Portão em DOIS NÍVEIS (fatia 1 do refino de teto)

Empurra o teto da fundação de "competente" (7–8) para "excepcional" (8–9). O gate
original mirava só **viabilidade** (qualquer dimensão maior `< 6` → não gera), o
que deixava passar fundação "6–7 em tudo" → livro 7–8.

Mudanças (ver `## Registro de versões` → v6.2 no SKILL.md):
- **Gate de viabilidade** (`< 6` → não gera) **mantido**.
- **Gate de ambição (novo):** Premissa, Estrutura/Revelação, Personagens, Voz,
  Tema + 5 dimensões de **EXCELÊNCIA** (rereadability, fio temático, controlling
  image, custo irreversível, voz-assinatura) miram **≥ 8**. Abaixo de 8 **não
  aprova em silêncio** — devolve ao bloco para fortalecer, ou registra o teto
  honesto na Bíblia ("competente — teto ~X.x; para 9 falta …"). **Não bloqueia** a
  geração (só o piso de viabilidade bloqueia): força a escolha consciente.
- Blocos 2 e 5 da entrevista passam a pedir **tema (fio temático)** e
  **controlling image**, que o novo gate pontua.

Próximas fatias do plano (ainda NÃO aplicadas): (3) passe de elevação + best-of-N
nos picos (runner/`livro-do-zero-ao-epub`); (4) modo "excepcional" no
`book-bestseller-review`. — Fatias 1 (gate A+B) e 2 (perfil-de-voz, Refino C): ✓.

### `livro-do-zero-ao-epub/assets/livro_runner.py` — gate de maneirismo (capítulo + book-wide)

Duas travas determinísticas (espelham `worker/src/maneirismo.ts`):

1. **Por capítulo (ESCRITA):** após cada capítulo, conta os moldes e, se algum
   passar do orçamento por-capítulo (≤1 cada), dispara **uma** reescrita-alvo
   (bounded; não bloqueia o avanço). Reduz a carga na origem.
2. **Book-wide (fase `DESMANEIRISMO`, garantia dura):** quando a REVIEW passa
   (`nota ≥ meta`) — e também ao concluir por teto — antes de EPUB/CONCLUIR, conta
   no manuscrito INTEIRO os moldes nomeados + fecho epigramático isolado + um
   **detector GENÉRICO de n-gramas 3–5 palavras sobre-representados** (pega tiques
   novos). Se acima do **orçamento global cumulativo** (`ORC10K_GLOBAL` por molde,
   fecho ≤¼ dos caps), dispara uma passada dirigida por contagem (delega ao
   `livro-revisor`/`livro-escritor` em opus com os moldes+contagens), reconsolida o
   MESTRE, **re-conta e itera até abaixo do orçamento** ou `--max-desmaneirismo`
   (default 3). Determinístico (verificado por recontagem), reentrante (lê do disco,
   sobrevive à auto-retomada do Max), preserva piso/voz e passa pelo sanitizador.

**Confiabilidade da escrita longa (Max):** o runner distingue **throttle do Max**
de **estagnação real** — `detecta_limite_max()` (espelha `limite-max.ts`); ao bater
o limite **não incrementa** o contador de estagnação, grava marca limpa
(`RUNNER_LIMITE_MAX reset=…` no stdout + `aguardando_reset`/`reset_at` no estado) e
encerra para o worker pausar+retomar. O contador de estagnação é **resetado no
início de cada run** (não herda envenenamento de runs anteriores barrados pelo Max).

**Palavra-muleta ("coisa") + micro-loop por capítulo:**
- **Léxico de muletas** (`_MULETAS`, espelha `maneirismo.ts`): conta palavra inteira
  ("coisa"/"coisas", "meio que", "na verdade"…) com orçamento APERTADO ("coisa" ≤1/cap,
  ~4/10k book-wide). Entra no gate por capítulo E na fase DESMANEIRISMO. ("coisa" batia
  ~1 a cada 200 palavras — 572× na Biblioteca Afogada — e passava batido antes.)
- **Frente 2 — micro-loop escritor→revisor→editor por capítulo (PADRÃO ON)**; escape
  hatch `--sem-revisao-por-capitulo` / env `REVISAO_POR_CAPITULO=0`: na ESCRITA, após escrever o
  capítulo, um revisor leve (`livro-revisor`, sonnet) critica spec/continuidade/muletas/voz
  e o editor (`livro-editor`) aplica edições + grava o estado-narrativo, ANTES de aceitar.
  Reentrante (marcadores `review/_revcap-NN.done`); `--max-edicoes-por-cap`. Porta a
  arquitetura de papéis da Saga; o `book-bestseller-review` final segue intacto.

Testes: `python tools/test_desmaneirismo.py` e `python tools/test_runner_limite.py`.
(Patch é só `assets/livro_runner.py`; o instalador mescla por cima do skill.)
