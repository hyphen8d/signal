# Changelog

Notable changes to SIGNAL, release by release. This file starts at 0.9 —
everything before that lived only in git history (`git log`).

## [Unreleased]

Landed on `main` after the `v0.9` tag; still version-tagged `v0.9` in the
UI since these are same-evening follow-up tweaks, not a new release.

### Engineering (2026-08-25 audit)

No visible or audible change; everything below is structure, performance
and tooling. Full write-up in the audit notes; the short version:

- **Caching fixed.** `program.js` was re-downloaded on every visit (a
  per-load `?t=` cache-buster). Modules now load as `?v=<build stamp>` from
  `build.json`; bump it with `node tools/stamp.js` before a deploy. Fixing
  this also fixed a real bug: `config.js` was instanced three times, which
  defeated the engine's phosphor identity check and cleared the persistence
  buffer on every lock, unlock and colour cycle.
- **`program.js` split into modules** -- `stations.js` (the roster, pure
  data), `layout.js`, `tuning.js`, `crt-hooks.js`, `audio/`, `ui/`,
  `visualizer.js` + `visuals/` -- composed as mixins. 9,472 lines became a
  2,190-line state machine plus 24 focused files; every comment moved with
  its code.
- **Frame-driven effects queue.** The 36 `setTimeout`/`setInterval` sites
  that drew to the grid or drove `crt.params` now run from `frame()`, so
  nothing can paint through STANDBY, the guide or the visualizer, and a
  power-off drops every in-flight effect in one place (ramps settle to
  rest). Audio scheduling and the scan/preset sweeps stay on their own
  clocks on purpose; a tab that isn't being painted (hidden, occluded or
  rAF-throttled) keeps the queue moving via a coarse fallback ticker.
- **Engine: per-row damage tracking.** Only changed rows are rasterised
  and uploaded (~4 rows per pass in the main view instead of all 25);
  identical re-puts are free; the canvas is measured via `ResizeObserver`
  instead of a layout read every frame.
- **Tooling and tests.** `tools/verify-roster.js` now imports the roster
  directly (no more brace-matching `program.js`) and covers the secret
  station -- NIN's tracks had never been checked. `tools/lint-roster.js`
  enforces the content-ops rules offline. `tests/` is a headless harness
  that boots the real program against a real text grid with a fake clock;
  `npm test` runs 24 tests in about a second.
- Dedupe and dead code: one main-screen rebuild path (was three copies),
  one grid clear (was seven), one track-selection routine, one TRI readout;
  removed `playPowerDownSound`, `tuneToStation`/`nowPlaying`,
  `drawTriBand`, `_outrunRedline`, the MPC sequencer constants.
- README: visualizer descriptions caught up with what shipped; the `[L]`
  lyrics lookup is now disclosed next to the tap's privacy note.

### Live audio (branch: david-visualizer)

- **The meters and visualizers are real now.** A live "audio tap" captures
  the actual audio and drives everything that used to be synthetic
  animation: the VU tracks true loudness, the EQ ribbon is a real 6-band
  spectrum, FLD follows the mids, and all 10 station visualizers react to
  the music — flame flares on bass hits, frost tips sparkle on beats,
  OUTRUN's road drives at the track's intensity, and HACKBACK's pad grid
  *learns* the actual track's rhythm from detected onsets and a rolling
  BPM estimate.
- **How the audio gets out of the YouTube iframe** (which WebAudio cannot
  read): a capture ladder tried at power-on. Desktop Chrome/Edge get tab-
  audio capture ("share this tab + audio" — the prompt rides the power-on
  press and the boot POST reports `AUDIO TAP: LINE`); everything else,
  mobile included, falls back to the microphone hearing the speakers
  (`AUDIO TAP: MIC`; the grant persists, so later visits start silently).
  No capture at all — declined, unsupported, headphones on the mic tier —
  and every meter/effect renders exactly the synthetic behavior it always
  had. Analysis only: the stream feeds an AnalyserNode and nothing else;
  nothing is recorded, nothing leaves the page.
- SIG and S/N are deliberately *not* audio-driven — they remain reception
  meters derived from tuning distance, as the 39th pass established.
- The live audio tap and its visualizer audio-sync work is the work of
  **End Dream** — credited in the README and the in-app Guide's about page.

### Visualizer

- **ATOMIC** — ISOTOPE MAP, replacing GEIGER outright. 5 independent hot
  sources drift the screen on their own lissajous loops, brightening a
  field of quietly flickering cells as they pass; no needle, no gauge.
  Fully stateless (see the wiki's Design Notes).
- **CIPHER, DISTORTION FIELD, COLD WAVE** — rebuilt so each goes
  genuinely silent/still with no live audio tap instead of animating
  regardless: CIPHER's column-decode motion, DISTORTION FIELD's flame
  fuel, and COLD WAVE's ignition all now gate on the tap's presence, not
  just its amplitude. DISTORTION FIELD's Feedback Stack treble overlay
  was removed outright and its base reactivity widened. COLD WAVE's Neon Grid Decay, previously a
  small overlay, is now the station's entire core visual — the old frost
  automaton was deleted rather than layered under it.
- **ATOMIC** — back to GEIGER (a click-driven Geiger counter), replacing
  ISOTOPE MAP again. Background click rate and a digital `CT nnnnn`
  counter give it an "always there, different metered level" idle state
  instead of dead silence. A chart-recorder strip that scrolled a trace
  across the bottom of the screen was removed (read as a stray horizontal
  artifact rather than an instrument).
- **CIRCUIT CRUSH** — the RPM tachometer was moved down onto the dash and
  made always-visible with an idle floor, then removed outright in a
  follow-up pass.
- **MOMENTUM** — rebuilt as a Flow Field: a reactive wind/current map that
  keeps calm ambient motion at idle rather than sitting fully still.
- **CITY LIGHTS** — fixed a gap where a stagger of independently-timed
  ripple rings could leave the screen looking ripple-less for stretches;
  added a safety net that forces a fresh ring when none are young enough.
- **HACKBACK** — rebuilt around a boombox concept: sound-wave rings off
  the speaker (idle heartbeat, live onset bursts), continuous VU-style
  meters reacting to real bass/mid/treble, and a new pulsing LED strip
  that ladders with level and flashes together on hits. Dropped the MPC
  16-step pad-sequencer grid, the ambient dust scatter, and Scratch Flash
  entirely.
- **ATOMIC** — GEIGER replaced by BLAST FIELD, rebuilt from the ground up
  to react more obviously to the music. GEIGER
  was a real instrument but a small one pinned to screen center; BLAST
  FIELD fills the whole field instead — a real bass onset detonates at a
  random point (bright core flash, fast shockwave ring, trailing fallout
  dust), against a sparse background-radiation twinkle. No tap, no
  detonations, ever, same "no activity without audio" contract as FLAME.
- **MOMENTUM** — the Flow Field above is retired in favor of the original
  towers concept, done for real this time: 13 towers spanning the width,
  and a real bass onset visibly adds one or two floors to a tower — a
  discrete, legible event rather than a continuous parameter warp. A
  tower that tops out either raises its ceiling and keeps building or
  resets short and breaks ground again. Fixed a real loose end along the
  way: a tower array was still being allocated fresh on every visualizer
  entry since the Flow Field swap, and nothing had read it since.
- **MIDNIGHT NEON** (new station, replaces MOMENTUM — see Stations below)
  — NEON SIGN: the word BLUES in a hand-authored pixel font, centered on
  screen. Segments gutter independently on a slow ambient flicker even
  with no audio (a deliberate exception to the "dead on silence" rule
  FLAME/BLAST FIELD follow — a neon sign reads as lit hardware, not a
  flame), plus a bass-onset "buzz cascade" that knocks a burst of
  segments dark together and lets them relight. A soft one-cell glow
  halo bleeds into the dark cells touching a lit segment. SKYLINE, its
  only user, is unassigned again after one release.
- **MIDNIGHT NEON, again** — NEON SIGN unassigned in turn: a single
  centered word read as a static logo card, not a
  scene. Replaced by BUBBLE TUBES: nine full-height glowing tubes across
  the width, one per real spectrum band (`A.bands9`, the same 9-band tap
  CIPHER already reads) — an honest VU-style readout, not decoration,
  filled from the base with bubbles drifting up through the glass. Always
  lit at a low idle floor even with no signal, and a real bass onset
  punches every tube brighter at once with a fresh burst of bubbles — the
  whole machine responding to the beat rather than one column spiking.
- **BUBBLE TUBES, bubbles dropped** — the bubble pool is
  gone; the nine tubes and their two-tier bright/normal fill are the whole
  picture now.
- **Synthetic-audio fallback, for BUBBLE TUBES/CIPHER/DISTORTION
  FIELD/COLD WAVE.** These four were the ones built to go still or silent
  with no live tap — CIPHER's hex field froze static, FLAME sat as a low
  unmoving ember bed, FROST held a dim motionless wire, and BUBBLE TUBES
  sat at its idle floor with nothing rising. That read as broken rather
  than atmospheric when a tap just isn't
  available (declined permission, unsupported browser, no mic grant), so
  the rule was relaxed in favor of a seamless fallback. Added `syntheticAudio(t)`, a pure function
  of time that fabricates a same-shaped fake signal (independent-phase
  sine layers per band so they drift out of sync, a small per-frame onset
  chance, a decaying pulse envelope) — not trying to imitate a real
  track's rhythm, just enough motion for each effect's already-tuned
  reactive code to read. All four call sites are `this._au ||
  syntheticAudio(t)`, so a real tap always wins the instant one connects,
  and the fallback is deliberately seamless — no visual "this is fake"
  indicator. The other visualizers (BLAST FIELD, BOOM BAP, RIPPLE, OUTRUN,
  DRIFT, SKYLINE) were left alone; those still read fine
  without a tap.

### Stations

- **MOMENTUM retired, replaced by MIDNIGHT NEON** — late-night electric
  blues, "dark highways and low-lit lounges." Same dial slot and glyph kept
  on purpose: freq 567.8, glyph '≡'.
  MOMENTUM's 30-track chillhop/downtempo roster and ident are preserved in
  a comment above the new station entry, same treatment RELIC SIGNAL's
  tracklist got when it retired. First cut ships with 20 of the 40 candidate
  tracks, picked across the source set's four "hours" for the
  most iconic/likely-official sources; all 20 spot-checked live against
  YouTube's oEmbed endpoint. New tagline: "late-night blues, neon glow."

### Content

- Fixed two taglines that didn't match the "mood, mood" comma-paired
  format the rest of the roster uses (CIPHER, ATOMIC) and one that had
  drifted from a two-fragment shape down to a single unbroken clause
  (HACKBACK).
- Fixed HACKBACK's tagline and desc, both of which incorrectly called the
  station's 25-track roster "west coast" — it's genuinely coast-to-coast
  (NY acts if anything outweigh the West Coast side, plus Outkast
  repping Atlanta).

### Commercial break

- **An ad is a `STATION BREAK` now, not a lie — and it needs no ad
  detection.** SIGNAL plays real YouTube video, so listeners without Premium
  get real prerolls, and the set used to sit there showing `> PLAYING` and
  the track's own title over the top of an advert. It now holds the readout
  instead: NOW PLAYING becomes `STATION BREAK -- <CALLSIGN> RETURNS SHORTLY`
  and the play state reads `COMMERCIAL` until the player confirms the track
  has actually started. The visualizer's footer, its lyrics view and the
  browser tab title all pick it up, because the break is shaped like a track
  and every draw path already knows how to render one.
- **Two detectors were built and thrown away first, and the record is worth
  keeping.** The original read an advert out of a mismatched `getVideoData`
  id or a drifted duration; that put `STATION BREAK` over five ordinary `[N]`
  skips in forty, because mid-load YouTube reports the *outgoing* track's id.
  Gating both signals on the player reporting PLAYING fixed the false
  positives — and then a capture from a browser that actually gets adverts
  showed the approach could never have worked at all: through a real preroll
  the player reports the requested video's own id **and** its own duration
  (`id=XZVpR3Pk-r8 want=XZVpR3Pk-r8 same, dur=181.0` on a 3:01 track). Both
  signals were blind. That is almost certainly deliberate on YouTube's part.
- **So the question changed.** Not "is an advert running?", which has no
  answer, but "has the content we asked for started?", which the player
  answers honestly — a healthy track reached PLAYING about a second after its
  cue, while the advert never reached it at all. The break is now a *hold*,
  and it is honest by construction: it never claims an advert exists, only
  that this track has not started. The failure mode inverts with it — a slow
  load shows a break over silence, where the old bug showed a track title
  over audible advertising.
- **Nothing is suppressed.** The ad is not blocked, skipped, muted, hidden
  or seeked past -- it plays in full exactly as YouTube served it. This
  revisits the detection half of the 20th pass's decision and leaves the
  suppression half untouched; the Guide still says so on its own page.

### The title lands on the music (2026-08-28)

- **NOW PLAYING waits for the downbeat.** The reveal used to run on a timer:
  press `[N]` and the track title typed itself in immediately, whether or not
  a single note of it had played. The STATION BREAK above had already shrunk
  that window from about thirty seconds to four — this closes the last four.
  The resolve now holds in noise until the player reports PLAYING, so the
  title *settles as the sound arrives* instead of a beat before it. One rule
  in place of two regimes, honest by construction rather than by grace
  period, and the animation stops being decoration: the best moment in the
  app is now the title materialising on the downbeat.
- **The keypress still answers instantly.** The resolve *starts* on the key —
  the row is churning noise in the same frame as the click — and only the
  settle waits. A held row shows nothing readable, not a half-legible title:
  half of a claim is still the claim.
- **Every surface holds together**, or the honesty leaks out of whichever one
  was left behind: the desktop track row, both of mobile's title rows and its
  artist line, the visualizer's footer, and the browser tab, which names the
  station and waits rather than carrying a wrong title for the whole of a
  load. If the music never arrives, the break takes the row at four seconds
  exactly as before.
- **Fixed alongside it: a resolve could paint over the lite grid's playback
  bar.** A resolve is keyed on the row it started at, and the lite layout
  moves its rows when a title's wrap changes — so a two-line title held open,
  then replaced by a one-line `STATION BREAK`, left noise churning across the
  bar underneath. Older than this pass and rare enough to have surfaced only
  as an intermittent test failure (a resolve used to live 340ms and had to be
  relaid out inside that window); held reveals made it permanent, and made it
  findable.

### Sleep timer

- **`[T]` arms a sleep timer** -- 60 / 30 / 15 minutes and off again, stepping
  down the way a clock radio's SLEEP button always has. A `SLP mm:ss`
  countdown sits in the title bar's one free stretch, which is also the one
  row the visualizer keeps, so it stays readable in the state someone on
  their way to sleep is most likely to have left the set in -- and `[T]`
  works from in there too. The last 30 seconds fade out rather than cutting
  off, since silence arriving as an *event* is the one thing a sleep timer
  must not do; the VOL bar follows the fade down so the screen never claims
  a level the speaker isn't at. Then the set switches itself off through the
  normal power-down, collapse and all. Deliberately not persisted, and
  cancelled by a manual power-off.

### Bug fix

- **`NOW PLAYING` could stick on `BUFFERING...` for a whole track** while the
  progress bar beside it counted up — the two halves of one row contradicting
  each other. `tryLock()` ended with an unconditional "buffering", including
  on the path where `presetTune()` had primed the track at the *start* of its
  ~330ms dial sweep: if the player got from CUED to PLAYING inside that
  window, that event had already been and gone, and it does not fire twice.
  The lock now asks the player what it is doing rather than assuming a cue is
  still pending. Found by the harness's new fake player the day it was built.

### Input feedback (2026-08-27 dead-feedback sweep)

Every key, swept against every view it can be pressed in, by diffing the text
grid against a do-nothing control run — `tools/dead-feedback.mjs`, kept in the
repo so the sweep is repeatable. Two rules came out of it: a key that clicks
has to change something, and a control the screen advertises has to answer
even where it can't act.

- **The visualizer clicked for every key on the keyboard**, including keys
  SIGNAL doesn't own at all — a Cmd-Tab keydown clicked like a command. The
  click gate still said "any key" from when any key exited the visualizer;
  the 64th pass had since made every unnamed key a deliberate no-op and
  nothing narrowed the gate to match. Now `VISUALIZER_KEYS`: exactly the
  footer legend's own set, with `[L]` following the same lyrics availability
  the legend already dims itself on.
- **Four advertised controls answered with nothing** in the state where they
  couldn't act, and now say why: `[B]` BACK with an empty history —
  every visitor's whole first session — reads `NO HISTORY`; `[N]` and `[V]`
  off-station read `NO SIGNAL` (the same word Enter already gives for the
  same reason); `[A]` on a browser with no capture path reads `NO LINE IN`.
- **The mobile skip swipe** got the same answer, and needs it most: touch has
  no key click at all, so a gesture that changed nothing was wholly silent
  and read as one the screen had missed.
- `[P]` no longer clicks during a power sequence, where `powerUp()`
  deliberately ignores it — the impatient double-tap its guard was written
  for was clicking like a command and doing nothing.

### UI polish

- Main-view control-hint footer dialed down for legibility —
  background fill and both text rows now share one attr
  instead of three different ones, which also fixed a background seam
  where text cells and blank cells painted at different brightnesses in
  inverse mode. Top row (SEEK/LOCK/SCAN/PRESETS/BACK) kept bold to read
  as the primary controls.
- Boot sequence's `SQUELCH SET` line (never a real feature) replaced with
  a live count of the roster's distinct full-screen visualizer effects.
- **Antenna glyph**: the ring animation used to radiate outward from the
  mast -- reversed so rings now pulse inward, then the pulse continues
  down the bare rod into the base, reading as a signal arriving and
  grounding out rather than transmitting.
- **LEVELS box redesigned** around the live audio tap's real per-band
  data: VOL stays as the only non-audio reading; SIG (reception distance)
  and the old synthetic VU trace are both gone, replaced first by a
  BASS/MID/TRE meter and then, after two follow-up passes, by a single
  9-band spectrum ribbon (widened from 6 real bands -- see below) spanning
  all 3 rows below VOL as one continuous meter with no divider or gap
  running through it.
- **Antenna pane's FLD readout renamed twice**: FLD -> BPM (real detected
  tempo once the beat detector locks, atmospheric filler otherwise) -> TRI,
  "totally real indicator" (a tongue-in-cheek name, same underlying
  value). A new PLS readout fills the slot the EQ ribbon vacated when it
  moved into LEVELS -- a real onset-driven peak-hold number, spiking on
  detected transients and bleeding out over ~1s.
- **9-band spectrum, not just a wider display**: the audio-tap pipeline
  itself grew from 6 real frequency bands to 9 (`TAP_BAND_EDGES_HZ`,
  log-spaced 90Hz-10kHz) -- the first 3 band edges are unchanged from the
  original 6-band scheme on purpose, so onset detection, BPM, and the old
  bass/mid/treble split all stayed byte-identical; only the ribbon and
  CIPHER's per-column band mapping actually gained resolution.
- **STATUS** label added to the antenna pane's right half, matching every
  other panel's titled-box convention -- it was the only panel not labeled.
- **STANDBY screen redesigned as a splash.** Was a plain two-line "STANDBY" / "[P] POWER ON"
  centered on the grid; now leads with SIGNAL as a large block-letter
  wordmark (`STANDBY_LOGO_FONT`, the same hand-authored 5x7 pixel-letter
  convention NEON_FONT uses for MIDNIGHT NEON's old BLUES sign), VERSION_TAG
  underneath, then STANDBY, the power-on hint, and the clock, all laid out
  and centered together by one `standbyLayout()` function shared by both
  places that draw it (the first-ever paint in `init()` and the power-down
  animation's landing beat) and by `drawStandbyClock()`'s own per-second
  tick, so the clock can never drift out of line with the rest. The CRT is
  single-tint beam intensity, not per-pixel colour (see `term.js`), so the
  layered depth of the reference design is stood in for by a
  FAINT copy of the wordmark offset one cell down-right, drawn first, with
  the BRIGHT glyph on top -- a monochrome bevel/shadow instead of a colour
  gradient. Static and fully lit by design, not flickering like NEON SIGN
  -- reads as a stable logo, not a scene. No
  mention of the audio tap on this screen, which read as out of place here.
  **Live QA fix, same evening**: the naively-centered logo's bright rows
  straddled `STATION_Y`, the row `powerDown()`'s 54th-pass phosphor
  burn-in ghost draws the last-locked callsign onto -- that ghost used to
  land somewhere the STANDBY layout never reached, and now sliced right
  through the middle of the wordmark, turning it into an illegible
  double-exposure on the way into standby. `standbyLayout()` now nudges
  the block up on desktop when the natural centering would collide,
  landing the ghost row in the shadow buffer below the logo instead
  (mobile never draws that ghost, so it stays purely centered).
  **Reversed the next evening**: that nudge ran on every STANDBY paint,
  not just the power-down transition, which is why the whole screen sat
  noticeably above true center on a fresh page load too. `standbyLayout()`
  is now always true-centered on desktop; the collision is instead handled
  where it actually happens -- `powerDown()` just skips drawing that one
  ghost line on the rare frame where it would land on the wordmark. On the
  live 80x25 grid that collision is permanent given today's fixed layout
  constants, so in practice the ghost no longer draws on desktop at all --
  a stronger, reliably-centered STANDBY screen was judged worth more than
  that one small mechanical touch. Also added **`[I] INFO`** next to the
  power-on hint (desktop only) -- a deliberate second exception to "a
  powered-off set ignores every key but P" (same "would a real analog
  radio have this?" test the 29th pass used for play/pause: an info
  placard on a dark receiver isn't power-gated either). Opens the Guide
  straight to the About page; closing it lands back on STANDBY rather than
  rebuilding chrome that was never actually there.

  **Live QA caught a race the same evening**: `poweredOn` flips false the
  instant `powerDown()` is called, but its collapse animation keeps painting
  the screen for another ~900ms on its own timers (see `powerDown()`'s beats
  array). Pressing `[I]` in that window opened the guide on top of a screen
  that was still mid-collapse underneath it -- both kept drawing into the
  same buffer, producing a garbled overlap. This is the exact same trap
  `powerUp()` already guards against for an impatient double-`P` press (its
  50th-pass fix), so `[I]` now uses the same guard: gated on `_powerAnimating`
  in both `isMappedKey()` and `key()`, not just `poweredOn`. Verified against
  `program.poweredOn`/`._powerAnimating`/`.guideOpen` directly (not just
  screenshots) that `[I]` is now a no-op mid-collapse and opens cleanly once
  STANDBY actually lands. Separately confirmed the CRT ghosting seen while
  investigating this is unrelated and pre-existing -- the same phosphor-decay
  smear reproduces identically on the old `[G]` guide-open path from the
  normal powered-on screen, so no change was needed there.

  **Power on/off rethought entirely, same evening (68th pass).** Matthew's
  framing: STANDBY was still being treated as "off" underneath, complete
  with a ~5.5s cold-boot POST readout on every single power-on and, on the
  way back down, a ~900ms "the tube is dying" spectacle (voltage surge,
  signal-loss glitch, a collapse to the centerline, to a point, to STANDBY).
  That collapse sequence was also the actual source of the race just above
  -- async beats on their own timers, exactly the kind of thing a
  well-timed keypress can land in the middle of. Reframed: STANDBY is the
  receiver's resting *on* state, not off -- the tube stays lit the whole
  time, `[P]` is "tune in" / "step back to idle," not "switch the set on
  and off." Concretely: `init()` now plays a genuinely cold "tube coming to
  life" flourish (a quick brightness ramp up from a dim floor, silent --
  there's no user gesture yet for a sound to survive autoplay policy
  anyway) exactly once, ever, on first page load; every later `[P]` never
  replays it. `powerUp()`'s boot POST is kept (Matthew's call -- it's a nice
  touch) but compressed from ~5.5s to well under 2s, and no longer opens on
  a "tube-off dot lighting back up" -- there's no dot to light back up from
  anymore, so it opens on a brief signal-acquisition glitch scattered over
  the STANDBY wordmark itself instead, reading as "locking on" rather than
  "coming back from dead." `powerDown()` lost the entire collapse sequence
  -- one beat, ~120ms, straight to STANDBY, with `playPowerDownSound()`'s
  ~0.6s dying-tube sweep swapped for `playPanelSound(false)`'s quick,
  gentle closing click. The phosphor burn-in ghost (54th pass) survives the
  cut -- arguably reads better now, as "you were just listening to this" on
  a set that never really powered off, than as one beat in a fake shutdown.
  Removing nearly all of powerDown()'s timer surface also removes nearly
  all the room for a race like the one just above to recur -- the `[I]`
  guard still holds (verified directly against `_powerAnimating` timing at
  the new, much smaller window), but there's now much less clock to race
  against in the first place. The mobile-critical synchronous
  audio-unlock/live-tap logic at the top of `powerUp()` (rounds 4/5/8) was
  deliberately left untouched -- only the animation timing and visuals
  wrapped around it changed.

  **Same evening, round 2 (69th pass) -- live QA (Matthew's screenshots)
  found three things.** First, the cold-open flourish in `init()` was
  silent; added `playPowerOnSound()` alongside it so the very first "tube
  coming to life" moment on page load has the same sound as every later
  power-on (with the one honest caveat that a truly fresh, unclicked load
  may still render it silently the first time -- browser autoplay policy
  generally keeps a fresh `AudioContext` suspended until a user gesture,
  and there isn't one yet at that exact instant; every real power-on
  afterward is a real gesture and unaffected).

  Second, the POST readout from the 68th pass's first cut (compressed to
  under 2s) read as too fast to actually watch once verified live -- slowed
  back to a calmer ~3.2s middle ground, still well under the original
  ~5.5s cold boot.

  Third, and the real fix: **the STANDBY wordmark could still come up
  visibly broken/doubled after powering off**, exactly as the screenshots
  showed. Chased two wrong hypotheses first -- a decay-ramp-down and then
  `crt.js`'s `clearPersist()` (the right tool for an analogous tint-switch
  bleed bug, 2026-08-22) -- both shipped, both retested live, neither
  changed anything, which was the tell that this wasn't a phosphor-
  persistence artifact at all. Root cause was two genuine stray writes
  landing on top of the finished STANDBY picture, both the same bug class
  the 20th/29th passes had already caught and fixed for `guideOpen` on
  this exact code, just never extended to `poweredOn`:
  `drawPlayback()` -- `player.pauseVideo()` (called from `powerDown()`)
  triggers the YT iframe's PAUSED state change *asynchronously*; its
  `onStateChange` handler routes through `setPlayState()` into
  `drawPlayback()`, which only guarded `guideOpen`, so a callback landing
  after STANDBY was already drawn painted a stale "|| PAUSED" + progress
  bar straight into a row that falls inside STANDBY's centered layout on
  some grid sizes. And `playBootFlicker()` -- its own ~500ms tail of
  `setTimeout`-scheduled chrome-box-border redraws (run from `powerUp()`'s
  reveal beat) already had a 20th-pass `guideOpen` guard with a comment
  describing this exact "doesn't know what happened after it was
  scheduled" trap, but likewise never extended to `poweredOn` -- so
  powering off during that tail let its stray redraws land on STANDBY too.
  Neither ever showed up as a CRT persistence artifact; they were real
  second writes into the term buffer, which is exactly why the buffer-level
  fixes (`!this.poweredOn` added to both) hold under repeated live
  power-on/off testing -- both the settled case and the tight-timing case
  (power-off fired deliberately inside `playBootFlicker`'s tail) -- verified
  clean via direct `term.chars[]` dumps and, more importantly, via real
  click/keypress-driven screenshots, not just state inspection.

### Bug fixes

- Pressing the preset for a station you're already locked to and
  currently listening to used to pick a new random track instead of
  doing nothing -- the one remaining non-radio-ish behavior on the roster.
  Root cause: `_primeStationAudio()` decides whether to resume or pick a
  fresh track off `lastPlayback[station.id]`, which is only written when
  you leave a station — pressing the preset you're already on had no
  such entry, so it always read as "too long since you left" and grabbed
  a new track. `presetTune()` now checks `this.lockedStation === station`
  up front and bails out completely (no sweep, no reload) — the current
  track keeps playing exactly where it is, with a brief `PRESET n` status
  flash so the press still visibly registers, same mechanism as VOL/MUTE.

### Lyrics

- **Synced lyrics in the visualizer.** `[L]` in the visualizer's control
  legend takes over the effect canvas with a centered, teletext-style
  crawl of the current track's lyrics, timed against playback and pulled
  from [LRCLIB](https://lrclib.net) (free, keyless, no backend needed —
  confirmed CORS-open directly from the browser). Looked up automatically
  on every track change and cached for the session so a track never gets
  queried twice.
- `[L]` only lights up (bold) when the current track actually has
  time-synced lyrics available; otherwise it sits dim and does nothing if
  pressed — no dead-end "not found" screen. A plain-text-only match
  (lyrics exist but nobody's timed them) is treated the same as no match
  at all, since a static wall of text can't do the one thing this feature
  is for: following the line that's playing right now. Skipping to a
  track with no lyrics while the view is open falls back to the station's
  normal visual automatically.
- The volume hint (`[UP/DN] VOL`) was dropped from the visualizer's
  on-screen legend to make room — Up/Down still silently adjusts volume
  in the visualizer exactly as before, same as `[E]XIT` already only
  names one of the many keys that actually exit.
- Legend entry spelled out to `[L]YRICS`, matching the bracket-fold
  convention every other full-legend entry already uses (`[C]OLOR`,
  `[M]UTE`) — it was just `[L]` at first.

### Bug fixes

- **Voice drops cutting off at the end again** — the general one-liner
  clips (`oneliner01/2/3.mp3`, `thanks01.mp3`) had 0.24–0.33s of real
  trailing silence, less than `playProcessedVoiceClip()`'s 0.4s fade-out
  window, so the fade genuinely started while speech was still playing
  and clipped the tail. This is the same bug class the station-ID clips
  already hit once (see the 0.25s→0.4s widening above) — that fix
  widened the code-side window *and* re-trimmed/padded those specific
  assets, but the one-liners were recorded in a later pass and never got
  the same padding. Fixed the same way this time: padded 0.3s of true
  silence onto the end of all four files (via `ffmpeg -af apad`) rather
  than touching the shared envelope again, so every voice-clip asset now
  carries the same ~0.5-0.6s safety margin the station IDs already have.

### Title bar (2026-08-28)

- **The nameplate is `SG-1  -  SIGNAL RECEIVER` now, not `MODEL SG-1  -
  SIGNAL RECEIVER`.** Row 0 is the busiest row on the screen -- wordmark,
  sleep countdown, plate and clock all share it -- and "MODEL" was the least
  load-bearing thing on it: the set is called the SG-1, and the word only
  announced that a model number followed, which the shape of the line already
  says. The sleep timer sits immediately left of the plate and had two clear
  columns at its widest reading (`SLP 60:00`); it now has five. Six columns
  came off the plate but only three of clearance came back, because the plate
  is centred and returns half of what it loses at each end.
- **The boot readout's banner lost it too**, deliberately in step. The
  nameplate and the POST banner are the two places the set says its own name,
  and a change that reaches one and not the other is the same drift the
  SYNAPSE rename got caught by.

### Content ops (2026-08-28)

- **Two CIPHER uploads swapped over a playback-stutter report (issue #5).** A
  listener reported sub-second audio dropouts on all three of the station's
  Crystal Method tracks and on nothing else. It is not the artist and not
  that they are official videos — Galvanize and No Good are official videos
  and are fine. They were the only *2007* uploads on the station, the only
  ones YouTube never re-transcoded to modern renditions (480p, 480p and a
  non-standard 350p), and one to two orders of magnitude less requested than
  the official videos that don't stutter; their audio ladders are identical
  to everything else, so it isn't the sound files. `(Can't You) Trip Like I
  Do` moves to a 2017 `- Topic` upload at 1080p (same 4:29 mix, and the title
  and credit corrected on the way — the old string was the YouTube video's
  own title, "[Official Video]" and all, for what is a Filter/Crystal Method
  collaboration). `Keep Hope Alive` moves to a 2018 `- Topic` upload at 720p,
  which is the 6:13 album version rather than the 3:29 video edit — a real
  change in character, taken as the price of a file that plays. **Busy Child
  is deliberately left alone**: its only same-version alternative is another
  480p-capped legacy rendition, so it stays as the control that makes the
  swap an experiment rather than a guess.
- **Issue #19 closed with seven of eight suggestions on the roster**, the
  first outside curation pass CIPHER has had. The eighth, Mindfields, is
  recorded as an *availability* rejection rather than a taste one — no upload
  clears the licence bar.
- **Issue #27 (Semi-Charmed Life on DISTORTION FIELD) passed on lane, not
  availability**, and recorded in both rejection stores with the reasoning
  attached so the next pass doesn't re-litigate it from scratch.

### Stations (2026-08-28)

- **MIDNIGHT NEON became SYNAPSE** — tech house, "rolling basslines, chopped
  vocal hooks, and drops built for a big room." Same dial slot and glyph kept
  again, the third format to hold them: freq 567.8, glyph '≡'. This ends the
  temporary 60s-oldies test rotation that had been running there since
  2026-08-25 with the screen still saying MIDNIGHT NEON — that mismatch was
  the point of the test, and it is over. 30 tracks replace the 71 oldies,
  from a supplied brief, all verified in one clean `audition.js` run
  (`UNVERIFIED: 0`, which is the part that matters — a throttled run reports
  nothing and looks identical to a clean one), all embeddable, licence
  breadth 121-249 countries. Both previous rosters — 28 blues, then 71
  oldies — live only in git history.
- **The station announces itself correctly again, and that needed code.** A
  spoken station ID is resolved by convention from the station's *id*, and
  the id stayed `midnight-neon` because it is load-bearing: `state.js`
  persists it for restored sessions, and it keys the visualizer overrides,
  the curation profile and the pending queue. Renaming it to match the
  callsign would have silently dropped every returning visitor's station. So
  `audio/voice.js` grew a small exception map, id → clip, and the new
  recording ships as `station-id-synapse.mp3`. Without it the station would
  have kept saying "MIDNIGHT NEON" over a screen reading SYNAPSE — the same
  wrong-callsign problem the 60th pass avoided by dropping MOMENTUM's liner
  rather than remapping it. The old clip is left on disk, unreferenced.
- **A rename reaches further than the roster**, which is the lesson worth
  keeping. `stations.js` was the easy part; the spoken ID and
  `tools/station-profiles.json` both still carried the old identity
  afterwards, and the profile is what `audition.js` reads back at you — it
  would have steered the next 30 picks toward electric blues. The profile is
  rewritten for the new lane, with the blues-era rejections preserved under
  `priorFormat` rather than deleted: per that file's own README those are
  qualitative calls that cost real back-and-forth and are not recoverable
  from the roster.

### Network admin backend (2026-08-28)

`node tools/admin-server.mjs` — a dependency-free local server under
`tools/network.html`, which had been a serverless File System Access page
since the 55th pass. Its ceiling was never its design; it was that a page
cannot run Node. Everything the roster work still needed a terminal for was
a Node tool, and everything about a station except its tracks was not
editable anywhere at all.

- **The toolchain, streamed**: lint, the suite, roster verify, stamp,
  stations.md, the dead-feedback sweep, screenshots. PREFLIGHT chains lint →
  suite; roster verify stays opt-in because it asks YouTube about every
  track, and lint failing first means never spending that.
- **Station identity is editable** — `crt`, `meter`, `ident`, `glyph`,
  `visual`, `gain`, `static`, `freq`, tagline, desc. Ident tones play through
  the same chain the receiver uses; the tagline counter and the
  glyph-in-font check are the rules `lint-roster.js` already enforces, read
  from the server rather than restated. A `?station=<id>` boot param runs the
  real receiver in an iframe beside the sliders.
- **SHIP**: stamp → stations.md → lint → suite → add → commit → push,
  stopping at the first failure with nothing committed. The stamp step is the
  one most easily forgotten by hand, which is the whole argument for it.
- **Rejections now have one writer.** Rejecting through the dashboard writes
  both `station-profiles.json` and `pending-tracks.json` and *requires* a
  reason. Previously neither file read the other and both were hand-kept, so
  a dropped track's reason was one forgotten edit away from being lost.
- **What it cost to learn.** The dashboard's tracks patcher had always
  regenerated the array from data, stripping every comment in it — tolerable
  while the block was hand-edited, and not tolerable once removing a track
  was two clicks. Its first real use destroyed 33 lines of "Nth pass" notes
  as a side effect of dropping two tracks. Both patchers now preserve what
  they are not asked to change: comments keyed to their track by
  `youtubeId`, and numeric, quote and indentation style inferred from the
  literal being replaced (`gain: 1.0` must not come back as `gain: 1`; GREEN
  ROOM indents its entries 4 spaces where every other station uses 6). The
  guard is an idempotence sweep in `tests/roster-lib.test.mjs` — rewriting
  every field, nested leaf and tracks block of every station with the value
  it already has must return the file byte for byte. The tracks half of that
  scored 1/11 when first written; that number *is* the bug.
- One more for the "a green suite proves you read your own assumption"
  pile: every API test passed against a dashboard that was completely dead,
  because the page is served at `/admin` and its relative module import
  resolved one directory too high. It rendered its connect screen forever
  with no error anywhere on it. A headless browser load found it; nothing
  else could have.


## [0.9] — 2026-08-23

### Visualizer

- New full-screen transport while the visualizer is open: `[N]` next track,
  `[M]` mute, `[C]` cycle color, `Up`/`Down` volume, a track position bar
  along the bottom row, and `[E]` (or any other key) to exit.
- Every station now runs its own procedural effect built around that
  station's identity, rather than a shared template:
  - **DISTORTION FIELD** — FLAME, a cellular heat/fire simulation. Fixed a
    real bug where switching away and back to this station and re-entering
    the visualizer showed a frozen frame (the effect's internal clock
    wasn't resetting alongside the visualizer's own on re-entry).
  - **COLD WAVE** — FROST, replacing PULSE. Dendrite ice growth seeded
    across the whole perimeter and creeping inward, cellular-automaton
    style.
  - **ATOMIC** — GEIGER, replacing COUNTER. A spring-damper needle gauge
    with a scale arc and a scrolling pen-trace strip chart — a plain
    simulation, no CPM readout or text overlays.
  - **CIRCUIT CRUSH** — OUTRUN, extended with roadside palm trees and a
    distant city skyline silhouette behind the sun.
  - **MOMENTUM** — SKYLINE, replacing STACK. Towers climb floor by floor
    and occasionally break ground on a new build instead of bouncing like
    an abstract data ticker.
  - **HACKBACK** — BOOM BAP gained a small MPC-style pad grid above the
    boombox, wired to the same real 16-step pattern already driving the
    cabinet's sound rings, so the beat is visibly being sequenced rather
    than only implied by the rings.
  - **DRIFT MODE**, **CITY LIGHTS**, **CIPHER**, and the secret station's
    effects are unchanged this release.

### Audio / playback fixes

- Fixed a real bug where desktop audio would go silent after a scan-lock
  or at a track's end and stay silent — interface showing "playing" and
  unmuted — until any key was pressed. Root cause: gesture-gating logic
  built for mobile's autoplay rules was being applied to desktop too;
  desktop now always unmutes immediately regardless of gesture context.
- Fixed boot-time audio starting immediately at power-on instead of
  waiting for the ~5.5s boot reveal to finish.
- Fixed a double-boot bug from rapidly double-pressing `[P]` during the
  boot animation.
- Added a hard-mute mode: mute now silences every sound effect except the
  ambient tube hum and the mechanical relay/switch sounds, which stay
  audible as real hardware feedback would.

### Stations

- Adjusted several station frequencies for cleaner spacing on the dial,
  including moving the secret station to 613.0 with a new lock policy
  (seekable, but only `Enter` can lock it).
- Added a `freqNote` field to every public station — a short frequency
  easter-egg/gag note shown under the tagline in the Guide.
- Reassigned each station's CRT glyph to something thematically tied to
  its identity (checked live against the bitmap font for legibility
  first).

### Content

- Curated the track roster: 20 tracks removed outright, 8 swapped for
  cleaner audio sources (radio edits / official audio instead of music
  videos). Final roster: 250 public tracks (9 stations) + 25 on the secret
  station, all spot-checked live against YouTube's oEmbed endpoint.

### UI polish

- Guide pages and the main footer now bold the bracketed key in each
  control hint (`[N]` stands out from `EXT`).
- Standardized `[N]` as NEXT (was SKIP) and `[C]` as COLOR (was MODE)
  everywhere, main screen and visualizer alike.
- Reordered the footer/legend controls for more logical grouping.

### Docs

- Rewrote the README for 0.9: updated controls, station/track counts, and
  screenshots.
- Added the project wiki (station roster, visualizer effect notes, full
  history).
