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

// Peak level band, measured 2026-08-29 with `ffmpeg -af volumedetect`.
//
// PER CLIP TYPE, because one band for both is wrong and produced four false
// alarms on its first real batch. Liner drops play through
// LINER_DROP_GAIN_MULT (0.75) where station IDs play at full level, so a
// liner can sit 20*log10(0.75) = 2.5dB hotter on disk and still arrive at the
// same place. Judging both against the ID band flagged four perfectly normal
// liners as too loud.
export const PEAK_MIN_DB = -8.0
export const PEAK_MAX_DB = -3.0
// Liners get their own pair rather than the ID band shifted by the 2.5dB of
// LINER_DROP_GAIN_MULT, which was the first attempt and was too clever: the
// shifted band promptly flagged two new clips as too QUIET while the liner
// already in the pool at -6.9dB sat below both of them.
//
// This band is WIDE, and honestly so. The nine station IDs were rendered in
// one session and hold 4.1dB; the liner pool was recorded across four
// separate passes and spans -6.9 to -1.1, with no level ever having been
// enforced. A band narrow enough to be a spec would condemn clips that have
// been playing for weeks. So this is a smell detector for something well
// outside what the set already contains -- the peak is printed on every
// render regardless, and that number is the useful part.
export const LINER_PEAK_MIN_DB = -7.5
export const LINER_PEAK_MAX_DB = -0.5
/** Liners and one-liners are played through LINER_DROP_GAIN_MULT; station IDs
 *  and the welcome line are not, and their band is the tighter one. */
export function peakBandFor(outPath) {
  const isLiner = /(^|\/)(liner-|oneliner|thanks)/.test(outPath)
  return isLiner
    ? { min: LINER_PEAK_MIN_DB, max: LINER_PEAK_MAX_DB, kind: 'liner' }
    : { min: PEAK_MIN_DB, max: PEAK_MAX_DB, kind: 'station ID' }
}

// Callsigns this voice reads wrong, respelled phonetically. Eleven
// Multilingual v2 does not support <phoneme> tags, so respelling the input is
// the only lever available.
//
// AND IT IS CONTEXT-DEPENDENT, which is the surprising part. "CIRCUIT CRUSH"
// came out wrong as the FIRST words of a station ID and came out fine mid-
// sentence in the liner, which reads "...a synthesiser that won't quit.
// CIRCUIT CRUSH, four eighty-eight." Same two words, same voice, same
// settings, different position. So this map applies to ID_SCRIPT only, and a
// liner that opens with a callsign would need its own respelling -- worth
// knowing before assuming a name is safe because it works somewhere.
//
// Confirmed by ear 2026-08-29; three spellings were rendered and 'Serkit' won.
export const CALLSIGN_RESPELL = {
  'CIRCUIT CRUSH': 'Serkit Crush',
}

/** The station ID script: the callsign, and nothing else.
 *
 *  2026-08-31 -- the frequency came OUT. It read `<callsign>, <spoken freq>.`
 *  from the first clip to the ninth, which is what a real station does and is
 *  the reason it was written that way.
 *
 *  What changed is that frequencies stopped being permanent. The dial gained
 *  a second band, and moving a station between bands or frequencies used to
 *  mean re-rendering its ID and both its liners -- three clips and real money
 *  per move, which is a toll on rearranging the roster. SYNAPSE and CIRCUIT
 *  CRUSH crossing to ZM is what made that concrete: the moment they moved,
 *  five clips were announcing numbers their stations no longer sat on.
 *
 *  So the dial position is now purely visual and a station can move forever
 *  without touching audio. The cost is real and worth stating: a station that
 *  never says its own frequency is slightly less like a radio than one that
 *  does. That was traded for mobility deliberately.
 *
 *  CALLSIGN_RESPELL matters MORE now, not less. It applies to whatever OPENS
 *  a line, and a callsign-only ID is nothing but an opening. */
export const ID_SCRIPT = (callsign) => `${CALLSIGN_RESPELL[callsign] ?? callsign}.`

// spokenFrequency() WAS HERE and is retired 2026-08-31 along with the
// frequency clause in ID_SCRIPT above. It turned 567.8 into "five sixty-seven
// point eight" for the ID script, and nothing else ever called it.
//
// KEPT AS A NOTE because the knowledge cost a render to find and would cost
// another if frequencies ever go back into the audio. Two rules that are not
// obvious until you hear them wrong:
//
//   - A ROUND frequency drops the decimal. A station says "HACKBACK, eight oh
//     eight", never "eight oh eight point zero". The first version said "point
//     zero" for every .0 station, which was wrong for six of the nine then on
//     the dial. It was caught by DURATION, not by reading: the test render ran
//     2.09s against the existing clip's 1.43s on the same callsign, same voice,
//     same settings, and 0.66s can only be words.
//
//   - A remainder of 1-9 is "oh eight", not "eight". 808.0 is read "eight oh
//     eight"; the naive form said "eight eight". HACKBACK was the only station
//     on the dial that reached that branch, which is why it had to be run
//     across the real roster rather than reasoned about.
//
// Recover it from git (see tools/lib/voice-settings.mjs before this date)
// rather than rewriting it from these notes.
