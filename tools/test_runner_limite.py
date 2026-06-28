#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testa a deteccao do LIMITE DO MAX no runner (nucleo dos bugs de retomada):
o throttle do Max NAO pode ser confundido com travamento/estagnacao, e o aviso de
stdin do CLI NAO e limite. Rode: python tools/test_runner_limite.py"""
import os
import importlib.util

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


print("LIMITE DO MAX e detectado (varias assinaturas)")
check(m.detecta_limite_max("Claude usage limit reached. Your limit will reset at 7:20pm."),
      "usage limit reached")
check(m.detecta_limite_max("You've hit your usage limit."), "hit your usage limit")
check(m.detecta_limite_max("Limite de uso do plano Max atingido (reseta 1:40am)."),
      "assinatura PT do worker")
check(m.hora_reset("reset at 7:20pm") == "7:20pm", "parseia a hora do reset (7:20pm)")
check(m.hora_reset("reseta 1:40am").lower().startswith("1:40"), "parseia 'reseta 1:40am'")

print("\nNAO e limite (nao pode envenenar a estagnacao nem virar erro):")
check(not m.detecta_limite_max(
    "Warning: no stdin data received in 3s, proceeding without it. < /dev/null to skip, or wait longer."),
    "aviso de stdin do CLI != limite (raiz do bug 2)")
check(not m.detecta_limite_max("escrita nao avancou em 20/32"), "log do runner != limite")
check(not m.detecta_limite_max("Skill 'x' nao instalada"), "erro real (skill) != limite")
check(not m.detecta_limite_max(""), "vazio != limite")

print("\nCodigo: reset do contador no inicio do run + marca limpa")
src = open(RUNNER, encoding="utf-8").read()
check('tentativas_sem_progresso"] = 0' in src and "Inicio do run" in src,
      "executar() reseta tentativas_sem_progresso no inicio")
check("RUNNER_LIMITE_MAX reset=" in src, "emite marca limpa RUNNER_LIMITE_MAX para o worker")

print("\n=== %s ===" % ("TODOS OK" if not falhas else "%d FALHA(S)" % len(falhas)))
raise SystemExit(1 if falhas else 0)
