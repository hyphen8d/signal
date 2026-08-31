// SIGNAL -- stations.js as text: read it, patch it, prove the patch.
//
// 2026-08-27, admin-backend pass. This is the file tools/network.html's own
// header says used to exist and was deleted when that dashboard went
// serverless: the parse/patch logic got copied into the page, and the copy
// promptly went stale against stations.js (a hardcoded secret-station name
// it no longer had), which broke the dashboard. It is extracted again here
// for the third consumer -- tools/admin-server.mjs -- with one rule that
// makes the re-extraction worth anything: NOBODY gets their own copy. The
// page imports this module, the server imports this module.
//
// Which is why there is not a single `node:` import below. This module is
// plain ESM with no platform surface, so `import` works identically from
// tools/admin-server.mjs and from a <script type="module"> in the browser.
// Anything needing the filesystem belongs in the caller. Keep it that way:
// one `import { readFileSync }` here and the page stops loading.
//
// The two patchers are the point of the file:
//   patchStationTracks()  -- rewrites a `tracks: [...]` block wholesale.
//                            Comments inside that block do not survive; they
//                            never did, and the block is generated data.
//   patchStationField()   -- rewrites ONE field's value and touches nothing
//                            else, byte for byte. This one exists because
//                            the identity fields (crt, meter, ident, glyph,
//                            visual...) are wrapped in the "Nth pass" notes
//                            that are this repo's actual design record. A
//                            reformat-the-object patcher would quietly eat
//                            them the first time someone dragged a slider.

// ---------------------------------------------------------------------
// Lexical scanning
//
// The old brace-matcher counted { and } over raw text with no notion of
// strings or comments. It survived on luck: stations.js happens not to have
// a brace inside a comment or a string. The identity editor removes that
// luck -- it writes `desc:` and `tagline:` strings straight from a text
// input -- so everything below skips comments FIRST, then strings. That
// order matters and is not cosmetic: comments here are full of apostrophes
// ("doesn't", "station's"), and a string-first scanner reads the first of
// those as an opening quote and desynchronises for the rest of the file.
// ---------------------------------------------------------------------

/** Advance past whitespace and both comment forms. Returns the new index. */
export function skipTrivia(src, i, end = src.length) {
  for (;;) {
    while (i < end && /\s/.test(src[i])) i++
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < end && src[i] !== '\n') i++
      continue
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j === -1 ? end : j + 2
      continue
    }
    return i
  }
}

/** Advance past one string literal (i must be on the opening quote). */
export function skipString(src, i, end = src.length) {
  const q = src[i]
  i++
  while (i < end) {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === q) return i + 1
    i++
  }
  throw new Error('Unterminated string literal in stations.js')
}

/** Comment- and string-aware bracket matcher. Returns the index of the
 *  closing bracket, or -1. Replaces the naive counter described above. */
export function matchBracket(src, openIdx, openCh, closeCh) {
  let depth = 0
  let i = openIdx
  const end = src.length
  while (i < end) {
    const c = src[i]
    if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipTrivia(src, i, end); continue }
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i, end); continue }
    if (c === openCh) { depth++; i++; continue }
    if (c === closeCh) { depth--; if (depth === 0) return i; i++; continue }
    i++
  }
  return -1
}

/** Advance past one value, stopping ON the comma or the closing bracket
 *  that terminates it at this nesting level. */
function skipValue(src, i, end) {
  let depth = 0
  while (i < end) {
    const c = src[i]
    if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipTrivia(src, i, end); continue }
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i, end); continue }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue }
    if (c === '}' || c === ']' || c === ')') {
      if (depth === 0) return i
      depth--; i++; continue
    }
    if (c === ',' && depth === 0) return i
    i++
  }
  return i
}

/** Every top-level field of the object literal opening at objStart, with the
 *  exact source range of its key and of its value. The ranges are what let
 *  patchStationField() splice a value out without reformatting its
 *  neighbours or their comments. */
export function scanObjectFields(src, objStart) {
  if (src[objStart] !== '{') throw new Error('scanObjectFields: index is not an object literal')
  const objEnd = matchBracket(src, objStart, '{', '}')
  if (objEnd === -1) throw new Error('scanObjectFields: unbalanced braces')
  const fields = new Map()
  let i = objStart + 1
  while (i < objEnd) {
    i = skipTrivia(src, i, objEnd)
    if (i >= objEnd) break
    if (src[i] === ',') { i++; continue }
    const keyStart = i
    let key
    if (src[i] === "'" || src[i] === '"') {
      const after = skipString(src, i, objEnd)
      key = src.slice(i + 1, after - 1)
      i = after
    } else {
      while (i < objEnd && /[A-Za-z0-9_$]/.test(src[i])) i++
      key = src.slice(keyStart, i)
    }
    if (!key) break
    i = skipTrivia(src, i, objEnd)
    if (src[i] !== ':') {
      // Shorthand or spread -- stations.js has neither, but skip rather
      // than throw so an unrelated future edit can't brick the dashboard.
      i = skipValue(src, i, objEnd)
      continue
    }
    i++
    const valStart = skipTrivia(src, i, objEnd)
    const valEnd = skipValue(src, valStart, objEnd)
    fields.set(key, { keyStart, valStart, valEnd, objEnd })
    i = valEnd
  }
  return { fields, objEnd }
}

// ---------------------------------------------------------------------
// Reading the roster out of source text
// ---------------------------------------------------------------------

export function realTrack(youtubeId, title, artist) {
  return { id: `yt:${youtubeId}:real`, youtubeId, title, artist }
}

export function extractLiteral(src, declNeedle, openCh, closeCh) {
  const declIdx = src.indexOf(declNeedle)
  if (declIdx === -1) throw new Error(`"${declNeedle}" not found in stations.js`)
  const openIdx = src.indexOf(openCh, declIdx)
  const closeIdx = matchBracket(src, openIdx, openCh, closeCh)
  if (closeIdx === -1) throw new Error(`Unbalanced ${openCh}${closeCh} reading "${declNeedle}"`)
  return src.slice(openIdx, closeIdx + 1)
}

// Secret stations are declared as named objects and only then combined into
// `const SECRET_STATIONS = [NIN_STATION]` -- a reference array, not a
// literal one, so it cannot be eval'd standalone. Each name is extracted
// separately and each extraction is OPTIONAL: a name listed here that
// stations.js no longer declares is skipped, not thrown. That is deliberate
// and load-bearing -- a hardcoded required name going stale against
// stations.js is the exact bug that broke tools/network.html once
// (GREEN_HOUSE_STATION, built and pulled before shipping). Add a new secret
// station's name to this list; never make one mandatory.
export const SECRET_STATION_NAMES = ['NIN_STATION', 'GREEN_HOUSE_STATION', 'GREEN_ROOM_STATION']

export function loadRosterFromText(src) {
  const stationsText = extractLiteral(src, 'const STATIONS = [', '[', ']')
  // eslint-disable-next-line no-eval
  const STATIONS = eval(stationsText)
  const SECRET_STATIONS = []
  for (const name of SECRET_STATION_NAMES) {
    try {
      const text = extractLiteral(src, `const ${name} = {`, '{', '}')
      // eslint-disable-next-line no-eval
      SECRET_STATIONS.push(eval('(' + text + ')'))
    } catch (e) { /* not declared in stations.js right now -- fine */ }
  }
  return { STATIONS, SECRET_STATIONS }
}

export function findStationObjectRange(src, stationId) {
  const idNeedle = `id: '${stationId}'`
  const idIdx = src.indexOf(idNeedle)
  if (idIdx === -1) throw new Error(`No station with id "${stationId}" found in stations.js`)
  if (src.indexOf(idNeedle, idIdx + 1) !== -1) {
    throw new Error(`"${idNeedle}" appears more than once -- refusing to guess which station`)
  }
  const objStart = src.lastIndexOf('{', idIdx)
  if (objStart === -1) throw new Error(`Could not find opening brace before ${idNeedle}`)
  const objEnd = matchBracket(src, objStart, '{', '}')
  if (objEnd === -1) throw new Error(`Unbalanced braces for station "${stationId}"`)
  return { objStart, objEnd }
}

// ---------------------------------------------------------------------
// Writing values back as source text
// ---------------------------------------------------------------------

// `prefer` keeps a rewritten string in the quote style it was already
// written in. stations.js is not consistent about this and has no reason to
// be -- most strings are single-quoted, four freqNotes carry an escaped
// apostrophe (`'Tokyo\\'s ...'`) and GREEN ROOM's desc is double-quoted --
// so a formatter with its own opinion rewrites five lines it was not asked
// to touch. Caught by the same idempotence sweep that caught the numbers.
export function quoteJs(str, prefer) {
  const s = String(str)
  const esc = (q) => q + s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q) + q
  if (prefer === "'" || prefer === '"') return esc(prefer)
  if (!s.includes("'")) return esc("'")
  if (!s.includes('"')) return esc('"')
  return JSON.stringify(s)
}

// House style keeps ident tones and gains as one-decimal floats (392.0, not
// 392) because they are pitches and levels, not counts -- String(392.0) is
// "392" and would silently restyle every ident array the first time one was
// edited. Anything already fractional prints as-is.
function formatNumber(n, oneDecimal = false) {
  if (!Number.isFinite(n)) throw new Error(`Refusing to write non-finite number: ${n}`)
  if (oneDecimal && Number.isInteger(n)) return n.toFixed(1)
  return String(n)
}

/** Serialize a JS value as stations.js-style source text. */
export function formatValue(value, opts = {}) {
  if (typeof value === 'string') return quoteJs(value, opts.preferQuote)
  if (typeof value === 'number') return formatNumber(value, opts.oneDecimal)
  if (typeof value === 'boolean') return String(value)
  // preferQuote is inferred from ONE literal, so it only applies to that
  // literal -- a nested string inside an array/object gets the default rules.
  const nested = { ...opts, preferQuote: undefined }
  if (Array.isArray(value)) {
    return '[' + value.map(v => formatValue(v, nested)).join(', ') + ']'
  }
  if (value && typeof value === 'object') {
    const inner = Object.entries(value)
      .map(([k, v]) => `${k}: ${formatValue(v, nested)}`)
      .join(', ')
    return inner ? `{ ${inner} }` : '{}'
  }
  throw new Error(`Cannot serialize value of type ${typeof value}`)
}

const ITEM_INDENT = '      '
const CLOSE_INDENT = '    '

export function trackLine(t) {
  return `realTrack(${quoteJs(t.youtubeId)}, ${quoteJs(t.title)}, ${quoteJs(t.artist)}),`
}

/** Split an existing `tracks: [...]` block into entries, each carrying the
 *  comment lines that sit above it and its own source text.
 *
 *  2026-08-27. This exists because the old formatTracksBlock() regenerated
 *  the whole array from data, which threw away every comment inside it. That
 *  was tolerable while the block was only edited by hand; it stopped being
 *  tolerable the moment the dashboard made removing a track a two-click
 *  operation. The first real use of it destroyed 33 lines of "Nth pass"
 *  notes -- the batch-approval record for two stations and an issue-#19 swap
 *  rationale -- as a side effect of dropping two tracks. Those notes are the
 *  design record this repo runs on, and nothing else holds them. */
export function parseTracksBlock(src, openIdx) {
  const closeIdx = matchBracket(src, openIdx, '[', ']')
  if (closeIdx === -1) throw new Error('Unbalanced tracks array')
  const entries = []
  let i = openIdx + 1
  while (i < closeIdx) {
    const triviaStart = i
    i = skipTrivia(src, i, closeIdx)
    if (i >= closeIdx) break
    // Comment lines between the previous entry and this one, kept with their
    // ORIGINAL indentation. Normalizing them to the item indent re-indented
    // GREEN ROOM's 4-space block comment to 6 and showed up as a diff on a
    // line nobody edited -- the same class of unasked-for restyle the field
    // patcher exists to avoid. The first and last split lines are the tail
    // of the previous line and this line's own indentation, not content.
    const trivia = src.slice(triviaStart, i).split('\n').slice(1, -1)
    const entryStart = i
    i = skipValue(src, i, closeIdx)
    let entryEnd = i
    if (src[entryEnd] === ',') entryEnd++
    const text = src.slice(entryStart, entryEnd).trim()
    // Parsed rather than regexed, so an escaped quote inside a title cannot
    // desynchronise the id -- and so the caller can compare tracks by VALUE.
    let parsed = null
    try { parsed = eval(text.replace(/,\s*$/, '')) } catch (e) { /* leave null */ }
    const lineStart = src.lastIndexOf('\n', entryStart) + 1
    const lead = src.slice(lineStart, entryStart)
    entries.push({
      youtubeId: parsed?.youtubeId ?? null, track: parsed, text, comments: trivia,
      indent: /^\s*$/.test(lead) ? lead : null,
    })
    i = entryEnd
  }
  // Indentation is INFERRED from the block, not imposed. GREEN ROOM indents
  // its entries 4 spaces where every other station uses 6, and a hardcoded
  // house indent silently reformatted all 28 of its lines.
  const itemIndent = entries.find(e => e.indent != null)?.indent ?? ITEM_INDENT
  const closeLineStart = src.lastIndexOf('\n', closeIdx) + 1
  const closeLead = src.slice(closeLineStart, closeIdx)
  const closeIndent = /^\s*$/.test(closeLead) ? closeLead : CLOSE_INDENT
  return { entries, closeIdx, itemIndent, closeIndent }
}

/** Rebuild a tracks block, carrying each surviving track's comments with it.
 *
 *  Comments are keyed to the track they sit above, by youtubeId. A track you
 *  kept keeps its notes; a track you removed takes its own notes with it,
 *  which is usually right -- but the count comes back to the caller so it can
 *  be REPORTED rather than happening silently. An unchanged track's line is
 *  reused verbatim rather than regenerated, so quote style survives too
 *  (`'Don\'t Go'` must not come back as `"Don't Go"`). */
export function formatTracksBlock(tracks, previous = null) {
  const byId = new Map()
  if (previous) for (const e of previous.entries) if (e.youtubeId) byId.set(e.youtubeId, e)
  const itemIndent = previous?.itemIndent ?? ITEM_INDENT
  const closeIndent = previous?.closeIndent ?? CLOSE_INDENT

  const out = []
  const kept = []
  for (const t of tracks) {
    const prev = byId.get(t.youtubeId)
    if (prev?.comments?.length) {
      for (const c of prev.comments) out.push(c)
      if (prev.comments.some(c => c.trim())) kept.push(t.youtubeId)
    }
    // Reuse the original text when nothing about the track changed; only
    // then is it guaranteed to still say what it said. Compared by VALUE, not
    // by rendered text -- stations.js writes `'Don\\'t Go'` where quoteJs
    // would write `\"Don't Go\"`, and a text comparison calls that a change
    // and restyles the line.
    const unchanged = prev?.track
      && prev.track.youtubeId === t.youtubeId
      && prev.track.title === t.title
      && prev.track.artist === t.artist
    out.push(itemIndent + (unchanged ? prev.text : trackLine(t)))
  }

  const survivors = new Set(tracks.map(t => t.youtubeId))
  const dropped = []
  if (previous) {
    for (const e of previous.entries) {
      if (e.youtubeId && !survivors.has(e.youtubeId) && e.comments.some(c => c.trim())) {
        dropped.push({ youtubeId: e.youtubeId, comments: e.comments.filter(c => c.trim()).map(c => c.trim()) })
      }
    }
  }

  return {
    text: '[\n' + out.join('\n') + '\n' + closeIndent + ']',
    keptComments: kept.length,
    droppedComments: dropped,
  }
}

// ---------------------------------------------------------------------
// The patchers
// ---------------------------------------------------------------------

export function findTracksRange(src, objStart, objEnd) {
  const { fields } = scanObjectFields(src, objStart)
  const f = fields.get('tracks')
  if (!f) throw new Error('No "tracks:" field found in station object')
  if (src[f.valStart] !== '[') throw new Error('"tracks:" is not an array literal')
  const closeIdx = matchBracket(src, f.valStart, '[', ']')
  if (closeIdx === -1 || closeIdx > objEnd) throw new Error('Unbalanced tracks array')
  return { openIdx: f.valStart, closeIdx }
}

/** Pure: text in, patched text out. No IO -- the caller decides whether to
 *  write, and must not write if verifyPatch() throws. */
export function patchStationTracks(src, stationId, tracks) {
  return patchStationTracksDetailed(src, stationId, tracks).text
}

/** Same patch, but also reports which comments were carried across and which
 *  went with a removed track. The dashboard shows the second list. */
export function patchStationTracksDetailed(src, stationId, tracks) {
  const { objStart, objEnd } = findStationObjectRange(src, stationId)
  const { openIdx, closeIdx } = findTracksRange(src, objStart, objEnd)
  const previous = parseTracksBlock(src, openIdx)
  const built = formatTracksBlock(tracks, previous)
  return {
    text: src.slice(0, openIdx) + built.text + src.slice(closeIdx + 1),
    keptComments: built.keptComments,
    droppedComments: built.droppedComments,
  }
}

/** Resolve a dotted path ('crt.bloomAmt') to the source range of its value,
 *  plus the range of the object that holds it. */
function resolveFieldPath(src, objStart, fieldPath) {
  const parts = String(fieldPath).split('.')
  let holderStart = objStart
  for (let i = 0; i < parts.length; i++) {
    const { fields, objEnd } = scanObjectFields(src, holderStart)
    const f = fields.get(parts[i])
    const last = i === parts.length - 1
    if (!f) return { missing: true, holderStart, holderEnd: objEnd, key: parts[i], depth: i, last }
    if (last) return { missing: false, ...f, holderStart, holderEnd: objEnd }
    if (src[f.valStart] !== '{') {
      throw new Error(`Path "${fieldPath}": "${parts[i]}" is not an object`)
    }
    holderStart = f.valStart
  }
  throw new Error(`Empty field path`)
}

/** Rewrite exactly one field's value. Every other byte of the file --
 *  including the "Nth pass" comments sitting between the fields -- is
 *  preserved verbatim. Pass value === null to REMOVE the field.
 *
 *  Inserts the field if it is not already there, so the identity editor can
 *  set e.g. crt.chroma on a station whose crt block never had one. Insertion
 *  goes just before the holder's closing brace, which for the inline
 *  `crt: { ... }` / `meter: { ... }` objects is the only sensible place. */
export function patchStationField(src, stationId, fieldPath, value, opts = {}) {
  const { objStart } = findStationObjectRange(src, stationId)
  const hit = resolveFieldPath(src, objStart, fieldPath)

  if (hit.missing) {
    if (value === null || value === undefined) return src   // removing an absent field: no-op
    const key = hit.key
    const text = formatValue(value, opts)
    const holderEnd = hit.holderEnd
    // Inline object (`{ a: 1, b: 2 }`) vs. multi-line: match what's there.
    const holderText = src.slice(hit.holderStart, holderEnd + 1)
    const inline = !holderText.includes('\n')
    if (inline) {
      const before = src.slice(0, holderEnd).replace(/\s+$/, '')
      const empty = /\{$/.test(before)
      return before + (empty ? ` ${key}: ${text} ` : `, ${key}: ${text} `) + src.slice(holderEnd)
    }
    // Multi-line holder: copy the indentation of the line the closing brace
    // sits on and add one level.
    const lineStart = src.lastIndexOf('\n', holderEnd) + 1
    const closeIndent = src.slice(lineStart, holderEnd).match(/^\s*/)[0]
    return src.slice(0, lineStart) + `${closeIndent}  ${key}: ${text},\n` + src.slice(lineStart)
  }

  if (value === null || value === undefined) {
    // Remove the field, its trailing comma, and -- if it had a line to
    // itself -- that line's leading indentation and newline, so removal
    // doesn't leave a blank gutter behind.
    let start = hit.keyStart
    let end = hit.valEnd
    // skipValue() stops ON the terminator, so for the last field of an
    // inline object `end` currently includes the space before the `}`.
    // Trim back to the value's real last character first; every decision
    // below depends on knowing exactly where it ended.
    while (end > start && /\s/.test(src[end - 1])) end--
    if (src[end] === ',') {
      end++
      // `{ noise: 0.19, bloomAmt: ... }` minus noise must not leave the
      // double space behind that the removed field's own separator held.
      while (src[end] === ' ' || src[end] === '\t') end++
    } else {
      // No comma after us means we were the LAST field, and cutting here
      // would leave `{ noise: 0.19, bloomAmt: 1.75, }` -- legal JS, but a
      // restyled line nobody asked for, and not restyling lines is this
      // patcher's entire job. Eat the comma that came BEFORE us instead.
      let back = start
      while (back > 0 && /\s/.test(src[back - 1])) back--
      if (src[back - 1] === ',') start = back - 1
    }
    const lineStart = src.lastIndexOf('\n', start) + 1
    if (src.slice(lineStart, start).trim() === '') {
      let after = end
      while (after < src.length && (src[after] === ' ' || src[after] === '\t')) after++
      if (src[after] === '\n') { start = lineStart; end = after + 1 }
    }
    return src.slice(0, start) + src.slice(end)
  }

  // Style is INFERRED from the literal being replaced, not demanded of the
  // caller. stations.js writes pitches, gains and frequencies as one-decimal
  // floats (`gain: 1.0`, `ident: [392.0, ...]`, `freq: 321.0`) and counts as
  // bare integers (`static: 1900`). String(1.0) is "1", so a caller who
  // forgot an option would have quietly restyled four stations' gains the
  // first time anyone touched them -- which is exactly what the first
  // version of this function did, caught by an idempotence check over the
  // real roster. If the old literal used a decimal point anywhere, the new
  // one does too; oneDecimal only ever affects integral values, so a
  // genuinely fractional 0.19 is unaffected either way.
  // skipValue() stops ON the terminator, so for the LAST key of an inline
  // object (`{ a: 1, b: 1.6 }`) the value range runs to the `}` and includes
  // the space before it. Replacing that range wholesale wrote `b: 2.0}` --
  // valid JS, wrong style, and a line restyled without being asked. Trim the
  // range back to the value's last real character and let the whitespace
  // ride along in the suffix. The idempotence sweep did not catch this
  // because it rewrote `crt` as a whole object, where the trailing space is
  // inside the value on both sides; a headless load of the dashboard did,
  // in the diff preview. Nested leaf paths are in the sweep now too.
  let valEnd = hit.valEnd
  while (valEnd > hit.valStart && /\s/.test(src[valEnd - 1])) valEnd--
  const oldText = src.slice(hit.valStart, valEnd)
  const inferred = /\d\.\d/.test(oldText) ? { oneDecimal: true } : {}
  if (oldText[0] === "'" || oldText[0] === '"') inferred.preferQuote = oldText[0]
  const text = formatValue(value, { ...inferred, ...opts })
  return src.slice(0, hit.valStart) + text + src.slice(valEnd)
}

// ---------------------------------------------------------------------
// Proving the patch before anything is written
// ---------------------------------------------------------------------

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(k => deepEqual(a[k], b[k]))
}

function getPath(obj, fieldPath) {
  return String(fieldPath).split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

/** Re-runs the SAME extraction used to read the roster against the patched
 *  text. A round-trip that yields the value we meant to write means the
 *  patch is structurally sound. Throws otherwise -- callers must not write.
 *
 *  Deliberately checks the VALUE, not just that parsing succeeded. A
 *  "did it re-parse?" check passes for a patcher that writes nothing at
 *  all, which is the decorative-test shape this repo has already paid for
 *  once (see CLAUDE.md on the STATION BREAK). tests/roster-lib.test.mjs
 *  neuters each patcher on purpose to confirm this actually goes red. */
export function verifyPatch(newSrc, stationId, expect) {
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(newSrc)
  const st = [...STATIONS, ...SECRET_STATIONS].find(s => s.id === stationId)
  if (!st) throw new Error(`Post-patch check: station "${stationId}" not found`)
  if (typeof expect === 'number') {
    if (st.tracks.length !== expect) {
      throw new Error(`Post-patch check: expected ${expect} tracks, found ${st.tracks.length}`)
    }
    return true
  }
  for (const [fieldPath, want] of Object.entries(expect || {})) {
    const got = getPath(st, fieldPath)
    if (want === null) {
      if (got !== undefined) throw new Error(`Post-patch check: "${fieldPath}" should be gone, found ${JSON.stringify(got)}`)
      continue
    }
    if (!deepEqual(got, want)) {
      throw new Error(`Post-patch check: "${fieldPath}" is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
    }
  }
  return true
}

// ---------------------------------------------------------------------
// stations.md generator -- must stay identical to tools/stations-to-md.js.
// ---------------------------------------------------------------------

/** The stations.md snapshot. THE ONLY COPY -- tools/stations-to-md.js used to
 *  carry a byte-identical duplicate of this loop and was the one actually run
 *  from the command line, so a change here reached the dashboard and not the
 *  CLI. It imports this now.
 *
 *  Grouped by band as of 2026-08-31, which is not cosmetic: without it the
 *  file lists 1234.0 directly beneath 133.7 with nothing to say why, and a
 *  reader has no way to know those two are not on the same dial.
 *
 *  Band labels are derived by upper-casing the key rather than imported from
 *  tuning.js, deliberately: this module has NO imports at all -- that is what
 *  lets tools/network.html load it in a browser -- and adding one to print a
 *  two-letter heading would break the dashboard to save nothing. */
export function buildStationsMd(STATIONS) {
  const lines = []
  lines.push('# SIGNAL -- station roster')
  lines.push('')
  lines.push(`Generated from stations.js. ${STATIONS.length} stations, ${STATIONS.reduce((n, c) => n + c.tracks.length, 0)} tracks total.`)
  lines.push('')
  const bands = []
  for (const st of STATIONS) if (!bands.includes(st.band)) bands.push(st.band)
  const multi = bands.length > 1
  for (const band of bands) {
    const onBand = STATIONS.filter((st) => st.band === band).sort((a, b) => a.freq - b.freq)
    if (multi) {
      lines.push(`# ${String(band).toUpperCase()} band`)
      lines.push('')
      lines.push(`${onBand.length} stations, ${onBand.reduce((n, c) => n + c.tracks.length, 0)} tracks. Its own dial, its own \`1\`-\`9\` presets.`)
      lines.push('')
    }
    for (const st of onBand) {
      lines.push(`## ${st.callsign} -- ${st.freq.toFixed(1)}`)
      lines.push('')
      lines.push(`*${st.tagline}*`)
      lines.push('')
      lines.push(`Ident tones (Hz): ${st.ident.join(', ')}`)
      lines.push('')
      lines.push(`Tracks (${st.tracks.length}):`)
      lines.push('')
      st.tracks.forEach((t, i) => {
        lines.push(`${i + 1}. **${t.title}** -- ${t.artist}  ([youtu.be/${t.youtubeId}](https://youtu.be/${t.youtubeId}))`)
      })
      lines.push('')
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------
// Roster stats / payload
// ---------------------------------------------------------------------

const TAGLINE_RE = /^[^,]+,\s*[^,]+$/

export function statsFor(station) {
  const artists = new Set(station.tracks.map(t => t.artist))
  return {
    trackCount: station.tracks.length,
    artistCount: artists.size,
    taglineOk: TAGLINE_RE.test((station.tagline || '').trim()),
    hasFreqNote: !!station.freqNote,
    hasGlyph: !!station.glyph,
    visual: station.visual || null,
  }
}

export function buildRosterPayload(src) {
  const { STATIONS, SECRET_STATIONS } = loadRosterFromText(src)
  const all = [...STATIONS, ...SECRET_STATIONS]
  const artistIndex = new Map()
  const idIndex = new Map()
  for (const st of all) {
    for (const t of st.tracks) {
      if (!artistIndex.has(t.artist)) artistIndex.set(t.artist, new Set())
      artistIndex.get(t.artist).add(st.id)
      if (!idIndex.has(t.youtubeId)) idIndex.set(t.youtubeId, [])
      idIndex.get(t.youtubeId).push({ stationId: st.id, title: t.title })
    }
  }
  const overlaps = [...artistIndex.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([artist, ids]) => ({ artist, stations: [...ids] }))
    .sort((a, b) => b.stations.length - a.stations.length)
  const dupeIds = [...idIndex.entries()]
    .filter(([, hits]) => hits.length > 1)
    .map(([youtubeId, hits]) => ({ youtubeId, hits }))
  return {
    stations: STATIONS.map(st => ({ ...st, secret: false, stats: statsFor(st) })),
    secretStations: SECRET_STATIONS.map(st => ({ ...st, secret: true, stats: statsFor(st) })),
    totals: {
      stationCount: STATIONS.length + SECRET_STATIONS.length,
      trackCount: all.reduce((n, s) => n + s.tracks.length, 0),
      uniqueArtists: artistIndex.size,
    },
    overlaps,
    dupeIds,
  }
}
