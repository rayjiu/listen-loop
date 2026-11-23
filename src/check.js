/*
 * Listen Loop — dictation checking.
 * Normalises both texts (case, punctuation, contractions, numbers, fillers),
 * aligns them word-by-word (LCS) and reports per-word status.
 */
(function (root) {
  'use strict';

  const FILLERS = new Set(['uh', 'um', 'uhm', 'umm', 'uhh', 'er', 'erm', 'ah', 'hmm', 'hm', 'mm', 'mhm', 'eh']);

  const SLANG = {
    gonna: ['going', 'to'], wanna: ['want', 'to'], gotta: ['got', 'to'], kinda: ['kind', 'of'],
    sorta: ['sort', 'of'], outta: ['out', 'of'], lotta: ['lot', 'of'], dunno: ['do', 'not', 'know'],
    gimme: ['give', 'me'], lemme: ['let', 'me'], ok: ['okay'], cause: ['because'], cuz: ['because'],
    coz: ['because'], till: ['until'], til: ['until'], alright: ['all', 'right'], cannot: ['can', 'not'],
  };
  const IRREG = {
    "can't": ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'], "ain't": ['aint'],
    "let's": ['let', 'us'], "y'all": ['you', 'all'], "'em": ['them'], "'cause": ['because'],
  };
  // Clitics we can't expand unambiguously: 's = is / has / possessive, 'd = would / had.
  const CLITIC = { "'s": ['is', 'has', 'was'], "'d": ['would', 'had', 'did'] };

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function numToWords(n) {
    if (n < 20) return [ONES[n]];
    if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
    if (n < 1000) {
      const r = n % 100;
      return [ONES[Math.floor(n / 100)], 'hundred'].concat(r ? numToWords(r) : []);
    }
    if (n < 1e6) {
      const r = n % 1000;
      return numToWords(Math.floor(n / 1000)).concat(['thousand'], r ? numToWords(r) : []);
    }
    if (n < 1e9) {
      const r = n % 1e6;
      return numToWords(Math.floor(n / 1e6)).concat(['million'], r ? numToWords(r) : []);
    }
    return [String(n)];
  }

  function ordinal(w) {
    const map = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
    if (map[w]) return map[w];
    if (w.endsWith('y')) return w.slice(0, -1) + 'ieth';
    return w + 'th';
  }

  function numberTokens(p) {
    const m = p.match(/^(\$)?(\d[\d,]*)(?:\.(\d+))?(%|st|nd|rd|th|s|k)?$/);
    if (!m) return null;
    const n = parseInt(m[2].replace(/,/g, ''), 10);
    if (!Number.isFinite(n)) return null;
    let words = numToWords(n);
    if (m[3]) words = words.concat(['point'], m[3].split('').map((d) => ONES[+d]));
    const suf = m[4];
    if (suf === '%') words.push('percent');
    else if (suf === 'k') words.push('thousand');
    else if (suf === 's') {
      const last = words.pop();
      words.push(last.endsWith('y') ? last.slice(0, -1) + 'ies' : last + 's');
    } else if (suf) words.push(ordinal(words.pop()));
    if (m[1]) words.push('dollars');
    return words;
  }

  /** Normalise one written word into comparable tokens. */
  function normWord(raw) {
    const s = raw.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"');
    const out = [];
    for (let p of s.split(/[-–—/]+/)) {
      p = p.replace(/^[^a-z0-9'$]+/, '').replace(/[^a-z0-9'%]+$/, '');
      if (!p) continue;
      if (IRREG[p]) { out.push(...IRREG[p]); continue; }
      const num = numberTokens(p);
      if (num) { out.push(...num); continue; }
      p = p.replace(/^'+|'+$/g, '');
      if (!p) continue;
      if (IRREG[p]) { out.push(...IRREG[p]); continue; }
      if (SLANG[p]) { out.push(...SLANG[p]); continue; }
      let m;
      if ((m = p.match(/^(.+)n't$/))) out.push(m[1], 'not');
      else if ((m = p.match(/^(.+)'re$/))) out.push(m[1], 'are');
      else if ((m = p.match(/^(.+)'ve$/))) out.push(m[1], 'have');
      else if ((m = p.match(/^(.+)'ll$/))) out.push(m[1], 'will');
      else if ((m = p.match(/^(.+)'m$/))) out.push(m[1], 'am');
      else if ((m = p.match(/^(.+)'d$/))) out.push(m[1], "'d");
      else if ((m = p.match(/^(.+)'s$/))) out.push(m[1], "'s");
      else {
        const clean = p.replace(/[^a-z0-9]/g, '');
        if (clean) out.push(clean);
      }
    }
    return out.map((t) => t.replace(/[^a-z0-9']/g, '')).filter(Boolean);
  }

  function tokenize(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const toks = [];
    words.forEach((w, wi) => {
      for (const tok of normWord(w)) toks.push({ tok, wis: [wi], filler: FILLERS.has(tok) });
    });
    return { words, toks };
  }

  function eqTok(a, b) {
    if (a === b) return true;
    if (CLITIC[a] && CLITIC[a].includes(b)) return true;
    if (CLITIC[b] && CLITIC[b].includes(a)) return true;
    return false;
  }

  /** "pre game" vs "pregame", "half time" vs "halftime": merge pairs that match a single token on the other side. */
  function mergeCompounds(T, other) {
    const set = new Set(other.map((x) => x.tok));
    const out = [];
    for (let i = 0; i < T.length; i++) {
      const a = T[i];
      const b = T[i + 1];
      if (b && set.has(a.tok + b.tok) && !(set.has(a.tok) && set.has(b.tok))) {
        out.push({ tok: a.tok + b.tok, wis: a.wis.concat(b.wis), filler: false });
        i++;
      } else out.push(a);
    }
    return out;
  }

  function lcsOps(A, B) {
    const n = A.length;
    const m = B.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = eqTok(A[i], B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (eqTok(A[i], B[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) { ops.push({ op: 'eq', a: i, b: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', a: i }); i++; }
      else { ops.push({ op: 'ins', b: j }); j++; }
    }
    while (i < n) ops.push({ op: 'del', a: i++ });
    while (j < m) ops.push({ op: 'ins', b: j++ });
    return ops;
  }

  function lev(a, b) {
    const m = a.length;
    const n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function isNear(a, b) {
    if (CLITIC[a] || CLITIC[b]) return false;
    const L = Math.max(a.length, b.length);
    if (L < 4) return false;
    return lev(a, b) <= (L >= 8 ? 2 : 1);
  }

  const RANK = { ok: 0, near: 1, missing: 2, wrong: 3 };

  /**
   * Compare a reference sentence with what the learner typed.
   * @returns {{words:{text:string,status:string,typed:string[]}[], extras:{after:number,text:string}[],
   *           score:number, perfect:boolean, counts:object, missed:string[]}}
   */
  function checkAnswer(refText, userText, opts) {
    const ignoreFillers = !opts || opts.ignoreFillers !== false;
    const R = tokenize(refText);
    const U = tokenize(userText);
    let A = R.toks.filter((t) => !(ignoreFillers && t.filler));
    let B = U.toks.filter((t) => !(ignoreFillers && t.filler));
    const A2 = mergeCompounds(A, B);
    const B2 = mergeCompounds(B, A);
    A = A2;
    B = B2;
    const ops = lcsOps(A.map((x) => x.tok), B.map((x) => x.tok));

    const status = R.words.map(() => null);
    const typed = R.words.map(() => []);
    const counts = { ok: 0, near: 0, wrong: 0, missing: 0, extra: 0 };
    const extras = []; // { after, wis }

    const mark = (at, st, bt) => {
      counts[st]++;
      for (const wi of at.wis) {
        if (status[wi] === null || RANK[st] > RANK[status[wi]]) status[wi] = st;
        if (bt) for (const uw of bt.wis) if (!typed[wi].includes(uw)) typed[wi].push(uw);
      }
    };
    const lastWi = (t) => t.wis[t.wis.length - 1];

    let run = { dels: [], inss: [] };
    let after = -1;
    const flush = () => {
      const k = Math.min(run.dels.length, run.inss.length);
      run.dels.forEach((ai, x) => {
        if (x < k) {
          const bt = B[run.inss[x]];
          mark(A[ai], isNear(A[ai].tok, bt.tok) ? 'near' : 'wrong', bt);
        } else mark(A[ai], 'missing');
      });
      if (run.dels.length) after = lastWi(A[run.dels[run.dels.length - 1]]);
      for (let x = k; x < run.inss.length; x++) {
        counts.extra++;
        extras.push({ after, wis: B[run.inss[x]].wis });
      }
      run = { dels: [], inss: [] };
    };
    for (const op of ops) {
      if (op.op === 'eq') {
        flush();
        mark(A[op.a], 'ok');
        after = lastWi(A[op.a]);
      } else if (op.op === 'del') run.dels.push(op.a);
      else run.inss.push(op.b);
    }
    flush();

    // Fillers / punctuation-only words that never took part in the comparison.
    R.words.forEach((w, wi) => {
      if (status[wi] !== null) return;
      const own = R.toks.filter((t) => t.wis[0] === wi);
      status[wi] = own.length && own.every((t) => t.filler) ? 'filler' : own.length ? 'ok' : 'punct';
    });

    // Group extras that come from the same typed word.
    const extrasOut = [];
    const seen = new Set();
    for (const x of extras) {
      const ws = x.wis.filter((wi) => !seen.has(wi));
      ws.forEach((wi) => seen.add(wi));
      if (ws.length) extrasOut.push({ after: x.after, text: ws.map((wi) => U.words[wi]).join(' ') });
    }

    const total = A.length;
    const score = total ? Math.max(0, (counts.ok + 0.5 * counts.near - 0.25 * counts.extra) / total) : B.length ? 0 : 1;
    const perfect = counts.ok === total && counts.extra === 0;
    const missed = [];
    R.words.forEach((w, wi) => {
      if (status[wi] === 'wrong' || status[wi] === 'missing' || status[wi] === 'near') {
        const n = w.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
        if (n) missed.push(n);
      }
    });

    return {
      words: R.words.map((text, wi) => ({ text, status: status[wi], typed: typed[wi].map((u) => U.words[u]) })),
      extras: extrasOut,
      score: Math.min(1, score),
      perfect,
      counts,
      missed,
    };
  }

  /** "So we stay in touch." -> "S_ w_ s___ i_ t____." */
  function hintText(text) {
    return String(text || '').trim().split(/\s+/).map((w) => {
      let first = true;
      return w.replace(/[A-Za-z0-9]/g, (ch) => {
        if (first) { first = false; return ch; }
        return '_';
      });
    }).join('  ');
  }

  const api = { checkAnswer, hintText, normWord, tokenize, numToWords };
  root.LLCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
