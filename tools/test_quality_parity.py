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
for case in fixtures["muletas"]:
    hits = m.muletas_acima_cap(case["text"])
    match = next((h for h in hits if case["termContains"].lower() in h[0].lower()), None)
    actual = match[1] if match else 0
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

raise SystemExit("; ".join(failures) if failures else 0)
