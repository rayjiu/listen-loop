/*
 * Listen Loop — feedback form link.
 * Feedback goes to a Feishu (Lark) Base form that anyone can fill in without
 * logging in. The extension only opens the form; it sends nothing by itself.
 * "Type" and "Diagnostics" are pre-filled through `prefill_<question title>=`
 * parameters, so the learner sees (and can edit) everything before submitting.
 *
 * The keys below must match the question titles in the form exactly — if a
 * question is renamed in Feishu, update FIELD or pre-filling silently stops.
 */
(function (root) {
  'use strict';

  const FORM_URL = 'https://kil5372lmm.feishu.cn/share/base/form/shrcnn19XwOWed9x9NWZ0C1Io6i';
  const FIELD = {
    type: '类型 / Type',
    diag: '诊断信息（插件自动填写）/ Diagnostics (filled in automatically)',
  };
  const TYPE = { bug: '问题 / Bug', idea: '建议 / Suggestion', other: '其他 / Other' };
  const MAX_DIAG = 1500; // keep the URL comfortably short

  function browserInfo() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const m = ua.match(/(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/);
    const name = m ? { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]] || m[1] : 'unknown';
    const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'other';
    return `${name} ${m ? m[2] : ''} · ${os}`.replace('  ', ' ');
  }

  /** Lines every report starts with: extension version, browser, languages, time. */
  function baseLines(uiLang) {
    let version = '?';
    try { version = chrome.runtime.getManifest().version; } catch (_) { /* not in an extension context */ }
    const langs = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]).slice(0, 3).join(',') : '';
    return [
      `Listen Loop ${version} · ${browserInfo()}`,
      `UI ${uiLang || '?'} · browser languages ${langs}`,
      `time ${new Date().toISOString()}`,
    ];
  }

  /** Form URL, optionally with the type picked and diagnostics filled in. */
  function formUrl(opts) {
    const o = opts || {};
    const enc = encodeURIComponent;
    const params = [];
    if (o.type && TYPE[o.type]) params.push(`prefill_${enc(FIELD.type)}=${enc(TYPE[o.type])}`);
    if (o.lines && o.lines.length) params.push(`prefill_${enc(FIELD.diag)}=${enc(o.lines.join('\n').slice(0, MAX_DIAG))}`);
    return FORM_URL + (params.length ? `?${params.join('&')}` : '');
  }

  const api = { FORM_URL, FIELD, TYPE, baseLines, formUrl, browserInfo };
  root.LLFeedback = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
