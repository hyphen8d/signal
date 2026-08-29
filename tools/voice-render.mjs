// SIGNAL -- render a voice clip through ElevenLabs, with the project's own
// rules enforced before it is allowed onto the disk.
//
// 2026-08-29. The round trip this replaces was: open the ElevenLabs page,
// type the line, pick the voice, check the settings match the last one,
// render, download, rename, drop into audio/, then find out later whether
// the tail was long enough. Two of those steps have gone wrong for real --
// SYNAPSE's station ID shipped with 0.23s of trailing silence and had its
// last word faded out under listeners, and the same clip came back ~3dB
// hotter than the rest of the set.
//
// So the point of this tool is NOT that it saves typing. It is that the two
// checks happen between the render and the file existing, rather than after
// it has been committed:
//
//   1. TRAILING SILENCE. Padded automatically to TAIL_AIM_S when short, which
//      is a safe fix -- it appends digital silence and touches no audio.
//   2. PEAK LEVEL. Reported against the band the existing set occupies, and
//      NOT auto-corrected: normalising would change the recording, and if a
//      take is hot the right answer is usually another take.
//
// Settings come from tools/lib/voice-settings.mjs, which is also what
// audio/voice.js's provenance block documents -- so a clip rendered here
// cannot be made with settings the repo does not claim to use.
//
//   node tools/voice-render.mjs --station=cipher            # a station ID
//   node tools/voice-render.mjs --text="..." --out=audio/oneliner04.mp3
//   node tools/voice-render.mjs --station=cipher --dry-run  # script only, no credits
//
// The key is read from ELEVENLABS_API_KEY, or from .elevenlabs-key (which is
// gitignored). It is never printed, never written anywhere, and never passed
// as an argument -- an argument would put it in the shell history and in the
// process list.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  VOICE_NAME, MODEL_ID, VOICE_SETTINGS, OUTPUT_FORMAT,
  TAIL_MIN_S, TAIL_AIM_S, PEAK_MIN_DB, PEAK_MAX_DB,
  ID_SCRIPT, spokenFrequency,
} from './lib/voice-settings.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const has = (n) => args.includes(`--${n}`)
const die = (msg, code = 2) => { console.error(msg); process.exit(code) }

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  const f = path.join(ROOT, '.elevenlabs-key')
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  die('No API key. Either:\n' +
      '  export ELEVENLABS_API_KEY=...\n' +
      '  or put it in .elevenlabs-key at the repo root (gitignored).\n' +
      'Not passed as an argument on purpose -- that lands in shell history.')
}

/** ffmpeg's own measurements. The same two numbers the VOICE panel in the
 *  dashboard shows, taken the same way, so the tool and the panel cannot
 *  disagree about whether a clip is acceptable. */
function measure(file) {
  const out = execFileSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.08,volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()
  const starts = [...out.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1])
  const last = starts.length ? starts[starts.length - 1] : null
  return {
    duration: dur,
    tail: last === null ? 0 : dur - last,
    peak: +(out.match(/max_volume: (-?[0-9.]+)/)?.[1] ?? NaN),
    mean: +(out.match(/mean_volume: (-?[0-9.]+)/)?.[1] ?? NaN),
  }
}

async function main() {
  const stationId = flag('station')
  let text = flag('text')
  let out = flag('out')

  if (stationId) {
    const { STATIONS, SECRET_STATIONS } = await import(`${ROOT}/stations.js?v=voice-render`)
    const st = [...STATIONS, ...(SECRET_STATIONS ?? [])].find((x) => x.id === stationId)
    if (!st) die(`No station "${stationId}".`)
    text ??= ID_SCRIPT(st.callsign, spokenFrequency(st.freq))
    out ??= `audio/station-id-${stationId}.mp3`
  }
  if (!text) die('Nothing to say. Give --text="..." or --station=<id>.')
  if (!out) die('Nowhere to put it. Give --out=audio/<name>.mp3')

  const dest = path.resolve(ROOT, out)
  if (!dest.startsWith(path.join(ROOT, 'audio') + path.sep)) die(`--out must be inside audio/, got ${out}`)

  console.log(`voice   ${VOICE_NAME}`)
  console.log(`model   ${MODEL_ID}   ${Object.entries(VOICE_SETTINGS).map(([k, v]) => `${k}=${v}`).join(' ')}`)
  console.log(`script  "${text}"`)
  console.log(`out     ${out}${existsSync(dest) ? '   (OVERWRITES an existing file)' : ''}`)

  // Nothing is rendered without the script having been printed first. A
  // wrong line costs credits and, worse, sounds fine in isolation -- the
  // frequency is the part that goes wrong, and it is the part nobody
  // proofreads.
  if (has('dry-run')) { console.log('\n--dry-run: nothing rendered, no credits spent.'); return }
  if (!has('yes')) die('\nAdd --yes to render this. (--dry-run to just see the script.)', 1)

  const key = apiKey()
  const voiceId = flag('voice-id', process.env.ELEVENLABS_VOICE_ID)
  if (!voiceId) {
    die('\nNo voice id. Find it in the ElevenLabs panel ("Copy Voice ID") and either:\n' +
        '  export ELEVENLABS_VOICE_ID=...\n' +
        '  or pass --voice-id=...\n' +
        `The voice itself is "${VOICE_NAME}" -- see audio/voice.js.`)
  }

  console.log('\nrendering...')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  })
  if (!res.ok) die(`ElevenLabs said ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const raw = path.join(ROOT, 'audio', `.render-${Date.now()}.mp3`)
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()))

  // The API returns stereo; the existing set is 44.1k mono. Matching it is
  // not cosmetic -- a stereo clip is twice the bytes for a mono voice, and
  // every other file in this directory is mono.
  const mono = path.join(ROOT, 'audio', `.mono-${Date.now()}.mp3`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ac', '1', '-ar', '44100', '-b:a', '192k', mono])
  unlinkSync(raw)

  let m = measure(mono)
  console.log(`\nrendered  ${m.duration.toFixed(2)}s   tail ${m.tail.toFixed(3)}s   peak ${m.peak}dB   mean ${m.mean}dB`)

  if (m.tail < TAIL_MIN_S) {
    const pad = (TAIL_AIM_S - m.tail).toFixed(3)
    console.log(`  tail is under ${TAIL_MIN_S}s -- padding ${pad}s of silence so the fade cannot eat the last word`)
    const padded = path.join(ROOT, 'audio', `.pad-${Date.now()}.mp3`)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mono, '-af', `apad=pad_dur=${pad}`, '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '1', padded])
    unlinkSync(mono)
    writeFileSync(dest, readFileSync(padded))
    unlinkSync(padded)
    m = measure(dest)
    console.log(`  after padding: ${m.duration.toFixed(2)}s   tail ${m.tail.toFixed(3)}s`)
  } else {
    writeFileSync(dest, readFileSync(mono))
    unlinkSync(mono)
  }

  // Reported, never corrected. Normalising would alter the recording, and a
  // hot take is better fixed by taking it again.
  if (Number.isFinite(m.peak) && (m.peak > PEAK_MAX_DB || m.peak < PEAK_MIN_DB)) {
    console.log(`\n! PEAK ${m.peak}dB is outside the set's band (${PEAK_MIN_DB} to ${PEAK_MAX_DB}dB).`)
    console.log('  Not corrected -- normalising changes the recording. This clip will sit')
    console.log('  louder or quieter than the rest, and the duck cannot fix it: it scales')
    console.log('  the music, not the voice. Consider re-rendering.')
  }
  console.log(`\nwrote ${out}`)
  console.log('Listen to it before committing -- everything above is measurement, not judgement.')
}

main().catch((e) => die(String(e?.stack ?? e)))
