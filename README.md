# SIGNAL v0.9

A community-facing, unofficial internet-radio-style web toy: a terminal/CRT
tuning-dial receiver with 9 curated stations, real songs, station idents,
scanning, presets, an ambient tube hum, and a power switch.

Built on top of [`cyberspace-crt`](https://github.com/unremarkablegarden/cyberspace-crt),
the WebGL2 CRT text-grid engine open-sourced from [cyberspace.online](https://cyberspace.online).
**SIGNAL is a standalone project — it is not affiliated with, endorsed by, or
hosted by Cyberspace.** It just uses their engine (MIT licensed) to render a
different program on top of it.

![SIGNAL, locked onto COLD WAVE](./screenshots/hero.jpg)

## Try it

**https://hyphen8d.github.io/signal/**

New in 0.9: a full-screen visualizer with its own transport controls for
every station, station-spacing and naming fixes, an audio-autoplay fix, a
hard-mute mode, and a curated track roster. Full history in
[CHANGELOG.md](./CHANGELOG.md). More background and the full controls/station
reference also live on the [wiki](https://github.com/hyphen8d/signal/wiki).

## Screenshots

The in-app guide (`[G]`) -- about, full controls reference, and the station roster:

![The guide overlay](./screenshots/guide.jpg)

Five switchable colors (`[C]` to cycle) -- Classic Amber, Cyber Blue, Monochrome, and Bubblegum Pink, on top of the default Green Phosphor above:

![Classic Amber, Cyber Blue, Monochrome, and Bubblegum Pink display modes](./screenshots/display-modes.jpg)

The full-screen visualizer (`[V]`), with its own transport controls and a per-station procedural effect -- this one's DISTORTION FIELD's fire:

![The visualizer, running DISTORTION FIELD's fire effect](./screenshots/visualizer.jpg)

## The little touches

A tuning-dial radio lives or dies on texture, not just function. A few
things easy to miss from a screenshot alone:

- **The boot sequence** is a ~5.5s retro-BIOS-style POST readout —
  tuner/antenna/preset-table diagnostics in the receiver's own voice, not
  kernel-speak — with the picture visibly warming up in brightness across
  the same window, like a tube actually coming up to temperature.
  Power-down mirrors it in reverse: a signal-loss glitch, the picture
  collapsing to a centerline, then a single dot, then STANDBY.
- **Every station has its own identity**, not just a name and a tracklist:
  a marker on the dial, a distinct musical ident (a short tone motif on
  lock — pitch contour and tempo both vary station to station, so a slow
  ambient station and a punchy synthwave one don't announce themselves at
  the same clip), a static-noise color while you're tuning near it, and its
  own CRT character.
- **The static isn't decorative filler.** Its loudness and pitch both track
  how close you actually are to a station, off the same math the SIG meter
  and the CRT's chroma/snow/roll degrade use — so what you hear, see, and
  read off the meters always agree with each other.
- **Idle imperfection.** Even sitting locked and untouched, the picture
  never looks perfectly static: a slow phosphor shimmer runs constantly
  along the panel borders, and — rarely — a signal briefly rolls or tears,
  like the tuner catching a beat of real-world interference.
- **Text resolves rather than appears.** Callsign, tagline, and track title
  settle out of scrambled noise glyphs over a couple hundred milliseconds
  when you lock or skip, instead of snapping into place.
- **Every control sound is genuine feedback, not garnish** — a relay thunk
  on mute, a volume detent, a keypress click, a thud at the band edges. The
  status row backs all of it up visually too, sweeping and typewriting in
  new text rather than just replacing it.
- **The "would a real radio have this?" rule.** SIGNAL had a play/pause
  button once. It got removed — a real broadcast can't be paused, only
  muted or turned off, and mute already does the honest version of "make it
  stop" without breaking the fiction that the station keeps running whether
  you're listening or not. That test still governs what does and doesn't
  get added.
- **Every station's visualizer is its own procedural effect, not a shared
  template with a palette swap.** Cellular-automaton frost creeping in from
  the edges of the screen for COLD WAVE, a spring-damper Geiger needle for
  ATOMIC, a synthwave sun-and-grid drive (with roadside palm trees and a
  distant skyline) for CIRCUIT CRUSH, a real MPC-style 16-step sequencer
  driving both a boombox's sound rings and a lit pad grid for HACKBACK —
  each one built from the station's own identity, not a generic spectrum
  analyzer wearing nine different colors.
- **The meters and visualizers react to the actual music.** With the audio
  tap live (see "The live audio tap" below), the VU/EQ/FLD readouts and
  every visualizer follow the real signal: the flame flares on bass hits,
  frost tips sparkle on the beat, OUTRUN's road drives at the track's
  intensity, and HACKBACK's pad grid learns the playing track's real
  rhythm. Each effect keeps its own identity — the music modulates the
  process, it never replaces it — and without the tap everything falls
  back to the synthetic motion it always had.

## Run it locally

No build step. Clone the repo and serve the directory over HTTP (it won't
work opened directly as a `file://` URL — the font fetch needs a real
origin):

```
python3 tools/dev-server.py 8000
```

Then open `http://localhost:8000`. That server sends `Cache-Control:
no-store` on every response, which matters if you're actively editing —
plain `python3 -m http.server` can serve you a stale cached copy of
`program.js` mid-edit.

## Controls

| Key | Action |
|---|---|
| `<-` / `->` | Seek |
| `Enter` | Lock onto the nearest station |
| `S` | Scan (auto-sweep, locks when it finds a station) |
| `1`–`9` | Jump straight to a preset station |
| `B` | Back to the previously locked station |
| `N` | Next track on the current station |
| `Up` / `Down` | Volume |
| `M` | Mute |
| `P` | Power off / on |
| `G` | Guide -- about/controls page, a station index, and a full detail page per station (freq/name/description/sample tracks); `<-`/`->` steps through all 11 pages, digits `1`-`9` jump straight to a station's detail page from the index, any other key closes it |
| `C` | Cycle color (Green Phosphor, Classic Amber, Cyber Blue, Monochrome, Bubblegum Pink) |
| `V` | Visualizer -- toggle a full-screen procedural display while a station is locked (also kicks in on its own after a few minutes idle). Inside it, `C` cycles color, `N` skips to the next track, `M` mutes, `Up`/`Down` set volume, and a track position bar runs along the bottom; `E` -- or any other key -- exits |

### Touch (mobile)

Below a narrow, portrait, touch-primary viewport, SIGNAL switches to a
compact "lite" layout (its own 42x22 grid and chrome) and touch gets its
own small gesture set rather than the full control surface above:

| Gesture | Action |
|---|---|
| tap | Power on (when off) / mute toggle (when on and locked) |
| swipe left / right | Step to the next / previous station, in dial order |
| swipe up / down | Next track on the current station |
| two-finger tap | Cycle color |

Scan, presets, back, and volume still have no touch equivalent, and the
guide (`[G]`) has no touch trigger to *open* it -- there's also currently
no way to power back *off* on touch alone. Known gaps, not oversights.

## Stations

9 stations, 250 tracks total (22-30 per station -- counts are uneven by design, curation over symmetry -- plus a 25-track secret station). Full roster with taglines and track lists:
[`stations.md`](./stations.md) — generated straight from the live
`STATIONS` array in `program.js` (`tools/stations-to-md.js`), so it can't
drift from the actual source of truth. Re-run it after editing the station
list:

```
node tools/stations-to-md.js
```

## Content ops

Every track ID in `program.js` is manually verified against YouTube's oEmbed
endpoint before it's added — never hardcoded on faith. That discipline
matters more now that the repo (and the Pages URL) are public: a dead ID
isn't just an internal annoyance anymore.

- **Adding tracks:** verify via oEmbed first, add to the station's `tracks`
  array, then re-run `node tools/stations-to-md.js` so `stations.md` stays
  in sync. No fixed cadence yet — add as you find good tracks, just don't
  let any one station drop below ~10.
- **Station count:** 9 is the agreed ceiling for now — matches the `1`-`9`
  preset keys cleanly, no spillover digit needed. `0` is not part of the
  public preset scheme; if the roster ever grows past 9, decide how presets
  work deliberately rather than assuming `0` is available. RELIC SIGNAL was
  retired in v0.6 and CIPHER moved into its frequency slot, keeping the
  count at 9.
- **Dead videos:** the player now auto-skips on any playback error (private,
  removed, region-locked, etc.) instead of going silent mid-song — same
  behavior as pressing `[N]` manually. It doesn't retry the same ID or flag
  it anywhere, so a station can quietly lose a track over time. Worth an
  occasional spot-check rather than waiting to notice by ear:

  ```
  node tools/verify-roster.js               # whole roster
  node tools/verify-roster.js --station=atomic   # one station only
  ```

  Checks every track ID against oEmbed and prints any that are now dead,
  private, or region/embed-restricted, with a nonzero exit code if anything
  failed (so it's CI/cron-friendly if that's ever wanted).
- **Concept-tied stations:** if a station's premise points at a real source
  (e.g. ATOMIC being an in-universe Fallout radio station), verify tracks
  against *that* source's actual tracklist, not just oEmbed -- oEmbed only
  confirms a video is real and embeddable, not that it's actually the song
  the station claims to be playing. ATOMIC shipped with 5 tracks that were
  genuine oldies but never actually on Fallout's Diamond City/Appalachia
  Radio before this got caught and fixed.
- **Taglines:** keep to 35 characters or under -- they're reused verbatim in
  the guide's station reference table (`[G]` -> `->`), which has much less
  room per station than the STATION box on the main screen does.

## How it's built

- `program.js` — the whole app: tuning, stations, playback, sound effects,
  power sequence, all the CRT-panel drawing. Implements the engine's
  `{ init, frame, key, keyUp }` program contract, plus `{ onTouchStart,
  onTouchEnd }` for the mobile gesture set.
- `src/` — the `cyberspace-crt` engine itself (WebGL2 renderer, CRT shader
  passes, the text grid, bitmap font parser).
- `config.js` — tunable CRT/render parameters, phosphor tints, and
  `MOBILE_LITE`: an off-detection check (coarse pointer + narrow portrait)
  that swaps the grid from the desktop 80x25 down to a compact 42x22 for
  phones, with its own chrome/status-row drawing paths in `program.js`.
- `index.html` / `main.js` — thin bootstrap that mounts the engine and hands
  it `program.js`.
- `fonts/` — Terminus bitmap font (SIL OFL 1.1, separate from the MIT
  license below — see `LICENSE`).
- `tools/` — dev server and the station-roster doc generator.

Playback is real YouTube video via the IFrame API, audio-only in practice —
the player is docked off-screen since the terminal is the only visible UI.
Because of that, listeners without YouTube Premium may see a YouTube ad
before a track starts — that's YouTube's embed behavior, not something
SIGNAL controls or attempts to suppress. The in-app Guide (`[G]`) says so.

**The live audio tap.** Browsers won't let a page read audio out of a
cross-origin iframe, so the meters/visualizers get their signal by
capturing it outside the player instead: at power-on, desktop Chrome/Edge
ask to share this tab with audio (pick "This tab" + "Also share tab
audio"; the boot readout then reports `AUDIO TAP: LINE`), and every other
browser — mobile included — falls back to the microphone hearing your
speakers (`AUDIO TAP: MIC`; that grant is remembered, so later visits
start silently). Decline either prompt and nothing breaks: every meter and
visualizer simply keeps the synthetic animation it always had. The capture
is analysis-only — it feeds an AnalyserNode and nothing else, nothing is
recorded, and nothing leaves the page.

## Credits

The live audio tap, and the visualizer audio-sync work it drives — the
meters and every full-screen effect reacting to the real playing track —
is the work of **End Dream**.

## License

MIT — see `LICENSE`. The bitmap fonts in `fonts/` are separately licensed
(SIL Open Font License 1.1); see `fonts/OFL.txt`.
