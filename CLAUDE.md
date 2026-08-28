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
node tools/admin-server.mjs         # npm run admin — the admin backend + the app, port 8080
python3 tools/dev-server.py 8000    # dev server (no-store headers); open http://localhost:8000
node --test tests/*.test.mjs        # npm test — headless suite, ~2s, no network
node tools/lint-roster.js           # npm run lint — offline roster rules
node tools/verify-roster.js         # npm run verify — lint + oEmbed check of every track (network)
node tools/stations-to-md.js        # npm run stations — regenerate stations.md (never hand-edit it)
node tools/stamp.js                 # npm run stamp — bump build.json; RUN BEFORE EVERY DEPLOY
node tools/audition.js --station=<id> # npm run audition — vet candidate tracks (network)
node tools/shoot.mjs                # npm run shoot — regenerate screenshots/ (headless Chrome + ImageMagick)
node tools/dead-feedback.mjs        # npm run deadfeedback — input-feedback sweep (headless, ~1min)
```

`file://` does not work — the BDF font fetch needs a real origin. Use
`tools/dev-server.py`, not `python3 -m http.server`: only the former sends
`Cache-Control: no-store`.

**Deploys need `node tools/stamp.js`.** `main.js` fetches `build.json`
(always fresh, `?t=`) and imports every app module as `?v=<stamp>`; without a
bump, GitHub Pages' 10-minute cache can keep a visitor on the previous build.

## The admin backend

`node tools/admin-server.mjs` (`npm run admin`) serves the app AND the
network-ops dashboard at `http://127.0.0.1:8080/admin`. It sends the same
`Cache-Control: no-store` headers `tools/dev-server.py` does, so for an admin
session it replaces that server rather than running beside it. Zero
dependencies; binds loopback, checks the `Host` header, and requires an
`X-Signal-Admin` header on every mutating route — which a cross-origin page
cannot send without a CORS preflight this server never answers. That last
guard is not decorative: this process can run `git push`.

**This box is normally worked on over SSH, where `127.0.0.1:8080` names the
laptop, not this machine** — which is exactly how the first live check of the
dashboard failed, with a browser error page against a server `curl` could
reach fine. Loopback is still the default, because `tools/dev-server.py`
binding every interface is a different risk from this one doing it: that
serves static files, this commits and pushes. Two ways across:

- **Tunnel** (nothing exposed): `ssh -N -L 8080:127.0.0.1:8080 <user>@<box>`,
  then open `http://127.0.0.1:8080/admin` on the laptop. In a live session,
  `~C` then `-L 8080:127.0.0.1:8080`. The banner prints this command, filled
  in with the real port and address, whenever `SSH_CONNECTION` is set.
- **`--host=<addr>`** (`npm run admin -- --host=100.x.y.z`) binds an
  interface the other machine can see; a Tailscale address is the defensible
  one, since that is an authenticated mesh rather than the open LAN. It
  prints a warning saying what it just allowed, and there is no password.

Either way the `Host` allowlist stays on: every address this machine actually
has, plus the loopback names, and nothing else. That still stops DNS
rebinding, which needs the browser to send `Host: evil.com` — a hostname an
attacker controls is not in the set however it resolves.

`tools/network.html` was serverless until 2026-08-27, reading and writing
`stations.js` through Chrome's File System Access API with the roster parser
copied inline. **Opening the file directly no longer works** — a `file://`
page cannot import a sibling module, and re-inlining the parser is the exact
duplication that broke this dashboard once before. Its connect screen says
so and prints the command.

What the served version does that the file could not:

- **Run the Node toolchain** and stream it back: lint, the suite, verify,
  stamp, stations.md, the dead-feedback sweep, screenshots. PREFLIGHT chains
  lint → suite (roster verify is opt-in — it is the slow, networked one).
- **Edit a station's IDENTITY** — `crt`, `meter`, `ident`, `glyph`, `visual`,
  `gain`, `static`, `freq`, tagline, desc. Nothing but a hand-edit of
  `stations.js` could touch any of these before. Ident tones play through the
  same chain `playIdent()` uses; the tagline counter and the glyph-in-font
  check are the rules `lint-roster.js` already enforces, read from the server
  rather than restated here.
- **SHIP**: stamp → stations.md → lint → suite → add → commit → push,
  stopping at the first failure with nothing committed. The stamp step is the
  one most easily forgotten by hand, which is the whole argument for it.
- **Audition in the browser**, wrapping `tools/audition.js --json`.
- **A live receiver** in an iframe beside the sliders, via `?station=<id>`.

`tools/lib/roster.mjs` is the stations.js parse/patch layer, imported by BOTH
the server and the page — which is why it has no `node:` imports at all. Add
one and the dashboard stops loading. Two patchers:

- `patchStationTracks()` rewrites a `tracks: [...]` block, carrying each
  track's comment block across with it, keyed by `youtubeId`. It used to
  regenerate the array from data and **strip every comment in it** — which
  was tolerable while the block was only hand-edited, and stopped being
  tolerable the moment the dashboard made removing a track two clicks. The
  first real use of that button destroyed 33 lines of "Nth pass" notes (two
  stations' batch-approval record, an issue-#19 swap rationale) as a side
  effect of dropping two tracks, and nothing else holds those notes. Fixed
  2026-08-27. A comment attached to a track you *removed* still goes with it
  — usually correct — but the caller gets `droppedComments` back and the
  dashboard prints it, so it is never silent again. Indentation and quote
  style are inferred from the block, not imposed: GREEN ROOM indents entries
  4 spaces where every other station uses 6, and `'Don\'t Go'` must not come
  back as `"Don't Go"`.
- `patchStationField()` rewrites ONE field's value and leaves every other
  byte alone, comments included. This is what makes the identity editor safe
  to have at all: those fields are wrapped in the "Nth pass" notes that are
  this repo's design record, and a reformat-the-object patcher would eat them
  the first time anyone dragged a slider. It infers numeric and quote style
  from the literal it replaces — `gain: 1.0` must not come back as `gain: 1`,
  and a single-quoted freqNote must not come back double-quoted.

`tests/roster-lib.test.mjs` guards **both** patchers with an **idempotence
sweep**: rewriting every field, every nested leaf, and every tracks block of
every station with the value it already has must give the file back byte for
byte. The tracks half of that sweep scored 1/11 when it was first written —
that is what the comment-stripping looked like as a number. That is what caught
both style bugs above. It did *not* catch a trailing-space bug on the last
key of an inline object (`bloomAmt: 2.0}`), because the sweep rewrote `crt`
as a whole object where the space cancels out on both sides — a headless load
of the dashboard caught that one, in the diff preview, and nested leaves are
in the sweep now. The dashboard's "preview change" button runs these same
patchers client-side and shows the diff before you save, which is the only
honest proof that a save touches only what it claims to.

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
- **Adding a secret station** is five edits and no new call sites, because
  `SECRET_STATIONS` is walked rather than indexed and every secret behaviour
  keys on `station.secret` / `station.forcedPhosphor`: the object literal in
  `stations.js`, one entry in `SECRET_STATIONS`, one `case` in `program.js`'s
  `key()` calling `presetTune()` on the object directly, the key in
  `MAPPED_KEYS` (else it's the one command that lands with no click), and the
  tint in `config.js`'s `PHOSPHORS`. **A `forcedPhosphor` that isn't in
  `PHOSPHORS` fails silently** — `setPhosphor()` no-ops on an unknown name, so
  the station just never changes colour and nothing throws.
  `tests/helpers.test.mjs` guards that. Don't force a tint the tube may
  already be in either (`setPhosphor()` no-ops on an identical tint, so the
  reveal lands as nothing happening for anyone already in that mode).
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

One trap when writing scenarios: **a fresh boot lands on a random station**,
and pressing the preset you are already on is a no-op flash rather than a
re-tune — so a hardcoded `h.key('3')` quietly does nothing about one run in
nine. Ask `otherPreset(h)` for a digit that isn't the current station.

`boot({ player: true })` adds a **fake YouTube player** — the real API surface
is ten methods and three events, so the harness models it rather than stubbing
it: position runs on the same fake clock, `seekTo`/`pause`/`play` move it, and
the state events fire on a timer the way the real ones do. Without it there is
no player at all and `loadTrack()` returns on its first line, so every test
written before 2026-08-27 exercised the tuning half with playback switched
off. `h.player.endTrack()` and `h.player.fail()` cause the two events a test
cannot otherwise reach (a natural track end, a dead video). `boot({ lyrics })`
answers the LRCLIB lookup — `true` for a canned synced lyric, `'none'` for a
200 with no synced lyrics, or a function of the URL when one track should have
them and the next should not. That chain is a real promise chain and
`advance()` is synchronous, so `await h.flush()` after the load that fires it.

**A fake proves you read your own assumption correctly — nothing more.**
This is the expensive lesson of the STATION BREAK, which took three passes
and shipped twice before it was learned. The harness modelled a YouTube
preroll the way the IFrame API was *assumed* to report one — `getVideoData()`
naming the ad, `getDuration()` giving the ad's length — and a detector built
on exactly those assumptions passed its tests every time. A capture from a
real preroll then showed the player reports the *requested* video's own id
and own duration throughout, so there was never anything to detect and the
suite could not have told you: it was asking the fake to confirm the belief
that built it. When a fake stands in for something outside this codebase,
green means self-consistent, not correct. Anything load-bearing about the
external thing's real behaviour has to come off the real thing once, and
then the fake gets rewritten from that capture rather than from the spec —
`tests/harness.mjs`'s advert model carries the reading it was rebuilt from,
so a future detector on ids or durations fails there as it would live.

**Mutate the code to check a test can fail.** The same pass shipped an
anti-flash test that was decorative: forcing `BREAK_HOLD_MS` to 0 — a break
firing on every ordinary track change, the exact bug it existed to catch —
left it green, because the fake started playback at 0ms and gave it no
window to catch anything in. Breaking the feature on purpose is what found
that, and the fix was in the harness (content now takes a realistic 700ms to
start), not the test. Worth doing for anything timing-shaped: neuter the
behaviour, confirm the suite goes red, and check the *right* tests went red.

`tools/dead-feedback.mjs` drives the same harness as a **sweep** rather than
as assertions: every key in every view, each pressed run diffed against a
do-nothing control run from the same PRNG seed, so a key that changes nothing
anywhere on the grid shows up as such. Run it after touching `key()`,
`isMappedKey()`, `MAPPED_KEYS`/`VISUALIZER_KEYS` or the touch gestures. Two
rules it exists to keep: a key that CLICKS has to change something (the click
is gated by `isMappedKey`, which is meant to mirror what `key()` actually
answers — it drifted out of sync in the visualizer for four passes), and a
control the screen advertises — footer hints, the Guide's grid, the
visualizer legend — has to answer even where it can't act (`NO SIGNAL`,
`NO HISTORY`, `NO LINE IN`). Its header documents the seeding, the `[F]`
exception and the `F13` canary that catches a desynchronised run.

## Conventions

- **The comments are the design record.** Nearly every decision carries an
  "Nth pass" note explaining what was tried, what broke, and why the current
  shape won. Preserve them when editing nearby code and add the same kind of
  note for non-obvious changes — much of the rationale exists nowhere else.
  The corollary: reasoning belongs **next to the code it governs**, and not
  copied into a doc, a commit message, or an assistant's memory, all of which
  are free to drift from it. Where something genuinely must live in two
  places, make one of them assert they agree rather than trusting them to:
  `lint-roster.js`'s `TAGLINE_MAX` duplicates the width of the guide index's
  LANE column, and `tests/program.test.mjs` fails if the two diverge. The
  cautionary case is already further down this file — "Rejections live in two
  files and neither reads the other" is what the un-asserted version of this
  looks like a year in.
- **"Would a real radio have this?"** is the governing design test (play/pause
  was built and removed under it).
- `stations.md` is generated; edit `stations.js`, then re-run the generator.
- **Never add a YouTube ID unverified**, and **oEmbed 200 is not the bar** —
  it only proves a video exists. Check `playabilityStatus`, `playableInEmbed`
  and `availableCountries` too — two of those caught something the GREEN ROOM
  pass would otherwise have shipped (2026-08-26). An age-gated track
  (`LOGIN_REQUIRED`) cannot be satisfied by the IFrame player and plays as
  dead air. And what matters about `availableCountries` is **its size, not
  merely whether the US is in it**: four tracks on that pass had `- Topic`
  uploads licensed in 1–4 countries, every one of them listing the US, so a
  US-only check passed all four while they would have failed for everyone
  else. Expect the better channel to hold the narrower licence; that trade
  comes up constantly. For a station tied to a concept, also check against
  whatever defines it — a source tracklist where there is one, the lyric
  itself where the concept is a subject rather than a source. `tools/lint-roster.js` enforces the mechanical rules: 9 public
  stations, ≥10 tracks, 4-tone idents, glyphs present in the font, `visual`
  keys that exist, unique IDs, frequency spacing, and taglines that fit the
  guide index line (`≤ 52 − callsign.length`; secret stations are exempt from
  that one and from the glyph rule, since neither is ever drawn).
- **Rejections live in two files, and the dashboard is now the single
  writer for both.** `tools/station-profiles.json`'s `rejections` is the one
  that matters when you are picking tracks — `audition.js` prints it back at
  you as "x rejected before". `tools/pending-tracks.json`'s `rejected` is the
  queue's own record of proposals declined out of it. Same file's
  `constraints` holds the qualitative rules; read both before proposing.

  Until 2026-08-27 neither file read the other and both were hand-maintained,
  so a curation pass that dropped a track had to remember to write the reason
  into the profile or lose it — a comment in `stations.js` alone does not
  surface anywhere. Rejecting through the dashboard (`POST /api/reject`) now
  writes **both** in one action and **requires a reason**; it refuses without
  one, because a rejection with no reason teaches nothing and the next pass
  re-proposes the track. Rejecting by hand still needs both files edited.
  If a station has no entry in `station-profiles.json`, the dashboard says so
  rather than silently writing only one of the two.
- **`tools/audition.js` is the candidate-side counterpart to `verify-roster.js`**
  (`--json` prints the same rows as data on stdout with every human line
  routed to stderr — one code path, so the dashboard and the terminal cannot
  disagree about a flag; it is how the admin backend runs this tool)
  — that one checks tracks already on the roster, this one checks tracks that
  aren't yet. `--search="..."` (repeatable) ranks candidates; re-run with the
  IDs you picked to write `tools/audition.html` (gitignored), which embeds each
  one through `youtube.com/embed/`, the same path `#ytDock` uses. It prints the
  target station's profile constraints and past rejections, and flags what an
  oEmbed 200 cannot see: duration (an album master vs. a live take, an edit or a
  rework), region-locking and embed-blocking, IDs already on the roster, title
  collisions, and whether the channel is one this station already uses. Channel
  provenance is per-station, not global — DISTORTION FIELD is VEVO throughout,
  MIDNIGHT NEON is mostly `- Topic`, CITY LIGHTS leans on archive channels
  because the catalogue was never officially uploaded. The tool checks the
  mechanical half; the judgment is still yours.
- **`--station=<id>` must already exist in the roster**, so a brand-new
  station is a chicken-and-egg: commit the identity object with `tracks: []`
  first (lint will complain about the 10-track minimum until you fill it),
  then audition against it.
- **A rate-limited audition run used to look like a clean one.** YouTube
  throttles the watch endpoint after a few hundred requests — HTTP 429,
  redirecting to `google.com/sorry` — and that page carries none of the
  player fields, so every probe missed and the old fail-open defaults left
  nothing to flag. Fixed 2026-08-26: an unparseable probe is now
  `UNVERIFIED(<reason>)` per row, a loud run-level warning, and a nonzero
  exit. **If you see `UNVERIFIED`, nothing beyond oEmbed was checked** —
  waiting is the fix, not retrying harder; the limit clears on its own in
  tens of minutes. A narrow licence flags as `NARROW-LICENCE:<n>` below 20
  countries (observed counts split cleanly: 1–8 bad, 115–249 healthy).
- `screenshots/` is regenerated by `tools/shoot.mjs`, which drives a real
  Chrome headlessly over CDP — re-run it for any shot whose screen you
  changed, rather than leaving the README showing a UI that no longer
  exists. Its header documents the three app-specific traps (WebGL2 needs
  a forced software backend; phosphor persistence settles per FRAME, not
  per second, so wall-clock waits ghost the previous screen through;
  `[G]` from STANDBY avoids powering on at all). One known limit: a
  headless capture cannot get a live audio tap, so the visualizer shot
  runs on `syntheticAudio()` and reads smoother than the real thing.
- Verify feel changes in a browser against the dev server as well as in the
  suite — timing, sound and texture are most of what matters here.
- **Check the frame rate before believing a live browser check.** A Chrome
  window that is merely covered by another one sits at literally 0fps — one
  frame in 25 seconds — while `document.hidden` is false, `visibilityState`
  is `'visible'` and `hasFocus()` returns true. Everything SIGNAL does per
  frame stops there, so a verification run against a window that is not
  actually in front of you measures nothing and reports it as clean. That is
  the same shape of silent pass as a rate-limited `audition.js` run, and it
  cost two rounds of "the fix works" on 2026-08-27 before it was noticed.
  Count frames over a second or two first; then prove the probe can see what
  you are hunting by forcing that state (`SIGNAL_FORCE_BREAK` and friends)
  before trusting a negative result. This is separate from the runtime
  fallback ticker above, which keeps the effects queue moving under the same
  starvation — that protects the app, this protects your conclusions.
