#!/usr/bin/env python3
"""Executa no runner Python as mesmas fixtures consumidas pelo teste TypeScript."""
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.environ.get("LIVRO_RUNNER_PATH") or os.path.join(
    ROOT, "worker", "skill-patches", "livro-do-zero-ao-epub", "assets", "livro_runner.py")
FIXTURES = os.path.join(ROOT, "worker", "fixtures", "quality-parity.json")

spec = importlib.util.spec_from_file_location("livro_runner_parity", RUNNER)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

with open(FIXTURES, encoding="utf-8") as fh:
    fixtures = json.load(fh)

failures = []
# Contagem CRUA por regex de _MULETAS — o mesmo que o lado TS mede
# (contarMuletas().n). Ler muletas_acima_cap aqui misturava CONTAGEM com
# ORCAMENTO: quando o teto humano de 2026-08-05 afrouxou o budget de "coisa"
# (1 -> 20, prosa humana vai a 20 por capitulo), a fixture de contagem quebrou
# sem que a contagem tivesse mudado. A fixture e contrato de contagem.
for case in fixtures["muletas"]:
    rx = next((r for nome, r, _b, _o in m._MULETAS if case["termContains"].lower() in nome.lower()), None)
    actual = len(rx.findall(case["text"])) if rx else -1
    if actual != case["expectedCount"]:
        failures.append("{}: esperado {}, obtido {}".format(case["name"], case["expectedCount"], actual))
    print("[{}] {} -> {}".format("ok" if actual == case["expectedCount"] else "FALHA", case["name"], actual))

# Moldes (autopsia de convergencia 2026-07-13): contagem CRUA por regex de
# _MOLDES_CAP — mesmos casos do teste TS (falso positivo nao conta).
for case in fixtures.get("moldes", []):
    rx = next((r for nome, r in m._MOLDES_CAP if case["moldeContains"] in nome), None)
    actual = len(rx.findall(case["text"])) if rx else -1
    if actual != case["expectedCount"]:
        failures.append("molde {}: esperado {}, obtido {}".format(case["name"], case["expectedCount"], actual))
    print("[{}] molde {} -> {}".format("ok" if actual == case["expectedCount"] else "FALHA", case["name"], actual))

# Cadencia (autopsia 53abdade cap-37): expectedAbove = tique presente em
# cadencia_acima com o orcamento da skill-dan-brown (default). Nomes comparados
# sem acento (TS/Python diferem na acentuacao dos rotulos).
import unicodedata
def _norm(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
for case in fixtures.get("cadencia", []):
    acima = m.cadencia_acima(case["text"], "skill-dan-brown")
    hit = any(_norm(case["tiqueContains"]) in _norm(nome) for nome, _n, _a in acima)
    ok = hit == case["expectedAbove"]
    if not ok:
        failures.append("cadencia {}: esperado above={}, obtido {} ({})".format(
            case["name"], case["expectedAbove"], hit, acima))
    print("[{}] cadencia {} -> above={}".format("ok" if ok else "FALHA", case["name"], hit))

raise SystemExit("; ".join(failures) if failures else 0)
