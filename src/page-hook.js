/*
 * Listen Loop — runs in the page's MAIN world at document_start.
 *
 * Job: hand the content script the English caption track (json3) for a video.
 *  1. Read captionTracks from the player and try the track URL directly.
 *  2. If YouTube rejects that (PO-token protected), watch the player's own
 *     /api/timedtext request — we patch fetch/XHR early to see it — and
 *     re-request that URL (which carries a valid token) in json3 / English.
 *     If the player hasn't requested captions yet, briefly toggle CC to make it.
 */
(() => {
  'use strict';
  if (window.__listenLoopHook) return;
  window.__listenLoopHook = true;

  const HOOK = 'listen-loop-hook';
  const CS = 'listen-loop-cs';
  const captured = new Map(); // videoId -> { url, body }

  const isTimedtext = (url) => typeof url === 'string' && url.indexOf('/api/timedtext') !== -1;

  function remember(url, body) {
    try {
      const u = new URL(url, location.href);
      const v = u.searchParams.get('v');
      if (v) captured.set(v, { url: u.toString(), body: typeof body === 'string' ? body : null });
    } catch (_) { /* ignore */ }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input) {
      let url = '';
      try { url = input instanceof Request ? input.url : String(input); } catch (_) { /* ignore */ }
      const p = origFetch.apply(this, arguments);
      if (isTimedtext(url)) {
        p.then((res) => res.clone().text()).then((body) => remember(url, body), () => remember(url, null));
      }
      return p;
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__llUrl = String(url); } catch (_) { /* ignore */ }
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (isTimedtext(this.__llUrl)) {
      this.addEventListener('load', () => {
        let body = null;
        try {
          if (!this.responseType || this.responseType === 'text') body = this.responseText;
          else if (this.responseType === 'json') body = JSON.stringify(this.response);
          else if (this.responseType === 'arraybuffer') body = new TextDecoder().decode(this.response);
        } catch (_) { /* ignore */ }
        remember(this.__llUrl, body);
      });
    }
    return xhrSend.apply(this, arguments);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout, step) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      let v = null;
      try { v = fn(); } catch (_) { /* ignore */ }
      if (v) return v;
      await sleep(step || 200);
    }
    return null;
  }

  function validJson3(body) {
    if (!body || body.length < 10) return false;
    try {
      const o = JSON.parse(body);
      return Array.isArray(o.events) && o.events.some((e) => e.segs && e.segs.length);
    } catch (_) {
      return false;
    }
  }

  async function fetchText(url) {
    try {
      const r = await origFetch.call(window, url, { credentials: 'include' });
      return r.ok ? await r.text() : null;
    } catch (_) {
      return null;
    }
  }

  const ccButton = () => document.querySelector('#movie_player .ytp-subtitles-button');
  const ccOn = () => {
    const b = ccButton();
    return !!b && b.getAttribute('aria-pressed') === 'true';
  };

  function trackName(t) {
    const n = t.name || {};
    return n.simpleText || (n.runs || []).map((r) => r.text).join('') || t.languageCode;
  }

  async function getCaptions(videoId) {
    const player = await waitFor(() => {
      const p = document.getElementById('movie_player');
      if (!p || typeof p.getPlayerResponse !== 'function') return null;
      const pr = p.getPlayerResponse();
      return pr && pr.videoDetails && pr.videoDetails.videoId === videoId ? p : null;
    }, 15000);
    if (!player) return { error: 'player-not-ready' };

    const pr = player.getPlayerResponse();
    const tracks = (((pr || {}).captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
    if (!tracks.length) return { error: 'no-captions' };
    const en = tracks.filter((t) => /^en\b/i.test(t.languageCode || ''));
    if (!en.length) return { error: 'no-english', languages: tracks.map(trackName) };
    const track = en.find((t) => t.kind !== 'asr') || en[0];
    const info = { languageCode: track.languageCode, kind: track.kind || '', name: trackName(track), isAuto: track.kind === 'asr' };

    // 1) Plain track URL.
    const direct = new URL(track.baseUrl, location.origin);
    direct.searchParams.set('fmt', 'json3');
    let body = await fetchText(direct.toString());
    if (validJson3(body)) return { info, body, via: 'direct' };

    // 2) Use (or provoke) the player's own, token-bearing request.
    let cap = captured.get(videoId);
    if (!cap) {
      const btn = ccButton();
      const wasOn = ccOn();
      if (btn && !wasOn) btn.click();
      cap = await waitFor(() => captured.get(videoId), 8000);
      if (!wasOn && ccOn()) ccButton().click();
    }
    if (!cap) return { error: 'fetch-failed', info };

    const u = new URL(cap.url);
    const sameTrack = u.searchParams.get('lang') === track.languageCode &&
      (u.searchParams.get('kind') || '') === (track.kind || '') &&
      !u.searchParams.get('tlang') && u.searchParams.get('fmt') === 'json3';
    if (sameTrack && validJson3(cap.body)) return { info, body: cap.body, via: 'captured' };

    u.searchParams.set('fmt', 'json3');
    u.searchParams.delete('tlang');
    u.searchParams.set('lang', track.languageCode);
    if (track.kind) u.searchParams.set('kind', track.kind);
    else u.searchParams.delete('kind');
    body = await fetchText(u.toString());
    if (validJson3(body)) return { info, body, via: 'captured-refetch' };
    return { error: 'fetch-failed', info };
  }

  // ---- translation: Chrome's built-in, on-device Translator API (Chrome 138+).
  // Called from here, the page's main world, where the API is exposed. The first
  // use downloads a language model; Chrome only allows that right after a click or
  // key press, which is how the content script always asks.
  const translators = new Map(); // target language -> Promise<translator>
  async function translate(text, target, onProgress) {
    const T = window.Translator;
    if (!T || typeof T.create !== 'function') return { error: 'unsupported' };
    const opts = { sourceLanguage: 'en', targetLanguage: target };
    let ready = translators.get(target);
    if (!ready) {
      const avail = await T.availability(opts).catch(() => 'unavailable');
      if (avail === 'unavailable') return { error: 'unsupported' };
      ready = T.create(Object.assign({}, opts, {
        monitor(m) { m.addEventListener('downloadprogress', (ev) => onProgress(ev.loaded)); },
      }));
      translators.set(target, ready);
      ready.catch(() => translators.delete(target)); // let a later click retry
    }
    try {
      const tr = await ready;
      return { text: await tr.translate(text) };
    } catch (err) {
      return { error: 'failed', message: String((err && err.message) || err) };
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== CS) return;
    if (d.type === 'get-captions') {
      let result;
      try {
        result = await getCaptions(d.videoId);
      } catch (err) {
        result = { error: 'exception', message: String((err && err.message) || err) };
      }
      window.postMessage({ source: HOOK, type: 'captions', reqId: d.reqId, result }, '*');
    } else if (d.type === 'translate') {
      const progress = (loaded) => window.postMessage({ source: HOOK, type: 'translate-progress', reqId: d.reqId, loaded }, '*');
      let result;
      try {
        result = await translate(String(d.text || ''), d.target || 'zh', progress);
      } catch (err) {
        result = { error: 'failed', message: String((err && err.message) || err) };
      }
      window.postMessage({ source: HOOK, type: 'translation', reqId: d.reqId, result }, '*');
    }
  });
})();
