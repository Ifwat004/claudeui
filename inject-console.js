/* ==========================================================================
   inject-console.js — paste-into-DevTools theme for the Claude desktop app.

   MIDNIGHT VIOLET: pure-black canvas, deep-violet side panels, violet accent.

   Paste into the desktop app's DevTools console:
     dev menu -> Show Dev Tools (Alt+Ctrl+I) -> Console -> paste -> Enter
   If it warns about pasting, type  allow pasting  and Enter first.
   Re-paste after a full app restart (console state is wiped on relaunch).

   Everything here was read live from the running Claude UI and verified on
   screen — not guessed. What it took to learn:
     - Canvas is --df-bg-page / --cds-surface-0,1 (hex), NOT legacy --bg-*.
     - Legacy --bg-* / --accent-* are HSL TRIPLETS ("H S% L%"). Hex fails.
     - The left sidebar is <aside class="dframe-sidebar"> and DERIVES its
       colour from the page bg, so it must be painted directly.
     - The Cowork right panel only exists in the desktop build, so it is
       located by GEOMETRY (tall element on the right edge) and painted
       by the JS below — immune to class-name changes.

   Remove in-session:
     clearInterval(globalThis.__themeGuard);
     document.getElementById('custom-claude-theme')?.remove();
   ========================================================================== */

(() => {
  const CANVAS  = '#000000';   // main page
  const PANEL   = '#0e0a1c';   // left sidebar + right panel  (deep violet)
  const CARD    = '#100c1f';   // cards, composer, panels     (violet)
  const POPOVER = '#17122b';   // menus, popovers, tooltips

  const css = String.raw`
:root {
  --t-ground:   ${CANVAS};
  --t-surface:  ${CARD};
  --t-raised:   ${POPOVER};
  --t-hairline: #1c1730;
  --t-border:   #2a2340;
  --t-border-hi:#3d3560;
  --t-text:     #f0efec;
  --t-muted:    #c3c2b7;
  --t-faint:    #898781;
  --t-accent:   #a78bfa;
  --t-accent-lo:#7c5cff;
  --t-accent-2: #f0abfc;
  --t-radius:   10px;
  --t-radius-sm:6px;
  --t-wash:     color-mix(in srgb, #a78bfa 14%, transparent);
  --t-wash-soft:color-mix(in srgb, #a78bfa 7%, transparent);
  color-scheme: dark;
}

/* ---- REAL token overrides (verified live) ------------------------------- */
:root, html, body, .dark, [data-mode='dark'], [data-theme='dark'],
[class*='dframe'], .dframe-sidebar, .dframe-content, aside, main {
  /* canvas */
  --df-bg-page: ${CANVAS};
  --df-bg-page-inset: ${CANVAS};
  --cds-surface-0: ${CANVAS};
  --cds-surface-1: ${CANVAS};

  /* violet surfaces */
  --cds-surface-2: ${CARD};
  --cds-surface-3: ${POPOVER};
  --cds-surface-panel:   ${CARD};
  --cds-surface-popover: ${POPOVER};
  --df-web-sidebar-bg: ${PANEL};
  --df-sidebar-bg: ${PANEL};

  /* desktop-frame elevation ramp: HSL triplets, violet hue */
  --df-z0: 255 40% 4%;  --df-z1: 255 40% 8%;  --df-z2: 255 40% 11%;
  --df-z3: 255 35% 14%; --df-z4: 255 30% 18%; --df-z5: 255 25% 30%; --df-z6: 255 20% 60%;
  --df-hover: hsl(255 85% 78% / 10%);

  /* legacy bg triplets (backup) */
  --bg-000: 0 0% 0%;  --bg-100: 0 0% 0%;
  --bg-200: 255 40% 6%; --bg-300: 255 40% 8%; --bg-400: 255 40% 10%; --bg-500: 255 40% 10%;

  /* accent: blue -> violet */
  --cds-fill-accent:       #7c5cff;
  --cds-fill-accent-hover: #8b6df5;
  --cds-text-accent:       #a78bfa;
  --cds-border-accent:     #3a2f78;
  --cds-bg-accent:         #160f38;
  --cds-bg-accent-chip:    #160f38;
  --cds-bg-accent-muted:   color-mix(in srgb, #7c5cff 12%, transparent);
  --cds-on-accent:         #ffffff;
  --accent-000: 255 92% 82%; --accent-100: 255 91% 76%; --accent-200: 255 85% 70%;
}

/* ---- side panels painted directly (they derive from page bg otherwise) --- */
.dframe-sidebar,
aside[class*='dframe'],
[class*='dframe-'][class*='panel'],
[class*='dframe-'][class*='aside'],
[class*='dframe-'][class*='right'],
[class*='dframe-'][class*='detail'],
[class*='dframe-'][class*='inspector'],
[class*='dframe-'][class*='secondary'] {
  background-color: ${PANEL} !important;
}
[data-theme-right-panel] { background-color: ${PANEL} !important; }

/* ---- structural polish -------------------------------------------------- */
html, body { background-color: var(--t-ground) !important; }
[class*='shadow'], [style*='box-shadow'] { box-shadow: none !important; }
::selection { background-color: color-mix(in srgb, var(--t-accent) 38%, transparent); color: var(--t-text); }
* { scrollbar-width: thin; scrollbar-color: var(--t-border) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--t-border); border: 3px solid transparent; background-clip: content-box; border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: var(--t-accent-lo); background-clip: content-box; }
::-webkit-scrollbar-corner { background: transparent; }
:focus-visible { outline: 2px solid var(--t-accent) !important; outline-offset: 2px !important; border-radius: var(--t-radius-sm); }
pre, code, kbd, samp { font-family: 'JetBrains Mono','Cascadia Code','SF Mono',ui-monospace,Consolas,Menlo,monospace; font-size: 0.875em; }
pre { background-color: var(--t-surface) !important; border: 1px solid var(--t-border) !important; border-radius: var(--t-radius) !important; }
:not(pre) > code { background-color: var(--t-raised); color: var(--t-accent); border: 1px solid var(--t-hairline); padding: 0.1em 0.38em; border-radius: var(--t-radius-sm); }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--t-border) !important; }
tbody tr:hover { background-color: var(--t-wash-soft); }
blockquote { border-left: 2px solid var(--t-accent) !important; background: var(--t-wash-soft); color: var(--t-muted); border-radius: 0 var(--t-radius-sm) var(--t-radius-sm) 0; }
hr { border-color: var(--t-border) !important; }
img, video, canvas { border-radius: var(--t-radius-sm); }
`;

  const id = 'custom-claude-theme';

  const applyCss = () => {
    if (!document.documentElement) return false;
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.documentElement.appendChild(el); }
    if (el.textContent !== css) el.textContent = css;
    if (el.nextSibling) document.documentElement.appendChild(el);
    return true;
  };

  // Locate right-hand side panels by geometry and tag them so the CSS above
  // paints them. Works no matter what class the panel has.
  const tagRightPanels = () => {
    const W = innerWidth, H = innerHeight;
    const els = document.querySelectorAll('aside, div, section, nav');
    for (const e of els) {
      if (e.hasAttribute('data-theme-right-panel')) continue;
      const r = e.getBoundingClientRect();
      if (r.right > W - 30 && r.left > W * 0.55 && r.width > 180 && r.width < 600 && r.height > H * 0.5) {
        const bg = getComputedStyle(e).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          e.setAttribute('data-theme-right-panel', '');
        }
      }
    }
  };

  const tick = () => { applyCss(); tagRightPanels(); };
  tick();
  clearInterval(globalThis.__themeGuard);
  globalThis.__themeGuard = setInterval(tick, 1000);
  console.log('%c[claude-midnight] applied — black canvas, violet panels + accent', 'color:#a78bfa;font-weight:bold');
})();
