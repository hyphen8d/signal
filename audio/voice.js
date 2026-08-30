// SIGNAL -- voice assets: the network sign-on line, per-station verbal IDs,
// liner drops (all through one "through the radio" processing chain), and
// the synced-lyrics lookup. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { audioCtx, speakerOut } = await import(`./sfx.js?v=${V}`)
const { DUCK_TAIL_MS } = await import(`../constants.js?v=${V}`)

// ---------------------------------------------------------------------
// VOICE PROVENANCE -- what made every mp3 in audio/, and what to match when
// making another one.
//
// EVERY clip is this voice: the network sign-on and welcome lines, all nine
// station IDs, both per-station and general liner drops, and the retired
// ones still sitting on disk unreferenced. Confirmed by the curator
// 2026-08-29, against the ElevenLabs generation panel for SYNAPSE's ID.
// Stated as "every" on purpose -- the point of this block is that someone
// rendering a new clip does not have to wonder which of the existing ones
// theirs has to sit beside.
//
//   Voice            Nathan -- Virtual Radio Host
//   Model            Eleven Multilingual v2
//   Speed            0.99
//   Stability        81%
//   Similarity boost 100%
//   Style            0%
//   Speaker boost    enabled
//
// CIRCUIT CRUSH's ID is scripted "Serkit Crush, four eighty-eight." -- this
// voice reads "CIRCUIT" wrong when it opens a line, and Eleven Multilingual
// v2 has no phoneme tags, so the spelling is the fix. Its LINER is not
// respelled: the same words read correctly mid-sentence there. See
// CALLSIGN_RESPELL in tools/lib/voice-settings.mjs.
//
// Station ID script is "<CALLSIGN>, <frequency, spoken>." -- e.g. SYNAPSE's
// is literally "SYNAPSE, five sixty-seven point eight." Digits are spelled
// out; the renderer says "five six seven point eight" if given 567.8. A
// ROUND frequency drops the decimal: HACKBACK is "eight oh eight", not
// "eight oh eight point zero" -- a station does not announce a trailing
// zero. tools/lib/voice-settings.mjs generates both forms.
//
// Two things to check on every new clip before it goes in, both of which
// have bitten:
//   - TRAILING SILENCE >= 0.4s, ideally ~0.5s. The playback envelope below
//     starts its fade at (duration - 0.4), so a shorter tail is faded down
//     while the speaker is still talking. The dashboard's VOICE panel
//     measures this; it is how SYNAPSE's 0.23s clip was caught.
//   - LEVEL. SYNAPSE's ID came in around 3dB hotter than the rest of the
//     set (peak -2.1dB against a typical -5dB) and still sits louder than
//     everything else, which the duck cannot fix because it scales the
//     music, not the voice.
//
// This block replaces a line that named "Rachel M -- Pro British Radio
// Presenter" as the voice. That was wrong for the whole set, not merely out
// of date for part of it. Recorded here rather than left as a corrected
// half-sentence because it was the ONLY place in the repo the voice was
// named at all, and a wrong answer in the only place anyone would look is
// worse than no answer.
// ---------------------------------------------------------------------

// 53rd pass -- network sign-on ID: verbal station IDs, an ElevenLabs-rendered
// line: "you're now listening to the SIGNAL radio network". This is
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
    welcomeLineBufferPromise = fetch(clipUrl(WELCOME_LINE_FILE))
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
  // Voice clips also carry padded trailing silence (see audio/ prep) so this
  // fade always lands after real speech ends.
  //
  // 2026-08-27 -- that number was recorded here as "~0.2s" and it was wrong,
  // which cost a real clip. The fade STARTS at dur - 0.4, so anything under
  // 0.4s of tail is faded while the speaker is still talking. Every clip on
  // disk happens to clear it (0.47-0.57s), so the understated figure never
  // bit until a new drop arrived at 0.31s -- above the documented number,
  // below the actual one, and audibly clipped on its last word. The real
  // requirement is >= 0.4s; aim for ~0.5s, which is where the existing set
  // sits. Check an incoming clip with:
  //   ffmpeg -i clip.mp3 -af silencedetect=noise=-45dB:d=0.08 -f null -
  // and pad with `-af apad=pad_dur=<n>` if the last silence_start is later
  // than duration - 0.4. Note `-v info`, not the `-v error` that looks
  // tidier: silencedetect logs at INFO, so `-v error` prints nothing and
  // reads exactly like a clip with no trailing silence at all.
  //
  // 2026-08-29 -- this rule was broken a SECOND time, by
  // station-id-synapse.mp3: 0.23s of tail, shipped in the MIDNIGHT NEON ->
  // SYNAPSE rename, and audibly cut off in production until it was padded to
  // 0.53s. Twice now the offender has been the newest clip on the disk, which
  // is what a rule that only lives in a comment gets you. It no longer only
  // lives in a comment: the admin dashboard's VOICE & DROPS panel decodes
  // every clip and measures this, at the same -45dB threshold, so opening the
  // panel performs the check that used to depend on remembering to run
  // ffmpeg. That panel is how this one was caught.
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
// A station's spoken ID is normally audio/station-id-<id>.mp3, resolved by
// convention from the station's id. This map is the exception list, and it
// exists because a station's CALLSIGN can change while its id cannot: the id
// is load-bearing for saved sessions (state.js persists stationId), for
// per-station visualizer picks, and as the key into
// tools/station-profiles.json and the pending queue. Renaming an id to match
// a new callsign would silently drop every returning visitor's restored
// station.
//
// 2026-08-28 -- MIDNIGHT NEON became SYNAPSE. The id stayed 'midnight-neon',
// so without this entry the convention would have kept loading
// station-id-midnight-neon.mp3, which is voiced as "MIDNIGHT NEON" -- the
// station would have announced a callsign that is no longer on the screen.
// That is exactly the mismatch the 60th pass avoided by DROPPING MOMENTUM's
// liner rather than remapping it (see LINER_FILES above); here there is a
// real replacement clip, so it is remapped rather than dropped. The old file
// is left on disk, unreferenced, same as station-id-momentum.mp3.
// The map moved to audio/station-id-clips.js on 2026-08-29 and is
// re-exported here so every existing importer keeps working. It left because
// tools/voice-render.mjs needs it too and cannot import this file -- Node
// has no AudioContext -- so it derived clip names for itself and got them
// wrong the first time it mattered, writing a re-rendered SYNAPSE over the
// retired station-id-midnight-neon.mp3 while the live clip went untouched.
// Two readers, one definition.
export { STATION_ID_CLIPS } from './station-id-clips.js'
const { stationClipName } = await import(`./station-id-clips.js?v=${V}`)

/** Every audio asset carries the build stamp, exactly as every module does.
 *
 *  2026-08-29 -- it did not, and that is a real gap rather than a tidiness
 *  one. main.js versions module imports as ?v=<stamp> precisely because
 *  GitHub Pages answers with `cache-control: max-age=600`, so without a
 *  cache-buster a visitor can sit on the previous build for ten minutes.
 *  The mp3s were fetched by plain path and were therefore subject to exactly
 *  the staleness the stamp exists to prevent -- which showed up the first
 *  time a clip was RE-rendered rather than added: the new station ID was
 *  live, byte-identical on the server, and the browser kept playing the old
 *  one. Adding a clip never exposed this, because a URL nobody has fetched
 *  cannot be stale.
 *
 *  Same query the modules use, so one `node tools/stamp.js` busts both. */
const clipUrl = (path) => (V ? `${path}?v=${V}` : path)

export function loadStationIdBuffer(stationId) {
  if (!stationIdBufferPromises[stationId]) {
    const clip = stationClipName(stationId)
    stationIdBufferPromises[stationId] = fetch(clipUrl(`audio/station-id-${clip}.mp3`))
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
      // 2026-08-29 -- pull the music down under the announcement. Called here
      // rather than inside playProcessedVoiceClip() because that chain is
      // shared with the network sign-on line above, which plays over a boot
      // with no track under it yet and so has nothing to duck.
      program.duckFor?.(buffer.duration * 1000 + DUCK_TAIL_MS)
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
export const LINER_DROP_CHANCE = 0.35
// 2026-08-29 -- was 0.25, and the station-specific clip was picked from the
// combined pool, so a given station's own liner landed on 0.25 * 2/11 = 4.5%
// of track changes: one every twenty-two. That is rare enough that the
// station clips -- the ones actually carrying identity -- were the half
// nobody heard, and rare enough to be hard to even TEST by skipping tracks.
//
// The fix is two-part, and the second half matters more than the first. The
// rate went up a little; the MIX changed a lot. A drop now picks its bucket
// before it picks its clip: half the time the station's own, half the time a
// general. So the generals no longer crowd out the station clips simply by
// outnumbering them nine to two, which is the thing the note under
// GENERAL_LINER_FILES has been warning about since there were three of them.
export const STATION_LINER_SHARE = 0.5
// 57th pass -- general-purpose one-liners (3 one-liners plus a
// thank-you clip general enough to double as a 4th), not written for any
// one station's genre. Folded into every station's pool below rather than
// given a separate trigger, so they ride the same 1-in-4 roll and
// repeat-avoidance logic in maybePlayLinerDrop as the per-station pilots
// instead of duplicating that machinery.
// TRANSCRIBED 2026-08-29 via ElevenLabs Scribe, because the scripts existed
// nowhere but in the audio and the next person writing a liner was guessing.
// Accuracy spot-check: thanks02 came back matching the one line already
// quoted in this file, word for word.
//
// Frequencies below are written as digits because that is how a transcript
// renders them. The clips SAY them: "two seventy-three", not "273". To
// re-render one, spell it out -- see tools/lib/voice-settings.mjs.
//
//   oneliner01  "This is SIGNAL. Try not to overthink it."
//   oneliner2   "SIGNAL. It really whips the llama's ass."
//   oneliner3   "SIGNAL is created for you with love from San Diego, California."
//   thanks01    "Every signal needs a receiver. Thanks for being ours."
//   thanks02    "You're listening to SIGNAL. Wherever you are, thanks for tuning in."
export const GENERAL_LINER_FILES = [
  'audio/oneliner01.mp3',
  'audio/oneliner2.mp3',
  'audio/oneliner3.mp3',
  'audio/thanks01.mp3',
  // 2026-08-27 -- "You're listening to SIGNAL. Wherever you are, thanks for
  // tuning in." Network-level, names no station, so it rides every pool like
  // the four above. Additive rather than replacing thanks01: a different
  // line, and the generals are the clips heard most often (they play on all
  // nine stations), so the pool wants breadth.
  //
  // Note what a fifth general does to the mix: a station's pool is its own
  // clip plus these, so a station-specific drop goes from 1-in-5 to 1-in-6.
  // The station clips are the ones carrying identity, so the generals should
  // not outgrow them much further before the per-station seconds land.
  'audio/thanks02.mp3',
  // 2026-08-29 -- four more. Written against the transcripts above rather
  // than blind, which is the only reason they share a register with what was
  // already here.
  //
  //   oneliner04  "You've got SIGNAL. Nothing here is live, and nothing here
  //                is sorry about it."
  //   oneliner05  "SIGNAL. Still broadcasting, still nobody's asked us to stop."
  //   oneliner06  "SIGNAL. There's nobody at the desk. There hasn't been for
  //                a while."
  //   oneliner07  "SIGNAL, still here. Turn it up or leave it low, makes no
  //                difference to us."
  //
  // On the odds the note above worries about: this adds four generals AND a
  // second clip to every station in the same pass, so a station-specific drop
  // goes from 1-in-6 to 2-in-11 -- 17% to 18%. The balance the note was
  // protecting is intact only because both halves grew together; four
  // generals alone would have pushed it to 1-in-10.
  'audio/oneliner04.mp3',
  'audio/oneliner05.mp3',
  'audio/oneliner06.mp3',
  'audio/oneliner07.mp3',
]
// TRANSCRIBED 2026-08-29, same pass as the generals above. THE FORMAT IS THE
// POINT: every one of these is <hook>, then the callsign and frequency, in
// that order. A liner that opens with the callsign reads as a different
// station entirely, and that is not obvious from the filenames -- the first
// batch of replacements was drafted the other way round before anyone
// listened.
//
// Round frequencies drop the decimal here too, exactly as the station IDs do:
// "Cold Wave 273", never "273 point 0".
//
//   cipher            "They're listening. So are we. CIPHER, 133.7."
//   distortion-field  "We love guitar solos. DISTORTION FIELD, 199.7."
//   cold-wave         "Machines don't get lonely, we do. COLD WAVE, 273."
//   drift-mode        "Sleep mode activated. DRIFT MODE, 321."
//   circuit-crush     "The long way home every time. CIRCUIT CRUSH, 488."
//   atomic            "Glowing in the dark since 1955. ATOMIC, 529."
//   city-lights       "You're tuned in to Tokyo. CITY LIGHTS, 780."
//   hackback          "A throwback state of mind. HACKBACK, 808."
//
// The -02 clips, written 2026-08-29 to that same shape. SYNAPSE gets its
// first: it has had none since MOMENTUM was retired and its liner was
// dropped rather than remapped.
//
//   cipher            "If you know why this frequency is funny, you're in the
//                      right place. CIPHER, one thirty-three point seven."
//   distortion-field  "Every one of these was somebody's whole personality for
//                      a year. DISTORTION FIELD, one ninety-nine point seven."
//   cold-wave         "Drum machines, bad decisions, and a lot of reverb.
//                      COLD WAVE, two seventy-three."
//   drift-mode        "Nothing here is in a hurry. Neither are you.
//                      DRIFT MODE, three twenty-one."
//   circuit-crush     "Headlights, empty road, and a synthesiser that won't
//                      quit. CIRCUIT CRUSH, four eighty-eight."
//   atomic            "Still on the air, whatever the counter says.
//                      ATOMIC, five twenty-nine."
//   midnight-neon     "Somewhere it's four in the morning and this is exactly
//                      right. SYNAPSE, five sixty-seven point eight."
//   city-lights       "Tokyo, after dark, about forty years ago.
//                      CITY LIGHTS, seven eighty."
//   hackback          "The number's not an accident. HACKBACK, eight oh eight."
export const STATION_LINER_FILES = {
  cipher: ['audio/liner-cipher-01.mp3', 'audio/liner-cipher-02.mp3'],
  'distortion-field': ['audio/liner-distortion-field-01.mp3', 'audio/liner-distortion-field-02.mp3'],
  'cold-wave': ['audio/liner-cold-wave-01.mp3', 'audio/liner-cold-wave-02.mp3'],
  'drift-mode': ['audio/liner-drift-mode-01.mp3', 'audio/liner-drift-mode-02.mp3'],
  'circuit-crush': ['audio/liner-circuit-crush-01.mp3', 'audio/liner-circuit-crush-02.mp3'],
  atomic: ['audio/liner-atomic-01.mp3', 'audio/liner-atomic-02.mp3'],
  // 60th pass -- MOMENTUM retired (see the retirement comment above
  // MIDNIGHT NEON in STATIONS). Its liner clip (audio/liner-momentum-01.mp3,
  // voiced as "MOMENTUM") is left on disk but dropped from this map rather
  // than remapped to 'midnight-neon' -- the clip's own spoken content would
  // be wrong for the new callsign. Its station ID clip is real, though --
  // see audio/station-id-midnight-neon.mp3 and loadStationIdBuffer().
  //
  // 2026-08-27 -- that retirement cost more than it meant to, and the entry
  // below is the fix. Dropping the key entirely did not just remove the
  // station-specific liner: LINER_FILES is built by iterating THIS map, so
  // a missing key means no entry in LINER_FILES at all, and
  // maybePlayLinerDrop()'s `if (!files ...) return` fired before it could
  // reach the four GENERAL one-liners. The 57th pass folded those into
  // "every station's pool" deliberately; MIDNIGHT NEON was silently the one
  // station excluded from them, which nobody intended and nothing caught.
  //
  // An explicit empty array rather than a general-pool fallback in
  // maybePlayLinerDrop: secret stations rely on the missing-key path to opt
  // OUT of liners entirely (GREEN ROOM is meant to be silent here), so a
  // fallback would hand them drops they should never play. Empty-and-present
  // says "no station clip yet, general pool still applies" and leaves
  // absent-and-missing meaning "no liners at all". tests/helpers.test.mjs
  // now asserts every public station has a non-empty pool and that every
  // secret one has none, so the next retirement cannot reopen this quietly.
  'midnight-neon': ['audio/liner-synapse-01.mp3'],
  'city-lights': ['audio/liner-city-lights-01.mp3', 'audio/liner-city-lights-02.mp3'],
  hackback: ['audio/liner-hackback-01.mp3', 'audio/liner-hackback-02.mp3'],
}
export const LINER_FILES = {}
for (const stId in STATION_LINER_FILES) {
  LINER_FILES[stId] = [...STATION_LINER_FILES[stId], ...GENERAL_LINER_FILES]
}
export const linerBufferPromises = {}
export function loadLinerBuffer(path) {
  if (!linerBufferPromises[path]) {
    linerBufferPromises[path] = fetch(clipUrl(path))
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
  // An ABSENT key means the station opts out of liners entirely -- that is how
  // the secret stations stay silent, and it is load-bearing (see the note
  // above 'midnight-neon'). An EMPTY array means generals only.
  const own = STATION_LINER_FILES[station.id]
  if (!own || program.muted) return
  // SIGNAL_FORCE_LINER makes the next drop certain, for testing a clip
  // without skipping through twenty tracks to hear it. Same shape as the
  // other forced-state hooks; never set in normal play.
  if (!globalThis.SIGNAL_FORCE_LINER && Math.random() >= LINER_DROP_CHANCE) return
  // Bucket first, then clip. See STATION_LINER_SHARE.
  const bucket = own.length && Math.random() < STATION_LINER_SHARE ? own : GENERAL_LINER_FILES
  if (!bucket.length) return
  // Avoid repeating the same clip twice in a row, within whichever bucket
  // won -- a station with one clip would otherwise never play it twice
  // running even when that is the only thing its bucket holds.
  const pool = bucket.length > 1 && program._lastLiner
    ? bucket.filter((f) => f !== program._lastLiner)
    : bucket
  const path = (pool.length ? pool : bucket)[Math.floor(Math.random() * (pool.length || bucket.length))]
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
        program.duckFor?.(buffer.duration * 1000 + DUCK_TAIL_MS)
        playProcessedVoiceClip(buffer, ctx, ctx.currentTime, LINER_DROP_GAIN_MULT)
      } catch (e) {}
    })
  }, LINER_DROP_DELAY_MS)
}

