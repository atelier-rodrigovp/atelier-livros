#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gate de compilação/EPUB — trava antivazamento.

Valida cada capitulo-NN.md (e o MANUSCRITO-MESTRE.md) de uma pasta de manuscrito
ANTES de compilar/gerar o EPUB. Se encontrar comentário HTML (<!--), bloco de
código (```), ou assinatura de meta-texto de pipeline, FALHA com mensagem clara
apontando arquivo/linha. Nenhum capítulo com meta-texto entra no EPUB.

Espelha as assinaturas de worker/src/sanitize.ts (mesma trava, no compilador).
Conservador: prosa legítima ("tomou nota:", itálicos, travessões) NÃO dispara.

Uso:
  python gate_manuscrito.py <pasta-ou-arquivo> [mais arquivos...]
Saída: exit 0 se limpo; exit 1 e relatório no stderr/stdout se houver vazamento.
"""
import os
import re
import sys

# Saída sempre em UTF-8 (o worker captura via pipe; evita mojibake no painel).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Assinaturas de chatter de pipeline (linha proibida). Iguais às do sanitize.ts.
META_PATTERNS = [
    re.compile(r"\bskill-[a-z]", re.IGNORECASE),
    re.compile(r"\bfallback\b", re.IGNORECASE),
    re.compile(r"ausente no ambiente", re.IGNORECASE),
    re.compile(r"perfil-de-voz\.md", re.IGNORECASE),
    re.compile(r"unknown skill\s*:", re.IGNORECASE),
    re.compile(r"~/\.claude/skills", re.IGNORECASE),
    re.compile(r"\[system\]", re.IGNORECASE),
    re.compile(r"observa[çc][ãa]o do agente", re.IGNORECASE),
    re.compile(r"\bDEBUG\b"),
    re.compile(r"\bTODO:"),
]
FENCE = re.compile(r"^[ \t]*```")


def violacoes_em_texto(texto):
    """Retorna lista de (linha_no, motivo, trecho) de marcadores proibidos."""
    achados = []
    # Comentário HTML <!-- ... --> (inclusive multilinha): reporta a linha inicial.
    for m in re.finditer(r"<!--", texto):
        linha = texto.count("\n", 0, m.start()) + 1
        achados.append((linha, "comentário HTML <!--", "<!-- ..."))
    for i, linha_txt in enumerate(texto.splitlines(), start=1):
        if FENCE.search(linha_txt):
            achados.append((i, "bloco de código ```", linha_txt.strip()[:80]))
            continue
        for pat in META_PATTERNS:
            if pat.search(linha_txt):
                achados.append((i, "assinatura de pipeline", linha_txt.strip()[:80]))
                break
    return achados


def arquivos_alvo(caminhos):
    alvos = []
    for c in caminhos:
        if os.path.isdir(c):
            for nome in sorted(os.listdir(c)):
                if re.match(r"^capitulo-\d{2}\.md$", nome) or nome == "MANUSCRITO-MESTRE.md":
                    alvos.append(os.path.join(c, nome))
        elif os.path.isfile(c):
            alvos.append(c)
    return alvos


def main(argv):
    if len(argv) < 2:
        print("uso: gate_manuscrito.py <pasta-ou-arquivo> [...]", file=sys.stderr)
        return 2
    alvos = arquivos_alvo(argv[1:])
    problemas = []
    for arq in alvos:
        try:
            with open(arq, encoding="utf-8") as f:
                texto = f.read()
        except OSError as e:
            print("aviso: não foi possível ler %s (%s)" % (arq, e), file=sys.stderr)
            continue
        for (linha, motivo, trecho) in violacoes_em_texto(texto):
            problemas.append((arq, linha, motivo, trecho))

    if problemas:
        print("GATE REPROVADO — meta-texto encontrado (%d ocorrência(s)):" % len(problemas))
        for (arq, linha, motivo, trecho) in problemas:
            print("  %s:%d  %s  | %s" % (os.path.basename(arq), linha, motivo, trecho))
        return 1
    print("GATE OK — %d arquivo(s) sem meta-texto." % len(alvos))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
