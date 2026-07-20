#!/usr/bin/env bash
# Micro-loop revisor->editor (fatia 3) sobre um capitulo do sandbox, com os SINAIS
# DE TRANSPARENCIA determinísticos injetados (como o runner faz). Faithful ao ADENDO
# TRANSPARENCIA do revisor + vetor de correcao invertido.
# Uso: revisar-cap.sh <sandbox-dir> <NN> "<sinais>"
set -u
SBX="$1"; N="$2"; SINAIS="$3"
CLAUDE='/c/Users/Rodrigo Paiva/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe'
unset ANTHROPIC_API_KEY
ARQ="manuscrito/capitulo-$N.md"

read -r -d '' PROMPT <<EOF
MICRO-LOOP DE REVISAO do $ARQ (ja escrito). ROTEIE via Task; NAO reescreva a prosa voce mesmo.

1) Task -> 'livro-revisor' (sonnet): critique SOMENTE $ARQ pelo checklist de conformidade + o VEREDITO DE PROPULSAO e o SEGUNDO EIXO (ADENDO TRANSPARENCIA: gnomico<=2, personificacao de abstracao<=2, frase-sanfona<=1, narrador invisivel, piso declarativo) do proprio agente livro-revisor. Leia esses blocos no .claude/agents/livro-revisor.md.
   SINAIS DE TRANSPARENCIA (deterministicos, consultivos — confirme na leitura; o veredito e seu): $SINAIS
   Devolva uma LISTA de edicoes PONTUAIS (trecho -> correcao) que DEVOLVEM TRANSPARENCIA: corte a maxima/aforismo, desfaca a frase-sanfona (diga UMA vez, a melhor), troque a personificacao de abstracao por agente humano + verbo concreto, tire o adjetivo moral do objeto, prefira a frase declarativa simples. NAO empilhe apostos nem alongue o periodo. Preserve sentido, fatos, voz e o gancho.
2) Task -> 'livro-editor' (haiku): aplique as edicoes no $ARQ. VARIE o ritmo com frases medias declarativas entre as curtas (NAO funda tudo num periodo longo; a sanfona e defeito). PRESERVE sentido e voz. Regrave o MESMO $ARQ (>= 1300 palavras). NAO deixe meta-texto.
EOF

echo "[bench] micro-loop cap-$N ..."
( cd "$SBX" && "$CLAUDE" -p "$PROMPT" --permission-mode acceptEdits --model sonnet --add-dir "$HOME/.claude/skills" ) 2>&1 | tail -6
echo "[bench] cap-$N revisado: $(grep -oE '[[:alpha:]À-ÿ]+' "$SBX/$ARQ" | wc -l) palavras"
