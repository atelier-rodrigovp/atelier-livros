# CLAUDE.md — Atelier de Livros IA (regras do projeto)

Plataforma que orquestra agentes do Claude Code para produzir livros (front
React+Vite+TS; Supabase; worker local em `worker/` via fila de jobs; deploy em
GitHub Pages). Verdade do disco: o worker confere arquivos reais antes de gravar.

## Skills de escrita (instaladas em `~/.claude/skills/`)

O worker resolve a `skill_escrita` de um projeto em `~/.claude/skills/<skill>`
(deriva de `RUNNER_PATH`). Estado atual — **6/6 de escrita instaladas**:

| Skill                          | Uso                         |
| ------------------------------ | --------------------------- |
| `livro-do-zero-ao-epub`        | runner + fases (base)       |
| `edicao-kindle`                | EPUB determinístico (base)  |
| `skill-dan-brown`              | thriller de conspiração     |
| `hoover-mcfadden`              | thriller-romance            |
| `skill-jk-rowling`             | prosa imersiva              |
| `vesper-escritor-de-capitulos` | trilogia VÉSPER             |
| `skill-romantasy`              | romantasy                   |

As 4 de autor foram copiadas (2026-06-26) do cache do app Claude desktop:
`…/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/local-agent-mode-sessions/skills-plugin/<ids>/skills/<skill>`.
O `skills-livro.zip` do repo NÃO contém as de autor — para reinstalar, copie a
pasta completa (SKILL.md + assets/references) desse cache para `~/.claude/skills/`.
Só os projetos `skill-dan-brown` (saga "A Biblioteca Afogada", autor Iago) usam
hoje uma skill de autor; os demais estão com `skill_escrita = nenhuma`.

**Edições de skill vivem em `worker/skill-patches/`** (fora de `~/.claude/skills/`,
que não versiona e é sobrescrito num reinstall). Depois de reinstalar skills, rode
`pwsh worker/skill-patches/instalar-skills.ps1` para reaplicar nossas edições (com
backup). Hoje: `arquiteto-de-enredo` v6.3 (portão de ambição ≥8 + voz com
assinatura positiva) e `livro-do-zero-ao-epub` (gate de maneirismo no runner:
**por capítulo** na ESCRITA + **book-wide** na fase `DESMANEIRISMO`, que itera
contando→reescrevendo→recontando até abaixo do orçamento global antes de
EPUB/CONCLUIR) + distingue **throttle do Max de estagnação** (não envenena o
contador; emite `RUNNER_LIMITE_MAX`). O detector de repetição vive em
`worker/src/maneirismo.ts` (TS, testado) e espelhado no runner.

## Trava antivazamento (nenhum meta-texto chega ao livro)

Camadas (ver `worker/README.md` e `docs/auditoria-vazamento.md`):

1. **Preflight** (`escrever_livro`): skill ausente ⇒ job `error`, sem degradação
   silenciosa. **Não alterar** esse comportamento (a falha alta é desejada).
2. **`sanitizarCapitulo()`** (`worker/src/sanitize.ts`, testado): remove
   comentário HTML/fence/chatter de pipeline; conservador com prosa legítima.
3. **Gate por capítulo** + **gate de compilação** (`tools/gate_manuscrito.py`).

Auditoria: `worker/scripts/auditar-vazamentos.ts`. **Backups dos originais
limpos:** `.orig.bak` ao lado de cada arquivo no `WORK_DIR`, e
`worker/audit-backup/<key>` para o Storage (ambos fora do git).

## Bloqueios de IA conhecidos (estado em 2026-06-26)

- **OpenAI gpt-image-1**: "Billing hard limit reached" → capas caem no Cloudflare
  flux-schnell (grátis). Subir o teto em platform.openai.com para usar gpt-image-1.
- **Escrita (binário `claude` do worker)**: usa `ANTHROPIC_API_KEY` (crédito
  baixo) com precedência sobre o login Max. Para escrever via plano Max, **unset
  `ANTHROPIC_API_KEY`** no ambiente do worker; senão a escrita falha por crédito
  (não por preflight).
