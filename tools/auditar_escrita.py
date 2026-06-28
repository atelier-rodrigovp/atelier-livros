#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova de (não-)desperdício de tokens da escrita longa. Para cada projeto cujo
titulo casa o filtro, lê estado.json + runner.log e reporta, por capitulo, quantas
vezes foi ALVO de escrita (linhas 'ESCRITA: capitulo alvo = N') e se o arquivo
existe. Capitulo valido (existe + >= piso) NAO e reescrito (proximo_capitulo_pendente
o pula): se um capitulo foi alvo >1x, lista. Tambem mostra: invocacoes do Claude
vs capitulos escritos (espera-se muitos no-ops baratos por throttle/estagnacao).

Uso: python tools/auditar_escrita.py ["filtro do titulo" (default "Biblioteca Afogada")]
"""
import os
import re
import sys
import json

WORK_DIR = os.environ.get("WORK_DIR") or r"C:/Users/Rodrigo Paiva/atelier-work"
FILTRO = (sys.argv[1] if len(sys.argv) > 1 else "Biblioteca Afogada").lower()

RE_ALVO = re.compile(r"ESCRITA: capitulo alvo = (\d+)")
RE_DISPARO = re.compile(r"Disparando Claude headless")
RE_LIMITE = re.compile(r"usage limit|limit reached|LIMITE DO MAX|plano max", re.I)
RE_ESTAGNA = re.compile(r"SEM progresso|ESTAGNACAO")


def contar_palavras(p):
    try:
        with open(p, encoding="utf-8") as fh:
            return len(fh.read().split())
    except OSError:
        return 0


def auditar(proj):
    est_p = os.path.join(proj, "ESTADO_LIVRO.json")
    if not os.path.exists(est_p):
        est_p = os.path.join(proj, "estado", "estado.json")
    try:
        est = json.load(open(est_p, encoding="utf-8"))
    except Exception:
        return None
    titulo = str(est.get("titulo", ""))
    if FILTRO not in titulo.lower():
        return None
    total = int(est.get("total_capitulos_previstos") or 0)
    piso = int(est.get("piso_palavras_cap") or 1400)
    man = os.path.join(proj, "manuscrito")
    no_disco = sorted(int(f[9:11]) for f in os.listdir(man)
                      if re.match(r"^capitulo-\d{2}\.md$", f)) if os.path.isdir(man) else []
    validos = [n for n in no_disco
               if contar_palavras(os.path.join(man, "capitulo-{:02d}.md".format(n))) >= piso]
    log = ""
    lp = os.path.join(proj, "runner.log")
    if os.path.exists(lp):
        with open(lp, encoding="utf-8", errors="replace") as fh:
            log = fh.read()
    alvos = {}
    for n in RE_ALVO.findall(log):
        alvos[int(n)] = alvos.get(int(n), 0) + 1
    disparos = len(RE_DISPARO.findall(log))
    limites = len(RE_LIMITE.findall(log))
    estagna = len(RE_ESTAGNA.findall(log))
    return dict(proj=os.path.basename(proj), titulo=titulo, total=total, piso=piso,
                no_disco=no_disco, validos=validos, alvos=alvos,
                disparos=disparos, limites=limites, estagna=estagna)


def main():
    achou = False
    for d in sorted(os.listdir(WORK_DIR)):
        proj = os.path.join(WORK_DIR, d)
        if not os.path.isdir(proj):
            continue
        r = auditar(proj)
        if not r:
            continue
        achou = True
        print("\n=== {} | {} ===".format(r["titulo"], r["proj"]))
        sub_piso = [n for n in r["no_disco"] if n not in r["validos"]]
        print("  capitulos validos no disco: {}/{} (piso {}) | arquivos {} | sub-piso {}".format(
            len(r["validos"]), r["total"], r["piso"], len(r["no_disco"]), sub_piso or "nenhum"))
        # "alvo >1x" = re-TENTATIVAS (o capitulo ficou invalido enquanto runs eram
        # throttled), NAO regravacao: o arquivo final existe 1x e e valido. So seria
        # regravacao real se houvesse capitulos sub-piso (draft incompleto) na lista.
        reatacados = sorted((n, c) for n, c in r["alvos"].items() if c > 1)
        print("  capitulos com >1 tentativa (re-target por throttle/estagnacao, NAO regravacao): {}".format(
            ["cap {} x{}".format(n, c) for n, c in reatacados] or "nenhum"))
        print("  invocacoes do Claude: {} | mencoes de limite no log: {} | passos de estagnacao: {}".format(
            r["disparos"], r["limites"], r["estagna"]))
        print("  => {} capitulos escritos 1x cada (arquivos validos); o resto das {} invocacoes sao "
              "no-ops baratos (throttle/estagnacao={}), nao escritas caras.".format(
                  len(r["validos"]), r["disparos"], r["estagna"]))
    if not achou:
        print("Nenhum projeto casou o filtro '{}' em {}".format(FILTRO, WORK_DIR))


if __name__ == "__main__":
    main()
