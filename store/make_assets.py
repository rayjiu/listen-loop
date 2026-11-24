#!/usr/bin/env python3
"""
Build the Chrome Web Store images from the raw screenshots.

    python3 store/make_assets.py

Input:  store/raw/<lang>-<n>-<name>.png — real captures at a 1280x800 viewport, 2x scale
        (YouTube watch page with the panel, or the notebook page).
Output: store/assets/
          icon-128.png                      store icon (96px artwork, 16px transparent padding)
          zh-1.png … zh-5.png, en-1 … en-5  screenshots, 1280x800
          promo-small-<lang>.png            440x280
          promo-marquee-<lang>.png          1400x560

Captions live in SHOTS / TILES below. Rendering uses Playwright's Chromium with the
system fonts (PingFang SC for Chinese), so run it on a Mac for the intended look.
"""
import base64
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT / "assets"
ICON = ROOT.parent / "icons" / "icon128.png"

RED = "#e5484d"

# Panel position on the 1280px-wide YouTube page (CSS px): left, top, right.
PANEL = (912, 68, 1264)

SHOTS = {
    "zh": [
        ("1-typing", "把 YouTube 变成<em>英语精听课</em>", "自动按句切分 · 单句循环 · 听到什么就打什么"),
        ("2-check", "逐词批改，<em>哪里没听出来</em>一目了然", "对、差一点、错、漏听分色标出；100 和 one hundred、don't 和 do not 都算对"),
        ("3-hints", "卡住了？<em>三级提示</em>帮你听懂", "提示首字母 → 中文译文 → 原文。译文用 Chrome 本地翻译，句子不上传"),
        ("4-notebook", "<em>错题本</em>：按遗忘曲线安排复习", "第 1、3、7、15、30 天自动提醒，记下你当时写的答案和听错的词"),
        ("5-review", "回到<em>原视频</em>复习，自动打分", "自动跳到那一句循环播放；全对进入下一轮，没记住明天再来"),
    ],
    "en": [
        ("1-typing", "Turn YouTube into <em>dictation practice</em>", "Split into sentences · loop one at a time · type what you hear"),
        ("2-check", "See exactly <em>what you missed</em>", "Right, close, wrong and missed words in different colours. 100 = one hundred, don't = do not"),
        ("3-hints", "Stuck? <em>Hints</em>, one step at a time", "First letters → Chinese translation → the answer. Translation runs on your device"),
        ("4-notebook", "A <em>mistake notebook</em> that schedules reviews", "Reviews on day 1, 3, 7, 15 and 30, with the answer you wrote and the words you missed"),
        ("5-review", "Review in the <em>original video</em>", "Jumps to the sentence and loops it, then grades itself from your answer"),
    ],
}

TILES = {
    "zh": {"tag": "YouTube 英语精听听写", "chips": ["单句循环", "逐词批改", "错题本复习"], "shot": "2-check"},
    "en": {"tag": "Dictation practice for YouTube", "chips": ["Loop a sentence", "Word-by-word check", "Spaced review"], "shot": "2-check"},
}

FONT = {
    "zh": '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
    "en": '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
}

# Screenshot frame geometry (output px)
W, H = 1280, 800
SIDE = 56          # left/right margin of the image card
BAND = 176         # caption band height
BAR = 30           # fake window bar on top of the card
CARD_W = W - 2 * SIDE
IMG_H = H - BAND - BAR  # the card runs off the bottom edge


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def raw(lang: str, name: str) -> Image.Image:
    return Image.open(RAW / f"{lang}-{name}.png").convert("RGB")


def card_image(lang: str, name: str) -> tuple[Image.Image, str]:
    """Crop of the raw capture sized exactly for the card (no browser scaling)."""
    im = raw(lang, name)
    k = im.width / 1280  # raw px per CSS px (2)
    if name.endswith("notebook"):
        x0, x1, y0 = 80, 1200, 0          # the notebook page's centred column
        url = "Listen Loop · " + ("错题本" if lang == "zh" else "Notebook")
    else:
        x0, x1, y0 = 0, 1280, 58          # below YouTube's top bar
        url = "youtube.com/watch?v=ekZLqE7XRU0"
    scale = CARD_W / (x1 - x0)
    y1 = y0 + IMG_H / scale
    box = tuple(round(v * k) for v in (x0, y0, x1, y1))
    return im.crop(box).resize((CARD_W, IMG_H), Image.LANCZOS), url


BASE_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: %(w)dpx; height: %(h)dpx; overflow: hidden; }
body { font-family: %(font)s; -webkit-font-smoothing: antialiased; }
em { font-style: normal; color: %(red)s; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.brand i { width: 9px; height: 9px; border-radius: 50%%; background: %(red)s; display: block; }
"""

SHOT_HTML = """<!doctype html><html lang="%(lang)s"><head><meta charset="utf-8"><style>
%(base)s
body { background: linear-gradient(180deg, #fff3f1 0%%, #fbf6f4 100%%); color: #141414; }
.band { height: %(band)dpx; padding: 38px %(side)dpx 0; }
.brand { font-size: 15px; color: #3a3a3a; height: 20px; }
h1 { margin-top: 14px; font-size: 40px; line-height: 48px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
p { margin-top: 10px; font-size: 18px; line-height: 27px; color: #5c5c5c; white-space: nowrap; }
.card { position: absolute; left: %(side)dpx; top: %(band)dpx; width: %(cw)dpx; border-radius: 14px 14px 0 0; overflow: hidden;
  background: #fff; box-shadow: 0 24px 64px rgba(80, 20, 20, .16), 0 0 0 1px rgba(0, 0, 0, .06); }
.bar { height: %(bar)dpx; background: #f1efee; display: flex; align-items: center; gap: 7px; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.06); }
.bar i { width: 10px; height: 10px; border-radius: 50%%; background: #d6d2d0; display: block; }
.bar span { margin-left: 18px; font: 12px -apple-system, sans-serif; color: #77706d; background: #fff; border-radius: 6px; padding: 3px 12px; }
.card img { display: block; width: %(cw)dpx; height: %(ih)dpx; }
</style></head><body>
<div class="band">
  <div class="brand"><i></i>Listen Loop</div>
  <h1>%(title)s</h1>
  <p>%(sub)s</p>
</div>
<div class="card"><div class="bar"><i></i><i></i><i></i><span>%(url)s</span></div><img src="%(img)s"></div>
</body></html>"""

SMALL_HTML = """<!doctype html><html lang="%(lang)s"><head><meta charset="utf-8"><style>
%(base)s
body { background: radial-gradient(120%% 140%% at 0%% 0%%, #2a2a2a 0%%, #141414 60%%); color: #fff;
  display: flex; align-items: center; padding: 0 36px; gap: 22px; }
img { width: 92px; height: 92px; display: block; flex: none; filter: drop-shadow(0 8px 20px rgba(229, 72, 77, .35)); }
.name { font-size: 34px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; }
.tag { margin-top: 8px; font-size: 17px; color: #c9c9c9; line-height: 1.35; }
.line { width: 36px; height: 3px; border-radius: 2px; background: %(red)s; margin-top: 14px; }
</style></head><body>
<img src="%(icon)s"><div><div class="name">Listen Loop</div><div class="tag">%(tag)s</div><div class="line"></div></div>
</body></html>"""

MARQUEE_HTML = """<!doctype html><html lang="%(lang)s"><head><meta charset="utf-8"><style>
%(base)s
body { background: radial-gradient(90%% 130%% at 0%% 0%%, #2b2b2b 0%%, #141414 65%%); color: #fff; position: relative; }
.left { position: absolute; left: 88px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; }
.icon { width: 104px; height: 104px; display: block; filter: drop-shadow(0 10px 26px rgba(229, 72, 77, .4)); }
.name { margin-top: 26px; font-size: 64px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.05; }
.tag { margin-top: 12px; font-size: 28px; color: #cfcfcf; }
.chips { margin-top: 30px; display: flex; gap: 12px; flex-wrap: wrap; }
.chips span { font-size: 18px; padding: 8px 18px; border-radius: 22px; background: rgba(255,255,255,.09); color: #eee;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.shot { position: absolute; right: 96px; top: 56px; width: %(pw)dpx; border-radius: 16px 16px 0 0; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
.shot img { display: block; width: %(pw)dpx; height: %(ph)dpx; }
</style></head><body>
<div class="left"><img class="icon" src="%(icon)s"><div class="name">Listen Loop</div><div class="tag">%(tag)s</div>
<div class="chips">%(chips)s</div></div>
<div class="shot"><img src="%(img)s"></div>
</body></html>"""


def render(page, html: str, w: int, h: int, out: Path):
    page.set_viewport_size({"width": w, "height": h})
    page.set_content(html, wait_until="load")
    page.evaluate("document.fonts.ready")
    tmp = out.with_suffix(".tmp.png")
    page.screenshot(path=str(tmp), clip={"x": 0, "y": 0, "width": w, "height": h})
    Image.open(tmp).convert("RGB").save(out, "PNG", optimize=True)  # store wants no alpha
    tmp.unlink()
    print(out.relative_to(ROOT.parent), Image.open(out).size)


def store_icon():
    art = Image.open(ICON).convert("RGBA").resize((96, 96), Image.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(art, (16, 16), art)
    out = OUT / "icon-128.png"
    canvas.save(out, "PNG", optimize=True)
    print(out.relative_to(ROOT.parent), canvas.size)


def input_top(im: Image.Image, k: float) -> int:
    """CSS y of the answer box: the first row of its blue focus border inside the panel."""
    x = round((PANEL[0] + 90) * k)
    for y in range(round(150 * k), round(700 * k)):
        r, g, b = im.getpixel((x, y))
        if b > 170 and r < 90 and g < 140:
            return round(y / k)
    raise SystemExit("answer box not found — was the input focused in the capture?")


def panel_focus(lang: str, name: str, width: int, height: int) -> Image.Image:
    """The dictation core of the panel (input box down to the result), for the marquee."""
    im = raw(lang, name)
    k = im.width / 1280
    x0, x1 = PANEL[0], PANEL[2]
    y0 = input_top(im, k) - 14  # start just above the answer box
    scale = width / (x1 - x0)
    y1 = y0 + height / scale
    return im.crop(tuple(round(v * k) for v in (x0, y0, x1, y1))).resize((width, height), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    store_icon()
    icon_uri = data_uri(Image.open(ICON).convert("RGBA"))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        for lang, shots in SHOTS.items():
            base = BASE_CSS % {"w": W, "h": H, "font": FONT[lang], "red": RED}
            for i, (name, title, sub) in enumerate(shots, 1):
                img, url = card_image(lang, name)
                html = SHOT_HTML % {"lang": lang, "base": base, "band": BAND, "side": SIDE, "cw": CARD_W, "bar": BAR,
                                    "ih": IMG_H, "title": title, "sub": sub, "url": url, "img": data_uri(img)}
                render(page, html, W, H, OUT / f"{lang}-{i}.png")
            t = TILES[lang]
            html = SMALL_HTML % {"lang": lang, "base": BASE_CSS % {"w": 440, "h": 280, "font": FONT[lang], "red": RED},
                                 "icon": icon_uri, "tag": t["tag"], "red": RED}
            render(page, html, 440, 280, OUT / f"promo-small-{lang}.png")
            pw, ph = 452, 504
            html = MARQUEE_HTML % {"lang": lang, "base": BASE_CSS % {"w": 1400, "h": 560, "font": FONT[lang], "red": RED},
                                   "icon": icon_uri, "tag": t["tag"], "pw": pw, "ph": ph,
                                   "chips": "".join(f"<span>{c}</span>" for c in t["chips"]),
                                   "img": data_uri(panel_focus(lang, t["shot"], pw, ph))}
            render(page, html, 1400, 560, OUT / f"promo-marquee-{lang}.png")
        browser.close()


if __name__ == "__main__":
    main()
