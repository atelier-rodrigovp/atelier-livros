# Skill patches — edições locais de skills que vivem fora do git

As skills do Claude Code ficam em `~/.claude/skills/` (fora deste repo) e são
**sobrescritas num reinstall**. Para as nossas edições não evaporarem, a versão
final de cada skill editada fica versionada aqui, com um passo de reinstalação.

## Reaplicar depois de um reinstall

```powershell
pwsh worker/skill-patches/reinstalar.ps1   # ou: powershell -File worker\skill-patches\reinstalar.ps1
```

O script copia cada `worker/skill-patches/<skill>/` por cima de
`~/.claude/skills/<skill>/`, fazendo backup do que existia (`<skill>.bak-<timestamp>`).

## Patches atuais

### `arquiteto-de-enredo/` — Portão em DOIS NÍVEIS (v6.2, fatia 1 do refino de teto)

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

Próximas fatias do plano (ainda NÃO aplicadas): (2) `perfil-de-voz.md` como
assinatura positiva por autor; (3) passe de elevação + best-of-N nos picos
(runner/`livro-do-zero-ao-epub`); (4) modo "excepcional" no `book-bestseller-review`.
