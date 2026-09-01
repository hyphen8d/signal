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


### Weather (2026-08-29)

`[W]` opens a weather card: today in three parts — morning, afternoon,
evening — each with a high, a condition and a chance of rain, plus sunrise
and sunset, with the part you are currently in picked out. A live reading
also sits in the title bar opposite the sleep timer, refreshed every fifteen
minutes while the set is on. "Would a real radio have this?" answers this
one without argument: a station reading out the local forecast is not a
feature bolted on, it is most of what daytime radio is.

- **It draws over the set rather than replacing it**, unlike the guide and
  the LINE INPUT card. Weather is an aside, not a destination — the dial
  above and the meters below stay lit and moving underneath. The cost is
  that it cannot use the "nothing else may paint" contract the full-screen
  overlays get, so `weatherOpen` joins them in every paint guard.
- **Location is asked for through a consent card**, the same shape as `[A]`,
  and only ever from the keypress. Saying no costs nothing and `[W]`
  re-opens it. Coordinates and readings are held in memory for the session
  and written nowhere; only the answer to the question is persisted.
- **Geolocation needs a secure context.** On plain `http` the API exists,
  the call runs, and the error callback fires with code 1 —
  `PERMISSION_DENIED`, the same code a genuine refusal gives — saying "Only
  secure origins are allowed". Conflating those would have remembered a
  visitor as having declined forever, on every origin, because they once
  pressed `[W]` on an http URL. They are separated. The practical
  consequence: this cannot be exercised over a bare IP, only `localhost` or
  the deployed site.
- Three bugs that 161 passing tests could not see, all found by rendering:
  card copy at 52 characters wrote through a 50-column box border; the
  title-bar readout started where the brand plate ends and rendered as
  `SIGNAL RECEIVER69F CLEAR`; and pressing `[W]` said `NO READING` for the
  whole time it was loading, because `!this._wx` was being read as "we
  looked and found nothing" when it is equally true before anyone has
  looked. Widths are asserted as data now, and the loading state is a real
  state.

### Audio levels (2026-08-29)

- **The music ducks 50% under station IDs and liner drops**, fast down
  (160ms) and slow back up (520ms) — the asymmetry is what makes a duck
  sound like a desk rather than a volume control being yanked. It cannot be
  a gain node: the music is YouTube's iframe and is not in the WebAudio
  graph, so it is `player.setVolume()` stepped on a real timer to make a
  ramp the API does not provide. Not the effects queue — that stops ticking
  under an overlay, and a duck stopped halfway would leave the music at half
  volume until the guide was closed. The network sign-on line deliberately
  does not duck; it plays over a boot with no track under it.
- **Per-station playback `gain` is gone.** From the 25th pass every station
  carried a multiplier (1.0–1.5) meant to even out loudness between a 1950s
  master and a modern compressed one. It never worked at the volumes people
  use: applied as `min(100, volume * gain)`, the ceiling ate the boost from
  about volume 67 up, so at the default of 70 DRIFT MODE's 1.5× was already
  clipping and at 100 every station came out at exactly 100 with no
  compensation at all — the stations meant to be lifted were the ones that
  lost the lift as the knob went up. It was also never measured (its own
  comment said so) and its per-track escape hatch was used by 0 of 477
  tracks. Every station now plays at the level the listener set.

### Stations (2026-08-29)

Seven of the nine public stations are at 50 tracks; SYNAPSE and ATOMIC are
at 35. 420 public tracks, up from 329.

- **DISTORTION FIELD, CIPHER, COLD WAVE, DRIFT MODE, CITY LIGHTS, HACKBACK
  and CIRCUIT CRUSH** all reached 50. The lanes turned out to differ wildly
  in how hard they are to fill: synthwave is internet-native and every
  candidate auditioned clean, while city pop was never officially uploaded
  and leans on archive channels by necessity.
- **HACKBACK was filled against its own profile's instructions** rather
  than taste — coast balance re-measured (New York was 56%) and the note
  that the station had one woman across 43 tracks. Salt-N-Pepa, MC Lyte and
  Fugees take that to four.
- **Six wrong-artist near misses caught across two stations**, every one on
  a `- Topic` channel where the title matched exactly: Ai Furihata covering
  Kadomatsu, Hirotaka Mori's "Bomber" standing in for Yamashita, "Nanaco"
  for Nanako Sato, Powerwolf for Dance With The Dead, Robert Knight for
  Robert Parker. Only the channel name distinguishes them. Not a city-pop
  quirk, as that profile framed it — a property of searching YouTube.
- **Four track titles were carrying their YouTube upload names** —
  "Sabotage (Official Music Video)", "Le Perv (official video)" and two
  more. `layout.js` draws that field on the dial, so listeners were being
  shown "(Official Music Video)" as though it were part of the song's name.
- **SYNAPSE's spoken station ID was being cut off.** Its clip had 0.23s of
  trailing silence against the 0.4s the playback fade needs, so its last
  word was faded out under listeners. Second time that rule has been broken
  and both times by the newest clip on the disk.

### Roster health (2026-08-29)

`tools/check-roster.mjs` (`npm run health`) — the strict checks used to run
once, on the day a track was added, and never again. `audition.js` asks
`playabilityStatus`, `playableInEmbed` and `availableCountries` of a
candidate; `verify-roster.js` asked oEmbed, and only oEmbed, of the roster.
All three things they catch are things that happen *after*: an upload gets
age-gated, embedding is revoked, or a re-upload narrows the licence.

- The narrow-licence case is why this exists rather than being a
  nice-to-have: **it is invisible from the curator's chair.** A track
  licensed in nine countries including the US plays perfectly here and is
  dead air for nearly everyone else. The first real run found exactly that
  on DISTORTION FIELD — Veruca Salt's "Seether" at nine countries —
  alongside Pearl Jam's "Jeremy" gone `LOGIN_REQUIRED`, which the IFrame
  player cannot satisfy and which had been playing as silence.
- **Incremental because it has to be**: a full pass is one watch-page fetch
  per track against an endpoint that throttles after a few hundred, so a
  one-shot sweep would fail partway every time and return a wall of
  `UNVERIFIED` that reads like findings. It works in batches, keeps its
  record in `tools/roster-health.json`, and stops early when throttled
  rather than recording rows that say nothing.
- Both tools now share `tools/lib/probe.mjs`, lifted out of `audition.js`
  byte-for-byte, so "playable" has one definition and the two cannot
  disagree. `tests/probe.test.mjs` pins the thresholds — 20 countries above
  all.
- **All 477 tracks are now deep-probed**, secret stations included, where
  none had been that morning.

### Network admin dashboard (2026-08-29)

- **Cyber Blue throughout**, derived rather than eyeballed: every neutral in
  the old green set sat in a tight 90–100° band, so each was re-pinned to
  the brutalist phosphor's 202.8°. Blue carries far less luminance than
  green at the same HSL lightness, so the text levels were re-solved to hold
  their original contrast ratios rather than quietly dimming every label.
  Status colours stay warm — pass/fail has to stay green/red.
- **The STANDBY wordmark is the header**, drawn from `layout.js`'s own font
  table rather than a copy, and the favicon is the app's icon retinted to
  the same blue. The app is green, the ops backend is blue.
- **VOICE & DROPS** plays the spoken assets through `voice.js`'s own
  processing chain rather than a mirror of it, and measures each clip's
  trailing silence against the 0.4s the fade needs — which is how SYNAPSE's
  clipped station ID was found.
- **ROSTER HEALTH** renders the record above, findings first.
- **The bind address is no longer printed in the header.** It restated the
  browser's own address bar, and this page gets screen-shared.

### Documentation (2026-08-29)

- `tools/signal-admin.service` is committed. The admin backend runs as a
  systemd user unit on the development box, and CLAUDE.md nowhere said so —
  the unit named CLAUDE.md in its own header while CLAUDE.md had never heard
  of the unit. Anyone reading the docs would reach for `npm run admin` and
  get `EADDRINUSE`, and would not know that editing `admin-server.mjs` does
  nothing until the service restarts while editing `network.html` needs no
  restart at all.
- **Three places stopped sending readers to a wiki with one page in it.**
  That wiki has exactly one page — a welcome message written on the day the
  repo went up and untouched since — and the issue chooser was the worst of
  them, offering "the full controls reference and station roster live on the
  wiki" as a contact link to every person about to file an issue. Someone
  with a question was being routed away from the answer. All three now point
  at the README's own controls table and at `stations.md`, which is
  generated from `stations.js` and so, unlike a wiki page, cannot fall
  behind the thing it describes. The two mentions left in this file are
  deliberate: they describe what was true on the day they were written, and
  a changelog edited to match the present is not a changelog.

### Voice and drops (2026-08-29)

Every spoken clip in `audio/` was re-examined on one pass, and almost
nothing about them turned out to be written down. The voice was named once,
wrongly; the scripts existed nowhere but in the audio itself.

- **The voice is Nathan, not Rachel.** `audio/voice.js` credited "Rachel M
  — Pro British Radio Presenter" as the voice behind every mp3 on disk, and
  that line was the only place in the repo the voice was named — which makes
  a wrong answer there worse than no answer, since it is exactly where
  someone stands before rendering a new clip. Replaced with a full
  provenance block (Eleven Multilingual v2, speed 0.99, stability 81%,
  similarity 100%, style 0%, speaker boost on), and confirmed across the
  whole set rather than the one panel it was read from: the sign-on, the
  welcome lines, all nine station IDs, both liner pools and the retired
  clips still sitting unreferenced are all the same voice.
- **`tools/voice-render.mjs` (`npm run voice`)** renders a clip from the
  command line instead of the web UI, a download and a rename. Saving those
  steps is not the point: the two things that have actually gone wrong now
  happen *between* the render and the file existing. Trailing silence is
  padded to ~0.5s when a take comes back short — safe to automate, since it
  appends digital silence and alters no audio. Peak level is measured,
  reported against the band the existing set occupies, and deliberately
  **not** corrected, because normalising changes the recording and a hot
  take is better fixed by taking it again. Nothing renders without `--yes`;
  the key comes from the environment or a gitignored file, never an argument
  that would land in shell history.
- **Round frequencies drop the decimal.** A station says "HACKBACK, eight oh
  eight", not "eight oh eight point zero", and the generator said the
  latter — wrong for six of the nine stations on the dial. Found by
  rendering, not by reading: the test clip ran 2.09s against the existing
  clip's 1.43s on the same callsign, same voice, same settings, and 0.66s
  can only be words. Had the tool rendered straight over the file the way
  its default `--out` does, the comparison that exposed it would have been
  overwritten by the thing it was meant to expose.
- **All nine station IDs re-rendered**, and every one came back with a short
  tail — 0.102s to 0.390s, not one of them clearing the 0.4s the playback
  fade needs. That settles what SYNAPSE's clipped ID was: not a bad take,
  just the first one anybody measured. Any clip from this voice needs
  padding. The re-render also showed the old set was *inconsistent* rather
  than uniformly wrong — DRIFT MODE and ATOMIC barely moved, so their clips
  already omitted the decimal, while CIRCUIT CRUSH lost 0.48s and CITY
  LIGHTS 0.30s. Nine clips recorded across several passes had drifted into
  two different scripts. They are one script now, every tail at 0.500s, peak
  spread 4.1dB.
- **The bug that run found is the one worth keeping.** The renderer derived
  its output path from the station id, and SYNAPSE's id is still
  `midnight-neon` — so the re-render wrote to `station-id-midnight-neon.mp3`,
  a retired file nothing reads, while the clip the set actually fetches sat
  untouched. The tool reported success. Nothing was wrong except the result.
  `voice.js` had carried a comment about exactly this trap since the rename
  and the tool still walked into it, because it could not import the map
  (`voice.js` top-level-awaits `sfx.js`, which wants an AudioContext Node
  does not have). The map now lives in `audio/station-id-clips.js` — pure
  data, no imports — with two readers and one definition.
- **The thirteen liner scripts were transcribed, and the format is the
  finding.** Every station liner is *hook first, then the callsign and
  frequency*. Not one opens with the callsign. That is invisible from the
  filenames and from the code, and the thirteen replacement drafts written
  earlier the same day all opened with the callsign and omitted the
  frequency entirely — rendered to scratch, found to be the wrong shape, and
  binned. That is the whole argument for transcribing first, and it cost
  thirteen renders to learn. The transcripts independently confirm the
  decimal rule arrived at that morning through duration analysis alone.
- **Thirteen new liners** in the corrected shape: four generals and one per
  station. SYNAPSE gets its first since MOMENTUM was retired, having ridden
  generals alone ever since. HACKBACK's only works with the number last —
  "The number's not an accident. HACKBACK, eight oh eight."
- **Liners fire more often, and the station's own ones actually get heard.**
  A station's own liner was landing on 4.5% of track changes, one in
  twenty-two: the clips carrying the station's identity were the half nobody
  heard. The rate went up a little (25% to 35%); the *mix* changed a lot — a
  drop now picks its bucket before its clip, half station and half generals,
  rather than drawing from a combined pool where the generals outnumbered
  the station clips nine to two. A station's own liner now lands every ~6
  track changes. Verified by simulating 20,000 track changes per station,
  which also held the opt-out that keeps the secret stations silent: an
  absent key means no liners at all, an empty array means generals only.
- **CIRCUIT CRUSH's station ID says "Serkit".** This voice reads "CIRCUIT"
  wrong when it *opens* a line; three spellings were rendered and judged by
  ear. The interesting half is that it is context-dependent — the liner
  containing the same two words mid-sentence was already right and stays
  unrespelled. Recorded as `CALLSIGN_RESPELL` rather than fixed once in an
  audio file, because the failure mode is regeneration: the next person to
  re-render this station's ID would have got the wrong pronunciation back
  with nothing to warn them.
- **Audio assets carry the build stamp**, like every module already did. You
  were hearing a cached clip: the re-rendered CIRCUIT CRUSH ID was deployed
  and byte-identical on the server, and the browser went on serving its own
  copy, because Pages answers mp3 requests with `max-age=600` and nothing
  was busting it. `main.js` has versioned every module as `?v=<stamp>` since
  the 2026-08-25 audit against exactly this ten-minute window; the audio was
  fetched by plain path and had simply never been included. It never showed
  up before because until that day clips were only ever *added*, and a URL
  nobody has fetched cannot be stale. All 36 clip requests verified carrying
  the stamp in a real browser.

### Visualizer (2026-08-30)

- **The idle trigger is retired.** The visualizer entered on its own after
  4m20s of no input, which was right when it was purely a screensaver — a
  receiver left running should eventually show you something other than a
  static dial — and stopped being right once the visualizer became a place
  with state in it. Taking the screen unasked means covering a weather card
  someone is reading, dropping a lyrics view, and, the one that actually
  decides it, re-arming every effect clock underneath a listener who never
  asked to go anywhere. `[V]` is now the only way in. Mobile never had it.
  The call is deleted rather than left behind an `if (false)`: a condition
  that can never be true is something the next reader has to disprove.
  `VISUALIZER_IDLE_MS` stays exported and `_lastInputAt` stays maintained,
  so putting it back is two lines. Nothing failed when the call was removed
  — four minutes of unattended behaviour had never been tested, and now is.

### Lyrics (2026-08-30)

`[L]` was one `/api/get` on the raw title, and if that missed the story
ended. Nobody had ever asked how often it missed. `tools/lyrics-audit.mjs`
(`npm run lyrics`) asks: on 101 tracks across all 11 stations the original
lookup resolved **59%**. With the `/api/search` fallback, **76%**.

- **A search result is not a match.** LRCLIB orders by its own relevance, so
  for several roster tracks the top synced hit is a live cut whose timings
  fit nothing — a search for Piggy returns a 288s live take above the album
  version. `pickLyricMatch()` ranks by closeness to the length actually
  playing. Taking row zero is the bug this exists to prevent.
- **Which exposed the sync bug underneath.** Fourteen sampled tracks
  *already* matched a recording of visibly the wrong length: a 277s lyric
  against a 166s upload, a 224s one against 416s. Those were rendering as
  confident drift. Past `LYRIC_DURATION_TOLERANCE` the answer is refused,
  because `NO LYRICS AVAILABLE` beats lyrics that disagree with the song.
  Two causes hide in that gap — a different recording, or an upload with
  lead-in padding — and nothing separates them automatically, so both are
  refused; an offset for the second is not built.
- The duration is 0 when `loadTrack()` asks, so the first answer is ranked
  and gated against nothing and the PLAYING handler asks again with the real
  length; `rankedBy` is what stops that looping.
- A dropped request is `'error'` and retryable, **not** `'unavailable'`.
  Both used to write the same permanent verdict into a cache keyed by
  `youtubeId`, so one flaky request cost that track its lyrics for the whole
  session — on a feature whose job is to be there when you press `[L]`.
- `parseLRC` keeps blank tags as sentinels. An empty tag *ends* a sung
  passage, and dropping them left the previous line lit at full brightness
  through an instrumental, still claiming to be current.
- **Title normalisation was tried and rejected on the evidence.** The
  roster's decorations ("Piggy (VEVO Presents)") genuinely do 404 on
  `/api/get`, so stripping them looks obviously right; measured, it
  recovered nothing the search fallback had not already caught. It stays in
  the audit tool so the claim is checkable, and out of `voice.js`.
- The harness fake was rebuilt from the real endpoints rather than from what
  this code expects — `/api/get` returns one object or a 404, `/api/search`
  returns an array, and both carry `duration`. The old fake answered every
  LRCLIB URL with one shape, which could not express the fallback at all and
  would have passed every duration gate by accident.

### Roster health (2026-08-30)

- **Something now remembers to run the checker.** The NIN track below had
  been licensed in three countries since the day it was added, and the only
  reason it got found is that somebody happened to run the deep probe by
  hand the evening before. `tools/roster-watch.mjs` (`npm run watch`) is not
  another checker — it is the scheduling and the speaking-up around the one
  that already works. **The rule it exists for:** `check-roster` exits 0
  when throttled, because it found nothing wrong; it merely never looked. So
  the obvious scheduler — fire it, read the exit code, stay quiet on 0 —
  reports an unfinished sweep as a clean bill of health, which is that
  tool's own header warning leaked one level up. `roster-watch` reads the
  `--json` summary's `throttled` flag and treats it as its own outcome.
- **Quiet on purpose.** Clean runs say nothing, and a single throttled run
  says nothing either — that is ordinary and self-correcting. It speaks on
  findings, on a sweep stuck 3 runs, and on a checker broken 2 runs. A
  notification that fires daily is wallpaper inside a week, and wallpaper is
  how the original bug survived.
- **Daily, batch 40, as a systemd user timer** (`tools/signal-health.service`
  and `.timer`). 477 tracks walk in ~12 days, inside `check-roster`'s 30-day
  staleness horizon, without tripping the rate limit. Turning the batch up
  is the obvious temptation and a trap: a throttled run records nothing for
  what it gave up on, so a bigger batch makes *less* progress per day.
  Verified running under systemd rather than only from a shell, and
  `notify-send` verified actually reaching the desktop from a unit's
  environment — that dies silently when the user manager has no session bus,
  which would have left this running every day and telling nobody.
- **The dashboard can tell a stopped health check from a quiet one.** The
  notification is a one-shot channel: dismiss it, or have the box asleep
  when findings land, and nothing re-raises it. The ROSTER HEALTH panel now
  opens with a liveness strip above the coverage bars. Everything else on
  that panel renders the *record* — and a timer that got disabled and a
  timer with nothing to report leave that record looking identical, so a
  stopped checker would go on showing a clean, fully-covered roster forever.
  Past a two-day grace, `scheduleHealth()` says the schedule is LATE.
  `GET /api/health` returns `watch` alongside the record rather than adding
  a second route, because the panel must not be able to render coverage
  without also being able to say when that coverage was last advanced.
- **Health records are pruned for tracks that left the roster.** Retiring
  DRIFT MODE stranded its 50 records and nothing had ever removed one, so
  the file grew monotonically with every curation pass. Nothing was wrong as
  a result — `summarise()` walks the roster and looks records up, never the
  reverse, so an orphan cannot reach a coverage bar or a finding, which is
  exactly why it survived unnoticed. Two ways this deletes real history, both
  guarded: pruning against the run's own track list would honour
  `--station`, so one station's sweep would wipe every other station's
  record; and an empty roster means "cannot tell", not "nothing is live",
  since a new station is committed with `tracks: []` before it is filled.

### Stations (2026-08-30)

420 public tracks across nine stations, seven of them at 50. DRIFT MODE
leaves the dial and NEON STASIS takes its frequency.

- **One NIN track was dead for nearly everyone but the curator.** The first
  deep probe flagged "Right Where It Belongs" at three countries. The song
  is not the problem and neither is `- Topic` in general: NIN's Topic
  uploads from that era are licensed in three countries while the same era's
  video-channel uploads are at 249. The US is inside that three, which is
  why it survived every check that ever looked at it — it played perfectly
  from here. It was also never catchable by the tooling of its own day: the
  track went in at 13:18, `audition.js` was not written until 16:44 that
  afternoon, and the narrow-licence threshold landed a day after that. The
  song stays and the upload changes; there is no wide-licence official
  alternative, because no video was ever made for this track, so the
  replacement is a fan upload at 249 countries picked by ear from five that
  were probed. That trade is now the station's own — a fan upload can vanish
  to a copyright claim where a Topic one will not — and `check-roster.mjs`
  is what catches it when it does.
- **NEON STASIS takes 321.0, and mallsoft replaces the ambient lane.** A
  replacement, not a rename, so it takes a new id the way MOMENTUM →
  MIDNIGHT NEON did. Frequency, dial glyph and the DRIFT effect are
  inherited deliberately; the ident is genuinely new — a department-store PA
  chime, D D U, the only ident on the dial with that shape. Two constraints
  shaped the 25 founding tracks and both were *measured* rather than
  reasoned about: searching the three records that define mallsoft returned
  18 candidates of which 18 were one-file album rips running 30–90 minutes,
  and `ter-u16n.bdf` carries no CJK and no fullwidth Latin, so the uploads'
  own credits would have drawn on the dial as rows of question marks. Every
  name is romanised for that reason. DRIFT MODE's 50 tracks are preserved in
  a retirement comment and its curation profile is kept and marked retired —
  that profile is the only surviving record of where its neoclassical
  boundary sat, so it outlives the station.
- **SYNAPSE reaches 50**, the last public station still at its founding
  size. 34 artists to 47: it was unusually flat before, so the low-risk half
  of a pass like this — second cuts by artists already trusted here — was
  almost entirely unused. Both traps the profile warns about were live and
  are the same question wearing two hats, *which upload is this really*: a
  1:14 festival clip beside the 3:09 VEVO audio, and extended-vs-single,
  where the titles routinely do not say and the durations recorded on the
  block are the record of which was taken.
- **ATOMIC reaches 40 and NEON STASIS 30, on titles that were looked up.**
  ATOMIC's five come straight off the genuine gaps the Diamond City Radio
  check recorded in the profile — that listing, not recall, is what
  satisfies this station's Fallout-canon rule. NEON STASIS's first
  constraint earned itself again and at cost: the first search pass used
  titles from memory and returned nail-salon tutorials and reef-tank
  reviews, because the titles were not real. Reading them off the Bandcamp
  listings first and searching verbatim is the whole difference between a
  run of album rips and a run of singles. The font rule bit somewhere new,
  too — a credit spelled with an o-macron is Latin Extended-A, outside
  `ter-u16n`'s coverage, so it draws as `?` exactly like katakana does. A
  lone accented vowel in an otherwise ASCII credit is an easier trap to
  paste in by accident than fullwidth text is.
- **An over-long station `desc` can no longer hide.** The guide's detail
  page gives `desc` three lines at 72 columns and marks an overrun with a
  trailing "...", which is honest but only reaches someone who opens the
  page — so NEON STASIS's first draft shipped 47 characters over and quietly
  lost the end of its own sentence, invisible to the suite. `lint-roster`
  grows a `desc` rule so the dashboard's identity editor catches it at edit
  time, and a test walks all nine detail pages asserting what was actually
  *drawn* rather than re-deriving the wrap. Desktop only, deliberately: the
  42-column lite layout truncates as a matter of course.

### Audio (2026-08-30)

- **One voice channel: a new station ID cuts the one still playing.**
  Reported from real listening — walking the preset keys left the previous
  station's spoken ID running underneath the next one. `tryLock()` fires the
  ID 500ms after a lock and the clip runs ~2.4s, so a second preset pressed
  anywhere in that ~2.9s window started a second voice over the first. Every
  existing guard passed while it happened: each caller re-checks
  `lockedStation` on the far side of its async gap, but that can only stop a
  clip that has not *started*. Once one was in the air nothing held a handle
  on it at all. `playProcessedVoiceClip` now owns a single live handle and
  cuts it before starting anything new — a station ID, a liner drop and the
  network sign-on are all the same announcer, and a station has one of him.
  Cut rather than queued, because the newest announcement is the one that
  matches what is on the screen and queuing would make a fast walk down the
  presets take *longer* to fall silent the more keys you pressed. Faded over
  80ms rather than stopped dead, since cutting a buffer mid-word clicks.
  Both source buffers are cut, not just the speech one — the hiss bed runs
  the full length of the clip, and leaving it under the next voice is the
  same overlap in a quieter costume.

### The project itself (2026-08-30)

- **A tip jar, and the Sponsor button that is more visible than it is.** A
  Ko-fi link in the README, placed with the feedback section so the two ways
  of reaching the author sit together. `.github/FUNDING.yml` is the half
  that actually gets seen: GitHub renders it as a Sponsor button in the repo
  header and sidebar on every page, rather than only for people who scroll.
  The copy says the radio plays the same either way, which is true and is
  the point.
- **The Ko-fi cover is cut by the same tool that takes the hero.** A
  1200x400 page cover was going to be a manual recrop every time the
  receiver changes — exactly how `og.jpg` went stale, and the reason that
  one stopped being a manual step. It *crops* where `og.jpg` pads, because a
  3:1 box is nowhere near the hero's 4:3 and fitting the whole tube inside
  leaves a small unreadable screen adrift in black. It takes a band instead,
  bezel to bezel, and the offsets land on a box border rather than on a
  rule: a band ending mid-row clips the glyphs it cuts through and reads as
  screen damage.

### Counting listeners, and then not (2026-08-31)

A session-summary system was built, tested, shipped switched off, and rolled
back inside a day. It is recorded here because the reasoning survives the
revert and the next person to want this number should read it first.

- **What it was.** The roster gets enormous curation effort spread evenly
  across nine lanes and nothing had ever said whether that matches what
  people listen to. A pageview counter cannot answer it: SIGNAL is one URL
  that then runs for hours, so every session reads as one view and a bounce.
  So the set summarised itself — one anonymous record per visit, built in
  memory and sent on `visibilitychange`, carrying no identifier of any kind
  (so two visits cannot be joined), no timestamps (only durations), no track
  history (only stations), and a sorted `used` set that carries no ordering
  to fingerprint.
- **Three of the four bugs it hit were invisible to a passing suite**, which
  is the part worth reading out of the history: `currentSince: 0` is falsy
  and the fake clock starts at 0, so the first station of every session was
  silently dropped; the collector *cleaned* map keys instead of rejecting
  them, inventing station ids out of malformed input; and a floor constant
  could never fire because the rounding above it already dropped everything
  under its value — found only by mutation, since the test guarding it was
  decorative. The fourth was plumbing: `new Response('', { status: 204 })`
  throws, because 204 is a null-body status in the Fetch spec, which made
  the one route that matters a 500 in a file that had passed every test it
  had.
- **Why it went.** The machinery was sound, but switching it on meant a
  Cloudflare deploy, a KV namespace, a secret, two environment variables and
  a stamp — six steps standing between the repo and a single number, for a
  radio that is one person's project. A feature nobody will turn on is
  carrying weight for free.
- **A visitor count, in one line.** Cloudflare Web Analytics as a beacon
  script answers the half of the question that is a solved problem —
  arrivals, referrers, countries, devices — for one script tag, no backend,
  and it works on Pages as-is. What it cannot do is written down where the
  tag is, because someone will eventually expect it to grow: station share
  and feature discovery need events from inside the state machine, and
  Cloudflare Web Analytics has no custom events at all. Read the numbers as
  a **floor** — the beacon host is on the common blocklists, and an audience
  that likes a terminal-shaped radio skews heavily toward running a blocker.
- **The tip jar's privacy wording is corrected, and this is independent of
  the revert.** "Doesn't track you" was never true: `index.html` loads
  Google's `iframe_api` on every visit, so Google is contacted whether or
  not you press anything. It now says what actually happens, including the
  visitor count — saying that plainly is better than a blanket claim that
  would have quietly stopped being true.

### Two bands (2026-08-31)

`[B]` switches the dial between **YM** (100.0–900.0) and **ZM**
(1000.0–1800.0). Each band is its own dial with its own stations, its own
`1`–`9` presets and its own guide pages; the tuner box and the scale row
above it are named for whichever one is up, and the set remembers which one
you left it on. SYNAPSE and CIRCUIT CRUSH moved to ZM, and THE CRYPT was
founded there.

- **The ask was more presets, and presets were never the ceiling.** A
  station's `NEAR_THRESHOLD` zone is ±24 units; the dial is 71 columns
  carrying 800, so that zone is **4.26 columns** on screen and the band
  saturates at about 17 stations. Past that, every point on the dial is
  inside something's near zone — and because tuning distance is one shared
  quantity, that takes out the static bed, the S/N readout and the CRT
  degrade together. Nine more preset keys would have been nine more ways to
  *reach* stations there was nowhere to *put*. The ceiling is a property of
  the SCREEN, not of the numbers: widening the band just compresses
  everything into the same 71 columns, and past a point the lock zone drops
  under one column, where "locked" and "near" stop being distinguishable.
- **Named YM and ZM rather than AM and FM**, which is what the issue asked
  for. FM/AM is a promise about SOUND — real AM is narrower, noisier, mono —
  and this second band is deliberately the same radio with more room in it.
  A fake pair promises only "this set has two bands", which is what is true,
  and the frequencies have been fiction since the 8/20 pass anyway. The
  letters ascend with frequency, which is why they are those two.
- **The ranges do not overlap, and that is load-bearing.** The first sketch
  put the second band at real AM's 530–1700, which collides with YM between
  530 and 900 — and CITY LIGHTS already sits at 780.0, so "780.0" would have
  named a station on either band. Held apart, every YM frequency is three
  digits and every ZM one is four, so the digit count alone identifies the
  band even where the label is cropped out.
- **`[B]` was BACK and is now BAND.** BACK walked a stack of recently locked
  stations; the stack, `goBack()` and the push in `tryLock()` are deleted
  outright rather than kept unread. The footer paid nothing — `[B] BAND` is
  exactly as wide as `[B] BACK` was.
- **The switch does not keep your place.** There is no honest mapping from a
  frequency on one band to a frequency on another: the same absolute number
  is usually out of range, and the same proportional position drops you
  mid-band somewhere you have not looked, which reads as the set drifting
  rather than as you moving. It lands at the new band's floor, seeking. The
  lock is dropped rather than carried, because a station on the band you are
  no longer tuned to is not distant — it is not on this dial at all.
- **Both moved stations kept their frequency gags**, which is why those two
  numbers and not any others. CIRCUIT CRUSH's freqNote is "88 mph, the
  DeLorean's time-travel speed" — the joke is the 88, so 1688.0 carries it
  with the note untouched. SYNAPSE's "counting up: 5-6-7-8" has no equivalent
  inside 1000–1800 and was re-cut to 1-2-3-4 rather than dropped.
- Two bugs the tests found rather than confirmed. `enterSeeking()` redraws the
  dial but not the furniture around it — built once at power-on and never
  previously needing to change — so the first working switch changed the
  stations under a heading that still named the old band. And the scale row
  placed its right-hand label at a fixed offset that fits "900.0" and hangs
  "1800.0" over the box border.

### The receiver stops choosing a band for you (2026-08-31)

A fresh boot picked a station at random from the whole roster and set only the
frequency, so roughly three boots in ten came up locked to a ZM station with
the dial still showing YM: the frequency off the end of the scale, the guide
paging the wrong band's index, and `nearestStation` blind to the very station
that was locked.

The first fix set the band from the station, which restored the invariant and
kept the deeper mistake. **A receiver should not choose a band for you at
all.** A real set powers on wherever the switch was left — restored state for
someone coming back, the default for a first visit — and that is what the band
field already holds by the time the boot runs. The pool is now the current
band's stations.

It surfaced as ONE INTERMITTENT TEST rather than as a fault anyone could
reproduce, which is the shape this kind of bug takes: with three of ten
stations on the far band, a single run missed it seven times in ten. Chasing
it test by test was treating the symptom, and the symptom was reporting that
the design was wrong.

### Frequencies leave the voice clips (2026-08-31)

Every spoken clip said its frequency: a station ID was `<CALLSIGN>, <spoken
frequency>` and the liners closed the same way. All 26 were re-rendered
without them.

- **Why, since a real station does announce its frequency:** frequencies
  stopped being permanent. Moving a station between bands used to cost its ID
  and both its liners — three clips and real money per move, a toll on
  rearranging the roster. Dial position is now purely visual and a station can
  move forever without touching audio. The trade is real and recorded where
  the script is.
- **Two liners deliberately keep theirs.** CIPHER's and HACKBACK's second
  clips are the only lines whose HOOK IS THE NUMBER — one is about why 133.7
  is funny, the other is "the number's not an accident" about the 808.
  Trimming those leaves a riddle with no answer. Both stations still sit on
  those frequencies; if either ever moves, the clip is to be retired rather
  than re-rendered.
- **The nine general liners were never in scope** — none of them names a
  frequency or a station at all, which reading the transcripts settled in a
  minute and assuming would have got wrong.
- `spokenFrequency()` retired with its two hard-won rules kept as a note where
  it stood: a round frequency drops the decimal, and a remainder of 1–9 is "oh
  eight" rather than "eight". Both cost a render to find and would cost
  another if frequencies ever go back into the audio.
- Two IDs came back outside the level band and were re-rolled to scratch and
  measured before promoting — COLD WAVE −10.6 → −8.6dB, SYNAPSE −2.4 → −5.8dB.
  SYNAPSE coming back hot is now a pattern rather than an incident. Every one
  of the ten needed tail padding again, which is three sessions running: a
  property of the voice, not of a bad take.
- A side effect worth having: the longest re-rendered liner is 6.3s against a
  previous 8.8s, which shortens the duck that had been holding the music down
  for roughly nine seconds.

### THE CRYPT (2026-08-31)

ZM 1031.0 — the 31st of October, which is the whole of the joke. Dungeon synth
and dark fantasy from the Cryo Crypt label, founded from issue #52. 19 tracks
across four artists, all official `- Topic` uploads at 249 countries with
durations cross-checked against the label's own listing.

- **The first search pass could not have founded it**, and that is recorded in
  the profile because it generalises. Two genre-level searches returned twelve
  candidates and twelve of twelve were full-album uploads, 26:49 to 68:58 —
  the genre is released long-form and uploaded whole, and the dial announces
  one title. The fix is to read individual TRACK titles off a real listing and
  search those verbatim; searching what a record is called returns records.
  The same wall NEON STASIS hit on its founding pass.
- **The font warning was wrong for this label.** All 63 candidate strings
  check clean against `ter-u16n`, Swedish diacritics included — those are
  Latin-1 Supplement, which Terminus covers. The real boundary is Latin
  Extended-A, CJK and fullwidth.
- Two candidates were dropped rather than trusted: real `- Topic` uploads, but
  found by search rather than off a release page, so which album they belong
  to was never confirmed.
- **Named CRYO CRYPT for most of its first day**, after the label it draws
  from, and renamed before shipping. The station id was changed with the
  callsign rather than left behind: nothing had shipped, so there was no
  reason to inherit the callsign/id mismatch SYNAPSE still carries as
  `midnight-neon` -- which is the trap that once wrote a re-render over a
  retired file and reported success. The label keeps its real name where the
  curation profile cites it.
- Its ID renders quiet -- two takes at -8.7 and -9.3dB, both under the band's
  floor. The better one was kept, on the same reasoning CITY LIGHTS was left
  0.1dB under: a third roll is as likely to be worse, and this is well below
  what a listener can hear.
- **An empty station makes the whole suite non-deterministic**, which the
  documented "commit the identity object with `tracks: []` first" workflow
  does not warn about. A fresh boot lands on a random station, so a station
  with no tracks fails a different test on almost every run. Measured rather
  than guessed: three runs with it present gave two different failures, three
  with it temporarily removed gave none.

### Roster tooling (2026-08-31)

- **`tools/stations-to-md.js` carried a byte-identical copy** of the generator
  that also lives in `tools/lib/roster.mjs` as `buildStationsMd()`, and it was
  the one people actually ran — so a change to the library reached the admin
  dashboard and left `npm run stations` producing the old shape. It imports
  the library now and the duplicate is gone. `stations.md` is grouped by band,
  which is not cosmetic: without it the file lists 1234.0 directly beneath
  133.7 with nothing to say why.
- Lint's rules moved rather than loosened. "Exactly 9 public stations" becomes
  **at most 9 per band** — the limit was always the `1`–`9` keys, and those
  are per-band now. Frequency range and neighbour spacing are asked against
  the station's own band, because spacing is a question about one dial: two
  stations a unit apart on different bands are not close in any sense a
  listener can reach.
- The roster-lib idempotence sweep earned itself again, catching two
  formatting faults in a hand-written station block that no amount of reading
  would have found — a glyph written as an escape sequence rather than the
  literal character, and an empty tracks block that was not the patcher's
  canonical shape. Both would have made the dashboard rewrite the file the
  first time anyone touched that station.

### TRADEWINDS and SLOW ORBIT (2026-09-01)

ZM goes from three stations to five.

**TRADEWINDS**, 1559.0 — exotica and tiki lounge, played straight rather than
winked at. 13 tracks across Ixtahuele, The Tikiyaki Orchestra, Kava Kon and
Arthur Lyman. The frequency is for the '59 in it, the era this music owned; it
beat an earlier 1509 (the digits of 1950 rearranged) because the joke wants
the year *in* the number rather than adjacent to it, and it happened to land
in the band's widest gap.

**SLOW ORBIT**, 1092.0 — ambient and downtempo, chillout with a pulse. 11
tracks across Jens Buchert, Bistro Boy, Lemongrass, Celeste Lear and Sounds
from the Ground. 1092 is the ISS going round once, in about 92 minutes.

- **The boundary worth writing down is TRADEWINDS against ATOMIC**, not
  against anything modern. Both live in the 1950s and both are lounge-adjacent,
  so the profile states the split where `audition.js` reads it back: ATOMIC is
  Fallout canon, constrained by an in-universe tracklist, and TRADEWINDS is
  exotica — the Polynesian-pop fantasy specifically. Revival acts belong beside
  the originals; a station that took only Denny and Lyman would be a museum,
  which is why Kava Kon and Ixtahuele are more than half its roster.
  SLOW ORBIT's boundary is against NEON STASIS: mallsoft is found sound
  deliberately degraded, this is produced music at full fidelity that simply
  moves slowly — and it has a beat, which is what separates it from THE CRYPT.
- **The compilation trap appeared in both searches, exactly where the profiles
  predicted it** — a 39:50 full-album upload in the tiki lane, a 49:41 "Best
  of" in the downtempo one. Reissue and netlabel catalogues distribute that
  way and the dial announces one title, so the test stays on the *file*.
- **Two titles were passed on the title alone**, and the reasons are recorded
  in both rejection files because neither reads the other. Neither is a
  quality, lane or availability call: the dial displays track titles in full on
  a public site. The order differed and the difference is the lesson — one was
  flagged *after* auditioning and carries a clean probe with its rejection, the
  other *before* any search ran and cost no network work at all. A title
  question can always be answered by reading, and asking it first saves a probe
  against an endpoint that throttles.
- **The rate limit took SLOW ORBIT's entire first probe run** — `UNVERIFIED
  (HTTP 429)` on all eleven rows, nothing beyond oEmbed checked. Waiting
  cleared it and every row passed on the first attempt afterwards. Retrying
  harder would not have.
- Titles were cleaned on the way in: three carried upload decoration on
  YouTube, and `layout.js` draws that field on the dial, so a listener would
  have been shown the uploader's formatting as part of the song's name.
- **Short IDs render quiet from this voice, and that is now a pattern rather
  than an incident.** Both new callsigns came back under the band's floor on
  the first take and both improved on a re-roll — TRADEWINDS to −7.9dB, inside
  it; SLOW ORBIT to −8.6dB, which stays 0.6 under on the same reasoning that
  left CITY LIGHTS and THE CRYPT where they are. Every take was rendered to
  scratch and measured before anything was promoted.

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
