#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compositor de capa PROFISSIONAL e DETERMINÍSTICO (Pillow).
Desenha título/subtítulo/autor + selo da editora sobre uma ARTE-MESTRA (sem
texto), com layout fixo e padronizado — capas em idiomas diferentes ficam
IDÊNTICAS no posicionamento, mudando só o texto traduzido.

Princípios de qualidade:
  (a) NUNCA estica: a arte entra por cover-fit com recorte proporcional.
  (b) Tipografia por gênero, com hierarquia real (título grande, autor caps).
  (c) Logo Maremonti como SELO coeso (autor → filete → logo), fixo em todo livro.

Uso:
  python compose_cover.py --config config.json
config.json:
  {
    "art": "capas/master.png", "out": "capas/en-US.png",
    "title": "...", "subtitle": "...", "author": "...",
    "genre": "thriller|romance|romantasy|...", "logo": ".../maremonti-white.png",
    "fonts_dir": "/.../canvas-design/canvas-fonts"
  }
"""
import argparse
import json
import os
import unicodedata
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 2560
MARGIN_X = 150
USABLE = W - 2 * MARGIN_X
TITLE_TOP = int(H * 0.085)
TITLE_MAX_LINES = 3
SUBTITLE_SIZE = 54
SUBTITLE_GAP = 34

# Selo de rodapé (autor → filete → logo) — FIXO e IGUAL em todo livro
AUTHOR_SIZE = 46
RULE_W = 190
LOGO_W = 300                       # ~19% de 1600 (selo discreto)
LOGO_MARGIN_BOTTOM = 122
SEAL_GAP_AUTHOR_RULE = 24
SEAL_GAP_RULE_LOGO = 46

WHITE = (246, 244, 239, 255)
SOFT = (228, 225, 218, 255)


def _norm(s):
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()


# Sistema tipográfico: gênero -> (fonte de título, corpo máx, fonte de autor, fonte de subtítulo)
def pick_fonts(genre):
    g = _norm(genre)
    if any(k in g for k in ["romantasy", "fantas"]):
        return ("Italiana-Regular.ttf", 186, "Outfit-Regular.ttf", "CrimsonPro-Italic.ttf")
    if any(k in g for k in ["thriller", "suspense", "misterio", "policial", "crime", "techno", "tecno", "cienti", "sci-fi", "ficcao cientifica", "espionagem", "geopolit"]):
        return ("BigShoulders-Bold.ttf", 214, "InstrumentSans-Bold.ttf", "InstrumentSans-Italic.ttf")
    # literário / romance / drama / memória / histórico / desconhecido
    return ("Gloock-Regular.ttf", 168, "Outfit-Regular.ttf", "CrimsonPro-Italic.ttf")


def font(fonts_dir, name, size):
    return ImageFont.truetype(os.path.join(fonts_dir, name), size)


def cover_resize(img):
    """Preenche 1600x2560 (cover) e corta o centro — NUNCA distorce."""
    img = img.convert("RGB")
    src_r = img.width / img.height
    dst_r = W / H
    if src_r > dst_r:
        nh, nw = H, int(H * src_r)
    else:
        nw, nh = W, int(W / src_r)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - W) // 2, (nh - H) // 2
    return img.crop((left, top, left + W, top + H))


def scrim(base):
    """Gradiente escuro no topo e na base para legibilidade do texto."""
    overlay = Image.new("L", (1, H), 0)
    px = overlay.load()
    for y in range(H):
        a = 0
        if y < H * 0.44:
            a = int(180 * (1 - y / (H * 0.44)))
        if y > H * 0.56:
            a = max(a, int(215 * ((y - H * 0.56) / (H * 0.44))))
        px[0, y] = a
    mask = overlay.resize((W, H))
    black = Image.new("RGB", (W, H), (8, 10, 13))
    return Image.composite(black, base, mask)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_title(draw, text, fonts_dir, face, max_size, max_w, max_lines):
    """Maior corpo da fonte do gênero que cabe em <= max_lines linhas."""
    for size in range(max_size, 56, -4):
        fnt = font(fonts_dir, face, size)
        lines = wrap(draw, text, fnt, max_w)
        if len(lines) <= max_lines and all(draw.textlength(l, font=fnt) <= max_w for l in lines):
            return fnt, lines, size
    fnt = font(fonts_dir, face, 60)
    return fnt, wrap(draw, text, fnt, max_w)[:max_lines], 60


def draw_center(draw, y, text, fnt, fill, shadow=(0, 0, 0, 150), dx=3, dy=3):
    w = draw.textlength(text, font=fnt)
    x = (W - w) / 2
    if shadow:
        draw.text((x + dx, y + dy), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


def tracked(s, spaces=1):
    return (" " * spaces).join(list(s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--logo", default=None)
    args = ap.parse_args()
    cfg = json.load(open(args.config, encoding="utf-8"))
    fonts_dir = cfg["fonts_dir"]
    title = (cfg.get("title") or "").strip()
    subtitle = (cfg.get("subtitle") or "").strip()
    author = (cfg.get("author") or "").strip()
    title_face, title_max, author_face, subtitle_face = pick_fonts(cfg.get("genre"))

    base = scrim(cover_resize(Image.open(cfg["art"])))
    canvas = base.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # ---- Selo de rodapé: logo (base), filete acima, autor acima do filete ----
    logo_path = cfg.get("logo") or args.logo
    logo_img = None
    if logo_path and os.path.exists(logo_path):
        lg = Image.open(logo_path).convert("RGBA")
        lh = max(1, round(LOGO_W * lg.height / lg.width))
        logo_img = lg.resize((LOGO_W, lh), Image.LANCZOS)
        logo_top = H - LOGO_MARGIN_BOTTOM - lh
    else:
        logo_top = H - LOGO_MARGIN_BOTTOM  # sem logo: âncora do filete

    rule_y = logo_top - SEAL_GAP_RULE_LOGO
    author_baseline = rule_y - SEAL_GAP_AUTHOR_RULE - AUTHOR_SIZE

    # ---- Título (fonte do gênero, auto-fit, bloco no topo) ----
    tf, tlines, tsize = fit_title(draw, title, fonts_dir, title_face, title_max, USABLE, TITLE_MAX_LINES)
    line_gap = int(tsize * 0.12)
    y = TITLE_TOP
    for ln in tlines:
        draw_center(draw, y, ln, tf, WHITE)
        y += tsize + line_gap

    # ---- Subtítulo (itálico, discreto) ----
    if subtitle:
        sf = font(fonts_dir, subtitle_face, SUBTITLE_SIZE)
        for ln in wrap(draw, subtitle, sf, USABLE)[:2]:
            y += SUBTITLE_GAP
            draw_center(draw, y, ln, sf, SOFT, dx=2, dy=2)
            y += SUBTITLE_SIZE

    # ---- Autor (caixa-alta espaçada) ----
    af = font(fonts_dir, author_face, AUTHOR_SIZE)
    draw_center(draw, author_baseline, tracked(author.upper(), 1), af, WHITE, dx=2, dy=2)

    # ---- Filete fino (divisor do selo) ----
    draw.line([(W / 2 - RULE_W / 2, rule_y), (W / 2 + RULE_W / 2, rule_y)], fill=(214, 211, 203, 210), width=2)

    # ---- Logo Maremonti (branca/transparente), centralizada — selo da editora ----
    if logo_img is not None:
        canvas.alpha_composite(logo_img, ((W - LOGO_W) // 2, logo_top))

    os.makedirs(os.path.dirname(cfg["out"]) or ".", exist_ok=True)
    canvas.convert("RGB").save(cfg["out"], "PNG")
    if cfg.get("pdf"):
        canvas.convert("RGB").save(cfg["pdf"], "PDF", resolution=300)
    print("OK", cfg["out"], "| fonte titulo:", title_face)


if __name__ == "__main__":
    main()
