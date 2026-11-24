const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSentences, buildPieces, assemble, parseJson3 } = require('../src/segment.js');
const { checkAnswer, hintText, normWord } = require('../src/check.js');

const ASR = fs.readFileSync(path.join(__dirname, 'fixtures/asr-steve-kerr.json3'), 'utf8');
// Newer-style ASR: word times rounded to 100 ms, some segs hold two words.
const COARSE = fs.readFileSync(path.join(__dirname, 'fixtures/asr-draymond-coarse.json3'), 'utf8');
// The same video as the web player actually gets it (variant=gemini): one cue per
// caption line, no word times, and every cue overlapping the next on screen.
const GEMINI = fs.readFileSync(path.join(__dirname, 'fixtures/cues-draymond-gemini.json3'), 'utf8');

test('ASR captions: word timings parsed, speaker markers removed', () => {
  const words = parseJson3(ASR);
  assert.ok(words.length > 1400);
  assert.ok(words.every((w) => !w.w.includes('>>')));
  for (let i = 1; i < words.length; i++) assert.ok(words[i].t >= words[i - 1].t);
});

test('ASR captions: sentences are ordered, bounded and readable', () => {
  const ss = buildSentences(ASR);
  assert.ok(ss.length >= 99, `got ${ss.length}`);
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    assert.ok(s.end > s.start, `sentence ${i} has end <= start`);
    if (i) assert.ok(s.start >= ss[i - 1].start);
    assert.ok(s.words.length <= 24, `sentence ${i} too long: ${s.words.length} words`);
  }
  // before gluing, every piece respects the split limit
  for (const p of buildPieces(ASR)) if (p.words.length >= 6) assert.ok(p.words.length <= 18, p.text);
  const hit = ss.find((s) => Math.abs(s.start - 30.16) < 0.01);
  assert.equal(hit.text, 'So we stay in touch and I love hearing from him.');
  assert.equal(hit.end, 32.48);
  // the 54-word sentence at 442s must have been split
  const long = buildPieces(ASR).filter((s) => s.start >= 442 && s.start < 458.4);
  assert.ok(long.length >= 3, `long sentence split into ${long.length}`);
  assert.ok(long[0].text.startsWith('You know, I'));
});

test('manual captions: cues merged into sentences, word times interpolated', () => {
  const json3 = {
    events: [
      { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'I went to the store\nyesterday and' }] },
      { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'bought some milk. Then I' }] },
      { tStartMs: 5000, dDurationMs: 1500, segs: [{ utf8: 'went home.' }] },
      { tStartMs: 7000, dDurationMs: 1500, segs: [{ utf8: '[Music]' }] },
      { tStartMs: 9000, dDurationMs: 1500, segs: [{ utf8: '- Hi there! - Hello.' }] },
    ],
  };
  const ss = buildSentences(json3);
  assert.deepEqual(ss.map((s) => s.text), [
    'I went to the store yesterday and bought some milk.',
    'Then I went home.',
    'Hi there!',
    'Hello.',
  ]);
  assert.equal(ss[0].start, 1);
  assert.ok(ss[1].start > 3.5 && ss[1].start < 5, `interpolated start ${ss[1].start}`);
  assert.ok(ss[1].end <= 6.5);
});

test('line-level captions with overlapping cues keep word order', () => {
  const words = parseJson3(GEMINI).map((w) => w.w);
  const transcript = JSON.parse(GEMINI).events.filter((e) => e.segs)
    .map((e) => e.segs.map((s) => s.utf8).join('')).join(' ')
    .replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
  assert.deepEqual(words, transcript);
  const ss = buildSentences(GEMINI);
  // used to come out as "show, On today's uh we will talk about trip."
  assert.equal(ss[1].text, "On today's show, uh we will talk about the tough road trip.");
  // word-level ASR of the same audio puts this sentence at 3.0–7.2 s
  assert.ok(Math.abs(ss[1].start - 3.0) < 0.3, `start ${ss[1].start}`);
  assert.ok(Math.abs(ss[1].end - 7.2) < 0.3, `end ${ss[1].end}`);
  assert.equal(ss[1].estStart, true); // starts mid-cue: time is a guess
  assert.equal(ss[0].estStart, false);
  // a cue's words never spill past the next cue's start
  const cues = JSON.parse(GEMINI).events.filter((e) => e.segs && e.segs.some((x) => x.utf8.trim()));
  const ws = parseJson3(GEMINI);
  assert.ok(ws.every((w, i) => !i || w.t >= ws[i - 1].t));
  assert.ok(ws.filter((w) => w.t < cues[1].tStartMs).length === cues[0].segs[0].utf8.split(/\s+/).filter(Boolean).length);
});

test('short sentence running into the next one is glued to it', () => {
  // ASR says "What's up, everybody?" is 0.0–0.7 s with "Welcome" right after; in the
  // real audio the cut is late, so playing 0–0.7 s also plays "welcome back to".
  const ss = buildSentences(COARSE);
  assert.equal(ss[0].text, "What's up, everybody? Welcome back to the Draymond Green Show.");
  assert.equal(ss[0].start, 0);
  assert.equal(ss[0].end, 3);
  assert.deepEqual(ss[0].parts, ['0', '700']);
  assert.equal(ss[1].text.split(' ')[0], 'On');
  // a short sentence with a clear pause on both sides stays on its own
  const json3 = { events: [
    { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'This is the first sentence here.' }] },
    { tStartMs: 4000, dDurationMs: 800, segs: [{ utf8: 'Yeah.' }] },
    { tStartMs: 6000, dDurationMs: 3000, segs: [{ utf8: 'And this one comes after it.' }] },
  ] };
  assert.deepEqual(buildSentences(json3).map((s) => s.text),
    ['This is the first sentence here.', 'Yeah.', 'And this one comes after it.']);
});

test('learner edits: split, join and boundary shifts', () => {
  const pieces = buildPieces(COARSE);
  // split the auto-glued opener back apart
  let ss = assemble(pieces, { split: ['700'] });
  assert.equal(ss[0].text, "What's up, everybody?");
  assert.equal(ss[1].text, 'Welcome back to the Draymond Green Show.');
  // join "On today's show…" onto the opener
  ss = assemble(pieces, { join: ['3000'] });
  assert.ok(ss[0].text.endsWith('the tough road trip.'));
  assert.deepEqual(ss[0].parts, ['0', '700', '3000']);
  assert.equal(ss[0].end, 7.2);
  // shift start +0.2 s and end -0.3 s; originals kept
  ss = assemble(pieces, { adj: { 0: [200, -300] } });
  assert.equal(ss[0].start, 0.2);
  assert.equal(ss[0].end, 2.7);
  assert.equal(ss[0].start0, 0);
  assert.equal(ss[0].end0, 3);
  // never shorter than 0.3 s, never before 0
  ss = assemble(pieces, { adj: { 0: [-500, -9000] } });
  assert.equal(ss[0].start, 0);
  assert.equal(ss[0].end, 0.3);
});

test('unpunctuated captions fall back to pause-based splitting', () => {
  const words = 'so i was thinking we could go out tonight maybe grab some food what do you think'.split(' ');
  const segs = [];
  let t = 0;
  words.forEach((w, i) => {
    segs.push({ utf8: (i ? ' ' : '') + w, tOffsetMs: t });
    t += i === 7 ? 1500 : 300; // long pause after "out"? no: after index 7 ("out")
  });
  const ss = buildSentences({ events: [{ tStartMs: 0, dDurationMs: t + 500, segs }] });
  assert.equal(ss.length, 2);
  assert.equal(ss[0].text, 'so i was thinking we could go out');
});

test('check: exact match ignoring case and punctuation', () => {
  const r = checkAnswer('So we stay in touch and I love hearing from him.', 'so we stay in touch and i love hearing from him');
  assert.equal(r.perfect, true);
  assert.equal(r.score, 1);
});

test('check: contractions, numbers, compounds and fillers are equivalent', () => {
  assert.ok(checkAnswer("I hadn't seen him probably in a couple years.", 'I had not seen him probably in a couple years').perfect);
  assert.ok(checkAnswer('I think he had 23 at halftime,', 'i think he had twenty-three at half time').perfect);
  assert.ok(checkAnswer('Well, just uh tightening everything up', 'well just tightening everything up').perfect);
  assert.ok(checkAnswer("he's the biggest Warriors fan there is.", 'he is the biggest warriors fan there is').perfect);
  assert.ok(checkAnswer("We're gonna be fine.", 'we are going to be fine').perfect);
  assert.ok(checkAnswer("Let's go.", 'let us go').perfect);
  assert.ok(checkAnswer('It costs $5.', 'it costs five dollars').perfect);
});

test('check: wrong, missing, extra and near-miss words are reported', () => {
  const r = checkAnswer('I loved seeing him before the game.', 'I love seeing him before game today');
  const st = Object.fromEntries(r.words.map((w) => [w.text, w.status]));
  assert.equal(st.loved, 'near'); // love vs loved: close, not counted as correct
  assert.deepEqual(r.words.find((w) => w.text === 'loved').typed, ['love']);
  assert.equal(st.the, 'missing');
  assert.equal(st['game.'], 'ok');
  assert.deepEqual(r.extras, [{ after: 6, text: 'today' }]);
  assert.equal(r.perfect, false);
  assert.deepEqual(r.missed, ['loved', 'the']);

  const near = checkAnswer('tightening everything up', 'tighening everything up');
  assert.equal(near.words[0].status, 'near');
});

test('check: filler words show as filler, not missing', () => {
  const r = checkAnswer('Um, you know, starting with transition', 'you know starting with transition');
  assert.equal(r.words[0].status, 'filler');
  assert.ok(r.perfect);
  const strict = checkAnswer('Um, you know', 'you know', { ignoreFillers: false });
  assert.equal(strict.words[0].status, 'missing');
});

test('normWord and hintText', () => {
  assert.deepEqual(normWord('"Twenty-three,"'), ['twenty', 'three']);
  assert.deepEqual(normWord('1990s'), ['one', 'thousand', 'nine', 'hundred', 'nineties']);
  assert.deepEqual(normWord('3rd'), ['third']);
  assert.equal(hintText("I hadn't seen him."), "I  h___'_  s___  h__.");
});

test('i18n: zh and en have the same keys and placeholders', () => {
  const { dict } = require('../src/i18n.js');
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  assert.deepEqual(Object.keys(dict.en).sort(), Object.keys(dict.zh).sort());
  for (const k of Object.keys(dict.zh)) assert.equal(ph(dict.en[k]), ph(dict.zh[k]), k);
  // every t('key') used by the panel exists
  const src = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
  const used = [...src.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith(':'));
  for (const k of used) assert.ok(k in dict.zh, `missing string ${k}`);
});

test('i18n: Chinese browsers get Chinese, everyone else English', () => {
  const i18n = require('../src/i18n.js');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const as = (languages) => {
    Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true });
    return i18n.detect();
  };
  try {
    assert.equal(as(['zh-CN', 'en']), 'zh');
    assert.equal(as(['zh-TW']), 'zh');
    assert.equal(as(['zh-HK', 'en-US']), 'zh');
    assert.equal(as(['zh']), 'zh');
    assert.equal(as(['en-US', 'zh-CN']), 'en');
    assert.equal(as(['ja-JP']), 'en');
    assert.equal(as(['de']), 'en');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
  }
});

// ---- mistake notebook (错题本) --------------------------------------------
const NB = require('../src/notebook.js');
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime(); // local time
const sample = (over) => NB.newItem(Object.assign({
  videoId: 'bghlEqTApEQ', key: '30160', title: 'Kerr', start: 30.16, end: 32.48, a: 30.08, b: 32.48,
  text: 'So we stay in touch and I love hearing from him.', answer: 'so we stay in touch', missed: ['hearing'],
}, over), at(2026, 11, 24, 21));

test('notebook: new item is due the next calendar day', () => {
  const it = sample();
  assert.equal(it.id, 'bghlEqTApEQ:30160');
  assert.equal(NB.isDue(it, at(2026, 11, 24, 23)), false);
  assert.equal(NB.isDue(it, at(2026, 11, 25, 0)), true); // just after midnight
  assert.equal(NB.isDue(it, at(2026, 12, 3)), true); // overdue stays due
});

test('notebook: good walks 1 -> 3 -> 7 -> 15 -> 30 days, then mastered', () => {
  let it = sample();
  let day = at(2026, 11, 25);
  const gaps = [];
  for (let k = 0; k < 4; k++) {
    it = NB.applyGrade(it, 'good', day);
    gaps.push(it.due - NB.dayIndex(day));
    day += gaps[gaps.length - 1] * 86400000;
  }
  assert.deepEqual(gaps, [3, 7, 15, 30]);
  assert.equal(it.mastered, false);
  it = NB.applyGrade(it, 'good', day); // passed the 30-day review
  assert.equal(it.mastered, true);
  assert.equal(it.due, null);
  assert.equal(NB.isDue(it, day + 400 * 86400000), false);
  assert.equal(it.reviews.length, 5);
});

test('notebook: fuzzy stays and returns within two days, again restarts tomorrow', () => {
  const d = at(2026, 12, 1);
  let it = NB.applyGrade(NB.applyGrade(sample(), 'good', d), 'good', d); // stage 2 (7 days)
  const f = NB.applyGrade(it, 'fuzzy', d);
  assert.equal(f.stage, 2);
  assert.equal(f.due - NB.dayIndex(d), 2);
  assert.equal(NB.applyGrade(sample(), 'fuzzy', d).due - NB.dayIndex(d), 1); // stage 0: interval is 1 day
  const a = NB.applyGrade(it, 'again', d);
  assert.equal(a.stage, 0);
  assert.equal(a.due - NB.dayIndex(d), 1);
  // a mastered item that is forgotten comes back
  const m = Object.assign({}, it, { mastered: true, stage: 5, due: null });
  assert.equal(NB.applyGrade(m, 'again', d).mastered, false);
  assert.equal(NB.applyGrade(m, 'good', d).mastered, true);
});

test('notebook: auto grade from the first check', () => {
  assert.equal(NB.autoGrade({ perfect: true, score: 1, helped: false, revealed: false }), 'good');
  assert.equal(NB.autoGrade({ perfect: true, score: 1, helped: true, revealed: false }), 'fuzzy');
  assert.equal(NB.autoGrade({ perfect: false, score: 0.85, helped: false, revealed: false }), 'fuzzy');
  assert.equal(NB.autoGrade({ perfect: false, score: 0.5, helped: false, revealed: false }), 'again');
  assert.equal(NB.autoGrade({ perfect: true, score: 1, helped: false, revealed: true }), 'again');
});

test('notebook: review queue groups by video, most overdue video first, time order inside', () => {
  const now = at(2026, 12, 10);
  const mk = (videoId, key, start, due) => Object.assign(sample({ videoId, key, start, end: start + 2 }), { due });
  const today = NB.dayIndex(now);
  const items = {};
  for (const it of [
    mk('videoAAAAAAA', '50000', 50, today), mk('videoAAAAAAA', '10000', 10, today - 1),
    mk('videoBBBBBBB', '90000', 90, today - 3), mk('videoBBBBBBB', '20000', 20, today),
    mk('videoCCCCCCC', '5000', 5, today + 1), // not due yet
  ]) items[it.id] = it;
  items['videoAAAAAAA:70000'] = Object.assign(mk('videoAAAAAAA', '70000', 70, today), { gone: true });
  assert.deepEqual(NB.buildQueue(items, now), ['videoBBBBBBB:20000', 'videoBBBBBBB:90000', 'videoAAAAAAA:10000', 'videoAAAAAAA:50000']);
  assert.deepEqual(NB.stats(items, now), { total: 6, due: 4, mastered: 0, gone: 1 });
});

test('notebook: backup round trip keeps the more recently reviewed copy', () => {
  const a = sample();
  const items = { [a.id]: a };
  const backup = JSON.parse(JSON.stringify(NB.exportData(items, Date.now())));
  const newer = Object.assign({}, backup.items[0], { stage: 3, lastReview: a.added + 1000 });
  const other = Object.assign({}, backup.items[0], { key: '99000', start: 99, end: 101 });
  const bad = { videoId: 'x', key: 1 };
  const res = NB.mergeImport(items, { items: [newer, other, bad] });
  assert.deepEqual(res, { ok: true, added: 1, updated: 1, skipped: 1 });
  assert.equal(items[a.id].stage, 3);
  assert.ok(items['bghlEqTApEQ:99000']);
  assert.equal(NB.mergeImport(items, { nope: 1 }).ok, false);
  assert.deepEqual(NB.missedIndex(items)[0], ['hearing', [a.id, 'bghlEqTApEQ:99000']]);
});
