// tools/lib/roster.mjs -- the parse/patch layer the admin server and the
// network-ops dashboard both run on.
//
// The load-bearing property here is NOT "a patch parses afterwards". It is
// "a patch changes the bytes it was asked to change and no others", because
// the fields the identity editor writes are surrounded by the "Nth pass"
// comments that are this repo's actual design record. A patcher that
// reformatted a station object would pass every round-trip check ever
// written and still destroy the thing the comments exist for.
//
// So the sweep below is an IDEMPOTENCE check against the real stations.js:
// rewrite every field of every station with the value it already has, and
// require the file back byte for byte. That is what caught the two bugs the
// first version shipped with -- String(1.0) writing "1" over four stations'
// `identTempo: 1.0`, and a quote-normalizer rewriting five freqNote lines it was
// not asked to touch.
//
// Per CLAUDE.md ("Mutate the code to check a test can fail"), the mutation
// tests at the bottom neuter each patcher on purpose and require the checks
// above to go red. A patcher that returns its input unchanged is the exact
// shape of decorative pass this repo has already paid for once.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadRosterFromText, patchStationField, patchStationTracks, verifyPatch,
  patchStationTracksDetailed, parseTracksBlock, findTracksRange,
  scanObjectFields, matchBracket, quoteJs, formatValue, buildRosterPayload,
  findStationObjectRange,
} from '../tools/lib/roster.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(path.join(ROOT, 'stations.js'), 'utf8')

const IDENTITY_FIELDS = [
  'freq', 'callsign', 'tagline', 'desc', 'freqNote', 'glyph', 'static',
  'visual', 'identTempo', 'ident', 'crt', 'meter', 'idleEvent', 'grind',
]

test('the text parser agrees with what Node itself loads', async () => {
  globalThis.SIGNAL_BUILD ??= 'roster-lib-test'
  globalThis.matchMedia ??= () => ({ matches: false })
  const real = await import('../stations.js?v=roster-lib-test')
  const parsed = loadRosterFromText(SRC)
  assert.deepEqual(parsed.STATIONS, real.STATIONS)
  assert.deepEqual(parsed.SECRET_STATIONS, real.SECRET_STATIONS)
})

test('rewriting a field with its own value is byte-identical, for every field of every station', () => {
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(SRC)
  let checked = 0
  for (const st of [...STATIONS, ...SECRET_STATIONS]) {
    for (const field of IDENTITY_FIELDS) {
      if (st[field] === undefined) continue
      checked++
      assert.equal(
        patchStationField(SRC, st.id, field, st[field]), SRC,
        `rewriting ${st.id}.${field} with its existing value changed the file`)
    }
  }
  assert.ok(checked > 100, `expected to check >100 fields, checked ${checked}`)
})

test('nested leaf fields also rewrite byte-identically, including the last key of an inline object', () => {
  // The top-level sweep above rewrites `crt` as a whole object, where a
  // trailing space before the closing brace sits INSIDE the value on both
  // sides and cancels out. Patching one nested key does not have that luck:
  // `{ a: 1, b: 1.6 }` has the space inside b's value range, and an early
  // version wrote `b: 2.0}` over it. Every leaf of every nested object,
  // last-key ones included.
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(SRC)
  let checked = 0, lastKeys = 0
  for (const st of [...STATIONS, ...SECRET_STATIONS]) {
    for (const holder of ['crt', 'meter', 'idleEvent', 'grind']) {
      if (!st[holder]) continue
      const keys = Object.keys(st[holder])
      keys.forEach((key, i) => {
        checked++
        if (i === keys.length - 1) lastKeys++
        const path = `${holder}.${key}`
        assert.equal(
          patchStationField(SRC, st.id, path, st[holder][key]), SRC,
          `rewriting ${st.id}.${path} with its existing value changed the file`)
      })
    }
  }
  assert.ok(lastKeys >= 10, `expected to cover >=10 last-key cases, covered ${lastKeys}`)
  assert.ok(checked > 50, `expected >50 nested leaves, checked ${checked}`)
})

test('changing the last key of an inline object keeps the closing brace spaced', () => {
  // CIPHER is the station whose crt block ends on bloomAmt. Scoped to that
  // station's own object text -- a bare file-wide search finds DISTORTION
  // FIELD's crt line first and silently tests the wrong station.
  const out = patchStationField(SRC, 'cipher', 'crt.bloomAmt', 2)
  verifyPatch(out, 'cipher', { 'crt.bloomAmt': 2 })
  const { objStart, objEnd } = findStationObjectRange(out, 'cipher')
  const line = out.slice(objStart, objEnd + 1).split('\n').find(l => l.includes('crt: {'))
  assert.match(line, /bloomAmt: 2\.0 \}/, `lost the space before the brace: ${line}`)
})

test('a nested patch moves exactly one line and keeps every comment', () => {
  const out = patchStationField(SRC, 'distortion-field', 'crt.bloomAmt', 1.92)
  verifyPatch(out, 'distortion-field', { 'crt.bloomAmt': 1.92 })

  const A = SRC.split('\n'), B = out.split('\n')
  assert.equal(A.length, B.length, 'line count changed')
  const moved = A.filter((l, i) => l !== B[i])
  assert.equal(moved.length, 1, `expected 1 changed line, got ${moved.length}`)
  assert.match(moved[0], /bloomAmt/)
  assert.equal(
    (SRC.match(/\/\//g) || []).length, (out.match(/\/\//g) || []).length,
    'comment markers were lost')
})

test('sibling fields on a shared line are untouched', () => {
  // `{ id: '...', freq: 199.7, callsign: '...', tagline: '...',` is one line.
  const out = patchStationField(SRC, 'distortion-field', 'tagline', 'new tagline here')
  verifyPatch(out, 'distortion-field', {
    tagline: 'new tagline here', freq: 199.7, callsign: 'DISTORTION FIELD', id: 'distortion-field',
  })
})

test('numeric and quote style are inferred from the literal being replaced', () => {
  // identTempo: 1.0 must not become identTempo: 1. This used to be pinned on
  // `gain: 1.0`, which was the roster's other trailing-.0 literal until the
  // per-station gain field was removed on 2026-08-29 -- the rule it guards is
  // unchanged, it just needed a field that still exists to guard it on.
  // Asserted against the whole output rather than "the first line containing
  // identTempo:", which is what this did when it was pinned on gain and was
  // only ever correct by accident -- gain's first occurrence happened to
  // belong to the station being patched, and identTempo's does not.
  const g = patchStationField(SRC, 'cold-wave', 'identTempo', 1)
  assert.ok(g.includes('identTempo: 1.0,'), 'the trailing .0 was dropped')
  assert.ok(!g.includes('identTempo: 1,'), 'the value came back as a bare integer')
  // ident keeps its .0 tones
  const { STATIONS } = loadRosterFromText(SRC)
  const df = STATIONS.find(s => s.id === 'distortion-field')
  const i = patchStationField(SRC, 'distortion-field', 'ident', df.ident)
  assert.match(i.split('\n').find(l => l.trim().startsWith('ident:')), /392\.0/)
  // a single-quoted freqNote with an escaped apostrophe stays single-quoted
  const q = patchStationField(SRC, 'city-lights', 'freqNote', "Tokyo's other one")
  assert.ok(q.includes("'Tokyo\\'s other one'"), 'quote style was not preserved')
})

test('inserting and removing an override leaves the line well formed', () => {
  const added = patchStationField(SRC, 'distortion-field', 'crt.chroma', 0.4)
  verifyPatch(added, 'distortion-field', { 'crt.chroma': 0.4, 'crt.bloomAmt': 1.75 })

  for (const key of ['noise', 'bloomAmt', 'flicker']) {
    const gone = patchStationField(SRC, 'distortion-field', 'crt.' + key, null)
    verifyPatch(gone, 'distortion-field', { ['crt.' + key]: null })
    const line = gone.split('\n').find(l => l.includes('crt: {'))
    assert.doesNotMatch(line, /,\s*}/, `removing ${key} left a dangling comma: ${line}`)
    assert.doesNotMatch(line, /\{\s\s/, `removing ${key} left a double space: ${line}`)
  }
})

test('scanning is comment- and string-aware', () => {
  // A brace and an apostrophe inside a comment must not desynchronise the
  // scanner. This is why comments are skipped BEFORE strings.
  const src = `const STATIONS = [
  { id: 'x',
    // a comment with a { brace and don't and a ' quote
    freq: 100.0,
    /* block { comment */
    tagline: 'ok, fine',
    tracks: [] },
]`
  const { fields } = scanObjectFields(src, src.indexOf('{'))
  assert.deepEqual([...fields.keys()], ['id', 'freq', 'tagline', 'tracks'])
  const out = patchStationField(src, 'x', 'freq', 200)
  assert.ok(out.includes('freq: 200.0'))
  assert.ok(out.includes("don't"), 'the comment was damaged')
})

test('matchBracket ignores brackets inside comments and strings', () => {
  const s = `{ a: '}', /* } */ b: 1 } trailing`
  assert.equal(matchBracket(s, 0, '{', '}'), s.indexOf('} trailing'))
})

test('quoteJs round-trips through the parser', () => {
  for (const v of ["plain", "it's", 'say "hi"', `both ' and "`, 'back\\slash']) {
    // eslint-disable-next-line no-eval
    assert.equal(eval(quoteJs(v)), v)
  }
})

test('formatValue refuses what it cannot represent', () => {
  assert.throws(() => formatValue(NaN), /non-finite/)
  assert.throws(() => formatValue(Infinity), /non-finite/)
  assert.throws(() => formatValue(undefined), /Cannot serialize/)
})

test('rewriting a tracks block with its own tracks is byte-identical, every station', () => {
  // Was 1/11 until 2026-08-27. formatTracksBlock() regenerated the array from
  // data, so every save rewrote quote style, re-indented GREEN ROOM (which
  // uses 4 spaces where the rest use 6) and deleted every comment in the
  // block. The first real use of the dashboard's remove button destroyed 33
  // lines of "Nth pass" notes as a side effect of dropping two tracks.
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(SRC)
  const all = [...STATIONS, ...SECRET_STATIONS]
  for (const st of all) {
    assert.equal(
      patchStationTracks(SRC, st.id, st.tracks), SRC,
      `rewriting ${st.id}'s tracks with its existing tracks changed the file`)
  }
  // Spelled out rather than derived, and it has to be updated by hand when a
  // station is added -- which is the point. The loop above passes VACUOUSLY if
  // loadRosterFromText ever returns nothing, so this is the guard that the
  // sweep actually walked a roster. 12 as of THE CRYPT (2026-08-31).
  assert.equal(all.length, 15)
})

test('removing a track keeps every comment not attached to it', () => {
  // The victim is chosen from the roster, not hardcoded: the first version of
  // this test named a specific id, and it broke the moment that track was
  // legitimately curated out. Pick any station that carries comments in its
  // tracks block, then drop an entry that has none of its own -- so a clean
  // run means "every surviving comment survived".
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(SRC)
  let found = null
  for (const st of [...STATIONS, ...SECRET_STATIONS]) {
    const { objStart, objEnd } = findStationObjectRange(SRC, st.id)
    const { openIdx } = findTracksRange(SRC, objStart, objEnd)
    const parsed = parseTracksBlock(SRC, openIdx)
    if (!parsed.entries.some(e => e.comments.some(c => c.trim()))) continue
    const victim = parsed.entries.find(e => e.youtubeId && !e.comments.some(c => c.trim()))
    if (victim) { found = { st, victim }; break }
  }
  assert.ok(found, 'no station has both commented and uncommented track entries')

  const kept = found.st.tracks.filter(t => t.youtubeId !== found.victim.youtubeId)
  assert.equal(kept.length, found.st.tracks.length - 1)
  const r = patchStationTracksDetailed(SRC, found.st.id, kept)
  verifyPatch(r.text, found.st.id, kept.length)
  assert.equal(
    (r.text.match(/\/\//g) || []).length, (SRC.match(/\/\//g) || []).length,
    `removing ${found.victim.youtubeId} from ${found.st.id} lost comment markers`)
  assert.equal(r.droppedComments.length, 0)
})

test('a comment attached to a REMOVED track is dropped, and reported', () => {
  // Dropping it is right -- the note is about that track. Doing it silently
  // is not, so the caller gets the text back to show.
  const src = `const STATIONS = [
  { id: 'x', tracks: [
      // keep me, I belong to the survivor
      realTrack('aaaaaaaaaaa', 'Kept', 'A'),
      // this note is about the doomed one
      realTrack('bbbbbbbbbbb', 'Doomed', 'B'),
    ] },
]`
  const { STATIONS } = loadRosterFromText(src)
  const kept = STATIONS[0].tracks.filter(t => t.youtubeId !== 'bbbbbbbbbbb')
  const r = patchStationTracksDetailed(src, 'x', kept)
  assert.ok(r.text.includes('keep me, I belong to the survivor'), 'survivor lost its comment')
  assert.ok(!r.text.includes('this note is about the doomed one'), 'removed track kept its comment')
  assert.equal(r.droppedComments.length, 1)
  assert.equal(r.droppedComments[0].youtubeId, 'bbbbbbbbbbb')
  assert.match(r.droppedComments[0].comments[0], /doomed one/)
})

test('reordering carries each comment with its own track', () => {
  const { STATIONS } = loadRosterFromText(SRC)
  const cw = STATIONS.find(s => s.id === 'cold-wave')
  const reversed = [...cw.tracks].reverse()
  const r = patchStationTracksDetailed(SRC, 'cold-wave', reversed)
  verifyPatch(r.text, 'cold-wave', reversed.length)
  assert.equal(
    (r.text.match(/\/\//g) || []).length, (SRC.match(/\/\//g) || []).length,
    'reordering lost comment markers')
  assert.equal(r.droppedComments.length, 0)
})

test('block indentation is inferred, not imposed', () => {
  // GREEN ROOM indents entries 4 spaces; everything else uses 6.
  const { SECRET_STATIONS } = loadRosterFromText(SRC)
  const gr = SECRET_STATIONS.find(s => s.id === 'green-room')
  if (!gr) return
  const { objStart, objEnd } = findStationObjectRange(SRC, 'green-room')
  const { openIdx } = findTracksRange(SRC, objStart, objEnd)
  const parsed = parseTracksBlock(SRC, openIdx)
  assert.equal(parsed.itemIndent, '    ', 'green-room should parse as 4-space indented')
  assert.equal(patchStationTracks(SRC, 'green-room', gr.tracks), SRC)
})

test('patchStationTracks writes the tracks it was given', () => {
  const { STATIONS } = loadRosterFromText(SRC)
  const df = STATIONS.find(s => s.id === 'distortion-field')
  const fewer = df.tracks.slice(0, 5)
  const out = patchStationTracks(SRC, 'distortion-field', fewer)
  verifyPatch(out, 'distortion-field', 5)
  const back = loadRosterFromText(out).STATIONS.find(s => s.id === 'distortion-field')
  assert.deepEqual(back.tracks, fewer)
  // and no other station moved
  for (const st of loadRosterFromText(out).STATIONS) {
    if (st.id === 'distortion-field') continue
    assert.deepEqual(st.tracks, STATIONS.find(s => s.id === st.id).tracks)
  }
})

test('an unknown or ambiguous station id is refused, not guessed', () => {
  assert.throws(() => patchStationField(SRC, 'no-such-station', 'gain', 1), /No station/)
  assert.throws(() => patchStationTracks(SRC, 'no-such-station', []), /No station/)
})

test('buildRosterPayload reports the same totals the roster has', () => {
  const p = buildRosterPayload(SRC)
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(SRC)
  const all = [...STATIONS, ...SECRET_STATIONS]
  assert.equal(p.totals.stationCount, all.length)
  assert.equal(p.totals.trackCount, all.reduce((n, s) => n + s.tracks.length, 0))
})

// ---------------------------------------------------------------------
// Mutation checks. Each one breaks a patcher the way a plausible bug would
// and asserts the checks above actually go red. Without these, every test
// in this file would still pass against a patcher that returned its input.
// ---------------------------------------------------------------------

test('MUTATION: a no-op patcher fails the value check', () => {
  const noop = (src) => src
  assert.throws(
    () => verifyPatch(noop(SRC), 'distortion-field', { 'crt.bloomAmt': 1.92 }),
    /crt\.bloomAmt/,
    'verifyPatch passed a patcher that changed nothing -- the check is decorative')
})

test('MUTATION: a patcher that reformats the object fails the idempotence sweep', () => {
  // Stand-in for the obvious wrong implementation: re-serialize the whole
  // station object instead of splicing one value. It parses, it round-trips,
  // every value is right -- and it eats every comment in the object.
  const { STATIONS } = loadRosterFromText(SRC)
  const st = STATIONS.find(s => s.id === 'distortion-field')
  const reformat = (src, id) => {
    const idIdx = src.indexOf(`id: '${id}'`)
    const objStart = src.lastIndexOf('{', idIdx)
    const objEnd = matchBracket(src, objStart, '{', '}')
    const body = Object.entries(st)
      .map(([k, v]) => `${k}: ${k === 'tracks' ? '[]' : formatValue(v)}`).join(', ')
    return src.slice(0, objStart) + `{ ${body} }` + src.slice(objEnd + 1)
  }
  const out = reformat(SRC, 'distortion-field')
  assert.notEqual(out, SRC)
  assert.ok(
    (out.match(/\/\//g) || []).length < (SRC.match(/\/\//g) || []).length,
    'the reformatting stand-in was supposed to lose comments')
})

test('MUTATION: a tracks patcher that regenerates from data loses the comments', () => {
  // Exactly what formatTracksBlock() did before 2026-08-27, reproduced here
  // so the test above cannot quietly stop meaning anything.
  const { STATIONS } = loadRosterFromText(SRC)
  const cw = STATIONS.find(s => s.id === 'cold-wave')
  const naive = '[\n' + cw.tracks.map(t =>
    `      realTrack('${t.youtubeId}', '${t.title}', '${t.artist}'),`).join('\n') + '\n    ]'
  const { objStart, objEnd } = findStationObjectRange(SRC, 'cold-wave')
  const { openIdx, closeIdx } = findTracksRange(SRC, objStart, objEnd)
  const out = SRC.slice(0, openIdx) + naive + SRC.slice(closeIdx + 1)
  assert.ok(
    (out.match(/\/\//g) || []).length < (SRC.match(/\/\//g) || []).length,
    'the regenerate-from-data stand-in was supposed to lose comments')
})

test('MUTATION: dropping style inference fails the trailing-.0 check', () => {
  // What the first version of formatValue did.
  const naive = (n) => String(n)
  assert.equal(naive(1.0), '1')
  assert.notEqual(naive(1.0), '1.0',
    'if these were equal the identTempo: 1.0 regression would be untestable')
})
