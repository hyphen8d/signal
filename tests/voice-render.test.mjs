// The voice render settings, and the one thing that can silently rot about
// them: audio/voice.js documents the voice and its settings in prose, and
// tools/lib/voice-settings.mjs is what the renderer actually sends. Two
// copies of the same numbers, so this asserts they agree rather than trusting
// them to -- the same arrangement lint-roster.js's TAGLINE_MAX has with the
// guide index column, and for the same reason: the alternative is finding out
// when a clip comes back sounding wrong.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  VOICE_NAME, MODEL_ID, VOICE_SETTINGS, TAIL_MIN_S,
  ID_SCRIPT, spokenFrequency, CALLSIGN_RESPELL,
} from '../tools/lib/voice-settings.mjs'
import { stationIdClipPath, stationClipName, linerClipPath } from '../audio/station-id-clips.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VOICE_JS = readFileSync(path.join(ROOT, 'audio/voice.js'), 'utf8')
// Just the provenance block, so a number appearing elsewhere in the file
// cannot accidentally satisfy these.
const BLOCK = VOICE_JS.slice(VOICE_JS.indexOf('VOICE PROVENANCE'), VOICE_JS.indexOf('53rd pass'))

test('the provenance block names the voice the renderer actually uses', () => {
  assert.ok(BLOCK.includes(VOICE_NAME),
    `audio/voice.js does not name "${VOICE_NAME}" -- the docs and the renderer disagree about the voice`)
})

test('every setting in the block is the setting that gets sent', () => {
  // Percentages in the block, 0-1 in the request body.
  assert.match(BLOCK, /Eleven Multilingual v2/i)
  assert.equal(MODEL_ID, 'eleven_multilingual_v2')
  assert.match(BLOCK, new RegExp(`Speed\\s+${VOICE_SETTINGS.speed}`))
  assert.match(BLOCK, new RegExp(`Stability\\s+${VOICE_SETTINGS.stability * 100}%`))
  assert.match(BLOCK, new RegExp(`Similarity boost\\s+${VOICE_SETTINGS.similarity_boost * 100}%`))
  assert.match(BLOCK, new RegExp(`Style\\s+${VOICE_SETTINGS.style * 100}%`))
  assert.ok(VOICE_SETTINGS.use_speaker_boost === true && /Speaker boost\s+enabled/i.test(BLOCK))
})

test('the block states the tail requirement the renderer enforces', () => {
  assert.ok(BLOCK.includes(String(TAIL_MIN_S)),
    `the block should state the ${TAIL_MIN_S}s tail minimum the renderer pads to`)
})

test('the station ID script matches the line that produced the real clip', () => {
  // Taken from the ElevenLabs panel that rendered station-id-synapse.mp3, so
  // this is not a guess about the format -- it is the format.
  assert.equal(ID_SCRIPT('SYNAPSE', spokenFrequency(567.8)),
    'SYNAPSE, five sixty-seven point eight.')
})

test('frequencies are spoken the way a presenter reads a dial', () => {
  assert.equal(spokenFrequency(133.7), 'one thirty-three point seven')
  assert.equal(spokenFrequency(199.7), 'one ninety-nine point seven')
  // A round frequency drops the decimal: a station says "eight oh eight",
  // not "eight oh eight point zero". Caught by a test render running 0.66s
  // longer than the clip it was reproducing.
  assert.equal(spokenFrequency(273.0), 'two seventy-three')
  // HACKBACK. The remainder is a single digit, which the first version read
  // as "eight eight" -- the only station on the dial that reaches this branch,
  // and the reason the generator was run across the whole roster.
  assert.equal(spokenFrequency(808.0), 'eight oh eight')
  // A round hundred, which nothing on the dial currently is.
  assert.equal(spokenFrequency(500.0), 'five hundred')
  // ...and a real decimal still gets said.
  assert.equal(spokenFrequency(567.8), 'five sixty-seven point eight')
})

test('every station on the dial produces a sayable line', () => {
  // Guards the generator against a frequency shape it has never seen: a new
  // station is one edit away, and a malformed line costs credits to discover.
  const stations = [133.7, 199.7, 273.0, 321.0, 488.0, 529.0, 567.8, 780.0, 808.0]
  for (const f of stations) {
    const spoken = spokenFrequency(f)
    assert.doesNotMatch(spoken, /undefined|NaN/, `${f} produced "${spoken}"`)
    // "point <digit>" only where there is a digit to say.
    const expectDecimal = Math.round((f - Math.floor(f)) * 10) !== 0
    assert.match(spoken, expectDecimal ? /^[a-z -]+ point [a-z]+$/ : /^[a-z -]+$/,
      `${f} produced "${spoken}"`)
    assert.equal(/ point /.test(spoken), expectDecimal, `${f} produced "${spoken}"`)
  }
})

test('the renderer targets the clip the player actually loads', async () => {
  // The bug this pins cost a wasted render and, worse, was silent: SYNAPSE's
  // id is still 'midnight-neon', so a path derived from the id wrote over
  // station-id-midnight-neon.mp3 -- a retired file nothing reads -- while
  // the clip the set fetches was left untouched. Everything reported
  // success.
  assert.equal(stationClipName('midnight-neon'), 'synapse')
  assert.equal(stationIdClipPath('midnight-neon'), 'audio/station-id-synapse.mp3')
  // A station with no remap is unchanged.
  assert.equal(stationIdClipPath('cipher'), 'audio/station-id-cipher.mp3')
})

test('every public station has a clip file where the map says it should be', async () => {
  const { existsSync } = await import('node:fs')
  const { STATIONS } = await import('../stations.js?v=voice-render-test')
  for (const st of STATIONS) {
    const p = path.join(ROOT, stationIdClipPath(st.id))
    assert.ok(existsSync(p), `${st.callsign} loads ${stationIdClipPath(st.id)}, which does not exist`)
  }
})

test('liner filenames resolve through the same remap as station IDs', () => {
  // The whole point of extending the map: two clip types, one rule. SYNAPSE's
  // liner is liner-synapse-NN.mp3, not liner-midnight-neon-NN.mp3, for the
  // same reason its spoken ID is station-id-synapse.mp3.
  assert.equal(linerClipPath('midnight-neon', 1), 'audio/liner-synapse-01.mp3')
  assert.equal(linerClipPath('cipher', 2), 'audio/liner-cipher-02.mp3')
  assert.equal(linerClipPath('cipher', 12), 'audio/liner-cipher-12.mp3')
})

test('a callsign this voice mispronounces is respelled in the ID script', () => {
  // Regenerating CIRCUIT CRUSH's ID must not quietly restore the spelling
  // that sounded wrong. The liner is deliberately NOT respelled -- the same
  // words read correctly mid-sentence, and only the ID opens with them.
  assert.equal(ID_SCRIPT('CIRCUIT CRUSH', 'four eighty-eight'),
    'Serkit Crush, four eighty-eight.')
  assert.equal(ID_SCRIPT('CIPHER', 'one thirty-three point seven'),
    'CIPHER, one thirty-three point seven.')
  assert.ok(CALLSIGN_RESPELL['CIRCUIT CRUSH'])
})
