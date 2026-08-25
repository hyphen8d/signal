// SIGNAL -- synthesized sound: the AudioContext, the hard-mute speaker bus,
// the static bed and tube hum, and every one-shot control sound. No sample
// files here; see audio/voice.js for those. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { pulseBloom } = await import(`../crt-hooks.js?v=${V}`)
const { NEAR_THRESHOLD } = await import(`../tuning.js?v=${V}`)

// --- WebAudio: tick + lock tone, no external files ----------------------

export let actx = null
export function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)()
  // Chrome/Safari can hand back a context that's still 'suspended' even
  // from inside a keydown handler -- the very first oscillator scheduled
  // on it is silent even though nothing throws and nothing looks wrong
  // (8/20: station id tone for static bloom reported inaudible --
  // it's usually the first station tried after a fresh page load, i.e.
  // the first sound the context ever plays). Nudging resume() on every
  // call is a no-op once running, so this just self-heals the first call
  // instead of only fixing it retroactively on the second one.
  if (actx.state === 'suspended') actx.resume().catch(() => {})
  return actx
}
// 50th pass -- mute needed to mute everything including static and
// other sounds, as if the speaker of the device was hard muted, without
// muting the ambient hum since that would break immersion. A single master
// speaker bus every ELECTRONIC sound routes through, so [M] can kill the
// whole speaker path in one place instead of 15 per-function mute checks.
// Deliberate bypasses, connected straight to ctx.destination as before:
//   startTubeHum()      -- the chassis itself, not the speaker (an
//                          explicit carve-out; consistent with the 42nd
//                          pass's "mute does not duck the hum" decision).
//   playRelayThunk()    -- the mute switch's own mechanical clunk. A real
//                          hard-mute switch still clunks, and without it
//                          un-muting would give no feedback at all.
//   playPowerOn/DownSound() -- the power switch mechanism, same logic.
// Everything else (static bed, seek hiss, idents, lock tone, key clicks,
// detents, boot ticks, band bump, panel sweep, mode thump, preset whoosh,
// static bursts) is speaker audio and dies with the speaker.
// Lazy like actx itself; speakerMuted is tracked module-level so a bus
// created AFTER a persisted muted state was restored still comes up muted.
export let speakerBusNode = null
export let speakerMuted = false
export function speakerOut(ctx) {
  if (!speakerBusNode) {
    speakerBusNode = ctx.createGain()
    speakerBusNode.gain.value = speakerMuted ? 0 : 1
    speakerBusNode.connect(ctx.destination)
  }
  return speakerBusNode
}
export function setSpeakerMuted(muted) {
  speakerMuted = muted
  if (!speakerBusNode || !actx) return
  try {
    const t = actx.currentTime
    // linearRamp, not exponential -- exponential can never actually reach
    // 0. Short enough to feel instant, long enough not to click.
    speakerBusNode.gain.cancelScheduledValues(t)
    speakerBusNode.gain.setValueAtTime(speakerBusNode.gain.value, t)
    speakerBusNode.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.015)
  } catch (e) {}
}
// Static burst for manual seeking (11th pass -- static was needed
// as you seek manually) -- replaces the old per-step playTick(),
// which was a short flat-noise click too subtle to read as static. This is
// longer and band-passed like the scanning static bed (startStaticNoise),
// just fired as a one-shot per arrow-key step instead of held continuously.
// 41st pass: `centreHz` -- see STATIONS[].static. The one-shot seek hiss
// takes its colour from whatever station is nearest, so a step toward ATOMIC
// sounds narrower and older than a step toward CIRCUIT CRUSH.
export function playSeekStatic(centreHz = 1400) {
  try {
    const ctx = audioCtx()
    const n = Math.floor(ctx.sampleRate * 0.09)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = centreHz
    filter.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start()
  } catch (e) {}
}
export function playLockTone() {
  try {
    const ctx = audioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(speakerOut(ctx))
    osc.start()
    osc.stop(ctx.currentTime + 0.26)
  } catch (e) {}
}

// Station ident (added 2026-08-20, 9th pass) -- a short per-station tone
// motif (see STATIONS[].ident) played on lock instead of the generic
// playLockTone(), so each station announces itself distinctly before
// you've even read the screen. Falls back to playLockTone() if a station
// somehow has no ident defined.
// 25th pass: added the `tempo` scalar (see STATIONS[].identTempo) so
// stations are distinct by rhythm/pacing as well as by pitch contour -- a
// slow ambient station and a punchy synthwave one shouldn't announce
// themselves at the same clip just because their note shapes differ.
// Scales the note gap and the whole attack/decay envelope together, so a
// slower tempo reads as more spacious rather than just "the same envelope
// with gaps stretched out."
// 38th pass: optional `s` (the screen) -- passing it in bumps the CRT's
// bloom on each note of the motif (see pulseBloom), so a lock is one
// audio-visual event instead of a tone playing while the picture sits
// still. Optional rather than required so nothing breaks if this is ever
// called from somewhere without a screen handle.
export function playIdent(freqs, tempo = 1, s = null) {
  if (!freqs || !freqs.length) { playLockTone(); return }
  try {
    const ctx = audioCtx()
    let t = ctx.currentTime
    freqs.forEach((f) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, t)
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02 * tempo)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16 * tempo)
      osc.connect(gain).connect(speakerOut(ctx))
      osc.start(t)
      osc.stop(t + 0.18 * tempo)
      // Queued on the program's effects queue rather than a setTimeout, so
      // a power-off between notes drops the remaining pulses with everything
      // else (2026-08-25 audit). Tagged 'ident', not 'bloom': pulseBloom()
      // cancels 'bloom' on every note, which would eat the notes behind it.
      if (s?.program) s.program.fxAfter('ident', Math.max(0, (t - ctx.currentTime) * 1000), () => pulseBloom(s, 0.5, 90 * tempo))
      t += 0.11 * tempo
    })
  } catch (e) {}
}

// Continuous static bed while scanning, in place of a bare tick per step --
// filtered noise, faded in/out rather than started/stopped hard.
export let staticSrc = null
export let staticGain = null
// 41st pass: the bed's bandpass is now a live handle, because its centre
// frequency tracks whichever station is nearest (STATIONS[].static) and
// ramps between them as you tune -- so crossing the band is a slow change in
// the COLOUR of the hiss, not just its volume.
export let staticFilter = null
export const STATIC_CENTRE_DEFAULT = 1200
// 21st pass (0.3 wishlist: static intensity scales with distance
// from a station) -- the noise bed used to sit at one fixed gain the whole
// time you were seeking/scanning, so tuning felt the same whether you were
// miles off frequency or about to land on a station. Now it fades between
// these two based on nearestStation's dist, mirroring the SIG meter's own
// falloff curve (NEAR_THRESHOLD), so the static visibly/audibly clears
// right before a lock, same as a real radio easing out of the noise floor.
export const STATIC_MAX_GAIN = 0.1
export const STATIC_MIN_GAIN = 0.02
export function staticGainForDist(dist) {
  const pct = dist == null ? 1 : Math.min(1, dist / NEAR_THRESHOLD)
  return STATIC_MIN_GAIN + (STATIC_MAX_GAIN - STATIC_MIN_GAIN) * pct
}
export function startStaticNoise(dist, centreHz = STATIC_CENTRE_DEFAULT) {
  if (staticSrc) return
  try {
    const ctx = audioCtx()
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = centreHz
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.15)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start()
    staticSrc = src
    staticGain = gain
    staticFilter = filter
  } catch (e) {}
}
export function setStaticIntensity(dist, centreHz) {
  if (!staticGain) return
  try {
    const ctx = audioCtx()
    staticGain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.08)
    // Slower ramp than the gain on purpose: loudness should track the dial
    // tightly (it is the "am I close" signal), while timbre drifting over a
    // few hundred ms reads as the receiver settling rather than as the hiss
    // jumping between presets.
    if (staticFilter && centreHz) {
      staticFilter.frequency.linearRampToValueAtTime(centreHz, ctx.currentTime + 0.35)
    }
  } catch (e) {}
}
export function stopStaticNoise() {
  if (!staticSrc) return
  const src = staticSrc, gain = staticGain
  staticSrc = null
  staticGain = null
  staticFilter = null
  try {
    const ctx = audioCtx()
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
    setTimeout(() => { try { src.stop() } catch (e) {} }, 200)
  } catch (e) {}
}

// Ambient tube hum (42nd pass -- parked at the 38th pass, built now for
// dev-environment testing) -- a continuous,
// very quiet noise floor while the set is powered on: a ~60Hz fundamental
// plus its second harmonic, with a touch of lowpassed noise underneath so it
// reads as a chassis rather than a test tone. Mirrors startStaticNoise()/
// stopStaticNoise()'s shape deliberately -- module-level handles, idempotent
// start, ramped in/out rather than started/stopped hard -- but is its own
// independent audio graph, not a mode of the static bed, since it needs to
// keep running underneath scanning/seeking/locked alike.
// Deliberately NOT gated on this.muted (2026-08-22): mute is the
// "make the broadcast stop" control, and the hum isn't part of the
// broadcast -- it's the set's own noise floor, on for as long as the set is
// on, same as a real tube amp still hums after you've turned the volume
// down. Only powerUp()/powerDown() start and stop it.
export let humNodes = null
// 2026-08-22: doubled from the original 0.012 starting guess, following
// dev-server QA. Note this now sits slightly ABOVE
// STATIC_MIN_GAIN (0.02) -- the original guess was deliberately kept below
// the static bed's own floor gain so the hum would never out-read it while
// seeking; at 0.024 the hum can now be marginally louder than a distant
// station's static. Worth another listen specifically while seeking far
// from any station, not just at idle/locked.
export const HUM_GAIN = 0.024
export function startTubeHum() {
  if (humNodes) return
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(HUM_GAIN, t + 0.8) // slow fade-in: the
    // transformer coming up, not a switch being flipped
    const oscs = [[60, 1], [120, 0.35]].map(([f, mul]) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(mul, t)
      osc.connect(g).connect(gain)
      osc.start(t)
      return osc
    })
    // A touch of lowpassed noise under the tones, or it reads as a test
    // tone rather than a chassis.
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.25, t)
    src.connect(lp).connect(ng).connect(gain)
    src.start(t)
    gain.connect(ctx.destination)
    humNodes = { gain, oscs, src }
  } catch (e) {}
}
export function stopTubeHum() {
  if (!humNodes) return
  const { gain, oscs, src } = humNodes
  humNodes = null
  try {
    const ctx = audioCtx()
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
    setTimeout(() => {
      try { oscs.forEach((o) => o.stop()); src.stop() } catch (e) {}
    }, 600)
  } catch (e) {}
}

// Keypress click (32nd pass -- a keypress sound to help sell the
// terminal vibe) -- fires once per key() call, before anything else, so
// it clicks even for a key that ends up doing nothing (a real keyboard
// clicks under your finger regardless of whether the machine is on or the
// key does anything). Deliberately its own function rather than reusing
// playClick() below: playClick is a much louder, longer relay clack meant
// to bookend the power sequence a couple of times a session, while this
// one can fire dozens of times in a row during a fast seek/scan burst --
// at that rate a full relay clack would read as chattering hardware
// rather than typing, so this is shorter, quieter, and brighter (a
// high-passed tick rather than a full-spectrum thump).
//
export function playKeyClick() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.006)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 2500
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, t)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}


// --- 38th pass: event-feedback sound effects ---------------------------
//
// Sounds were needed as the boot happens and each item
// appears, to cover the remaining gaps. SIGNAL already had ambient sound
// (the static bed) and set-piece sound (power on/off), but nearly every
// individual control -- volume, mute, display mode, guide, the band edge
// -- changed state in silence, and the boot POST readout landed all 13 of
// its lines without a sound. The rhythm of a machine reporting in is most
// of why a boot sequence feels good at all, so that was the single
// biggest gap of the set.
//
// All of these are deliberately quieter and shorter than the existing
// set-piece sounds (playClick/playPowerOnSound): those bookend a session
// a couple of times, these can fire in bursts while someone rides the
// volume keys.

/** One line of the boot POST readout landing. `kind` splits the dull
 *  relay tick of a probe line from the brighter confirm blip of an
 *  "[ OK ]" line; `progress` (0..1 through the sequence) creeps the pitch
 *  up so the readout reads as a set coming up to speed rather than 13
 *  identical beeps. */
export function playBootTick(kind, progress = 0) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const base = kind === 'ok' ? 760 : 380
    const rise = kind === 'ok' ? 180 : 90
    osc.type = kind === 'ok' ? 'triangle' : 'square'
    // Slight per-tick detune -- 13 mathematically identical pitches in a
    // row reads as a synthesizer, a few cents of wobble reads as hardware.
    osc.frequency.setValueAtTime(base + rise * progress + (Math.random() * 14 - 7), t)
    const peak = kind === 'ok' ? 0.07 : 0.045
    const len = kind === 'ok' ? 0.05 : 0.03
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len)
    osc.connect(gain).connect(speakerOut(ctx))
    osc.start(t)
    osc.stop(t + len + 0.01)
  } catch (e) {}
}

/** Volume detent -- one notch of a stepped pot. Deliberately duller and
 *  lower than playKeyClick(), which is already firing on the same
 *  keypress: the click is the key under your finger, this is the knob it
 *  is turning. */
export function playDetent() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.01)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.16, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}

/** Mute rocker -- a relay armature landing (low sine thud) with a
 *  lowpassed contact snap on top, so it reads mechanical rather than as a
 *  bass blip. Engaging sits slightly higher than releasing, the way a
 *  switch's two directions never sound quite identical. */
export function playRelayThunk(engaged) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(engaged ? 132 : 104, t)
    osc.frequency.exponentialRampToValueAtTime(engaged ? 72 : 58, t + 0.07)
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.2, t + 0.005)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(og).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
    const n = Math.floor(ctx.sampleRate * 0.02)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1600
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.13, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    src.connect(lp).connect(ng).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}

/** Display-mode change -- a soft transformer thump (fundamental plus its
 *  octave, both decaying fast). The picture changing colour is a supply
 *  event in this fiction, not a menu selection, so it gets a body sound
 *  rather than a beep. */
export function playModeThump() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const parts = [[70, 0.2], [141, 0.06]]
    for (const [f, peak] of parts) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(g).connect(speakerOut(ctx))
      osc.start(t)
      osc.stop(t + 0.18)
    }
  } catch (e) {}
}

/** Guide overlay sliding in/out -- one short pitch sweep, up on open and
 *  the same sweep reversed on close, so the two are obviously the same
 *  panel moving in two directions. */
export function playPanelSound(opening) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(opening ? 300 : 520, t)
    osc.frequency.exponentialRampToValueAtTime(opening ? 520 : 300, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(g).connect(speakerOut(ctx))
    osc.start(t)
    osc.stop(t + 0.13)
  } catch (e) {}
}

/** Band edge. NOTE (38th pass): the 21st pass deliberately made arrow
 *  seeking WRAP at FREQ_MIN/FREQ_MAX rather than stop dead -- arrow
 *  scrolling needed to be able to cycle to the other side of
 *  the tuning band since scan can do it -- so this is not the hard
 *  mechanical stop a real dial has -- it's the dull thud of the carriage
 *  reaching the end of its travel, fired on the wrap itself. Keeps the
 *  physical feedback without taking the wraparound back. */
export function playBandBump() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    osc.connect(g).connect(speakerOut(ctx))
    osc.start(t)
    osc.stop(t + 0.12)
    const n = Math.floor(ctx.sampleRate * 0.03)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.18, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(lp).connect(ng).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}

// Power down/up sweeps (12th pass -- a power on and
// power down sequence). Same tube-electronics logic as a real set: powering
// down is a fast collapse (voltage drops faster than it rises), powering up
// is a slower warm-up. A short relay "click" bookends each.
export function playClick(t0) {
  try {
    const ctx = audioCtx()
    const t = t0 ?? ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.012)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.35, t)
    src.connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}
export function playPowerOnSound() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    playClick(t)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(90, t + 0.03)
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.4)
    gain.gain.setValueAtTime(0.001, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.12)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + 0.03)
    osc.stop(t + 0.47)
  } catch (e) {}
}

// Preset "tune-in" whoosh (14th pass -- a fun tune-in whoosh when
// jumping straight to a preset (1-9), versus the plain lock tone). Plays
// once at the top of presetTune(), under the sweep -- a fast rising
// bandpass-noise sweep, distinct from both the flat seek-static hiss and
// the per-station ident tones that follow once the sweep lands and locks.
export function playPresetWhoosh() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.35)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.1
    filter.frequency.setValueAtTime(400, t)
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.32)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
    src.stop(t + 0.36)
  } catch (e) {}
}

// 54th pass -- small mechanical touches: a preset-button click,
// distinct from the generic key tap. playKeyClick() already fires for
// every mapped key including 1-9/0/[B] -- that is the abstract "a key was
// pressed" feedback. This is the physical preset button itself: lower and
// firmer, same relationship playDetent() has to playKeyClick() on the
// volume keys. Lives in presetTune() rather than the key() case blocks so
// it fires uniformly for every path that reuses the same sweep -- [B] back
// and mobile's stepStation() swipe included, same reasoning playPresetWhoosh()
// already uses.
export function playPresetClick() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.02)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 420
    filter.Q.value = 1.4
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}


// One-shot filtered-noise burst (13th pass, "fun startup/shutdown"). Same
// noise-generation approach as startStaticNoise() but deliberately NOT
// wired into the staticSrc/staticGain globals that the seek-static state
// machine owns -- this is a self-contained, self-cleaning burst for power
// beats, so it can't leave the persistent bed's own start/stop bookkeeping
// out of sync.
export function playStaticBurst(duration, peakGain, freq) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq ?? 1400
    filter.Q.value = 0.7
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peakGain ?? 0.14, t + duration * 0.3)
    gain.gain.linearRampToValueAtTime(0, t + duration)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
    src.stop(t + duration + 0.02)
  } catch (e) {}
}

