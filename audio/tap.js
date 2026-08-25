// SIGNAL -- the live audio tap: tab/mic capture, the AnalyserNode DSP, the
// AUDIO_BUS every meter and visualizer reads, and the synthetic/silent
// fallback signals. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { audioCtx } = await import(`./sfx.js?v=${V}`)

// --- live audio tap (2026-08-23) -----------------------------------------
//
// (David: the visualizers "aren't real. [They] are just animations that
// repeat. I want ... them to actually react to the music being played live
// for all of them.") Every meter-shaped thing in this app -- the VU trace,
// the EQ ribbon, the FLD readout, every full-screen visualizer -- has been
// synthetic since day one, because playback is a cross-origin YouTube
// iframe and WebAudio cannot see inside it. This section is the workaround:
// capture the audio OUTSIDE the iframe and analyse that.
//
// Capture ladder, tried on every power-on while nothing is live:
//   1. getDisplayMedia tab-audio capture -- the wired signal. Desktop
//      Chromium only (Firefox has ignored the audio constraint since 2019,
//      bugzilla 1541425; Safari's getDisplayMedia has no audio at all).
//      The user picks "This tab" + "Also share tab audio" in the picker.
//   2. getUserMedia microphone -- everyone else, including mobile: the mic
//      hears the music acoustically via the speakers. Real analysis, just
//      air-coupled. Mic permission persists per-origin, so later sessions
//      auto-start this tier with no prompt at all.
//   3. Nothing -- every meter/effect keeps its synthetic behavior, exactly
//      as before this section existed. Hard requirement: with no capture
//      the app must be visually indistinguishable from the pre-tap build,
//      and with capture-but-silence (mute, ads, headphones on the mic
//      tier) nothing may ever look broken -- see the noise gate below.
// Server-side audio extraction from YouTube was considered and rejected on
// the same ToS grounds as ad suppression (see the Guide's ads note).
//
// Privacy posture, stated once: analysis only. The stream connects to an
// AnalyserNode and NOTHING else -- never to the destination (no echo, no
// feedback), nothing is recorded, nothing leaves the page.

// navigator.userAgentData only exists in Chromium -- it IS the Chromium
// check, and covers Chrome/Edge/Brave/Arc/Opera alike. Tier 1 additionally
// requires getDisplayMedia to exist; MOBILE_LITE (program.mobile) excludes
// tier 1 regardless, since no mobile browser does tab audio.
export const IS_CHROMIUM_DESKTOP = !!(navigator.userAgentData && !navigator.userAgentData.mobile)

// Tunables, first-guess values in this file's own tradition -- expect to
// retune live against the dev server, same as everything else got tuned.
// Band edges: the 90 Hz floor deliberately dodges the tube hum's 60 Hz
// fundamental (startTubeHum); its 120 Hz harmonic lands in band 0 but is
// CONSTANT, so the adaptive floor below subtracts it to zero. The static
// bed (600-2400 Hz) intentionally shows up in mid/treble -- meters
// twitching to the static you can actually hear is fiction-positive -- but
// can never fire onsets (the onset band is bass-side only).
// 58th pass -- widened 6 bands to 9, for
// drawEqRibbonLeft()'s ribbon. The first three edges (90/180/400/900) are
// UNCHANGED from the original 6-band scheme on purpose: onsetHi below and
// the bass/mid/treble split in sampleAudioTap() both key off exact band
// indices, and keeping those first 3 bands' Hz ranges identical means
// onset detection, BPM, and VU/tri-band's bass-mid-treble all stay
// byte-identical to before this pass -- only the ribbon (and CIPHER's
// per-column band mapping) actually gained resolution. The remaining
// 900-10000 Hz span (previously 3 bands) is now 6 log-spaced sub-bands.
export const TAP_BAND_EDGES_HZ = [90, 180, 400, 900, 1350, 2000, 3000, 4500, 6750, 10000]
export const TAP_BANDS = TAP_BAND_EDGES_HZ.length - 1 // 9
export const TAP_FLOOR_RISE = 18       // bytes/s the noise floor creeps up
export const TAP_CEIL_TAU = 6          // s, rolling-max decay -- re-fills the range
                                // within ~6s when a quiet master follows a hot one
export const TAP_MIN_SPAN_TAB = 22     // bytes; the span floor is what stops
export const TAP_MIN_SPAN_MIC = 30     // near-silence being amplified into fake signal
export const TAP_GATE_SPAN = 12        // bytes of wideband span below which...
export const TAP_GATE_HOLD_S = 1.2     // ...for this long => gated (headphones case)
export const TAP_ONSET_REFRACTORY_MS = 220
export const TAP_ONSET_MIN_DELTA_TAB = 6
export const TAP_ONSET_MIN_DELTA_MIC = 9  // mic runs lower SNR through a room
export const TAP_PULSE_TAU = 0.12      // s, onset impulse decay

export let tapStream = null
export let tapSource = null
export let tapAnalyser = null
export let tapFreqData = null          // Uint8Array, preallocated at wire time
export let tapBandBins = null          // [ [loBin, hiBin] x9 ]
export let tapState = 'idle'           // 'idle' | 'pending' | 'live'
export let tapBlockedTab = false       // session-permanent tier-1 hard failure
export let tapBlockedMic = false       // session-permanent tier-2 hard failure
export let micPermState = 'unknown'    // 'granted' | 'denied' | 'prompt' | 'unknown'
export let micGestureRetry = false     // gesture-gating browser refused an out-of-
                                // gesture mic call -- retry on next key/touch
export let tapUI = null                // { program, s } for async status flashes
// Per-band AGC trackers (TAP_BANDS bands + wideband at [TAP_BANDS]) and
// onset state.
export const tapRaw = new Float32Array(TAP_BANDS)
export const tapFloor = new Float32Array(TAP_BANDS + 1)
export const tapCeil = new Float32Array(TAP_BANDS + 1)
export const tapSm = new Float32Array(TAP_BANDS)
export let tapQuietSince = 0
export let tapOnsetMean = 0
export let tapOnsetDev = 0
export let tapOnsetPrevE = 0
export let tapIOI = []
export let tapLastSampleMs = 0

// The signal bus -- one object, refilled in place once per rAF by
// sampleAudioTap(), zero per-frame allocation. `onset` is true for exactly
// one sampled frame; `pulse` is the 1->0 decay after it, for consumers on
// slower cadences that would miss the single frame.
export const AUDIO_BUS = {
  active: false,
  source: null,                 // 'tab' | 'mic' | null
  gated: false,                 // running but hearing nothing usable
  level: 0,
  bass: 0, mid: 0, treble: 0,
  bands9: new Float32Array(TAP_BANDS),
  onset: false,
  onsetAt: 0,
  pulse: 0,
  bpm: 0,                       // 0 while unknown, else 60..180
  bpmConf: 0,
  beatPhase: 0,
}
// THE check every consumer makes -- never AUDIO_BUS.active directly. The
// gate is what turns the headphones-on-mic case into an honest "capture
// running, nothing playing" instead of amplified room hiss.
export function audioSignalLive() { return AUDIO_BUS.active && !AUDIO_BUS.gated }

/** The ladder's entry point. Idempotent; called from powerUp() inside the
 *  power-on gesture (getDisplayMedia requires-and-consumes transient
 *  activation; getUserMedia does NOT on Chromium/Firefox, which is what
 *  makes chaining the mic tier inside the tab tier's .catch legal -- the
 *  only browsers that gesture-gate getUserMedia never run tier 1 at all,
 *  so their mic call happens synchronously in the gesture here). */
export function startAudioTap(program, s) {
  if (tapState !== 'idle') return
  if (!navigator.mediaDevices) return
  tapUI = { program, s }
  tapState = 'pending'
  if (!program.mobile && IS_CHROMIUM_DESKTOP &&
      navigator.mediaDevices.getDisplayMedia && !tapBlockedTab) startTabCapture(false)
  else startMicCapture()
}

export function startTabCapture(minimal) {
  try {
    const opts = minimal
      ? { video: true, audio: true }
      : {
          preferCurrentTab: true,          // picker fronts THIS tab (Chrome 103+)
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',     // user can re-point via Chrome's bar
          systemAudio: 'include',
          monitorTypeSurfaces: 'include',
          video: true,                     // audio alone throws TypeError in Chrome
          audio: {
            suppressLocalAudioPlayback: false,  // the tab keeps playing out loud
            // The browser's speech-call processing would fight music metering:
            // AEC subtracts the speaker signal (which IS the signal), NS eats
            // sustained music energy, AGC flattens the very loud/quiet contrast
            // onset detection measures.
            echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          },
        }
    if (!minimal && window.CaptureController) {
      try {
        opts.controller = new CaptureController()
        opts.controller.setFocusBehavior('no-focus-change')
      } catch (e) {}
    }
    navigator.mediaDevices.getDisplayMedia(opts).then((stream) => {
      // Video track dropped immediately -- established audio-only-tab-capture
      // pattern; the audio track and Chrome's sharing pill both survive it.
      stream.getVideoTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
      if (!stream.getAudioTracks().length) {
        // Picked a window, or unticked "Also share tab audio" -- no audio
        // exists on this surface, so treat as declined and fall to the mic.
        stream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
        startMicCapture()
        return
      }
      wireTapAnalyser(stream, 'tab')
      notifyTap('TAP: LINE')
    }).catch((err) => {
      // A TypeError on the full option set can mean an older Chromium that
      // rejects one of the newer display-surface options -- retry once bare
      // before writing the tier off for the session.
      if (!minimal && err && err.name === 'TypeError') { startTabCapture(true); return }
      if (err && err.name !== 'NotAllowedError') tapBlockedTab = true
      startMicCapture()
    })
  } catch (e) { tapBlockedTab = true; startMicCapture() }
}

export function startMicCapture() {
  try {
    if (tapBlockedMic || micPermState === 'denied' ||
        !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (micPermState === 'denied') tapBlockedMic = true
      tapState = 'idle'
      return
    }
    navigator.mediaDevices.getUserMedia({
      video: false,
      // Same three processing stages off as the tab tier, same reasons --
      // and doubly so here, where AEC's entire job is removing the speaker
      // audio the mic tier exists to measure. Mono suffices for metering.
      audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    }).then((stream) => {
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
        tapState = 'idle'
        return
      }
      wireTapAnalyser(stream, 'mic')
      notifyTap('TAP: MIC')
    }).catch((err) => {
      tapState = 'idle'
      const name = err && err.name
      if (name === 'NotAllowedError') {
        // Chromium persists a hard deny and auto-rejects instantly forever
        // after -- re-prompting is impossible, so stop trying this session.
        if (micPermState === 'denied') tapBlockedMic = true
      } else if (name === 'NotFoundError') {
        tapBlockedMic = true               // no mic hardware at all
      } else if (name === 'SecurityError' || name === 'InvalidStateError') {
        micGestureRetry = true             // gesture-gated browser; retry in one
      }
    })
  } catch (e) { tapState = 'idle' }
}

/** Async, prompts nothing -- called once from init(). Mic grants persist
 *  per-origin, so 'granted' here is what lets later sessions auto-start the
 *  mic tier silently, and 'denied' short-circuits a doomed call. */
export function queryMicPermission() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      micPermState = st.state
      st.onchange = () => { micPermState = st.state }
    }).catch(() => {})
  } catch (e) {}
}

/** Belt-and-braces for browsers that gesture-gate getUserMedia (Safari
 *  lineage): flushed from the two existing gesture entry points (key(),
 *  onTouchStart) -- the same pattern _pendingUnmute already uses. */
export function maybeRetryAudioTapInGesture(program, s) {
  if (!micGestureRetry || tapState !== 'idle') return
  micGestureRetry = false
  tapUI = { program, s }
  tapState = 'pending'
  startMicCapture()
}

export function wireTapAnalyser(stream, sourceName) {
  try {
    const ctx = audioCtx()
    tapStream = stream
    tapSource = ctx.createMediaStreamSource(stream)
    tapAnalyser = ctx.createAnalyser()
    tapAnalyser.fftSize = 2048             // 23.4 Hz/bin @48k -- enough bass
                                           // resolution at half the cost of 4096
    // Well below the 0.8 default: the meters' own springs (stationBallistics)
    // are the ballistics layer; heavy analyser smoothing would smear the
    // transients onset detection needs. This only knocks the FFT shimmer off.
    tapAnalyser.smoothingTimeConstant = 0.5
    // The default -100/-30 window wastes half the byte range on inaudible
    // floor and clips hot masters; AGC below makes exact values non-critical.
    tapAnalyser.minDecibels = -85
    tapAnalyser.maxDecibels = -12
    tapSource.connect(tapAnalyser)         // and NOTHING else -- analysis only
    tapFreqData = new Uint8Array(tapAnalyser.frequencyBinCount)
    // Bin ranges from the REAL sample rate -- the context may be 44.1k or 48k.
    const binHz = ctx.sampleRate / tapAnalyser.fftSize
    tapBandBins = []
    for (let i = 0; i < TAP_BANDS; i++) {
      const lo = Math.max(1, Math.round(TAP_BAND_EDGES_HZ[i] / binHz))
      const hi = Math.min(tapAnalyser.frequencyBinCount - 1,
        Math.max(lo, Math.round(TAP_BAND_EDGES_HZ[i + 1] / binHz) - 1))
      tapBandBins.push([lo, hi])
    }
    tapFloor.fill(255)
    tapCeil.fill(0)
    tapSm.fill(0)
    tapQuietSince = 0
    tapOnsetMean = 0; tapOnsetDev = 0; tapOnsetPrevE = 0
    tapIOI = []
    tapLastSampleMs = 0
    AUDIO_BUS.active = true
    AUDIO_BUS.source = sourceName
    // Born gated: nothing measured yet, and if this is a headphones-on-mic
    // session the gate simply never lifts -- first real energy ungates
    // instantly (see sampleAudioTap).
    AUDIO_BUS.gated = true
    tapState = 'live'
    const at = stream.getAudioTracks()[0]
    if (at) at.onended = () => onTapEnded(sourceName)
  } catch (e) { stopAudioTap('wire-failed') }
}

export function stopAudioTap(reason) {
  try { if (tapStream) tapStream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} }) } catch (e) {}
  try { if (tapSource) tapSource.disconnect() } catch (e) {}
  tapStream = null; tapSource = null; tapAnalyser = null
  tapFreqData = null; tapBandBins = null
  tapState = 'idle'
  AUDIO_BUS.active = false
  AUDIO_BUS.source = null
  AUDIO_BUS.gated = false
  AUDIO_BUS.level = 0; AUDIO_BUS.bass = 0; AUDIO_BUS.mid = 0; AUDIO_BUS.treble = 0
  AUDIO_BUS.bands9.fill(0)
  AUDIO_BUS.onset = false; AUDIO_BUS.pulse = 0
  AUDIO_BUS.bpm = 0; AUDIO_BUS.bpmConf = 0; AUDIO_BUS.beatPhase = 0
}

/** Mid-session loss: Chrome's "Stop sharing" bar, a revoked mic, a device
 *  unplug. Falls to the mic ONLY when that needs no prompt (already
 *  granted) -- prompting outside a gesture is exactly what we never do.
 *  Otherwise idle until the next power-on re-runs the ladder. */
export function onTapEnded(sourceName) {
  stopAudioTap('ended')
  notifyTap('TAP LOST')
  if (sourceName === 'tab') {
    if (micPermState === 'granted' && !tapBlockedMic) { tapState = 'pending'; startMicCapture() }
  } else {
    // One silent retry after 1s covers a default-device switch.
    setTimeout(() => {
      if (tapState === 'idle' && micPermState === 'granted' && !tapBlockedMic) {
        tapState = 'pending'
        startMicCapture()
      }
    }, 1000)
  }
}

/** Status-row acknowledgment for async tier changes. Silent during the boot
 *  animation (the boot POST line covers that window -- see powerUp), the
 *  guide, and the visualizer (which has its own footer and repaints the
 *  status row's grid anyway). */
export function notifyTap(text) {
  const u = tapUI
  if (!u || !u.program) return
  const p = u.program
  if (!p.poweredOn || p._powerAnimating || p.guideOpen || p.visualizerActive) return
  try { p.flashStatus(u.s, text) } catch (e) {}
}

/** Boot POST readout for the current tap state -- substituted over the
 *  static 'AUDIO PATH READY' line at land time (see powerUp). The fallback
 *  IS that line: a declined/unsupported tap stays silent by design. */
export function audioTapBootLine() {
  if (tapState === 'live') {
    return AUDIO_BUS.source === 'tab' ? '[ OK ] AUDIO TAP: LINE' : '[ OK ] AUDIO TAP: MIC'
  }
  return '[ OK ] AUDIO PATH READY'
}

/** Per-frame DSP: one getByteFrequencyData + one pass over ~430 bins, no
 *  allocation. Called from the top of frame(); when the tab is backgrounded
 *  rAF stops, so sampling stops with it -- the >1.5s-gap reset below is the
 *  only resume handling needed (AGC floors stay, they're still valid). */
export function sampleAudioTap() {
  if (tapState !== 'live' || !tapAnalyser || !tapBandBins) return
  try {
    const now = performance.now()
    const gapS = tapLastSampleMs ? (now - tapLastSampleMs) / 1000 : 1 / 60
    tapLastSampleMs = now
    const dt = Math.min(0.1, Math.max(0.001, gapS))
    if (gapS > 1.5) {
      tapOnsetMean = 0; tapOnsetDev = 0; tapOnsetPrevE = 0
      tapIOI = []
      AUDIO_BUS.pulse = 0
    }
    AUDIO_BUS.onset = false
    tapAnalyser.getByteFrequencyData(tapFreqData)

    const mic = AUDIO_BUS.source === 'mic'
    const minSpan = mic ? TAP_MIN_SPAN_MIC : TAP_MIN_SPAN_TAB
    let wideRaw = 0
    for (let i = 0; i < TAP_BANDS; i++) {
      const lo = tapBandBins[i][0], hi = tapBandBins[i][1]
      let sum = 0
      for (let b = lo; b <= hi; b++) sum += tapFreqData[b]
      const raw = sum / (hi - lo + 1)
      tapRaw[i] = raw
      wideRaw += raw
      // Adaptive floor: instant-down, slow creep-up. This single mechanism
      // erases the constant 120 Hz hum harmonic, the mic's room tone, AND is
      // what makes mute flatten naturally -- the moment the player + speaker
      // bus go silent, raw collapses, the floor follows, and normalized
      // output hits 0 with the meters' own springs riding it down.
      tapFloor[i] = Math.min(raw, tapFloor[i] + TAP_FLOOR_RISE * dt)
      // Rolling ceiling: instant-up, ~6s decay toward the floor -- a quiet
      // 1950s master re-fills the meter range moments after a hot synthwave
      // one. Never allowed within MIN_SPAN of the floor (anti-noise-zoom).
      const rest = tapFloor[i] + minSpan
      tapCeil[i] = Math.max(raw, rest,
        tapCeil[i] - (tapCeil[i] - rest) * (1 - Math.exp(-dt / TAP_CEIL_TAU)))
      const norm = Math.max(0, Math.min(1,
        (raw - tapFloor[i]) / Math.max(tapCeil[i] - tapFloor[i], minSpan)))
      // Asymmetric attack/decay on top (fast up, slow down), dt-corrected:
      // the meters read this bus on a 0.12s cadence and would otherwise
      // alias single-frame spikes.
      const a = norm > tapSm[i] ? 0.5 : 0.15
      tapSm[i] += (norm - tapSm[i]) * (1 - Math.pow(1 - a, dt * 60))
    }
    wideRaw /= TAP_BANDS
    tapFloor[TAP_BANDS] = Math.min(wideRaw, tapFloor[TAP_BANDS] + TAP_FLOOR_RISE * dt)
    const wideSpan = wideRaw - tapFloor[TAP_BANDS]

    // Noise gate -- the headphones case. Engages after sustained silence,
    // lifts instantly on real energy.
    if (wideSpan > TAP_GATE_SPAN + 6) {
      AUDIO_BUS.gated = false
      tapQuietSince = 0
    } else if (wideSpan < TAP_GATE_SPAN) {
      if (!tapQuietSince) tapQuietSince = now
      if (now - tapQuietSince > TAP_GATE_HOLD_S * 1000) AUDIO_BUS.gated = true
    } else {
      tapQuietSince = 0
    }
    if (AUDIO_BUS.gated) {
      AUDIO_BUS.level = 0; AUDIO_BUS.bass = 0; AUDIO_BUS.mid = 0; AUDIO_BUS.treble = 0
      AUDIO_BUS.bands9.fill(0)
      AUDIO_BUS.pulse = 0
      tapSm.fill(0)
      return
    }

    for (let i = 0; i < TAP_BANDS; i++) AUDIO_BUS.bands9[i] = tapSm[i]
    // bass/mid/treble Hz ranges are UNCHANGED from the 6-band scheme (see
    // the TAP_BAND_EDGES_HZ comment) -- bands 0-1 are still exactly 90-400
    // Hz, just now averaged as 2 of 9 instead of 2 of 6. Bands 2-4 cover
    // 400-2000 Hz (mid), bands 5-8 cover 2000-10000 Hz (treble) -- same
    // conceptual ranges as before, finer sampling within each.
    const bass = (tapSm[0] + tapSm[1]) / 2
    const mid = (tapSm[2] + tapSm[3] + tapSm[4]) / 3
    const treble = (tapSm[5] + tapSm[6] + tapSm[7] + tapSm[8]) / 4
    AUDIO_BUS.bass = bass
    AUDIO_BUS.mid = mid
    AUDIO_BUS.treble = treble
    AUDIO_BUS.level = Math.min(1, 0.45 * bass + 0.4 * mid + 0.15 * treble)

    // Onset: bass-band energy flux against an adaptive threshold, measured
    // floor-subtracted but PRE-ceiling/PRE-smoothing -- normalization must
    // not damp the very transients being detected. The mic band widens one
    // band (laptop speakers roll off hard below ~200 Hz, so small-speaker
    // kick/snare body lives higher).
    const onsetHi = mic ? 2 : 1
    let e = 0
    for (let i = 0; i <= onsetHi; i++) e += Math.max(0, tapRaw[i] - tapFloor[i])
    e /= onsetHi + 1
    const minDelta = mic ? TAP_ONSET_MIN_DELTA_MIC : TAP_ONSET_MIN_DELTA_TAB
    const thresh = tapOnsetMean + Math.max(minDelta, 2.0 * tapOnsetDev)
    if (e > thresh && e > tapOnsetPrevE &&
        now - AUDIO_BUS.onsetAt > TAP_ONSET_REFRACTORY_MS) {
      const ioi = (now - AUDIO_BUS.onsetAt) / 1000
      AUDIO_BUS.onset = true
      AUDIO_BUS.onsetAt = now
      AUDIO_BUS.pulse = 1
      // Rolling BPM: median of the last 8 plausible inter-onset intervals,
      // octave-folded into 60..180. Confidence = agreement within +/-12%.
      if (ioi >= 0.28 && ioi <= 1.5) {
        tapIOI.push(ioi)
        if (tapIOI.length > 8) tapIOI.shift()
        if (tapIOI.length >= 4) {
          const sorted = tapIOI.slice().sort((x, y) => x - y)
          const med = sorted[Math.floor(sorted.length / 2)]
          let bpm = 60 / med
          while (bpm < 60) bpm *= 2
          while (bpm > 180) bpm /= 2
          AUDIO_BUS.bpm = bpm
          AUDIO_BUS.bpmConf =
            tapIOI.filter((v) => Math.abs(v - med) / med < 0.12).length / tapIOI.length
        }
      }
      // Soft-resync the beat clock on confident tempo, hard-reset otherwise.
      if (AUDIO_BUS.bpm) {
        AUDIO_BUS.beatPhase = AUDIO_BUS.bpmConf >= 0.5 ? AUDIO_BUS.beatPhase * 0.25 : 0
      }
    }
    tapOnsetDev += (Math.abs(e - tapOnsetMean) - tapOnsetDev) * (1 - Math.exp(-dt / 0.5))
    tapOnsetMean += (e - tapOnsetMean) * (1 - Math.exp(-dt / 0.25))
    tapOnsetPrevE = e
    AUDIO_BUS.pulse *= Math.exp(-dt / TAP_PULSE_TAU)
    if (AUDIO_BUS.pulse < 0.001) AUDIO_BUS.pulse = 0
    if (AUDIO_BUS.bpm) AUDIO_BUS.beatPhase = (AUDIO_BUS.beatPhase + dt * AUDIO_BUS.bpm / 60) % 1
  } catch (e) {}
}


/** 2026-08-23 (live audio tap) -- audio-or-neutral multiplier, THE idiom
 *  every effect's continuous modulation uses. With no vetted tap frame
 *  (A === null) this returns exactly 1, so every multiplication it feeds
 *  is a no-op and the no-audio build renders byte-identical to today.
 *  With a frame, maps a 0..1 band value onto lo..hi -- ranges are always
 *  chosen so v = 0.5 lands on 1.0: today's look is the CENTER of the
 *  modulation range, silence is a calm floor (lo >= 0.5, so nothing ever
 *  scales to frozen/black), peaks overshoot. Discrete events use plain
 *  `if (A && ...)` gates instead, which vanish the same way. */
export function auMul(A, v, lo, hi) {
  return A ? lo + (hi - lo) * Math.min(1, Math.max(0, v)) : 1
}

// 62nd pass -- fallback signal for stations whose effect gates hard on A's
// presence (FLAME, FROST, BREACH, BUBBLE TUBES all used to render a
// separate "dead air" picture -- an ember bed, an unlit grid, a static hex
// field, an idle-floor tube bank -- when there was no tap). Live QA
// flagged a real gap between a declined/unsupported tap and a working
// one, and confirmed a seamless fallback was the right fix over rigid
// rules. Those stations' own idle states read as
// broken rather than atmospheric when a real tap just isn't available,
// which is a real, non-rare case (declined permission, unsupported
// browser, headphones-only capture never granted), not an edge case worth
// a worse picture over.
//
// syntheticAudio(t) fabricates a same-shaped signal purely from time --
// independent-phase sine layers per field (so bands drift out of sync with
// each other rather than breathing in lockstep) plus a small per-frame
// chance of a fake onset and a short decaying pulse envelope after one
// fires. It is NOT trying to imitate a real track's rhythm or dynamics --
// just enough motion that every effect's EXISTING reactive code (already
// tuned against real A.bass/A.mid/A.treble/A.bands9/A.onset/A.pulse) has
// something plausible to read, instead of each effect needing its own
// hand-authored idle animation. Call sites do `this._au || syntheticAudio(t)`
// so a real tap frame always wins the instant one arrives.
export function syntheticAudio(t) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v))
  const level = 0.35 + 0.15 * Math.sin(t * 0.17) + 0.1 * Math.sin(t * 0.41 + 1.3)
  const bass = 0.32 + 0.24 * Math.sin(t * 0.23 + 0.5) + 0.1 * Math.sin(t * 0.07)
  const mid = 0.32 + 0.2 * Math.sin(t * 0.31 + 2.1)
  const treble = 0.32 + 0.2 * Math.sin(t * 0.53 + 4.2)
  const bands9 = Array.from({ length: 9 }, (_, i) =>
    clamp01(0.32 + 0.24 * Math.sin(t * (0.15 + i * 0.07) + i * 1.7)))
  const pulsePhase = (t % 0.9) / 0.9
  return {
    level: clamp01(level), bass: clamp01(bass), mid: clamp01(mid), treble: clamp01(treble),
    bands9,
    onset: Math.random() < 0.012,
    pulse: clamp01(Math.exp(-pulsePhase * 5)),
  }
}

// 64th pass -- true silence for the four syntheticAudio(t) fallback effects
// (FROST, BUBBLE TUBES, FLAME, BREACH) while muted. Muting used to leave
// these dancing to the fake signal exactly as if a track were still
// playing -- the tab-capture tap genuinely goes quiet on mute, which used
// to trip the "no real signal" gate and hand off to syntheticAudio(t),
// so the effect kept moving on fake data with no sound behind it at all.
// A same-shaped all-zero object (not null -- these call sites dereference
// A.treble/A.bands9 etc directly, which would throw on null) settles each
// effect at its own real-audio "quiet passage" floor via auMul's lo bound,
// the same calm-idle look already shipped for an actual silent moment in a
// real track, rather than adding a separate dead-state branch per effect.
export const SILENT_AUDIO = {
  level: 0, bass: 0, mid: 0, treble: 0,
  bands9: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  onset: false,
  pulse: 0,
}

