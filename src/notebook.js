/*
 * Listen Loop — mistake notebook (错题本): data model and spaced repetition.
 * Pure functions plus a tiny chrome.storage wrapper. Used by the content script,
 * the notebook page, and the Node unit tests.
 *
 * An item is one sentence the learner chose to keep. It stores everything needed
 * to review it later without fetching captions again: the video, the sentence's
 * time range (as played), its text, and the learner's answer when they added it.
 *
 * Schedule: review after 1, 3, 7, 15, 30 days. "good" moves to the next interval
 * (passing the 30-day review = mastered), "fuzzy" stays and comes back within two
 * days, "again" starts over tomorrow. Days are local calendar days.
 */
(function (root) {
  'use strict';

  const KEY = 'll:nb'; // { v: 1, items: { [id]: item } }
  const REVIEW_KEY = 'll:review'; // current review session
  const INTERVALS = [1, 3, 7, 15, 30];
  const FUZZY_DAYS = 2;
  const DAY = 86400000;
  const GRADES = ['again', 'fuzzy', 'good'];

  /** Local calendar day number (days since 1970-01-01 in the local time zone). */
  const dayIndex = (ts) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / DAY);
  const itemId = (videoId, key) => `${videoId}:${key}`;

  function newItem(f, now) {
    return {
      id: itemId(f.videoId, f.key),
      videoId: f.videoId,
      title: f.title || '',
      key: String(f.key),
      start: f.start,
      end: f.end,
      a: f.a != null ? f.a : f.start, // play range (with lead-in / tail)
      b: f.b != null ? f.b : f.end,
      text: f.text,
      answer: f.answer || '',
      missed: Array.isArray(f.missed) ? f.missed.slice(0, 30) : [],
      added: now,
      stage: 0,
      due: dayIndex(now) + INTERVALS[0],
      reviews: [],
      mastered: false,
      gone: false, // video no longer playable
    };
  }

  const isDue = (it, now) => !!it && !it.mastered && !it.gone && it.due != null && it.due <= dayIndex(now);
  const daysUntil = (it, now) => (it.due == null ? null : it.due - dayIndex(now));

  /**
   * Grade a review from its first check.
   *   revealed (looked at the answer)        -> again
   *   all correct, no hint / translation     -> good
   *   all correct with help, or score >= 80% -> fuzzy
   *   otherwise                              -> again
   */
  function autoGrade(r) {
    if (r.revealed) return 'again';
    if (r.perfect && !r.helped) return 'good';
    if (r.perfect || r.score >= 0.8) return 'fuzzy';
    return 'again';
  }

  /** Item after a review with `grade` at time `now` (returns a new object). */
  function applyGrade(it, grade, now) {
    const today = dayIndex(now);
    const stage = Math.min(it.stage || 0, INTERVALS.length - 1);
    const out = Object.assign({}, it, {
      reviews: (it.reviews || []).concat([{ at: now, grade }]).slice(-50),
      lastReview: now,
    });
    if (grade === 'good') {
      if (!it.mastered && stage >= INTERVALS.length - 1) {
        out.mastered = true;
        out.stage = INTERVALS.length;
        out.due = null;
      } else if (it.mastered) {
        out.due = null; // reviewing a mastered item and still knowing it: stays mastered
      } else {
        out.stage = stage + 1;
        out.due = today + INTERVALS[out.stage];
      }
    } else if (grade === 'fuzzy') {
      out.mastered = false;
      out.stage = stage;
      out.due = today + Math.min(FUZZY_DAYS, INTERVALS[stage]);
    } else {
      out.mastered = false;
      out.stage = 0;
      out.due = today + INTERVALS[0];
    }
    return out;
  }

  /**
   * Ids to review, grouped by video so the learner switches videos as little as
   * possible: videos with the most-overdue item first, sentences in time order.
   */
  function buildQueue(items, now) {
    const due = Object.values(items).filter((it) => isDue(it, now));
    const byVideo = new Map();
    for (const it of due) {
      if (!byVideo.has(it.videoId)) byVideo.set(it.videoId, []);
      byVideo.get(it.videoId).push(it);
    }
    const groups = [...byVideo.values()].map((g) => g.sort((x, y) => x.start - y.start));
    const firstDue = (g) => Math.min(...g.map((it) => it.due));
    groups.sort((g, h) => firstDue(g) - firstDue(h) || g[0].added - h[0].added);
    return [].concat(...groups).map((it) => it.id);
  }

  function stats(items, now) {
    const all = Object.values(items);
    return {
      total: all.length,
      due: all.filter((it) => isDue(it, now)).length,
      mastered: all.filter((it) => it.mastered).length,
      gone: all.filter((it) => it.gone).length,
    };
  }

  /** word -> ids of items where the learner missed or misheard it. */
  function missedIndex(items) {
    const m = new Map();
    for (const it of Object.values(items)) {
      for (const w of new Set((it.missed || []).map((x) => String(x).toLowerCase()))) {
        if (!m.has(w)) m.set(w, []);
        m.get(w).push(it.id);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }

  // ---- backup ---------------------------------------------------------------
  function validItem(x) {
    return !!x && typeof x === 'object' && typeof x.videoId === 'string' && /^[\w-]{6,20}$/.test(x.videoId) &&
      typeof x.key === 'string' && typeof x.text === 'string' && x.text.length > 0 &&
      Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start;
  }

  function exportData(items, now) {
    return { app: 'listen-loop', kind: 'notebook', v: 1, exported: new Date(now).toISOString(), items: Object.values(items) };
  }

  /**
   * Merge a backup into `items` (mutates it). An item that exists on both sides
   * keeps whichever copy was reviewed (or added) more recently.
   */
  function mergeImport(items, data) {
    const list = data && Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : null;
    if (!list) return { ok: false, added: 0, updated: 0, skipped: 0 };
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const touched = (it) => Math.max(it.lastReview || 0, it.added || 0);
    for (const raw of list) {
      if (!validItem(raw)) { skipped++; continue; }
      const it = Object.assign({
        title: '', answer: '', missed: [], reviews: [], stage: 0, mastered: false, gone: false,
        added: Date.now(), a: raw.start, b: raw.end,
      }, raw, { id: itemId(raw.videoId, raw.key) });
      if (it.due == null && !it.mastered) it.due = dayIndex(it.added) + INTERVALS[0];
      const cur = items[it.id];
      if (!cur) { items[it.id] = it; added++; } else if (touched(it) > touched(cur)) { items[it.id] = it; updated++; } else skipped++;
    }
    return { ok: true, added, updated, skipped };
  }

  // ---- storage (extension contexts only) -------------------------------------
  const store = {
    async load() {
      try {
        const r = await chrome.storage.local.get(KEY);
        return (r[KEY] && r[KEY].items) || {};
      } catch (_) {
        return {};
      }
    },
    /** Read-modify-write; `fn(items)` mutates in place and may return a value. */
    async update(fn) {
      const items = await store.load();
      const res = fn(items);
      await chrome.storage.local.set({ [KEY]: { v: 1, items } });
      return res;
    },
    async session() {
      try { return (await chrome.storage.local.get(REVIEW_KEY))[REVIEW_KEY] || null; } catch (_) { return null; }
    },
    async setSession(s) {
      try {
        if (s) await chrome.storage.local.set({ [REVIEW_KEY]: s });
        else await chrome.storage.local.remove(REVIEW_KEY);
      } catch (_) { /* context invalidated */ }
    },
  };

  /** A review session over `ids`; results collect each item's grade. */
  const newSession = (ids, now) => ({ queue: ids.slice(), pos: 0, results: {}, started: now });

  const watchUrl = (it) => `https://www.youtube.com/watch?v=${encodeURIComponent(it.videoId)}&t=${Math.max(0, Math.floor(it.a != null ? it.a : it.start))}s`;

  const api = {
    KEY, REVIEW_KEY, INTERVALS, GRADES, dayIndex, itemId, newItem, isDue, daysUntil, autoGrade, applyGrade,
    buildQueue, stats, missedIndex, validItem, exportData, mergeImport, store, newSession, watchUrl,
  };
  root.LLNotebook = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
