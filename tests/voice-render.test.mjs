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
  ID_SCRIPT, CALLSIGN_RESPELL,
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

test('the station ID script is the callsign and nothing else', () => {
  // 2026-08-31 -- the frequency came out of every clip so a station can move
  // band or dial position without a re-render. What replaced the old
  // `<callsign>, <spoken freq>.` assertion is deliberately this blunt: the
  // whole point is that no number reaches the script.
  // COLD WAVE rather than SYNAPSE, which this used to use: SYNAPSE gained a
  // respelling on 2026-08-31 and stopped being an example of a callsign that
  // passes through untouched. Picked as one the respell map does not name.
  assert.equal(ID_SCRIPT('COLD WAVE'), 'COLD WAVE.')
  assert.doesNotMatch(ID_SCRIPT('COLD WAVE'), /[0-9]/, 'no digits reach the renderer')
})

test('no station on the dial can put a number into its own ID', async () => {
  // The generator used to be run across the whole roster because one
  // frequency shape (HACKBACK's 808.0) read wrong in a way only the real
  // roster exposed. That class of bug is gone rather than fixed, and this is
  // what keeps it gone: whatever the dial does to frequencies, none of it
  // reaches the script. Written against the live roster so a new station or
  // a new band is covered without anyone remembering to add it here.
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=voice-id-script')
  for (const st of [...STATIONS, ...(SECRET_STATIONS ?? [])]) {
    const line = ID_SCRIPT(st.callsign)
    assert.doesNotMatch(line, /[0-9]/, `${st.callsign} put a digit in its ID`)
    assert.doesNotMatch(line, /undefined|NaN/, `${st.callsign} produced "${line}"`)
    assert.ok(line.endsWith('.'), `${st.callsign} produced "${line}"`)
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

test('a callsign this voice mispronounces is respelled in the ID script', async () => {
  // Regenerating CIRCUIT CRUSH's ID must not quietly restore the spelling
  // that sounded wrong. The liner is deliberately NOT respelled -- the same
  // words read correctly mid-sentence, and only the ID opens with them.
  assert.equal(ID_SCRIPT('CIRCUIT CRUSH'), 'Serkit Crush.')
  assert.equal(ID_SCRIPT('CIPHER'), 'CIPHER.')
  assert.ok(CALLSIGN_RESPELL['CIRCUIT CRUSH'])
  // 2026-08-31 -- SYNAPSE joined them the day the ID script became the
  // callsign alone. It had been read correctly for as long as it had a
  // frequency after it; with nothing following, the voice put a trailing
  // vowel on the end. Pinned for the same reason CIRCUIT CRUSH is: the
  // failure mode is REGENERATION, where the next person to re-render this
  // station gets the wrong pronunciation back with nothing to warn them.
  assert.equal(ID_SCRIPT('SYNAPSE'), 'Sinaps.')
  assert.ok(CALLSIGN_RESPELL.SYNAPSE)
  // Every respelling must still be a callsign the roster actually has --
  // a map keyed on a station that was renamed silently stops applying.
  const { STATIONS, SECRET_STATIONS } = await import('../stations.js?v=respell')
  const callsigns = new Set([...STATIONS, ...SECRET_STATIONS].map((st) => st.callsign))
  for (const name of Object.keys(CALLSIGN_RESPELL)) {
    assert.ok(callsigns.has(name), `${name} is respelled but is not on the roster`)
  }
})
