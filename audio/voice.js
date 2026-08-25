// SIGNAL -- voice assets: the network sign-on line, per-station verbal IDs,
// liner drops (all through one "through the radio" processing chain), and
// the synced-lyrics lookup. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { audioCtx, speakerOut } = await import(`./sfx.js?v=${V}`)

// 53rd pass -- network sign-on ID: verbal station IDs, an ElevenLabs-rendered
// line ("Rachel M -- Pro British Radio
// Presenter"): "you're now listening to the SIGNAL radio network". This is
// the engine's first real audio ASSET -- everything else above is
// synthesized procedurally; this one loads audio/network-id.mp3 and runs it
// through a WebAudio chain live at playback time (band-limit, mid-forward
// EQ, a grit shaper, a slow pitch wobble, a hiss bed under it) rather than
// baking any processing into the file, same "everything's live and
// tunable" philosophy as crt.params. Piloted first as an offline ffmpeg
// render to preview the direction before this got built; both
// pilot takes ("dry" and "with hiss bed") came back approved, so this is
// that same shape ported to real nodes.
//
// Plays once per power-on, fired from the REVEAL_DELAY beat in powerUp() --
// the network signing the set on right as the picture lands, same moment
// the locked station's own audio comes up, before it takes over. Routed
// through speakerOut() like every other speaker sound, so [M]'s hard-mute
// silences it same as everything but the tube hum/relay clunk.
// 55th pass -- welcome line. Briefly rotated between three ElevenLabs takes
// (network-id.mp3 plus two more recorded); the shortest main intro was
// preferred over rotating between different ones -- so this is back to a
// single fixed line, just pointed at the shortest of the three
// (welcome-tuned-in.mp3, ~1.9s vs ~3.1-3.4s for the other two) rather than
// the original network-id.mp3. Same lazy/cached fetch pattern as the rest
// of this file.
export const WELCOME_LINE_FILE = 'audio/welcome-tuned-in.mp3'
export let welcomeLineBufferPromise = null
export function loadWelcomeLineBuffer() {
  if (!welcomeLineBufferPromise) {
    welcomeLineBufferPromise = fetch(WELCOME_LINE_FILE)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null)
  }
  return welcomeLineBufferPromise
}
// Soft-saturation curve for WaveShaperNode (MDN's standard "distortion
// curve" shape), tuned low here for grit/grain rather than real overdrive --
// standing in for true bit-reduction, which would need an AudioWorklet.
export function gritCurve(amount = 18) {
  const n = 44100
  const curve = new Float32Array(n)
  const deg = Math.PI / 180
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}
// 55th pass -- pulled out of playNetworkId so station IDs can share the
// exact same "through the radio" chain (highpass/lowpass/peaking EQ, grit
// waveshaper, wow/flutter delay, hiss bed) instead of duplicating it.
// Lowered by another 15% -- on top of the earlier halving
// (1.6 -> 0.8 / 0.0125 hiss), so the peaks below are 0.8 * 0.85 and
// 0.0125 * 0.85, i.e. ~0.32x and ~0.11x the original ElevenLabs level.
export const VOICE_CLIP_PEAK_GAIN = 0.8 * 0.85 // ~0.68
export const VOICE_CLIP_HISS_GAIN = 0.0125 * 0.85 // ~0.0106
// `gainMult` (56th pass -- liner drops needed their volume lowered a
// little) scales both the voice and hiss-bed peaks together, on top of the
// defaults above -- an optional per-call trim so one clip type (liner
// drops) can sit quieter than station IDs/the welcome line without
// touching their own tuned levels.
export function playProcessedVoiceClip(buffer, ctx, t, gainMult = 1) {
  const dur = buffer.duration
  const peakGain = VOICE_CLIP_PEAK_GAIN * gainMult
  const hissGain = VOICE_CLIP_HISS_GAIN * gainMult

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 280
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3400
  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1800
  mid.Q.value = 1.2
  mid.gain.value = 5

  const shaper = ctx.createWaveShaper()
  shaper.curve = gritCurve(18)
  shaper.oversample = '2x'

  // Slow pitch wobble (wow/flutter) -- an LFO driving delayTime around a
  // small base offset reads as pitch drift, not an echo, as long as the
  // depth stays well under ~5ms.
  const delay = ctx.createDelay(0.05)
  delay.delayTime.value = 0.006
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 1.1
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.0015
  lfo.connect(lfoDepth).connect(delay.delayTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.08)
  // Too sharply cut off -- widened from 0.25s to 0.4s. Root
  // cause was actually the source asset's OWN fade overlapping the tail
  // end of real speech (fixed by re-trimming from ElevenLabs' silence
  // gap, not by touching this), but this window was compounding it, so
  // it gets more room too rather than fighting the source clip's taper.
  // Station-ID clips also now carry ~0.2s of padded trailing silence
  // (see audio/ prep) so this fade always lands after real speech ends.
  gain.gain.setValueAtTime(peakGain, t + Math.max(0, dur - 0.4))
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(hp).connect(lp).connect(mid).connect(shaper).connect(delay)
  delay.connect(gain).connect(speakerOut(ctx))

  // Faint hiss bed under just this clip -- the persistent static bed only
  // runs while tuning/unlocked, so without this the clip would land in
  // total silence instead of sitting in the set's own noise floor. Same
  // one-shot noise-buffer technique as playStaticBurst.
  const n = Math.floor(ctx.sampleRate * dur)
  const noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const noiseSrc = ctx.createBufferSource()
  noiseSrc.buffer = noiseBuf
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 2200
  noiseFilter.Q.value = 0.4
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, t)
  noiseGain.gain.linearRampToValueAtTime(hissGain, t + 0.2)
  noiseGain.gain.setValueAtTime(hissGain, t + Math.max(0, dur - 0.3))
  noiseGain.gain.linearRampToValueAtTime(0, t + dur)
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(speakerOut(ctx))

  lfo.start(t)
  src.start(t)
  noiseSrc.start(t)
  const stopAt = t + dur + 0.05
  src.stop(stopAt)
  noiseSrc.stop(stopAt)
  lfo.stop(stopAt)
}
// Kicked off early (see init()) so the fetch/decode is almost always done
// well before REVEAL_DELAY's ~5.5s mark on a fresh boot; if it isn't, this
// just waits for it -- audioCtx() was already resumed synchronously inside
// this same powerUp() call (playPowerOnSound() fires at its very top), so a
// sound scheduled from this promise's callback several seconds later is no
// different from startTubeHum() firing off the same REVEAL_DELAY beat.
export function playNetworkId(program) {
  if (program.muted) return
  loadWelcomeLineBuffer().then((buffer) => {
    // Re-check state on the far side of the async gap (gotcha: anything
    // that draws/plays outside a synchronous call needs its own guards) --
    // a fast power-off or a mute toggle in the ~5.5s window shouldn't play
    // this out from under a screen that's already gone dark or muted.
    if (!buffer || !program.poweredOn || program.muted) return
    try {
      const ctx = audioCtx()
      playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
    } catch (e) {}
  })
}

// 55th pass -- per-station verbal IDs, recorded and dropped into
// audio/ as station-id-<id>.mp3 (one per public station; the secret NIN
// station deliberately has none). Same lazy/cached fetch as the network ID,
// keyed per station so switching stations doesn't refetch.
export const stationIdBufferPromises = {}
export function loadStationIdBuffer(stationId) {
  if (!stationIdBufferPromises[stationId]) {
    stationIdBufferPromises[stationId] = fetch(`audio/station-id-${stationId}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null) // no clip for this station (e.g. the secret one) -- silently skip
  }
  return stationIdBufferPromises[stationId]
}
// Fired from tryLock() on first lock or any preset-driven lock -- see the
// call site there for the "first lock or preset change" logic itself.
export function playStationId(program, station) {
  if (program.muted || !station) return
  loadStationIdBuffer(station.id).then((buffer) => {
    if (!buffer || !program.poweredOn || program.muted) return
    if (program.lockedStation !== station) return // re-tuned away during the async gap
    try {
      const ctx = audioCtx()
      playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
    } catch (e) {}
  })
}

// 2026-08-24 -- synced lyrics for the visualizer's [L] display. Lookup is
// against LRCLIB (https://lrclib.net, keyless, CORS-open -- verified
// directly rather than assumed), fired from loadTrack() on every track
// change and cached by youtubeId so a resume/reload of the same track
// (loadTrack's own midSong resume paths) never refetches. Deliberately
// binary: only a result with time-tagged `syncedLyrics` counts as
// 'available' -- a plain-text-only match or no match at all both render
// as 'unavailable', since a static wall of text can't do the one thing
// this feature is for (following the line that's playing right now). Plain
// object rather than the Promise-map loadStationIdBuffer() uses just
// above: the footer needs a synchronous "what's the state right now" read
// every draw, not a one-shot .then() at play time.
export const lyricsCache = {} // youtubeId -> { state: 'pending'|'available'|'unavailable', lines? }
export function parseLRC(lrcText) {
  const lines = []
  const re = /^\[(\d{2}):(\d{2}(?:\.\d{1,2})?)\](.*)$/
  for (const raw of lrcText.split('\n')) {
    const m = re.exec(raw.trim())
    if (!m) continue
    const words = m[3].trim()
    if (!words) continue // skip blank/instrumental-gap lines -- nothing to show
    lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text: words })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}
export function ensureLyricsFetched(track) {
  if (!track || !track.youtubeId || lyricsCache[track.youtubeId]) return
  lyricsCache[track.youtubeId] = { state: 'pending' }
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist })
  fetch(`https://lrclib.net/api/get?${params}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      lyricsCache[track.youtubeId] = (data && data.syncedLyrics)
        ? { state: 'available', lines: parseLRC(data.syncedLyrics) }
        : { state: 'unavailable' }
    })
    .catch(() => { lyricsCache[track.youtubeId] = { state: 'unavailable' } })
}
export function lyricsStateFor(track) {
  if (!track || !track.youtubeId) return 'unavailable'
  const entry = lyricsCache[track.youtubeId]
  return entry ? entry.state : 'unavailable'
}

// 56th pass -- liner drops (one in 4 chance approved; tested with cipher
// first). Real liners fire between songs, not mid-song, so this hooks skip()
// -- the single funnel for "new track, same station" (a natural track-end
// via ENDED, the dead-video onError auto-skip, the skip key, and the mobile
// swipe all route through it) -- rather than a standalone timer that would
// need its own start/stop bookkeeping across every mute/station-change/
// power-off transition. The very first track after a lock goes through
// tryLock()/loadTrack() directly, never skip(), so a liner drop never
// competes with that lock's own station ID.
//
// Per-station pool of liner clips, `audio/liner-<id>-<n>.mp3` naming -- an
// empty/missing entry just means that station never rolls one. All 9
// public stations now have their pilot clip; NIN deliberately has none
// (see maybePlayLinerDrop's comment -- it gets a different, one-time
// "discovery" treatment instead, not yet built).
export const LINER_DROP_CHANCE = 0.25
// 57th pass -- general-purpose one-liners (3 one-liners plus a
// thank-you clip general enough to double as a 4th), not written for any
// one station's genre. Folded into every station's pool below rather than
// given a separate trigger, so they ride the same 1-in-4 roll and
// repeat-avoidance logic in maybePlayLinerDrop as the per-station pilots
// instead of duplicating that machinery.
export const GENERAL_LINER_FILES = [
  'audio/oneliner01.mp3',
  'audio/oneliner2.mp3',
  'audio/oneliner3.mp3',
  'audio/thanks01.mp3',
]
export const STATION_LINER_FILES = {
  cipher: ['audio/liner-cipher-01.mp3'],
  'distortion-field': ['audio/liner-distortion-field-01.mp3'],
  'cold-wave': ['audio/liner-cold-wave-01.mp3'],
  'drift-mode': ['audio/liner-drift-mode-01.mp3'],
  'circuit-crush': ['audio/liner-circuit-crush-01.mp3'],
  atomic: ['audio/liner-atomic-01.mp3'],
  // 60th pass -- MOMENTUM retired (see the retirement comment above
  // MIDNIGHT NEON in STATIONS). Its liner clip (audio/liner-momentum-01.mp3,
  // voiced as "MOMENTUM") is left on disk but dropped from this map rather
  // than remapped to 'midnight-neon' -- the clip's own spoken content would
  // be wrong for the new callsign. maybePlayLinerDrop() already no-ops
  // cleanly for any station with no entry here (same path secret stations
  // take), so MIDNIGHT NEON simply has no liner drop until a real one is
  // recorded for it. Its station ID clip is real, though -- see
  // audio/station-id-midnight-neon.mp3 and loadStationIdBuffer().
  'city-lights': ['audio/liner-city-lights-01.mp3'],
  hackback: ['audio/liner-hackback-01.mp3'],
}
export const LINER_FILES = {}
for (const stId in STATION_LINER_FILES) {
  LINER_FILES[stId] = [...STATION_LINER_FILES[stId], ...GENERAL_LINER_FILES]
}
export const linerBufferPromises = {}
export function loadLinerBuffer(path) {
  if (!linerBufferPromises[path]) {
    linerBufferPromises[path] = fetch(path)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null)
  }
  return linerBufferPromises[path]
}
// Fires a couple seconds after the new track's audio actually starts --
// loadTrack() cues/loads asynchronously (buffering, then YouTube's own
// autoplay), so there's no single synchronous moment "the track is now
// audible." This fixed delay is a stand-in for that rather than wiring up
// the player's PLAYING state, matching how every other beat in this file
// (REVEAL_DELAY, the power-down sequence) is a plain scheduled offset, not
// an event-driven one.
export const LINER_DROP_DELAY_MS = 2500
// Liner volume lowered a little -- liners sit under an already-
// playing track rather than a clear boot/lock moment, so they get their
// own trim on top of the shared voice-clip defaults instead of raising
// those defaults for station IDs/the welcome line too.
export const LINER_DROP_GAIN_MULT = 0.75
export function maybePlayLinerDrop(program, station, track) {
  const files = LINER_FILES[station.id]
  if (!files || !files.length || program.muted) return
  if (Math.random() >= LINER_DROP_CHANCE) return
  // Avoid repeating the same clip twice in a row once a station has more
  // than one -- irrelevant with CIPHER's single pilot clip today.
  const pool = files.length > 1 && program._lastLiner
    ? files.filter((f) => f !== program._lastLiner)
    : files
  const path = pool[Math.floor(Math.random() * pool.length)]
  setTimeout(() => {
    // Re-check on the far side of the delay (same gotcha as every other
    // async-scheduled sound here) -- a station change, track skip, mute, or
    // power-off in this window shouldn't drop a liner over whatever the set
    // is actually doing by the time it lands.
    if (program.muted || !program.poweredOn) return
    if (program.lockedStation !== station || program.currentTrack !== track) return
    loadLinerBuffer(path).then((buffer) => {
      if (!buffer || program.muted || !program.poweredOn) return
      if (program.lockedStation !== station || program.currentTrack !== track) return
      program._lastLiner = path
      try {
        const ctx = audioCtx()
        playProcessedVoiceClip(buffer, ctx, ctx.currentTime, LINER_DROP_GAIN_MULT)
      } catch (e) {}
    })
  }, LINER_DROP_DELAY_MS)
}

