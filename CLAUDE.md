# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SIGNAL — a CRT/terminal internet-radio web toy. A tuning-dial receiver rendered
entirely through a text grid, playing real YouTube tracks from 9 curated
stations. Read `README.md` first: it carries the product intent, the controls
reference, and the content-ops rules that constrain what may be added.

## Commands

No build step, no dependencies. `package.json` exists only to mark the repo
`"type": "module"` (so Node runs `stations.js`, `tools/`, `tests/` as ESM) and
to name these scripts:

```bash
python3 tools/dev-server.py 8000    # dev server (no-store headers); open http://localhost:8000
node --test tests/*.test.mjs        # npm test — headless suite, ~1s, no network
node tools/lint-roster.js           # npm run lint — offline roster rules
node tools/verify-roster.js         # npm run verify — lint + oEmbed check of every track (network)
node tools/stations-to-md.js        # npm run stations — regenerate stations.md (never hand-edit it)
node tools/stamp.js                 # npm run stamp — bump build.json; RUN BEFORE EVERY DEPLOY
```

`file://` does not work — the BDF font fetch needs a real origin. Use
`tools/dev-server.py`, not `python3 -m http.server`: only the former sends
`Cache-Control: no-store`.

**Deploys need `node tools/stamp.js`.** `main.js` fetches `build.json`
(always fresh, `?t=`) and imports every app module as `?v=<stamp>`; without a
bump, GitHub Pages' 10-minute cache can keep a visitor on the previous build.

`tools/network.html` is a roster-editing dashboard — open the file directly in
Chrome, grant it the repo directory (File System Access API), and it rewrites
`stations.js`'s `tracks:` blocks in place. Saving through it **strips inline
comments** from the rewritten `tracks` array.

## Architecture

### Bootstrap

`index.html` → `main.js` (reads the build stamp, imports `config.js` and
`program.js` as `?v=<stamp>`) → `src/screen.js` `mount(canvas, program, config)`
→ `Term` + `CRT` + rAF loop → `program.frame()` every frame.

**Module identity matters.** A module is instanced per full URL, query string
included. Every app module imports its siblings with the same
`` `./x.js?v=${V}` `` form (`V = globalThis.SIGNAL_BUILD`), so there is exactly
one instance of each. A bare `import './config.js'` would create a second
instance — that exact mistake once defeated the engine's `setPhosphor`
identity check. Keep the pattern when adding a module; the import graph must
stay acyclic (top-level `await import` deadlocks on a cycle).

### Engine (`src/`) vs. app

`src/` is `cyberspace-crt`, a generic WebGL2 CRT text-grid engine (vendored,
MIT). It knows nothing about radio and imports nothing from the app; it takes
its config through `mount()`. Prefer solving things in the app.

- `cellgrid.js` — char/attr/inverse/`gfx` planes with **per-row dirty
  tracking**; `put()` is a no-op for an unchanged cell. Attribute bits:
  `NORMAL BRIGHT BOLD DIM ALT ITALIC MUTED FAINT BG`.
- `term.js` — rasterizes only dirty rows into a single-byte beam-intensity
  framebuffer and returns the changed pixel bands; colour is applied in the
  shader, so tint changes never re-rasterize.
- `crt.js` — the WebGL2 passes; `crt.params` is a live object the app mutates;
  `setPhosphor(name)` no-ops when the tint is already up (persistence clear
  otherwise). Band uploads; `ResizeObserver` instead of per-frame layout reads.
- `screen.js` (only DOM-touching file), `bdf.js`, `vector.js`.

### App modules

`program.js` is the state machine: the effects queue, `init`, power on/off,
the YouTube player, tuning/lock, scan/presets, persistence glue, `key()`,
`frame()`. It composes the rest as **mixins** (`...desktopUi, ...mobileUi,
...guide, ...visualizer` — plain objects of methods where `this` is the
program):

- `ui/desktop.js` — the 80x25 screen: chrome, dial, status row (typewriter
  reveal, sweeps, flashes), text resolves, meters, antenna pane, STANDBY
  splash, idle CRT events. `ui/mobile.js` — the 42x22 lite screen and touch
  gestures. `ui/guide.js` — the `[G]` overlay.
- `visualizer.js` — shell (enter/exit, footer, cycling, lyrics view) that
  dispatches into `visuals/<key>.js`, each `{ key, label, init(p, term),
  reset(p), draw(p, s, t) }`; `visuals/index.js` is the registry in `[V]`-cycle
  order; `visuals/shared.js` holds the density ramp / hash / level→attr helpers.
  Effect state lives on the program object under `_`-prefixed names; `init`
  seeds it at boot, `reset` re-arms clocks on every visualizer entry (the
  effect clock restarts at 0 — an absolute `t` kept across visits froze FLAME
  once).
- `audio/sfx.js` — AudioContext, the hard-mute speaker bus, static bed, hum,
  every synthesized control sound. `audio/voice.js` — station IDs, liners,
  welcome line (one shared "through the radio" chain), LRCLIB lyrics.
  `audio/tap.js` — the live audio tap and `AUDIO_BUS`, plus `auMul` /
  `syntheticAudio` / `SILENT_AUDIO`.
- `stations.js` — the roster, pure data, no imports (Node can import it).
  `layout.js` — desktop + mobile row/column constants, STANDBY layout, text and
  box helpers. `tuning.js` — the band, thresholds, `freqToCol`, the three
  nearest-station questions, shuffle bag. `crt-hooks.js` — `crtBase`, distance
  degrade, ramps, glitch/bloom/focus-snap. `constants.js`, `state.js`.

### Things that only make sense across files

- **Layout is absolute cell coordinates** (`layout.js`); no layout engine.
  `MOBILE_LITE` is decided once at `config.js` import from `matchMedia`, so the
  grid is fixed for the page's life and mobile has parallel `mobile*` draw paths.
- **A station is an identity object** (`stations.js`): `freq callsign tagline
  desc freqNote ident identTempo gain glyph static crt meter idleEvent grind
  visual tracks`; secret stations carry `secret: true` and `forcedPhosphor`
  and are read generically — don't reintroduce id comparisons.
- **Tuning distance is one shared quantity** feeding the static bed
  (`staticGainForDist`), the S/N readout and the CRT degrade
  (`crtDegradeForDist`), so what you hear, see and read agree by construction.
- **The effects queue** (`program.fxAfter/fxEvery/fxTween/fxCancel`): every
  deferred draw or `crt.params` change goes on it, never on `setTimeout`. The
  normal queue ticks only while powered on with no guide up, so nothing can
  paint through an overlay; `powerDown` empties it; cancelled tweens settle at
  their end value. The always-queue is for the power sequences only. A
  250ms fallback ticker drains the queues whenever `frame()` hasn't run in
  200ms — keyed on rAF starvation, never on `document.hidden` (a background
  window on Wayland is throttled but reports `visible`). What stays on real
  timers on purpose: audio scheduling, the scan/preset sweeps, the clock.
- **Playback** is the YouTube IFrame API into an off-screen `#ytDock`;
  `index.html` defines `SIGNAL_YT_QUEUE` before the API loads. Every effect
  must look right with **no** audio tap (`this._au || syntheticAudio(t)`,
  `SILENT_AUDIO` while muted) — declined capture is common, not an edge case.

## Tests

`tests/harness.mjs` boots the real `program.js` in Node against a real `Term`
+ real BDF font, a stub `crt` with a live `params` object, and a **fake
clock**: `performance.now`, `Date.now`, `setTimeout`/`setInterval` all move
only via `h.advance(ms)`, which ticks `program.frame()` every 16ms. Tests
press keys (`h.key`), tap/swipe (`h.tap`, `h.swipe`), and assert on the text
grid (`h.row(y)`, `h.find(text)`). `boot({ mobile: true })` forces the lite
layout. Each boot gets fresh module instances (unique `?v=`). Add a scenario
here when you change a state transition; add to `tests/helpers.test.mjs` for
pure helpers; `tests/roster.test.mjs` runs `tools/lint-roster.js`.

## Conventions

- **The comments are the design record.** Nearly every decision carries an
  "Nth pass" note explaining what was tried, what broke, and why the current
  shape won. Preserve them when editing nearby code and add the same kind of
  note for non-obvious changes — much of the rationale exists nowhere else.
- **"Would a real radio have this?"** is the governing design test (play/pause
  was built and removed under it).
- `stations.md` is generated; edit `stations.js`, then re-run the generator.
- **Never add a YouTube ID unverified** (oEmbed; for concept-tied stations,
  also against the source's real tracklist). `tools/lint-roster.js` enforces
  the mechanical rules: 9 public stations, ≥10 tracks, 4-tone idents, glyphs
  present in the font, `visual` keys that exist, unique IDs, frequency spacing,
  and taglines that fit the guide index line (`≤ 52 − callsign.length`).
- `tools/station-profiles.json` holds the qualitative curation constraints and
  past rejections; read it before proposing tracks. `tools/pending-tracks.json`
  is the proposal queue reviewed through `tools/network.html`.
- Verify feel changes in a browser against the dev server as well as in the
  suite — timing, sound and texture are most of what matters here.
