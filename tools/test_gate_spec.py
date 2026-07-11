#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Executa gate_spec_capitulo() DE VERDADE (nao so importa o modulo): regressao do
NameError 'txt_norm' que travou a producao dan-brown em loop de crash (regressao do
commit 528f964 — a linha 'txt_norm = _sem_acento(txt)' foi apagada mas o uso em
'tem_justificativa' ficou orfao). py_compile NUNCA pegaria isso: o crash so dispara
dentro de 'if fio:', num branch que so roda com spec real. Este teste roda esse branch.

Caminho do runner: LIVRO_RUNNER_PATH (env) ou o instalado em ~/.claude/skills/.
    python tools/test_gate_spec.py                      # arquivo instalado (com fix)
    LIVRO_RUNNER_PATH=<buggy> python tools/test_gate_spec.py   # prova a falha pre-fix"""
import os
import json
import shutil
import tempfile
import importlib.util

RUNNER = os.environ.get("LIVRO_RUNNER_PATH") or os.path.join(
    os.path.expanduser("~"), ".claude", "skills",
    "livro-do-zero-ao-epub", "assets", "livro_runner.py")
spec = importlib.util.spec_from_file_location("livro_runner", RUNNER)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

falhas = []


def check(cond, msg):
    print(("  [ok] " if cond else "  [FALHA] ") + msg)
    if not cond:
        falhas.append(msg)


def _spec_dan_brown(fio, justificativa=None):
    """Spec sintetica minima com TODOS os campos exigidos por skill-dan-brown
    (Fio de POV, Dia/Hora, Decisao/Acao, Modo, Novidade). 'Dia/Hora' sem 'corrente'
    e sem dia-da-semana/DIA N de proposito: o campo existe (passa _campo_presente),
    mas o checador de Dia/Hora fica inerte — isola o teste na logica de fio/justificativa."""
    linhas = [
        "# Spec de capitulo (sintetica)",
        "- **Fio de POV:** {}".format(fio),
        "- **Dia/Hora:** manha",
        "- **Decisao/Acao:** o protagonista arromba o cofre e rouba o codice antigo.",
        "- **Modo:** perseguicao",
        "- **Novidade:** revela o simbolo gravado na chave do relicario.",
    ]
    if justificativa:
        linhas.append(justificativa)
    return "\n".join(linhas) + "\n"


def _projeto(specs):
    """Cria um projeto temporario dan-brown com specs=[texto_cap1, texto_cap2, ...]."""
    proj = tempfile.mkdtemp(prefix="gate-spec-test-")
    with open(os.path.join(proj, "ESTADO_LIVRO.json"), "w", encoding="utf-8") as fh:
        json.dump({"skill_escrita": "skill-dan-brown"}, fh, ensure_ascii=False)
    os.makedirs(os.path.join(proj, "specs"), exist_ok=True)
    for i, txt in enumerate(specs, start=1):
        with open(os.path.join(proj, "specs", "Spec-Capitulo-{:02d}.md".format(i)),
                  "w", encoding="utf-8") as fh:
            fh.write(txt)
    return proj


def _gate(specs, n):
    proj = _projeto(specs)
    try:
        return m.gate_spec_capitulo(proj, n)
    finally:
        shutil.rmtree(proj, ignore_errors=True)


print("1) REGRESSAO DIRETA: spec com 'Fio de POV' preenchido NAO crasha (era NameError txt_norm)")
try:
    res = _gate([_spec_dan_brown("Ana")], 1)
    check(res is None, "cap 1 com Fio de POV: gate roda ate o fim sem excecao (res=%r)" % (res,))
except Exception as e:
    check(False, "cap 1: gate_spec_capitulo LANCOU %s: %s (o bug txt_norm)" % (type(e).__name__, e))

print("\n2) LOGICA (agora executavel): 4o cap consecutivo no mesmo fio SEM justificativa REPROVA")
try:
    specs = [_spec_dan_brown("Ana") for _ in range(4)]   # caps 1..4 todos no fio 'Ana'
    res = _gate(specs, 4)
    check(res is not None and "consecutivo" in res and "ana" in res.lower(),
          "cap 4 reprova por fio repetido sem justificativa (res=%r)" % (res,))
except Exception as e:
    check(False, "cap 4 (reprova): gate LANCOU %s: %s" % (type(e).__name__, e))

print("\n3) 'Justificativa de fio:' presente => NAO reprova o fio repetido")
try:
    specs = [_spec_dan_brown("Ana") for _ in range(3)]
    specs.append(_spec_dan_brown("Ana", justificativa="- **Justificativa de fio:** o cerco obriga a manter o POV."))
    res = _gate(specs, 4)
    check(res is None, "cap 4 com 'Justificativa de fio' passa limpo (res=%r)" % (res,))
except Exception as e:
    check(False, "cap 4 (justificativa fio): gate LANCOU %s: %s" % (type(e).__name__, e))

print("\n4) Variantes da regex de justificativa (POV / ponto de vista) tambem passam")
for rotulo in ("- **Justificativa de POV:** troca custaria a tensao do cerco.",
               "- **Justificativa de ponto de vista:** o leitor precisa ficar preso com ela."):
    try:
        specs = [_spec_dan_brown("Ana") for _ in range(3)]
        specs.append(_spec_dan_brown("Ana", justificativa=rotulo))
        res = _gate(specs, 4)
        check(res is None, "variante aceita: %r passa limpo (res=%r)" % (rotulo.split(":")[0], res))
    except Exception as e:
        check(False, "variante %r: gate LANCOU %s: %s" % (rotulo.split(":")[0], type(e).__name__, e))

print("\n=== %s ===" % ("TODOS OK" if not falhas else "%d FALHA(S)" % len(falhas)))
raise SystemExit(1 if falhas else 0)
