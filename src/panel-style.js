/* Listen Loop — panel styles (injected into the panel's shadow root).
 * YouTube no longer exposes its --yt-spec-* colour variables to the page, so the
 * panel carries its own light and dark palettes; content.js puts .dark on the
 * host whenever YouTube's <html dark> is set. */
window.LLPanelCSS = `
:host {
  display: block;
  margin: 0; /* the gap below is set inline by content.js (YouTube overrides :host margins) */
  font-family: "Roboto", "Arial", sans-serif;
  color: var(--ll-text);
  color-scheme: light;
  --ll-text: #0f0f0f;
  --ll-muted: #606060;
  --ll-bg: #ffffff;            /* panel surface */
  --ll-field: #ffffff;         /* text box */
  --ll-line: rgba(0,0,0,.1);
  --ll-chip: rgba(0,0,0,.05);
  --ll-chip-hover: rgba(0,0,0,.1);
  --ll-accent: #065fd4;
  --ll-primary: #0f0f0f;
  --ll-on-primary: #ffffff;
  --ll-ok: #1a7f37;
  --ll-near: #b35900;
  --ll-bad: #cf222e;
}
:host(.dark) {
  color-scheme: dark;
  --ll-text: #f1f1f1;
  --ll-muted: #aaaaaa;
  --ll-bg: #1c1c1c;
  --ll-field: #121212;
  --ll-line: rgba(255,255,255,.1);
  --ll-chip: rgba(255,255,255,.08);
  --ll-chip-hover: rgba(255,255,255,.15);
  --ll-accent: #3ea6ff;
  --ll-primary: #f1f1f1;
  --ll-on-primary: #0f0f0f;
  --ll-ok: #3fb950;
  --ll-near: #f0a35c;
  --ll-bad: #ff6b6b;
}
:host(.floating) {
  position: fixed; right: 16px; bottom: 16px; width: 400px; z-index: 2100;
  box-shadow: 0 8px 28px rgba(0,0,0,.25); border-radius: 12px;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.panel {
  border: 1px solid var(--ll-line); border-radius: 12px; background: var(--ll-bg);
  overflow: hidden; font-size: 14px; line-height: 1.5;
}
.hdr { display: flex; align-items: center; gap: 6px; padding: 10px 12px 10px 20px; }
.panel:not(.collapsed) .hdr { border-bottom: 1px solid var(--ll-line); }
.nb-open {
  border: 0; background: var(--ll-chip); color: inherit; cursor: pointer; font: inherit; font-size: 12px;
  border-radius: 14px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.nb-open:hover { background: var(--ll-chip-hover); }
.nb-open .badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e5484d; color: #fff;
  font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
}
.brand { font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.brand .dot { width: 8px; height: 8px; border-radius: 50%; background: #e5484d; }
.hdr-info { flex: 1; text-align: right; font-size: 12px; color: var(--ll-muted); font-variant-numeric: tabular-nums; margin-right: 4px; }
.ib {
  border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 15px;
  width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
}
.ib:hover { background: var(--ll-chip); }
.panel.collapsed .body, .panel.collapsed .settings { display: none; }
.panel.collapsed [data-act="collapse"] { transform: rotate(180deg); }

.body { padding: 18px 20px 20px; }
.view { display: none; }
.panel[data-phase="idle"] .view-idle,
.panel[data-phase="loading"] .view-loading,
.panel[data-phase="error"] .view-error,
.panel[data-phase="ready"] .view-ready,
.panel[data-phase="review-done"] .view-review-done { display: block; }
/* review mode: only what reviewing needs */
.rv-bar { display: none; align-items: center; gap: 8px; margin: -4px 0 12px; font-size: 12px; color: var(--ll-muted); }
.panel.review .rv-bar { display: flex; }
.rv-src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.panel.review .adj-toggle, .panel.review .adjust, .panel.review .list,
.panel.review [data-act="prev"] { display: none !important; }
.resume {
  display: flex; align-items: center; gap: 8px; margin: 0 0 14px; padding: 10px 12px; border-radius: 10px;
  background: var(--ll-chip); font-size: 12px;
}
.resume[hidden] { display: none; }
.grade { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.glbl { font-size: 12px; color: var(--ll-muted); margin-right: 2px; }
.gbtn {
  font: inherit; font-size: 12px; border: 1px solid var(--ll-line); background: var(--ll-bg); color: inherit;
  border-radius: 14px; padding: 4px 12px; cursor: pointer;
}
.gbtn:hover { background: var(--ll-chip-hover); }
.gbtn.on.again { background: var(--ll-bad); border-color: var(--ll-bad); color: #fff; }
.gbtn.on.fuzzy { background: var(--ll-near); border-color: var(--ll-near); color: #fff; }
.gbtn.on.good { background: var(--ll-ok); border-color: var(--ll-ok); color: #fff; }
.gnext { margin-top: 8px; font-size: 12px; color: var(--ll-muted); }
.done-title { margin: 4px 0 6px; font-size: 16px; font-weight: 600; }
.done-sum { margin: 0 0 16px; color: var(--ll-muted); font-size: 13px; }
.done-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.nb-star { font-size: 18px; color: var(--ll-muted); }
.nb-star.on { color: #e8a317; }
.nb-link.on { color: #c98a10; }
.lead { margin: 0 0 16px; color: var(--ll-muted); font-size: 13px; line-height: 1.6; }
.view-loading { color: var(--ll-muted); font-size: 13px; padding: 4px 0; }
.err { margin: 0 0 14px; color: var(--ll-bad); font-size: 13px; line-height: 1.6; }

.btn {
  font: inherit; font-size: 13px; font-weight: 500; border: 0; border-radius: 18px;
  padding: 8px 16px; background: var(--ll-chip); color: inherit; cursor: pointer; white-space: nowrap;
}
.btn:hover { background: var(--ll-chip-hover); }
.btn.primary { background: var(--ll-primary); color: var(--ll-on-primary); }
.btn.primary:hover { opacity: .88; }
.btn.sm { padding: 6px 14px; font-size: 12px; }
.btn.wide { width: 100%; padding: 10px 16px; }
.btn.danger { color: var(--ll-bad); }
.btn:disabled { opacity: .4; cursor: default; }
.btn:disabled:hover { background: var(--ll-chip); }
.btn:focus-visible, .ib:focus-visible, select:focus-visible { outline: 2px solid var(--ll-accent); outline-offset: 1px; }
.link {
  border: 0; background: none; padding: 0; font: inherit; font-size: 12px;
  color: var(--ll-muted); cursor: pointer;
}
.link:hover { color: inherit; text-decoration: underline; }

.meta { display: flex; gap: 12px; align-items: baseline; font-size: 12px; color: var(--ll-muted); margin-bottom: 14px; font-variant-numeric: tabular-nums; }
.sent-no { font-weight: 600; font-size: 14px; color: var(--ll-text); }
.loop-status { margin-left: auto; color: var(--ll-accent); }
.adj-toggle.on { color: var(--ll-accent); }
.adjust {
  margin: -4px 0 16px; padding: 12px 14px; border-radius: 10px; background: var(--ll-chip); font-size: 12px;
}
.adj-edges { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.adj-edge { display: inline-flex; align-items: center; gap: 6px; }
.adj-lbl { color: var(--ll-muted); margin-right: 2px; }
.adj-val { min-width: 76px; text-align: center; font-variant-numeric: tabular-nums; }
.adj-val i { font-style: normal; color: var(--ll-accent); }
.adjust .btn.sm { padding: 4px 10px; background: var(--ll-bg); }
.adjust .btn.sm:hover { background: var(--ll-chip-hover); }
.adj-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.adj-tip { margin-top: 10px; color: var(--ll-muted); font-size: 11px; line-height: 1.6; }

.controls { display: flex; flex-wrap: wrap; gap: 10px 6px; align-items: center; margin-bottom: 16px; }
.controls > .btn { padding: 8px 14px; }
.sels { display: flex; gap: 10px; margin-left: auto; } /* wraps as one unit, right-aligned */
.sel { font-size: 12px; color: var(--ll-muted); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
select {
  font: inherit; font-size: 12px; background: var(--ll-chip); color: var(--ll-text);
  border: 0; border-radius: 8px; padding: 5px 6px; cursor: pointer;
}
select option { background: var(--ll-bg); color: var(--ll-text); }

.input {
  display: block; width: 100%; resize: vertical; min-height: 88px;
  font: 16px/1.55 "Roboto", "Arial", sans-serif; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--ll-line); background: var(--ll-field); color: inherit; outline: none;
}
.input:focus { border-color: var(--ll-accent); box-shadow: 0 0 0 1px var(--ll-accent); }
.input::placeholder { color: var(--ll-muted); }
.actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.grow { flex: 1; }

.hint {
  margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--ll-chip);
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 14px; line-height: 1.7;
  color: var(--ll-muted); word-break: break-word; white-space: pre-wrap;
}
.trans { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--ll-chip); }
.trans .lbl { font-size: 11px; color: var(--ll-muted); margin-bottom: 4px; }
.trans .tx { font-size: 15px; line-height: 1.7; word-break: break-word; }
.trans.pending .tx { color: var(--ll-muted); font-size: 13px; }
.trans.err .tx { color: var(--ll-bad); font-size: 13px; }
.result { margin-top: 14px; padding: 14px 16px; border-radius: 10px; background: var(--ll-chip); }
.score { font-size: 12px; color: var(--ll-muted); margin-bottom: 6px; line-height: 1.6; }
.score b { color: var(--ll-text); font-size: 13px; }
.score.perfect b { color: var(--ll-ok); }
.words { font-size: 16px; line-height: 1.9; word-break: break-word; }
.w.ok { color: var(--ll-ok); }
.w.near { color: var(--ll-near); font-weight: 500; }
.w.wrong { color: var(--ll-bad); font-weight: 500; }
.w.missing { color: var(--ll-bad); opacity: .75; text-decoration: underline dashed; text-underline-offset: 4px; }
.w.filler { color: var(--ll-muted); font-style: italic; opacity: .7; }
.w.punct { color: var(--ll-muted); }
.typed { font-size: 12px; color: var(--ll-muted); text-decoration: line-through; margin-right: 3px; }
.extra { color: var(--ll-bad); opacity: .65; font-size: 14px; }
.legend { margin-top: 10px; font-size: 11px; color: var(--ll-muted); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.legend i { font-style: normal; }
.legend .extra { font-size: inherit; }
.res-foot { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
.toast { font-size: 12px; color: var(--ll-near); min-height: 0; }
.toast:not(:empty) { margin-top: 10px; }

.list { margin-top: 18px; border-top: 1px solid var(--ll-line); padding-top: 14px; }
.list summary { cursor: pointer; font-size: 12px; color: var(--ll-muted); user-select: none; }
.items { position: relative; list-style: none; margin: 10px 0 0; padding: 0; max-height: 280px; overflow: auto; }
.items li {
  display: grid; grid-template-columns: 28px 40px 1fr auto; gap: 8px; align-items: baseline;
  padding: 6px 10px; border-radius: 8px; cursor: pointer; font-size: 12px;
}
.items li:hover { background: var(--ll-chip); }
.items li.cur { background: var(--ll-chip-hover); }
.items .n, .items .t { color: var(--ll-muted); font-variant-numeric: tabular-nums; }
.items .tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.items .masked { color: var(--ll-muted); letter-spacing: 1px; }
.items .st { font-size: 11px; color: var(--ll-muted); font-variant-numeric: tabular-nums; }
.items li.correct .st { color: var(--ll-ok); }
.items li.flagged .st { color: var(--ll-near); }

.settings { padding: 18px 20px 20px; border-top: 1px solid var(--ll-line); font-size: 13px; }
.settings h4 { margin: 0 0 12px; font-size: 14px; }
.row { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
.row > span:first-child { min-width: 72px; color: var(--ll-muted); font-size: 12px; }
.row.sub { padding-left: 26px; }
.row input[type="range"] { flex: 1; }
.row input[type="checkbox"] { margin: 0; }
.row label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.missed { margin-top: 18px; }
.missed .cap { font-size: 12px; color: var(--ll-muted); margin-bottom: 8px; }
.missed-list { display: flex; flex-wrap: wrap; gap: 6px; }
.missed-list span { background: var(--ll-chip); border-radius: 10px; padding: 3px 10px; font-size: 12px; }
.missed-list span b { color: var(--ll-bad); font-weight: 500; margin-left: 4px; }
.keys { margin-top: 18px; font-size: 11px; color: var(--ll-muted); line-height: 1.9; }
kbd {
  font: 11px ui-monospace, Menlo, monospace; border: 1px solid var(--ll-line);
  border-bottom-width: 2px; border-radius: 4px; padding: 0 4px;
}
.spinner {
  display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px;
  border: 2px solid var(--ll-line); border-top-color: var(--ll-accent); border-radius: 50%;
  animation: ll-spin .8s linear infinite;
}
@keyframes ll-spin { to { transform: rotate(360deg); } }
`;
