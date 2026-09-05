#!/usr/bin/env node
/**
 * inject.mjs - live CSS injector for the Claude desktop app.
 *
 * Talks to the app over the Chrome DevTools Protocol and pushes a stylesheet
 * into every renderer window. Nothing is written to disk inside the app, so
 * auto-updates don't clobber it and the code signature stays intact.
 *
 * Usage:
 *   1. Start Claude with:  --remote-debugging-port=9222
 *   2. node inject.mjs [path/to/theme.css]
 *
 * Saving the CSS file re-injects instantly. Ctrl+C to stop.
 */

import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9222);
const HOST = '127.0.0.1';
const CSS_PATH = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'claude-slate.css'));
const STYLE_ID = 'custom-claude-theme';
const DUMP_TOKENS = process.argv.includes('--dump-tokens');

if (typeof WebSocket === 'undefined') {
  console.error('Need Node 22+ (global WebSocket). You are on ' + process.version);
  process.exit(1);
}
if (!fs.existsSync(CSS_PATH)) {
  console.error('No CSS file at ' + CSS_PATH);
  process.exit(1);
}

const log = (...a) => console.log('  ' + a.join(' '));

/* ---------------------------------------------------------------- payload */

// Runs inside the page. Creates the style element, keeps re-asserting it in
// case React tears the tree down, and stays cheap when nothing has changed.
function buildPayload(css) {
  return `(() => {
    const css = ${JSON.stringify(css)};
    const id = ${JSON.stringify(STYLE_ID)};
    const apply = () => {
      if (!document.documentElement) return false;
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.documentElement.appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
      // keep it last so it wins on equal specificity
      if (el.nextSibling) document.documentElement.appendChild(el);
      return true;
    };
    if (!apply()) {
      const iv = setInterval(() => { if (apply()) clearInterval(iv); }, 10);
    }
    document.addEventListener('DOMContentLoaded', apply);
    clearInterval(globalThis.__themeGuard);
    globalThis.__themeGuard = setInterval(apply, 1000);
  })()`;
}

// Reads every custom property actually defined on :root, so you can theme
// against the real token names instead of guessing at them.
const DUMP_SCRIPT = `(() => {
  const out = {};
  const cs = getComputedStyle(document.documentElement);
  for (const name of Array.from(cs)) {
    if (name.startsWith('--')) out[name] = cs.getPropertyValue(name).trim();
  }
  if (!Object.keys(out).length) {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules || []) {
        if (!rule.style || !/:root|^html$/.test(rule.selectorText || '')) continue;
        for (const name of rule.style) {
          if (name.startsWith('--')) out[name] = rule.style.getPropertyValue(name).trim();
        }
      }
    }
  }
  return JSON.stringify(out);
})()`;

/* -------------------------------------------------------------- transport */

class Session {
  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.scriptId = null;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(this));
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(method + ' timed out'));
      }, 10000);
    });
  }

  get open() {
    return this.ws.readyState === WebSocket.OPEN;
  }

  close() {
    try { this.ws.close(); } catch {}
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  // Register for future navigations, then apply to the live document.
  async push(css) {
    const source = buildPayload(css);
    if (this.scriptId) {
      await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.scriptId })
        .catch(() => {});
    }
    const res = await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    this.scriptId = res.identifier;
    await this.send('Runtime.evaluate', { expression: source, awaitPromise: false });
  }

  async dumpTokens() {
    const res = await this.send('Runtime.evaluate', {
      expression: DUMP_SCRIPT,
      returnByValue: true,
    });
    return JSON.parse(res.result.value || '{}');
  }
}

/* ------------------------------------------------------------------- main */

async function listTargets() {
  const res = await fetch(`http://${HOST}:${PORT}/json/list`);
  const all = await res.json();
  return all.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
}

const sessions = new Map();
let currentCss = fs.readFileSync(CSS_PATH, 'utf8');
let dumped = false;

async function sync() {
  let targets;
  try {
    targets = await listTargets();
  } catch {
    return; // app not up yet, or debug port not open
  }

  for (const [id, s] of sessions) {
    if (!s.open || !targets.some((t) => t.id === id)) {
      s.close();
      sessions.delete(id);
    }
  }

  for (const target of targets) {
    if (sessions.has(target.id)) continue;
    try {
      const s = await new Session(target).ready;
      await s.init();
      await s.push(currentCss);
      sessions.set(target.id, s);
      log('attached  ' + (target.url || '').slice(0, 70));

      if (DUMP_TOKENS && !dumped) {
        dumped = true;
        const tokens = await s.dumpTokens();
        const names = Object.keys(tokens).sort();
        console.log(`\n  ${names.length} custom properties on :root\n`);
        for (const n of names) console.log(`    ${n}: ${tokens[n]}`);
        console.log('');
      }
    } catch (err) {
      log('attach failed: ' + err.message);
    }
  }
}

async function reload() {
  try {
    currentCss = fs.readFileSync(CSS_PATH, 'utf8');
  } catch {
    return;
  }
  for (const s of sessions.values()) {
    if (s.open) await s.push(currentCss).catch(() => {});
  }
  log('reloaded  ' + new Date().toLocaleTimeString());
}

console.log(`\n  theme  ${CSS_PATH}`);
console.log(`  cdp    ${HOST}:${PORT}\n`);

await sync();
if (!sessions.size) {
  log('nothing attached yet. is Claude running with --remote-debugging-port=' + PORT + '?');
}

setInterval(sync, 2000);

let debounce;
fs.watch(CSS_PATH, () => {
  clearTimeout(debounce);
  debounce = setTimeout(reload, 120);
});

process.on('SIGINT', () => {
  for (const s of sessions.values()) s.close();
  console.log('\n  stopped\n');
  process.exit(0);
});
