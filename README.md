# Claude desktop theme

> **Status: the desktop path no longer works.**
>
> Current builds refuse to start when a debugging switch is on the command
> line:
>
> ```
> Claude: refusing to start - a debugging or network-override switch is
> present on the command line.
> ```
>
> This is deliberate. An open CDP port gives any local process full control
> of the renderer *including your signed-in session*, which is exactly the
> risk the "Worth knowing" section below warns about. Anthropic closed it.
> Confirmed on the MSIX build 1.46388.4.0; the standalone build of the same
> version refuses identically, since the check is in the app rather than the
> packaging.
>
> **Use the stylesheet in a browser instead — see "Also works on claude.ai"
> at the bottom.** Same web app, same tokens, no debug port, and DevTools
> gives you the real token names for free.
>
> Everything below is kept for reference in case a supported theming hook
> shows up later.

Runtime CSS injection for the Claude desktop app over the Chrome DevTools
Protocol. Nothing inside the app bundle is modified, so the code signature
stays valid and auto-updates don't wipe your work.

Requires Node 22 or newer. No dependencies.

If `node --version` errors, you don't have it:
```
winget install OpenJS.NodeJS.LTS
```
then open a **new** terminal so PATH is picked up.

## Setup

**1. Quit Claude completely.** Not just the window. On macOS use Cmd+Q, on
Windows quit from the tray icon. A running instance will ignore the flag.

**2. Relaunch it with the debug port open.**

macOS:
```
/Applications/Claude.app/Contents/MacOS/Claude --remote-debugging-port=9222
```

Windows — there are two different builds and they live in different places.

*Standalone installer* (from claude.ai/download):
```
& "$env:LOCALAPPDATA\AnthropicClaude\Claude.exe" --remote-debugging-port=9222
```

*MSIX / Microsoft Store build* — no `AnthropicClaude` folder, no Start menu
`.lnk` to right-click. It sits under a protected directory:
```
C:\Program Files\WindowsApps\Claude_<version>_x64__pzs8sxrjxfjjc\app\claude.exe
```
You can't `cd` in there as a normal user, and app activation may swallow the
flag. Find the real path with:
```
(Get-AppxPackage *Claude*).InstallLocation
```

**Easier: just run `start-theme.ps1`.** It detects which build you have, tries
direct launch and then app activation, waits for the port to come up, and
starts the injector for you:
```
powershell -ExecutionPolicy Bypass -File .\start-theme.ps1
```

**3. Confirm the port is live.** Open `http://127.0.0.1:9222/json/list` in a
browser. A JSON array means you're in business. Connection refused means the
flag didn't take, so recheck step 1.

**4. Run the injector.**
```
node inject.mjs claude-slate.css
```

The theme applies immediately and re-applies on every navigation. Leave the
process running while you work on the CSS: saving the file pushes the change
straight into the app, no restart.

## Finding the real token names

The token block in `claude-slate.css` is an educated guess at Anthropic's
variable naming. To see the actual set:

```
node inject.mjs claude-slate.css --dump-tokens
```

It prints every custom property defined on `:root`. Correct any mismatches in
section 1 of the stylesheet. Guesses that don't match are simply ignored, so a
wrong name costs you nothing beyond that property not being themed.

For anything not covered by tokens, open DevTools in the app (Cmd/Ctrl+Shift+I,
or via the View menu if it's exposed), inspect the element, and put the rule in
section 4.

## Making it stick

The injector has to be running for the theme to be applied. Two options:

- Wrap steps 2 and 4 in a shell script or `.bat` and launch Claude through that
  instead of the normal icon.
- On macOS, a LaunchAgent; on Windows, a Task Scheduler entry at logon.

## Worth knowing

The debug port gives any process on your machine full control of the app's
renderer, including your logged-in session. It binds to localhost only, but
don't leave it open on a shared or multi-user machine, and close it when you're
not actively tuning the theme.

Anthropic ships UI changes frequently. Element-level rules in section 2 are
stable; token names and any class selectors you add are the parts that will
break. When the theme goes weird after an update, re-run `--dump-tokens` first.

This is unsupported and self-inflicted. If the app misbehaves, turn the
injector off before filing a bug against it.

## Also works on claude.ai

This is now the working path, not the fallback. Claude's desktop app is the
same web app in a shell, so the stylesheet applies unchanged.

1. Install **Stylus** (Chrome Web Store or Firefox Add-ons). Not Stylish —
   different extension, worse history.
2. Stylus icon → **Write new style**.
3. Paste the whole of `claude-midnight.css` into the editor.
4. Left panel, **Applies to** → *URLs on the domain* → `claude.ai`.
5. Name it and **Save**. It applies immediately and on every reload.

Editing the file on disk no longer live-reloads, since the injector isn't in
the loop. Edit in the Stylus editor and save, or paste the file over the top
each time.

### Getting the real token names

`--dump-tokens` needed the debug port, so use DevTools instead — it's easier
and it works right now:

1. On claude.ai, press F12 → **Elements**.
2. Select the `<html>` element.
3. In **Styles**, find the `:root` or `html` rule and expand it.
4. Every `--name: value` line there is a real token.

Correct section 1 of the stylesheet against that list. Those same names apply
to the desktop app, so the work carries over if a supported hook ever lands.
