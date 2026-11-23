"""End-to-end test: load the unpacked extension in headless Chromium and drive it.

    python3 test/e2e.py <output_dir>

YouTube refuses to play or serve captions to automated browsers, so the test runs
against test/harness.html — a stand-in watch page served at
https://www.youtube.com/watch?v=... through Playwright routing (no network access).
It has the same player DOM/API surface the extension relies on, a seekable audio
track, YouTube-like hotkeys, and a timedtext endpoint that, like YouTube today,
returns an empty body unless the request carries the player's pot token.

Real-YouTube behaviour (selectors, the player's own caption request) must still be
checked by hand in a normal Chrome profile — see README.
"""
import os
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'e2e-out')
os.makedirs(OUT, exist_ok=True)
for _d in ('profile', 'profile-en'):
    shutil.rmtree(os.path.join(OUT, _d), ignore_errors=True)  # start from empty extension storage
VID = 'bghlEqTApEQ'
URL = f'https://www.youtube.com/watch?v={VID}&t=31'
HARNESS = open(os.path.join(HERE, 'harness.html'), encoding='utf-8').read()
FIXTURE = open(os.path.join(HERE, 'fixtures', 'asr-steve-kerr.json3'), encoding='utf-8').read()
# Line-level captions (no word times, overlapping cues) as the real web player gets them.
GEMINI_VID = 'XSKxKJlixs0'
GEMINI = open(os.path.join(HERE, 'fixtures', 'cues-draymond-gemini.json3'), encoding='utf-8').read()
HOST = '#listen-loop-host'

failures = []
timedtext_log = []


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def check(cond, msg):
    log(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def handle(route):
    url = route.request.url
    if '/watch' in url:
        return route.fulfill(status=200, content_type='text/html', body=HARNESS)
    if '/api/timedtext' in url:
        timedtext_log.append(url)
        body = (GEMINI if f'v={GEMINI_VID}' in url else FIXTURE) if 'pot=' in url else ''  # no token -> empty, like YouTube
        return route.fulfill(status=200, content_type='application/json', body=body)
    return route.fulfill(status=404, body='')


VIDEO = """() => { const v = document.querySelector('#movie_player video');
  return { t: v.currentTime, paused: v.paused, rate: v.playbackRate, muted: v.muted,
           fs: window.__harness.fullscreen, keys: window.__harness.hotkeys.slice(),
           cc: document.querySelector('.ytp-subtitles-button').getAttribute('aria-pressed') }; }"""


def sample(page, secs):
    out = []
    t0 = time.time()
    while time.time() - t0 < secs:
        out.append(page.evaluate(VIDEO)['t'])
        time.sleep(0.1)
    return out


def text(page, sel):
    return page.locator(f'{HOST} {sel}').inner_text()


def wait_phase(page, timeout=30):
    panel = page.locator(f'{HOST} .panel')
    t0 = time.time()
    while time.time() - t0 < timeout and panel.get_attribute('data-phase') in ('idle', 'loading'):
        time.sleep(0.2)
    return panel.get_attribute('data-phase')


with sync_playwright() as p:
    def launch(profile, locale):
        c = p.chromium.launch_persistent_context(
            os.path.join(OUT, profile), channel='chromium', headless=True, locale=locale,
            viewport={'width': 1440, 'height': 900},
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', f'--lang={locale}',
                  '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
        )
        c.route('https://www.youtube.com/**', handle)
        return c

    ctx = launch('profile', 'zh-CN')  # Chinese browser -> Chinese UI
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.on('pageerror', lambda e: log('pageerror:', e))

    page.goto(URL)
    page.wait_for_selector(HOST, state='attached', timeout=20000)
    inside = page.evaluate(f"() => document.querySelector('{HOST}').parentElement.id")
    check(inside == 'secondary-inner', f'panel mounted in the right column (parent=#{inside})')
    gap = page.evaluate(f"""() => {{ const h = document.querySelector('{HOST}');
        return h.nextElementSibling.getBoundingClientRect().top - h.getBoundingClientRect().bottom; }}""")
    check(gap == 24, f'24px gap below the panel despite page CSS zeroing margins (gap={gap})')
    page.screenshot(path=os.path.join(OUT, '1-idle.png'))

    # ---- caption retrieval through the token-bearing player request
    page.locator(f'{HOST} [data-act=start]').first.click()
    phase = wait_phase(page)
    via = page.locator(f'{HOST} .panel').get_attribute('data-via')
    check(phase == 'ready', f'captions loaded (phase={phase}, via={via})')
    if phase != 'ready':
        log('error:', text(page, '.err'))
        page.screenshot(path=os.path.join(OUT, '2-error.png'))
        sys.exit(1)
    check(via == 'captured-refetch', 'fell back to the player request and re-fetched it as English json3')
    refetch = [u for u in timedtext_log if 'pot=' in u and 'tlang' not in u]
    check(bool(refetch) and 'fmt=json3' in refetch[0], 'refetch kept pot, dropped tlang, asked for json3')
    check(page.evaluate(VIDEO)['cc'] == 'false', 'CC switched back off after grabbing captions')
    log('summary:', text(page, '.list summary'))
    check(text(page, '.sent-time') == '0:30.2 – 0:32.5', f'started at the sentence under t=31s ({text(page, ".sent-time")})')

    # ---- looping
    ts = sample(page, 11)
    jumps = sum(1 for a, b in zip(ts, ts[1:]) if b < a - 0.5)
    log('clock range %.2f – %.2f, seek-backs=%d, status=%r' % (min(ts), max(ts), jumps, text(page, '.loop-status')))
    check(min(ts) >= 29.95 and max(ts) <= 32.65, 'playback stayed inside 0:30.16–0:32.48 (+padding)')
    check(jumps == 2, 'three passes = two jumps back')
    check('听了 3 遍' in text(page, '.loop-status'), 'stopped after 3 passes')
    check(page.evaluate(VIDEO)['paused'], 'video paused after the last pass')
    page.screenshot(path=os.path.join(OUT, '3-looped.png'))

    # ---- typing in the panel must not reach the page's hotkeys
    box = page.locator(f'{HOST} textarea.input')
    box.click()
    before = page.evaluate(VIDEO)
    page.keyboard.type('k f j l m 0 5 c ')
    time.sleep(0.4)
    after = page.evaluate(VIDEO)
    check(after['keys'] == before['keys'], f'no page hotkeys fired while typing (got {after["keys"][len(before["keys"]):]})')
    check(abs(after['t'] - before['t']) < 0.5 and not after['muted'] and not after['fs'] and after['cc'] == 'false',
          'video untouched by typed keys')

    # ---- dictation
    box.fill('so we stay in touch and i love hearing from him')
    page.keyboard.press('Enter')
    time.sleep(0.3)
    check('全对' in text(page, '.result'), 'correct answer -> 全对')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '4-correct.png'))
    page.keyboard.press('Enter')
    time.sleep(0.4)
    check(text(page, '.sent-time').startswith('0:32.5'), f'Enter again -> next sentence ({text(page, ".sent-time")})')
    check(box.input_value() == '', 'input cleared for the next sentence')

    box.type("I love seeing him before game today")
    page.keyboard.press('Enter')
    time.sleep(0.3)
    res = text(page, '.result')
    statuses = page.evaluate(f"""() => [...document.querySelector('{HOST}').shadowRoot
        .querySelectorAll('.result .words .w')].map(e => e.className.slice(2) + ':' + e.textContent)""")
    log('result:', res.split('\n')[0], '|', statuses)
    check('near:loved' in statuses and 'missing:the' in statuses and 'ok:game.' in statuses, 'loved=near, the=missing, game=ok')
    check('today' in res, 'extra word "today" shown')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '5-diff.png'))

    # ---- Tab / Alt shortcuts
    page.keyboard.press('Tab')
    time.sleep(0.3)
    st = page.evaluate(VIDEO)
    check(32.2 <= st['t'] <= 34.7 and not st['paused'], 'Tab replays current sentence (t=%.2f)' % st['t'])
    check(page.evaluate(f"() => document.querySelector('{HOST}').shadowRoot.activeElement?.tagName") == 'TEXTAREA',
          'focus stays in the input after Tab')
    page.keyboard.press('Alt+ArrowRight')
    time.sleep(0.3)
    check(text(page, '.sent-time').startswith('0:34.'), f'Alt+→ -> next sentence ({text(page, ".sent-time")})')
    page.keyboard.press('Alt+ArrowUp')
    time.sleep(0.2)
    check(abs(page.evaluate(VIDEO)['rate'] - 1.1) < 0.01, 'Alt+↑ -> 1.1x')
    page.keyboard.press('Alt+ArrowDown')
    time.sleep(0.2)
    check(abs(page.evaluate(VIDEO)['rate'] - 1.0) < 0.01, 'Alt+↓ -> 1.0x')
    page.keyboard.press('Alt+KeyH')
    time.sleep(0.2)
    log('hint:', text(page, '.hint'))
    check(text(page, '.hint').startswith('I  h___'), 'Alt+H shows first-letter hint')

    # ---- translation (Alt+T / 译文 button): Chrome's built-in Translator, faked by the harness
    H = lambda: page.evaluate('() => window.__harness')
    page.evaluate('() => { window.__harness.fake = window.Translator; delete window.Translator; }')
    page.keyboard.press('Alt+KeyT')
    time.sleep(0.4)
    check('没有内置翻译' in text(page, '.trans'), f'no Translator API -> clear message ({text(page, ".trans")!r})')
    page.evaluate('() => { window.Translator = window.__harness.fake; }')
    page.keyboard.press('Alt+KeyT')  # after a failure, pressing again retries
    time.sleep(0.35)
    log('translating:', text(page, '.trans').replace('\n', ' | '))
    check('下载翻译模型' in text(page, '.trans') or '正在翻译' in text(page, '.trans'), 'first use shows model download / progress')
    time.sleep(1.2)
    check(text(page, '.trans').endswith("【译】I hadn't seen him probably in a couple years."), f'translation shown ({text(page, ".trans")!r})')
    check(page.evaluate(f"() => document.querySelector('{HOST}').shadowRoot.activeElement?.tagName") == 'TEXTAREA', 'focus stays in the input')
    page.keyboard.press('Alt+KeyT')
    time.sleep(0.2)
    check(not page.locator(f'{HOST} .trans').is_visible(), 'Alt+T again hides it')
    for _ in range(3): page.keyboard.press('Alt+ArrowLeft')
    time.sleep(0.3)
    check(not page.locator(f'{HOST} .trans').is_visible(), 'a new sentence starts with the translation hidden')
    page.locator(f'{HOST} [data-act=trans]').click()  # sentence 10: "and uh he's the biggest Warriors fan there is."
    time.sleep(0.5)
    check(H()['translated'][-1] == "and he's the biggest Warriors fan there is.", f'fillers dropped before translating ({H()["translated"][-1]!r})')
    for _ in range(3): page.keyboard.press('Alt+ArrowRight')
    time.sleep(0.3)
    n = len(H()['translated'])
    page.keyboard.press('Alt+KeyT')
    time.sleep(0.2)
    check(text(page, '.trans').endswith("in a couple years.") and len(H()['translated']) == n and H()['translatorCreated'] == 1,
          'cached: shown again instantly, no second translation, one model load')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '5b-trans.png'))
    page.keyboard.press('Alt+KeyT')

    # ---- scrubbing elsewhere ends the loop, then the panel follows playback
    page.keyboard.press('Alt+ArrowRight')  # fresh sentence (clears hint/result)
    time.sleep(0.5)
    page.evaluate("() => { document.querySelector('#movie_player video').currentTime = 100; }")
    time.sleep(2.5)
    st = page.evaluate(VIDEO)
    check(not st['paused'] and st['t'] > 101, 'after a user seek the video keeps playing normally (t=%.2f)' % st['t'])
    check(text(page, '.loop-status') == '', 'loop ended')
    check(text(page, '.sent-time').startswith('1:4'), f'panel follows playback ({text(page, ".sent-time")})')

    # ---- outside the panel: page hotkeys still work, Alt+R replays
    page.locator('h1').click()
    page.keyboard.press('k')
    time.sleep(0.2)
    check(page.evaluate(VIDEO)['keys'][-1:] == ['k'], 'plain k outside the panel still reaches the page')
    page.keyboard.press('Alt+KeyR')
    time.sleep(0.3)
    st = page.evaluate(VIDEO)
    check(not st['paused'], 'Alt+R from the page replays a sentence (t=%.2f)' % st['t'])

    # ---- list, settings, mask
    page.locator(f'{HOST} .list summary').click()
    time.sleep(0.3)
    page.locator(HOST).screenshot(path=os.path.join(OUT, '6-list.png'))
    page.locator(f'{HOST} [data-act=toggle-settings]').click()
    page.locator(f'{HOST} input[data-set=mask]').check()
    time.sleep(0.2)
    check(page.evaluate("() => document.querySelector('#movie_player #listen-loop-mask') !== null"), 'hard-sub mask added to the player')

    # ---- theme: the panel follows YouTube's <html dark>
    bg = lambda: page.locator(f'{HOST} .panel').evaluate('p => getComputedStyle(p).backgroundColor')
    light_bg = bg()
    page.evaluate("() => document.documentElement.setAttribute('dark', '')")
    time.sleep(0.2)
    dark_bg = bg()
    log('panel background light=%s dark=%s' % (light_bg, dark_bg))
    check(light_bg == 'rgb(255, 255, 255)' and dark_bg == 'rgb(28, 28, 28)', 'panel switches to the dark palette with YouTube')
    page.screenshot(path=os.path.join(OUT, '8-dark.png'))
    page.evaluate("() => document.documentElement.removeAttribute('dark')")
    time.sleep(0.2)
    check(bg() == light_bg, 'and back to light')

    # ---- language: switch to English by hand and back to auto (Chinese here)
    box = page.locator(f'{HOST} textarea.input')
    box.fill('half typed')
    page.locator(f'{HOST} select[data-set=lang]').select_option('en')
    time.sleep(0.3)
    log('english:', text(page, '.sent-no'), '|', text(page, '.list summary'), '|', text(page, 'h4'))
    check(text(page, '.sent-no').startswith('Sentence ') and text(page, 'h4') == 'Settings', 'manual switch -> English panel')
    check(page.locator(f'{HOST} textarea.input').input_value() == 'half typed', 'typed text survives the switch')
    check(page.locator(f'{HOST} .settings').is_visible() and page.locator(f'{HOST} .list').evaluate('d => d.open'),
          'settings and list stay open after the switch')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '7b-english.png'))
    page.locator(f'{HOST} select[data-set=lang]').select_option('auto')
    time.sleep(0.3)
    check(text(page, '.sent-no').startswith('第 '), 'auto -> back to Chinese in a Chinese browser')
    page.locator(f'{HOST} textarea.input').fill('')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '7-settings.png'))
    page.screenshot(path=os.path.join(OUT, '8-full.png'))
    page.locator(f'{HOST} [data-act=toggle-settings]').click()

    # ---- segmentation fixes: nudge an edge (with preview), join, split
    def count():
        return int(text(page, '.list summary').split('共 ')[1].split(' 句')[0])
    n0 = count()
    page.locator(f'{HOST} li[data-i="12"]').click()  # 0:34.56–0:36.40, next one starts right at 36.40
    time.sleep(0.3)
    check(text(page, '.sent-time') == '0:34.6 – 0:36.4', f'picked sentence 13 ({text(page, ".sent-time")})')
    page.locator(f'{HOST} [data-act=toggle-adjust]').click()
    check(page.locator(f'{HOST} .adjust').is_visible(), 'adjust bar opens')
    end_earlier = page.locator(f'{HOST} [data-act=adj][data-w="1"][data-d="-1"]')
    end_earlier.click()
    end_earlier.click()
    time.sleep(0.2)
    log('adjust end:', text(page, '.adj-end'), '| status:', text(page, '.loop-status'))
    check(text(page, '.adj-end') == '0:36.2 −0.2', 'end moved 0.2 s earlier, shown with its offset')
    check(text(page, '.sent-time') == '0:34.6 – 0:36.2', 'sentence time follows the nudge')
    check(text(page, '.loop-status') == '▶ 试听', 'a nudge plays a short preview')
    ts = sample(page, 2.6)
    log('preview clock %.2f – %.2f' % (min(ts), max(ts)))
    check(min(ts) >= 34.4 and max(ts) <= 36.35, 'preview = last 2 s of the sentence, stops at the new end')
    check(text(page, '.loop-status').startswith('试听完'), 'preview plays once')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '9-adjust.png'))

    page.locator(f'{HOST} [data-act=join-next]').click()
    time.sleep(0.3)
    check(count() == n0 - 1 and text(page, '.sent-time') == '0:34.6 – 0:39.9', f'join next -> one sentence ({text(page, ".sent-time")}, {count()})')
    check(page.locator(f'{HOST} [data-act=split]').is_enabled(), 'split enabled on a merged sentence')
    page.locator(f'{HOST} [data-act=split]').click()
    time.sleep(0.3)
    check(count() == n0 and text(page, '.sent-time') == '0:34.6 – 0:36.4', f'split -> back to two ({text(page, ".sent-time")}, {count()})')
    check(not page.locator(f'{HOST} [data-act=split]').is_enabled(), 'split disabled on a single piece')
    page.locator(f'{HOST} [data-act=adj][data-w="0"][data-d="1"]').click()  # start 0.1 s later; must persist
    time.sleep(0.2)
    check(text(page, '.sent-time') == '0:34.7 – 0:36.4', f'start nudged later ({text(page, ".sent-time")})')

    # ---- progress survives a reload
    time.sleep(0.8)
    page.reload()
    page.wait_for_selector(HOST, state='attached')
    page.locator(f'{HOST} [data-act=start]').first.click()
    wait_phase(page)
    check(text(page, '.hdr-info').startswith('已完成 1 /'), f'progress restored after reload ({text(page, ".hdr-info")})')
    page.locator('h1').click()
    page.keyboard.press('Alt+ArrowRight')
    page.keyboard.press('Alt+ArrowRight')
    time.sleep(0.3)
    check(text(page, '.sent-time') == '0:34.7 – 0:36.4', f'boundary fix restored after reload ({text(page, ".sent-time")})')

    # ---- SPA navigation to a video whose captions are line-level cues
    page.evaluate(f"""() => {{ history.pushState({{}}, '', '/watch?v={GEMINI_VID}');
                         document.dispatchEvent(new CustomEvent('yt-navigate-finish')); }}""")
    time.sleep(0.5)
    page.locator(f'{HOST} [data-act=start]').first.click()
    phase = wait_phase(page)
    check(phase == 'ready', f'line-level captions loaded ({phase})')
    if not page.locator(f'{HOST} .list').evaluate('d => d.open'):
        page.locator(f'{HOST} .list summary').click()
    page.locator(f'{HOST} li[data-i="1"]').click()
    time.sleep(0.2)
    page.keyboard.press('Alt+KeyA')
    time.sleep(0.2)
    original = page.locator(f'{HOST} .result .words').inner_text()
    check(original == "On today's show, uh we will talk about the tough road trip.", f'sentence 2 in spoken order ({original!r})')
    page.keyboard.press('Alt+KeyA')
    ts = sample(page, 5)
    log('sentence 2 clock %.2f – %.2f (%s)' % (min(ts), max(ts), text(page, '.sent-time')))
    check(min(ts) >= 2.85 and max(ts) <= 7.2, 'sentence 2 plays 2.95–7.11 s: mid-cue start gets extra lead-in, no spill into "Uh there\'s"')
    page.locator(HOST).screenshot(path=os.path.join(OUT, '10-gemini.png'))

    # ---- SPA navigation to a video without captions
    page.evaluate("""() => { history.pushState({}, '', '/watch?v=NOCAPS00000');
                         document.dispatchEvent(new CustomEvent('yt-navigate-finish')); }""")
    time.sleep(0.5)
    check(page.locator(f'{HOST} .panel').get_attribute('data-phase') == 'idle', 'panel reset on navigation')
    page.locator(f'{HOST} [data-act=start]').first.click()
    phase = wait_phase(page)
    check(phase == 'error' and '没有字幕' in text(page, '.err'), f'no-captions video -> clear message ({text(page, ".err")})')
    ctx.close()

    # ---- an English browser gets the English UI without touching settings
    ctx = launch('profile-en', 'en-US')
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(URL)
    page.wait_for_selector(HOST, state='attached', timeout=20000)
    check(text(page, '.view-idle [data-act=start]') == 'Start practice', f'English browser -> English panel ({text(page, ".view-idle [data-act=start]")!r})')
    page.locator(f'{HOST} [data-act=start]').first.click()
    wait_phase(page)
    check(text(page, '.sent-no').startswith('Sentence ') and 'auto-generated' in text(page, '.list summary'),
          f'English labels after loading ({text(page, ".sent-no")} | {text(page, ".list summary")})')
    time.sleep(0.5)
    page.locator(HOST).screenshot(path=os.path.join(OUT, '11-english-browser.png'))
    ctx.close()

log('DONE — failures:', failures if failures else 'none')
sys.exit(1 if failures else 0)
