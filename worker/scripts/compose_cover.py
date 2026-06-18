#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compositor de capa DETERMINÍSTICO (Pillow).
Desenha título/subtítulo/autor sobre uma ARTE-MESTRA, com layout fixo e
padronizado — de modo que capas em idiomas diferentes fiquem IDÊNTICAS no
posicionamento, mudando apenas o texto traduzido.

Uso:
  python compose_cover.py --config config.json
config.json:
  {
    "art": "capas/master.png",
    "out": "capas/en-US.png",
    "title": "The Taste of Memory",
    "subtitle": "A novel",
    "author": "R. Paiva",
    "fonts_dir": "/.../canvas-design/canvas-fonts"
  }
"""
import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 2560
MARGIN_X = 140
USABLE = W - 2 * MARGIN_X
TITLE_TOP = int(H * 0.085)        # topo do bloco de título (fixo)
TITLE_MAX_LINES = 3
SUBTITLE_GAP = 36
AUTHOR_BASELINE = H - 200         # autor ancorado (tamanho fixo)
AUTHOR_SIZE = 60
SUBTITLE_SIZE = 58
RULE_W = 220                       # filete decorativo acima do autor


def font(fonts_dir, name, size):
    return ImageFont.truetype(os.path.join(fonts_dir, name), size)


def cover_resize(img):
    """Redimensiona a arte para preencher 1600x2560 (cover) e corta o centro."""
    img = img.convert("RGB")
    src_r = img.width / img.height
    dst_r = W / H
    if src_r > dst_r:
        nh = H
        nw = int(H * src_r)
    else:
        nw = W
        nh = int(W / src_r)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    return img.crop((left, top, left + W, top + H))


def scrim(base):
    """Gradiente escuro no topo e na base para legibilidade do texto."""
    overlay = Image.new("L", (1, H), 0)
    px = overlay.load()
    for y in range(H):
        a = 0
        # topo: 165 -> 0 até 42% da altura
        if y < H * 0.42:
            a = int(165 * (1 - y / (H * 0.42)))
        # base: 0 -> 205 a partir de 60%
        if y > H * 0.60:
            a = max(a, int(205 * ((y - H * 0.60) / (H * 0.40))))
        px[0, y] = a
    mask = overlay.resize((W, H))
    black = Image.new("RGB", (W, H), (8, 10, 14))
    return Image.composite(black, base, mask)


def wrap(draw, text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
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


def fit_title(draw, text, fonts_dir, max_w, max_lines):
    """Maior corpo que cabe na largura em <= max_lines linhas."""
    for size in range(176, 64, -4):
        fnt = font(fonts_dir, "CrimsonPro-Bold.ttf", size)
        lines = wrap(draw, text, fnt, max_w)
        if len(lines) <= max_lines and all(draw.textlength(l, font=fnt) <= max_w for l in lines):
            return fnt, lines, size
    fnt = font(fonts_dir, "CrimsonPro-Bold.ttf", 68)
    return fnt, wrap(draw, text, fnt, max_w)[:max_lines], 68


def draw_center(draw, y, text, fnt, fill, shadow=(0, 0, 0, 140)):
    w = draw.textlength(text, font=fnt)
    x = (W - w) / 2
    draw.text((x + 4, y + 4), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


def tracked(s, spaces=1):
    return (" " * spaces).join(list(s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()
    cfg = json.load(open(args.config, encoding="utf-8"))
    fonts_dir = cfg["fonts_dir"]

    base = scrim(cover_resize(Image.open(cfg["art"])))
    canvas = base.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    WHITE = (245, 244, 240, 255)
    title = (cfg.get("title") or "").strip()
    subtitle = (cfg.get("subtitle") or "").strip()
    author = (cfg.get("author") or "").strip()

    # Título (auto-fit, centralizado, bloco no topo fixo)
    tf, tlines, tsize = fit_title(draw, title, fonts_dir, USABLE, TITLE_MAX_LINES)
    line_gap = int(tsize * 0.14)
    y = TITLE_TOP
    for ln in tlines:
        draw_center(draw, y, ln, tf, WHITE)
        y += tsize + line_gap

    # Subtítulo (itálico, abaixo do título)
    if subtitle:
        sf = font(fonts_dir, "CrimsonPro-Italic.ttf", SUBTITLE_SIZE)
        for ln in wrap(draw, subtitle, sf, USABLE)[:2]:
            y += SUBTITLE_GAP
            draw_center(draw, y, ln, sf, (230, 228, 222, 255))
            y += SUBTITLE_SIZE

    # Filete + autor (tamanho fixo, ancorado na base)
    rule_y = AUTHOR_BASELINE - 70
    draw.line([(W / 2 - RULE_W / 2, rule_y), (W / 2 + RULE_W / 2, rule_y)], fill=(220, 218, 212, 220), width=3)
    af = font(fonts_dir, "CrimsonPro-Regular.ttf", AUTHOR_SIZE)
    draw_center(draw, AUTHOR_BASELINE, tracked(author.upper(), 1), af, WHITE)

    os.makedirs(os.path.dirname(cfg["out"]) or ".", exist_ok=True)
    canvas.convert("RGB").save(cfg["out"], "PNG")
    # PDF companheiro (mesma imagem)
    if cfg.get("pdf"):
        canvas.convert("RGB").save(cfg["pdf"], "PDF", resolution=300)
    print("OK", cfg["out"])


if __name__ == "__main__":
    main()
