/*
 * Listen Loop — background service worker.
 * Opens the mistake notebook page: from the toolbar icon, or when the panel on a
 * YouTube page asks (content scripts can't open extension pages themselves).
 * Needs no extra permission: tabs.create / tabs.update with a URL don't require "tabs".
 */
const NOTEBOOK = 'notebook.html';

function openNotebook(tab, replace) {
  const url = chrome.runtime.getURL(NOTEBOOK);
  if (replace && tab && tab.id != null) return chrome.tabs.update(tab.id, { url });
  const opts = { url };
  if (tab && tab.index != null) opts.index = tab.index + 1;
  if (tab && tab.id != null) opts.openerTabId = tab.id;
  return chrome.tabs.create(opts);
}

chrome.action.onClicked.addListener((tab) => { openNotebook(tab, false); });

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'open-notebook') openNotebook(sender.tab, !!msg.replace);
});
