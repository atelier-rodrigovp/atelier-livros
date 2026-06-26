# Auditoria antivazamento — meta-texto em capítulos (2026-06-26)

Resposta ao incidente: "A Biblioteca Afogada" Cap. 30 saiu com um comentário de
diagnóstico na prosa, visível no leitor:

```
<!-- nota: skill-dan-brown ausente no ambiente (~/.claude/skills/ não contém
skill-dan-brown); fallback perfil-de-voz.md declarado e aplicado. -->
```

Causa raiz: (1) a skill `skill-dan-brown` **não estava instalada** e o motor
degradou em silêncio; (2) nada validava o capítulo antes de salvar/compilar.

## Trava implementada (defesa em camadas)

- **Preflight de skill** (`worker/src/jobs.ts`): `escrever_livro` falha alto
  (job `error`) se a `skill_escrita` não existe no ambiente. Sem fallback
  silencioso, sem nota no texto.
- **Sanitizador puro** (`worker/src/sanitize.ts`, testado): remove comentários
  HTML, blocos de código e linhas de chatter de pipeline. Conservador — prosa
  legítima ("tomou nota:", itálicos, travessões) nunca é alterada.
- **Gate por capítulo**: meta-texto remanescente ⇒ capítulo rejeitado.
- **Gate de compilação/EPUB** (`tools/gate_manuscrito.py`): manuscrito com
  meta-texto não é publicado.

## Varredura do acervo existente

Script: `worker/scripts/auditar-vazamentos.ts` (disco + Storage). Originais com
backup: `.orig.bak` no disco e `worker/audit-backup/<key>` no Storage.

### Encontrado e limpo

Duas classes de vazamento:

1. **Comentário de fallback de skill** (o incidente) — 3 capítulos:
   - "A Biblioteca Afogada" (`40b5ebbd…`, edição origem pt-BR): caps **29, 30, 31**
     — limpos no disco e no Storage. Livro está `escrevendo` (sem
     MANUSCRITO-MESTRE nem EPUB compilados), então não há master/EPUB a
     recompilar; a correção está nos capítulos (o que o leitor lê).

2. **Ledger de estado embutido** `<!-- META palavras: … relogios_movidos: …
   pistas_plantadas: … -->` — 59 capítulos em 3 livros (naming legado
   `NN-cap-NN.md`), todos no Storage:
   - `497e08a9…`: caps 05–46
   - `954ef910…`: caps 01–22
   - `4caa6ac2…`: caps 43–45

**Total: 62 arquivos limpos no Storage + 3 no disco.** Edições com texto limpo
(regenerar EPUB se já houver um publicado): `0de024c7`, `8be81b0f`, `571e04d0`,
`d6c3730f`.

### Não falso-positivo

A varredura preservou prosa com "tomou nota:", "nota de rodapé", itálicos e
diálogos (cobertura nos testes `worker/src/sanitize.test.ts`).

## Skills de escrita ausentes (causa raiz nº 1)

No ambiente só há `livro-do-zero-ao-epub` e `skill-romantasy`. **Faltam**
`skill-dan-brown`, `hoover-mcfadden`, `skill-jk-rowling`,
`vesper-escritor-de-capitulos` — instale em `~/.claude/skills/` (ver
`worker/README.md`). A partir de agora, usar uma skill ausente faz o job falhar
alto em vez de degradar em silêncio.
