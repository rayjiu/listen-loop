/*
 * Listen Loop — mistake notebook page (notebook.html).
 * Lists saved sentences (due / all / mastered / missed words), starts a review
 * session (which continues on the YouTube pages, see content.js), and handles
 * backup export / import. Re-renders whenever storage changes in another tab.
 */
(() => {
  'use strict';
  const NB = window.LLNotebook;
  const I18N = window.LLI18n;
  const FB = window.LLFeedback;

  let lang = 'zh';
  let items = {};
  const ui = { tab: 'due', word: null, shown: new Set(), confirm: null, confirmTimer: 0 };
  const app = document.getElementById('app');
  const fileInput = document.getElementById('import-file');

  function t(key, vars) {
    const d = I18N.dict;
    let s = (d[lang] && d[lang][key]) != null ? d[lang][key] : d.zh[key] != null ? d.zh[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
    return s;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const videoUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const whenText = (d) => (d <= 0 ? t('nbToday') : d === 1 ? t('nbTomorrow') : t('nbInDays', { n: d }));

  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------------------------------------------------------------- views
  function listFor(tab, now) {
    const all = Object.values(items);
    if (tab === 'due') return NB.buildQueue(items, now).map((id) => items[id]).concat(all.filter((it) => it.gone));
    if (tab === 'mastered') return all.filter((it) => it.mastered);
    let list = all;
    if (ui.word) list = list.filter((it) => (it.missed || []).some((w) => String(w).toLowerCase() === ui.word));
    return list;
  }

  /** Group by video, keeping the given order of first appearance (due) or newest first. */
  function groups(list, keepOrder) {
    const m = new Map();
    for (const it of list) {
      if (!m.has(it.videoId)) m.set(it.videoId, []);
      m.get(it.videoId).push(it);
    }
    const gs = [...m.values()].map((g) => (keepOrder ? g : g.sort((a, b) => a.start - b.start)));
    if (!keepOrder) gs.sort((a, b) => Math.max(...b.map((x) => x.added)) - Math.max(...a.map((x) => x.added)));
    return gs;
  }

  function itemHtml(it, now) {
    const shown = ui.shown.has(it.id);
    const words = it.text.split(/\s+/).length;
    const text = shown
      ? `<span class="tx">${esc(it.text)}</span>`
      : `<span class="tx masked">${'•'.repeat(Math.min(24, Math.max(4, Math.round(it.text.length / 5))))}  ${esc(t('nWords', { n: words }))}</span>`;
    const answer = it.answer ? `${esc(t('pgYouWrote'))}<span class="ans">${esc(it.answer)}</span>` : esc(t('pgNothingWritten'));
    const missed = (it.missed || []).length
      ? `<div>${esc(t('pgMissed'))}${it.missed.map((w) => `<span class="chip">${esc(w)}</span>`).join('')}</div>` : '';
    let sched;
    if (it.gone) sched = `<span class="gone">${esc(t('pgGone'))}</span>`;
    else if (it.mastered) sched = esc(t('nbMastered'));
    else {
      const d = NB.daysUntil(it, now);
      const when = d <= 0 ? `<span class="due">${esc(t('nbToday'))}</span>` : esc(whenText(d));
      sched = `${esc(t('pgRound', { k: Math.min(it.stage, 4) + 1 }))} · ${t('pgNext', { when })}`;
    }
    const confirm = ui.confirm === it.id;
    return `<li class="item${it.gone ? ' gone' : ''}" data-id="${esc(it.id)}">
      <div class="row1"><a class="t" href="${esc(NB.watchUrl(it))}" target="_blank" rel="noopener">${fmt(it.start)}</a>${text}
        <button class="link" data-act="show">${esc(t(shown ? 'pgHideText' : 'pgShowText'))}</button></div>
      <div class="row2"><div>${answer}</div>${missed}</div>
      <div class="row3"><span class="sched">${sched}</span><span class="grow"></span>
        ${it.gone ? '' : `<button class="btn sm" data-act="review-one">${esc(t('pgReviewOne'))}</button>
        <a class="btn sm" href="${esc(NB.watchUrl(it))}" target="_blank" rel="noopener">${esc(t('pgOpenVideo'))}</a>`}
        <button class="btn sm danger" data-act="remove">${esc(t(confirm ? 'pgRemoveConfirm' : 'pgRemove'))}</button></div>
    </li>`;
  }

  function wordsHtml() {
    const idx = NB.missedIndex(items);
    if (!idx.length) return `<p class="empty">${esc(t('pgWordsEmpty'))}</p>`;
    return `<p class="hint">${esc(t('pgWordHint'))}</p><div class="words">${idx.map(([w, ids]) =>
      `<button class="word" data-act="word" data-w="${esc(w)}">${esc(w)}<b>${ids.length}</b></button>`).join('')}</div>`;
  }

  function render() {
    const now = Date.now();
    const st = NB.stats(items, now);
    document.title = `${t('pgTitle')} · Listen Loop`;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

    // next batch when nothing is due today
    let nextDue = '';
    if (!st.due) {
      const upcoming = Object.values(items).filter((it) => !it.mastered && !it.gone && it.due != null);
      if (upcoming.length) {
        const first = Math.min(...upcoming.map((it) => it.due));
        const n = upcoming.filter((it) => it.due === first).length;
        nextDue = `<div class="nothing">${esc(t('pgNextDue', { when: whenText(first - NB.dayIndex(now)), n }))}</div>`;
      }
    }

    const tabs = [['due', st.due], ['all', st.total], ['mastered', st.mastered], ['words', null]];
    let body;
    if (!st.total) body = `<p class="empty">${esc(t('pgEmpty'))}</p>`;
    else if (ui.tab === 'words') body = wordsHtml();
    else {
      const list = listFor(ui.tab, now);
      const filter = ui.tab === 'all' && ui.word
        ? `<div class="filter"><span>${esc(t('pgFilter', { w: ui.word }))}</span><button class="link" data-act="clear-word">${esc(t('pgClearFilter'))}</button></div>` : '';
      body = filter + (list.length ? groups(list, ui.tab === 'due').map((g) => `
        <section class="group"><h3><a href="${esc(videoUrl(g[0].videoId))}" target="_blank" rel="noopener" title="${esc(g[0].title)}">${esc(g[0].title || g[0].videoId)}</a>
          <span class="n">${esc(t('pgCount', { n: g.length }))}</span></h3>
          <ul class="items">${g.map((it) => itemHtml(it, now)).join('')}</ul></section>`).join('')
        : `<p class="empty">${esc(t('pgEmptyTab'))}</p>`);
    }

    app.innerHTML = `
      <header class="top">
        <div class="brand"><span class="dot"></span>Listen Loop <span class="sub">${esc(t('pgTitle'))}</span></div>
        <div class="tools">
          <button class="btn sm" data-act="export"${st.total ? '' : ' disabled'}>${esc(t('pgExport'))}</button>
          <button class="btn sm" data-act="import">${esc(t('pgImport'))}</button>
          <button class="btn sm" data-act="feedback">${esc(t('pgFeedback'))}</button>
        </div>
      </header>
      <section class="hero">
        <div class="stats"><b>${esc(t('pgStats', st))}</b></div>
        ${st.due ? `<button class="btn primary big" data-act="start">${esc(t('pgStart', { n: st.due }))}</button>`
          : `<div><div class="nothing">${esc(t('pgNothingDue'))}</div>${nextDue}</div>`}
        ${st.gone ? `<div class="clean"><button class="link" data-act="clean-gone">${esc(t('pgCleanGone', { n: st.gone }))}</button></div>` : ''}
      </section>
      <nav class="tabs">${tabs.map(([k, n]) => `<button class="tab${ui.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${esc(t('tab' + k[0].toUpperCase() + k.slice(1)))}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</nav>
      ${body}`;
  }

  // -------------------------------------------------------------- actions
  async function startReview(ids) {
    if (!ids.length) return;
    await NB.store.setSession(NB.newSession(ids, Date.now()));
    location.href = NB.watchUrl(items[ids[0]]);
  }

  async function remove(id) {
    if (ui.confirm !== id) { // two clicks: the first one asks
      ui.confirm = id;
      clearTimeout(ui.confirmTimer);
      ui.confirmTimer = setTimeout(() => { ui.confirm = null; render(); }, 3000);
      render();
      return;
    }
    ui.confirm = null;
    await NB.store.update((all) => { delete all[id]; });
  }

  function exportBackup() {
    const data = NB.exportData(items, Date.now());
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `listen-loop-notebook-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (_) { data = null; }
    const res = data ? await NB.store.update((all) => NB.mergeImport(all, data)) : { ok: false };
    toast(res.ok ? t('pgImported', res) : t('pgImportBad'));
  }

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const li = b.closest('[data-id]');
    const id = li && li.dataset.id;
    switch (b.dataset.act) {
      case 'start': startReview(NB.buildQueue(items, Date.now())); break;
      case 'review-one': startReview([id]); break;
      case 'show': if (ui.shown.has(id)) ui.shown.delete(id); else ui.shown.add(id); render(); break;
      case 'remove': remove(id); break;
      case 'tab': ui.tab = b.dataset.tab; render(); break;
      case 'word': ui.word = b.dataset.w; ui.tab = 'all'; render(); break;
      case 'clear-word': ui.word = null; render(); break;
      case 'clean-gone': NB.store.update((all) => { for (const k of Object.keys(all)) if (all[k].gone) delete all[k]; }); break;
      case 'export': exportBackup(); break;
      case 'import': fileInput.value = ''; fileInput.click(); break;
      case 'feedback': {
        const st = NB.stats(items, Date.now());
        const lines = FB.baseLines(lang).concat([`page notebook · ${st.total} items · due ${st.due} · mastered ${st.mastered} · unavailable ${st.gone}`]);
        window.open(FB.formUrl({ lines }), '_blank', 'noopener');
        break;
      }
      default: break;
    }
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) importBackup(fileInput.files[0]); });

  async function load() {
    items = await NB.store.load();
    render();
  }

  async function init() {
    let settings = {};
    try { settings = (await chrome.storage.local.get('ll:settings'))['ll:settings'] || {}; } catch (_) { /* ignore */ }
    lang = settings.lang === 'zh' || settings.lang === 'en' ? settings.lang : I18N.detect();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch[NB.KEY]) load();
      if (ch['ll:settings']) {
        const s = ch['ll:settings'].newValue || {};
        const next = s.lang === 'zh' || s.lang === 'en' ? s.lang : I18N.detect();
        if (next !== lang) { lang = next; render(); }
      }
    });
    // the day can roll over while the page stays open
    let day = NB.dayIndex(Date.now());
    setInterval(() => {
      const d = NB.dayIndex(Date.now());
      if (d !== day) { day = d; render(); }
    }, 60 * 1000);
    await load();
  }

  init();
})();
