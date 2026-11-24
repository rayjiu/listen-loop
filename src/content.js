/*
 * Listen Loop — content script (isolated world).
 * Panel UI, sentence looping on the page's <video>, dictation checking,
 * keyboard shortcuts, progress storage, YouTube SPA navigation.
 */
(() => {
  'use strict';
  if (window.__listenLoopContent) return;
  window.__listenLoopContent = true;

  const { buildPieces, assemble } = window.LLSegment;
  const { checkAnswer, hintText } = window.LLCheck;
  const I18N = window.LLI18n;
  const NB = window.LLNotebook;

  const HOOK = 'listen-loop-hook';
  const CS = 'listen-loop-cs';
  const PAD_START = 0.15; // seconds of lead-in before a sentence…
  const PAD_END = 0.08; // …and after it, when there is a pause to spare
  const JOINT_LEAD = 0.08; // lead-in when the previous sentence runs straight into this one
  const EST_LEAD = 0.2; // …or when this sentence's start time is only interpolated (mid-cue)
  const ADJ_STEP = 100; // ms per click when the learner nudges a boundary
  const PREVIEW = 2; // seconds heard after a nudge (start or end of the sentence)
  const DOCK_GAP = 24; // px between the panel and what follows it in YouTube's right column
  const RATES = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25];
  const LOOPS = [1, 2, 3, 5, 10, 0]; // 0 = forever
  const GAPS = [0, 0.5, 1, 1.5, 2, 3];
  const DEFAULTS = {
    loops: 3, gap: 1, rate: 1, ignoreFillers: true, listText: false, autoStart: false,
    collapsed: false, mask: false, maskHeight: 14, maskBottom: 12, lang: 'auto',
  };

  let settings = { ...DEFAULTS };
  let lang = 'zh'; // resolved UI language: 'zh' | 'en'
  /** UI string in the current language, with {placeholders} filled from vars. */
  function t(key, vars) {
    const d = I18N.dict;
    let str = (d[lang] && d[lang][key]) != null ? d[lang][key] : d.zh[key] != null ? d.zh[key] : key;
    if (vars) str = str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
    return str;
  }
  const resolveLang = () => (settings.lang === 'zh' || settings.lang === 'en' ? settings.lang : I18N.detect());
  let S = freshState(null);
  let loop = null; // { i, played, total, phase: playing|gap|done|paused|ad, timer, range, a, b }
  let selfSeekTarget = null; // where our own last seek was headed
  let selfPlayUntil = 0;
  let selfPauseUntil = 0;
  let rafId = 0;
  let nbItems = {}; // the mistake notebook (all videos), mirrored from storage
  let session = null; // active review session { queue, pos, results }, mirrored from storage
  let host = null;
  let root = null;
  const el = {};

  function freshState(videoId) {
    return {
      videoId, phase: 'idle', error: null, info: null, sentences: [], idx: 0, progress: {},
      hint: false, revealed: false, result: null, checkedText: null, loadSeq: 0,
      pieces: [], edits: normEdits(null), adjOpen: false,
      trans: false, // translation box open for the current sentence
      transCache: {}, // `${lang}|${text}` -> translation, saved per video
      transJob: null, // { key, status: 'loading'|'error', progress, error }
      mode: 'practice', // or 'review' (mistake notebook review: sentences come from saved items)
      review: null, // { ids, qpos }: this video's items and their positions in the session queue
      helped: false, // hint or translation opened for the current sentence
      rv: null, // review grade of the current item { before, auto, grade }
      summary: null, // counts shown when a review session ends
    };
  }
  /** The learner's segmentation fixes for one video (see LLSegment.assemble). */
  function normEdits(e) {
    return {
      join: Array.isArray(e && e.join) ? e.join : [],
      split: Array.isArray(e && e.split) ? e.split : [],
      adj: e && e.adj && typeof e.adj === 'object' ? e.adj : {},
    };
  }

  // ---------------------------------------------------------------- utils
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(sec, tenths) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
    return `${m}:${ss}`;
  }
  const now = () => performance.now();

  // -------------------------------------------------------------- storage
  async function sget(key, dflt) {
    try {
      const r = await chrome.storage.local.get(key);
      return r[key] === undefined ? dflt : r[key];
    } catch (_) {
      return dflt;
    }
  }
  function sset(key, val) {
    try { chrome.storage.local.set({ [key]: val }).catch(() => {}); } catch (_) { /* context invalidated */ }
  }
  const saveSettings = () => sset('ll:settings', settings);
  let saveTimer = 0;
  function saveVideo() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!S.videoId || S.phase !== 'ready' || S.mode === 'review') return;
      sset('ll:video:' + S.videoId, {
        idx: S.idx, progress: S.progress, edits: S.edits, n: S.sentences.length,
        title: document.title.replace(/ - YouTube$/, ''), updated: Date.now(),
      });
    }, 400);
  }
  async function recordMissed(words) {
    if (!words.length) return;
    const m = await sget('ll:missed', {});
    for (const w of words) m[w] = (m[w] || 0) + 1;
    sset('ll:missed', m);
  }

  // ------------------------------------------------------- caption bridge
  let reqSeq = 0;
  const pending = new Map(); // reqId -> { done(result), progress(loaded) }
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== HOOK) return;
    const p = pending.get(e.data.reqId);
    if (!p) return;
    if (e.data.type === 'translate-progress') { if (p.progress) p.progress(e.data.loaded); return; }
    if (e.data.type === 'captions' || e.data.type === 'translation') { pending.delete(e.data.reqId); p.done(e.data.result); }
  });
  /** Ask the page-world hook for something; resolves with its result or {error:'timeout'}. */
  function askHook(msg, timeoutMs, progress) {
    return new Promise((resolve) => {
      const reqId = `${++reqSeq}:${Date.now()}`;
      const timer = setTimeout(() => { pending.delete(reqId); resolve({ error: 'timeout' }); }, timeoutMs);
      pending.set(reqId, { done: (r) => { clearTimeout(timer); resolve(r); }, progress });
      window.postMessage(Object.assign({ source: CS, reqId }, msg), '*');
    });
  }
  const requestCaptions = (videoId) => askHook({ type: 'get-captions', videoId }, 40000);


  // ---------------------------------------------------------------- video
  const $player = () => document.getElementById('movie_player');
  const getVideo = () => document.querySelector('#movie_player video.html5-main-video') || document.querySelector('#movie_player video');
  const isAd = () => !!($player() && $player().classList.contains('ad-showing'));
  function currentVideoId() {
    if (location.pathname !== '/watch') return null;
    return new URLSearchParams(location.search).get('v');
  }
  function ccButton() { return document.querySelector('#movie_player .ytp-subtitles-button'); }
  function hideYouTubeCC() {
    const b = ccButton();
    if (b && b.getAttribute('aria-pressed') === 'true') b.click();
  }

  function attachVideo(v) {
    if (!v || v.__llAttached) return;
    v.__llAttached = true;
    v.addEventListener('seeking', () => {
      const ours = selfSeekTarget !== null && Math.abs(v.currentTime - selfSeekTarget) < 0.3;
      if (loop && !ours) stopLoop(); // user scrubbed elsewhere
    });
    v.addEventListener('seeked', () => { selfSeekTarget = null; });
    v.addEventListener('play', () => {
      if (loop && loop.phase !== 'playing' && loop.phase !== 'ad' && now() > selfPlayUntil) stopLoop(); // user resumed normal playback
    });
    v.addEventListener('pause', () => {
      if (loop && loop.phase === 'playing' && now() > selfPauseUntil) { loop.phase = 'paused'; renderStatus(); }
    });
    v.addEventListener('timeupdate', () => {
      if (loop && loop.phase === 'playing') checkEnd();
      else if (!loop && S.phase === 'ready') syncToTime(v.currentTime);
    });
  }

  // ----------------------------------------------------------------- loop
  /**
   * What actually gets played for sentence i: a little lead-in and tail, but never
   * spilling into a neighbour that is spoken without a pause. Caption timings are
   * approximate, and at such a joint any padding lands in the other sentence.
   */
  function playBounds(i) {
    const ss = S.sentences;
    const s = ss[i];
    if (s.range) return s.range; // review item: the range saved with it
    const prev = ss[i - 1];
    const next = ss[i + 1];
    const minLead = s.estStart && s.start === s.start0 ? EST_LEAD : JOINT_LEAD; // learner-set starts are exact
    const lead = prev ? Math.min(Math.max(PAD_START, minLead), Math.max(minLead, s.start - prev.end)) : PAD_START;
    const tail = next ? Math.min(PAD_END, Math.max(0, next.start - s.end - 0.03)) : PAD_END;
    return { a: Math.max(0, s.start - lead), b: s.end + tail };
  }

  /** Loop sentence i; with `range` ({a, b} seconds) play just that slice once. */
  function playSentence(i, range) {
    const s = S.sentences[i];
    const v = getVideo();
    if (!s || !v) return;
    attachVideo(v);
    if (loop) clearTimeout(loop.timer);
    loop = { i, played: 0, total: range ? 1 : settings.loops, phase: 'playing', timer: 0, range: range || null };
    startPass();
  }

  function startPass() {
    if (!loop) return;
    const v = getVideo();
    const s = S.sentences[loop.i];
    if (!v || !s) return;
    if (isAd()) {
      loop.phase = 'ad';
      loop.timer = setTimeout(startPass, 500);
      renderStatus();
      return;
    }
    v.playbackRate = settings.rate;
    const r = loop.range || playBounds(loop.i);
    loop.a = r.a;
    loop.b = r.b;
    selfSeekTarget = r.a;
    v.currentTime = selfSeekTarget;
    loop.phase = 'playing';
    selfPlayUntil = now() + 1000;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
    renderStatus();
    kick();
  }

  function kick() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function tick() {
    rafId = 0;
    if (!loop || loop.phase !== 'playing') return;
    if (!checkEnd()) kick();
  }

  /** Returns true when the current pass just finished. */
  function checkEnd() {
    const v = getVideo();
    if (!v || !loop || loop.b === undefined || isAd() || selfSeekTarget !== null || v.currentTime < loop.b) return false;
    if (v.currentTime > loop.b + 1.5) { stopLoop(); return true; } // jumped far away: not ours to loop
    selfPauseUntil = now() + 500;
    v.pause();
    loop.played++;
    if (loop.total === 0 || loop.played < loop.total) {
      loop.phase = 'gap';
      loop.timer = setTimeout(() => { if (loop && loop.phase === 'gap') startPass(); }, settings.gap * 1000);
    } else {
      loop.phase = 'done';
    }
    renderStatus();
    return true;
  }

  function stopLoop() {
    if (!loop) return;
    clearTimeout(loop.timer);
    loop = null;
    renderStatus();
  }

  function indexAt(t) {
    const ss = S.sentences;
    let lo = 0;
    let hi = ss.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (ss[m].start - 0.05 <= t) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  }

  /** While the video plays normally, follow along so Tab replays "this" sentence. */
  function syncToTime(t) {
    if (S.mode === 'review' || !el.input || el.input.value || S.result || S.hint || S.revealed) return;
    const i = indexAt(t);
    if (i === S.idx) return;
    const prev = S.idx;
    S.idx = i;
    updateListItem(prev);
    updateListItem(i);
    renderPractice();
    saveVideo();
  }

  // -------------------------------------------------------------- actions
  function goTo(i, autoplay) {
    if (S.phase !== 'ready' || !S.sentences.length) return;
    i = Math.max(0, Math.min(S.sentences.length - 1, i));
    const prev = S.idx;
    S.idx = i;
    S.hint = false;
    S.trans = false;
    S.revealed = false;
    S.result = null;
    S.checkedText = null;
    S.helped = false;
    S.rv = null;
    el.input.value = '';
    updateListItem(prev);
    updateListItem(i);
    scrollListTo(i);
    renderPractice();
    saveVideo();
    if (autoplay) {
      playSentence(i);
      el.input.focus({ preventScroll: true });
    }
  }

  function replay() {
    if (S.phase !== 'ready') return;
    const v = getVideo();
    // Just heard something while watching normally? If the current sentence only
    // started a moment ago, the learner almost certainly means the previous one.
    if (S.mode !== 'review' && !loop && v && !v.paused && S.idx > 0 && !el.input.value && !S.result) {
      const s = S.sentences[S.idx];
      if (v.currentTime - s.start < 0.8) { goTo(S.idx - 1, true); return; }
    }
    playSentence(S.idx);
    el.input.focus({ preventScroll: true });
  }

  function bumpRate(dir) {
    let k = RATES.indexOf(settings.rate);
    if (k < 0) k = RATES.indexOf(1);
    k = Math.max(0, Math.min(RATES.length - 1, k + dir));
    setRate(RATES[k]);
  }
  function setRate(r) {
    settings.rate = r;
    saveSettings();
    const v = getVideo();
    if (v && loop) v.playbackRate = r;
    if (el.rate) el.rate.value = String(r);
    toast(t('toastSpeed', { r }));
  }

  function toggleHint() {
    if (S.phase !== 'ready') return;
    S.hint = !S.hint;
    if (S.hint) S.helped = true;
    renderPractice();
  }

  // ------------------------------------------------------------ translation
  // A stronger hint than the first letters: the meaning, in Chinese, via Chrome's
  // built-in on-device translator (see page-hook.js). Fillers are dropped first.
  const FILLERS = new Set(['uh', 'um', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm']);
  function transTarget() {
    const zh = (navigator.languages || [navigator.language]).find((l) => /^zh/i.test(l || ''));
    return zh && /^zh[-_](tw|hk|mo|hant)/i.test(zh) ? 'zh-Hant' : 'zh';
  }
  function transSource(text) {
    const out = [];
    for (const w of text.split(/\s+/).filter(Boolean)) {
      if (FILLERS.has(w.toLowerCase().replace(/[^a-z]/g, ''))) {
        const end = (w.match(/[.?!]+$/) || [''])[0]; // keep a sentence end that sat on the filler
        if (end && out.length && !/[.?!,]$/.test(out[out.length - 1])) out[out.length - 1] += end;
        continue;
      }
      out.push(w);
    }
    return out.join(' ');
  }
  const transKey = (s) => `${transTarget()}|${transSource(s.text)}`;

  let transSaveTimer = 0;
  function saveTrans() {
    clearTimeout(transSaveTimer);
    const vid = S.videoId;
    const cache = S.transCache;
    transSaveTimer = setTimeout(() => { if (vid) sset('ll:trans:' + vid, cache); }, 400);
  }

  function toggleTrans() {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    const key = transKey(s);
    const failed = S.transJob && S.transJob.key === key && S.transJob.status === 'error';
    S.trans = failed ? true : !S.trans; // after a failure, pressing again retries
    if (S.trans) S.helped = true;
    renderTrans();
    if (S.trans && S.transCache[key] === undefined) translateSentence(key);
  }

  async function translateSentence(key) {
    if (S.transJob && S.transJob.key === key && S.transJob.status === 'loading') return;
    const job = { key, status: 'loading', progress: null, error: null };
    S.transJob = job;
    renderTrans();
    const [target, text] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
    const vid = S.videoId;
    const res = await askHook({ type: 'translate', text, target }, 300000, (loaded) => {
      job.progress = loaded;
      if (S.transJob === job) renderTrans();
    });
    if (vid !== S.videoId) return;
    if (res && typeof res.text === 'string' && res.text.trim()) {
      S.transCache[key] = res.text.trim();
      saveTrans();
      if (S.transJob === job) S.transJob = null;
    } else {
      job.status = 'error';
      job.error = (res && res.error) || 'failed';
    }
    renderTrans();
  }

  function renderTrans() {
    const s = S.sentences[S.idx];
    el.trans.hidden = !S.trans || !s;
    if (el.trans.hidden) return;
    const key = transKey(s);
    const job = S.transJob && S.transJob.key === key ? S.transJob : null;
    let body;
    let cls = '';
    if (S.transCache[key] !== undefined) body = esc(S.transCache[key]);
    else if (job && job.status === 'error') {
      body = esc(t(job.error === 'unsupported' ? 'transUnsupported' : 'transFailed'));
      cls = 'err';
    } else if (job && job.progress != null && job.progress < 1) {
      body = esc(t('transDownloading', { pct: Math.round(job.progress * 100) }));
      cls = 'pending';
    } else {
      body = esc(t('transLoading'));
      cls = 'pending';
    }
    el.trans.className = `trans ${cls}`.trim();
    el.trans.innerHTML = `<div class="lbl">${esc(t('transLabel'))}</div><div class="tx">${body}</div>`;
  }

  function reveal() {
    if (S.phase !== 'ready') return;
    S.revealed = !S.revealed;
    if (S.revealed && S.mode !== 'review') {
      const s = S.sentences[S.idx];
      const p = S.progress[s.key] || newProgress();
      p.revealed = true;
      S.progress[s.key] = p;
      saveVideo();
      updateListItem(S.idx);
    }
    renderPractice();
  }

  const newProgress = () => ({ attempts: 0, best: 0, correct: false, flagged: false, revealed: false });

  function doCheck() {
    if (S.phase !== 'ready') return;
    const text = el.input.value.trim();
    if (!text) { toast(t('typeFirst')); return; }
    const s = S.sentences[S.idx];
    const r = checkAnswer(s.text, text, { ignoreFillers: settings.ignoreFillers });
    S.result = r;
    S.checkedText = el.input.value;
    if (S.mode === 'review') {
      // The first check decides the grade; later checks are just for learning.
      if (!S.rv) commitGrade(NB.autoGrade({ perfect: r.perfect, score: r.score, helped: S.helped, revealed: S.revealed }));
      renderPractice();
      return;
    }
    const p = S.progress[s.key] || newProgress();
    if (p.attempts === 0 && !p.revealed) recordMissed(r.missed);
    p.attempts++;
    p.best = Math.max(p.best, r.score);
    if (r.perfect) p.correct = true;
    p.last = text;
    p.at = Date.now();
    S.progress[s.key] = p;
    saveVideo();
    updateListItem(S.idx);
    renderHeader();
    renderPractice();
  }

  function enterAction() {
    if (S.result && S.checkedText === el.input.value) {
      if (S.mode === 'review') nextReview();
      else goTo(S.idx + 1, true);
    } else doCheck();
  }

  function next() {
    if (S.mode === 'review') nextReview();
    else goTo(S.idx + 1, true);
  }

  // ------------------------------------------------------ mistake notebook
  // The learner adds sentences by hand (☆ / Alt+B). Each item keeps the video,
  // the played time range, the text and their answer, so it can be reviewed later
  // straight from the video without fetching captions again (see notebook.js).
  const videoTitle = () => document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
  const curItemId = () => {
    const s = S.sentences[S.idx];
    return s ? (S.mode === 'review' ? s.id : NB.itemId(S.videoId, s.key)) : null;
  };
  const inNotebook = () => !!nbItems[curItemId()];

  async function toggleNotebook() {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    const id = curItemId();
    if (nbItems[id]) {
      delete nbItems[id];
      await NB.store.update((items) => { delete items[id]; });
      toast(t('nbRemoved'));
    } else {
      let it;
      if (S.mode === 'review') it = (S.rv && S.rv.before) || s.item; // put back what was removed
      else {
        const b = playBounds(S.idx);
        it = NB.newItem({
          videoId: S.videoId, title: videoTitle(), key: s.key, start: s.start, end: s.end, a: b.a, b: b.b, text: s.text,
          answer: (S.checkedText != null ? S.checkedText : el.input.value).trim(), missed: S.result ? S.result.missed : [],
        }, Date.now());
      }
      nbItems[id] = it;
      await NB.store.update((items) => { items[id] = it; });
      toast(t('nbAdded'));
    }
    renderNb();
  }

  /** Keep saved items in step when the learner re-cuts sentences of this video. */
  function syncNotebook() {
    if (S.mode === 'review' || !S.videoId) return;
    const changed = [];
    S.sentences.forEach((s, i) => {
      const id = NB.itemId(S.videoId, s.key);
      const it = nbItems[id];
      if (!it) return;
      const b = playBounds(i);
      const f = { start: s.start, end: s.end, text: s.text, a: b.a, b: b.b };
      if (Object.keys(f).some((k) => it[k] !== f[k])) { Object.assign(it, f); changed.push([id, f]); }
    });
    if (changed.length) NB.store.update((items) => { for (const [id, f] of changed) if (items[id]) Object.assign(items[id], f); });
  }

  function openNotebook() {
    try { chrome.runtime.sendMessage({ type: 'open-notebook' }); } catch (_) { /* extension reloaded */ }
  }

  // ---------------------------------------------------------------- review
  const saveSession = () => NB.store.setSession(session);
  /** First still-existing item at or after session.pos. */
  function reviewHead() {
    if (!session) return null;
    let p = session.pos;
    while (p < session.queue.length && !nbItems[session.queue[p]]) p++;
    return p < session.queue.length ? { pos: p, item: nbItems[session.queue[p]] } : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** The video element once playable, 'error' if YouTube says it can't play, null on timeout. */
  async function waitForVideo(vid) {
    for (let k = 0; k < 75; k++) {
      if (currentVideoId() !== vid) return null;
      const err = document.querySelector('#movie_player .ytp-error');
      if (err && err.offsetParent !== null) return 'error';
      const v = getVideo();
      if (v && v.readyState >= 1) return v;
      await sleep(200);
    }
    return null;
  }

  async function enterReview(vid) {
    const head = reviewHead();
    if (!head || head.item.videoId !== vid) return;
    const ids = [];
    const qpos = [];
    for (let p = head.pos; p < session.queue.length; p++) {
      const it = nbItems[session.queue[p]];
      if (!it) continue;
      if (it.videoId !== vid) break;
      ids.push(it.id);
      qpos.push(p);
    }
    stopLoop();
    S = freshState(vid);
    S.mode = 'review';
    S.review = { ids, qpos };
    S.sentences = ids.map((id, i) => {
      const it = nbItems[id];
      return {
        id, item: it, i, key: it.key, start: it.start, end: it.end, start0: it.start, end0: it.end, text: it.text,
        title: it.title, words: it.text.split(/\s+/).filter(Boolean).map((w) => ({ w })), parts: [it.key],
        range: { a: it.a, b: it.b },
      };
    });
    S.phase = 'ready';
    if (el.input) el.input.value = '';
    renderAll();
    applyMask();
    const v = await waitForVideo(vid);
    if (S.mode !== 'review' || S.videoId !== vid) return;
    if (v === 'error') { // deleted / private video: mark its items and move on
      await NB.store.update((items) => { for (const id of ids) if (items[id]) items[id].gone = true; });
      toast(t('rvGone'));
      session.pos = qpos[qpos.length - 1] + 1;
      setTimeout(() => advanceSession(), 1500);
      return;
    }
    if (!v) { toast(t('rvLoadFail')); return; }
    attachVideo(v);
    hideYouTubeCC();
    session.pos = qpos[0];
    saveSession();
    goTo(0, true);
  }

  /** Record a grade for the current review item; later calls override it. */
  function commitGrade(g) {
    const s = S.sentences[S.idx];
    if (!s || !session) return;
    if (!S.rv) {
      const before = nbItems[s.id];
      if (!before) return; // removed meanwhile
      S.rv = { before, auto: g, grade: g };
    } else S.rv.grade = g;
    const updated = NB.applyGrade(S.rv.before, g, Date.now());
    nbItems[s.id] = updated;
    NB.store.update((items) => { if (items[s.id]) items[s.id] = updated; });
    session.results[s.id] = g;
    saveSession();
    renderResult();
  }

  function nextReview() {
    if (S.mode !== 'review' || !session) return;
    if (!S.rv && S.revealed && nbItems[curItemId()]) commitGrade('again'); // looked at the answer, never checked
    if (S.idx + 1 < S.sentences.length) {
      session.pos = S.review.qpos[S.idx + 1];
      saveSession();
      goTo(S.idx + 1, true);
      return;
    }
    session.pos = S.review.qpos[S.idx] + 1;
    advanceSession();
  }

  /** Go to the video of the next item, or finish. */
  async function advanceSession() {
    const head = reviewHead();
    if (!head) { finishReview(); return; }
    session.pos = head.pos;
    await saveSession();
    if (head.item.videoId === S.videoId) enterReview(S.videoId);
    else location.href = NB.watchUrl(head.item);
  }

  function finishReview() {
    const counts = { good: 0, fuzzy: 0, again: 0 };
    for (const g of Object.values((session && session.results) || {})) if (counts[g] != null) counts[g]++;
    session = null;
    NB.store.setSession(null);
    stopLoop();
    const vid = S.videoId;
    S = freshState(vid);
    S.phase = 'review-done';
    S.summary = counts;
    renderAll();
  }

  function exitReview() {
    session = null;
    NB.store.setSession(null);
    stopLoop();
    S = freshState(S.videoId);
    if (el.input) el.input.value = '';
    renderAll();
    applyMask();
  }

  function resumeReview() {
    const head = reviewHead();
    if (!head) { exitReview(); return; }
    if (head.item.videoId === S.videoId) enterReview(S.videoId);
    else location.href = NB.watchUrl(head.item);
  }

  function toggleFlag() {
    const s = S.sentences[S.idx];
    const p = S.progress[s.key] || newProgress();
    p.flagged = !p.flagged;
    S.progress[s.key] = p;
    saveVideo();
    updateListItem(S.idx);
    renderHeader();
    renderResult();
  }

  let resetArmed = 0;
  function resetVideo(btn) {
    if (S.phase !== 'ready') return;
    if (now() > resetArmed) {
      resetArmed = now() + 3000;
      btn.textContent = t('resetConfirm');
      setTimeout(() => { btn.textContent = t('resetVideo'); }, 3000);
      return;
    }
    resetArmed = 0;
    btn.textContent = t('resetVideo');
    S.progress = {};
    saveVideo();
    S.sentences.forEach((_, i) => updateListItem(i));
    renderHeader();
    renderResult();
    toast(t('cleared'));
  }

  // ------------------------------------------------- segmentation fixes
  // Caption timings can't always be trusted (see segment.js), so the learner can
  // nudge a sentence's start/end, merge it with the next one, or split a merged
  // one back. Fixes are stored per video and re-applied on every load.

  /** Re-derive sentences from pieces + edits, staying on sentence `key`. */
  function rebuild(key) {
    stopLoop();
    S.sentences = assemble(S.pieces, S.edits);
    let i = S.sentences.findIndex((s) => s.key === key);
    if (i < 0) i = Math.min(S.idx, S.sentences.length - 1);
    S.idx = i;
    syncNotebook();
    buildList();
    scrollListTo(i);
    renderHeader();
    renderPractice();
    saveVideo();
  }

  /** Text changed under the learner's answer: drop the stale check result. */
  function forgetSentence(...keys) {
    for (const k of keys) delete S.progress[k];
    S.result = null;
    S.checkedText = null;
    S.revealed = false;
  }

  /** which: 0 = start, 1 = end; dir: -1 earlier, +1 later. Then preview that edge. */
  function nudge(which, dir) {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    if (which === 0 && dir < 0 && s.start <= 0) { toast(t('atVideoStart')); return; }
    const a = (S.edits.adj[s.key] || [0, 0]).slice();
    a[which] = Math.max(-3000, Math.min(3000, a[which] + dir * ADJ_STEP));
    const start = Math.max(0, s.start0 + a[0] / 1000);
    const end = s.end0 + a[1] / 1000;
    if (end - start < 0.3) { toast(t('tooShort')); return; }
    if (a[0] || a[1]) S.edits.adj[s.key] = a;
    else delete S.edits.adj[s.key];
    rebuild(s.key);
    const cur = S.sentences[S.idx];
    const b = playBounds(S.idx);
    playSentence(S.idx, which === 0
      ? { a: b.a, b: Math.min(b.b, cur.start + PREVIEW) }
      : { a: Math.max(b.a, cur.end - PREVIEW), b: b.b });
  }

  function joinNext() {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    const n = S.sentences[S.idx + 1];
    if (!n) return;
    const E = S.edits;
    const ds = (E.adj[s.key] || [0, 0])[0];
    const de = (E.adj[n.key] || [0, 0])[1]; // the merged sentence ends where the next one did
    delete E.adj[n.key];
    if (ds || de) E.adj[s.key] = [ds, de];
    else delete E.adj[s.key];
    E.split = E.split.filter((k) => k !== n.key);
    if (!E.join.includes(n.key)) E.join.push(n.key);
    forgetSentence(s.key, n.key);
    rebuild(s.key);
    toast(t('joined'));
    playSentence(S.idx);
  }

  function splitCurrent() {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    if (s.parts.length < 2) return;
    const E = S.edits;
    const rest = s.parts.slice(1);
    E.join = E.join.filter((k) => !rest.includes(k));
    for (const k of rest) if (!E.split.includes(k)) E.split.push(k);
    const a = E.adj[s.key];
    if (a) { // start shift stays with the first part, end shift goes to the last
      if (a[0]) E.adj[s.key] = [a[0], 0];
      else delete E.adj[s.key];
      if (a[1]) E.adj[rest[rest.length - 1]] = [0, a[1]];
    }
    forgetSentence(s.key);
    rebuild(s.key);
    toast(t('splitInto', { n: s.parts.length }));
    playSentence(S.idx);
  }

  function resetBounds() {
    if (S.phase !== 'ready') return;
    const s = S.sentences[S.idx];
    if (!S.edits.adj[s.key]) return;
    delete S.edits.adj[s.key];
    rebuild(s.key);
    playSentence(S.idx);
  }

  // --------------------------------------------------------------- loading
  const ERROR_CODES = ['no-captions', 'no-english', 'player-not-ready', 'fetch-failed', 'timeout', 'empty'];
  function errorText() {
    const e = S.error;
    if (!e) return '';
    let msg = ERROR_CODES.includes(e.code) ? t('err:' + e.code) : t('err:other', { code: e.code });
    if (e.code === 'no-english' && e.languages) msg += t('available', { list: e.languages.join(t('listSep')) });
    return msg;
  }

  async function start(userInitiated) {
    const vid = S.videoId;
    if (!vid || S.phase === 'loading') return;
    const seq = ++S.loadSeq;
    const vAtClick = getVideo();
    const tAtClick = vAtClick ? vAtClick.currentTime : 0; // the moment the learner asked
    S.phase = 'loading';
    renderAll();
    const res = await requestCaptions(vid);
    if (vid !== S.videoId || seq !== S.loadSeq) return; // navigated away meanwhile
    let pieces = [];
    if (!res.error) {
      try { pieces = buildPieces(res.body); } catch (_) { res.error = 'empty'; }
      if (!res.error && !pieces.length) res.error = 'empty';
    }
    if (res.error) {
      S.phase = 'error';
      S.error = { code: res.error, languages: res.languages || null };
      renderAll();
      return;
    }
    const saved = await sget('ll:video:' + vid, null);
    if (vid !== S.videoId) return;
    S.pieces = pieces;
    S.edits = normEdits(saved && saved.edits);
    S.sentences = assemble(pieces, S.edits);
    S.info = res.info;
    S.progress = (saved && saved.progress) || {};
    S.transCache = await sget('ll:trans:' + vid, {});
    if (vid !== S.videoId) return;
    const v = getVideo();
    if (userInitiated && tAtClick > 1) S.idx = indexAt(tAtClick);
    else if (saved && Number.isInteger(saved.idx) && saved.idx < S.sentences.length) S.idx = saved.idx;
    else S.idx = indexAt(v ? v.currentTime : 0);
    S.phase = 'ready';
    syncNotebook();
    el.panel.dataset.via = res.via || ''; // which caption path worked (debug aid)
    hideYouTubeCC();
    attachVideo(v);
    buildList();
    renderAll();
    applyMask();
    if (userInitiated) goTo(S.idx, true);
  }

  // --------------------------------------------------------------------- UI
  const markup = () => `
  <div class="panel" data-phase="idle" lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
    <div class="hdr">
      <div class="brand"><span class="dot"></span>Listen Loop</div>
      <div class="hdr-info"></div>
      <button class="nb-open" data-act="open-nb" title="${t('nbOpenTitle')}">${t('nbName')}<b class="badge" hidden></b></button>
      <button class="ib" data-act="toggle-settings" title="${t('settings')}">⚙︎</button>
      <button class="ib" data-act="collapse" title="${t('collapse')}">▾</button>
    </div>
    <div class="body">
      <div class="view view-idle">
        <div class="resume" hidden><span class="resume-tx"></span><span class="grow"></span>
          <button class="btn sm primary" data-act="review-resume">${t('rvContinue')}</button>
          <button class="link" data-act="review-exit">${t('rvExit')}</button></div>
        <p class="lead">${t('lead')}</p>
        <button class="btn primary wide" data-act="start">${t('start')}</button>
      </div>
      <div class="view view-review-done">
        <p class="done-title">${t('rvDoneTitle')}</p>
        <p class="done-sum"></p>
        <div class="done-actions">
          <button class="btn primary" data-act="open-nb">${t('rvBackToNb')}</button>
          <button class="btn" data-act="review-stay">${t('rvStay')}</button>
        </div>
      </div>
      <div class="view view-loading"><span class="spinner"></span>${t('loading')}</div>
      <div class="view view-error">
        <p class="err"></p>
        <button class="btn sm" data-act="start">${t('retry')}</button>
      </div>
      <div class="view view-ready">
        <div class="rv-bar"><span class="rv-src"></span><span class="grow"></span>
          <button class="link" data-act="review-exit">${t('rvExit')}</button></div>
        <div class="meta"><span class="sent-no"></span><span class="sent-time"></span>
          <button class="link adj-toggle" data-act="toggle-adjust" title="${t('adjToggleTitle')}">${t('adjToggle')}</button>
          <span class="loop-status"></span></div>
        <div class="adjust" hidden>
          <div class="adj-edges">
            <span class="adj-edge"><span class="adj-lbl">${t('adjStart')}</span>
              <button class="btn sm" data-act="adj" data-w="0" data-d="-1" title="${t('startEarlier')}">◂</button>
              <span class="adj-val adj-start"></span>
              <button class="btn sm" data-act="adj" data-w="0" data-d="1" title="${t('startLater')}">▸</button></span>
            <span class="adj-edge"><span class="adj-lbl">${t('adjEnd')}</span>
              <button class="btn sm" data-act="adj" data-w="1" data-d="-1" title="${t('endEarlier')}">◂</button>
              <span class="adj-val adj-end"></span>
              <button class="btn sm" data-act="adj" data-w="1" data-d="1" title="${t('endLater')}">▸</button></span>
          </div>
          <div class="adj-row">
            <button class="btn sm" data-act="join-next" title="${t('joinNextTitle')}">${t('joinNext')}</button>
            <button class="btn sm" data-act="split" title="${t('splitTitle')}">${t('split')}</button>
            <span class="grow"></span>
            <button class="link" data-act="adj-reset">${t('adjReset')}</button>
          </div>
          <div class="adj-tip">${t('adjTip')}</div>
        </div>
        <div class="controls">
          <button class="btn" data-act="prev" title="${t('prevTitle')}">◀</button>
          <button class="btn primary" data-act="replay" title="${t('replayTitle')}">${t('replay')}</button>
          <button class="btn" data-act="next" title="${t('nextTitle')}">▶</button>
          <span class="sels">
            <label class="sel" title="Alt+↑ / Alt+↓">${t('speed')} <select data-set="rate"></select></label>
            <label class="sel">${t('loops')} <select data-set="loops"></select></label>
          </span>
        </div>
        <textarea class="input" rows="3" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"
          placeholder="${t('placeholder')}"></textarea>
        <div class="actions">
          <button class="btn sm" data-act="hint" title="Alt+H">${t('hint')}</button>
          <button class="btn sm" data-act="trans" title="Alt+T">${t('trans')}</button>
          <button class="btn sm" data-act="reveal" title="Alt+A">${t('reveal')}</button>
          <span class="grow"></span>
          <button class="ib nb-star" data-act="nb" title="${t('nbAddTitle')}">☆</button>
          <button class="btn primary sm" data-act="check">${t('check')}</button>
        </div>
        <div class="toast"></div>
        <div class="hint" hidden></div>
        <div class="trans" hidden></div>
        <div class="result" hidden></div>
        <details class="list"><summary></summary><ol class="items"></ol></details>
      </div>
    </div>
    <div class="settings" hidden>
      <h4>${t('settings')}</h4>
      <div class="row"><span>Language / 语言</span><select data-set="lang">
        <option value="auto">${t('langAuto')}</option><option value="zh">中文</option><option value="en">English</option></select></div>
      <div class="row"><span>${t('gap')}</span><select data-set="gap"></select></div>
      <div class="row"><label><input type="checkbox" data-set="ignoreFillers"> ${t('ignoreFillers')}</label></div>
      <div class="row"><label><input type="checkbox" data-set="listText"> ${t('listText')}</label></div>
      <div class="row"><label><input type="checkbox" data-set="autoStart"> ${t('autoStart')}</label></div>
      <div class="row"><label><input type="checkbox" data-set="mask"> ${t('mask')}</label></div>
      <div class="row sub"><span>${t('maskHeight')}</span><input type="range" min="6" max="40" step="1" data-set="maskHeight"></div>
      <div class="row sub"><span>${t('maskBottom')}</span><input type="range" min="0" max="60" step="1" data-set="maskBottom"></div>
      <div class="row"><button class="btn sm" data-act="yt-cc">${t('ytcc')}</button>
        <button class="btn sm danger" data-act="reset-video">${t('resetVideo')}</button></div>
      <div class="missed"><div class="cap">${t('missedCap')}</div><div class="missed-list"></div></div>
      <div class="keys">${t('keys')}</div>
    </div>
  </div>`;

  /** Follow YouTube's light/dark theme (<html dark> on youtube.com). */
  const syncTheme = () => { if (host) host.classList.toggle('dark', document.documentElement.hasAttribute('dark')); };

  function createHost() {
    host = document.createElement('div');
    host.id = 'listen-loop-host';
    syncTheme();
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = window.LLPanelCSS || '';
    root.appendChild(style);
    const wrap = document.createElement('div');
    wrap.innerHTML = markup();
    root.appendChild(wrap.firstElementChild);

    const q = (sel) => root.querySelector(sel);
    Object.assign(el, {
      panel: q('.panel'), hdrInfo: q('.hdr-info'), err: q('.err'), sentNo: q('.sent-no'),
      sentTime: q('.sent-time'), loopStatus: q('.loop-status'), input: q('.input'), hint: q('.hint'), trans: q('.trans'),
      result: q('.result'), summary: q('.list summary'), items: q('.items'), list: q('.list'),
      settings: q('.settings'), missedList: q('.missed-list'), toast: q('.toast'),
      rate: q('select[data-set="rate"]'), loops: q('select[data-set="loops"]'), gap: q('select[data-set="gap"]'),
      adjust: q('.adjust'), adjToggle: q('.adj-toggle'), adjStart: q('.adj-start'), adjEnd: q('.adj-end'),
      joinBtn: q('[data-act="join-next"]'), splitBtn: q('[data-act="split"]'), adjReset: q('[data-act="adj-reset"]'),
      nbBadge: q('.nb-open .badge'), nbStar: q('.nb-star'), resume: q('.resume'), resumeTx: q('.resume-tx'),
      rvSrc: q('.rv-src'), doneSum: q('.done-sum'),
    });
    el.rate.innerHTML = RATES.map((r) => `<option value="${r}">${r}x</option>`).join('');
    el.loops.innerHTML = LOOPS.map((n) => `<option value="${n}">${n === 0 ? '∞' : n}</option>`).join('');
    el.gap.innerHTML = GAPS.map((g) => `<option value="${g}">${t('seconds', { n: g })}</option>`).join('');

    root.addEventListener('click', onClick);
    root.addEventListener('change', onSettingInput);
    root.addEventListener('input', (e) => { if (e.target.type === 'range') onSettingInput(e); });
    el.list.addEventListener('toggle', () => { if (el.list.open) scrollListTo(S.idx); });
  }

  /** Switch UI language: rebuild the panel, keeping typed text and open sections. */
  function relocalize() {
    const next = resolveLang();
    if (next === lang) return;
    lang = next;
    if (!host) return;
    const keep = {
      input: el.input.value, settingsOpen: !el.settings.hidden, listOpen: el.list.open,
      display: host.style.display, via: el.panel.dataset.via || '',
    };
    host.remove();
    host = null;
    ensureMounted();
    host.style.display = keep.display;
    el.input.value = keep.input;
    el.settings.hidden = !keep.settingsOpen;
    el.list.open = keep.listOpen;
    el.panel.dataset.via = keep.via;
    renderAll();
    if (S.phase === 'ready') { buildList(); scrollListTo(S.idx); }
    if (keep.settingsOpen) renderMissed();
  }

  function ensureMounted() {
    if (!host) createHost();
    const target = document.querySelector('ytd-watch-flexy #secondary-inner') || document.querySelector('ytd-watch-flexy #secondary');
    if (target) {
      if (host.parentNode !== target) target.prepend(host);
      host.classList.remove('floating');
      // YouTube's own CSS zeroes margins in this column (it beats :host rules), so the
      // gap to the chips / recommendations below is set inline and marked important.
      host.style.setProperty('margin', `0 0 ${DOCK_GAP}px`, 'important');
    } else if (!host.isConnected) {
      document.body.appendChild(host);
      host.classList.add('floating');
      host.style.removeProperty('margin');
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 1800);
  }

  function renderAll() {
    if (!root) return;
    el.panel.dataset.phase = S.phase;
    el.panel.classList.toggle('collapsed', !!settings.collapsed);
    el.panel.classList.toggle('review', S.mode === 'review');
    el.err.textContent = errorText();
    renderResume();
    if (S.summary) el.doneSum.textContent = t('rvDoneSum', S.summary);
    renderNbBadge();
    renderHeader();
    renderSettings();
    if (S.phase === 'ready') renderPractice();
  }

  function renderHeader() {
    if (!el.hdrInfo) return;
    let txt = '';
    if (S.phase === 'ready' && S.mode === 'review') txt = t('rvHdr');
    else if (S.phase === 'ready') {
      const done = S.sentences.reduce((n, s) => {
        const p = S.progress[s.key];
        return n + (p && (p.correct || p.flagged) ? 1 : 0);
      }, 0);
      txt = t('done', { d: done, n: S.sentences.length });
    }
    el.hdrInfo.textContent = txt;
  }

  function renderPractice() {
    const s = S.sentences[S.idx];
    if (!s || !el.sentNo) return;
    if (S.mode === 'review') {
      const n = session ? session.queue.length : S.sentences.length;
      el.sentNo.textContent = t('rvItem', { k: (S.review.qpos[S.idx] || 0) + 1, n });
      el.rvSrc.textContent = t('rvFrom', { title: s.title || S.videoId });
      el.rvSrc.title = s.title || '';
    } else el.sentNo.textContent = t('sentNo', { i: S.idx + 1, n: S.sentences.length });
    el.sentTime.textContent = `${fmt(s.start, true)} – ${fmt(s.end, true)}`;
    el.rate.value = String(settings.rate);
    el.loops.value = String(settings.loops);
    el.hint.hidden = !S.hint;
    el.hint.textContent = S.hint ? hintText(s.text) : '';
    renderTrans();
    el.summary.textContent = t('summary', { n: S.sentences.length, kind: t(S.info && S.info.isAuto ? 'autoCaps' : 'manualCaps') });
    renderAdjust();
    renderNbState();
    renderResult();
    renderStatus();
  }

  function renderNbBadge() {
    if (!el.nbBadge) return;
    const due = NB.stats(nbItems, Date.now()).due;
    el.nbBadge.textContent = due ? String(due) : '';
    el.nbBadge.hidden = !due;
  }
  function renderNbState() {
    if (!el.nbStar) return;
    const on = inNotebook();
    el.nbStar.textContent = on ? '★' : '☆';
    el.nbStar.classList.toggle('on', on);
    el.nbStar.title = t(on ? 'nbRemoveTitle' : 'nbAddTitle');
  }
  /** Notebook changed (here or in another tab). */
  function renderNb() {
    renderNbBadge();
    if (S.phase !== 'ready') return;
    renderNbState();
    renderResult();
    if (S.mode !== 'review') S.sentences.forEach((_, i) => updateListItem(i));
  }
  function renderResume() {
    if (!el.resume) return;
    const head = S.phase === 'idle' ? reviewHead() : null;
    el.resume.hidden = !head;
    if (head) el.resumeTx.textContent = t('rvResume', { k: head.pos + 1, n: session.queue.length });
  }

  function renderAdjust() {
    const s = S.sentences[S.idx];
    el.adjToggle.classList.toggle('on', S.adjOpen);
    el.adjust.hidden = !S.adjOpen;
    if (!S.adjOpen || !s) return;
    const delta = (d) => (Math.abs(d) < 0.001 ? '' : ` <i>${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}</i>`);
    el.adjStart.innerHTML = fmt(s.start, true) + delta(s.start - s.start0);
    el.adjEnd.innerHTML = fmt(s.end, true) + delta(s.end - s.end0);
    el.joinBtn.disabled = S.idx >= S.sentences.length - 1;
    el.splitBtn.disabled = s.parts.length < 2;
    el.adjReset.hidden = !S.edits.adj[s.key];
  }

  function renderStatus() {
    if (!el.loopStatus) return;
    let st = '';
    if (loop && loop.i === S.idx && loop.range) {
      if (loop.phase === 'playing') st = t('stPreview');
      else if (loop.phase === 'done') st = t('stPreviewDone');
      else if (loop.phase === 'paused') st = t('stPaused');
    } else if (loop && loop.i === S.idx) {
      const v = { k: loop.phase === 'playing' ? loop.played + 1 : loop.played, tot: loop.total === 0 ? '∞' : loop.total };
      if (loop.phase === 'playing') st = t('stPlaying', v);
      else if (loop.phase === 'gap') st = t('stGap', v);
      else if (loop.phase === 'done') st = t('stDone', v);
      else if (loop.phase === 'paused') st = t('stPaused');
      else if (loop.phase === 'ad') st = t('stAd');
    }
    el.loopStatus.textContent = st;
  }

  function renderResult() {
    const s = S.sentences[S.idx];
    const r = S.result;
    if (!s || (!r && !S.revealed)) {
      el.result.hidden = true;
      el.result.innerHTML = '';
      return;
    }
    el.result.hidden = false;
    const p = S.progress[s.key] || newProgress();
    let head;
    let body;
    if (r) {
      head = r.perfect
        ? `<div class="score perfect">${t('perfect')}</div>`
        : `<div class="score">${t('scoreLine', { pct: Math.round(r.score * 100), n: p.attempts })}</div>`;
      body = renderDiff(r) + (r.perfect ? '' : `<div class="legend"><i class="w ok">${t('lgOk')}</i><i class="w near">${t('lgNear')}</i>` +
        `<i class="w wrong">${t('lgWrong')}</i><i class="w missing">${t('lgMissing')}</i><i class="extra">${t('lgExtra')}</i></div>`);
    } else {
      head = `<div class="score"><b>${t('answer')}</b></div>`;
      body = `<div class="words">${esc(s.text)}</div>`;
    }
    const nbLink = `<button class="link nb-link${inNotebook() ? ' on' : ''}" data-act="nb">${t(inNotebook() ? 'nbInLink' : 'nbAddLink')}</button>`;
    if (S.mode === 'review') {
      el.result.innerHTML = head + body + renderGrade() + `<div class="res-foot">${nbLink}</div>`;
      return;
    }
    const flag = `<button class="link" data-act="flag">${t(p.flagged ? 'flagOn' : 'flagOff')}</button>`;
    el.result.innerHTML = head + body + `<div class="res-foot">${nbLink}<span class="grow"></span>${flag}</div>`;
  }

  /** Review: the grade buttons (auto-picked, changeable) and when the item comes back. */
  function renderGrade() {
    if (!S.rv) return '';
    const it = nbItems[S.sentences[S.idx].id];
    let when = '';
    if (it) {
      const d = NB.daysUntil(it, Date.now());
      when = it.mastered ? t('nbMastered') : d <= 0 ? t('nbToday') : d === 1 ? t('nbTomorrow') : t('nbInDays', { n: d });
    }
    const btn = (g, k) => `<button class="gbtn ${g}${S.rv.grade === g ? ' on' : ''}" data-act="grade" data-g="${g}">${t(k)}</button>`;
    return `<div class="grade"><span class="glbl">${t('gradeLbl')}</span>${btn('again', 'gAgain')}${btn('fuzzy', 'gFuzzy')}${btn('good', 'gGood')}</div>` +
      `<div class="gnext">${esc(t('rvNext', { when }))}</div>`;
  }

  function renderDiff(r) {
    const extrasAt = new Map();
    for (const x of r.extras) {
      if (!extrasAt.has(x.after)) extrasAt.set(x.after, []);
      extrasAt.get(x.after).push(x.text);
    }
    const out = [];
    const pushExtras = (k) => (extrasAt.get(k) || []).forEach((x) => out.push(`<s class="extra" title="${t('extraTitle')}">${esc(x)}</s>`));
    pushExtras(-1);
    r.words.forEach((w, i) => {
      if ((w.status === 'near' || w.status === 'wrong') && w.typed.length) {
        out.push(`<span><s class="typed" title="${t('typedTitle')}">${esc(w.typed.join(' '))}</s><span class="w ${w.status}">${esc(w.text)}</span></span>`);
      } else {
        const title = w.status === 'missing' ? ` title="${t('missingTitle')}"` : '';
        out.push(`<span class="w ${w.status}"${title}>${esc(w.text)}</span>`);
      }
      pushExtras(i);
    });
    return `<div class="words">${out.join(' ')}</div>`;
  }

  function buildList() {
    el.items.innerHTML = S.sentences.map((s, i) =>
      `<li data-i="${i}"><span class="n">${i + 1}</span><span class="t">${fmt(s.start)}</span><span class="tx"></span><span class="st"></span></li>`).join('');
    S.sentences.forEach((_, i) => updateListItem(i));
  }

  function updateListItem(i) {
    const li = el.items && el.items.children[i];
    const s = S.sentences[i];
    if (!li || !s) return;
    const p = S.progress[s.key];
    li.className = [i === S.idx ? 'cur' : '', p && p.correct ? 'correct' : '', p && p.flagged ? 'flagged' : ''].join(' ').trim();
    const show = settings.listText || (p && (p.correct || p.revealed || p.flagged));
    const tx = li.querySelector('.tx');
    if (show) { tx.textContent = s.text; tx.classList.remove('masked'); } else {
      tx.textContent = `${'•'.repeat(Math.min(22, Math.max(3, Math.round(s.text.length / 5))))}  ${t('nWords', { n: s.words.length })}`;
      tx.classList.add('masked');
    }
    const star = nbItems[NB.itemId(S.videoId, s.key)] ? '★ ' : '';
    li.querySelector('.st').textContent = star + (p && p.flagged ? '⚑' : p && p.correct ? '✓' : p && p.attempts ? `${Math.round(p.best * 100)}%` : '');
  }

  function scrollListTo(i) {
    const li = el.items && el.items.children[i];
    if (!li || !el.list.open) return;
    const box = el.items;
    if (li.offsetTop < box.scrollTop || li.offsetTop + li.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = li.offsetTop - box.clientHeight / 2;
    }
  }

  function renderSettings() {
    if (!el.settings) return;
    root.querySelectorAll('[data-set]').forEach((inp) => {
      const v = settings[inp.dataset.set];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else inp.value = String(v);
    });
  }

  async function renderMissed() {
    const m = await sget('ll:missed', {});
    const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 24);
    el.missedList.innerHTML = top.length
      ? top.map(([w, n]) => `<span>${esc(w)}<b>${n}</b></span>`).join('')
      : `<span style="background:none;padding:0;color:var(--ll-muted)">${t('missedNone')}</span>`;
  }

  function applyMask() {
    const pl = $player();
    let m = document.getElementById('listen-loop-mask');
    const on = settings.mask && S.phase === 'ready' && !!currentVideoId();
    if (!on || !pl) { if (m) m.remove(); return; }
    if (!m) { m = document.createElement('div'); m.id = 'listen-loop-mask'; }
    if (m.parentNode !== pl) pl.appendChild(m);
    Object.assign(m.style, {
      position: 'absolute', left: '0', right: '0', bottom: `${settings.maskBottom}%`, height: `${settings.maskHeight}%`,
      background: 'rgba(15,15,15,.55)', backdropFilter: 'blur(18px)', webkitBackdropFilter: 'blur(18px)',
      zIndex: '30', pointerEvents: 'none',
    });
  }

  // ---------------------------------------------------------------- events
  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      e.preventDefault();
      act(a.dataset.act, a);
      return;
    }
    const li = e.target.closest('li[data-i]');
    if (li) goTo(+li.dataset.i, true);
  }

  function act(name, btn) {
    switch (name) {
      case 'start': start(true); break;
      case 'collapse':
        settings.collapsed = !settings.collapsed;
        saveSettings();
        renderAll();
        break;
      case 'toggle-settings':
        el.settings.hidden = !el.settings.hidden;
        if (!el.settings.hidden) { renderSettings(); renderMissed(); }
        break;
      case 'replay': replay(); break;
      case 'prev': goTo(S.idx - 1, true); break;
      case 'next': next(); break;
      case 'hint': toggleHint(); break;
      case 'trans': toggleTrans(); el.input.focus({ preventScroll: true }); break;
      case 'reveal': reveal(); break;
      case 'check': doCheck(); el.input.focus({ preventScroll: true }); break;
      case 'flag': toggleFlag(); break;
      case 'nb': toggleNotebook(); break;
      case 'open-nb': openNotebook(); break;
      case 'grade': commitGrade(btn.dataset.g); el.input.focus({ preventScroll: true }); break;
      case 'review-exit': exitReview(); break;
      case 'review-resume': resumeReview(); break;
      case 'review-stay': S = freshState(S.videoId); renderAll(); break;
      case 'toggle-adjust': S.adjOpen = !S.adjOpen; renderAdjust(); break;
      case 'adj': nudge(+btn.dataset.w, +btn.dataset.d); break;
      case 'join-next': joinNext(); break;
      case 'split': splitCurrent(); break;
      case 'adj-reset': resetBounds(); break;
      case 'yt-cc': { const b = ccButton(); if (b) b.click(); break; }
      case 'reset-video': resetVideo(btn); break;
      default: break;
    }
  }

  function onSettingInput(e) {
    const inp = e.target;
    const k = inp.dataset && inp.dataset.set;
    if (!k) return;
    if (k === 'lang') {
      settings.lang = inp.value;
      saveSettings();
      relocalize();
      return;
    }
    const v = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
    if (k === 'rate') { setRate(v); return; }
    settings[k] = v;
    saveSettings();
    if (k === 'loops' && loop && !loop.range) { loop.total = v; renderStatus(); }
    if (k === 'listText') S.sentences.forEach((_, i) => updateListItem(i));
    if (k.startsWith('mask')) applyMask();
    if (k === 'ignoreFillers' && S.result && S.checkedText !== null) {
      S.result = checkAnswer(S.sentences[S.idx].text, S.checkedText, { ignoreFillers: v });
      renderResult();
    }
  }

  const isEditable = (n) => !!n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName || ''));

  function onKeyDown(e) {
    if (!host || !host.isConnected) return;
    const path = e.composedPath();
    const inPanel = path.includes(host);
    // Keys typed inside the panel must never reach YouTube's hotkeys (space, k, f, j, l, 0-9 …).
    if (inPanel) e.stopImmediatePropagation();
    if (S.phase !== 'ready') return;

    const plain = !e.altKey && !e.metaKey && !e.ctrlKey;
    if (inPanel && path[0] === el.input && plain && !e.isComposing && e.keyCode !== 229) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enterAction(); return; }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); replay(); return; }
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey) {
      if (!inPanel && isEditable(path[0])) return; // YouTube search box, comments…
      let handled = true;
      switch (e.code) {
        case 'ArrowLeft': if (S.mode !== 'review') goTo(S.idx - 1, true); break;
        case 'ArrowRight': next(); break;
        case 'ArrowUp': bumpRate(+1); break;
        case 'ArrowDown': bumpRate(-1); break;
        case 'KeyR': replay(); break;
        case 'KeyH': toggleHint(); break;
        case 'KeyT': toggleTrans(); break;
        case 'KeyA': reveal(); break;
        case 'KeyB': toggleNotebook(); break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }

  function swallowInPanel(e) {
    if (host && e.composedPath().includes(host)) e.stopImmediatePropagation();
  }

  // ------------------------------------------------------------ navigation
  function onNavigate() {
    const vid = currentVideoId();
    if (!vid) {
      stopLoop();
      if (host) host.style.display = 'none';
      applyMask();
      return;
    }
    ensureMounted();
    host.style.display = '';
    if (vid !== S.videoId) {
      stopLoop();
      S = freshState(vid);
      if (el.input) el.input.value = '';
      if (el.items) el.items.innerHTML = '';
      renderAll();
      applyMask();
      const head = reviewHead();
      if (head && head.item.videoId === vid) { enterReview(vid); return; } // continuing a notebook review
      if (settings.autoStart) start(false);
    }
  }

  async function init() {
    settings = { ...DEFAULTS, ...(await sget('ll:settings', {})) };
    lang = resolveLang();
    nbItems = await NB.store.load();
    session = await NB.store.session();
    try {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local') return;
        if (ch[NB.KEY]) { nbItems = (ch[NB.KEY].newValue && ch[NB.KEY].newValue.items) || {}; renderNb(); }
        // A review running in this tab owns the session; take other tabs' changes otherwise.
        if (ch[NB.REVIEW_KEY] && S.mode !== 'review') { session = ch[NB.REVIEW_KEY].newValue || null; renderResume(); }
      });
    } catch (_) { /* extension reloaded */ }
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', swallowInPanel, true);
    window.addEventListener('keypress', swallowInPanel, true);
    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', () => setTimeout(onNavigate, 300));
    setInterval(onNavigate, 1000);
    onNavigate();
  }

  init();
})();
