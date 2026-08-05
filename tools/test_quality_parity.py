#!/usr/bin/env python3
"""Executa no runner Python as mesmas fixtures consumidas pelo teste TypeScript."""
import importlib.util
import json
import os
import re

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

# Limiar por capitulo (contrato de ORCAMENTO, nao de contagem). A checagem de
# contagem crua acima nao pega o caso que passou batido: o TS bloqueava molde
# acima de limiarCap e o Python acima de PER_CAP_BUDGET=1 — os dois lados
# contavam igual e decidiam diferente. Aqui o numero do TS e lido do proprio
# maneirismo.ts; mudar um lado sem o outro quebra este teste.
TS_MANEIRISMO = os.path.join(ROOT, "worker", "src", "maneirismo.ts")
with open(TS_MANEIRISMO, encoding="utf-8") as fh:
    ts_src = fh.read()

def _chave(s):
    """Nome comparavel entre os dois lados: sem acento e sem aspas. O TS escreve
    'símile-andaime ("como se…")' e o Python "simile-andaime ('como se…')" — as
    aspas sao do literal de cada linguagem, nao do nome do molde."""
    return _norm(s).replace('"', "").replace("'", "")


RE_MOLDE_TS = re.compile(r"\{\s*nome:\s*(\"[^\"]+\"|'[^']+')[^}]*?limiarCap:\s*(\d+)")
ts_limiares = {_chave(hit.group(1)[1:-1]): int(hit.group(2)) for hit in RE_MOLDE_TS.finditer(ts_src)}
if not ts_limiares:
    failures.append("limiar: nao consegui ler nenhum limiarCap de maneirismo.ts")

for nome, _rx in m._MOLDES_CAP:
    esperado = ts_limiares.get(_chave(nome))
    obtido = m._limiar_cap(nome)
    ok = esperado is not None and esperado == obtido
    if not ok:
        failures.append("limiar {}: TS={}, Python={}".format(nome, esperado, obtido))
    print("[{}] limiar {} -> TS={} Python={}".format("ok" if ok else "FALHA", nome, esperado, obtido))

# Todo molde do TS tem de existir no Python (o cliche recorrente estava so no
# TS justamente porque nada comparava as duas listas).
py_moldes = {_chave(nome) for nome, _rx in m._MOLDES_CAP}
for nome_ts in ts_limiares:
    if nome_ts not in py_moldes:
        failures.append("molde presente no TS e ausente no Python: {}".format(nome_ts))

raise SystemExit("; ".join(failures) if failures else 0)
