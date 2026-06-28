#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes do detector book-wide de maneirismo do runner (positivos + falso-positivo).
Rode:  python worker/skill-patches/livro-do-zero-ao-epub/test_desmaneirismo.py
Carrega o livro_runner.py instalado em ~/.claude/skills (verdade do que roda)."""
import os
import importlib.util
import tempfile

RUNNER = os.path.join(os.path.expanduser("~"), ".claude", "skills",
                      "livro-do-zero-ao-epub", "assets", "livro_runner.py")
spec = importlib.util.spec_from_file_location("livro_runner", RUNNER)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

falhas = []


def check(cond, msg):
    print(("  [ok] " if cond else "  [FALHA] ") + msg)
    if not cond:
        falhas.append(msg)


def _mini_projeto(capitulos):
    d = tempfile.mkdtemp(prefix="desman-")
    os.makedirs(os.path.join(d, "manuscrito"), exist_ok=True)
    for i, txt in enumerate(capitulos, 1):
        with open(os.path.join(d, m.nome_cap(i)), "w", encoding="utf-8") as fh:
            fh.write(txt)
    return d


print("POSITIVO: moldes sobre-representados sao flagados")
caps = [
    u"# Cap 1\nNao era medo. Era panico. Ela fez do jeito que sempre fez, do jeito de antes. "
    u"Nao foi sorte. Foi calculo. A luz fria do amanhecer.\n\nTudo mudou.",
    u"# Cap 2\nDo jeito que ele andava, do jeito de quem sabe. Nao era pergunta; era ordem. "
    u"A luz fria do amanhecer caia. A luz fria do amanhecer voltava.\n\nEla sabia.",
]
proj = _mini_projeto(caps)
acima, rel = m.diagnostico_book_wide(proj, 2)
check(len(acima) > 0, "detecta algum molde acima do orcamento (got %d)" % len(acima))
check(any("do jeito" in a for a in acima), "flag 'do jeito que/de'")
check(any("fecho" in a for a in acima), "flag fecho epigramatico (2/2 caps curtos)")

print("\nFALSO-POSITIVO: prosa limpa e VARIADA NAO e flagada")
limpos = [
    u"# Cap 1\nA manha chegou devagar sobre a cidade adormecida. Ela seguiu pela rua larga ate o "
    u"cais, contando os barcos presos as amarras. Um gato cruzou a calcada de pedra fria. O cheiro "
    u"de mare se misturava ao de pao quente saindo da padaria da esquina. Ninguem reparou nela, e "
    u"isso lhe agradava de um modo discreto, quase secreto, enquanto o dia ganhava forma ao redor.",
    u"# Cap 2\nO vento trazia oleo queimado e sal. No escritorio do segundo andar, Helena abriu a "
    u"gaveta e tirou o mapa amarelado das correntes. Havia anotacoes a lapis nas margens, numeros que "
    u"ja nao significavam nada para quem os escrevera. Ela alisou o papel com a palma da mao e ficou "
    u"olhando a linha torta que alguem tracara entre dois pontos, muito tempo antes daquela manha.",
]
proj2 = _mini_projeto(limpos)
acima2, _ = m.diagnostico_book_wide(proj2, 2)
check(len(acima2) == 0, "prosa legitima nao dispara (got %d: %s)" % (len(acima2), acima2[:2]))

print("\nORCAMENTO escala com o tamanho (poucos tiques em texto grande = ok)")
grande = [u"# Cap 1\n" + u"palavra " * 5000 + u"Nao era isso. Era aquilo."]
proj3 = _mini_projeto(grande)
acima3, _ = m.diagnostico_book_wide(proj3, 1)
check(not any("nao era" in a.lower() for a in acima3), "1 antitese em 5000 palavras nao estoura")

print("\n=== %s ===" % ("TODOS OK" if not falhas else "%d FALHA(S)" % len(falhas)))
raise SystemExit(1 if falhas else 0)
