/*
 * Listen Loop — UI strings (Chinese / English).
 * Chinese when the browser's UI language or first preferred language is Chinese
 * (zh-CN, zh-TW, zh-HK …), English otherwise; the learner can override it in ⚙.
 * Placeholders: {name}. Values may contain markup (they are our own strings).
 */
(function (root) {
  'use strict';

  const zh = {
    settings: '设置',
    collapse: '收起 / 展开',
    lead: '把这个视频切成一句一句：单句循环听，打出来，逐词核对。',
    start: '开始精听',
    loading: '正在读取字幕…',
    retry: '重试',

    adjToggle: '✂ 调整',
    adjToggleTitle: '这句切得不准？调起止点 / 合并 / 拆开',
    adjStart: '开头',
    adjEnd: '结尾',
    startEarlier: '开头提前 0.1 秒',
    startLater: '开头推后 0.1 秒',
    endEarlier: '结尾提前 0.1 秒',
    endLater: '结尾推后 0.1 秒',
    joinNext: '合并下一句',
    joinNextTitle: '把下一句并进来',
    split: '拆开',
    splitTitle: '拆回合并前的几句',
    adjReset: '还原起止点',
    adjTip: '每点一下移 0.1 秒，并试听这句的开头或结尾 2 秒。只对本视频生效，自动保存。',

    prevTitle: '上一句 (Alt+←)',
    replay: '⟲ 重播',
    replayTitle: '重播 (Tab)',
    nextTitle: '下一句 (Alt+→)',
    speed: '速度',
    loops: '遍数',
    placeholder: '把听到的打出来 · Enter 检查 · Tab 重播',
    hint: '提示首字母',
    trans: '译文',
    reveal: '看原文',
    check: '检查 ⏎',

    gap: '每遍间隔',
    seconds: '{n} 秒',
    ignoreFillers: '检查时忽略 uh / um 等语气词',
    listText: '句子列表直接显示原文',
    autoStart: '打开视频时自动加载字幕',
    mask: '遮挡画面里烧录的字幕',
    maskHeight: '遮挡高度',
    maskBottom: '离底部',
    langAuto: '自动（跟随浏览器）',
    ytcc: '开 / 关 YouTube 字幕',
    resetVideo: '清除本视频记录',
    resetConfirm: '再点一次确认清除',
    missedCap: '最常听错的词（首次作答统计）',
    missedNone: '还没有记录',
    keys: '<kbd>Tab</kbd> 重播 · <kbd>Enter</kbd> 检查 / 下一句 · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> 上/下一句 · ' +
      '<kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> 调速 · <kbd>Alt</kbd>+<kbd>R</kbd> 重播 · <kbd>Alt</kbd>+<kbd>H</kbd> 提示 · ' +
      '<kbd>Alt</kbd>+<kbd>T</kbd> 译文 · <kbd>Alt</kbd>+<kbd>A</kbd> 原文',

    transLabel: '中文意思',
    transLoading: '正在翻译…',
    transDownloading: '第一次使用，Chrome 正在下载翻译模型… {pct}%',
    transUnsupported: '这个浏览器没有内置翻译功能（需要 Chrome 138 或更新版本）。',
    transFailed: '翻译失败，再按一次试试。',

    toastSpeed: '速度 {r}x',
    typeFirst: '先把听到的内容打出来',
    cleared: '已清除',
    atVideoStart: '已经是视频开头',
    tooShort: '再短就没了',
    joined: '已合并',
    splitInto: '已拆成 {n} 句',

    'err:no-captions': '这个视频没有字幕，暂时用不了。',
    'err:no-english': '这个视频没有英文字幕。',
    'err:player-not-ready': '播放器还没准备好（可能正在播广告），稍后点重试。',
    'err:fetch-failed': '字幕读取失败。刷新页面后再试一次。',
    'err:timeout': '读取字幕超时。刷新页面后再试一次。',
    'err:empty': '字幕是空的，没法切句。',
    'err:other': '出错了：{code}',
    available: '（现有字幕：{list}）',
    listSep: '、',

    done: '已完成 {d} / {n}',
    sentNo: '第 {i} / {n} 句',
    summary: '全部句子 · 共 {n} 句 · {kind}',
    autoCaps: '自动生成字幕',
    manualCaps: '人工字幕',
    nWords: '{n} 词',

    stPreview: '▶ 试听',
    stPreviewDone: '试听完 · Tab 完整播放',
    stPaused: '已暂停 · Tab 重播',
    stPlaying: '▶ 第 {k}/{tot} 遍',
    stGap: '⏸ 已听 {k}/{tot}',
    stDone: '听了 {k} 遍 · Tab 再听',
    stAd: '等广告结束…',

    perfect: '<b>✓ 全对</b> · 按 Enter 进入下一句',
    scoreLine: '<b>{pct}%</b> · 第 {n} 次 · 改完按 Enter 再检查，不改直接 Enter 下一句',
    lgOk: '绿 对',
    lgNear: '橙 差一点',
    lgWrong: '红 错',
    lgMissing: '虚线 漏听',
    lgExtra: '淡红 多打',
    answer: '原文',
    flagOn: '⚑ 已标记为字幕有误（点击取消）',
    flagOff: '⚑ 字幕本身可能有误？',
    extraTitle: '多打的',
    typedTitle: '你打的',
    missingTitle: '漏听',
  };

  const en = {
    settings: 'Settings',
    collapse: 'Collapse / expand',
    lead: 'Split this video into sentences: loop one, type what you hear, check it word by word.',
    start: 'Start practice',
    loading: 'Loading captions…',
    retry: 'Retry',

    adjToggle: '✂ Adjust',
    adjToggleTitle: 'Sentence cut in the wrong place? Move its start/end, join or split',
    adjStart: 'Start',
    adjEnd: 'End',
    startEarlier: 'Start 0.1 s earlier',
    startLater: 'Start 0.1 s later',
    endEarlier: 'End 0.1 s earlier',
    endLater: 'End 0.1 s later',
    joinNext: 'Join next',
    joinNextTitle: 'Merge the next sentence into this one',
    split: 'Split',
    splitTitle: 'Split back into the original sentences',
    adjReset: 'Reset start/end',
    adjTip: 'Each click moves 0.1 s and previews the first or last 2 s. Saved automatically, for this video only.',

    prevTitle: 'Previous (Alt+←)',
    replay: '⟲ Replay',
    replayTitle: 'Replay (Tab)',
    nextTitle: 'Next (Alt+→)',
    speed: 'Speed',
    loops: 'Loops',
    placeholder: 'Type what you hear · Enter to check · Tab to replay',
    hint: 'Hint',
    trans: 'Translate',
    reveal: 'Show answer',
    check: 'Check ⏎',

    gap: 'Pause between loops',
    seconds: '{n} s',
    ignoreFillers: 'Ignore fillers (uh, um …) when checking',
    listText: 'Show sentence text in the list',
    autoStart: 'Load captions automatically',
    mask: 'Cover burned-in subtitles',
    maskHeight: 'Height',
    maskBottom: 'From bottom',
    langAuto: 'Auto (browser language)',
    ytcc: 'Toggle YouTube captions',
    resetVideo: 'Clear progress for this video',
    resetConfirm: 'Click again to confirm',
    missedCap: 'Most-missed words (first attempts)',
    missedNone: 'Nothing yet',
    keys: '<kbd>Tab</kbd> replay · <kbd>Enter</kbd> check / next · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> prev / next · ' +
      '<kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> speed · <kbd>Alt</kbd>+<kbd>R</kbd> replay · <kbd>Alt</kbd>+<kbd>H</kbd> hint · ' +
      '<kbd>Alt</kbd>+<kbd>T</kbd> translate · <kbd>Alt</kbd>+<kbd>A</kbd> answer',

    transLabel: 'Meaning',
    transLoading: 'Translating…',
    transDownloading: 'First use: Chrome is downloading its translation model… {pct}%',
    transUnsupported: 'This browser has no built-in translator (Chrome 138 or newer is needed).',
    transFailed: 'Translation failed. Press again to retry.',

    toastSpeed: 'Speed {r}x',
    typeFirst: 'Type what you hear first',
    cleared: 'Cleared',
    atVideoStart: 'Already at the start of the video',
    tooShort: "Can't get any shorter",
    joined: 'Joined',
    splitInto: 'Split into {n} sentences',

    'err:no-captions': "This video has no captions, so it can't be used yet.",
    'err:no-english': 'This video has no English captions.',
    'err:player-not-ready': "The player isn't ready (maybe an ad is playing). Try again in a moment.",
    'err:fetch-failed': "Couldn't load the captions. Refresh the page and try again.",
    'err:timeout': 'Loading the captions timed out. Refresh the page and try again.',
    'err:empty': 'The captions are empty.',
    'err:other': 'Something went wrong: {code}',
    available: ' (available: {list})',
    listSep: ', ',

    done: 'Done {d} / {n}',
    sentNo: 'Sentence {i} / {n}',
    summary: 'All sentences · {n} · {kind}',
    autoCaps: 'auto-generated captions',
    manualCaps: 'human-made captions',
    nWords: '{n} words',

    stPreview: '▶ Preview',
    stPreviewDone: 'Preview done · Tab for the whole sentence',
    stPaused: 'Paused · Tab to replay',
    stPlaying: '▶ Loop {k}/{tot}',
    stGap: '⏸ Heard {k}/{tot}',
    stDone: 'Played {k}× · Tab to replay',
    stAd: 'Waiting for the ad…',

    perfect: '<b>✓ All correct</b> · Enter for the next sentence',
    scoreLine: '<b>{pct}%</b> · attempt {n} · fix it and press Enter to recheck, or Enter again to move on',
    lgOk: 'green correct',
    lgNear: 'orange close',
    lgWrong: 'red wrong',
    lgMissing: 'dashed missed',
    lgExtra: 'faded extra',
    answer: 'Answer',
    flagOn: '⚑ Marked as a caption error (click to undo)',
    flagOff: '⚑ Caption itself wrong?',
    extraTitle: 'extra',
    typedTitle: 'you typed',
    missingTitle: 'missed',
  };

  /** 'zh' if the browser UI or the first preferred language is Chinese, else 'en'. */
  function detect() {
    const langs = [];
    try { if (root.chrome && chrome.i18n && chrome.i18n.getUILanguage) langs.push(chrome.i18n.getUILanguage()); } catch (_) { /* no extension context */ }
    if (typeof navigator !== 'undefined') {
      if (navigator.languages && navigator.languages.length) langs.push(navigator.languages[0]);
      langs.push(navigator.language);
    }
    return langs.some((l) => /^zh(\b|[-_])/i.test(l || '')) ? 'zh' : 'en';
  }

  const api = { dict: { zh, en }, detect };
  root.LLI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
