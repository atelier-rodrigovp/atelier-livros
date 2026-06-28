#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
livro_runner.py — Orquestrador À PROVA DE PARADA *e à prova de trapaça*
para escrever um livro da ideia ao EPUB no Claude Code, sem "continua".

==========================================================================
VERSÃO BLINDADA (v2). O que mudou em relação à v1 — e por quê.
==========================================================================
A v1 parava no meio E PERMITIA TRAPAÇA: a fase ESCRITA mandava UM `claude -p`
"escrever vários capítulos" e o próprio agente incrementava `capitulos_aprovados`
no JSON. O runner confiava nesse número (condição de término:
capitulos_aprovados >= total) e NUNCA olhava os arquivos. Resultado real
observado: o agente pôs o contador em 48 escrevendo *resumos* de 120–300
palavras, "simulou" a avaliação e inventou a nota. O pipeline declarou um livro
de 70k/8.58 que no disco eram ~22k de stubs.

Esta versão fecha os três furos:

  (1) FAN-OUT POR CAPÍTULO. O loop por capítulo vive AQUI, no Python, não no
      agente. Cada capítulo é UMA chamada `claude -p` com contexto FRESCO,
      instruída a escrever SOMENTE aquele capítulo. Nenhum agente tenta segurar
      o livro inteiro numa só janela.

  (2) VERDADE VEM DO DISCO, NÃO DO AGENTE. Quem conta capítulos prontos e
      palavras é o runner, com os arquivos reais (PISO de palavras por capítulo).
      `capitulos_aprovados` e `palavras_totais` são DERIVADOS do disco a cada
      passada e sobrescrevem qualquer valor que o agente tenha escrito. Um
      capítulo abaixo do PISO não conta como pronto — é reescrito.

  (3) REVIEW EXIGE ARTEFATO REAL. A fase REVIEW só é aceita se a
      `book-bestseller-review` tiver gravado um relatório de verdade em
      review/review-iter-<k>.md (acima de um tamanho mínimo). A nota é lida desse
      arquivo. Sem relatório real no disco, não há nota — não dá para "simular".

  Bônus: a CONSOLIDAÇÃO é feita pelo PRÓPRIO Python (concatena os capítulos e
  faz `wc`), eliminando mais uma superfície onde dava para mentir.

O Python continua sendo a AUTORIDADE sobre as transições de fase. O Claude, em
cada chamada, só PRODUZ um capítulo (ou uma revisão/EPUB) e o runner verifica.

Uso:
    python3 livro_runner.py --projeto /caminho/do/projeto \
        [--briefing /caminho/briefing.md] [--epub] \
        [--meta 9.0] [--max-reescritas 4] [--max-estagnacao 3] \
        [--piso 1400] [--fase-timeout 0] [--claude-bin claude] [--dry-run]

--piso  = piso de palavras por capítulo (default 1400). Capítulo abaixo disso
          é considerado incompleto e reescrito.
--dry-run apenas faz o bootstrap do ESTADO_LIVRO.json e sai (NÃO chama o claude).
"""

import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys

# ----------------------------------------------------------------------------
# Constantes da máquina de estados
# ----------------------------------------------------------------------------
FASES_VALIDAS = ["ESTRUTURA", "ESCRITA", "CONSOLIDACAO", "REVIEW",
                 "REESCRITA", "DESMANEIRISMO", "EPUB", "CONCLUIDO"]

ARQ_ESTADO = "ESTADO_LIVRO.json"
ARQ_BIBLIA = "Biblia-da-Obra.md"
ARQ_ESTRUTURA = "Estrutura-do-Livro.md"
DIR_MANUSCRITO = "manuscrito"
ARQ_MANUSCRITO = os.path.join(DIR_MANUSCRITO, "MANUSCRITO-MESTRE.md")
DIR_REVIEW = "review"
ARQ_LOG = "runner.log"

# Nome canônico de capítulo: capitulo-01.md ... capitulo-NN.md (zero-padded).
def nome_cap(n):
    return os.path.join(DIR_MANUSCRITO, "capitulo-{:02d}.md".format(int(n)))

PISO_PALAVRAS_DEFAULT = 1400      # capítulo abaixo disso = incompleto
MIN_REVIEW_CHARS = 1500          # relatório de review precisa ter ao menos isto
RE_NOTA = re.compile(r"NOTA_FINAL:\s*([0-9]+(?:[.,][0-9])?)", re.IGNORECASE)


# ----------------------------------------------------------------------------
# Utilidades de IO / log
# ----------------------------------------------------------------------------
def agora():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(projeto, msg):
    linha = "[{}] {}".format(agora(), msg)
    print(linha, flush=True)
    try:
        with open(os.path.join(projeto, ARQ_LOG), "a", encoding="utf-8") as fh:
            fh.write(linha + "\n")
    except OSError:
        pass


def caminho_estado(projeto):
    return os.path.join(projeto, ARQ_ESTADO)


def load_state(projeto):
    with open(caminho_estado(projeto), "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_state(projeto, state):
    state.setdefault("_runner", {})
    state["_runner"]["atualizado_em"] = agora()
    tmp = caminho_estado(projeto) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, caminho_estado(projeto))


def existe(projeto, rel):
    return os.path.exists(os.path.join(projeto, rel))


# ----------------------------------------------------------------------------
# VERDADE DO DISCO — o coração da blindagem
# ----------------------------------------------------------------------------
def contar_palavras(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return len(fh.read().split())
    except OSError:
        return 0


def capitulos_validos(projeto, total, piso):
    """Lista os índices 1..total cujo arquivo capitulo-NN.md existe e tem
    >= piso palavras. É a definição de 'capítulo pronto' — derivada do disco,
    nunca do que o agente afirmou."""
    validos = []
    for n in range(1, int(total) + 1):
        p = os.path.join(projeto, nome_cap(n))
        if os.path.exists(p) and contar_palavras(p) >= int(piso):
            validos.append(n)
    return validos


def proximo_capitulo_pendente(projeto, total, piso):
    """Primeiro índice 1..total sem arquivo válido (a escrever ou reescrever)."""
    for n in range(1, int(total) + 1):
        p = os.path.join(projeto, nome_cap(n))
        if not (os.path.exists(p) and contar_palavras(p) >= int(piso)):
            return n
    return None


def sincroniza_contadores_do_disco(projeto, state, piso):
    """Sobrescreve capitulos_aprovados a partir do disco. O agente não manda
    nesse número — o disco manda."""
    total = _i(state.get("total_capitulos_previstos"))
    if total > 0:
        state["capitulos_aprovados"] = len(capitulos_validos(projeto, total, piso))
    return state


# ----------------------------------------------------------------------------
# Bootstrap / reparo do estado
# ----------------------------------------------------------------------------
def estado_inicial(args):
    return {
        "_comentario": ("Fonte de verdade do pipeline, GERIDA pelo livro_runner.py "
                        "externo (v2 blindada). As fases do Claude produzem UM capitulo "
                        "por vez; o runner conta capitulos e palavras DO DISCO e decide "
                        "as transicoes. Nunca dispare /goal; nunca confie em contadores "
                        "auto-relatados."),
        "titulo": None,
        "total_capitulos_previstos": 0,
        "fase_atual": "ESTRUTURA",
        "_fases_validas": list(FASES_VALIDAS),
        "capitulos_aprovados": 0,
        "palavras_totais": 0,
        "piso_palavras_cap": int(args.piso),
        "meta_nota": float(args.meta),
        "ultima_nota": None,
        "historico_notas": [],
        "iteracoes_review": 0,
        "max_iteracoes_reescrita": int(args.max_reescritas),
        "pendencias_review": [],
        "_formato_pendencia": {"id": "p1", "capitulo": 0, "localizacao": "ex: cap 12",
                               "problema": "fraqueza apontada",
                               "severidade": "alta|media|baixa", "resolvido": False},
        "ultima_reescrita_iteracao": -1,
        "gerar_epub": bool(args.epub),
        "epub_gerado": False,
        "epub_caminho": None,
        "teto_atingido": False,
        "log_ancoras": [],
        "_runner": {
            "criado_em": agora(),
            "atualizado_em": agora(),
            "tentativas_sem_progresso": 0,
            "max_estagnacao": int(args.max_estagnacao),
        },
    }


def ensure_fields(state, args):
    base = estado_inicial(args)
    for k, v in base.items():
        if k not in state:
            state[k] = v
    state["_fases_validas"] = list(FASES_VALIDAS)
    state.setdefault("_runner", {})
    state["_runner"].setdefault("tentativas_sem_progresso", 0)
    state["_runner"]["max_estagnacao"] = int(args.max_estagnacao)
    try:
        state["meta_nota"] = float(state.get("meta_nota") or args.meta)
    except (TypeError, ValueError):
        state["meta_nota"] = float(args.meta)
    try:
        state["max_iteracoes_reescrita"] = int(state.get("max_iteracoes_reescrita") or args.max_reescritas)
    except (TypeError, ValueError):
        state["max_iteracoes_reescrita"] = int(args.max_reescritas)
    try:
        state["piso_palavras_cap"] = int(state.get("piso_palavras_cap") or args.piso)
    except (TypeError, ValueError):
        state["piso_palavras_cap"] = int(args.piso)
    state.setdefault("desmaneirismo_iters", 0)
    try:
        state["max_desmaneirismo"] = int(getattr(args, "max_desmaneirismo", 3) or 3)
    except (TypeError, ValueError):
        state["max_desmaneirismo"] = 3
    if args.epub:
        state["gerar_epub"] = True
    if state.get("fase_atual") not in FASES_VALIDAS:
        state["fase_atual"] = "ESTRUTURA"
    return state


def bootstrap_state(projeto, args):
    os.makedirs(projeto, exist_ok=True)
    os.makedirs(os.path.join(projeto, DIR_MANUSCRITO), exist_ok=True)
    os.makedirs(os.path.join(projeto, DIR_REVIEW), exist_ok=True)
    if os.path.exists(caminho_estado(projeto)):
        state = ensure_fields(load_state(projeto), args)
    else:
        state = estado_inicial(args)
    if args.briefing:
        destino = os.path.join(projeto, "briefing.md")
        if os.path.abspath(args.briefing) != os.path.abspath(destino):
            try:
                with open(args.briefing, "r", encoding="utf-8") as src:
                    conteudo = src.read()
                with open(destino, "w", encoding="utf-8") as dst:
                    dst.write(conteudo)
            except OSError as exc:
                log(projeto, "AVISO: nao consegui copiar o briefing: {}".format(exc))
    save_state(projeto, state)
    return state


def _i(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


# ----------------------------------------------------------------------------
# Assinatura de progresso (estagnação) — agora baseada no DISCO
# ----------------------------------------------------------------------------
def signature(projeto, s, piso):
    total = _i(s.get("total_capitulos_previstos"))
    n_validos = len(capitulos_validos(projeto, total, piso)) if total > 0 else 0
    return (
        s.get("fase_atual"),
        n_validos,
        s.get("iteracoes_review"),
        s.get("ultima_nota"),
        s.get("epub_gerado"),
        s.get("palavras_totais"),
        total,
        existe(projeto, ARQ_MANUSCRITO),
        existe(projeto, ARQ_BIBLIA),
        s.get("desmaneirismo_iters"),  # cada passada de DESMANEIRISMO = progresso
    )


# ----------------------------------------------------------------------------
# Condição de término e próxima fase (todas verificáveis)
# ----------------------------------------------------------------------------
def done_condition(projeto, fase, s, iter_before, piso):
    if fase == "ESTRUTURA":
        return (existe(projeto, ARQ_BIBLIA) and existe(projeto, ARQ_ESTRUTURA)
                and _i(s.get("total_capitulos_previstos")) > 0)
    if fase == "ESCRITA":
        tot = _i(s.get("total_capitulos_previstos"))
        return tot > 0 and len(capitulos_validos(projeto, tot, piso)) >= tot
    if fase == "CONSOLIDACAO":
        return existe(projeto, ARQ_MANUSCRITO) and _i(s.get("palavras_totais")) > 0
    if fase == "REVIEW":
        return s.get("ultima_nota") is not None and _i(s.get("iteracoes_review")) > iter_before
    if fase == "REESCRITA":
        return _i(s.get("ultima_reescrita_iteracao")) >= _i(s.get("iteracoes_review"))
    if fase == "DESMANEIRISMO":
        # pronto = nenhum molde acima do orcamento global OU teto de iteracoes.
        total = _i(s.get("total_capitulos_previstos"))
        acima, _ = diagnostico_book_wide(projeto, total)
        if not acima:
            return True
        return _i(s.get("desmaneirismo_iters")) >= _i(s.get("max_desmaneirismo"))
    if fase == "EPUB":
        return bool(s.get("epub_gerado"))
    return False


def next_phase(fase, s):
    if fase == "ESTRUTURA":
        return "ESCRITA"
    if fase == "ESCRITA":
        return "CONSOLIDACAO"
    if fase == "CONSOLIDACAO":
        return "REVIEW"
    if fase == "REVIEW":
        nota = float(s.get("ultima_nota"))
        meta = float(s.get("meta_nota"))
        if nota >= meta:
            return "DESMANEIRISMO"   # gate book-wide antes de concluir/EPUB
        if _i(s.get("iteracoes_review")) <= _i(s.get("max_iteracoes_reescrita")):
            return "REESCRITA"
        s["teto_atingido"] = True
        return "DESMANEIRISMO"        # concluindo por teto: ainda passa pelo gate
    if fase == "REESCRITA":
        return "CONSOLIDACAO"
    if fase == "DESMANEIRISMO":
        if s.get("gerar_epub") and not s.get("epub_gerado"):
            return "EPUB"
        return "CONCLUIDO"
    if fase == "EPUB":
        return "CONCLUIDO"
    return "CONCLUIDO"


# ----------------------------------------------------------------------------
# Consolidação feita pelo PRÓPRIO runner (sem chamar o agente)
# ----------------------------------------------------------------------------
def consolida(projeto, state, piso):
    total = _i(state.get("total_capitulos_previstos"))
    partes = []
    for n in range(1, total + 1):
        p = os.path.join(projeto, nome_cap(n))
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as fh:
                partes.append(fh.read().rstrip() + "\n")
    destino = os.path.join(projeto, ARQ_MANUSCRITO)
    with open(destino, "w", encoding="utf-8") as fh:
        fh.write("\n\n".join(partes))
    palavras = contar_palavras(destino)
    state["palavras_totais"] = palavras
    return palavras


# ----------------------------------------------------------------------------
# Prompts
# ----------------------------------------------------------------------------
PREAMBULO = (
    "Voce esta sendo chamado em modo headless por um orquestrador externo "
    "(livro_runner.py v2). Regras invioláveis:\n"
    "1) ESTADO_LIVRO.json e gerido pelo runner. NAO altere 'fase_atual', "
    "'capitulos_aprovados' nem 'palavras_totais' (o runner deriva isso do "
    "disco). NUNCA dispare /goal.\n"
    "2) Trabalhe SOMENTE dentro desta pasta de projeto.\n"
    "3) Faca o que esta fase pede e encerre. Nao invente conclusao: o runner "
    "verifica os ARQUIVOS no disco.\n"
)

PROMPT_ESTRUTURA = (
    PREAMBULO +
    "\nFASE ESTRUTURA. Produza a FUNDACAO escrivivel a partir de ./briefing.md.\n"
    "- Rode a skill `arquiteto-de-enredo` em modo NAO INTERATIVO (nao faca "
    "perguntas; para cada decisao use o briefing; quando omisso, adote o default "
    "e registre a suposicao no topo de Biblia-da-Obra.md sob "
    "'## SUPOSICOES ASSUMIDAS').\n"
    "- Gere: Biblia-da-Obra.md, Mapa-de-Personagens.md, Estrutura-do-Livro.md, as "
    "pastas (manuscrito/, specs/, contexto/, estado/, review/) e os 5 agentes em "
    ".claude/agents/. NAO dispare /goal e NAO escreva capitulos.\n"
    "- Em ESTADO_LIVRO.json preencha SOMENTE 'titulo' e "
    "'total_capitulos_previstos' (numero de capitulos da Estrutura).\n"
)


def prompt_escrita_capitulo(n, piso):
    return (
        PREAMBULO +
        "\nFASE ESCRITA — escreva SOMENTE o Capitulo {n}. Nenhum outro.\n"
        "Passos:\n"
        "1) Leia, para fidelidade: Biblia-da-Obra.md, Mapa-de-Personagens.md, "
        "a LINHA do Capitulo {n} em Estrutura-do-Livro.md (tier, PdV, beat), "
        "perfil-de-voz.md e estado/estado-narrativo.md (ledger + Mapa de "
        "Conhecimento do Leitor / 'O LEITOR JA SABE').\n"
        "2) OBRIGATORIO: delegue a ESCRITA ao subagente 'livro-escritor' via Task "
        "(ele roda em opus). Antes, 'livro-contextualizador' gera "
        "contexto/contexto-cap-{n}.md; depois, 'livro-revisor' revisa e atualiza o "
        "ledger + MCL. NAO escreva a prosa na sessao principal: a prosa nasce no "
        "subagente escritor (opus). \n"
        "3) Grave o capitulo final em '{arq}' — prosa de verdade, PT-BR, no PdV e "
        "tom do perfil de voz, terminando em gancho. OBRIGATORIO: no MINIMO "
        "{piso} palavras, mas escreva o capitulo COMPLETO (o piso e chao, nao teto) "
        "por MATERIAL NOVO: evento, virada, informacao, cena. PROIBIDO atingir o "
        "tamanho por recapitulacao, resumo, descricao decorativa sem funcao ou "
        "dialogo de enchimento. Se faltar materia, e falha de spec: pare e "
        "sinalize, NAO encha. NUNCA reexponha o que o leitor ja sabe (MCL).\n"
        "4) Atualize estado/estado-narrativo.md (fios, pistas, FATOS, resumo do "
        "capitulo e o MCL).\n"
        "NAO escreva nenhum outro capitulo. NAO toque em capitulos ja existentes. "
        "O runner so aceita este capitulo se '{arq}' tiver >= {piso} palavras.\n"
    ).format(n=n, arq=nome_cap(n).replace("\\", "/"), piso=piso)


def prompt_review(k):
    arq = "{}/review-iter-{}.md".format(DIR_REVIEW, k)
    return (
        PREAMBULO +
        "\nFASE REVIEW (iteracao {k}). Avalie o manuscrito de verdade.\n"
        "- Rode a skill `book-bestseller-review` sobre "
        "manuscrito/MANUSCRITO-MESTRE.md.\n"
        "- GRAVE O RELATORIO COMPLETO da skill no arquivo '{arq}' (o relatorio "
        "inteiro, com a analise por dimensao e as fraquezas — nao um resumo). O "
        "runner so aceita esta fase se esse arquivo existir e for substancial.\n"
        "- Determine a nota final 0.0-10.0 e, na ULTIMA linha do arquivo '{arq}' E "
        "tambem no stdout, imprima exatamente 'NOTA_FINAL: X.X'.\n"
        "- Grave as fraquezas acionaveis em 'pendencias_review' (lista de "
        "{{id,capitulo,localizacao,problema,severidade,resolvido:false}}), maior "
        "severidade primeiro. NAO altere fase_atual; o runner decide a bifurcacao.\n"
    ).format(k=k, arq=arq)

PROMPT_REESCRITA = (
    PREAMBULO +
    "\nFASE REESCRITA (cirurgica). Corrija SOMENTE as 'pendencias_review' "
    "(maior severidade primeiro), no capitulo correspondente em manuscrito/, "
    "preservando a voz; nao toque em trechos nao listados. Se um capitulo "
    "precisar crescer para pagar uma pendencia de densidade, AMPLIE com cena/"
    "descricao/dialogo novos (nunca recapitulacao). Se mudar fato/pista/linha do "
    "tempo, atualize estado/estado-narrativo.md (ledger + MCL). Marque cada "
    "pendencia tratada com 'resolvido': true e, ao fim de TODAS, grave "
    "'ultima_reescrita_iteracao' = valor atual de 'iteracoes_review'.\n"
)

PROMPT_EPUB = (
    PREAMBULO +
    "\nFASE EPUB. Rode a skill `edicao-kindle` sobre "
    "manuscrito/MANUSCRITO-MESTRE.md (front matter, geracao do .epub, validacao "
    "com epubcheck). Ao gerar e validar, grave 'epub_gerado': true e "
    "'epub_caminho': '<caminho relativo>'.\n"
)


# ----------------------------------------------------------------------------
# Chamada headless ao Claude Code
# ----------------------------------------------------------------------------
def parse_nota(texto):
    notas = RE_NOTA.findall(texto or "")
    if not notas:
        return None
    try:
        return round(float(notas[-1].replace(",", ".")), 1)
    except ValueError:
        return None


def ler_arquivo(projeto, rel):
    try:
        with open(os.path.join(projeto, rel), "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def run_claude(projeto, prompt, args):
    cmd = [args.claude_bin, "-p", prompt, "--permission-mode", "bypassPermissions"]
    if getattr(args, "model", None):
        cmd += ["--model", args.model]
    log(projeto, "Disparando Claude headless modelo={} (<prompt {} chars>).".format(getattr(args, "model", "default"), len(prompt)))
    timeout = int(args.fase_timeout) or None
    try:
        proc = subprocess.run(cmd, cwd=projeto, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except FileNotFoundError:
        log(projeto, "ERRO: binario '{}' nao encontrado. Use --claude-bin.".format(args.claude_bin))
        raise
    except subprocess.TimeoutExpired:
        log(projeto, "AVISO: estourou --fase-timeout ({}s); tratada como estagnacao.".format(args.fase_timeout))
        return 124, "", "timeout"
    out = proc.stdout or ""
    rabicho = "\n".join((out.strip().splitlines() or [""])[-6:])
    log(projeto, "Claude rc={}. Fim do transcript:\n{}".format(proc.returncode, rabicho))
    if (proc.stderr or "").strip():
        log(projeto, "stderr: {}".format(proc.stderr.strip()[-400:]))
    return proc.returncode, out, proc.stderr or ""


# Assinatura do LIMITE DO MAX (espelha worker/src/limite-max.ts). E throttle, NAO erro.
_RE_LIMITE_MAX = re.compile(
    u"hit your (?:session|usage) limit|(?:session|usage) limit reached|usage limit|"
    u"limit reached|limite de uso do plano max|plano max atingido", re.I | re.U)
_RE_RESET_HORA = re.compile(
    u"(?:reset[s]?|reseta)\\s*(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?\\s*m\\.?|\\d{1,2}:\\d{2})", re.I | re.U)


def detecta_limite_max(texto):
    return bool(texto) and bool(_RE_LIMITE_MAX.search(texto))


def hora_reset(texto):
    m = _RE_RESET_HORA.search(texto or "")
    return m.group(1).strip() if m else ""


# ----------------------------------------------------------------------------
# Portao de maneirismo por capitulo (deterministico, na origem)
# ----------------------------------------------------------------------------
# Tiques mecanicos cross-capitulo: o modelo os repete porque cada capitulo e
# contexto fresco. So contagem + reescrita resolve (instrucao de "evitar" nao).
# Espelha worker/src/maneirismo.ts. Orcamento: <= 1 de cada molde por capitulo.
_MOLDES_CAP = [
    ("antitese 'nao era X. Era Y.'", re.compile(u"\\bn[ãa]o\\s+(?:era|foi|fora|é|seria)\\b[^.!?\\n]{0,60}[.!?]\\s+(?:era|foi|fora|é|seria)\\b", re.I | re.U)),
    ("aposto antitetico", re.compile(u"\\bn[ãa]o\\s+(?:era|foi|é)\\s+[^.,;:!?\\n]{1,30}[;:,]\\s*(?:era|foi|é|mas|e\\s+sim)\\b", re.I | re.U)),
    ("antitese 'nao X, mas Y'", re.compile(u"\\bn[ãa]o\\s+\\w[^.,;!?\\n]{0,50}[,;]\\s*(?:mas|e\\s+sim|sen[ãa]o)\\s+", re.I | re.U)),
    ("fragmento antitetico", re.compile(u"(?:^|[.!?]\\s)N[ãa]o\\s+[^.!?\\n]{1,45}[.!?]\\s+[A-ZÀ-Ý]", re.U)),
    ("'do jeito que/de'", re.compile(u"\\bdo\\s+jeito\\s+(?:que|de|como)\\b", re.I | re.U)),
]
PER_CAP_BUDGET = 1


def maneirismos_acima(texto):
    """Lista (nome, n) dos moldes que passam do orcamento por capitulo."""
    out = []
    for nome, rx in _MOLDES_CAP:
        n = len(rx.findall(texto or ""))
        if n > PER_CAP_BUDGET:
            out.append((nome, n))
    return out


def gate_maneirismo_capitulo(projeto, n, args):
    """Depois de escrever o capitulo n: se algum molde estourou o orcamento,
    dispara UMA reescrita-alvo (bounded: 0 ou 1 por escrita, nao bloqueia o
    avanco do livro). Nomeia as linhas/moldes ofensores."""
    txt = ler_arquivo(projeto, nome_cap(n))
    if not txt:
        return
    offs = maneirismos_acima(txt)
    if not offs:
        return
    lista = "; ".join("{} {}x".format(nome, cnt) for nome, cnt in offs)
    arq = nome_cap(n).replace("\\", "/")
    log(projeto, "GATE MANEIRISMO cap {}: acima do orcamento -> reescrevendo ({}).".format(n, lista))
    prompt = (
        "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n"
        "REVISAO DE PROSA do {arq}: os MOLDES abaixo estao SOBRE-REPRESENTADOS neste "
        "capitulo (contagem real). Reduza CADA UM para no maximo {b} ocorrencia, "
        "DESADENSANDO o tique (reescreva a construcao repetida com sintaxe variada), "
        "PRESERVANDO sentido e voz. NAO reescreva a cena a toa; so desfaca o tique. "
        "Regrave o MESMO arquivo {arq}.\n"
        "Molde(s) acima do orcamento ({b}/capitulo): {lista}\n"
    ).format(arq=arq, b=PER_CAP_BUDGET, lista=lista)
    run_claude(projeto, prompt, args)


# ----------------------------------------------------------------------------
# Detector BOOK-WIDE de maneirismo (espelha worker/src/maneirismo.ts) + orcamento
# global CUMULATIVO. O gate por capitulo reduz a carga; este e a garantia dura:
# nenhum molde acumula acima do alvo no livro inteiro.
# ----------------------------------------------------------------------------
# Orcamento por molde em ocorrencias por 10 mil palavras (mesmos alvos do TS).
ORC10K_GLOBAL = {
    "antitese 'nao era X. Era Y.'": 1.5,
    "aposto antitetico": 1.0,
    "antitese 'nao X, mas Y'": 1.5,
    "fragmento antitetico": 1.5,
    "'do jeito que/de'": 2.5,
}
FECHO_MAX_FRACAO = 0.25       # fecho epigramatico isolado em no maximo 1/4 dos capitulos
NGRAM_MIN = 8                 # n-grama generico: >= 8 ocorrencias no livro
NGRAM_LIMIAR_POR10K = 3.0
NGRAM_TOP = 8
_STOP_PT = set((
    u"a o as os um uma uns umas de da do das dos e em no na nos nas que se com por para "
    u"ao à às aos seu sua seus suas é era foi fora ele ela eles elas isso isto lhe lhes me te "
    u"mas como mais já não sim ou nem entre sobre sem até onde quando quem qual cada todo toda "
    u"dele dela deles delas num numa pelo pela pelos pelas").split())


def _ler_caps(projeto, total):
    caps = []
    for n in range(1, int(total) + 1):
        p = os.path.join(projeto, nome_cap(n))
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as fh:
                caps.append(fh.read())
        else:
            caps.append("")
    return caps


def _fecho_isolado(caps, max_pal=8):
    idx = []
    for i, cap in enumerate(caps, 1):
        linhas = [l.strip() for l in (cap or "").strip().split("\n") if l.strip()]
        if not linhas:
            continue
        ult = linhas[-1]
        if 0 < len(ult.split()) <= max_pal and not ult.startswith("#") and re.search(u"[.!?…][\"'”’)]?$", ult, re.U):
            idx.append(i)
    return idx


def _ngramas_sobrerep(texto):
    palavras = [w.lower() for w in re.findall(u"[A-Za-zÀ-ÿ’'\\-]+", texto or "", re.U)]
    total = len(palavras)
    freq = {}
    for n in (4, 5):
        for i in range(0, len(palavras) - n + 1):
            sl = palavras[i:i + n]
            if sum(1 for w in sl if w not in _STOP_PT) < 2:
                continue
            g = " ".join(sl)
            freq[g] = freq.get(g, 0) + 1
    hits = []
    for g, c in freq.items():
        if c < NGRAM_MIN:
            continue
        por10k = round(c / total * 10000, 1) if total else 0
        if por10k >= NGRAM_LIMIAR_POR10K:
            hits.append((g, c, por10k))
    hits.sort(key=lambda x: -x[1])
    return hits[:NGRAM_TOP]


def diagnostico_book_wide(projeto, total):
    """Conta moldes + fecho + n-gramas no manuscrito INTEIRO (verdade do disco).
    Retorna (acima, relatorio) — acima = lista de descricoes ACIMA do orcamento."""
    caps = _ler_caps(projeto, total)
    full = "\n\n".join(caps)
    palavras = len(full.split())
    acima, relatorio = [], []
    for nome, rx in _MOLDES_CAP:
        if nome not in ORC10K_GLOBAL:
            continue
        n = len(rx.findall(full))
        alvo = max(1, int(round(ORC10K_GLOBAL[nome] * palavras / 10000.0)))
        if n > alvo:
            acima.append("molde \"{}\": {}x -> reduza para <= {}".format(nome, n, alvo))
        relatorio.append("{} {}: {}x (alvo <= {})".format("[X]" if n > alvo else "[ ]", nome, n, alvo))
    fecho = _fecho_isolado(caps)
    fecho_alvo = max(1, int(len(caps) * FECHO_MAX_FRACAO))
    if len(fecho) > fecho_alvo:
        acima.append("fecho epigramatico isolado em {}/{} capitulos -> <= {} (varie os fechamentos; caps: {})".format(
            len(fecho), len(caps), fecho_alvo, ",".join(map(str, fecho[:12]))))
    for g, c, d in _ngramas_sobrerep(full):
        acima.append("repeticao \"{}\": {}x ({}/10k) -> varie".format(g, c, d))
    return acima, "\n".join(relatorio)


def prompt_desmaneirismo(projeto, state, piso):
    total = _i(state.get("total_capitulos_previstos"))
    acima, _rel = diagnostico_book_wide(projeto, total)
    alvos = "\n".join("- " + a for a in acima[:16])
    return (
        PREAMBULO +
        "\nFASE DESMANEIRISMO (anti-repeticao, LIVRO INTEIRO). Os MOLDES abaixo estao "
        "SOBRE-REPRESENTADOS no manuscrito consolidado (contagem REAL do detector). "
        "Reduza CADA UM ao alvo, DESADENSANDO o tique: delegue ao subagente "
        "`livro-revisor` (ou `livro-escritor`) em opus via Task, que reescreve a "
        "construcao repetida com sintaxe variada, PRESERVANDO sentido, fatos e voz. "
        "NAO reescreva cena a toa; so desfaca a repeticao. Edite os capitulo-NN.md "
        "afetados (cada um deve continuar com >= {piso} palavras) e NAO deixe "
        "meta-texto/comentario. Encerre a passada quando reduzir os moldes.\n"
        "MOLDES ACIMA DO ORCAMENTO (book-wide):\n{alvos}\n"
    ).format(piso=piso, alvos=alvos)


# ----------------------------------------------------------------------------
# Loop principal
# ----------------------------------------------------------------------------
def executar(projeto, args):
    piso = int(args.piso)
    state = bootstrap_state(projeto, args)
    log(projeto, "=== runner v2 iniciado. fase={} meta={} max_reescritas={} piso={} "
                 "epub={} ===".format(state["fase_atual"], state["meta_nota"],
                 state["max_iteracoes_reescrita"], piso, state["gerar_epub"]))

    # Cada invocacao do runner e um run NOVO. O contador de estagnacao conta passos
    # SEM PROGRESSO DENTRO deste run — nao atraves de re-enfileiramentos do worker.
    # Throttle do Max em runs anteriores nao pode envenenar este: reseta no inicio.
    s0 = ensure_fields(load_state(projeto), args)
    if _i(s0["_runner"].get("tentativas_sem_progresso")) or s0.get("aguardando_reset"):
        log(projeto, "Inicio do run: reset do contador de estagnacao (era {}) e aguardando_reset.".format(
            s0["_runner"].get("tentativas_sem_progresso")))
    s0["_runner"]["tentativas_sem_progresso"] = 0
    s0["aguardando_reset"] = False
    save_state(projeto, s0)

    while True:
        state = ensure_fields(load_state(projeto), args)
        state = sincroniza_contadores_do_disco(projeto, state, piso)  # disco manda
        save_state(projeto, state)
        fase = state["fase_atual"]

        if fase == "CONCLUIDO":
            tot = _i(state.get("total_capitulos_previstos"))
            validos = len(capitulos_validos(projeto, tot, piso)) if tot else 0
            log(projeto, "=== CONCLUIDO. caps_validos={}/{} palavras={} nota={} "
                         "teto={} epub={} ({}). ===".format(
                             validos, tot, state.get("palavras_totais"),
                             state.get("ultima_nota"), state.get("teto_atingido"),
                             state.get("epub_gerado"), state.get("epub_caminho")))
            if state.get("teto_atingido"):
                log(projeto, "AVISO: encerrado por TETO DE REESCRITA sem atingir a meta.")
            return 0

        # CONSOLIDACAO é feita pelo runner, sem chamar o agente (sem superfície de trapaça)
        if fase == "CONSOLIDACAO":
            palavras = consolida(projeto, state, piso)
            state["fase_atual"] = "REVIEW"
            state["_runner"]["tentativas_sem_progresso"] = 0
            save_state(projeto, state)
            log(projeto, ">>> CONSOLIDACAO (runner) ok: {} palavras -> REVIEW.".format(palavras))
            continue

        sig_before = signature(projeto, state, piso)
        iter_before = _i(state.get("iteracoes_review"))

        # Monta o prompt da fase
        if fase == "ESTRUTURA":
            prompt = PROMPT_ESTRUTURA
        elif fase == "ESCRITA":
            tot = _i(state.get("total_capitulos_previstos"))
            alvo = proximo_capitulo_pendente(projeto, tot, piso)
            if alvo is None:
                state["fase_atual"] = "CONSOLIDACAO"
                save_state(projeto, state)
                continue
            log(projeto, "--- ESCRITA: capitulo alvo = {} (validos={}/{}) ---".format(
                alvo, len(capitulos_validos(projeto, tot, piso)), tot))
            prompt = prompt_escrita_capitulo(alvo, piso)
        elif fase == "REVIEW":
            prompt = prompt_review(iter_before + 1)
        elif fase == "REESCRITA":
            prompt = PROMPT_REESCRITA
        elif fase == "DESMANEIRISMO":
            prompt = prompt_desmaneirismo(projeto, state, piso)
        elif fase == "EPUB":
            prompt = PROMPT_EPUB
        else:
            prompt = PREAMBULO

        log(projeto, "--- Executando fase {} (assinatura antes: {}) ---".format(fase, sig_before))
        rc, out, err = run_claude(projeto, prompt, args)
        state = ensure_fields(load_state(projeto), args)
        state = sincroniza_contadores_do_disco(projeto, state, piso)

        # LIMITE DO MAX: throttle, NAO estagnacao. Nao incrementa o contador; grava
        # marca limpa e parseavel (estado + stdout) e encerra para o worker pausar e
        # retomar do disco (sem queimar tentativa). Nao confiar no eco volatil do CLI.
        if detecta_limite_max((out or "") + "\n" + (err or "")):
            reset = hora_reset((out or "") + "\n" + (err or ""))
            state["_runner"]["tentativas_sem_progresso"] = 0
            state["aguardando_reset"] = True
            state["reset_at"] = reset
            save_state(projeto, state)
            log(projeto, "LIMITE DO MAX na fase {} (reset={}). Throttle != estagnacao: "
                         "encerrando para o worker pausar e retomar.".format(fase, reset or "?"))
            print("RUNNER_LIMITE_MAX reset={}".format(reset or "?"), flush=True)
            return 0

        # Portao de maneirismo na ORIGEM: se o capitulo recem-escrito estourou o
        # orcamento de tiques, dispara UMA reescrita-alvo (bounded; nao bloqueia).
        if fase == "ESCRITA" and alvo is not None:
            gate_maneirismo_capitulo(projeto, alvo, args)

        # DESMANEIRISMO: reconsolida o MESTRE dos capitulos editados e conta de novo;
        # cada passada incrementa o contador (= progresso, reentrante via disco).
        if fase == "DESMANEIRISMO":
            consolida(projeto, state, piso)
            state["desmaneirismo_iters"] = _i(state.get("desmaneirismo_iters")) + 1
            save_state(projeto, state)
            acima, _rel = diagnostico_book_wide(projeto, _i(state.get("total_capitulos_previstos")))
            log(projeto, "DESMANEIRISMO iter {}/{}: {} item(s) ainda acima do orcamento.".format(
                state["desmaneirismo_iters"], _i(state.get("max_desmaneirismo")), len(acima)))

        # REVIEW: só aceita com ARTEFATO real no disco; nota vem do arquivo.
        if fase == "REVIEW":
            k = iter_before + 1
            rel_report = "{}/review-iter-{}.md".format(DIR_REVIEW, k)
            report = ler_arquivo(projeto, rel_report)
            if len(report) >= MIN_REVIEW_CHARS:
                nota = parse_nota(report) or parse_nota(out)
                if nota is not None and _i(state.get("iteracoes_review")) <= iter_before:
                    state["ultima_nota"] = nota
                    state["iteracoes_review"] = iter_before + 1
                    state.setdefault("historico_notas", []).append(nota)
                    log(projeto, "REVIEW aceita: relatorio {} chars, nota {}.".format(len(report), nota))
                    save_state(projeto, state)
            else:
                log(projeto, "REVIEW REJEITADA: review-iter-{}.md ausente/curto "
                             "({} chars < {}). Sem nota — re-disparando.".format(
                                 k, len(report), MIN_REVIEW_CHARS))

        if done_condition(projeto, fase, state, iter_before, piso):
            nxt = next_phase(fase, state)
            if nxt == "CONSOLIDACAO":
                state["palavras_totais"] = 0
            state["fase_atual"] = nxt
            state["_runner"]["tentativas_sem_progresso"] = 0
            save_state(projeto, state)
            log(projeto, ">>> Fase {} CONCLUIDA -> {} (caps={}/{}, palavras={}, "
                         "nota={}, iter={}, teto={}).".format(
                             fase, nxt, state.get("capitulos_aprovados"),
                             state.get("total_capitulos_previstos"),
                             state.get("palavras_totais"), state.get("ultima_nota"),
                             state.get("iteracoes_review"), state.get("teto_atingido")))
            continue

        # Não terminou: progrediu ou estagnou? (assinatura do DISCO)
        sig_after = signature(projeto, state, piso)
        if sig_after != sig_before:
            state["_runner"]["tentativas_sem_progresso"] = 0
            save_state(projeto, state)
            log(projeto, "Progresso parcial na fase {}; re-disparando para CONTINUAR.".format(fase))
        else:
            n = _i(state["_runner"].get("tentativas_sem_progresso")) + 1
            state["_runner"]["tentativas_sem_progresso"] = n
            save_state(projeto, state)
            limite = _i(args.max_estagnacao)
            log(projeto, "SEM progresso na fase {} ({}/{}).".format(fase, n, limite))
            if n >= limite:
                log(projeto, "!!! ESTAGNACAO: {} tentativas sem progresso na fase {}. "
                             "Parando com aviso. Inspecione runner.log e o disco, "
                             "conserte o bloqueio e rode o runner de novo "
                             "(ele retoma daqui).".format(n, fase))
                return 2
            log(projeto, "Re-disparando a MESMA fase {} (retomar, nao reiniciar).".format(fase))


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def build_argparser():
    p = argparse.ArgumentParser(
        description="Orquestrador a prova de parada E de trapaca: da ideia ao EPUB.")
    p.add_argument("--projeto", required=True, help="Pasta do projeto (cwd das chamadas).")
    p.add_argument("--briefing", default=None, help="Caminho do briefing.md.")
    p.add_argument("--epub", action="store_true", help="Gerar EPUB ao final.")
    p.add_argument("--meta", type=float, default=9.0, help="Nota minima (default 9.0).")
    p.add_argument("--max-reescritas", type=int, default=4, help="Rodadas de reescrita (default 4).")
    p.add_argument("--max-estagnacao", type=int, default=3, help="Tentativas sem progresso antes de parar (default 3).")
    p.add_argument("--max-desmaneirismo", type=int, default=3, help="Iteracoes da fase DESMANEIRISMO book-wide (default 3).")
    p.add_argument("--piso", type=int, default=PISO_PALAVRAS_DEFAULT,
                   help="Piso de palavras por capitulo (default {}).".format(PISO_PALAVRAS_DEFAULT))
    p.add_argument("--fase-timeout", type=int, default=0, help="Timeout por chamada (s; 0 = sem).")
    p.add_argument("--claude-bin", default="claude", help="Binario do Claude Code (default 'claude').")
    p.add_argument("--model", default="opus", help="Modelo da sessao headless (default 'opus'). Subagentes mantem o modelo do proprio frontmatter (haiku/sonnet).")
    p.add_argument("--dry-run", action="store_true", help="So bootstrap do ESTADO_LIVRO.json e sai.")
    return p


def main(argv=None):
    args = build_argparser().parse_args(argv)
    projeto = os.path.abspath(os.path.expanduser(args.projeto))
    if args.dry_run:
        state = bootstrap_state(projeto, args)
        log(projeto, "DRY-RUN: estado criado/reparado. fase={}.".format(state["fase_atual"]))
        print(json.dumps(state, ensure_ascii=False, indent=2))
        return 0
    return executar(projeto, args)


if __name__ == "__main__":
    raise SystemExit(main())
