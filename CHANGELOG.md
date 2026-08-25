# Changelog

Notable changes to SIGNAL, release by release. This file starts at 0.9 —
everything before that lived only in git history (`git log`).

## [Unreleased]

Landed on `main` after the `v0.9` tag; still version-tagged `v0.9` in the
UI since these are same-evening follow-up tweaks, not a new release.

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
