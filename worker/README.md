# Worker — Atelier de Livros IA

Processo local (Node + tsx) que reivindica jobs da fila do Supabase e ORQUESTRA
as skills do Claude Code (escrita, tradução, capa, EPUB). Verdade do disco: o
worker confere os arquivos reais antes de gravar status.

```bash
npm install
npm run start       # roda a fila
npm run typecheck   # tsc --noEmit
```

Config em `worker/.env` (NUNCA commitado — segredos só aqui): `RUNNER_PATH`,
`PY_BIN`, `CLAUDE_BIN`, `WORK_DIR`, chaves do Supabase (service_role), etc.

## Skills de escrita (precisam estar instaladas)

A `skill_escrita` de um projeto é resolvida em `~/.claude/skills/<skill>` (o
worker deriva a pasta de skills a partir do `RUNNER_PATH`). **Se a skill
configurada não existir, o job `escrever_livro` falha alto** (status `error`,
mensagem clara no painel) — NUNCA degrada em silêncio nem escreve nota de
fallback no texto.

Skills de escrita esperadas (instale em `~/.claude/skills/`):

| Skill                          | Estilo                                  |
| ------------------------------ | --------------------------------------- |
| `skill-dan-brown`              | thriller de ritmo, mistério/conspiração |
| `hoover-mcfadden`              | drama/romance contemporâneo             |
| `skill-jk-rowling`             | fantasia com elenco e mundo             |
| `vesper-escritor-de-capitulos` | capítulo a capítulo, voz literária      |
| `skill-romantasy`              | romantasy                               |

Sempre instaladas (base): `livro-do-zero-ao-epub` (runner + fases) e
`edicao-kindle` (EPUB determinístico).

Para instalar, coloque a pasta da skill em `~/.claude/skills/<skill>/` (com seu
`SKILL.md`). Verifique com o preflight: rodar `escrever_livro` num projeto que
usa a skill — se faltar, o erro aponta o caminho exato.

## Trava antivazamento (nenhum meta-texto chega ao livro)

Defesa em camadas — ver `src/sanitize.ts` (função pura testada) e
`../tools/gate_manuscrito.py`:

1. **Preflight de skill** — skill ausente ⇒ job `error`, escrita não inicia.
2. **Sanitização por capítulo** — todo `capitulo-NN.md` passa por
   `sanitizarCapitulo()` antes de subir (remove comentários HTML `<!-- -->`,
   blocos ```` ``` ````, e linhas de chatter de pipeline). Backup do original em
   `<arquivo>.orig.bak`. Conservador: prosa legítima ("tomou nota:", itálicos,
   travessões) nunca é alterada.
3. **Gate por capítulo** — se restar marcador proibido após sanitizar, o
   capítulo é **rejeitado** (job `error`, pede reescrita).
4. **Gate de compilação/EPUB** — `tools/gate_manuscrito.py` valida o manuscrito
   antes de publicar; manuscrito/EPUB com meta-texto não sobe.

Auditoria do acervo existente: `npx tsx scripts/auditar-vazamentos.ts`.
