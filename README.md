# Claude desktop theme — midnight violet

Pure-black canvas, deep-violet side panels, violet accent. Applied to the
Claude desktop app through its built-in DevTools console.

**One file does everything: `inject-console.js`.** Everything else that used
to live in this folder was a dead end and has been removed. This README is
the record of *why*, so nobody (including future me) repeats it.

---

## How to use it

1. In Claude desktop, open the developer menu and choose **Show Dev Tools**
   (shortcut `Alt+Ctrl+I` — note *Alt*, not Shift).
2. Click the **Console** tab.
3. If it warns about pasting code, type `allow pasting` and press Enter.
   One-time Chromium safety prompt.
4. Open `inject-console.js`, select all, copy. Paste into the console, Enter.

You'll see `[claude-midnight] applied` in violet and the app recolours
instantly. You can close the DevTools panel afterward — the theme keeps
running.

**It does not survive a full app restart.** The console is wiped on relaunch.
Re-paste from the file. Ten seconds once it's muscle memory.

To remove it mid-session:

```js
clearInterval(globalThis.__themeGuard);
document.getElementById('custom-claude-theme')?.remove();
```

To change the colours, edit the four constants at the top of the file:

```js
const CANVAS  = '#000000';   // main page
const PANEL   = '#0e0a1c';   // left sidebar + right panel
const CARD    = '#100c1f';   // cards, composer, panels
const POPOVER = '#17122b';   // menus, popovers
```

---

## What was tried, in order, and why each one failed

This took most of a day. The short version: I kept guessing when I should
have been looking.

### 1. Finding `Claude.exe` — wrong install assumption

The original plan needed to launch Claude with a command-line flag, so the
first job was finding the executable. The old README pointed at
`%LOCALAPPDATA%\AnthropicClaude\Claude.exe`, which is where the standalone
installer puts it. That folder does not exist on this machine.

This PC has the **MSIX / Microsoft Store build**, which lives under
`C:\Program Files\WindowsApps\Claude_<version>_x64__pzs8sxrjxfjjc\app\`.
That directory is ACL-locked, and Store apps create no Start-menu `.lnk` to
right-click, so the "open file location" advice was also a dead end. Found it
with the Everything search tool in about ten seconds.

**Lesson:** there are two Windows builds in two different places. Check
which one you have before following any path in a tutorial.

### 2. `--remote-debugging-port` — the app refuses on purpose

The original design injected CSS over the Chrome DevTools Protocol by
launching Claude with `--remote-debugging-port=9222` and connecting a Node
script to it. Clean idea; nothing in the app bundle gets modified.

The app won't start that way:

```
Claude: refusing to start — a debugging or network-override switch is
present on the command line.
```

That is a deliberate guard, not a packaging accident. An open CDP port lets
*any* process on the machine drive the renderer and read the signed-in
session. Anthropic closed it. The check is in the app itself, so the
standalone build refuses identically — installing it would not have helped,
despite the script saying so at the time.

**Lesson:** when an app gives you a specific refusal message, believe the
message. I spent two attempts assuming MSIX was "dropping the flag" when the
app had told me plainly what it was doing.

### 3. Node.js — wasn't even installed

The injector needed Node 22+. Every `node.exe` on the disk was bundled
inside some other app (LM Studio, RStudio, Unity, ChatRTX). There was no
standalone Node and nothing on PATH. Fixed with
`winget install OpenJS.NodeJS.LTS`, but it didn't matter — see #2.

### 4. Stylus in the browser — works, but it's the wrong window

The stylesheet does apply to claude.ai through Stylus in Chrome. Same web
app, same tokens. But the goal was the *desktop* app, and Chrome blocks
extensions from installing or scripting other extensions, so I couldn't even
set it up hands-off. Dropped once the DevTools route appeared.

### 5. Guessing token names — wrong names *and* wrong format

For several rounds I overrode variables like `--bg-100` with hex values and
watched the background stay grey. Two separate mistakes stacked:

- **Wrong tokens.** The background is not driven by `--bg-*` at all. It's
  `--cds-surface-0/1` and `--df-bg-page`, in a separate design-system layer.
- **Wrong format.** The legacy `--bg-*` and `--accent-*` tokens hold raw
  **HSL triplets** — `0 0% 8.2353%` — consumed as `hsl(var(--bg-100))`.
  Feeding them `#000000` produced `hsl(#000000)`, which is invalid, so the
  browser silently discarded it and kept the default. Every override I wrote
  was doing nothing.

I also targeted a Tailwind class `bg-bg-100` that does not exist. The real
one is `bg-surface-1`.

**Lesson:** never theme against guessed variable names. Read them out of the
running app. `getComputedStyle(document.documentElement)` lists every custom
property with its actual value and format. That one call would have saved
three failed rounds.

### 6. The sidebar doesn't have its own colour

Once the canvas went black, the sidebar went black too instead of purple —
even with the sidebar variable overridden. It's `<aside class="dframe-sidebar">`,
and its colour is *derived* from the page background
(`color-mix(... page 80%, black)`). Set the page to black and the sidebar
follows. It has to be painted directly with a `background-color` rule.

### 7. The right panel only exists on desktop

The Cowork right panel (Progress / files / Context) isn't in the web app —
`claude.ai/cowork` redirects to a marketing page — so I couldn't inspect it.
Rather than guess a class name yet again, `inject-console.js` finds it by
**geometry**: any tall element hugging the right edge gets tagged and
painted, re-checked every second. Class names can change; the shape of a
side panel doesn't.

---

## Why the DevTools console is the answer

It's the only door that's actually open.

| Route | Result |
|---|---|
| `--remote-debugging-port` + injector | App refuses to start. Deliberate. |
| Patch `app.asar` | Breaks the code signature, wiped on next update. |
| Downgrade to a pre-guard build | Reopens a session-hijack hole; pins you to a stale app. |
| Stylus in a browser | Works, but themes the web app, not desktop. |
| **In-app DevTools console** | **Exposed by the app itself. No port, no network surface, nothing modified on disk.** |

The DevTools console is a *local* inspector. It is not the same mechanism as
the remote debugging port, which is why the launch guard doesn't touch it.
You're inspecting your own app on your own machine — which is exactly what
the developer menu is there for.

The one cost is that it's manual: re-paste after each restart. The `setInterval`
in the script keeps the theme alive across navigation *within* a session so
React can't tear it out, but nothing survives a relaunch. That's the price
of not tampering with the app, and it's a fair one.

---

## Real token reference

Read live from the running app. These are the names that actually do
something.

**Surfaces — CDS layer, hex values**

| Token | Default (dark) | Drives |
|---|---|---|
| `--cds-surface-0` | `#0b0b0b` | page |
| `--cds-surface-1` | `#151515` | `body` (`bg-surface-1`) |
| `--cds-surface-2` | `#1a1a19` | cards, panels |
| `--cds-surface-3` | `#20201f` | popovers |
| `--cds-surface-panel` | `#1a1a19` | alias of 2 |
| `--cds-surface-popover` | `#20201f` | alias of 3 |

**Desktop frame — scoped to the frame element, not `:root`**

| Token | Default | Notes |
|---|---|---|
| `--df-bg-page` | `hsl(from #151515 h s l)` | main content (`.dframe-content`) |
| `--df-web-sidebar-bg` | `color-mix(page 80%, black)` | derived — paint sidebar directly |
| `--df-z0` … `--df-z6` | HSL triplets, 3.9% → 65.1% | elevation ramp |
| `--df-hover` | `hsl(from #fff h s l / 7.5%)` | row hover |

**Legacy — HSL triplets (`H S% L%`), consumed via `hsl(var(...))`**

| Token | Default |
|---|---|
| `--bg-000` … `--bg-500` | `60 1.6% 12.4%` … `0 0% 4.3%` |
| `--accent-000/100/200` | blue, hue 212 |
| `--accent-pro-*` | violet, hue 246 |
| `--text-000/100` | `60 14.3% 97.3%` |
| `--always-black` / `--always-white` | `0 0% 0%` / `0 0% 100%` |

**Accent — CDS layer, hex**

| Token | Default |
|---|---|
| `--cds-fill-accent` / `-hover` | `#2a78d6` / `#3987e5` |
| `--cds-text-accent` | `#6da7ec` |
| `--cds-bg-accent` | `#032042` |
| `--cds-border-accent` | `#0d366b` |
| `--cds-on-accent` | `#fff` |

**Text**

| Token | Default |
|---|---|
| `--cds-text-primary` | `#f0efec` |
| `--cds-text-secondary` | `#c3c2b7` |
| `--cds-text-muted` | `#898781` |

The `--cds-*` layer is the current one. The legacy `--bg-*` / `--accent-*`
triplets still exist and some older components read them, so the script sets
both.

---

## The three lessons, if you only read one section

1. **Look, don't guess.** Every failed round was a guess — a path, a class
   name, a variable, a value format. Every success came from reading the real
   thing off the running app.
2. **Believe the error message.** "Refusing to start — a debugging switch is
   present" was the complete diagnosis. I spent two more attempts working
   around a problem the app had already explained.
3. **Use the door the app gives you.** The developer menu is a supported
   surface. It was there the whole time. The debug port, the standalone
   build, the browser extension — all of it was me trying to go around a wall
   that had an open gate in it.
