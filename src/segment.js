/*
 * Listen Loop — caption parsing & sentence segmentation.
 * Pure functions, no dependencies. Loaded as a content script (attaches
 * window.LLSegment) and also require()-able from Node for tests.
 */
(function (root) {
  'use strict';

  const ABBREV = new Set([
    'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'jr.', 'sr.', 'vs.', 'etc.', 'e.g.', 'i.e.',
    'u.s.', 'u.k.', 'a.m.', 'p.m.', 'no.', 'prof.', 'gen.', 'gov.', 'sen.', 'rep.',
    'inc.', 'co.', 'ltd.', 'mt.', 'ft.',
  ]);
  // Words that often start a new clause: a split right before them reads naturally.
  const CLAUSE_START = new Set([
    'and', 'but', 'so', 'because', 'or', 'then', 'which', 'when', 'while', 'if',
    'where', 'who', 'that', 'um', 'uh', 'like', 'although', 'though', 'until',
  ]);
  const DEFAULT_LIMITS = {
    maxWords: 18, maxMs: 7000, minPart: 3, // split sentences longer than this
    minWords: 4, minMs: 1000, joinPause: 350, // glue shorter ones to a neighbour they run into
  };
  const FILLER = new Set(['uh', 'um', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm', 'oh']);

  const BREAK = '\u0000'; // sound tag / speaker change marker

  function endsSentence(w) {
    if (ABBREV.has(w.toLowerCase())) return false;
    return /[.?!…]["'”’)\]]*$/.test(w);
  }

  /**
   * Parse YouTube json3 captions into a flat, time-sorted word list.
   * Works for both auto-generated (one word per seg, with tOffsetMs) and
   * manual captions (a whole line per seg; word times are interpolated).
   * @returns {{t:number, e:number, w:string, brk:boolean}[]} times in ms
   */
  function parseJson3(data) {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    const events = (obj && obj.events) || [];
    const out = [];
    let pendingBreak = false;

    // A cue's display duration is not its speech duration: rolling captions keep a
    // line on screen while the next one is spoken (YouTube's line-level ASR, e.g.
    // variant=gemini, overlaps every cue with the next). Words inside a cue are
    // therefore spread only up to the start of the next cue.
    const hasText = (ev) => ev.segs && ev.segs.some((s) => (s.utf8 || '').trim());
    const starts = events.filter(hasText).map((ev) => ev.tStartMs || 0).sort((a, b) => a - b);
    const nextStartAfter = (t) => {
      let lo = 0;
      let hi = starts.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (starts[m] <= t) lo = m + 1; else hi = m; }
      return lo < starts.length ? starts[lo] : Infinity;
    };
    // Interpolation weight of a token: its length plus a little per word, and a
    // little extra for the breath at a comma.
    const weight = (tk) => tk.length + 3 + (/[,;:]["'”’)]*$/.test(tk) ? 2 : 0);

    for (const ev of events) {
      const segs = ev.segs;
      if (!segs || !segs.length) continue;
      const t0 = ev.tStartMs || 0;
      let evEnd = Math.min(ev.dDurationMs ? t0 + ev.dDurationMs : Infinity, nextStartAfter(t0));
      if (!Number.isFinite(evEnd)) evEnd = t0 + 2000;

      for (let i = 0; i < segs.length; i++) {
        let text = segs[i].utf8 || '';
        if (!text.trim()) continue;
        const s0 = t0 + (segs[i].tOffsetMs || 0);
        let s1 = evEnd;
        for (let j = i + 1; j < segs.length; j++) {
          if ((segs[j].utf8 || '').trim()) { s1 = t0 + (segs[j].tOffsetMs || 0); break; }
        }
        if (s1 < s0) s1 = s0;

        text = text
          .replace(/\[[^\]]*\]|\([^)]*\)|♪+/g, ` ${BREAK} `) // [Music], (laughs), ♪
          .replace(/>>/g, ` ${BREAK} `); // speaker change
        const toks = text.split(/\s+/).filter(Boolean);
        const charLen = toks.reduce((n, x) => n + (x === BREAK ? 0 : weight(x)), 0) || 1;
        let off = 0;
        let first = true;
        let prevTok = '';
        for (let tk of toks) {
          if (tk === BREAK) { pendingBreak = true; continue; }
          // dialogue dash: "- Hi there! - Hello." marks a change of speaker
          const turn = first || endsSentence(prevTok);
          if (/^[-–—]+$/.test(tk)) { if (turn) pendingBreak = true; continue; }
          if (turn && /^[-–—]\S/.test(tk)) { pendingBreak = true; tk = tk.replace(/^[-–—]+/, ''); }
          first = false;
          prevTok = tk;
          const t = Math.round(s0 + (s1 - s0) * (off / charLen));
          // est: time guessed by interpolation inside a multi-word cue (±0.3 s typical)
          out.push({ t, w: tk, evEnd, brk: pendingBreak, est: off > 0 });
          pendingBreak = false;
          off += weight(tk);
        }
      }
    }

    out.sort((a, b) => a.t - b.t);
    for (let i = 0; i < out.length; i++) {
      const next = i + 1 < out.length ? out[i + 1].t : Infinity;
      const cur = out[i];
      let e = Math.min(next, Math.max(cur.evEnd, cur.t + 250), cur.t + 1200);
      if (e < cur.t + 150) e = Math.min(cur.t + 150, next === Infinity ? cur.t + 150 : Math.max(next, cur.t + 1));
      cur.e = e;
      delete cur.evEnd;
    }
    return out;
  }

  function splitLong(g, L, out) {
    const dur = g[g.length - 1].e - g[0].t;
    if ((g.length <= L.maxWords && dur <= L.maxMs) || g.length < L.minPart * 2) {
      out.push(g);
      return;
    }
    const n = g.length;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = L.minPart - 1; i <= n - L.minPart - 1; i++) {
      const w = g[i].w;
      const next = g[i + 1];
      let sc = 0;
      if (/[,;:—–]["'”’)]*$/.test(w)) sc += 1.2;
      sc += Math.min(next.t - g[i].t, 2000) / 1000;
      if (CLAUSE_START.has(next.w.toLowerCase().replace(/[^a-z']/g, ''))) sc += 0.35;
      sc -= (Math.abs(i + 1 - n / 2) / n) * 1.5;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    splitLong(g.slice(0, best + 1), L, out);
    splitLong(g.slice(best + 1), L, out);
  }

  // ---- gluing short pieces --------------------------------------------------
  // Caption word times are only approximate (YouTube's newer ASR rounds them to
  // 100 ms and they can be off by a few hundred ms). Between two sentences
  // spoken without a pause that error lands right on the cut, so a very short
  // sentence like "What's up, everybody?" ends up playing half of the next one.
  // Such pieces are glued to the neighbour they run into.
  const bare = (w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
  const realWords = (g) => g.reduce((n, x) => n + (FILLER.has(bare(x.w)) ? 0 : 1), 0);
  // Rough end of a spoken word, from its start time and length.
  const estEnd = (x) => x.t + Math.min(900, 80 + 55 * x.w.replace(/[^A-Za-z0-9]/g, '').length);
  const pauseBetween = (a, b) => b[0].t - estEnd(a[a.length - 1]);

  function glueFlags(pieces, L) {
    const flat = (c) => [].concat(...c);
    const isShort = (g) => realWords(g) < L.minWords || g[g.length - 1].e - g[0].t < L.minMs;
    const canJoin = (a, b) => !b[0].brk && a.length + b.length <= L.maxWords + 6 &&
      b[b.length - 1].e - a[0].t <= L.maxMs + 3000;
    const cl = pieces.map((g) => [g]);
    let i = 0;
    while (i < cl.length) {
      const g = flat(cl[i]);
      if (!isShort(g)) { i++; continue; }
      const prev = i > 0 ? flat(cl[i - 1]) : null;
      const next = i + 1 < cl.length ? flat(cl[i + 1]) : null;
      const pp = prev && canJoin(prev, g) ? pauseBetween(prev, g) : Infinity;
      const pn = next && canJoin(g, next) ? pauseBetween(g, next) : Infinity;
      if (Math.min(pp, pn) > L.joinPause) { i++; continue; } // clear pause both sides: fine alone
      if (pn <= pp) cl.splice(i, 2, cl[i].concat(cl[i + 1]));
      else { cl.splice(i - 1, 2, cl[i - 1].concat(cl[i])); i--; }
    }
    const glued = new Set();
    for (const c of cl) for (let k = 1; k < c.length; k++) glued.add(c[k]);
    return pieces.map((g) => glued.has(g));
  }

  /**
   * Split words into the finest practice pieces. Each piece carries `glue: true`
   * when it should be played together with the piece before it (see glueFlags).
   * Punctuated captions split on . ? ! ; unpunctuated ones split on pauses.
   * Over-long sentences are split again at commas / pauses near the middle.
   */
  function segmentPieces(words, opts) {
    const L = Object.assign({}, DEFAULT_LIMITS, opts);
    if (!words.length) return [];
    const enders = words.reduce((n, x) => n + (endsSentence(x.w) ? 1 : 0), 0);
    const punctuated = enders * 40 >= words.length;

    let groups = [];
    let cur = [];
    for (const wd of words) {
      if (cur.length) {
        const gap = wd.t - cur[cur.length - 1].t;
        if (wd.brk || gap >= 3000 || (!punctuated && gap >= 900)) { groups.push(cur); cur = []; }
      }
      cur.push(wd);
      if (punctuated && endsSentence(wd.w)) { groups.push(cur); cur = []; }
    }
    if (cur.length) groups.push(cur);

    if (!punctuated) {
      // Pause-based grouping produces tiny fragments; fold them into the previous group.
      const merged = [];
      for (const g of groups) {
        const prev = merged[merged.length - 1];
        const tiny = g.length < 3 && g[g.length - 1].e - g[0].t < 1200;
        if (prev && tiny && !g[0].brk && prev.length + g.length <= L.maxWords) prev.push(...g);
        else merged.push(g);
      }
      groups = merged;
    }

    const pieces = [];
    for (const g of groups) splitLong(g, L, pieces);
    const glue = L.glue === false ? pieces.map(() => false) : glueFlags(pieces, L);
    return pieces.map((g, k) => {
      const start = g[0].t / 1000;
      const end = Math.max(g[g.length - 1].e / 1000, start + 0.3);
      return {
        key: String(g[0].t),
        start,
        end,
        text: g.map((x) => x.w).join(' '),
        words: g.map((x) => ({ w: x.w, t: x.t / 1000 })),
        glue: glue[k],
        estStart: !!g[0].est,
      };
    });
  }

  /**
   * Turn pieces into the sentences shown to the learner, applying the learner's
   * own corrections on top of the automatic gluing:
   *   edits.join  — piece keys to attach to the previous sentence
   *   edits.split — piece keys to start a new sentence (overrides auto-glue)
   *   edits.adj   — { sentenceKey: [startShiftMs, endShiftMs] }
   * A sentence's key is the key of its first piece, so progress survives.
   */
  function assemble(pieces, edits) {
    const E = edits || {};
    const join = new Set(E.join || []);
    const split = new Set(E.split || []);
    const adj = E.adj || {};
    const out = [];
    for (const p of pieces) {
      const prev = out[out.length - 1];
      if (prev && !split.has(p.key) && (p.glue || join.has(p.key))) {
        prev.text += ' ' + p.text;
        prev.words = prev.words.concat(p.words);
        prev.end = Math.max(prev.end, p.end);
        prev.parts.push(p.key);
      } else {
        out.push({
          key: p.key, start: p.start, end: p.end, text: p.text, words: p.words.slice(), parts: [p.key],
          estStart: !!p.estStart,
        });
      }
    }
    out.forEach((s, i) => {
      s.i = i;
      s.start0 = s.start;
      s.end0 = s.end;
      const a = adj[s.key];
      if (a) {
        s.start = Math.max(0, s.start + (a[0] || 0) / 1000);
        s.end = Math.max(s.start + 0.3, s.end + (a[1] || 0) / 1000);
      }
    });
    return out;
  }

  const segment = (words, opts, edits) => assemble(segmentPieces(words, opts), edits);
  const buildPieces = (json3, opts) => segmentPieces(parseJson3(json3), opts);
  const buildSentences = (json3, opts, edits) => assemble(buildPieces(json3, opts), edits);

  const api = { parseJson3, segmentPieces, assemble, segment, buildPieces, buildSentences, endsSentence };
  root.LLSegment = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
