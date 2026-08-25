// SIGNAL -- a tuning-dial radio, rendered entirely through the text grid.
//
// The YouTube player (#ytDock in index.html) is docked off-screen -- this
// is an audio-focused experience, and the terminal is the only UI. Because
// there's no visible player at all, this program is the ONLY source of
// playback feedback (playing/paused, what's on), so that's treated as a
// real UI requirement here, not cosmetic.
//
// Each station has real, verified tracks (see realTrack() in stations.js). Real
// per-station playlists (several hours, no near-term repeat) are still the
// next real step before this goes anywhere near real people.

// 2026-08-25 audit: split into modules. The station roster (stations.js),
// layout, tuning, CRT hooks, audio (audio/), the two screens and the guide
// (ui/), and the visualizer (visualizer.js + visuals/) each live in their own
// file now; this file is the state machine that composes them. Every import
// is the stamped-dynamic kind (`?v=<build>`) so a deploy can never mix a
// fresh program.js with a stale sibling -- see main.js for the scheme.

const V = globalThis.SIGNAL_BUILD ?? ''
import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from './src/term.js'
const { STATIC_CENTRE_DEFAULT, playBandBump, playBootTick, playDetent, playIdent, playKeyClick, playModeThump, playPanelSound, playPowerOnSound, playPresetClick, playPresetWhoosh, playRelayThunk, playSeekStatic, playStaticBurst, setSpeakerMuted, setStaticIntensity, startStaticNoise, startTubeHum, stopStaticNoise, stopTubeHum } = await import(`./audio/sfx.js?v=${V}`)
const { TAP_BANDS, audioTapBootLine, maybeRetryAudioTapInGesture, queryMicPermission, sampleAudioTap, startAudioTap } = await import(`./audio/tap.js?v=${V}`)
const { LINER_FILES, ensureLyricsFetched, loadLinerBuffer, loadStationIdBuffer, loadWelcomeLineBuffer, lyricsStateFor, maybePlayLinerDrop, playNetworkId, playStationId } = await import(`./audio/voice.js?v=${V}`)
const { MOBILE_LITE, PHOSPHORS, SCREEN } = await import(`./config.js?v=${V}`)
const { DISPLAY_MODES, MAPPED_KEYS } = await import(`./constants.js?v=${V}`)
const { crtBase, flashCrtGlitch, flashFocusSnap, rampCrtParams, setCrtCharacter, setCrtDegradation } = await import(`./crt-hooks.js?v=${V}`)
const { BOX_BOTTOM_FLASH_ATTR, BOX_BOTTOM_REST_ATTR, BOX_BOTTOM_ROWS, BOX_X0, BOX_X1, DIAL_X0, DIAL_X1, DIAL_Y, METERS_BOT_Y, METERS_DIVIDER_X, STATION_Y, centerX, clearGrid, standbyLayout, truncate } = await import(`./layout.js?v=${V}`)
const { loadSignalState, saveSignalState } = await import(`./state.js?v=${V}`)
const { NIN_STATION, SECRET_STATIONS, STATIONS, STATION_PRESET_ORDER } = await import(`./stations.js?v=${V}`)
const { FREQ_MAX, FREQ_MIN, LOCK_THRESHOLD, NEAR_THRESHOLD, RESUME_CUTOFF_MS, SCAN_STEP, SEEK_STEP, STATION_COLS, VISUALIZER_IDLE_MS, WARMUP_MS, clampFreq, freqToCol, nearestLockable, nearestSignal, nearestStation, shuffledIndices } = await import(`./tuning.js?v=${V}`)
const { VISUALS } = await import(`./visuals/index.js?v=${V}`)
const { default: desktopUi } = await import(`./ui/desktop.js?v=${V}`)
const { default: mobileUi } = await import(`./ui/mobile.js?v=${V}`)
const { default: guide } = await import(`./ui/guide.js?v=${V}`)
const { default: visualizer } = await import(`./visualizer.js?v=${V}`)

// --- program ---------------------------------------------------------------

export default {
  // 2026-08-25 audit: the program object is composed from mixins -- each is
  // a plain object of methods that expect `this` to be this program. The
  // desktop screen, the mobile screen, the guide and the visualizer shell
  // each live in their own file; what stays here is the state machine:
  // effects queue, init, power, player, tuning/lock, scan/presets, input.
  ...desktopUi,
  ...mobileUi,
  ...guide,
  ...visualizer,

  // --- fx: frame-driven scheduled effects (2026-08-25 audit) --------------
  //
  // Every deferred DRAWING or crt.params change in this file used to be its
  // own setTimeout/setInterval -- 36 of them -- and each one had to
  // re-check poweredOn / guideOpen / _powerAnimating itself before touching
  // the grid, because a timer knows nothing about what has taken the screen
  // over since it was scheduled. The comment history records at least eight
  // separate "timer painted through STANDBY / the guide / the visualizer"
  // bugs, each fixed by adding one more guard to one more timer.
  //
  // These queues replace that mechanism. Entries are ticked from frame(),
  // which already bails out for every overlay state, so:
  //   this._fx        -- the normal queue. Ticks only while powered on with
  //                      no guide up; frozen otherwise, cleared on power-off.
  //                      Nothing on it can ever paint into an overlay.
  //   this._fxAlways  -- ticks regardless of state. For the power sequences
  //                      and the cold-open, which ARE the transition and must
  //                      run while poweredOn is still false.
  // A cancelled tween settles at k=1 (its resting value), so a power-off
  // mid-ramp can't strand crt.params half-way. Audio scheduling stays on the
  // AudioContext clock, and the scan/preset dial sweeps and the clock stay on
  // intervals: those are state machines with their own explicit lifecycle
  // (stopScan), not cosmetics, and they should keep going in a background
  // tab where rAF -- and so these queues -- pause. For the queues, init()
  // sets up a coarse fallback ticker that runs only while the tab is hidden,
  // so a power-on followed by a tab switch still completes.
  fxAfter(tag, ms, fn, { always = false } = {}) {
    return this._fxAdd({ tag, kind: 'after', at: performance.now() + ms, fn }, always)
  },
  /** Repeats every `ms` until fn returns false (or the tag is cancelled). */
  fxEvery(tag, ms, fn, { always = false } = {}) {
    return this._fxAdd({ tag, kind: 'every', every: ms, at: performance.now() + ms, fn }, always)
  },
  /** fn(k) every frame with k running 0..1 over `ms`; fn(1) is guaranteed
   *  as the last call, including on cancel. fn(0) runs immediately unless
   *  delayed. */
  fxTween(tag, ms, fn, { delay = 0, always = false } = {}) {
    if (!delay) fn(0)
    return this._fxAdd({ tag, kind: 'tween', start: performance.now() + delay, dur: Math.max(1, ms), fn }, always)
  },
  fxCancel(tag, { prefix = false } = {}) {
    for (const q of [this._fx, this._fxAlways]) {
      for (let i = q.length - 1; i >= 0; i--) {
        const e = q[i]
        if (!(prefix ? e.tag.startsWith(tag) : e.tag === tag)) continue
        q.splice(i, 1)
        if (e.kind === 'tween') e.fn(1)
      }
    }
  },
  /** Drops everything on the normal queue (power-off). Tweens settle. */
  fxCancelAll() {
    const q = this._fx
    this._fx = []
    for (const e of q) if (e.kind === 'tween') e.fn(1)
  },
  _fxAdd(entry, always) {
    ;(always ? this._fxAlways : this._fx).push(entry)
    return entry
  },
  _tickFx(now) {
    this._runFx(this._fxAlways, now)
    if (this.poweredOn && !this.guideOpen) this._runFx(this._fx, now)
  },
  _runFx(q, now) {
    // Snapshot what's due first: an entry's fn may add or cancel others.
    const due = q.filter((e) => now >= (e.kind === 'tween' ? e.start : e.at))
    for (const e of due) {
      const i = q.indexOf(e)
      if (i < 0) continue // cancelled by an earlier fn this tick
      if (e.kind === 'after') {
        q.splice(i, 1)
        e.fn(now)
      } else if (e.kind === 'every') {
        e.at = now + e.every
        if (e.fn(now) === false) { const j = q.indexOf(e); if (j >= 0) q.splice(j, 1) }
      } else {
        const k = Math.min(1, (now - e.start) / e.dur)
        e.fn(k)
        if (k >= 1) { const j = q.indexOf(e); if (j >= 0) q.splice(j, 1) }
      }
    }
  },

  // Display modes (23rd pass). Cycles the CRT's phosphor tint through
  // DISPLAY_MODES via the engine's existing setPhosphor() hook -- see the
  // comment on DISPLAY_MODES for why this is a curated subset, not every
  // key in config.js's PHOSPHORS.
  cycleDisplayMode(s) {
    this.displayModeIndex = (this.displayModeIndex + 1) % DISPLAY_MODES.length
    // 2026-08-22: routed through applyPhosphor() rather than a direct
    // setPhosphor() call -- if you're locked onto the secret NIN station,
    // its forced red tint should keep overriding the visible picture even
    // as you cycle the underlying preference; applyPhosphor() is what
    // enforces that. See its comment just below.
    this.applyPhosphor(s)
    // 31st pass -- the color-name flash toast was dropped: the antenna
    // pane's mode strip (see drawModeStrip()) is a persistent on-screen
    // readout of the same information the old transient toast announced,
    // so flashDisplayMode() was removed as a duplicate.
    // 38th PASS, HEADS UP: the mode name is back in the status row via the
    // general flashStatus() mechanism, which is arguably that same toast
    // returning under a different name. It is here because the 38th pass
    // brief was "every control should acknowledge itself in the status
    // row" and display mode is a control -- but if it still reads as
    // redundant against the mode strip, deleting the flashStatus line
    // below is the whole revert, nothing else depends on it.
    playModeThump()
    this.flashStatus(s, DISPLAY_MODES[this.displayModeIndex].label)
    saveSignalState(this)
  },
  // 2026-08-22 -- a red theme kicks in when locked onto that station --
  // the single place that decides what phosphor tint should
  // actually be on screen right now: a locked secret station's own
  // forcedPhosphor (see config.js's PHOSPHORS -- forced tints like 'red'
  // and 'purple' are deliberately NOT in DISPLAY_MODES, so neither is ever
  // reachable via the normal [C] cycle) whenever one is the locked station,
  // otherwise whatever the user's normal DISPLAY_MODES preference is.
  // Called from every place mode/lockedStation can change (tryLock,
  // enterSeeking) plus cycleDisplayMode itself, so the picture is always in
  // sync with current lock state instead of each call site having to
  // remember to special-case secret stations on its own.
  // 2026-08-23: reads lockedStation.forcedPhosphor (falling back to 'red'
  // for compatibility) instead of a hardcoded 'red', now that GREEN HOUSE
  // needs its own 'purple' here too.
  applyPhosphor(s) {
    const secretStation = this.mode === 'locked' && this.lockedStation && this.lockedStation.secret
      ? this.lockedStation : null
    // 41st pass: setPhosphor() no-ops when the requested tint is already the
    // active one BY REFERENCE, and applySecretTease() leaves a freshly built
    // array in there -- so coming off a tease has to clear the flag here.
    // 2026-08-25 audit: this also used to force `s.crt.phosphor =
    // PHOSPHORS[name]` before calling setPhosphor(), on the theory that the
    // identity check might otherwise leave a blended tease tint stuck. It
    // never could: a blended tint is a fresh array, so setPhosphor() always
    // sees a change and applies the named one. What the forced assignment
    // actually did, in the pre-audit build, was hand the engine an array from
    // a DIFFERENT config.js instance (see main.js) -- so setPhosphor()'s
    // identity check never matched and clearPersist() flashed the
    // persistence buffer black on every lock, every arrow-step off a station
    // and every [C]. With one config instance, plain setPhosphor() does the
    // right thing: no-op when the tint is already up, tint + persistence
    // clear (the 2026-08-22 afterglow fix) when it actually changes.
    this._teasing = false
    const name = secretStation ? (secretStation.forcedPhosphor || 'red') : DISPLAY_MODES[this.displayModeIndex].key
    s.setPhosphor(name)
  },

  init(s) {
    const { term } = s

    // 2026-08-25 audit -- the effects queues (see fxAfter and friends at the
    // top of this object) exist before anything below can schedule onto
    // them. The fallback ticker only does anything while the tab is hidden
    // (rAF paused, so frame() isn't ticking the queues); at 250ms it is
    // coarse on purpose -- what matters in a background tab is that a boot
    // or a status revert completes, not when to the millisecond.
    this._fx = []
    this._fxAlways = []
    this._fxFallback = setInterval(() => { if (document.hidden) this._tickFx(performance.now()) }, 250)

    // 53rd pass -- kicked off here, not lazily on first powerUp(), so the
    // fetch/decode has the whole time-to-first-power-on to finish. Harmless
    // if it's still in flight when needed (playNetworkId awaits the same
    // promise) and harmless if it never resolves (an asset missing on a
    // fresh checkout, say) -- the ID just silently doesn't play.
    // 55th pass -- also prefetches every public station's verbal ID (for
    // first-lock/preset-change), not just the welcome line.
    loadWelcomeLineBuffer()
    STATIONS.forEach((st) => loadStationIdBuffer(st.id))
    // 56th pass -- liner drop clips (see maybePlayLinerDrop) -- just
    // CIPHER's pilot clip for now.
    Object.values(LINER_FILES).flat().forEach(loadLinerBuffer)

    // 45th pass -- decided once, at boot, off config.js's viewport/pointer
    // check. Every mobile-only draw branch below reads this rather than
    // re-detecting anything itself.
    this.mobile = MOBILE_LITE

    // Leftover from the old 88-108 band -- 93.0 is below the current
    // FREQ_MIN (100.0), so the dial opened already out-of-range. Now starts
    // exactly at FREQ_MIN.
    this.freq = FREQ_MIN
    this.mode = 'seeking' // 'seeking' | 'locked'
    this.lockedStation = null
    this.currentTrack = null
    // 2026-08-24 -- true while the visualizer's [L] lyrics view has taken
    // over the effect canvas in place of the station's normal visual (see
    // drawVisualizerFrame). Only ever true while visualizerActive is also
    // true; exitVisualizer()/powerDown() don't need to reset it explicitly
    // since entering the visualizer fresh always starts with it false.
    this.lyricsViewOpen = false
    this.bags = {}
    // 36th pass: { [stationId]: { track, position, at } } -- see
    // RESUME_CUTOFF_MS above. Populated in tryLock() right before it
    // switches lockedStation away from whatever it currently is.
    this.lastPlayback = {}
    this.scanning = false
    this.scanTimer = null
    // 38th pass -- status row state. statusPersistent is what the row
    // falls back to after a transient flash (see flashStatus); _statusText
    // is what is on screen right now, and doubles as the liveness check
    // every deferred status draw makes before painting (if it no longer
    // matches, a newer status has already claimed the row). The reveal,
    // sweep and flash-revert all live on the effects queue under the
    // 'status' / 'statusFlash' tags (2026-08-25 audit; were three timer
    // handles owned by _clearStatusTimers()).
    this.statusPersistent = null
    this._statusText = null
    this._statusActive = false
    this._statusBracketX = 0
    this._statusBracketLen = 0
    // Which way the last tuning input was headed, so the SEEKING sweep
    // animation travels the same direction you are tuning.
    this._statusSweepDir = 1
    // 38th pass -- in-flight signal-resolve reveals are keyed by row (see
    // resolveText: effects-queue tag `resolve:<row>`) so callsign, tagline
    // and track can resolve independently and at the same time.
    // 38th pass -- next rare idle CRT event, in frame()'s `t` seconds.
    this._nextIdleEventAt = 0
    this.ready = false
    this.player = null
    this.volume = 70
    this.muted = false
    // 13th pass -- the app should default to a powered off state
    // -- the set now boots cold. init() no longer draws the ready-state
    // chrome at all; it lands directly on the same STANDBY screen
    // powerDown() ends on, silently (no relay click/hum -- there's no
    // power to click OFF from, this is before first power-on). Pressing P
    // runs powerUp()'s full beat sequence, same as any later power cycle,
    // so "turning it on" always means and looks like the same thing.
    this.poweredOn = false

    // Visualizer (43rd pass) -- see VISUALIZER_IDLE_MS, enterVisualizer().
    // _lastInputAt seeds to "now" so a fresh page load doesn't idle straight
    // into it before anyone's had a chance to touch anything.
    this.visualizerActive = false
    this._lastInputAt = Date.now()
    // 65th pass -- per-station visualizer effect override, keyed by
    // station.id. Empty until [Shift+C] cycles a station off its default;
    // restored from saved.visualOverrides in the session-restore block
    // below and read by drawVisualizerFrame() ahead of station.visual.
    this.visualOverrides = {}
    // 54th pass -- warm-up drift (see frame()/powerUp()). Both explicit
    // here even though powerUp() always sets _warmupUntil before frame()
    // could ever read it -- matches how every other per-instance field in
    // this block is spelled out rather than left to fall through as undefined.
    this._warmupUntil = null
    this._freqJitter = 0
    // 55th pass -- which stations have already played their organic-lock
    // verbal ID this session (see tryLock()'s announce logic). Preset-driven
    // locks ignore this and always announce; it only gates the "first time
    // you land here by ear" case. Session-lifetime, not persisted.
    this._announcedStations = new Set()
    // 56th pass -- last liner clip path played (see maybePlayLinerDrop),
    // so a station with more than one clip doesn't repeat itself back to
    // back. Irrelevant with CIPHER's single pilot clip today.
    this._lastLiner = null
    // 2026-08-23 (live audio tap) -- the vetted per-frame bus view (set in
    // drawVisualizerFrame; null = render synthetic) and the uniform bloom
    // layer's throttle clock.
    this._au = null
    this._auBloomAt = 0
    // Per-effect state for the visualizer roster (44th pass) -- kept on
    // `this` under _-prefixed names rather than reset on entry, same as
    // vuTrace etc. below: cheap, and there's no reason a column's scroll
    // phase or a glitch beat needs to snap back to a fixed start every time
    // [V] is pressed. 2026-08-25 audit: each effect seeds its own now --
    // see visuals/<key>.js init(); this used to be one ~90-line block here.
    for (const fx of Object.values(VISUALS)) fx.init?.(this, term)

    // Scrolling-waveform VU state (11th pass -- see drawVU()).
    this.lastProgressDraw = 0
    this.vuSample = 0.03
    this.vuVelocity = 0
    this.vuTrace = new Array(16).fill(0) // 18th pass: trimmed from 24, see drawVU()

    // Field-strength readout + EQ ribbon, antenna pane's right margin (30th
    // pass -- a secondary readout made sense alongside thin horizontal
    // ribbons). Own spring-damped state, same pattern as
    // vuSample/vuVelocity above, kept separate so they don't just mirror
    // the VU meter's motion 1:1 -- see drawFieldReadout()/drawEqRibbon().
    this.fieldSample = 0.5
    this.fieldVelocity = 0
    this.eqSamples = new Array(TAP_BANDS).fill(0.08)   // 58th pass: 6 -> 9 bands
    this.eqVelocities = new Array(TAP_BANDS).fill(0)

    // Pulse readout, antenna pane (58th pass -- see drawPulseReadout()).
    // Peak-hold on top of AUDIO_BUS.pulse's own fast decay, own state.
    this._pulseDisplay = 0

    this.history = [] // stack of previously-locked stations, for [B] back
    // Set once below if a saved session is restored, so powerUp() knows
    // the player needs an actual loadTrack() call (fresh YT.Player, never
    // loaded anything) rather than just resuming playback on an already-
    // cued video, which is all a same-session power-cycle needs.
    this.needsTrackLoad = false
    // 2026-08-22, round 4 -- true for the duration of onTouchStart/
    // onTouchEnd/key()'s own synchronous body (set at entry, cleared right
    // before each returns). loadTrack() reads it to decide whether it's
    // safe to unmute immediately (see there) instead of deferring.
    this._inUserGesture = false

    // Restore last session (14th pass -- session persistence) --
    // reads localStorage before anything else touches freq/volume/mute, so
    // a restored session and a fresh one flow through the exact same code
    // below. Only ever restores a *locked* station (see saveSignalState) --
    // a bare tuned-but-not-locked dial position isn't worth remembering.
    // 23rd pass: same restore-before-anything-touches-it flow as
    // volume/mute above, so displayModeIndex is right by the time the
    // STANDBY chrome below (and the setPhosphor() call after this block)
    // draws with it. Defaults to index 0 ('matrix'/GREEN PHOSPHOR), which
    // matches the phosphor mount() already set on the CRT before init() ran.
    this.displayModeIndex = 0
    const saved = loadSignalState()
    // 2026-08-22, round 9 -- audio has to start decoding synchronously
    // inside the power-on tap for the browser to allow it -- see loadTrack()'s
    // round-4/7 comments -- so on mobile there's no way to also hold it
    // silent through the boot animation without breaking that; a round-8
    // attempt to fake the silence with player.setVolume(0) didn't hold up on
    // a real device. Mobile starting muted is acceptable as long as it's
    // obvious to the user -- a genuinely first-ever mobile visit (no saved
    // session at all -- `saved` is null only the very first time, before any
    // preference exists to respect) now defaults muted, so nothing plays out
    // loud before anyone's touched anything. A returning visitor's own saved
    // mute/unmute choice below always wins over this default.
    if (!saved && this.mobile) this.muted = true
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = Math.min(100, Math.max(0, saved.volume))
      if (typeof saved.muted === 'boolean') this.muted = saved.muted
      if (typeof saved.phosphor === 'string') {
        const idx = DISPLAY_MODES.findIndex((m) => m.key === saved.phosphor)
        if (idx !== -1) this.displayModeIndex = idx
      }
      if (saved.visualOverrides && typeof saved.visualOverrides === 'object') {
        this.visualOverrides = saved.visualOverrides
      }
      if (saved.stationId) {
        const ch = STATIONS.find((c) => c.id === saved.stationId)
        if (ch) {
          this.mode = 'locked'
          this.lockedStation = ch
          this.freq = ch.freq
          const track = saved.trackId ? ch.tracks.find((tr) => tr.id === saved.trackId) : null
          this.currentTrack = track || ch.tracks[0]
          this.needsTrackLoad = true
        }
      }
    }
    // 50th pass: hard mute -- seed the speaker bus with whatever mute state
    // survived the restore above (or mobile's fresh-visit default), so the
    // very first WebAudio sound of a muted session is already silent. The
    // bus doesn't exist yet this early (it's lazy, see speakerOut()), which
    // is exactly why setSpeakerMuted tracks the flag module-level: the bus
    // is born muted when some later sound first creates it.
    setSpeakerMuted(this.muted)
    // 28th pass -- sometimes it didn't automatically seek to a
    // station and the user had to figure out to use arrows or hit S -- a
    // first-ever visit (no saved session, or a save that somehow had no
    // stationId) landed in 'seeking' mode sitting at FREQ_MIN with nothing
    // locked, so the set just sat there silently until someone thought to
    // press an arrow key or S. A real radio doesn't power on to dead air by
    // default -- lands on a random preset instead, same as if that preset
    // had been the one restored from a save (same fields, same
    // needsTrackLoad path through powerUp()).
    if (this.mode !== 'locked') {
      const ch = STATIONS[Math.floor(Math.random() * STATIONS.length)]
      this.mode = 'locked'
      this.lockedStation = ch
      this.freq = ch.freq
      this.currentTrack = this.nextTrack(ch)
      this.needsTrackLoad = true
    }
    // Only actually calls into the CRT when a non-default mode was restored
    // -- otherwise this is a same-value no-op on top of mount()'s own
    // setPhosphor(PHOSPHOR) call, cheap either way.
    s.setPhosphor(DISPLAY_MODES[this.displayModeIndex].key)

    clearGrid(term)
    // 63rd pass -- see drawStandbyScreen(): logo, version, STANDBY, the
    // power-on hint, and the clock, laid out and centered together by
    // standbyLayout().
    this.drawStandbyScreen(s)
    // 68th pass -- the one genuinely cold "tube coming to life" moment,
    // ever, once per page load -- everything else (every later STANDBY a
    // power-off returns to, every later power-on) treats the tube as
    // already warm. Content's already drawn above at full brightness;
    // ramps brightness/bg up from a dim floor so the picture visibly gains
    // brightness right after it appears, then settles.
    // 69th pass -- Matthew wants the turning-on sound here too, not just
    // the visual. Called anyway despite the real caveat: a fresh page load
    // has had no user gesture yet, and browser autoplay policy generally
    // keeps a freshly-created AudioContext suspended until one happens
    // (audioCtx()'s own resume() is a no-op with nothing to resume) -- so
    // on a true cold, unclicked load this may render silently the first
    // time, same as any other sound attempted before the first click/key.
    // Every later power-on (a real gesture, powerUp()'s own sound) is
    // unaffected either way.
    playPowerOnSound()
    this._powerAnimating = true // false again in COLD_OPEN_MS, below
    const COLD_OPEN_MS = 500
    rampCrtParams(
      s,
      { brightness: SCREEN.brightness * 0.15, bg: SCREEN.bg * 0.15 },
      { brightness: SCREEN.brightness, bg: SCREEN.bg },
      COLD_OPEN_MS,
      0,
      false,
    )
    this.fxAfter('power', COLD_OPEN_MS, () => { this._powerAnimating = false }, { always: true })

    // Guide overlay (15th pass -- a G key for guide, added).
    this.guideOpen = false

    // Date/time module ticker (15th pass) -- one interval for the whole
    // page lifetime, since the clock needs to keep ticking on the STANDBY
    // screen too (a real clock-radio's display doesn't go dark just
    // because the set itself is off). Skipped entirely while the guide
    // overlay is open, since that's a full-screen takeover with nothing to
    // tick into.
    // 16th pass -- date/time removed during cold boot -- the boot and
    // power-down beats both flip this.poweredOn to its end state
    // immediately (see powerUp()/powerDown()) and then spend a beat or two
    // animating toward the final picture with their own setTimeout beats.
    // Without a guard, this 1s ticker would independently redraw the clock
    // on top of whatever the animation currently has on screen (the boot-
    // text POST readout, the cold-open flourish just above, etc.) -- it
    // doesn't know an animation is mid-flight, it just sees poweredOn=false
    // and draws the standby clock over it. this._powerAnimating is set for
    // the duration of all three (cold-open, boot, power-down) so the ticker
    // skips a beat instead of stomping on them.
    // 68th pass -- NOT reset to false here: the cold-open flourish just
    // above already set it true and owns clearing it itself via its own
    // setTimeout. Resetting it unconditionally on this line, synchronously,
    // would clear it before that timeout ever got a chance to fire.
    this._clockTimer = setInterval(() => {
      if (this.guideOpen || this._powerAnimating) return
      if (this.poweredOn) this.drawClock(s)
      else this.drawStandbyClock(s)
    }, 1000)

    this.initPlayer(s)

    // 2026-08-23 (live audio tap) -- read the persisted mic-permission state
    // before the first power-on needs it. Async and prompt-free; see
    // queryMicPermission() for why this is what makes the mic tier silent on
    // return visits.
    queryMicPermission()

    // 22nd pass -- semi mobile functionality: tapping the screen can
    // power on, swipe left/right cycles channels -- touch's own gesture
    // layer, tap/swipe read directly off touchstart/touchend rather than a
    // continuous drag. Mouse-drag-to-seek (the desktop equivalent this used
    // to sit next to) was removed in the 44th pass -- see its old spot's
    // note in drawHint() -- so this is the only pointer input SIGNAL reads
    // now, and only on touch devices.
    this._touchActive = false
    this._touchStartX = 0
    this._touchStartY = 0
    this._touchStartTime = 0
    // 45th pass -- two-finger tap (display mode cycle), tracked separately.
    this._twoFingerActive = false
    this._twoFingerStartTime = 0
    document.addEventListener('touchstart', (e) => this.onTouchStart(s, e), { passive: false })
    document.addEventListener('touchend', (e) => this.onTouchEnd(s, e), { passive: false })
  },

  // Power down/up (12th pass -- power on and power
  // down sequences built). Neither one resets freq/lockedStation/shuffle
  // bags/volume -- powering off and back on is meant to read as the same
  // set switching states, not a fresh boot. init() still owns the actual
  // fresh-boot path (page load) and calls drawChrome()+playBootFlicker()
  // directly; these two reuse the same building blocks for the same look
  // on every power cycle after that.
  // 68th pass, rethought -- this used to be a ~900ms, seven-beat "the tube
  // is dying" spectacle (voltage surge, content going dark, a signal-loss
  // glitch, a collapse to the centerline, a collapse to a point) ending on
  // STANDBY. That whole sequence was also the source of two separate live-
  // QA races this same evening: async beats scheduled on their own timers
  // that a well-timed [I] (or, in principle, another P) could land in the
  // middle of. Reframed: STANDBY isn't "off," it's the receiver's resting
  // idle state -- the tube stays lit the whole time, so "power off" is just
  // stepping back to it, not switching anything off. Snaps back in one
  // beat, no death spiral, no reboot on the way back either -- see
  // powerUp()'s pacing note. Removing nearly all the timer surface here
  // also removes nearly all the room for a race like the [I] one to recur.
  powerDown(s) {
    if (!this.poweredOn) return
    this.poweredOn = false
    this._powerAnimating = true // cleared once the STANDBY beat lands below, ~130ms
    // 43rd pass: cleared silently, not via exitVisualizer() -- the beat
    // below already clears and redraws the whole grid itself, so there's no
    // normal-view chrome to restore first. Left set, frame() would keep
    // painting the drift effect over STANDBY forever after the next
    // power-up.
    this.visualizerActive = false
    // 2026-08-25 audit: everything cosmetic that was in flight -- status
    // sweep, text resolves, CRT ramps, bloom pulses, the boot flicker tail,
    // the shimmer restore -- lives on the normal effects queue and is
    // dropped here in one go (tweens settle to rest). This is the whole of
    // what used to be a per-timer poweredOn guard.
    this.fxCancelAll()
    this.stopScan()
    // stopScan() no longer stops the ambient static bed on its own (12th
    // pass) -- power-down is one of the two places (with tryLock) that
    // still needs to silence it explicitly.
    stopStaticNoise()
    stopTubeHum() // 42nd pass -- the noise floor dies with the set, same as everything else audio
    if (this.ready && this.player) this.player.pauseVideo()
    this.setPlayState(s)
    // 68th pass -- was playPowerDownSound(), a ~0.6s falling 660Hz->40Hz
    // sweep built for the old "dying tube" collapse. Stepping back to an
    // idle receiver isn't that -- reused playPanelSound(false)'s quick,
    // gentle closing click instead (same one the guide overlay already
    // closes on).
    playPanelSound(false)

    const { term } = s
    const clearAll = () => clearGrid(term)
    // 69th pass -- live QA (Matthew's screenshots) found the direct swap
    // from a fully-lit, saturated ON screen straight to STANDBY read as a
    // broken, doubled-looking wordmark: the CRT's phosphor persistence
    // buffer (crt.js's ping-pong `max(total, prev*decay)`) was still
    // holding the ON screen's accumulated brightness when STANDBY's very
    // different picture landed on top of it. Tried a decay-ramp-down first
    // -- worked in principle, but depends on enough real animation frames
    // actually rendering in the gap to converge, which isn't guaranteed.
    // `crt.js` already has the actual right tool for exactly this: a
    // second bug (2026-08-22, secret-station tint switches bleeding the old
    // phosphor tint's afterglow into the new one) got fixed the same way --
    // `setPhosphor()` calls `s.crt.clearPersist()`, a hard zero of the
    // persistence buffer, no frames-elapsing required. Same fix here.
    clearAll()

    const beats = [
      { delay: 130, fn: () => {
        // 63rd pass -- see drawStandbyScreen(): same logo/version/STANDBY/
        // hint/clock layout the first-ever paint in init() draws.
        this.drawStandbyScreen(s)
        s.crt?.clearPersist?.()
        this._powerAnimating = false // sequence landed, ticker can resume
        // 54th pass -- small mechanical touches, including a phosphor
        // burn-in ghost -- a real tube briefly holds a faint afterimage of
        // whatever was last on screen. Drawn at STATION_Y, the callsign's
        // real on-air row, not anywhere in the STANDBY layout above -- reads
        // as a genuine leftover rather than new STANDBY-screen content.
        // Desktop only (mobile's station row is a dynamic _mLayout position,
        // not this fixed constant, and doesn't have a STANDBY-vs-content
        // gap to bleed into the same way). Nothing to ghost if the set was
        // never locked to begin with.
        // 67th pass -- STANDBY is now always true-centered (see
        // standbyLayout()'s note), so the logo's own rows can land on
        // STATION_Y depending on term.rows. Rather than nudge the whole
        // screen off-center to dodge that (the 63rd pass's fix, reversed),
        // just skip this one ghost on the rare draw where it would land on
        // top of the wordmark -- a stronger, reliably-centered STANDBY
        // screen is worth more than one transient afterimage.
        // 68th pass -- kept even though the shutdown spectacle it was part
        // of is gone: it reads at least as well, arguably better, as "you
        // were just listening to this" on a receiver that never really
        // powered off, as it did as one beat in a fake death sequence.
        const L = standbyLayout(term, this.mobile)
        const ghostClear = STATION_Y < L.logoTop || STATION_Y > L.logoBottom
        if (!this.mobile && this.lockedStation && ghostClear) {
          const st = this.lockedStation
          const FLAIR = st.glyph || '●'
          const maxWidth = term.cols - 8
          const flaired = `${FLAIR} ${truncate(st.callsign, maxWidth - FLAIR.length * 2 - 2)} ${FLAIR}`
          term.text(centerX(term.cols, flaired), STATION_Y, flaired, FAINT)
        }
      } },
      { delay: 4000, fn: () => {
        // Fades out on its own after a few seconds of actually sitting on
        // STANDBY -- guarded on _powerAnimating so a fast re-power's own
        // boot beats (which clearAll() this row anyway) never race this
        // stray erase.
        // 2026-08-25 audit: `|| this.poweredOn` added -- a re-power that had
        // fully landed inside these 4s (boot is ~3.2s) would otherwise have
        // this erase a row of the live STATION box.
        if (this.mobile || this._powerAnimating || this.poweredOn) return
        for (let x = 0; x < term.cols; x++) term.put(x, STATION_Y, ' ', NORMAL, 0)
      } },
    ]
    // The always-queue: this sequence IS the power transition and has to run
    // while poweredOn is false (2026-08-25 audit -- see the fx note at the
    // top of this object).
    for (const { delay, fn } of beats) this.fxAfter('power', delay, fn, { always: true })
  },

  powerUp(s) {
    // 50th pass -- `|| this._powerAnimating`, not just poweredOn. poweredOn
    // doesn't go true until the REVEAL_DELAY beat ~5s in, and key() lets P
    // through while the set is off, so pressing P a second time during the
    // boot animation (an impatient double-tap -- easy to do, since nothing
    // on screen says the first press registered) started a SECOND full boot
    // sequence on top of the first: two overlapping sets of timers, two
    // clearAll beats fighting, two REVEAL beats, and a second loadTrack()
    // over the top of the first. Confirmed live before fixing -- the reveal
    // beat ran twice for one double-press.
    // This also closes the only reachable route to a nastier version of the
    // same thing: powerUp's beats are the one timer family in this file
    // that doesn't check guideOpen (they can't just bail -- the REVEAL beat
    // owns real state, not only drawing), so anything that got the guide
    // open while they were in flight would have the whole main screen
    // repainted straight through the overlay. Instrumented and measured at
    // ~4.6k writes punching through an open guide in that window. The
    // keyboard can't normally get there (key() ignores G while !poweredOn),
    // but a double-boot could put beats in flight AFTER poweredOn went
    // true, which is exactly when G starts working.
    if (this.poweredOn || this._powerAnimating) return
    this._powerAnimating = true // cleared once REVEAL_DELAY lands below
    // 2026-08-22, round 4 (bug held up through every repro tried --
    // power on, then every station swipe after, always silent until an
    // extra tap): init() already marks mode:'locked' with
    // needsTrackLoad:true on EVERY page load, fresh or resumed (see there),
    // so the session's very first loadTrack() call has always happened
    // ~5.5s from here, deep inside the REVEAL_DELAY beat below -- a
    // setTimeout callback, not this tap's synchronous call stack, no
    // matter how directly it was scheduled from it. loadTrack()'s
    // immediate-unmute path (see there) needs to run IN a real gesture, so
    // this fires it right here instead, while onTouchEnd/key() still have
    // this._inUserGesture set. The visual reveal (station/track text, the
    // status line) still waits for REVEAL_DELAY below -- only the
    // underlying player load moves earlier, so audio is already
    // decoding/correctly-unmuted by the time the picture catches up.
    // 2026-08-22, round 5 -- tracks whether the branch just above actually
    // fired, since the REVEAL_DELAY beat below used to use needsTrackLoad
    // itself to tell "fresh player, needs an actual load" apart from "same-
    // session resume, just needs playVideo() again" -- now that this clears
    // needsTrackLoad early, that beat needs its own way to know the load
    // already happened here and not repeat/stomp on it (see there).
    this._bootAudioPrimed = false
    if (this.mode === 'locked' && this.lockedStation && this.needsTrackLoad &&
        this.currentTrack && this.ready && this.player) {
      this.needsTrackLoad = false
      // 49th pass (desktop QA: no station audio should start
      // until the boot sequence completes) -- suppressAutoplayUnmute on
      // desktop only. Mobile still needs its unmute to land synchronously
      // in this exact tap (round 4's hard constraint); desktop doesn't, so
      // it stays muted here and the REVEAL_DELAY beat below unmutes for
      // real once the picture actually lands.
      this.loadTrack(this.currentTrack, { midSong: true, suppressAutoplayUnmute: !this.mobile })
      this._bootAudioPrimed = true
      // 2026-08-22, round 8 -- music was starting while the boot sequence
      // was happening, not waiting for it to end the way it does on
      // desktop -- tried holding it silent with player.setVolume(0) here,
      // restored via applyVolume() at REVEAL_DELAY below. Verified working
      // against the mocked player, but didn't hold up live -- the track was
      // still audible over the boot animation on a real phone, so
      // setVolume() apparently isn't as instant/reliable as mute()/unMute()
      // on the real YouTube player, at least on mobile Chrome. Reverted:
      // there's no way to hide the sound without breaking the one thing
      // that took rounds 2-4 to get right (unMute() has to run synchronously
      // in this exact tap, or it never gets a second chance -- see the
      // round-4 comment above). See round 9 below for where this landed
      // instead: default a fresh mobile session to muted, obviously so.
    }
    const { term } = s
    const clearAll = () => clearGrid(term)
    // 19th pass: floor, not round -- see drawStandbyClock()
    const midY = Math.floor(term.rows / 2)
    playPowerOnSound()
    // 2026-08-23 (live audio tap) -- the capture attempt rides the power-on
    // gesture, HERE and not later: getDisplayMedia requires-and-consumes
    // transient activation (~5s), which comfortably outlasts the now-much-
    // shorter REVEAL_DELAY below (68th pass -- was ~5.6s, now under 2s), so
    // the share picker still overlaps the boot readout fine. Deliberately
    // after the YT priming block above so nothing here can disturb the
    // round-4 mobile unmute invariants. Idempotent -- a later power cycle
    // with a live tap is a no-op; a declined one retries.
    startAudioTap(this, s)
    // 41st pass: re-establish the baseline for whatever station is being
    // resumed, so drawChrome/setCrtDegradation etc. below read the right
    // crtBase.brightness/bg for it rather than whatever a previous session
    // left crtBase pointed at.
    setCrtCharacter(s, this.mode === 'locked' ? this.lockedStation : null)
    // 68th pass -- powerDown() no longer raises `decay` for a collapse
    // afterglow (that whole sequence is gone, see there), but this reset
    // stays as a cheap defensive no-op in case anything else ever nudges it.
    if (s?.crt?.params) s.crt.params.decay = crtBase.decay

    // 26th pass -- a longer, better cold boot sequence, along the lines of
    // cyberspace.online's -- looked at cyberspace's actual boot live: a
    // dense retro-BIOS POST (hostname/kernel/hardware probe lines, a RAM
    // map, per-module load bars) before it lands on the app. SIGNAL is a
    // receiver, not an OS, so this borrows that probe-block density and
    // key:value voice but keeps it in-fiction -- tuner/antenna/preset-table
    // diagnostics instead of kernel modules. Values are pulled from the
    // real constants (FREQ_MIN/MAX, STATIONS.length) so this can't drift out
    // of sync with the actual band/roster the way a hardcoded line could.
    const bootLines = [
      'MODEL SG-1  SIGNAL RECEIVER',
      '',
      `BAND        : ${FREQ_MIN.toFixed(1)} - ${FREQ_MAX.toFixed(1)} KHZ`,
      `PRESETS     : ${STATIONS.length} STATIONS LOADED`,
      'OSCILLATOR  : QUARTZ, CALIBRATING...',
      'ANTENNA     : DIPOLE, CONTINUITY OK',
      '',
      '[ OK ] TUBES WARMING',
      '[ OK ] TUNER CALIBRATED',
      '[ OK ] PRESET TABLE LOADED',
      // 52nd pass -- the squelch line was removed, replaced with
      // something related to what actually exists: the full-screen
      // per-station visualizers, [V], not the phosphor/color cycle, [C].
      // SQUELCH SET
      // never meant anything in-app (no squelch feature exists); swapped
      // for a count of the distinct visualizer effects actually assigned
      // across the roster, via a Set over STATIONS[].visual rather than a
      // hardcoded number, so this can't drift out of sync the way a
      // literal "10" would the next time a station's effect changes.
      `[ OK ] ${new Set(STATIONS.map((st) => st.visual)).size} VISUALIZER MODES READY`,
      '[ OK ] SIGNAL LOCK ARMED',
      '[ OK ] AUDIO PATH READY',
    ]
    // Pacing -- 68th pass, rethought (was a ~5.5s cold-boot POST on every
    // single power-on, 15th/26th passes). STANDBY is now the receiver's
    // resting "on" state, not "off" -- the tube's already warm and lit the
    // instant before P is pressed, so a long cold-boot readout no longer
    // fits the moment. This is "tuning in," not "switching on a dead set":
    // still the same POST-flavored readout (kept -- it's a nice touch,
    // Matthew's call). 69th pass -- the first cut of this (under 2s) read
    // as too fast to actually watch; slowed back down to a middle ground,
    // ~3.2s -- noticeably calmer than the rushed first pass, still well
    // under the original ~5.5s cold boot. The one genuinely cold "tube
    // coming to life" flourish now lives in init(), once, on first page
    // load only -- see there.
    const LINE_STAGGER_MS = 150
    const BOOT_TEXT_DELAY = 600
    const REVEAL_DELAY = BOOT_TEXT_DELAY + bootLines.length * LINE_STAGGER_MS + 500
    const beats = [
      { delay: 0, fn: () => {
        // 68th pass -- no more dot/centerline reboot theatrics (that
        // mirrored powerDown()'s old collapse ending, which is also gone --
        // see there). STANDBY's picture is already on screen; this is a
        // brief signal-acquisition glitch scattered over the wordmark
        // itself, reading as "locking on" rather than "coming back from
        // dead," before the boot readout takes over.
        const L = standbyLayout(term, this.mobile)
        const glitchChars = '▓▒░#%&*'
        for (let y = L.logoTop; y <= L.logoBottom; y++) {
          for (let x = 0; x < term.cols; x++) {
            if (Math.random() < 0.12) {
              const ch = glitchChars[Math.floor(Math.random() * glitchChars.length)]
              term.put(x, y, ch, Math.random() < 0.3 ? BRIGHT : FAINT)
            }
          }
        }
        playStaticBurst(0.15, 0.08, 2600)
      } },
      { delay: BOOT_TEXT_DELAY, fn: () => {
        // Boot-text beat (13th pass, "fun startup/shutdown") -- a short
        // typewriter-style POST readout, same [ OK ] idiom used elsewhere
        // in the project's terminal-program voice, landing one line at a
        // time before the full picture snaps in. Cosmetic only, no state.
        clearAll()
        const startY = midY - Math.floor(bootLines.length / 2)
        bootLines.forEach((line, i) => {
          this.fxAfter('power', i * LINE_STAGGER_MS, () => {
            // 2026-08-23 (live audio tap) -- the last line reports the tap's
            // real state at the moment it lands (~4.1s in, by which time the
            // picker has usually been answered): AUDIO TAP: LINE (tab),
            // AUDIO TAP: MIC, or the original AUDIO PATH READY when there is
            // nothing to report. Substituted at land time, not built into
            // bootLines, because the state isn't known when the array is.
            const shown = i === bootLines.length - 1 ? audioTapBootLine() : line
            term.text(centerX(term.cols, shown), startY + i, shown, i === 0 ? BOLD : DIM)
            // 38th pass -- sounds added as the boot happens and each item
            // appears -- all 13 lines used to land in
            // total silence, which is most of why a ~5.5s boot felt like
            // waiting rather than watching a machine come up. A blank
            // spacer line stays silent so the readout keeps its phrasing;
            // an [ OK ] confirm blips brighter than a probe line; pitch
            // creeps up across the sequence (see playBootTick).
            if (shown) playBootTick(shown.startsWith('[ OK ]') ? 'ok' : 'probe', i / (bootLines.length - 1))
          }, { always: true })
        })
      } },
      { delay: REVEAL_DELAY, fn: () => {
        // Full picture back -- same chrome init() draws on a fresh boot,
        // just without touching freq/lockedStation/bags/volume/history.
        clearAll()
        this.poweredOn = true
        this._powerAnimating = false // sequence landed, ticker can resume
        startTubeHum() // 42nd pass -- comes up with the picture, not before it
        playNetworkId(this) // 53rd pass -- network sign-on, same beat the picture lands on
        // 54th pass -- small mechanical touches, including a warm-up drift
        // -- the oscillator hasn't quite settled the instant the picture
        // reveals; frame()'s warm-up block reads this and wobbles the
        // displayed freq/dial cursor (never the real this.freq -- see
        // drawFreq()/drawDial()) for a couple of seconds, decaying to
        // nothing. Set on every power-on, fresh or resumed -- "just switched
        // on" is true either way.
        this._warmupUntil = Date.now() + WARMUP_MS
        this.setStatus(s, 'SYSTEM READY', false)
        this.redrawMainScreen(s)
        if (this.mode === 'locked' && this.lockedStation) {
          // Resume exactly where it left off -- same station, same track,
          // same playback position -- rather than re-picking from the
          // shuffle bag, so it reads as the same set coming back on rather
          // than a new tune-in.
          // 2026-08-22, round 3 (bug: "just 'system ready' instead of
          // locked on a station and playing") -- the status line above was
          // set to SYSTEM READY unconditionally, and nothing in this resume
          // path ever updated it once a station/track WAS restored. Every
          // other way of reaching a locked station (tryLock, presetTune,
          // etc.) calls setStatus(..., 'LOCKED', ...) itself; this is the
          // one path that resumes straight into 'locked' state without ever
          // having called it, so the status text just never caught up with
          // reality -- station/track/playback were all correct, only the
          // status readout was stale.
          // 2026-08-22, round 9 -- "LOCKED" replaced with MUTED when
    // applicable, not flashing but staying persistent so it's obvious you
    // need to unmute to begin the experience -- a locked-but-muted set shows MUTED here
    // instead of LOCKED, staying that way (no flash, no revert -- see
    // setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
          this.showStation(s, this.lockedStation)
          if (this.currentTrack) this.showTrack(s, this.currentTrack)
          // 2026-08-22, round 5 -- this._bootAudioPrimed (set at the very
          // top of powerUp(), synchronously in the tap) means the fresh-
          // load case already ran, several seconds ago, and is likely
          // already genuinely playing by now -- onStateChange's PLAYING
          // handler will already have called setPlayState(s, 'playing').
          // Calling player.playVideo() again here is a harmless no-op, but
          // this.setPlayState(s) (no state arg) is NOT harmless: mode is
          // 'locked' so it unconditionally overwrites the already-correct
          // this.playState with undefined, blanking the playback bar/icon
          // this same instant the rest of the interface reveals -- exactly
          // the "VU is off, playback looks wrong right after boot" shape
          // of bug. Skip both entirely when priming already handled it;
          // the onStateChange handler owns playState from here on.
          if (this.needsTrackLoad && this.currentTrack) {
            // Persistence resume (14th pass) -- fallback path, only reached
            // if the player wasn't ready yet at tap time (rare). Same as
            // before this round: loads muted, next tap/key flushes it.
            this.needsTrackLoad = false
            this.loadTrack(this.currentTrack, { midSong: true })
            this.setPlayState(s, 'buffering')
          } else if (!this._bootAudioPrimed) {
            if (this.ready && this.player) this.player.playVideo()
            this.setPlayState(s, this.playState)
          }
          // 49th pass -- no station audio should start until the
          // boot sequence completes -- the priming call above suppressed
          // its own auto-unmute on desktop (opts.suppressAutoplayUnmute),
          // so the track has been decoding/buffering silently this whole
          // ~5.5s boot. This is where it actually becomes audible, exactly
          // as the picture reveals. Mobile is untouched -- it already
          // unmuted (or didn't, per the muted-fresh-visit default) back in
          // the tap itself, and re-unmuting here would be redundant at
          // best.
          if (this._bootAudioPrimed && !this.mobile && !this.muted && this.ready && this.player) {
            this.player.unMute()
            this.applyVolume()
            this._forcedMuteForAutoplay = false
          }
        } else {
          this.clearStation(s)
          this.clearTrack(s)
          this.setStatus(s, 'SEEKING', false)
        }
        this.playBootFlicker(s)
      } },
    ]
    // The always-queue: this sequence IS the power transition and has to run
    // while poweredOn is false (2026-08-25 audit -- see the fx note at the
    // top of this object).
    for (const { delay, fn } of beats) this.fxAfter('power', delay, fn, { always: true })
  },

  // --- bag / playback --------------------------------------------------

  ensureBag(station) {
    if (!this.bags[station.id]) this.bags[station.id] = { order: shuffledIndices(station.tracks.length), pos: 0 }
    return this.bags[station.id]
  },
  nextTrack(station) {
    const bag = this.ensureBag(station)
    if (bag.pos >= bag.order.length) { bag.order = shuffledIndices(station.tracks.length); bag.pos = 0 }
    const track = station.tracks[bag.order[bag.pos]]
    bag.pos += 1
    return track
  },

  initPlayer(s) {
    const self = this
    const create = () => {
      self.player = new YT.Player('ytDock', {
        height: '200',
        width: '260',
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            self.ready = true
            self.applyVolume()
          },
          onStateChange: (e) => {
            // Mid-song join (8/20: stations start mid
            // song). loadTrack(track, {midSong:true}) cues instead
            // of loading, which doesn't autoplay; once CUED fires the
            // duration is finally known, so this is the first point a
            // random start position can be picked at all. Left unseeded on
            // a plain skip() (opts.midSong not set) -- that's a deliberate
            // "give me a different track" action, not "tune in", so it
            // should start at 0 like picking a track normally would.
            if (e.data === YT.PlayerState.CUED && self.pendingMidSongSeek) {
              self.pendingMidSongSeek = false
              const dur = self.player.getDuration()
              // 36th pass: a remembered resumeAt (see tryLock()'s
              // within-cutoff path) seeks to a specific position instead of
              // a random one -- same outro-buffer clamp either way, so a
              // resume can't land seconds from the end any more than a
              // fresh random join can.
              const resumeAt = self.pendingResumeSeek
              self.pendingResumeSeek = null
              if (resumeAt != null && dur && isFinite(dur)) {
                const maxStart = Math.max(0, dur - Math.max(30, dur * 0.15))
                self.player.seekTo(Math.min(resumeAt, maxStart), true)
              } else if (dur && isFinite(dur) && dur > 20) {
                // Leave at least 30s (or the last 15%, whichever is more)
                // of the track remaining, so a join never lands seconds
                // from the end.
                const maxStart = Math.max(0, dur - Math.max(30, dur * 0.15))
                self.player.seekTo(Math.random() * maxStart, true)
              }
              self.player.playVideo()
              return
            }
            if (e.data === YT.PlayerState.ENDED) { self.skip(s); return }
            if (e.data === YT.PlayerState.PLAYING) {
              self.setPlayState(s, 'playing')
              // 2026-08-22, round 4 -- loadTrack() now resolves the
              // mute-for-autoplay/unmute decision itself, synchronously, at
              // call time (see there) rather than waiting for this async
              // PLAYING event, which never carried a real gesture no matter
              // how soon it fired. Nothing left to do here.
            }
            else if (e.data === YT.PlayerState.PAUSED) self.setPlayState(s, 'paused')
            else if (e.data === YT.PlayerState.BUFFERING) self.setPlayState(s, 'buffering')
          },
          // Content-ops safety net (14th pass) -- an embedded video can go
          // private/removed/region-locked after it was verified, and with
          // ~90 hardcoded IDs now public that WILL happen eventually. Rather
          // than silently dying mid-play (dead air with no visible error,
          // since the player itself is docked off-screen), any player error
          // just skips to another track on the same station like a manual
          // [N] would. No retry loop against the same ID, no user-facing
          // error state -- consistent with how ENDED already just skips.
          // 32nd pass: a one-shot chroma/roll glitch flash rides along with
          // the existing dead-video auto-skip -- see flashCrtGlitch().
          onError: () => { if (self.mode === 'locked') { flashCrtGlitch(s); self.skip(s) } },
        },
      })
    }
    // The API may already have fired its ready callback before this runs
    // (font load + module eval takes real time) -- check the flag rather
    // than assuming we got here first.
    if (window.SIGNAL_YT_READY) create()
    else window.SIGNAL_YT_QUEUE.push(create)
  },
  loadTrack(track, opts = {}) {
    if (!this.ready || !this.player) return
    // 2026-08-24 -- fire the lyrics lookup unconditionally on every load,
    // including the resume/reload paths above that pass this.currentTrack
    // back in unchanged: ensureLyricsFetched() is itself the guard (a
    // cache hit is a same-tick no-op), so this doesn't cost a duplicate
    // request, and it means a lock-in-progress-before-Guide-was-open or a
    // background/foreground resume still ends up with lyrics ready.
    ensureLyricsFetched(track)
    // 2026-08-22 (bug report: "on load after power on, nothing plays...
    // even changing stations doesn't play audio. I have to mute and
    // unmute" -- classic mobile autoplay block. cueVideoById()'s later
    // playVideo() and loadVideoById()'s own implicit autoplay both count as
    // "start playing audio," and mobile browsers only allow that
    // unprompted if either the call is still inside a live user-gesture
    // window, or the video is muted. Muting first sidesteps the block
    // entirely -- toggling mute/unmute by hand was doing exactly this
    // already, just manually.
    // 2026-08-22, round 5 (bug: "mute says it is 'on'" right after boot,
    // yet audio was audibly playing) -- this used to only call
    // player.mute() when !this.muted, on the assumption a real mute
    // intent needed no further action. But nothing else ever applies a
    // persisted this.muted:true to a freshly created YT.Player -- it
    // defaults to unmuted, so a session that was left muted last time
    // would autoplay audibly on the next visit despite the UI (correctly)
    // showing MUTE ON the whole time. Muting unconditionally here, before
    // every load, both sidesteps the autoplay block AND actually applies
    // a real muted intent to the fresh player; only the unmute-restore
    // below is conditional on the real intent being unmuted.
    // 2026-08-22, round 6 (bug: "when a song ends, it does change tracks
    // but there is no audio, you tap and it starts") -- skip() from the
    // natural ENDED event is the one loadTrack() caller that never runs in
    // a gesture, so it always fell back to the deferred _pendingUnmute
    // flush, needing an extra tap every single time a track finished on
    // its own. But a natural track-end is a different kind of load than a
    // cold start: audio was ALREADY playing, unmuted, the instant before
    // this call -- a continuation of an already-engaged session, not a
    // fresh autoplay request, and browsers don't re-apply the no-gesture
    // block to that. Skip the whole mute-first dance for a "warm"
    // continuation (this.playState was already 'playing' and the real
    // intent is unmuted) and just load directly; a genuinely cold load
    // (nothing was already audibly playing -- power-on, or a muted
    // session) still gets the full dance.
    const wasWarm = this.playState === 'playing' && !this.muted
    const needsAutoplayMute = !wasWarm
    if (needsAutoplayMute) { this.player.mute(); this._forcedMuteForAutoplay = true }
    if (opts.midSong) {
      this.pendingMidSongSeek = true
      // 36th pass: opts.resumeAt (seconds) means "seek here instead of a
      // random point" -- set by tryLock()'s within-cutoff resume path. null
      // for a normal fresh lock, which keeps the existing random-join
      // behavior in the CUED handler below.
      this.pendingResumeSeek = opts.resumeAt ?? null
      this.player.cueVideoById(track.youtubeId)
    } else {
      this.pendingMidSongSeek = false
      this.pendingResumeSeek = null
      this.player.loadVideoById(track.youtubeId)
    }
    // 2026-08-22, round 4 (repro held up on every path -- power on, and
    // every station switch, all silent until an extra tap): rounds 2-3
    // deferred the actual unMute() to the PLAYING event or the next
    // touch/key, on the theory that unmuting is itself gesture-gated and
    // the PLAYING callback (an async postMessage handler) doesn't carry
    // one. True, but that missed a bigger point -- EVERY call to loadTrack()
    // in this file already happens synchronously inside a real touch/key
    // handler (a station switch, a skip, or -- since this round -- the
    // power-on tap itself, see powerUp()) except two: a track ending on
    // its own (ENDED) and a dead-video auto-skip (onError), neither of
    // which is a gesture. this._inUserGesture (set for the duration of
    // onTouchStart/onTouchEnd/key's synchronous body -- see there) tells
    // the two apart. When it's true, unmuting RIGHT HERE, still inside
    // that same call stack, is exactly as valid a gesture as a manual tap
    // -- no need to wait for anything async. When it's false, fall back to
    // the round-2/3 mechanism: flag intent and let the next real
    // touch/key flush it.
    // 2026-08-22, round 7 (bug: "state shows mute but track plays... at
    // the end of a track I hear nothing because mute is still on" -- the
    // display was right the whole time) -- THIS was the actual bug behind
    // every "shows muted, plays anyway" report since round 5: this block
    // never checked this.muted before calling unMute(). needsAutoplayMute
    // is true whenever this.muted is true too (wasWarm requires
    // !this.muted), so a genuinely muted session got muted correctly by
    // player.mute() above and then immediately unmuted again right here on
    // every gesture-driven load (power-on, station switch) -- audible
    // despite this.muted staying true and the display staying (correctly)
    // MUTE ON the whole time. The one load with no gesture (a natural
    // track end) skipped this branch and stayed muted, which is why THAT
    // specifically went silent -- both symptoms were the same bug. Restore
    // is now conditional on the real intent actually being unmuted.
    // 49th pass (desktop QA: scan's auto-lock -- and, by the same
    // mechanism, a natural track-end and the dead-track auto-skip -- shows
    // PLAYING/unmuted but no audio, until literally any key/tap flushes
    // it): this._inUserGesture-gating was built for MOBILE's stricter,
    // per-call gesture-synchronous unmute requirement, but loadTrack() is
    // shared code with no !this.mobile check -- desktop inherited the same
    // restriction even though desktop browsers don't need it. Chrome's
    // desktop autoplay policy is page-level, not per-call: once the user
    // has interacted with the page at all (which powering on already
    // does), a later async unMute() -- scan's setInterval lock, an ENDED
    // event, onError's auto-skip -- doesn't get blocked the way mobile's
    // does. Unmute immediately on desktop regardless of _inUserGesture;
    // mobile's existing two-branch behavior (unmute now if in a live
    // gesture, else defer to the next real touch/key) is untouched.
    // opts.suppressAutoplayUnmute (49th pass -- no station audio
    // should start until the boot sequence completes) -- powerUp()'s
    // priming call sets this on desktop only, so this whole block is
    // skipped there: stays forced-muted (already applied above) rather
    // than unmuting right here, and powerUp()'s REVEAL_DELAY beat does the
    // actual unmute once the picture lands. Mobile never sets this opt --
    // its unmute still has to happen synchronously in the tap (this
    // block), it can't wait for an async REVEAL_DELAY timeout the way
    // desktop now can.
    if (needsAutoplayMute && !this.muted && !opts.suppressAutoplayUnmute) {
      if (!this.mobile || this._inUserGesture) {
        this.player.unMute()
        this.applyVolume()
        this._forcedMuteForAutoplay = false
        this._pendingUnmute = false
      } else {
        this._pendingUnmute = true
      }
    }
  },
  skip(s) {
    if (this.mode !== 'locked') return
    const track = this.nextTrack(this.lockedStation)
    this.currentTrack = track
    // Same station, just the next track in it -- station identity (its own
    // box now) doesn't need to be touched at all, just the track line.
    // 38th pass: shorter resolve than a lock's, matching the smaller VU
    // pulse a skip already gets below.
    this.showTrack(s, track, { revealMs: 150 })
    // Re-applies volume for the new track's gain -- a skip can land on a
    // track mastered much louder/quieter than the one just playing.
    this.applyVolume()
    this.loadTrack(track)
    // 23rd pass: smaller attack than tryLock's -- a skip is a lesser event
    // than finding a new station.
    this.pulseVU(0.3)
    saveSignalState(this)
    // 56th pass -- liner drops (see maybePlayLinerDrop): a 1-in-4 roll per
    // new track, same station. Every "next track" path (skip key, mobile
    // swipe, natural track-end, dead-video auto-skip) funnels through here.
    maybePlayLinerDrop(this, this.lockedStation, track)
  },
  // 25th pass -- addresses audio loudness varying as stations change.
  // YouTube masters vary hugely in loudness across sources (a 1950s
  // doo-wop recording and a modern loud/compressed synthwave master are
  // nowhere near the same level), so switching stations could mean a real
  // jump in perceived volume even with the slider untouched. This applies
  // an optional multiplier on top of the user's own volume slider:
  // `track.gain` if the current track has one, else `station.gain`, else
  // 1 (no change). Every setVolume() call in the file should go through
  // this rather than calling player.setVolume(this.volume) directly, so
  // gain is never accidentally bypassed on some code path.
  //
  // The station-level gains set below are a first-pass, by-genre/by-era
  // approximation (older and acoustic/orchestral masters run quieter than
  // modern compressed ones -- a well-established mastering convention, not
  // something measured per track here) rather than precisely measured
  // per-track loudness, which nobody's actually done. Treat them as a
  // starting point: bump an individual track's `gain` field if a specific
  // song still stands out once you've heard it.
  applyVolume() {
    if (!this.ready || !this.player) return
    const ch = this.lockedStation
    const gain = (this.currentTrack && this.currentTrack.gain) ?? (ch && ch.gain) ?? 1
    const eff = Math.round(Math.min(100, Math.max(0, this.volume * gain)))
    this.player.setVolume(eff)
  },
  adjustVolume(s, delta) {
    const before = this.volume
    const wasMuted = this.muted
    this.volume = Math.min(100, Math.max(0, this.volume + delta))
    if (this.muted) this.muted = false // touching volume un-mutes, like a real set
    // 50th pass: hard mute -- volume-touch un-mute has to reopen the
    // speaker path too, same as toggleMute() does. Unconditional (it's a
    // no-op when already unmuted) so the bus can never be left closed with
    // this.muted false.
    setSpeakerMuted(this.muted)
    if (this.ready && this.player) {
      this.applyVolume()
      if (!this.muted) this.player.unMute()
    }
    // Round 9 -- same as toggleMute(): if this just un-muted a locked set,
    // the persistent status this row rests on needs to drop back to LOCKED
    // too, not just this VOL flash.
    if (wasMuted && !this.muted && this.mode === 'locked') this.statusPersistent = { text: 'LOCKED', active: true }
    this.drawVolume(s)
    // 38th pass: a detent per notch, and the level itself in the status
    // row for a beat. The VOL bar was the only feedback before, and it is
    // in the LEVELS panel at the bottom of the screen -- nowhere near
    // where your eye is while you are tuning.
    if (this.volume !== before) playDetent()
    this.flashStatus(s, `VOL ${this.volume}`)
    saveSignalState(this)
  },
  toggleMute(s) {
    this.muted = !this.muted
    if (this.ready && this.player) {
      if (this.muted) this.player.mute()
      else { this.player.unMute(); this.applyVolume() }
    }
    // 50th pass: hard mute -- the whole WebAudio speaker path dies with
    // the switch (static bed, idents, clicks, all of it), not just the
    // YouTube player. See speakerOut()'s comment for what deliberately
    // survives: the tube hum (chassis) and the relay thunk below (the
    // switch's own mechanism, which is also why it still plays here while
    // muted -- and must, or un-muting would be a silent action).
    setSpeakerMuted(this.muted)
    this.drawVolume(s)
    // 38th pass: mute is a switch, so it gets a relay rather than a beep.
    playRelayThunk(this.muted)
    // 2026-08-22, round 9 -- flashStatus's transient "MUTED"/"UNMUTED" beat
    // reverts to whatever this.statusPersistent was after ~900ms (see
    // there); while locked, that resting status needs to be the new mute
    // state too (MUTED vs LOCKED -- see setStatus's other 'MUTED' call
    // sites), or the revert would land back on a stale "LOCKED" a beat
    // after you'd just muted.
    if (this.mode === 'locked') this.statusPersistent = { text: this.muted ? 'MUTED' : 'LOCKED', active: true }
    this.flashStatus(s, this.muted ? 'MUTED' : 'UNMUTED')
    saveSignalState(this)
  },

  // --- tuning ------------------------------------------------------------

  retune(s, f) {
    this.freq = clampFreq(f)
    this.drawFreq(s)
    this.drawDial(s)
    this.drawSignal(s)
    // 21st pass: static bed loudness tracks distance to the nearest
    // station -- no-ops if the noise bed isn't currently running (locked).
    // 41st pass: nearestSignal, not nearestStation -- everything below this
    // line is metering (how loud the hiss is, how degraded the picture is),
    // and the secret station is a real carrier for those purposes even
    // though nothing here can lock onto it.
    const { station: sigStation, dist } = nearestSignal(this.freq)
    setStaticIntensity(dist, sigStation && sigStation.static)
    // 32nd pass: the picture itself degrades the same way the hiss does --
    // see crtDegradeForDist(). dist is 0 exactly at a station's own freq
    // (including right after a lock, since tryLock() calls retune(s,
    // station.freq)), so this naturally settles back to a clean picture on
    // lock without a separate "reset" call.
    setCrtDegradation(s, dist)
    this.applySecretTease(s)
  },

  /** 41st pass -- the visual
   *  half of a secret station's tease. nearestSignal() already lets the
   *  meters and the hiss react to a carrier that nearestStation() refuses
   *  to lock; this bleeds the tube's tint toward the same forced color that
   *  station gives you once you are actually on it, in proportion to how
   *  close the dial is. Sweeping past feels like the set is reacting to
   *  something it will not name.
   *
   *  2026-08-23 -- generalized for SECRET_STATIONS (was a single hardcoded
   *  SECRET_STATION/red bleed): finds whichever secret station the dial is
   *  nearest to right now and bleeds toward THAT station's own
   *  forcedPhosphor, so GREEN HOUSE teases purple the same way NIN teases
   *  red, and being near one doesn't fight a tease from the other.
   *
   *  Writes s.crt.phosphor directly rather than going through
   *  setPhosphor(name): that call is name-keyed (so it cannot express an
   *  in-between tint at all) and it clears the persistence buffer on every
   *  change, which is right for a hard channel-change flash and very wrong
   *  for a gradual bleed -- it would strobe black on every tuning step.
   *  Always assigns a NEW array; PHOSPHORS entries are shared config objects
   *  and mutating one in place would corrupt the tint for the whole session. */
  applySecretTease(s) {
    if (!s || !s.crt) return
    // Locked is applyPhosphor()'s business, not this function's.
    if (this.mode === 'locked') return
    const base = PHOSPHORS[DISPLAY_MODES[this.displayModeIndex].key]
    if (!base) return
    let nearest = null, nearestDist = Infinity
    for (const st of SECRET_STATIONS) {
      const d = Math.abs(st.freq - this.freq)
      if (d < nearestDist) { nearestDist = d; nearest = st }
    }
    if (!nearest) return
    const pct = 1 - Math.min(1, nearestDist / NEAR_THRESHOLD)
    if (pct <= 0) {
      // Only restore if this function is what moved it -- otherwise every
      // tuning step anywhere on the band would fight applyPhosphor().
      if (this._teasing) { s.crt.phosphor = base; this._teasing = false }
      return
    }
    const target = PHOSPHORS[nearest.forcedPhosphor || 'red']
    // Caps well short of the full forced tint: at the threshold edge it
    // should read as a faint shift you might not consciously notice, and
    // even dead on the frequency it stays a tint rather than the full
    // alarm/haze state that locking the station actually gives you. The
    // reward has to stay bigger than the tease.
    const k = pct * 0.6
    s.crt.phosphor = [
      base[0] + (target[0] - base[0]) * k,
      base[1] + (target[1] - base[1]) * k,
      base[2] + (target[2] - base[2]) * k,
    ]
    this._teasing = true
  },
  enterSeeking(s) {
    this.mode = 'seeking'
    // 41st pass: back to the nominal set the moment we are off a station --
    // station character is a property of being locked onto it, not of having
    // been there. Order matters: this rebuilds crtBase, so the degrade below
    // (via retune/startStaticNoise callers) lands on the right baseline.
    setCrtCharacter(s, null)
    // 2026-08-22: leaving a lock is the other half of applyPhosphor()'s
    // job -- tuning away from the secret NIN station has to drop the forced
    // red tint back to whatever the user's normal display mode is.
    this.applyPhosphor(s)
    this.clearStation(s)
    this.clearTrack(s)
    this.setStatus(s, 'SEEKING', false)
    if (this.ready && this.player) this.player.pauseVideo()
    this.drawDial(s)
    this.setPlayState(s)
    this.drawSignal(s)
    // Continuous static bed while not on a station (12th pass, 2026-08-20)
    // -- static now plays between signals while seeking with arrows,
    // reusing the same bed scanning already uses. Idempotent:
    // a no-op if it's already running, so this never restarts/stutters the
    // ramp on repeated calls.
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
  },
  seekStep(s, delta) {
    this.stopScan()
    const wasLocked = this.mode === 'locked'
    // 21st pass -- seeking with arrows now wraps to the other side of the
    // tuning band, the same as scan already can -- mirror
    // startScan's wraparound instead of clampFreq's dead stop at the edges.
    let f = this.freq + delta
    let wrapped = false
    if (f > FREQ_MAX) { f = FREQ_MIN; wrapped = true }
    else if (f < FREQ_MIN) { f = FREQ_MAX; wrapped = true }
    // 38th pass: which way the dial is moving, for the SEEKING sweep in
    // the status row (see startStatusAnim).
    this._statusSweepDir = delta < 0 ? -1 : 1
    this.retune(s, f)
    // 38th pass: the band edge finally makes a sound -- see playBandBump()
    // for why this fires on the wrap rather than replacing it with a stop.
    if (wrapped) playBandBump()
    // 41st pass: the one-shot seek hiss takes its colour from whatever is
    // nearest, same field the continuous bed uses -- see STATIONS[].static.
    // Offset above the bed's centre so a step still reads as a separate
    // event layered on the bed rather than a momentary swell of it.
    const seekSig = nearestSignal(this.freq).station
    playSeekStatic((seekSig && seekSig.static ? seekSig.static : STATIC_CENTRE_DEFAULT) + 200)
    // Land-on-lock (added 2026-08-20): landing on a station while seeking
    // with arrows locks onto it automatically --
    // if the new position is within lock range of a station, lock onto it
    // immediately instead of requiring a separate Enter press. Skip this
    // when the step started already locked on that same station, so a
    // single arrow tap doesn't just replay the lock you're already on.
    const { station, dist } = nearestStation(this.freq)
    if (dist <= LOCK_THRESHOLD && !(wasLocked && this.lockedStation === station)) {
      this.tryLock(s)
      return
    }
    if (wasLocked) this.enterSeeking(s)
    else this.setStatus(s, 'SEEKING', false)
    // Covers the "already seeking, one more arrow tap" case -- enterSeeking()
    // above only fires on a locked->seeking transition, but the continuous
    // bed needs to be there (or stay there) on every non-locking step, not
    // just the first one. Idempotent, same as above.
    // 41st pass: `dist` here is the LOCKING distance (real stations only --
    // see nearestStation), which is not what the bed should follow: near
    // 777.7 that number is large while the receiver is in fact sitting on a
    // strong carrier. The bed uses the signal distance so the hiss clears
    // over the secret station the same as any other.
    const bedSig = nearestSignal(this.freq)
    startStaticNoise(bedSig.dist, bedSig.station && bedSig.station.static)
  },
  // 2026-08-22: optional `forced` param -- SECRET_STATIONS entries are
  // deliberately NOT part of STATIONS (see their own comment for why), so
  // nearestStation() can never find them and the normal seek/scan/Enter
  // lock path correctly never lands on either. presetTune() needs a way to
  // lock onto one directly by reference once its own dedicated key is
  // pressed -- passing the station through here does that without touching
  // the nearestStation()-driven path every other lock still uses.
  tryLock(s, forced) {
    // 50th pass: nearestLockable, not nearestStation -- Enter can now lock
    // the secret station when parked within LOCK_THRESHOLD of 613.0. The
    // auto-lock paths (seekStep's land-on-lock, scan) still use
    // nearestStation and can't reach it -- see nearestLockable's comment.
    const { station, dist } = forced ? { station: forced, dist: 0 } : nearestLockable(this.freq)
    if (dist > LOCK_THRESHOLD) {
      this.setStatus(s, 'NO SIGNAL', false)
      return
    }
    this.stopScan()
    // Locking is the one transition that actually ends the ambient static
    // bed (stopScan() itself no longer does -- see its comment) -- a signal
    // found means the hiss cuts, same as a real set.
    stopStaticNoise()
    this.retune(s, station.freq)
    // 36th pass: snapshot whatever was actually playing before we move
    // lockedStation off of it -- see RESUME_CUTOFF_MS above. Unconditional
    // on station identity (not just `!== station`) on purpose: re-locking
    // onto the SAME station you're already on (e.g. an arrow-seek that
    // snaps back in place) used to redraw a random new track too, which is
    // the same complaint from a different trigger -- this now resumes it
    // near-instantly instead, since almost no time will have passed.
    if (this.lockedStation && this.currentTrack) {
      let pos = 0
      try { pos = this.player?.getCurrentTime?.() || 0 } catch (e) {}
      this.lastPlayback[this.lockedStation.id] = { track: this.currentTrack, position: pos, at: Date.now() }
    }
    // History (14th pass) -- push
    // whatever was locked before this one so [B] can step back through
    // recently-played stations. Only real transitions count: landing back
    // on the station you're already on (e.g. an arrow-seek that re-locks
    // in place) doesn't push a duplicate. Capped so it can't grow forever
    // across a long session.
    if (this.lockedStation && this.lockedStation !== station) {
      this.history.push(this.lockedStation)
      if (this.history.length > 8) this.history.shift()
    }
    this.mode = 'locked'
    this.lockedStation = station
    // 41st pass: this station's own picture, before anything below reads the
    // baseline back (the ident bloom pulse, the focus snap, and retune()'s
    // distance degrade all settle to crtBase -- see setCrtCharacter).
    setCrtCharacter(s, station)
    setCrtDegradation(s, 0)
    // 2026-08-22: forces the red tint on for the secret NIN station, and
    // restores the normal preference for everything else -- see
    // applyPhosphor()'s comment.
    this.applyPhosphor(s)
    // Station idents (added 2026-08-20): each station has its own short
    // tone motif in STATIONS[].ident
    // so locking on COLD WAVE sounds different from locking on QUIET HOURS,
    // instead of every station announcing itself with the same generic chime.
    playIdent(station.ident, station.identTempo || 1, s)
    // 55th pass -- verbal station IDs announce on first lock or preset
    // change. A preset-driven lock (digit key, [B]
    // back, mobile swipe -- forced is truthy) always announces, since
    // that's a deliberate "tune to this station" action every time. An
    // organic lock (Enter, seek-landing auto-lock) only announces the
    // first time this session actually lands on that station, tracked in
    // _announcedStations, so repeatedly re-locking the same station by ear
    // doesn't repeat the ID every time. Held back ~500ms behind the ident
    // tone above so the sting finishes before the voice comes in, rather
    // than the two stacking on the same beat.
    // 2026-08-23: checks station.secret generically instead of comparing
    // against one hardcoded id, now that there are two secret stations --
    // neither has a station-id-<id>.mp3 clip (see loadStationIdBuffer's own
    // comment), so this still just silently skips both.
    if (!station.secret && (forced || !this._announcedStations.has(station.id))) {
      this._announcedStations.add(station.id)
      const announceStation = station
      setTimeout(() => {
        if (this.lockedStation === announceStation) playStationId(this, announceStation)
      }, 500)
    }
    // 38th pass: the picture pulls into focus on the same beat (see
    // flashFocusSnap) -- with the ident's per-note bloom, the status
    // bracket's inverse flash and the callsign resolving out of noise,
    // lock is now one event across sound, light and text instead of four
    // independent things that happen to land together.
    flashFocusSnap(s)
    // 23rd pass: attack transient on lock, see pulseVU().
    this.pulseVU(0.5)
    // 2026-08-22, round 9 -- LOCKED is replaced with a persistent MUTED
    // state (not a flash) while muted, so it stays obvious that unmuting
    // is required to begin the experience -- a locked-but-muted set shows
    // MUTED here instead of LOCKED, staying that way (no flash, no revert
    // -- see setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
    this.drawDial(s)
    // 36th pass: resume within the cutoff instead of always drawing fresh.
    // 2026-08-22, round 4 -- when presetTune() already primed this exact
    // station's audio (see _primeStationAudio()), reuse that track/load
    // decision instead of recomputing and re-loading it. Priming exists
    // specifically so loadTrack() gets called synchronously inside the
    // original tap/swipe/key, before presetTune()'s ~330ms dial sweep
    // (a setInterval callback -- not a live gesture, same class of problem
    // round 2 already found with the async PLAYING event) has a chance to
    // break that chain. tryLock() reached directly (arrow-seek landing on
    // lock, Enter) has no sweep in between, so it's already synchronous
    // with its own gesture and doesn't need this.
    const primed = this._primedTrack
    const primedFresh = primed && primed.station === station && Date.now() - primed.at < 2000
    let remembered, resumeGapMs, withinCutoff, track
    if (primedFresh) {
      ;({ remembered, resumeGapMs, withinCutoff, track } = primed)
    } else {
      ;({ remembered, resumeGapMs, withinCutoff, track } = this._pickTrackFor(station))
    }
    this._primedTrack = null
    this.currentTrack = track
    this.showStation(s, station)
    this.showTrack(s, track)
    // Re-applies volume for the new station/track's gain (see
    // applyVolume()) -- a station switch is exactly the moment a loudness
    // jump would otherwise show up.
    this.applyVolume()
    if (!primedFresh) {
      if (withinCutoff) {
        // Resume: seek to roughly where the "broadcast" would be now (the
        // position it was at when you left, advanced by however long you
        // were gone), clamped the same way the random mid-song join is --
        // see the CUED handler in initPlayer().
        this.loadTrack(track, { midSong: true, resumeAt: remembered.position + resumeGapMs / 1000 })
      } else {
        // Mid-song join: cues rather than loads, so actual playback (and the
        // PLAYING state) doesn't start until the onStateChange handler above
        // has picked a random point in the track and seeked to it.
        this.loadTrack(track, { midSong: true })
      }
    }
    this.setPlayState(s, 'buffering')
    saveSignalState(this)
  },
  // [B] back (14th pass) -- pops the most recently locked station off
  // history and tunes to it via the same sweep presetTune() already gives
  // number-key presets, so stepping back reads/sounds the same as jumping
  // to any other preset rather than a silent instant cut.
  goBack(s) {
    if (!this.history.length) return
    const station = this.history.pop()
    this.presetTune(s, station)
  },

  stopScan() {
    this.scanning = false
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null }
    // No longer stops the static bed here (12th pass) -- stopping a scan
    // (sweep finished, or 'S' pressed to cancel it) doesn't mean a station
    // was found, so the hiss should keep going into plain seeking rather
    // than cutting out. Only an actual lock (tryLock) or power-down now
    // stops it explicitly.
  },
  startScan(s) {
    // BUG FIXED 2026-08-20: SCAN_STEP (6) and LOCK_THRESHOLD (6) are the
    // same size, so a scan started from an already-locked station would
    // step exactly LOCK_THRESHOLD away on its very first tick and re-lock
    // the SAME station immediately -- scan looked completely broken because
    // it could never actually leave the station you were already on.
    // Fixed by ignoring lock candidates until the sweep has cleared a
    // buffer around wherever it started.
    const startFreq = this.freq
    const clearance = LOCK_THRESHOLD + SCAN_STEP
    if (this.mode === 'locked') this.enterSeeking(s)
    this.scanning = true
    this.setStatus(s, 'SCANNING...', false)
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
    this.scanTimer = setInterval(() => {
      let f = this.freq + SCAN_STEP
      if (f > FREQ_MAX) f = FREQ_MIN
      this.retune(s, f)
      if (Math.abs(f - startFreq) < clearance) return
      const { dist } = nearestStation(f)
      if (dist <= LOCK_THRESHOLD) this.tryLock(s)
    }, 90)
  },

  // 2026-08-22, round 4 -- see presetTune()'s comment on why this needs to
  // exist separately from tryLock()'s own track-selection logic, which it
  // otherwise duplicates: same resume-within-cutoff-vs-fresh-track choice,
  // just made synchronously in the gesture rather than at the end of the
  // dial sweep. `at` timestamps the pick so tryLock() can tell a genuinely
  // fresh primed track from a stale one (e.g. presetTune() called again for
  // a different station before the first sweep finished).
  /** Which track plays on landing on `station`: the one that was playing
   *  when you last left it, if that was within RESUME_CUTOFF_MS (36th pass),
   *  else a fresh draw from the shuffle bag. Shared by tryLock() and
   *  _primeStationAudio() -- 2026-08-25 audit; each had its own copy. */
  _pickTrackFor(station) {
    const remembered = this.lastPlayback[station.id]
    const resumeGapMs = remembered ? Date.now() - remembered.at : Infinity
    const withinCutoff = !!remembered && resumeGapMs < RESUME_CUTOFF_MS
    const track = withinCutoff ? remembered.track : this.nextTrack(station)
    return { remembered, resumeGapMs, withinCutoff, track }
  },
  _primeStationAudio(s, station) {
    if (!this.ready || !this.player) { this._primedTrack = null; return }
    const pick = this._pickTrackFor(station)
    this._primedTrack = { station, ...pick, at: Date.now() }
    if (pick.withinCutoff) {
      this.loadTrack(pick.track, { midSong: true, resumeAt: pick.remembered.position + pick.resumeGapMs / 1000 })
    } else {
      this.loadTrack(pick.track, { midSong: true })
    }
  },

  // Added 2026-08-20 -- presets used to jump straight to the target
  // frequency and lock instantly, which read as a hard cut rather than a
  // tuning action -- a brief scan/static beat instead of an instant
  // change. Sweeps the dial from wherever it is to the preset's frequency
  // over a handful of quick steps with the static bed under it, then locks.
  //
  // 53rd pass -- fixes hitting a preset twice in a row playing a new song
  // instead of continuing the current song at the current
  // location. This was the one remaining non-radio-ish thing left in
  // the app. Root cause: _primeStationAudio() below picks a track by
  // checking this.lastPlayback[station.id], which is only ever written
  // when you LEAVE a station (see tryLock()'s snapshot). Pressing the
  // preset for the station you're already locked to and currently
  // listening to never wrote that entry, so it read as "gap too long" and
  // picked a fresh random track via nextTrack() every time -- the exact
  // complaint. A real receiver's preset button does nothing at all when
  // you press the button you're already tuned to, so this bails out
  // before any of that track-selection logic runs: no sweep, no reload,
  // current track keeps playing exactly where it is. Still flashes the
  // preset number so the press visibly registers as a tiny
  // acknowledgment -- same flashStatus() mechanism VOL/MUTE use.
  presetTune(s, station) {
    if (this.mode === 'locked' && this.lockedStation === station) {
      const presetNum = STATION_PRESET_ORDER.indexOf(station) + 1
      this.flashStatus(s, presetNum > 0 ? `PRESET ${presetNum}` : 'LOCKED')
      return
    }
    this.stopScan()
    // 2026-08-22, round 4 -- fixes switching stations leaving mute off,
    // meters showing activity, but no audio until a manual tap. The actual
    // loadTrack() for this station used to fire only
    // once the ~330ms sweep below finished, inside its setInterval
    // callback. That's an async timer, not this tap/swipe/key's own call
    // stack, so any unmute attempt made there is in exactly the same boat
    // as round 2's async PLAYING-callback attempt: no live gesture, so it
    // silently doesn't stick. Priming here starts the actual audio load
    // (and its unmute) synchronously, in the real gesture, while the sweep
    // is still free to animate visually at its own pace -- tryLock() at
    // the sweep's end reuses this instead of loading a second time.
    this._primeStationAudio(s, station)
    if (this.mode === 'locked') this.enterSeeking(s)
    const startFreq = this.freq
    const target = station.freq
    const steps = 6
    let i = 0
    this.scanning = true
    // 38th pass: the preset number in the readout. Pressing a digit had no
    // acknowledgement on screen at all beyond the dial starting to move.
    // Falls back to the bare word for anything tuned by reference rather
    // than by preset -- [B] back, and the secret station (deliberately not
    // in STATION_PRESET_ORDER, so indexOf correctly returns -1 for it).
    const presetNum = STATION_PRESET_ORDER.indexOf(station) + 1
    this.setStatus(s, presetNum > 0 ? `TUNING ${presetNum}` : 'TUNING...', false)
    // 54th pass -- the physical button push, right before the tuning motor
    // (the whoosh below) engages.
    playPresetClick()
    // Tune-in whoosh (14th pass) -- a fun "tune-in" whoosh when
    // jumping straight to a preset (1-9). Plays once, under the sweep,
    // distinct from both the plain seek-static hiss and the ident tone
    // that plays once the sweep lands and locks a few hundred ms later.
    playPresetWhoosh()
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
    this.scanTimer = setInterval(() => {
      i += 1
      const f = i >= steps ? target : startFreq + (target - startFreq) * (i / steps)
      this.retune(s, f)
      if (i >= steps) {
        this.scanning = false
        clearInterval(this.scanTimer)
        this.scanTimer = null
        stopStaticNoise()
        // 2026-08-22: pass `station` through explicitly -- see tryLock()'s
        // `forced` param comment. Needed for a SECRET_STATIONS entry (not
        // in STATIONS, so nearestStation() alone would never find it),
        // and harmless for every normal preset too.
        this.tryLock(s, station)
      }
    }, 55)
  },
  // 2026-08-22: mirrors the exact three-way branching key() itself does
  // (powered-off, guide-open, normal) so "does this key do something"
  // matches "does this key click" precisely, without executing any of
  // key()'s actual side effects to find out.
  isMappedKey(e) {
    // 67th pass -- checked ahead of the poweredOn branch now: [I] on
    // STANDBY (see key() below) can open the guide while still powered
    // off, so guideOpen no longer implies poweredOn the way it used to.
    // The guide overlay closes on any key at all (see the "[any other
    // key] CLOSE" hint on every guide page) -- so while it's open, every
    // key is a real command, not just the ones in MAPPED_KEYS.
    if (this.guideOpen) return true
    // 67th pass, live QA fix -- poweredOn flips false the instant powerDown()
    // is called, but its collapse beats keep painting the screen for another
    // ~900ms (see powerDown()'s beats array), and powerUp() has its own
    // multi-second boot animation before poweredOn flips true. The STANDBY
    // guide key pressed during either window opened the guide overlay on top
    // of a screen that was still being redrawn out from under it -- the
    // exact same double-animation trap powerUp() itself already guards
    // against for a fast double P-press (see its 50th-pass comment). Gated
    // on _powerAnimating too, same fix, so the guide key only ever lands on
    // a settled STANDBY screen. 69th pass -- rebound from [I] to [G], same
    // key the guide already answers to powered-on (see key()'s 15th-pass G
    // binding) -- STANDBY no longer teaches a second key for the same thing.
    if (!this.poweredOn) return e.key === 'p' || e.key === 'P' || (!this.mobile && !this._powerAnimating && (e.key === 'g' || e.key === 'G'))
    // Visualizer (43rd pass) -- any key wakes it.
    if (this.visualizerActive) return true
    return MAPPED_KEYS.has(e.key)
  },
  key(s, e) {
    // 2026-08-22, round 4 -- same reasoning as onTouchStart's: true for
    // this function's synchronous body (and whatever it calls directly),
    // so loadTrack() knows a fresh mute-for-autoplay it triggers can be
    // unmuted immediately instead of deferred. try/finally clears it on
    // every return path.
    this._inUserGesture = true
    try {
    // 43rd pass -- any key counts as activity for the idle-visualizer
    // clock, whether or not it does anything else below.
    this._lastInputAt = Date.now()
    // 2026-08-22 -- same fix as onTouchStart's: unmuting from the async
    // PLAYING callback isn't a live gesture on the stricter browsers, so
    // flush it here too, on the desktop keyboard path.
    if (this._pendingUnmute && !this.muted && this.ready && this.player) {
      this._pendingUnmute = false
      this.player.unMute()
      this.applyVolume()
    }
    // 2026-08-23 (live audio tap) -- same flush-in-a-real-gesture pattern as
    // _pendingUnmute just above: a browser that gesture-gates getUserMedia
    // gets its deferred mic attempt retried here. No-op everywhere else.
    maybeRetryAudioTapInGesture(this, s)
    // Keypress click (32nd pass; scoped to mapped keys only 2026-08-22,
    // fixing a keypress click firing when command-tabbing between programs,
    // which should not happen) -- the listener sits on window (see
    // screen.js's addEventListener), so it sees every keydown that
    // reaches the page, not just ones this app cares about -- a browser/
    // OS shortcut like Cmd+Tab can still surface a keydown here before
    // (or instead of) the OS fully taking over. Original intent was "click
    // the same as a real keyboard would even on a key that ends up doing
    // nothing *in the app*" (e.g. Enter with nothing in range) -- not
    // "click for literally any keystroke on the page". isMappedKey() below
    // draws that line: true for anything this build actually treats as a
    // command in the current mode, false for everything else.
    if (this.isMappedKey(e)) playKeyClick()
    // Power toggle (12th pass) -- while off, every key except P is ignored
    // outright so nothing (seek, scan, presets, volume) can act on a set
    // that isn't switched on.
    // 67th pass -- [I] is a deliberate second exception, desktop only: an
    // info placard on the front of a dark receiver isn't power-gated on a
    // real radio either, unlike tuning/presets/volume, which all need the
    // tube alive to mean anything (the same "would a real analog radio
    // have this?" test the 29th pass used to drop play/pause). Guarded on
    // !this.guideOpen so this branch is skipped once the guide is actually
    // open -- see the guideOpen block further down, which then owns paging
    // and closing it, same as it always has while powered on.
    if (!this.poweredOn && !this.guideOpen) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); this.powerUp(s); return }
      // 67th pass, live QA fix -- also gated on !_powerAnimating (see
      // isMappedKey() above): without it, the STANDBY guide key pressed
      // during powerDown()'s ~900ms collapse beats (poweredOn is already
      // false, but the screen is still mid-animation) opened the guide on
      // top of a screen still being redrawn out from under it, producing a
      // garbled overlap of both. Confirmed live before adding the guard.
      // 69th pass -- rebound from [I] to [G] (see the hint text in
      // drawStandbyScreen() and isMappedKey() above).
      if (!this.mobile && !this._powerAnimating && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); this.openGuide(s, true) }
      return
    }
    // Visualizer (43rd pass) -- standard visualizer manners: ANY key
    // wakes it, and that keypress is consumed by the wake rather than also
    // running its normal action (so waking on an arrow key doesn't also
    // seek, waking on N doesn't also skip a track). Second press does
    // whatever it always did.
    // 50th pass -- added some controls, with one carve-out
    // list. These five keys act IN the visualizer instead of dismissing it,
    // so you can change the tint, skip a track, mute, or ride the volume
    // without dropping back to the main screen and re-entering. The
    // carve-outs are deliberately the controls that don't move you off the
    // station (no seek, no presets, no scan -- those all imply "I want the
    // dial back" and reading them as anything but an exit would be wrong).
    // 64th pass -- only [V], [E], and Escape exit now; every other
    // unmapped key is a no-op instead of closing the visualizer. The
    // footer legend already only ever named [E]XIT, so the visible
    // control surface is unchanged, this just makes the input match it.
    // These call the same methods the main screen does, which also draw
    // their normal chrome (the VOL bar in LEVELS, flashStatus at STATUS_Y)
    // into rows the visualizer is covering. That's safe rather than the
    // classic draw-outside-frame() bug: every effect repaints its whole
    // canvas (rows 1..VIZ_BOT-1) each frame, so those writes are gone on
    // the next tick and never visible. It IS why the flash below exists --
    // that feedback being invisible is exactly the problem it solves.
    if (this.visualizerActive) {
      e.preventDefault()
      const vizFlash = (text) => {
        this._vizFlash = { text, until: Date.now() + 1400 }
        this.drawVisualizerInfo(s)
      }
      switch (e.key) {
        case 'c': case 'C':
          // 65th pass -- Shift+C cycles the effect itself (any built
          // effect, on any station -- see cycleVisualEffect), plain C
          // keeps its original job cycling the CRT tint. Checked on
          // e.shiftKey rather than the key case: e.key is 'C' for both
          // Shift+c and Caps-Lock+c, and a Caps-Lock user's plain [C]
          // press needs to keep doing exactly what it always did.
          // Kept as a secondary binding alongside [V] below (66th pass) --
          // same action either way, so nothing regresses for anyone who'd
          // learned Shift+C already.
          if (e.shiftKey) {
            this.cycleVisualEffect(s)
            vizFlash(VISUALS[this.activeVisualKey()].label)
            return
          }
          this.cycleDisplayMode(s)
          vizFlash(DISPLAY_MODES[this.displayModeIndex].label)
          return
        case 'n': case 'N':
          // No flash: the track title and the position bar in the footer
          // both visibly change on their own, which is better feedback
          // than a word would be.
          this.skip(s)
          // 2026-08-24 -- if this skip lands on a track with no lyrics,
          // drawVisualizerFrame's own per-tick check (not this one -- see
          // its comment) is what actually closes the lyrics view once the
          // new track's lookup resolves; nothing extra needed here.
          this.drawVisualizerInfo(s)
          return
        case 'm': case 'M':
          this.toggleMute(s)
          vizFlash(this.muted ? 'MUTED' : 'UNMUTED')
          return
        case 'ArrowUp':
          this.adjustVolume(s, 10)
          vizFlash(`VOL ${this.volume}`)
          return
        case 'ArrowDown':
          this.adjustVolume(s, -10)
          vizFlash(`VOL ${this.volume}`)
          return
        case 'l': case 'L':
          // 2026-08-24 -- silently does nothing (no flash) when lyrics
          // aren't available for the current track, same restraint as [N]
          // above: a key that can't act shouldn't feel like it broke.
          if (lyricsStateFor(this.currentTrack) !== 'available') return
          this.lyricsViewOpen = !this.lyricsViewOpen
          this.drawVisualizerInfo(s)
          return
        case 'v': case 'V':
          // 66th pass -- [V] opened the visualizer, but had also exited
          // it, which meant there was no key that cycled effects without
          // leaving the mnemonic on double duty; live QA asked for V to
          // just cycle once inside, and only [E]/Escape to exit. Same
          // action and flash as Shift+C above.
          this.cycleVisualEffect(s)
          vizFlash(VISUALS[this.activeVisualKey()].label)
          return
        case 'e': case 'E':
        case 'Escape':
          this.exitVisualizer(s)
          return
      }
      return
    }
    // Guide overlay (15th pass; paged 18th pass; expanded to per-station
    // pages 32nd pass) -- while open, ANY key closes it (matches the "[any
    // other key] CLOSE" hint on every guide page) except: ArrowRight/
    // ArrowLeft, which step sequentially through all guideTotalPages()
    // pages (About, Index, then one detail page per station) instead of
    // closing; and, while on the Index page specifically, a preset digit
    // (1-9), which jumps straight to that station's detail page rather
    // than making you arrow past every station in between. Intercepted
    // before the switch below so nothing else (seek, lock, presets) can
    // act underneath the overlay.
    if (this.guideOpen) {
      e.preventDefault()
      const totalPages = this.guideTotalPages()
      if (e.key === 'ArrowRight' && this.guidePage < totalPages) { this.guidePage++; this.drawGuidePage(s); return }
      if (e.key === 'ArrowLeft' && this.guidePage > 1) { this.guidePage--; this.drawGuidePage(s); return }
      if (this.guidePage === 2 && /^[1-9]$/.test(e.key)) { this.guidePage = 2 + Number(e.key); this.drawGuidePage(s); return }
      this.closeGuide(s)
      return
    }
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); this.seekStep(s, -SEEK_STEP); break
      case 'ArrowRight': e.preventDefault(); this.seekStep(s, SEEK_STEP); break
      case 'Enter': e.preventDefault(); this.tryLock(s); break
      case 's': case 'S': e.preventDefault(); this.scanning ? this.stopScan() : this.startScan(s); break
      // 29th pass -- play/pause vs. mute-only was reconsidered and
      // play/pause removed. A real broadcast can't be paused, only muted or turned
      // off; play/pause was the one control that broke that fiction, since
      // every other control (mute, power, tuning) respects that the
      // station keeps running whether you're listening or not. `M` (mute)
      // already does the radio-authentic version of "make it stop": it
      // calls player.mute()/unMute(), which silences output without
      // stopping playback underneath -- unmuting resumes wherever the
      // "broadcast" currently is, exactly like turning a real radio's
      // volume back up. togglePlayPause() removed entirely; SPACE is now
      // unbound.
      // 35th pass: Shift+N hidden station-hopping mode removed, since it
      // didn't work as intended -- N is back to a plain single-purpose
      // key, always skipping the dead/current track within the locked
      // station.
      case 'n': case 'N': e.preventDefault(); this.skip(s); break
      case 'ArrowUp': e.preventDefault(); this.adjustVolume(s, 10); break
      case 'ArrowDown': e.preventDefault(); this.adjustVolume(s, -10); break
      case 'm': case 'M': e.preventDefault(); this.toggleMute(s); break
      case 'p': case 'P': e.preventDefault(); this.powerDown(s); break
      // History back (14th pass) -- discovery/history navigation.
      case 'b': case 'B': e.preventDefault(); this.goBack(s); break
      // Guide (15th pass) -- adds a G key for the guide.
      case 'g': case 'G': e.preventDefault(); this.openGuide(s); break
      // Display modes (23rd pass) -- lets users cycle display modes.
      case 'c': case 'C': e.preventDefault(); this.cycleDisplayMode(s); break
      // Visualizer (43rd pass) -- "V" for saVer, the mnemonic
      // still works after the 44th pass rename to "Visualizer" -- manual
      // toggle in, any time you're locked. Silently no-ops otherwise
      // (mirrors [B] BACK with empty history) -- getting in is only
      // meaningful once there's a station/track to show on the info bar.
      case 'v': case 'V':
        e.preventDefault()
        if (this.mode === 'locked' && this.lockedStation) this.enterVisualizer(s)
        break
      // 11th pass (2026-08-20): 4 new stations brought STATIONS back up to
      // 9 -- preset keys match its length again, same pattern as the 10th
      // pass's drop to 5.
      // 22nd pass: back to `1`-`9` only -- HACKBACK's `0` binding (20th
      // pass) only made sense while there were 10 stations; dropping OUTLAW
      // brought the roster back to 9 -- 9 channels is the current max, so
      // `0` is retired and HACKBACK now falls wherever it lands
      // in STATION_PRESET_ORDER like everything else.
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
        e.preventDefault()
        // 17th pass: STATION_PRESET_ORDER (freq-sorted), not STATIONS
        // (chronological add-order) -- see its definition for why -- so
        // preset number always matches left-to-right position on the dial.
        const ch = STATION_PRESET_ORDER[Number(e.key) - 1]
        if (ch) this.presetTune(s, ch)
        break
      }
      // 2026-08-22: '0' bound directly to NIN_STATION, not derived from
      // STATION_PRESET_ORDER -- see SECRET_STATIONS' comment for why it's
      // deliberately not part of STATIONS at all.
      case '0': e.preventDefault(); this.presetTune(s, NIN_STATION); break
      // 2026-08-24: Shift+0 (')' e.key on a standard layout) was bound the
      // same way to a second secret station, GREEN HOUSE -- pulled before
      // shipping for now, so this key is
      // unbound again. See SECRET_STATIONS' own comment for the station
      // itself; re-adding this case is the only other step if it returns.
    }
    } finally { this._inUserGesture = false }
  },

  frame(s, t) {
    // 2026-08-25 audit -- tick the effects queues first. The always-queue
    // runs in every state; the normal queue only while powered on with no
    // guide up (see _tickFx), which is exactly the bail-out just below.
    this._tickFx(performance.now())

    // Power toggle (12th pass) -- the collapse/warm-up sequences draw
    // everything themselves on their own timers, so the normal per-frame
    // idle shimmer/progress/VU redraws need to stay out of the way while
    // powered off (they'd otherwise paint stray dial dots and meter bars
    // onto what's supposed to read as a dark screen). Same reasoning for
    // the guide overlay (15th pass) -- it's a full-screen takeover of the
    // same grid, so per-frame redraws would punch holes in it too.
    if (!this.poweredOn || this.guideOpen) return

    // 2026-08-23 (live audio tap) -- refill the signal bus once per rAF,
    // before anything below reads it. After the bail above on purpose: in
    // STANDBY/guide nothing consumes the bus, so nothing samples either
    // (this is also why the capture surviving power cycles costs nothing).
    sampleAudioTap()

    // Visualizer (43rd pass) -- idle trigger. Only arms while locked and
    // actually playing; there's nothing worth idling into while seeking,
    // scanning, or between stations. Manual entry is the [V] case in key(),
    // which mobile can never reach anyway (no keyboard) -- but this timer
    // fires on its own regardless of input source, so it needs its own
    // guard: every visualizer effect is drawn for the 80-col desktop grid
    // and would render as garbage squeezed into mobile's 42.
    if (!this.mobile && !this.visualizerActive && this.mode === 'locked' && this.lockedStation &&
        Date.now() - this._lastInputAt > VISUALIZER_IDLE_MS) {
      this.enterVisualizer(s)
    }
    // Early return, same shape as the poweredOn/guideOpen bail above --
    // this is a full-screen takeover of its own, so none of the normal
    // per-frame draws (including the rare idle CRT tear/roll and the
    // always-on border shimmer, both further down) should run underneath
    // it: the idle/shimmer tear does not stay active during the visualizer.
    if (this.visualizerActive) { this.drawVisualizerFrame(s, t); return }

    // 54th pass -- warm-up drift. this._warmupUntil is set once, on every
    // power-on (see powerUp()'s REVEAL_DELAY beat). Cosmetic only --
    // this._freqJitter is added to the DRAWN freq/dial cursor by
    // drawFreq()/drawDial(), this.freq itself never moves, so real tuning
    // logic (nearestStation, lock matching, the SIG meter) is untouched
    // even if someone starts seeking during the window. No dial on mobile,
    // nothing to wobble there.
    if (!this.mobile && this._warmupUntil) {
      const remain = this._warmupUntil - Date.now()
      if (remain > 0) {
        // Amplitude decays linearly to 0 across the window -- an oscillator
        // finding its lock, not a steady shimmer. Redrawn at the same cadence
        // as the VU/antenna just below rather than every frame; cheap, and a
        // wobble faster than that reads as glitchy rather than "settling."
        const amp = 0.15 * (remain / WARMUP_MS)
        this._freqJitter = Math.sin(Date.now() / 90) * amp
        if (t - (this._lastWarmupDraw || 0) > 0.08) {
          this._lastWarmupDraw = t
          this.drawFreq(s)
          this.drawDial(s)
        }
      } else {
        this._warmupUntil = null
        this._freqJitter = 0
        this.drawFreq(s)
        this.drawDial(s)
      }
    }

    // Idle shimmer on the dial while seeking, so the empty band doesn't feel
    // dead between stations. Cheap: only touch a handful of cells per frame.
    // 45th pass -- mobile has no dial at all, and DIAL_Y collides with the
    // station-name row on its grid, so this is skipped there rather than
    // risking a stray dot landing in displayed text during the brief
    // 'seeking' window a preset sweep passes through.
    if (!this.mobile && this.mode === 'seeking' && Math.random() < 0.15) {
      const x = DIAL_X0 + Math.floor(Math.random() * (DIAL_X1 - DIAL_X0))
      const cursorCol = freqToCol(this.freq)
      // BUG FIXED (41st pass, found while verifying the per-station dial
      // glyphs): this shimmer picks ANY column on the dial and paints a
      // FAINT '·'/':' over it -- including the columns holding station
      // markers. Nothing repaints them until the next retune() call, so
      // sitting still anywhere on the band quietly ate the markers one by
      // one, and the dial you were supposed to be navigating by went blank.
      // It has always done this (the old uniform '▲'s disappeared exactly
      // the same way); giving each station its own glyph is what finally
      // made it obvious, since a dial full of DIFFERENT shapes is something
      // you actually read. The cursor column was already excluded for the
      // same reason -- this just extends that to the markers.
      if (x !== cursorCol && !STATION_COLS.has(x)) {
        const chars = ['·', '·', '·', ':', '.']
        s.term.put(x, DIAL_Y, chars[Math.floor(Math.random() * chars.length)], FAINT)
      }
    }

    // Track progress -- a few times a second is plenty for a time display.
    if (t - this.lastProgressDraw > 0.25) {
      this.lastProgressDraw = t
      this.drawPlayback(s)
    }

    // Fake VU meter -- bounces a bit faster than the progress bar so it
    // reads as "live" rather than a slow crawl. Kept running even when not
    // locked so it eases back down to flat instead of freezing mid-bounce.
    if (t - (this.lastVuDraw || 0) > 0.12) {
      this.lastVuDraw = t
      this.drawVU(s)
      // 58th pass -- the tri-band BASS/MID/TREBLE meter shares the VU's
      // redraw cadence too, same reasoning as the antenna glyph below: it
      // needs to track the live audio tap continuously, not just on
      // discrete redraw events.
      this.drawEqRibbonLeft(s)
      // 29th pass: the antenna glyph shares the VU's redraw cadence --
      // cheap, and it's the same rate its own ring animation needs anyway.
      this.drawAntenna(s, t)
    }

    // 38th pass -- rare idle CRT events (see crtIdleEvent). A set left on
    // one station for a couple of minutes should do SOMETHING once in a
    // while; rare enough (90-210s apart) that it stays a surprise rather
    // than becoming another layer of ambient texture. The first interval
    // is seeded on the first frame after power-on rather than in init(),
    // so the clock starts when the set does.
    // 50th pass: the interval is now per-station -- STATIONS[].idleEvent
    // ({minS, maxS}, optional) overrides the roster default of 90-210s.
    // Built for the secret NIN station ("make the station itself cause
    // more glitches and effects overall while tuned"), which runs at
    // 12-30s; any future station can opt into its own cadence the same
    // way. Read off lockedStation at scheduling time, so locking/leaving
    // a glitchy station picks its rate up on the next cycle.
    const idleEv = (this.mode === 'locked' && this.lockedStation && this.lockedStation.idleEvent) || { minS: 90, maxS: 210 }
    // Pull a pending schedule in when it's further out than the active
    // station's own ceiling -- otherwise locking a fast-cadence station
    // mid-cycle would sit through the remainder of a 90-210s roster-default
    // wait before its 12-30s rate ever took effect.
    if (this._nextIdleEventAt && this._nextIdleEventAt > t + idleEv.maxS) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
    }
    if (!this._nextIdleEventAt) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
    } else if (t > this._nextIdleEventAt) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
      // 49th pass (0.9 QA pass): crtIdleEvent's roll/tear scramble writes
      // to BOX_BOTTOM_ROWS, which are desktop row numbers -- the same trap
      // the idle shimmer below already guards against with its own
      // `!this.mobile` check (see that comment: one of these rows lands on
      // NOW PLAYING's artist text on mobile's shorter grid). The shimmer
      // got the guard, this sibling effect never did. Gate it the same way
      // rather than let a "rare surprise" occasionally scribble into
      // mobile's compact chrome.
      if (this.mode === 'locked' && !this.mobile) this.crtIdleEvent(s)
    }

    // 50th pass -- the "grind" layer (see STATIONS[].grind: {minS, maxS},
    // optional; only the secret NIN station sets it). Smaller and far more
    // frequent than crtIdleEvent's roll/tear: quick chroma/roll/snow
    // stabs and the occasional full flashCrtGlitch(), so a station that
    // sets this never sits still -- the signal reads as actively fighting
    // the receiver. CRT params only, deliberately: no text-grid writes, so
    // there is nothing here that can stomp drawn cells (the shimmer/tear
    // class of bug) and nothing that needs a mobile row-budget port --
    // still gated !this.mobile anyway, since mobile never renders the
    // desktop CRT-heavy experience this is tuned against.
    if (this.mode === 'locked' && !this.mobile && this.lockedStation && this.lockedStation.grind) {
      const g = this.lockedStation.grind
      if (!this._nextGrindAt) {
        this._nextGrindAt = t + g.minS + Math.random() * (g.maxS - g.minS)
      } else if (t > this._nextGrindAt) {
        this._nextGrindAt = t + g.minS + Math.random() * (g.maxS - g.minS)
        this.crtGrind(s)
      }
    } else {
      this._nextGrindAt = 0
    }

    // Always-on idle phosphor shimmer (14th pass) -- a subtle
    // always-on scanline or phosphor-flicker shimmer even at idle so the
    // CRT never looks perfectly static. Independent of mode/lock state --
    // unlike the dial shimmer above, this runs whenever the set is powered,
    // locked or not. Only ever touches a box-BOTTOM border row: those are
    // plain '─' the full width (drawBoxBottom has no embedded label, unlike
    // drawBoxTop), so a random cell can never clobber a panel title. Briefly
    // dips one cell a notch below rest, then a timer fades it back up to
    // that row's own resting attribute (BOX_BOTTOM_REST_ATTR -- NOT a
    // hardcoded MUTED: NOW PLAYING's border rests at BOLD, see its
    // definition, and restoring to MUTED there was a real bug found live in
    // the 42nd pass -- see the same note). The dip itself is likewise
    // BOX_BOTTOM_FLASH_ATTR, one notch below THAT row's rest, not a flat
    // DIM for all four -- a flat DIM read as invisible on the MUTED rows but
    // a much bigger, face-changing dip on NOW PLAYING's brighter BOLD rest
    // (found live right after the rest-attribute fix, same session).
    // 45th pass -- these are desktop row numbers; on mobile's shorter grid
    // one of them (STATION_BOT_Y) lands on the NOW PLAYING box's artist
    // row instead of a border, which would occasionally punch a stray '-'
    // into displayed text. Skipping the shimmer on mobile entirely rather
    // than building it a second row/column set for a cosmetic-only effect.
    if (!this.mobile && Math.random() < 0.05) {
      const y = BOX_BOTTOM_ROWS[Math.floor(Math.random() * BOX_BOTTOM_ROWS.length)]
      let x = BOX_X0 + 1 + Math.floor(Math.random() * (BOX_X1 - BOX_X0 - 1))
      // 18th pass: METERS_BOT_Y now has a '┻' T-junction at
      // METERS_DIVIDER_X (see drawChrome) -- this shimmer assumed every
      // bottom-border cell was a plain '─' and would permanently stomp the
      // junction with a dash if it ever landed there (writes '─' both for
      // the flash and the fade-back). Nudge off that one column instead.
      if (y === METERS_BOT_Y && x === METERS_DIVIDER_X) x += x < BOX_X1 - 1 ? 1 : -1
      const restAttr = BOX_BOTTOM_REST_ATTR.get(y)
      s.term.put(x, y, '─', BOX_BOTTOM_FLASH_ATTR.get(y))
      // 49th pass: this fade-back timer only checked poweredOn, not
      // guideOpen -- the one async box-bottom restore in the file missing
      // that second guard (crtIdleEvent's own restore checks both). The
      // guide overlay is a full-screen clearAll() redraw, so if it opens
      // inside this ~90-170ms window the timer punches a stray '─' through
      // it. 2026-08-25 audit: no guard at all any more -- on the effects
      // queue it can't fire while the guide is up (and if the guide opens
      // and closes inside the window, the late restore lands on a freshly
      // redrawn, identical border cell).
      this.fxAfter('shimmer', 90 + Math.random() * 80, () => s.term.put(x, y, '─', restAttr))
    }
  },
}
