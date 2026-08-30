// Headless harness for program.js (2026-08-25 audit).
//
// program.js has no module-level DOM dependencies, so Node can import it
// directly; everything it needs at runtime is stubbed here: a `window`, a
// `document`, `localStorage`, the YouTube API handshake globals, `fetch`
// (rejects -- no network in tests), and a FAKE CLOCK. `performance.now()`
// and `Date.now()` both read the harness's `now`, which only moves when a
// test calls advance(); advance() then drives program.frame() in 16ms
// steps and rasterises the real Term, so a test can power the set on, wait
// out the boot readout, open the guide, and assert on the text grid --
// exactly the sequences that used to break, replayed deterministically in
// a few milliseconds.
//
// The CRT is a stub with a real `params` object (program.js drives it) and
// the same setPhosphor()/clearPersist() contract as src/crt.js, counting
// persistence clears so a test can assert on them.
//
// Every boot() gets a fresh module instance of program.js/config.js/
// stations.js (unique `?v=` query per boot), since program.js keeps
// module-level state (audio handles, crtBase, the tap) that would otherwise
// leak between tests.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Four timed lines, spaced far enough apart that a test can seek onto one
// and be certain which is active. parseLRC() sorts and drops untimed/blank
// lines, so this also exercises the real parser rather than bypassing it.
const CANNED_LRC = [
  '[00:00.00] first line of the canned lyric',
  '[00:12.00] second line of the canned lyric',
  '[00:24.00] third line of the canned lyric',
  '[00:36.00] fourth line of the canned lyric',
].join('\n')

// How long the fake player claims every track is. Comfortably over the 20s
// floor the mid-song join checks, so the CUED path behaves as it does live.
const FAKE_DURATION = 214
let bootCount = 0
let font = null

/** A KeyboardEvent's `code` for the keys this suite presses -- the physical
 *  key, which is what a browser reports and what a held-key set has to be
 *  keyed on. Only the shapes SIGNAL actually binds are covered; anything
 *  else falls back to the key itself, which is close enough for a control
 *  nothing holds down. */
function codeFor(key) {
  if (key === ' ') return 'Space'
  if (key === 'Enter' || key === 'Escape' || key.startsWith('Arrow')) return key
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return key
}

export async function boot({ saved = null, mobile = false, tap = null, player = false, lyrics = null, station = null } = {}) {
  const tag = `test${++bootCount}`
  let now = 0
  const store = new Map()
  if (saved) store.set('signal:state:v1', JSON.stringify(saved))

  globalThis.window = globalThis
  // 2026-08-26 (issue #8) -- enough of the Fullscreen API for
  // toggleFullscreen() to be exercised headlessly, recorded in h.fsCalls.
  // requestFullscreen resolves here; in a real browser it REJECTS when the
  // browser declines, which is why the caller catches (see toggleFullscreen).
  const fsCalls = []
  const doc = {
    hidden: false, visibilityState: 'visible', title: '', activeElement: null,
    addEventListener() {}, removeEventListener() {},
    fullscreenElement: null,
    exitFullscreen() { fsCalls.push('exit'); doc.fullscreenElement = null; return Promise.resolve() },
  }
  doc.documentElement = {
    requestFullscreen() { fsCalls.push('request'); doc.fullscreenElement = doc.documentElement; return Promise.resolve() },
  }
  globalThis.document = doc
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  // config.js decides MOBILE_LITE once at import from matchMedia; force it.
  globalThis.matchMedia = () => ({ matches: mobile })
  // 2026-08-25 (the consent pass) -- navigator is stubbed on EVERY boot, not
  // just the tap ones, so a capture-capable boot can't leak its stub into the
  // next test through the real Node global. Default is a browser with no
  // capture at all: audio/tap.js's IS_CHROMIUM_DESKTOP goes false and every
  // path short-circuits on the missing mediaDevices, which is exactly what
  // the suite saw before this option existed.
  //
  // `tap: 'tab' | 'mic'` gives it the one capability that tier needs, and
  // records every capture call in h.tapCalls. Both stubs REJECT: the point of
  // the consent pass is WHEN a prompt is raised, not what a granted stream
  // does, and a resolved stream would drag a real AudioContext in through
  // wireTapAnalyser() for no extra coverage. NotAllowedError is also the
  // interesting rejection -- it's the user closing the picker, the case that
  // must NOT escalate into a second prompt.
  const realNavigator = globalThis.navigator
  const tapCalls = []
  const declined = (name) => () => {
    tapCalls.push(name)
    return Promise.reject(Object.assign(new Error('declined'), { name: 'NotAllowedError' }))
  }
  const mediaDevices = tap === 'tab'
    ? { getDisplayMedia: declined('getDisplayMedia'), getUserMedia: declined('getUserMedia') }
    : tap === 'mic' ? { getUserMedia: declined('getUserMedia') } : undefined
  Object.defineProperty(globalThis, 'navigator', {
    // userAgentData IS the Chromium check in audio/tap.js -- only the tab
    // tier gets it, so a 'mic' boot models Firefox/Safari desktop honestly
    // rather than by hiding getDisplayMedia from a Chromium-shaped browser.
    value: { userAgentData: tap === 'tab' ? { mobile: false } : undefined, mediaDevices },
    configurable: true,
    writable: true,
  })
  globalThis.SIGNAL_YT_READY = false
  globalThis.SIGNAL_YT_QUEUE = []
  globalThis.SIGNAL_BUILD = tag
  // `station` fakes the ?station=<id> query the identity editor's live
  // preview boots the receiver with (tools/network.html). Node has no
  // location at all, so program.js's read of it is wrapped in a try/catch
  // and every other test in this file exercises the no-location path -- which
  // means without this option the param would have no coverage whatsoever.
  if (station) globalThis.location = { search: `?station=${station}` }
  else delete globalThis.location
  // 2026-08-27 -- `lyrics` answers the ONE request this app makes that a
  // test might want to succeed: the LRCLIB lookup behind the visualizer's
  // [L] view. Pass true for the canned track below, a raw LRC string for
  // your own, 'none' for a 200 with no synced lyrics, or a function of the
  // request URL returning either -- which is how a test gets ONE track with
  // lyrics and the next without, the case drawVisualizerFrame() re-checks
  // every tick to close a view that has run out from under itself. 'none'
  // is the interesting negative on its own too: lyricsStateFor() is
  // deliberately binary, so a plain-text-only match is 'unavailable'.
  // Everything else still rejects -- no test should reach the network.
  const lrcFor = (url) => {
    // The function form may answer `true` for "the canned one", so a test
    // that only cares WHICH tracks get lyrics doesn't have to carry an LRC.
    if (typeof lyrics === 'function') { const r = lyrics(url); return r === true ? CANNED_LRC : r || null }
    if (lyrics === true) return CANNED_LRC
    return typeof lyrics === 'string' && lyrics !== 'none' ? lyrics : null
  }
  globalThis.fetch = (url) => {
    if (lyrics && String(url).includes('lrclib.net')) {
      const lrc = lrcFor(String(url))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(lrc ? { syncedLyrics: lrc } : {}) })
    }
    return Promise.reject(new Error('no network in tests'))
  }
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => now }, configurable: true, writable: true,
  })
  const realDateNow = Date.now
  Date.now = () => 1_800_000_000_000 + now

  // Fake timers, on the same clock. program.js deliberately keeps a few
  // things on real setTimeout/setInterval (the scan and preset dial sweeps,
  // the clock, audio scheduling) -- see the fx note at the top of the
  // program object. Under test those have to move with advance() too, or a
  // preset press never finishes its sweep. Timers due at a step run before
  // that step's frame(), in creation order among equals.
  const real = {
    setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout, clearInterval: globalThis.clearInterval,
  }
  let timerSeq = 0
  const timers = new Map() // id -> { at, every, fn, args }
  globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++timerSeq; timers.set(id, { at: now + Math.max(0, ms), every: 0, fn, args }); return id }
  globalThis.setInterval = (fn, ms = 0, ...args) => { const id = ++timerSeq; const every = Math.max(1, ms); timers.set(id, { at: now + every, every, fn, args }); return id }
  globalThis.clearTimeout = (id) => { timers.delete(id) }
  globalThis.clearInterval = (id) => { timers.delete(id) }
  const runDueTimers = () => {
    const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])
    for (const [id, t] of due) {
      if (!timers.has(id)) continue // cleared by an earlier callback
      if (t.every) t.at += t.every // from the scheduled time, as a real interval does
      else timers.delete(id)
      t.fn(...t.args)
    }
  }

  if (!font) {
    const { parseBDF } = await import('../src/bdf.js')
    font = parseBDF(readFileSync(path.join(root, 'fonts', 'ter-u16n.bdf'), 'utf8'))
  }
  const { Term } = await import('../src/term.js')
  const config = await import(`../config.js?v=${tag}`)
  const { GRID, SCREEN, PHOSPHORS, PHOSPHOR } = config
  const term = new Term(font, GRID.cols, GRID.rows, GRID.padX, GRID.padY)
  const crt = {
    params: { ...SCREEN },
    phosphors: PHOSPHORS,
    phosphor: PHOSPHORS[PHOSPHOR],
    clears: 0,
    setPhosphor(name) {
      const tint = this.phosphors[name]
      if (!tint || tint === this.phosphor) return
      this.phosphor = tint
      this.clearPersist()
    },
    clearPersist() { this.clears++ },
  }
  const program = (await import(`../program.js?v=${tag}`)).default

  // 2026-08-27 -- an optional fake YouTube IFrame player. `player: true`.
  //
  // Without it there is no player at all, and loadTrack() returns on its
  // first line (`if (!this.ready || !this.player) return`) -- so every test
  // so far has exercised the tuning half of this app with the playback half
  // switched off. That is why the visualizer's [L] lyrics view had never
  // been reachable in a test: the lookup that feeds it is fired from inside
  // loadTrack, past that early return.
  //
  // The surface is small and closed -- ten methods and three events -- so
  // this models it rather than stubbing it: position advances on the same
  // fake clock as everything else, seekTo/pause/play move it the way the
  // real one does, and the state events fire on a timer rather than
  // synchronously, because a synchronous onReady inside init() would be a
  // shape the real API never produces. h.player exposes the two things a
  // test cannot cause from the outside: the end of a track, and a dead
  // video (the content-ops safety net in initPlayer's onError).
  const playerCalls = []
  let fake = null
  if (player) {
    globalThis.YT = {
      PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
      Player: function Player(id, opts) {
        const ev = (opts && opts.events) || {}
        let base = 0, startedAt = 0, playing = false, ended = false
        let adHolding = false
        const pos = () => base + (playing ? (now - startedAt) / 1000 : 0)
        // 22nd pass: content does not start the instant it is asked for.
        // The live capture timed a healthy load at about a second between
        // the cue and PLAYING, and that gap is not incidental -- it is the
        // exact window the STATION BREAK hold has to sit through without
        // flashing. Firing PLAYING at 0ms, as this did, made the window
        // zero-width and any over-eager hold passed the suite unnoticed
        // (caught by mutating BREAK_HOLD_MS to 0: the anti-flash test did
        // not blink). Everything else fires promptly; only starting to play
        // takes its realistic beat.
        const START_DELAY_MS = 700
        const fire = (state, delay = 0) => setTimeout(() => ev.onStateChange && ev.onStateChange({ data: state }), delay)
        const firePlaying = () => fire(YT.PlayerState.PLAYING, START_DELAY_MS)
        const load = (videoId, cue) => {
          playerCalls.push(`${cue ? 'cue' : 'load'}:${videoId}`)
          base = 0; startedAt = now; playing = !cue && !adHolding; ended = false
          // Under an advert the requested video is loaded but never starts,
          // so the one event the app keys on -- PLAYING -- simply does not
          // arrive. BUFFERING is what a real preroll reports on the way in.
          if (adHolding) fire(YT.PlayerState.BUFFERING)
          else if (cue) fire(YT.PlayerState.CUED)
          else firePlaying()
        }
        fake = this
        this.videoId = null
        this.muted = false
        this.volume = 100
        this.loadVideoById = (v) => { this.videoId = v; load(v, false) }
        this.cueVideoById = (v) => { this.videoId = v; load(v, true) }
        this.playVideo = () => { if (!playing) { startedAt = now; playing = true; firePlaying() } }
        this.pauseVideo = () => { if (playing) { base = pos(); playing = false; fire(YT.PlayerState.PAUSED) } }
        this.seekTo = (t) => { base = Math.max(0, t); startedAt = now }
        this.getCurrentTime = () => pos()
        this.getDuration = () => (this.videoId ? FAKE_DURATION : 0)
        // 2026-08-27, 22nd pass -- REWRITTEN FROM A LIVE CAPTURE, and the
        // rewrite is the whole point. The first version modelled an advert
        // the way the IFrame API was assumed to report one: getVideoData()
        // naming the advert, getDuration() giving the advert's length. A
        // capture through a real preroll showed both assumptions false --
        // the player answers with the REQUESTED video's id and the
        // REQUESTED video's duration the whole way through:
        //
        //     id=XZVpR3Pk-r8  want=XZVpR3Pk-r8  same
        //     state=UNSTARTED  dur=181.0        <- the track's own length
        //
        // So this fake now tells the truth by telling the app nothing. An
        // advert here is simply a load whose PLAYING event never arrives;
        // id and duration keep describing the track, because that is what
        // YouTube does. Any future detector built on ids or durations will
        // fail against this model exactly as it fails in the real browser,
        // which is the property that was missing before.
        this.startAd = () => { adHolding = true }
        this.endAd = () => {
          adHolding = false
          if (this.videoId) { base = 0; startedAt = now; playing = true; firePlaying() }
        }
        this.getVideoData = () => ({ video_id: this.videoId })
        this.getPlayerState = () => (
          adHolding ? YT.PlayerState.UNSTARTED
            : ended ? YT.PlayerState.ENDED
              : playing ? YT.PlayerState.PLAYING
                : this.videoId ? YT.PlayerState.CUED
                  : YT.PlayerState.UNSTARTED
        )
        this.mute = () => { this.muted = true }
        this.unMute = () => { this.muted = false }
        this.setVolume = (v) => { this.volume = v; playerCalls.push(`volume:${v}`) }
        // The track running out. Real playback reaches this on its own; the
        // fake clock would have to be advanced through a whole song to, so
        // tests ask for it. `ended` guards a double-fire, same as the real
        // player, since ENDED lands the app in skip() which loads again.
        this.endTrack = () => {
          if (ended) return
          ended = true; playing = false; base = FAKE_DURATION
          ev.onStateChange && ev.onStateChange({ data: YT.PlayerState.ENDED })
        }
        this.fail = () => { ev.onError && ev.onError({ data: 150 }) }
        setTimeout(() => ev.onReady && ev.onReady({ target: this }), 0)
      },
    }
    globalThis.SIGNAL_YT_READY = true
  }
  const screen = {
    term, crt, program, config,
    cols: term.cols, rows: term.rows,
    setPhosphor(name) { crt.setPhosphor(name) },
  }
  program.init(screen)

  const h = {
    screen, term, crt, program, config,
    /** This boot's `?v=` tag. Every app module is instanced per full URL
     *  (see CLAUDE.md), so a test that needs to read module-level state the
     *  booted program is actually using -- rather than a second, unrelated
     *  copy -- must import it as `../x.js?v=${h.tag}`. That is the only way
     *  to observe the WebAudio side from Node, where there is no
     *  AudioContext and every sound silently no-ops. */
    tag,
    get now() { return now },
    /** Dispatch a keydown the way screen.js would.
     *
     *  Carries a `code` as well as a `key` since 2026-08-29, because the
     *  real event does and VECTOR SCAN's held-key set is keyed on it (see
     *  program.keyUp). Modelled off a real KeyboardEvent rather than off
     *  what the game happens to read -- a fake built from the consumer's
     *  assumptions is the trap CLAUDE.md's advert note is about. */
    key(key, extra = {}) {
      program.key(screen, { key, code: codeFor(key), shiftKey: false, preventDefault() {}, ...extra })
    },
    /** Dispatch a keyup. A key pressed with h.key() and never released here
     *  stays HELD, which is exactly what the browser does and what the game
     *  reads every simulation step. */
    keyUp(key, extra = {}) {
      program.keyUp(screen, { key, code: codeFor(key), preventDefault() {}, ...extra })
    },
    /** Press and release, for a key that is a command rather than a control
     *  being held. Most of the radio's keys are this. */
    tapKey(key, extra = {}) {
      h.key(key, extra)
      h.keyUp(key, extra)
    },
    /** Move the fake clock forward, ticking frame() every `step` ms. */
    advance(ms, step = 16) {
      const end = now + ms
      while (now < end) {
        now = Math.min(end, now + step)
        runDueTimers()
        program.frame(screen, now / 1000)
        if (term.dirty) term.raster()
      }
    },
    /** Touch gestures, the way program.js reads them off touchstart/touchend. */
    touch(x0, y0, x1, y1, dt = 80) {
      const ev = (touches, changed) => ({ touches, changedTouches: changed, target: null, preventDefault() {} })
      program.onTouchStart(screen, ev([{ clientX: x0, clientY: y0 }], []))
      now += dt
      program.onTouchEnd(screen, ev([], [{ clientX: x1, clientY: y1 }]))
    },
    tap() { h.touch(100, 100, 100, 100) },
    /** dir > 0 swipes right (next station), < 0 left. */
    swipe(dir) { h.touch(100, 200, 100 + dir * 120, 200) },
    /** Like advance(), but with rAF starved: timers run, frame() never
     *  does -- a hidden, occluded or throttled tab. */
    idle(ms, step = 16) {
      const end = now + ms
      while (now < end) { now = Math.min(end, now + step); runDueTimers() }
    },
    /** Pending fake timers, for assertions. */
    timers() { return [...timers.values()] },
    /** Every capture call the program has made, in order -- see the tap
     *  stub above. Empty is the assertion that matters most. */
    tapCalls,
    /** Fullscreen API calls the program has made, in order. See the doc stub. */
    fsCalls,
    /** loadVideoById/cueVideoById/setVolume calls, in order (player boots only). */
    playerCalls,
    /** The fake player itself, for the two events a test cannot otherwise
     *  cause: h.player.endTrack() and h.player.fail(). Null without
     *  `player: true`. */
    get player() { return fake },
    /** Let pending promise callbacks land. The lyrics lookup is a real
     *  fetch chain, and advance() is synchronous, so nothing resolves
     *  during it -- await this after the load that fires the lookup.
     *  setImmediate rather than setTimeout on purpose: setTimeout is the
     *  fake clock in here and would never run. */
    flush() { return new Promise((r) => setImmediate(r)) },
    row(y) {
      let s = ''
      for (let x = 0; x < term.cols; x++) s += String.fromCodePoint(term.chars[y * term.cols + x])
      return s
    },
    rows() { return Array.from({ length: term.rows }, (_, y) => h.row(y)) },
    /** Index of the first row containing `text`, or -1. */
    find(text) { return h.rows().findIndex((r) => r.includes(text)) },
    /** Power on from STANDBY and wait out the boot readout. */
    powerOn() {
      h.advance(600) // the cold-open flourish gates [P] for its first 500ms
      h.key('p')
      h.advance(4000)
      if (!program.poweredOn) throw new Error('powerOn(): set did not come up')
    },
    shutdown() {
      timers.clear()
      delete globalThis.location
      delete globalThis.YT
      globalThis.SIGNAL_YT_READY = false
      Object.assign(globalThis, real)
      Date.now = realDateNow
      Object.defineProperty(globalThis, 'navigator', {
        value: realNavigator, configurable: true, writable: true,
      })
    },
  }
  return h
}
