#!/usr/bin/env bash
# Benchmark de estilo (AUDITORIA-ESTILO-DANBROWN.md, fatia 4): regenera UM capitulo
# na cadeia real do escritor, em sandbox, com a fundacao + skill corrigidas.
# Uso: gerar-cap.sh <sandbox-dir> <NN> [<skill>]
set -u
SBX="$1"; N="$2"; SKILL="${3:-skill-dan-brown}"
CLAUDE='/c/Users/Rodrigo Paiva/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe'
unset ANTHROPIC_API_KEY
ARQ="manuscrito/capitulo-$N.md"
rm -f "$SBX/$ARQ"

read -r -d '' PROMPT <<EOF
FASE ESCRITA (benchmark de estilo) — escreva SOMENTE o Capitulo $N. Nenhum outro.

DELEGUE a escrita ao subagente 'livro-escritor' via Task (ele roda em opus). NAO escreva a prosa voce mesmo.

O livro-escritor DEVE, antes de escrever:
1) Ler para fidelidade: Biblia-da-Obra.md, Mapa-de-Personagens.md, a LINHA do Capitulo $N em Estrutura-do-Livro.md (tier, PdV, beat), perfil-de-voz.md e estado/estado-narrativo.md. Se existir specs/Spec-Capitulo-$N.md, ela e a SPEC CANONICA: cumpra Fio de POV, Dia/Hora e Montagem.
2) Ler e SEGUIR a craft da skill DIRETO da fonte (nao de resumo): o bloco '## CRAFT DA SKILL' do perfil-de-voz.md E os arquivos de craft em ~/.claude/skills/$SKILL/references/ (voz-e-oficio.md e demais). A prosa-alvo e TRANSPARENTE: maioria de frases declarativas simples, narrador invisivel (sem maxima/aforismo, sem personificacao de abstracao, sem adjetivo moral em objeto), interioridade curta colada a estimulo, metafora rara (nunca em cadeia), exposicao em dialogo/acao.
3) Ler os capitulos vizinhos ja escritos (capitulo-$(printf '%02d' $((10#$N - 1))).md e anteriores conforme precisar) para continuidade de fatos e voz — sem reexpor o que o leitor ja sabe.

Escreva o capitulo COMPLETO (>= 1300 palavras) por MATERIAL NOVO (evento, virada, pista), terminando em gancho EXTERNO (evento/pergunta), no PdV e tom do perfil. Grave o resultado final em '$ARQ' (prosa pura, PT-BR, sem meta-texto, sem comentario). NAO toque em nenhum outro capitulo.
EOF

echo "[bench] gerando cap-$N em $SBX ..."
( cd "$SBX" && "$CLAUDE" -p "$PROMPT" --permission-mode acceptEdits --model sonnet --add-dir "$HOME/.claude/skills" ) 2>&1 | tail -8
if [ -f "$SBX/$ARQ" ]; then
  W=$(grep -oE '[[:alpha:]À-ÿ]+' "$SBX/$ARQ" | wc -l)
  echo "[bench] cap-$N gerado: $W palavras"
else
  echo "[bench] FALHA: $ARQ nao foi criado"
fi
