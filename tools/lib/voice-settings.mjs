// SIGNAL -- the voice render settings, as data.
//
// 2026-08-29. These numbers were prose in audio/voice.js's provenance block
// and nothing but a human could act on them. They are here so the renderer
// uses the same values the documentation states, and tests/voice-render.test.mjs
// asserts the block and this file still agree -- the same
// assert-rather-than-trust arrangement lint-roster.js's TAGLINE_MAX has with
// the guide index.
//
// Pure data, no imports at all: audio/voice.js cannot be loaded from Node
// without a browser (it top-level-awaits sfx.js, which wants an
// AudioContext), so a CLI tool importing the player to read its settings
// would need the harness's stubs. This module is what both can read.

export const VOICE_NAME = 'Nathan -- Virtual Radio Host'
export const MODEL_ID = 'eleven_multilingual_v2'

/** Exactly the ElevenLabs voice_settings body. Percentages in the UI are
 *  0-1 here: 81% stability is 0.81. */
export const VOICE_SETTINGS = {
  stability: 0.81,
  similarity_boost: 1.0,
  style: 0.0,
  use_speaker_boost: true,
  speed: 0.99,
}

// 44.1kHz/128kbps mp3. The existing set is 44.1k mono; the API returns
// stereo, which the renderer downmixes so a new clip matches what is already
// on disk rather than being twice the size for no audible reason.
export const OUTPUT_FORMAT = 'mp3_44100_128'

// The playback envelope in audio/voice.js starts its fade at (duration -
// 0.4), so anything under this is faded down while the speaker is still
// talking. TAIL_AIM is where the existing set sits.
export const TAIL_MIN_S = 0.4
export const TAIL_AIM_S = 0.5

// Peak level band the existing clips occupy, measured 2026-08-29 with
// `ffmpeg -af volumedetect`. SYNAPSE's ID sits at -2.1 and is the outlier
// that prompted measuring at all -- it is audibly hotter than the rest and
// the duck cannot fix it, because the duck scales the music and not the
// voice.
export const PEAK_MIN_DB = -7.5
export const PEAK_MAX_DB = -3.0

/** The station ID script. Digits must be spelled out -- handed "567.8" the
 *  renderer says "five six seven point eight", which is not how a station
 *  reads its own frequency. */
export const ID_SCRIPT = (callsign, spokenFreq) => `${callsign}, ${spokenFreq}.`

/** 567.8 -> "five sixty-seven point eight". 808.0 -> "eight oh eight".
 *
 *  A ROUND frequency drops the decimal entirely, because that is how the
 *  existing clips read them and a station does not announce "point zero".
 *  Confirmed by the curator 2026-08-29 after a test render exposed it: the
 *  first version said "point zero" for every .0 station, and the rendered
 *  HACKBACK ID ran 2.09s of speech against the existing clip's 1.43s. Same
 *  voice, same settings, same callsign -- 0.66s can only be words. Five of
 *  the six round-frequency clips fit the shorter script on duration alone.
 *
 *  Only the shapes this dial actually produces: three digits, at most one
 *  decimal place, 100.0-900.0. */
export function spokenFrequency(freq) {
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const under100 = (n) => {
    if (n < 10) return ONES[n]
    if (n < 20) return TEENS[n - 10]
    const t = TENS[Math.floor(n / 10)]
    return n % 10 ? `${t}-${ONES[n % 10]}` : t
  }
  const whole = Math.floor(freq)
  const tenth = Math.round((freq - whole) * 10)
  // 567 -> "five sixty-seven", the way a presenter reads a dial position:
  // the hundreds digit alone, then the remainder as a number.
  const hundreds = Math.floor(whole / 100)
  const rest = whole % 100
  // rest 1-9 is "oh eight", not "eight": 808.0 is read "eight oh eight", and
  // the naive form said "eight eight". HACKBACK is the only station on the
  // dial that hits this, which is exactly why it needed running against the
  // real roster rather than reasoned about.
  const head = rest === 0 ? `${ONES[hundreds]} hundred`
    : rest < 10 ? `${ONES[hundreds]} oh ${ONES[rest]}`
      : `${ONES[hundreds]} ${under100(rest)}`
  return tenth === 0 ? head : `${head} point ${ONES[tenth]}`
}
