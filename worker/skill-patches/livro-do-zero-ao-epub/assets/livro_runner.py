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
import unicodedata

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
    # ARQUIVO antes do print: no Windows o stdout herdado pode ser cp1252
    # (errors=strict) e um caractere fora dele (✓ → emoji) matava o processo
    # ANTES de persistir a linha — a "morte silenciosa" que comia runs inteiros.
    try:
        with open(os.path.join(projeto, ARQ_LOG), "a", encoding="utf-8") as fh:
            fh.write(linha + "\n")
    except OSError:
        pass
    try:
        print(linha, flush=True)
    except (UnicodeEncodeError, OSError):
        pass  # stdout hostil (encoding/pipe fechado) nunca derruba o runner


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
# ESTADO EDITORIAL (camada editorial) — espelha worker/src/estado-editorial.ts.
# estado/estado-editorial.json: estruturado, schema-free. Projeto sem o arquivo →
# schema default (nao quebra legado). Alicerce das Fases 2-8.
# ----------------------------------------------------------------------------
ARQ_ESTADO_EDITORIAL = os.path.join("estado", "estado-editorial.json")


def _estado_editorial_default():
    return {
        "motif_ledger": [], "open_loops": [], "paid_loops": [],
        "source_reveal_streak": 0, "agency_balance": {}, "exposition_risk": 0,
        "semantic_repetition_risk": 0, "last_high_impact_scene": None,
        "commercial_blockers": [], "next_chapter_editorial_requirements": [],
    }


def _merge_estado_editorial(parcial):
    d = _estado_editorial_default()
    p = parcial or {}
    for k, dv in d.items():
        v = p.get(k, dv)
        if isinstance(dv, list) and not isinstance(v, list):
            v = dv
        elif isinstance(dv, dict) and not isinstance(v, dict):
            v = dv
        elif isinstance(dv, int) and not isinstance(dv, bool) and not isinstance(v, (int, float)):
            v = dv
        d[k] = v
    return d


def load_estado_editorial(projeto):
    try:
        with open(os.path.join(projeto, ARQ_ESTADO_EDITORIAL), "r", encoding="utf-8") as fh:
            return _merge_estado_editorial(json.load(fh))
    except (OSError, ValueError):
        return _estado_editorial_default()


def save_estado_editorial(projeto, estado):
    d = os.path.join(projeto, "estado")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    p = os.path.join(projeto, ARQ_ESTADO_EDITORIAL)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(_merge_estado_editorial(estado), fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, p)


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


def _marcador_revcap(projeto, n):
    return os.path.join(projeto, DIR_REVIEW, "_revcap-{:02d}.done".format(int(n)))


def _marcador_revtry(projeto, n):
    # Fix C: bound da re-revisao dirigida. Existir = ja houve 1 passada em que a guarda
    # deterministica reprovou (piso/tiques); a 2a passada aceita para nao travar o livro.
    return os.path.join(projeto, DIR_REVIEW, "_revcap-{:02d}.try".format(int(n)))


def primeiro_cap_nao_revisado(projeto, total, piso):
    """Micro-loop: 1o capitulo VALIDO (escrito) ainda sem marcador de revisao.
    Reentrante via disco — se o Max bater no meio, a revisao re-roda do ponto."""
    for n in capitulos_validos(projeto, total, piso):
        if not os.path.exists(_marcador_revcap(projeto, n)):
            return n
    return None


def revisao_ligada(args):
    """Time por capitulo (escritor->revisor->editor) e o PADRAO. Desliga so com
    --sem-revisao-por-capitulo ou env REVISAO_POR_CAPITULO=0 (escape hatch)."""
    if os.environ.get("REVISAO_POR_CAPITULO") == "0":
        return False
    return not getattr(args, "sem_revisao_por_capitulo", False)


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
    state["revisao_por_capitulo"] = revisao_ligada(args)
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
        if not (tot > 0 and len(capitulos_validos(projeto, tot, piso)) >= tot):
            return False
        # Micro-loop ligado: so conclui ESCRITA quando todos os capitulos validos
        # tambem foram REVISADOS (escritor->revisor->editor).
        if s.get("revisao_por_capitulo") and primeiro_cap_nao_revisado(projeto, tot, piso) is not None:
            return False
        return True
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
        "Conhecimento do Leitor / 'O LEITOR JA SABE'). Se existir "
        "specs/Spec-Capitulo-{n:02d}.md, ela e a SPEC CANONICA do capitulo: cumpra "
        "Fio de POV, Dia/Hora corrente e o plano de Montagem (corte de/para no pico). "
        "Se existir dossie-factual.md, TODO fato do mundo real usado na prosa vem de "
        "la (status VERIFICADO) ou entra MARCADO como hipotese na propria cena — "
        "nunca fato real de memoria parametrica. DENTRO do perfil-de-voz.md, leia "
        "e SIGA o bloco '## CRAFT DA SKILL' (marcador CRAFT-SKILL): e o motor + as regras "
        "da skill (alvo do escritor), nao decoracao — o capitulo precisa CUMPRI-LO "
        "(propulsao, montagem/corte de cena, exposicao dramatizada, interioridade com "
        "custo em acao, gancho honesto, sem coincidencia).\n"
        "   VOZ vs FATOS: o digest do contextualizador e para FATOS/continuidade; a VOZ/"
        "TECNICA o escritor le DIRETO da craft a CADA capitulo, NUNCA de resumo comprimido. "
        "OBRIGATORIO o livro-escritor LER e SEGUIR os arquivos de craft da skill_escrita em "
        "~/.claude/skills/<skill_escrita>/references/ — para skill-dan-brown: voz-e-oficio.md "
        "(as 5 regras) e metamodelo-thriller.md (o motor) — alem do bloco CRAFT DA SKILL do "
        "perfil. 'Invocar a skill' = LER esses arquivos, nao so o resumo do SKILL.md.\n"
        "2) OBRIGATORIO: delegue a ESCRITA ao subagente 'livro-escritor' via Task "
        "(ele roda em opus). Antes, 'livro-contextualizador' gera "
        "contexto/contexto-cap-{n:02d}.md; depois, 'livro-revisor' revisa e atualiza o "
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


def prompt_revisao_capitulo(projeto, n, args, piso):
    """Micro-loop por capitulo (Frente 2): revisor leve -> editor, ANTES de aceitar.
    Porta a arquitetura de papeis da Saga (livro-revisor / livro-editor) para o motor."""
    arq = nome_cap(n).replace("\\", "/")
    maxed = int(getattr(args, "max_edicoes_por_cap", 6))
    # Cota da Regra 4 (ritmo) COM AS CONTAGENS REAIS deste capitulo, para o revisor
    # cobrar por NUMERO, nao por impressao.
    txt_cap = ler_arquivo(projeto, nome_cap(n))
    cads = cadencia_acima(txt_cap, _skill_projeto(projeto))
    if cads:
        bloco_cad = ("contagem REAL deste capitulo, ACIMA do orcamento -> exija que o "
                     "editor VARIE O RITMO (funda frases curtas coladas, encadeie na "
                     "revelacao, quebre anafora/clipe), nao so corte: " +
                     "; ".join("{} {}x (alvo <= {})".format(nm, c, a) for nm, c, a in cads))
    else:
        bloco_cad = "dentro do orcamento de tiques contados; mas NAO confie so na lista (veja o item holistico)."
    # Sinal heuristico de interioridade-sem-evento (evidencia para o revisor, nao bloqueio).
    inter_flag, est_pct, dlg_pct = interioridade_sem_evento(txt_cap)
    bloco_inter = ("ALERTA: {}% das frases sao copula/percepcao e so {}% tem dialogo -> o "
                   "capitulo pode estar 'bem escrito e CHATO' (sensacao sobre sensacao, "
                   "sem que nada aconteca na cena). Dramatize ou corte a decoracao."
                   ).format(est_pct, dlg_pct) if inter_flag else \
                  "densidade de acao/dialogo aceitavel ({}% estatico).".format(est_pct)
    # VEREDITO DE PROPULSAO ("isto esta vivo?"): por padrao roda no revisor (sonnet);
    # com --revisor-craft-opus, eleva esse julgamento a um subagente opus (custo Max).
    bloco_prop = ("PARA O VEREDITO DE PROPULSAO (item h), delegue a um subagente em OPUS via "
                  "Task (escritor/juiz) — julgamento de craft caro, mais fino.\n   "
                  if getattr(args, "revisor_craft_opus", False) else "")
    # Fix C: DELEGA a revisao (nao raciocina inline). O criterio de critica (checklist
    # a-h + VEREDITO DE PROPULSAO) JA VIVE no agente `livro-revisor`, que le a spec, a
    # Biblia/Mapa, o estado-narrativo e a craft (voz-e-oficio+metamodelo) no PROPRIO
    # contexto isolado. Aqui o orquestrador so ROTEIA e passa a EVIDENCIA DINAMICA que o
    # agente nao recomputa (as contagens reais do detector). Isso tira a leitura+raciocinio
    # da sessao gorda (cache_read gigante) -> corta o output do orquestrador sem perder
    # qualidade. A guarda deterministica (piso + tiques cairam) roda no runner, apos.
    return (
        PREAMBULO +
        "\nFASE ESCRITA - REVISAO POR CAPITULO do {arq} (micro-loop DELEGADO). Este "
        "capitulo JA foi escrito. ROTEIE via Task; NAO releia nem re-julgue o capitulo "
        "voce mesmo (os subagentes leem a fundacao/craft no proprio contexto):\n"
        "1) Task -> `livro-revisor` (sonnet): critique SOMENTE {arq} pelo SEU checklist de "
        "conformidade + o VEREDITO DE PROPULSAO ('isto esta vivo?') que voce ja conhece "
        "(fair-play, cota de tiques, info-dump, interioridade-com-custo, relogio, "
        "coincidencia, nao-reexposicao, corte-no-pico, exposicao dramatizada). Some a isso "
        "a EVIDENCIA REAL deste capitulo (contagens do detector, NAO recompute): {bloco_cad} "
        "{bloco_inter} {bloco_prop}"
        "Devolva uma LISTA de ate {maxed} EDICOES PONTUAIS (trecho -> correcao) que INJETAM "
        "propulsao (dramatize, corte no pico, encadeie a caca as pistas) e VARIAM o ritmo "
        "(FUNDA colados, quebre anafora/clipe), nao so cortam tique. NAO e recontacao nem o "
        "review book-wide.\n"
        "2) Task -> `livro-editor` (haiku): aplique as edicoes no {arq}; troque TODA 'coisa' "
        "generica pelo referente concreto; FUNDA as frases curtas coladas (nao so corte); "
        "ELEVE no maximo 1 movimento (drama/tensao/subtexto) sem contrariar a spec; PRESERVE "
        "sentido e voz. CONTINUIDADE (obrigatorio): EDITE o LEDGER EXISTENTE "
        "estado/estado-narrativo.md - NAO crie arquivo novo, NAO escreva noutro lugar; "
        "atualize NELE o que mudou (MCL, fios abertos, pistas plantadas/pagas, relogios). "
        "Regrave o MESMO {arq} (>= {piso} palavras).\n"
        "3) Encerre. NAO gere a critica nem a prosa na SUA sessao - so dispare os dois Tasks "
        "e confirme que {arq} foi regravado.\n"
    ).format(arq=arq, n=n, maxed=maxed, piso=piso, bloco_cad=bloco_cad, bloco_inter=bloco_inter, bloco_prop=bloco_prop)


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


# Fases que rodam INLINE na sessao do orquestrador (sem delegar prosa a um subagente):
# precisam do modelo PESADO (opus). REVIEW roda o book-bestseller-review; REESCRITA e
# prosa cirurgica; ESTRUTURA gera a fundacao. As demais (ESCRITA/DESMANEIRISMO) so
# ROTEIAM e delegam a prosa ao subagente escritor (opus via frontmatter) -> orquestrador barato.
FASES_PESADAS = {"ESTRUTURA", "REVIEW", "REESCRITA"}


def modelo_da_fase(fase, args):
    if fase in FASES_PESADAS and getattr(args, "model_pesado", None):
        return args.model_pesado
    return getattr(args, "model", None)


def run_claude(projeto, prompt, args, modelo=None):
    cmd = [args.claude_bin, "-p", prompt, "--permission-mode", "bypassPermissions"]
    modelo = modelo or getattr(args, "model", None)
    if modelo:
        cmd += ["--model", modelo]
    log(projeto, "Disparando Claude headless modelo={} (<prompt {} chars>).".format(modelo or "default", len(prompt)))
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
    ("antitese com 'haver' (Nao havia X... Havia Y)", re.compile(u"\\bn[ãa]o\\s+h(?:avia|á|ouve)\\b[^.!?\\n]{0,80}[.!?…]+\\s+(?:[^.!?\\n]{0,30}\\s)?h(?:avia|á)\\b", re.I | re.U)),
    ("antitese com 'haver' (mesma frase)", re.compile(u"\\bn[ãa]o\\s+h(?:avia|á|ouve)\\b[^.,;:!?\\n]{1,50}[,;]\\s*(?:mas\\s+|e\\s+sim\\s+)?h(?:avia|á)\\b", re.I | re.U)),
    ("simile-andaime ('como se / como quando')", re.compile(u"\\bcomo\\s+(?:se|quando)\\b", re.I | re.U)),
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


# LEXICO DE MULETAS (palavra inteira, case-insensitive). Espelha worker/src/maneirismo.ts.
# "coisa" e a pior (~1 a cada ~200 palavras): orcamento APERTADO. Tupla:
# (nome, regex, budget_por_capitulo, orcamento_por_10k_global).
_MULETAS = [
    (u"coisa/coisas", re.compile(u"\\bcoisas?\\b", re.I | re.U), 1, 4.0),
    (u"algo", re.compile(u"\\balgo\\b", re.I | re.U), 3, 8.0),
    (u"'meio que'", re.compile(u"\\bmeio que\\b", re.I | re.U), 1, 3.0),
    (u"simplesmente", re.compile(u"\\bsimplesmente\\b", re.I | re.U), 1, 3.0),
    (u"'de repente'", re.compile(u"\\bde repente\\b", re.I | re.U), 1, 4.0),
    (u"'na verdade'", re.compile(u"\\bna verdade\\b", re.I | re.U), 1, 4.0),
    (u"'parecia que'", re.compile(u"\\bparecia que\\b", re.I | re.U), 1, 3.0),
    # SPEC-08: token estrangeiro/typo de geracao (lista LITERAL; "sino" fora — e PT).
    # budget 0 = qualquer ocorrencia estoura. Espelha o TS.
    (u"lexico estrangeiro (typo)",
     re.compile(u"\\b(ninguño|ningún|ninguna|pero|entonces|mismo|misma|llegou|llegó|aunque|también|todavía|además)\\b", re.I | re.U),
     0, 0.0),
    # AUDITORIA-DAN-BROWN-V2 FASE -1: lexico de Portugal (rede de seguranca; a 1a linha
    # e a instrucao no perfil via lexico-ptbr.ts). Alvo 0.
    (u"lexico PT-PT (nao pt-BR)",
     re.compile(u"\\b(telemóve(?:l|is)|ecrã|autocarro(?:s)?|comboio(?:s)?|frigorífico|casa de banho|pequeno-almoço|autoclismo|talho)\\b", re.I | re.U),
     0, 0.0),
]


def muletas_acima_cap(texto):
    """Muletas acima do orcamento POR CAPITULO. 'coisa' estoura facil (budget 1)."""
    out = []
    for nome, rx, budget, _ in _MULETAS:
        n = len(rx.findall(texto or ""))
        if n > budget:
            out.append((nome, n, budget))
    return out


# ----------------------------------------------------------------------------
# AUDITORIA-DAN-BROWN-V2 (espelha worker/src/maneirismo.ts + exigencias-skill.ts).
# gap 1: repeticao verbatim CROSS-capitulo (ledger assinaturas-cross-capitulo.json).
# gap 2: monotonia de POV/fio a nivel-livro. gap 3b: aritmetica de Dia/Hora.
# ----------------------------------------------------------------------------
_STOP_NG = set((
    u"a o as os um uma uns umas de da do das dos e em no na nos nas que se com por para "
    u"ao à às aos seu sua seus suas é era foi fora ele ela eles elas isso isto lhe lhes me te "
    u"mas como mais já não sim ou nem entre sobre sem até onde quando quem qual cada todo toda "
    u"dele dela deles delas num numa pelo pela pelos pelas").split())


def _norm_trecho(s):
    t = unicodedata.normalize("NFD", s or "")
    t = u"".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = re.sub(u"[^a-z0-9\\s]", u" ", t, flags=re.U)
    return re.sub(u"\\s+", u" ", t).strip()


_RE_TAG_FALA = re.compile(u"^(disse|perguntou|respondeu|murmurou|sussurrou|repetiu|retrucou|indagou|exclamou|gritou|falou|acrescentou|continuou|concluiu|observou)\\b|,\\s+(disse|perguntou|respondeu|murmurou|sussurrou|repetiu|retrucou|indagou|acrescentou|observou)\\b", re.I | re.U)


def _eh_dialogo_ou_tag(f):
    ff = (f or "").strip()
    return bool(re.match(u"^[—–\\-\"'“”‘’]", ff, re.U)) or bool(_RE_TAG_FALA.search(ff))


def _extrair_slots_aforisticos(texto):
    t = _sem_headings(texto or "")
    brutos = []
    for par in re.split(u"\n{2,}", t):
        fr = dividir_frases(par)
        if len(fr) == 1 and not _eh_dialogo_ou_tag(fr[0]):
            brutos.append(fr[0])
    for m in re.finditer(u"[:—–]\\s*([A-Za-zÀ-ÿ][^.!?\\n:—–]{6,90}[.!?])", t, re.U):
        if not _eh_dialogo_ou_tag(m.group(1)):
            brutos.append(m.group(1))
    for f in dividir_frases(t):
        if _eh_dialogo_ou_tag(f):
            continue
        if re.search(u"\\b[ée]\\s+a\\s+defini[çc][ãa]o\\b", f, re.I | re.U) or re.search(u"\\bcomo\\s+(?:se|quando)\\b", f, re.I | re.U):
            brutos.append(f)
    seen, out = set(), []

    def emit(orig, norm):
        pal = [w for w in norm.split(u" ") if w]
        cont = len([w for w in pal if w not in _STOP_NG])
        if 3 <= len(pal) <= 16 and cont >= 3 and norm not in seen:
            seen.add(norm)
            out.append({"original": orig[:120], "normalizado": norm})

    for b in brutos:
        orig = re.sub(u"\\s+", u" ", b).strip()
        norm = _norm_trecho(orig)
        pal = [w for w in norm.split(u" ") if w]
        emit(orig, norm)
        for k in (6, 8):
            if len(pal) > k:
                emit(u" ".join(orig.split()[:k]), u" ".join(pal[:k]))
    # Prefixo (6 e 8 palavras) de TODA sentenca: a assinatura reciclada costuma ser o
    # INICIO de uma sentenca no meio de um paragrafo, que os slots aforisticos perdem.
    for f in dividir_frases(t):
        if _eh_dialogo_ou_tag(f):
            continue
        pal = [w for w in _norm_trecho(f).split(u" ") if w]
        ow = f.strip().split()
        for k in (6, 8):
            if len(pal) > k:
                emit(u" ".join(ow[:k]), u" ".join(pal[:k]))
    return out


def _shingles(norm, k=4):
    w = [x for x in norm.split(u" ") if x]
    s = set(u" ".join(w[i:i + k]) for i in range(0, len(w) - k + 1))
    if not s and w:
        s.add(u" ".join(w))
    return s


def _jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / float(len(a) + len(b) - inter)


LEDGER_CROSS = "assinaturas-cross-capitulo.json"


def _ler_ledger_cross(projeto):
    try:
        with open(os.path.join(projeto, LEDGER_CROSS), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []


def _escrever_ledger_cross(projeto, entradas):
    with open(os.path.join(projeto, LEDGER_CROSS), "w", encoding="utf-8") as fh:
        json.dump(entradas, fh, ensure_ascii=False, indent=0)


def detectar_repeticao_cross(texto_atual, anteriores):
    """anteriores: list de {'numero','trecho'}. Devolve list de
    {'trecho','cap','tipo','score'} (verbatim/quase-verbatim)."""
    slots = _extrair_slots_aforisticos(texto_atual)
    ant = [{"numero": a["numero"], "norm": _norm_trecho(a["trecho"]),
            "sh": _shingles(_norm_trecho(a["trecho"]))} for a in anteriores]
    out, ja = [], set()
    for s in slots:
        if s["normalizado"] in ja:
            continue
        v = next((a for a in ant if a["norm"] == s["normalizado"]), None)
        if v:
            out.append({"trecho": s["original"], "cap": v["numero"], "tipo": "verbatim", "score": 1.0})
            ja.add(s["normalizado"])
            continue
        ssh = _shingles(s["normalizado"])
        best = {"num": -1, "score": 0.0}
        for a in ant:
            j = _jaccard(ssh, a["sh"])
            if j > best["score"]:
                best = {"num": a["numero"], "score": j}
        if best["score"] >= 0.6:
            out.append({"trecho": s["original"], "cap": best["num"], "tipo": "quase-verbatim", "score": round(best["score"], 2)})
            ja.add(s["normalizado"])
    return out


def _atualizar_ledger_com_cap(projeto, n):
    """Regrava as entradas do capitulo n no ledger (idempotente em re-run)."""
    txt = ler_arquivo(projeto, nome_cap(n))
    if not txt:
        return
    ledger = [e for e in _ler_ledger_cross(projeto) if int(e.get("capitulo", 0)) != int(n)]
    for s in _extrair_slots_aforisticos(txt):
        ledger.append({"capitulo": int(n), "trecho_normalizado": s["normalizado"], "trecho_original": s["original"]})
    _escrever_ledger_cross(projeto, ledger)


# gap 2: monotonia de POV/fio a nivel-livro (espelha avaliarRotacaoFio no TS).
def _avaliar_rotacao_fio(fios, n, exig):
    out = []
    # Normaliza ao codigo/POV canonico ("H (Helena Caires)" -> "h"): corta no 1o "(".
    seq = [re.split(u"[(—–]", (f or ""))[0].strip().lower() for f in fios[:n]]
    if not seq or not seq[n - 1]:
        return out
    atual = seq[n - 1]
    absoluto = exig.get("max_absoluto")
    if absoluto and absoluto > 0:
        consec = 0
        i = n - 1
        while i >= 0 and seq[i] == atual:
            consec += 1
            i -= 1
        if consec > absoluto:
            out.append(u"teto absoluto: {} caps consecutivos no fio '{}' (max {}, Justificativa NAO derruba)".format(consec, atual, absoluto))
    jd = exig.get("janela")
    if jd and jd.get("tamanho", 0) > 0:
        jan = seq[max(0, n - jd["tamanho"]):n]
        if len(jan) >= jd["tamanho"]:
            cont = {}
            for f in jan:
                if f:
                    cont[f] = cont.get(f, 0) + 1
            for f, c in cont.items():
                ratio = c / float(len(jan))
                if ratio > jd["ratio_max"]:
                    out.append(u"monotonia: fio '{}' em {}/{} dos ultimos caps ({}% > {}%)".format(
                        f, c, len(jan), int(round(ratio * 100)), int(round(jd["ratio_max"] * 100))))
    return out


# gap 3b: aritmetica de Dia/Hora (espelha parseDiaHora/checarDiaHoraSequencia no TS).
_DIAS_SEMANA = [u"domingo", u"segunda", u"terca", u"quarta", u"quinta", u"sexta", u"sabado"]


def _parse_dia_hora(texto):
    t = _norm_trecho(texto)
    dia = -1
    for i, d in enumerate(_DIAS_SEMANA):
        if re.search(u"\\b" + d + u"(?:\\s*feira)?\\b", t):
            dia = i
            break
    m = re.search(u"\\bdia n\\s*\\+?\\s*(\\d+)\\b", t)
    if dia < 0 or not m:
        return None
    return (dia, int(m.group(1)))


def _dia_hora_linha(texto):
    for l in (texto or "").split(u"\n"):
        if re.search(u"Dia/Hora corrente", l, re.I):
            return l
    return ""


def _checar_dia_hora(projeto, n):
    """Checa o Dia/Hora do cap n contra o ultimo spec valido anterior. Motivo ou None."""
    def dh(k):
        try:
            with open(_spec_path(projeto, k), "r", encoding="utf-8") as fh:
                return _parse_dia_hora(_dia_hora_linha(fh.read()))
        except OSError:
            return None
    atual = dh(n)
    if not atual:
        return None
    prev = None
    for k in range(int(n) - 1, 0, -1):
        p = dh(k)
        if p:
            prev = (k, p)
            break
    if not prev:
        return None
    kprev, (da, oa) = prev[0], prev[1]
    db, ob = atual
    d_off = ob - oa
    if d_off < 0:
        return u"Dia/Hora: DIA N+{} retrocede vs N+{} (cap {})".format(ob, oa, kprev)
    esperado = ((da + d_off) % 7 + 7) % 7
    if db != esperado:
        return u"Dia/Hora: {} em DIA N+{} incoerente (cap {} era {} N+{}; +{}d => {})".format(
            _DIAS_SEMANA[db], ob, kprev, _DIAS_SEMANA[da], oa, d_off, _DIAS_SEMANA[esperado])
    return None


# ----------------------------------------------------------------------------
# FASE 2 — Agency Gate (espelha worker/src/estado-editorial.ts agenciaGenerica).
# ----------------------------------------------------------------------------
def _campo_spec(texto, campo):
    """Extrai o valor de um campo '- **Campo:** valor' da spec (accent-insensitive)."""
    alvo = _sem_acento(campo)
    for l in (texto or "").split("\n"):
        if alvo in _sem_acento(l) and ":" in l:
            return l.split(":", 1)[1].strip().lstrip("*").strip()
    return ""


_RE_PERCEPCAO_PY = re.compile(u"\\b(percebe|percebeu|nota|notou|sente|sentiu|entende|entendeu|imagina|imaginou|pensa|pensou|lembra|lembrou|repara|reparou|observa|observou)\\b", re.I | re.U)
_RE_ACAO_PY = re.compile(u"\\b(decid\\w+|escolh\\w+|faz|fez|age|agiu|arrisc\\w+|mat[ao]u?|ment\\w+|fog\\w+|fugiu|confront\\w+|roub\\w+|entrega|entregou|revela|revelou|abre|abriu|quebra|quebrou|corta|cortou|liga|ligou|invade|invadiu|persegue|perseguiu|salva|salvou|trai|traiu|destr[oó]i|destruiu)\\b", re.I | re.U)


def _agencia_generica(valor):
    v = (valor or "").strip()
    if len([w for w in v.split() if w]) < 8:
        return True
    if _RE_PERCEPCAO_PY.search(v) and not _RE_ACAO_PY.search(v):
        return True
    return False


def _fio_norm(f):
    return re.split(u"[(—–]", (f or ""))[0].strip().lower()


def _agencia_guarda(projeto, cap):
    """(ok, motivo). Reprova se 'Decisao/Acao' vier generico 2 caps seguidos do MESMO
    fio. Atualiza agency_balance no estado-editorial. Bounded na guarda do Fix C."""
    def spec_txt(n):
        try:
            with open(_spec_path(projeto, n), "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return ""
    cur = spec_txt(cap)
    if not cur:
        return (True, "")
    val = _campo_spec(cur, "Decisao/Acao")
    fio = _fio_da_spec(cur) or _campo_spec(cur, "Ponto de vista")
    if not _agencia_generica(val):
        if fio:
            ed = load_estado_editorial(projeto)
            ed["agency_balance"][_fio_norm(fio)] = int(ed["agency_balance"].get(_fio_norm(fio), 0)) + 1
            save_estado_editorial(projeto, ed)
        return (True, "")
    prev = spec_txt(int(cap) - 1)
    if prev and _agencia_generica(_campo_spec(prev, "Decisao/Acao")):
        fprev = _fio_da_spec(prev) or _campo_spec(prev, "Ponto de vista")
        if fprev and _fio_norm(fprev) == _fio_norm(fio):
            return (False, u"agencia: 'Decisao/Acao' generico 2 caps seguidos do fio '{}' (cena de escolha/acao ausente)".format(_fio_norm(fio)))
    return (True, "")


# ----------------------------------------------------------------------------
# FASE 3 — Novelty Gate (espelha estado-editorial.ts processarNovidade).
# ----------------------------------------------------------------------------
def _extrair_perguntas(novidade):
    n = novidade or ""
    def m(pats):
        for p in pats:
            r = re.search(p, n, re.I | re.U)
            if r:
                return r.group(1).strip()
        return None
    abre = m([u"pergunta\\s+aberta\\s*:?\\s*(.+)", u"\\babre\\s*:\\s*(.+)"])
    paga = m([u"pergunta\\s+paga\\s*:?\\s*(.+)", u"\\bpaga\\s*:\\s*(.+)", u"\\bresponde\\s*:\\s*(.+)"])
    return abre, paga


def _tokens_pt(s):
    return set(w for w in _norm_trecho(s).split() if len(w) > 2)


def _processar_novidade(estado, novidade):
    abre, paga = _extrair_perguntas(novidade)
    op = list(estado.get("open_loops", []))
    pd = list(estado.get("paid_loops", []))
    if paga:
        a = _tokens_pt(paga)
        best_i, best_s = -1, 0.0
        for i, o in enumerate(op):
            t = _tokens_pt(o)
            s = len(a & t) / max(1, min(len(a), len(t)))
            if s > best_s:
                best_s, best_i = s, i
        if best_s >= 0.3 and best_i >= 0:
            pd.append(op.pop(best_i))
        else:
            pd.append(paga)
    if abre:
        op.append(abre)
    estado["open_loops"] = op
    estado["paid_loops"] = pd
    return estado


# FASE 4 — Source Reveal Streak (espelha estado-editorial.ts modoExpositivo).
_RE_MODO_EXPO = re.compile(u"exposi[çc][ãa]o|entrevista|documento|di[áa]logo[ -]informativo|informativo", re.I | re.U)


def _modo_expositivo(modo):
    return bool(_RE_MODO_EXPO.search(modo or ""))


def _streak_guarda(projeto, cap):
    """(ok, motivo). Reprova o 4o capitulo consecutivo em modo exposicao (varie).
    hoover ISENTO (dialogo/interioridade e' a voz canonica da skill)."""
    if _skill_projeto(projeto) == "hoover-mcfadden":
        return (True, "")
    def modo(n):
        try:
            with open(_spec_path(projeto, n), "r", encoding="utf-8") as fh:
                return _campo_spec(fh.read(), "Modo")
        except OSError:
            return ""
    if not _modo_expositivo(modo(cap)):
        return (True, "")
    consec = 0
    k = int(cap) - 1
    while k >= 1 and _modo_expositivo(modo(k)):
        consec += 1
        k -= 1
    if consec >= 3:
        return (False, u"source-streak: {}o capitulo consecutivo em modo exposicao (varie: acao/investigacao/confronto)".format(consec + 1))
    return (True, "")


def _editorial_pos_aceite(projeto, cap):
    """Roda APOS aceitar o capitulo: atualiza estado-editorial. FASE 3 (Novelty loops) +
    FASE 4 (source_reveal_streak: +1 se expositivo, zera se dramatico)."""
    try:
        with open(_spec_path(projeto, cap), "r", encoding="utf-8") as fh:
            sp = fh.read()
    except OSError:
        return
    ed = load_estado_editorial(projeto)
    nov = _campo_spec(sp, "Novidade")
    if nov:
        ed = _processar_novidade(ed, nov)
    md = _campo_spec(sp, "Modo")
    if md:
        ed["source_reveal_streak"] = int(ed.get("source_reveal_streak", 0)) + 1 if _modo_expositivo(md) else 0
    save_estado_editorial(projeto, ed)


# ----------------------------------------------------------------------------
# CADENCIA (ritmo das frases) — espelha worker/src/maneirismo.ts. Mede o staccato
# que a Regra 4 da skill-dan-brown bane ("nunca dois fragmentos colados"): o
# detector de moldes/muletas conta palavras; este conta RITMO.
# ----------------------------------------------------------------------------
_RE_EPIGRAMA = re.compile(u"\\b[oa]s?\\s+[A-Za-zÀ-ÿ]+\\s+(?:faz|fazia|fez|faziam)\\s+[oa]s?\\s+[A-Za-zÀ-ÿ]+\\s+que\\b", re.I | re.U)
_RE_ITALICO = re.compile(u"(?<![\\*_])([\\*_])(?![\\*_\\s])([^\\*_\\n]{1,80}?)\\1(?![\\*_])", re.U)
# orcamento (mesmos defaults do TS ORC_CADENCIA)
CAD = dict(curta=4, enfase=3, colados=1, staccato_frac=0.35, min_frases=8,
           clipe_neg=1, anafora=1, epigrama=1, frag_enfase=2, frag_colados=0,
           italico=3, retorica=2)

# Orcamento POR SKILL (espelha TS ORC_CADENCIA_POR_SKILL): o default e calibrado
# para cadencia LONGA (Regra 4 dan-brown/vesper). Skills de cadencia RAPIDA tem a
# frase curta como ASSINATURA ("curta e cheia" do hoover-mcfadden) — o orcamento
# unico criminalizava a voz correta. Opt-in; quem nao esta no mapa usa o default.
CAD_POR_SKILL = {
    "hoover-mcfadden": dict(CAD, staccato_frac=0.55, frag_enfase=20, frag_colados=6,
                            colados=8, clipe_neg=3, anafora=2),
    # SPEC-RM3: frase-soco = assinatura BookTok; sobe so frag_enfase/frag_colados/anafora
    # (staccato_frac fica no default 0.35). Muleta "coisa"/simile-andaime seguem fixas.
    "skill-romantasy": dict(CAD, frag_enfase=6, frag_colados=1, anafora=2),
}


def _cad_para_skill(skill):
    return CAD_POR_SKILL.get(skill or "", CAD)


def _skill_projeto(projeto):
    """skill_escrita do ESTADO_LIVRO.json (fonte unica; '' quando ausente)."""
    try:
        return (load_state(projeto) or {}).get("skill_escrita") or ""
    except Exception:
        return ""


# ----------------------------------------------------------------------------
# SPEC-DB2 — gate deterministico de SPEC por capitulo (skills EXIGENTES).
# Espelha worker/src/exigencias-skill.ts (EXIGENCIAS_ESTRUTURAIS_POR_SKILL):
# skill sem entrada = gate INERTE. Filosofia bounded: spec ausente/incompleta
# vira UMA re-geracao dirigida (marcador .try); na 2a falha aceita com aviso alto.
# ----------------------------------------------------------------------------
DIR_SPECS = "specs"
EXIGE_SPEC_POR_SKILL = {
    # AUDITORIA-DAN-BROWN-V2 gap 2: max_absoluto (teto que Justificativa NAO derruba)
    # + janela (diversidade nos ultimos N). So skills com rotacao real (dan-brown/romantasy).
    # editorial Fase 2: "Decisao/Acao" universal em toda skill gated (matching accent-insensitive).
    "skill-dan-brown": dict(campos=["Fio de POV", "Dia/Hora", "Decisao/Acao"], max_mesmo_fio=3,
                            max_absoluto=5, janela=dict(tamanho=10, ratio_max=0.65)),
    # SPEC-HM2: hoover e POV unico (Helena) — sem rotacao; NAO recebe max_absoluto/janela.
    "hoover-mcfadden": dict(campos=["Dia/Hora", "Relogios", "Pistas", "Gancho", "Narradora", "Decisao/Acao"], max_mesmo_fio=6),
    # SPEC-RM2: romantasy = POV duplo; guard de rotacao via "Ponto de vista".
    "skill-romantasy": dict(campos=["Ponto de vista", "Degrau slow burn", "Custo de magia", "Decisao/Acao"], max_mesmo_fio=2,
                            max_absoluto=3, janela=dict(tamanho=6, ratio_max=0.6)),
}


def _spec_path(projeto, n):
    return os.path.join(projeto, DIR_SPECS, "Spec-Capitulo-{:02d}.md".format(int(n)))


def _spec_try_marker(projeto, n):
    return os.path.join(projeto, DIR_SPECS, "_spec-{:02d}.try".format(int(n)))


def _sem_acento(s):
    """Normaliza acentos p/ matching robusto: o LLM escreve 'Relogios'/'Relógios'
    indistintamente; o gate nao pode reprovar por causa de um acento."""
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()


def _fio_da_spec(texto):
    """Extrai o valor do campo de POV/fio de uma spec. Aceita 'Fio de POV' (dan-brown),
    'POV / fio' e 'Ponto de vista' (romantasy — SPEC-RM2). '' quando ausente."""
    m = re.search(u"(?:Fio de POV|POV\\s*/\\s*fio|Ponto de vista)[^:\\n]*:\\s*\\**\\s*([^\\n*]+)",
                  texto or "", re.I | re.U)
    return m.group(1).strip().lower() if m else ""


def gate_spec_capitulo(projeto, n):
    """None = spec OK (ou skill sem exigencia). String = motivo da reprovacao."""
    exig = EXIGE_SPEC_POR_SKILL.get(_skill_projeto(projeto))
    if not exig:
        return None
    txt = ""
    try:
        with open(_spec_path(projeto, n), "r", encoding="utf-8") as fh:
            txt = fh.read()
    except OSError:
        return "spec ausente (specs/Spec-Capitulo-{:02d}.md)".format(int(n))
    txt_norm = _sem_acento(txt)
    faltam = [c for c in exig["campos"] if _sem_acento(c) not in txt_norm]
    if faltam:
        return "spec sem campo(s): {}".format(", ".join(faltam))
    # rotacao: se os N anteriores tem o MESMO fio e este repete, exige justificativa.
    # Aceita "Justificativa de fio" (dan-brown) OU "de POV"/"de ponto de vista" (romantasy).
    fio = _fio_da_spec(txt)
    if fio:
        anteriores = []
        for k in range(int(n) - exig["max_mesmo_fio"], int(n)):
            if k < 1:
                continue
            try:
                with open(_spec_path(projeto, k), "r", encoding="utf-8") as fh:
                    anteriores.append(_fio_da_spec(fh.read()))
            except OSError:
                anteriores.append(None)
        tem_justificativa = bool(re.search(u"justificativa de (fio|pov|ponto de vista)", txt_norm))
        if (len(anteriores) == exig["max_mesmo_fio"] and all(a == fio for a in anteriores)
                and not tem_justificativa):
            return ("{}o capitulo consecutivo no fio '{}' sem 'Justificativa de fio/POV:'"
                    .format(exig["max_mesmo_fio"] + 1, fio))
    # gap 2: teto absoluto + janela de diversidade (Justificativa NAO derruba).
    if exig.get("max_absoluto") or exig.get("janela"):
        fios_seq = []
        for k in range(1, int(n) + 1):
            try:
                with open(_spec_path(projeto, k), "r", encoding="utf-8") as fh:
                    fios_seq.append(_fio_da_spec(fh.read()))
            except OSError:
                fios_seq.append("")
        motivos = _avaliar_rotacao_fio(fios_seq, int(n), exig)
        if motivos:
            return "; ".join(motivos)
    # gap 3b: aritmetica de Dia/Hora (offset avanca => dia-da-semana avanca).
    dh = _checar_dia_hora(projeto, n)
    if dh:
        return dh
    return None


def prompt_gerar_spec(n, motivo):
    return (
        PREAMBULO +
        "\nFASE ESCRITA — PRE-REQUISITO: a spec do Capitulo {n} reprovou no gate "
        "deterministico ({motivo}). NAO escreva o capitulo.\n"
        "1) Delegue ao subagente 'livro-editor' via Task: materialize/corrija "
        "specs/Spec-Capitulo-{n:02d}.md no formato 'SPEC COMPLETA' definido no proprio "
        "agente (Fio de POV, Dia/Hora corrente, Montagem corte de/para, Forma "
        "anti-mesmice, Notas de precisao factual puxadas de dossie-factual.md se "
        "existir). Use a LINHA do Capitulo {n} na Estrutura-do-Livro.md, a MATRIZ DE "
        "FIOS e o estado/estado-narrativo.md como fontes.\n"
        "2) Se o fio repetir os {n_ant} capitulos anteriores, ou troque o fio (se a "
        "Estrutura permitir) ou inclua a linha 'Justificativa de fio: <por que>'.\n"
        "3) NAO escreva prosa de capitulo nesta sessao."
    ).format(n=int(n), motivo=motivo, n_ant=3)


def _sem_headings(texto):
    return "\n".join(l for l in (texto or "").split("\n") if not re.match(r"^\s*#", l))


def dividir_frases(texto):
    t = re.sub(r"[ \t]+", " ", _sem_headings(texto)).strip()
    if not t:
        return []
    partes = re.split(u"(?<=[.!?…])[\\s\\n]+", t, flags=re.U)
    return [re.sub(r"\s+", " ", p).strip() for p in partes if p.strip()]


def _sem_abertura(f):
    return re.sub(u"^[—–\\-\"'“”‘’*_(\\s]+", "", f or "", flags=re.U)


def _palavras_frase(f):
    return len(re.findall(u"[A-Za-zÀ-ÿ0-9’'\\-]+", _sem_abertura(f), re.U))


def _primeira_palavra(f):
    m = re.search(u"[A-Za-zÀ-ÿ0-9’'\\-]+", _sem_abertura(f), re.U)
    return m.group(0).lower() if m else ""


def _eh_dialogo(f):
    return bool(re.match(u"^[—–\\-\"'“”‘’]", (f or "").strip(), re.U))


def _frases_rotuladas(texto):
    """Frases com a marca de DIALOGO do PARAGRAFO de origem (espelha o TS): a fala
    multi-frase pertence INTEIRA ao dialogo, mesmo sem travessao na 2a frase."""
    fr, narr = [], []
    for par in re.split(u"\n{2,}", texto or ""):
        dial = bool(re.match(u"^[\\s>]*[—–\\-\"'“”‘’]", par, re.U))
        for f in dividir_frases(par):
            fr.append(f)
            narr.append(not dial)
    return fr, narr


def cadencia_acima(texto, skill=None):
    """Lista (nome, n, alvo) dos tiques de RITMO acima do orcamento. Espelha o TS.
    Orcamento resolvido POR SKILL (default = cadencia longa); DIALOGO nao conta
    como tique de ritmo (fala curta e fala natural, nao staccato de narracao)."""
    cad = _cad_para_skill(skill)
    fr, narr = _frases_rotuladas(texto)
    lens = [_palavras_frase(x) for x in fr]
    nf = len(fr)
    n_narr = sum(1 for x in narr if x)
    out = []
    colados = sum(1 for i in range(1, nf) if narr[i - 1] and narr[i] and lens[i - 1] <= cad["curta"] and lens[i] <= cad["curta"])
    if colados > cad["colados"]:
        out.append(("fragmentos colados (<=4 palavras)", colados, cad["colados"]))
    curtas = sum(1 for i in range(nf) if narr[i] and 0 < lens[i] <= cad["curta"])
    if n_narr >= cad["min_frases"] and curtas / n_narr > cad["staccato_frac"]:
        out.append(("staccato denso ({}% de frases curtas na narracao)".format(int(round(curtas / n_narr * 100))), curtas, int(round(n_narr * cad["staccato_frac"]))))
    clip = sum(1 for i, f in enumerate(fr) if narr[i] and lens[i] <= 3 and re.match(u"^n[ãa]o\\b", _sem_abertura(f), re.I | re.U))
    if clip > cad["clipe_neg"]:
        out.append(("clipe de negacao curto", clip, cad["clipe_neg"]))
    ana = sum(1 for i in range(1, nf) if narr[i - 1] and narr[i] and _primeira_palavra(fr[i - 1]) and _primeira_palavra(fr[i - 1]) == _primeira_palavra(fr[i]))
    if ana > cad["anafora"]:
        out.append(("anafora (frases coladas, mesmo inicio)", ana, cad["anafora"]))
    epi = len(_RE_EPIGRAMA.findall(texto or ""))
    if epi > cad["epigrama"]:
        out.append(("epigrama antitetico", epi, cad["epigrama"]))
    frag = sum(1 for i in range(nf) if narr[i] and 1 <= lens[i] <= cad["enfase"])
    if frag > cad["frag_enfase"]:
        out.append(("fragmento de enfase (Regra 4 <=1-2)", frag, cad["frag_enfase"]))
    fcol = sum(1 for i in range(1, nf) if narr[i - 1] and narr[i] and 1 <= lens[i - 1] <= cad["enfase"] and 1 <= lens[i] <= cad["enfase"])
    if fcol > cad["frag_colados"]:
        out.append(("fragmentos de enfase COLADOS (Regra 4: nunca dois)", fcol, cad["frag_colados"]))
    ital = len(_RE_ITALICO.findall(texto or ""))
    if ital > cad["italico"]:
        out.append(("pensamento em italico (Regra 4 <=2-3)", ital, cad["italico"]))
    ret = sum(1 for i, f in enumerate(fr) if narr[i] and re.search(u"[?][\"'”’)\\]]*$", f, re.U))
    if ret > cad["retorica"]:
        out.append(("pergunta retorica (Regra 4 <=1-2)", ret, cad["retorica"]))
    return out


_RE_ESTATICO = re.compile(u"\\b(é|era|foi|s[ãa]o|eram|est[áa]|estava|estavam|parece|parecia|pareciam|h[áa]|havia|houve|sentia|sente|sentiu|lembrava|lembra|imaginava|imagina|pensava|tinha|existia)\\b", re.I | re.U)


def interioridade_sem_evento(texto, min_frases=10):
    """Heuristica (SINALIZA, nao bloqueia): capitulo majoritariamente copula/percepcao
    e quase sem dialogo -> 'bem escrito e chato'. Alimenta o REVISOR. Devolve
    (acima, estatica_pct, dialogo_pct)."""
    fr = dividir_frases(texto)
    if not fr:
        return (False, 0, 0)
    estaticas = sum(1 for f in fr if _RE_ESTATICO.search(f) and not _eh_dialogo(f))
    dialogo = sum(1 for f in fr if _eh_dialogo(f))
    ep = estaticas / len(fr)
    dp = dialogo / len(fr)
    return (len(fr) >= min_frases and ep > 0.6 and dp < 0.06, round(ep * 100), round(dp * 100))


def gate_maneirismo_capitulo(projeto, n, args):
    """Depois de escrever o capitulo n: se algum molde/muleta/CADENCIA estourou o
    orcamento, dispara UMA reescrita-alvo (bounded: 0 ou 1 por escrita, nao bloqueia
    o avanco do livro). Nomeia as linhas/moldes/tiques de ritmo ofensores."""
    txt = ler_arquivo(projeto, nome_cap(n))
    if not txt:
        return
    offs = maneirismos_acima(txt)
    muls = muletas_acima_cap(txt)
    cads = cadencia_acima(txt, _skill_projeto(projeto))
    # gap 1: repeticao verbatim/quase-verbatim CROSS-capitulo (ledger, caps < n).
    ledger = _ler_ledger_cross(projeto)
    anteriores = [{"numero": e["capitulo"], "trecho": e.get("trecho_original", "")}
                  for e in ledger if int(e.get("capitulo", 0)) < int(n)]
    reps = detectar_repeticao_cross(txt, anteriores)
    if offs or muls or cads or reps:
        lista = "; ".join(["{} {}x".format(nome, cnt) for nome, cnt in offs] +
                          ["MULETA {} {}x (alvo <= {})".format(nome, cnt, b) for nome, cnt, b in muls] +
                          ["CADENCIA {} {}x (alvo <= {})".format(nome, cnt, alvo) for nome, cnt, alvo in cads] +
                          [u"REPETICAO CROSS-CAP '{}' (= cap {})".format(r["trecho"], r["cap"]) for r in reps])
        arq = nome_cap(n).replace("\\", "/")
        log(projeto, "GATE CAP {}: acima do orcamento -> reescrevendo ({}).".format(n, lista))
        prompt = (
            "Modo headless. Trabalhe SOMENTE nesta pasta de projeto.\n"
            "REVISAO DE PROSA do {arq}: os itens abaixo estao SOBRE-REPRESENTADOS neste "
            "capitulo (contagem real). Reduza CADA UM ao alvo. Para MULETAS (ex.: 'coisa'), "
            "TROQUE pela coisa concreta a que se refere (objeto, ideia, gesto) — nunca deixe "
            "'coisa' generica. Para MOLDES, desadense o tique com sintaxe variada. Para "
            "CADENCIA (ritmo), VARIE o comprimento das frases — FUNDA as frases curtas coladas "
            "numa frase mais longa e encadeada onde for revelacao, quebre a anafora, corte o "
            "clipe de negacao repetido; nunca dois fragmentos colados (Regra 4). Para "
            "REPETICAO CROSS-CAP, o trecho ja apareceu num capitulo ANTERIOR (frase-assinatura "
            "reciclada) — REESCREVA-O com imagem/sintaxe nova aqui, sem repetir o molde do "
            "capitulo citado. NAO basta cortar palavra: a instrucao e variar. PRESERVE sentido "
            "e voz; NAO reescreva a cena a toa. Regrave o MESMO arquivo {arq}.\n"
            "Itens acima do orcamento: {lista}\n"
        ).format(arq=arq, lista=lista)
        run_claude(projeto, prompt, args)
    # Atualiza o ledger cross-capitulo com os slots deste capitulo (apos aceitar/
    # reescrever). Idempotente por capitulo. Roda mesmo quando o capitulo passou limpo.
    _atualizar_ledger_com_cap(projeto, n)


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
    "antitese com 'haver' (Nao havia X... Havia Y)": 1.5,
    "antitese com 'haver' (mesma frase)": 1.0,
    "simile-andaime ('como se / como quando')": 2.5,
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
    # MULETAS (book-wide): 'coisa' & cia. com orcamento por 10k. Troque pelo referente.
    for nome, rx, _budget, orc10k in _MULETAS:
        n = len(rx.findall(full))
        # orc10k <= 0 = tolerancia zero (lexico estrangeiro); senao, piso 1 proporcional.
        alvo = 0 if orc10k <= 0 else max(1, int(round(orc10k * palavras / 10000.0)))
        if n > alvo:
            acima.append("MULETA \"{}\": {}x -> reduza para <= {} (troque pela coisa concreta a que se refere)".format(nome, n, alvo))
            relatorio.append("[X] muleta {}: {}x (alvo <= {})".format(nome, n, alvo))
    fecho = _fecho_isolado(caps)
    fecho_alvo = max(1, int(len(caps) * FECHO_MAX_FRACAO))
    if len(fecho) > fecho_alvo:
        acima.append("fecho epigramatico isolado em {}/{} capitulos -> <= {} (varie os fechamentos; caps: {})".format(
            len(fecho), len(caps), fecho_alvo, ",".join(map(str, fecho[:12]))))
    for g, c, d in _ngramas_sobrerep(full):
        acima.append("repeticao \"{}\": {}x ({}/10k) -> varie".format(g, c, d))
    # CADENCIA (ritmo) POR CAPITULO: staccato/colados/anafora nao fazem sentido
    # book-wide; conta por capitulo e lista os que estouram o orcamento de ritmo.
    for i, cap in enumerate(caps, 1):
        for nome, cnt, alvo in cadencia_acima(cap, _skill_projeto(projeto)):
            acima.append("CADENCIA cap {}: {} {}x -> <= {} (VARIE o ritmo: funda frases curtas, encadeie na revelacao; nao so corte)".format(i, nome, cnt, alvo))
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
        alvo = None            # capitulo a ESCREVER neste passo (se houver)
        revisando_cap = None   # capitulo a REVISAR neste passo (micro-loop)
        if fase == "ESTRUTURA":
            prompt = PROMPT_ESTRUTURA
        elif fase == "ESCRITA":
            tot = _i(state.get("total_capitulos_previstos"))
            # Micro-loop (Frente 2): antes de escrever o proximo, REVISA o 1o capitulo
            # valido ainda nao revisado (escritor->revisor->editor). Reentrante (marcador).
            if revisao_ligada(args):
                revisando_cap = primeiro_cap_nao_revisado(projeto, tot, piso)
            if revisando_cap is not None:
                log(projeto, "--- ESCRITA/REVISAO por capitulo: revisando cap {} (micro-loop) ---".format(revisando_cap))
                # Fix C (guarda deterministica): mede os tiques e o mtime do ledger ANTES da
                # revisao delegada, para o runner confirmar depois que os tiques cairam E que
                # a CONTINUIDADE foi gravada no estado-narrativo.md (sem o LLM reler/re-julgar).
                cads_antes_rev = cadencia_acima(ler_arquivo(projeto, nome_cap(revisando_cap)), _skill_projeto(projeto))
                _ledger = os.path.join(projeto, "estado", "estado-narrativo.md")
                ledger_mtime_antes = os.path.getmtime(_ledger) if os.path.exists(_ledger) else 0
                prompt = prompt_revisao_capitulo(projeto, revisando_cap, args, piso)
            else:
                alvo = proximo_capitulo_pendente(projeto, tot, piso)
                if alvo is None:
                    state["fase_atual"] = "CONSOLIDACAO"
                    save_state(projeto, state)
                    continue
                log(projeto, "--- ESCRITA: capitulo alvo = {} (validos={}/{}) ---".format(
                    alvo, len(capitulos_validos(projeto, tot, piso)), tot))
                # SPEC-DB2: gate deterministico de spec (skills exigentes; inerte p/ demais).
                motivo_spec = gate_spec_capitulo(projeto, alvo)
                if motivo_spec:
                    marker = _spec_try_marker(projeto, alvo)
                    if not os.path.exists(marker):
                        os.makedirs(os.path.join(projeto, DIR_SPECS), exist_ok=True)
                        with open(marker, "w", encoding="utf-8") as fh:
                            fh.write(agora())
                        log(projeto, "GATE SPEC cap {}: {} -> pedindo SPEC COMPLETA ao livro-editor (bounded).".format(alvo, motivo_spec))
                        prompt = prompt_gerar_spec(alvo, motivo_spec)
                    else:
                        log(projeto, "AVISO ALTO: spec do cap {} segue reprovada ({}) apos 1 re-geracao — escrevendo assim mesmo (bounded, nao bloqueia).".format(alvo, motivo_spec))
                        prompt = prompt_escrita_capitulo(alvo, piso)
                else:
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

        modelo_fase = modelo_da_fase(fase, args)
        log(projeto, "--- Executando fase {} (modelo={}, assinatura antes: {}) ---".format(fase, modelo_fase or "default", sig_before))
        rc, out, err = run_claude(projeto, prompt, args, modelo=modelo_fase)
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
        # orcamento de tiques/muletas, dispara UMA reescrita-alvo (bounded; nao bloqueia).
        if fase == "ESCRITA" and alvo is not None:
            gate_maneirismo_capitulo(projeto, alvo, args)

        # Micro-loop: terminou a REVISAO do capitulo. GUARDA DETERMINISTICA (Fix C): o
        # runner (nao o LLM) confirma que o arquivo tem piso E que os tiques de cadencia
        # CAIRAM (ou ja estavam no orcamento) antes de marcar como aceito. Se nao, uma
        # re-revisao dirigida (bounded: 1x via marcador .try); na 2a passada aceita para
        # nao travar o livro (filosofia "bounded, nao bloqueia").
        if fase == "ESCRITA" and revisando_cap is not None:
            txt_rev = ler_arquivo(projeto, nome_cap(revisando_cap))
            palavras_rev = len((txt_rev or "").split())
            cads_depois = cadencia_acima(txt_rev, _skill_projeto(projeto))
            exc = lambda cs: sum(c - a for _n, c, a in (cs or []))
            exc_antes, exc_depois = exc(cads_antes_rev), exc(cads_depois)
            piso_ok = palavras_rev >= piso
            tiques_ok = (not cads_depois) or (exc_depois < exc_antes)
            # CONTINUIDADE: o ledger canonico estado-narrativo.md tem que ter sido gravado
            # (a versao delegada pode escrever num arquivo avulso -> continuidade perdida).
            ledger_mtime = os.path.getmtime(_ledger) if os.path.exists(_ledger) else 0
            ledger_ok = ledger_mtime > ledger_mtime_antes
            agencia_ok, agencia_motivo = _agencia_guarda(projeto, revisando_cap)  # FASE 2 (Agency)
            streak_ok, streak_motivo = _streak_guarda(projeto, revisando_cap)     # FASE 4 (Source streak)
            try_path = _marcador_revtry(projeto, revisando_cap)
            ja_tentou = os.path.exists(try_path)
            # 1a passada: exige piso + ledger + tiques + agencia + streak (estrito).
            # 2a passada (ja_tentou): aceita com piso p/ nao travar, AVISA ALTO o que ficou off.
            if piso_ok and (ja_tentou or (ledger_ok and tiques_ok and agencia_ok and streak_ok)):
                try:
                    os.makedirs(os.path.join(projeto, DIR_REVIEW), exist_ok=True)
                    with open(_marcador_revcap(projeto, revisando_cap), "w", encoding="utf-8") as fh:
                        fh.write(agora())
                    if ja_tentou:
                        os.remove(try_path)
                except OSError:
                    pass
                state["_runner"]["tentativas_sem_progresso"] = 0
                save_state(projeto, state)
                pend = []
                if not tiques_ok: pend.append("tiques nao baixaram")
                if not ledger_ok: pend.append("CONTINUIDADE nao gravada no estado-narrativo")
                if not agencia_ok: pend.append(agencia_motivo)  # FASE 2 (Agency)
                if not streak_ok: pend.append(streak_motivo)    # FASE 4 (Source streak)
                aviso = " [aceito p/ nao travar apos re-revisao; PENDENTE: {}]".format("; ".join(pend)) if pend else ""
                log(projeto, "Capitulo {} revisado (delegado) -> aceito{}. cadencia excesso {}->{}; piso {}; ledger {}.".format(
                    revisando_cap, aviso, exc_antes, exc_depois, "ok" if piso_ok else "BAIXO", "ok" if ledger_ok else "NAO-GRAVADO"))
                _editorial_pos_aceite(projeto, revisando_cap)  # FASES 3-4 (Novelty loops + streak)
                continue
            # Guarda REPROVOU: re-revisa o MESMO cap no proximo loop (dirigido, bounded 1x).
            try:
                os.makedirs(os.path.join(projeto, DIR_REVIEW), exist_ok=True)
                with open(try_path, "w", encoding="utf-8") as fh:
                    fh.write(agora())
            except OSError:
                pass
            # 1a reprovacao dirige progresso (reseta estagnacao); se ja tentou e ainda
            # falha por PISO, deixa a estagnacao contar (safety: runner sai apos o max).
            if not ja_tentou:
                state["_runner"]["tentativas_sem_progresso"] = 0
            save_state(projeto, state)
            log(projeto, "Capitulo {} revisado mas GUARDA reprovou (piso {}, ledger {}, tiques excesso {}->{}); re-revisao dirigida.".format(
                revisando_cap, "ok" if piso_ok else "BAIXO", "ok" if ledger_ok else "NAO-GRAVADO", exc_antes, exc_depois))
            continue

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
    p.add_argument("--revisao-por-capitulo", action="store_true", help="(compat) o time por capitulo ja e o PADRAO.")
    p.add_argument("--sem-revisao-por-capitulo", action="store_true", help="DESLIGA o micro-loop escritor->revisor->editor por capitulo (baratear). Tambem via env REVISAO_POR_CAPITULO=0.")
    p.add_argument("--max-edicoes-por-cap", type=int, default=6, help="Maximo de edicoes pontuais do revisor por capitulo (default 6).")
    p.add_argument("--piso", type=int, default=PISO_PALAVRAS_DEFAULT,
                   help="Piso de palavras por capitulo (default {}).".format(PISO_PALAVRAS_DEFAULT))
    p.add_argument("--fase-timeout", type=int, default=0, help="Timeout por chamada (s; 0 = sem).")
    p.add_argument("--claude-bin", default="claude", help="Binario do Claude Code (default 'claude').")
    p.add_argument("--model", default="opus", help="Modelo do ORQUESTRADOR/roteamento (default 'opus'; o worker passa 'sonnet'). Subagentes mantem o modelo do proprio frontmatter (escritor opus, revisor sonnet, editor haiku).")
    p.add_argument("--model-pesado", default="opus", help="Modelo das fases INLINE pesadas (ESTRUTURA/REVIEW/REESCRITA), que nao delegam a um subagente (default 'opus').")
    p.add_argument("--revisor-craft-opus", action="store_true", help="Eleva o VEREDITO DE PROPULSAO do revisor por capitulo a opus (custo Max). Default off: a critica de propulsao roda no revisor sonnet.")
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
