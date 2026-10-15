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
//   patchStationTracks()  -- rebuilds a `tracks: [...]` block from a list,
//                            carrying every comment in it (with its track, or
//                            in place) and REPORTING any that go with a
//                            removed track. (This line used to say comments
//                            "do not survive"; that stopped being true
//                            2026-08-27 and, for the last four shapes it
//                            missed, 2026-10-15 -- see parseTracksBlock.)
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

/** The index just past the last CODE character in [start, end) -- trailing
 *  whitespace AND comments excluded.
 *
 *  2026-10-15 (admin audit, MED-4). skipValue() stops on the terminator, so
 *  a value's range runs over any comment between it and that terminator.
 *  Trimming only whitespace off it (what the patchers did) left the comment
 *  INSIDE the range: `swing: 0.9 // note` before a `}` was replaced
 *  wholesale and the note deleted, and `maxS: 31 /* was 2.5 *\/` had its
 *  number style inferred from the comment's digits and came back `31.0`.
 *  Every "where does this value really end" question now asks this. */
export function codeEnd(src, start, end) {
  let i = start
  let last = start
  while (i < end) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipTrivia(src, i, end); continue }
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i, end); last = i; continue }
    i++
    last = i
  }
  return last
}

/** Scan the trivia that sits on the SAME line from i: spaces, tabs, and any
 *  comment that starts on this line (a block comment may run past it). With
 *  allowComma, one comma is consumed too and its position reported. Stops
 *  ON the newline, the next code character, or end. */
function sameLineTrivia(src, i, end, allowComma) {
  let comma = -1
  for (;;) {
    while (i < end && (src[i] === ' ' || src[i] === '\t' || src[i] === '\r')) i++
    if (i >= end) return { end, comma }
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < end && src[i] !== '\n') i++
      continue
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j === -1 || j + 2 > end ? end : j + 2
      continue
    }
    if (allowComma && comma === -1 && src[i] === ',') { comma = i; i++; continue }
    return { end: i, comma }
  }
}

/** Every `const NAME =` declaration that sits in CODE -- not in a comment,
 *  not in a string -- mapped to the index of its value's first character.
 *
 *  2026-10-15 (admin audit, LOW-4). extractLiteral() used to be a raw
 *  indexOf, so the first occurrence ANYWHERE won, comments included: a note
 *  reading `// was: const NIN_STATION = {}` became an empty NIN station
 *  that crashed buildRosterPayload on its missing tracks. One pass over the
 *  file, with the same comments-first skipping matchBracket uses, answers
 *  every declaration lookup a load needs; it is memoised on the source text
 *  because the patchers verify by re-loading, and the idempotence sweep
 *  does that a few hundred times over the same file. */
let declMemo = { src: null, decls: null }
export function scanDeclarations(src) {
  if (declMemo.src === src) return declMemo.decls
  const decls = new Map()
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipTrivia(src, i, n); continue }
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i, n); continue }
    if (c === 'c' && src.startsWith('const', i) && !/[A-Za-z0-9_$]/.test(src[i - 1] || '')) {
      const m = /^const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/.exec(src.slice(i, i + 200))
      if (m) {
        if (!decls.has(m[1])) decls.set(m[1], i + m[0].length)
        i += m[0].length
        continue
      }
    }
    i++
  }
  declMemo = { src, decls }
  return decls
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

/** The literal a `const NAME = ...` declaration opens, read from CODE only
 *  (see scanDeclarations -- a declaration quoted in a comment is not one).
 *  `declNeedle` keeps its old shape, e.g. 'const STATIONS = [', so existing
 *  callers do not change; the name is read out of it. */
export function extractLiteral(src, declNeedle, openCh, closeCh) {
  const name = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(declNeedle)?.[1]
  const valIdx = name ? scanDeclarations(src).get(name) : undefined
  if (valIdx === undefined) throw new Error(`"${declNeedle}" not found in stations.js`)
  if (src[valIdx] !== openCh) {
    throw new Error(`"${name}" is declared in stations.js but is not a ${openCh}${closeCh} literal`)
  }
  const closeIdx = matchBracket(src, valIdx, openCh, closeCh)
  if (closeIdx === -1) throw new Error(`Unbalanced ${openCh}${closeCh} reading "${declNeedle}"`)
  return src.slice(valIdx, closeIdx + 1)
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
    // 2026-10-15 (admin audit, LOW-4) -- ABSENT and BROKEN are no longer the
    // same thing. Both used to land in one bare catch, so a secret station
    // with a typo in it vanished from the roster and the next save reported
    // `station "nin" not found` -- true, and no help at all. Absent is still
    // skipped (the stale-name rule above is load-bearing); a declaration that
    // is present in code and will not read is now an error that says so.
    if (!scanDeclarations(src).has(name)) continue
    const text = extractLiteral(src, `const ${name} = {`, '{', '}')
    let station
    try {
      // eslint-disable-next-line no-eval
      station = eval('(' + text + ')')
    } catch (e) {
      throw new Error(`${name} is declared in stations.js but could not be read: ${e.message}`)
    }
    SECRET_STATIONS.push(station)
  }
  return { STATIONS, SECRET_STATIONS }
}

/** Read a field's literal as a plain string, or null if it is not one. */
function stringLiteralAt(src, f) {
  const lit = src.slice(f.valStart, codeEnd(src, f.valStart, f.valEnd))
  if (!/^(['"]).*\1$/s.test(lit)) return null
  // eslint-disable-next-line no-eval
  try { const v = eval(lit); return typeof v === 'string' ? v : null } catch (e) { return null }
}

/** The opening brace of every station-shaped object: each element of the
 *  STATIONS array literal, plus every `const X = { ... }` declared in code
 *  (the secret stations, and anything else -- only an `id` field matching
 *  is ever acted on). */
function stationObjectStarts(src) {
  const starts = []
  const decls = scanDeclarations(src)
  const arrOpen = decls.get('STATIONS')
  if (arrOpen !== undefined && src[arrOpen] === '[') {
    const arrEnd = matchBracket(src, arrOpen, '[', ']')
    let i = arrOpen + 1
    while (arrEnd !== -1 && i < arrEnd) {
      i = skipTrivia(src, i, arrEnd)
      if (i >= arrEnd) break
      if (src[i] === ',') { i++; continue }
      if (src[i] === '{') starts.push(i)
      const next = skipValue(src, i, arrEnd)
      i = next > i ? next : i + 1
    }
  }
  for (const [name, at] of decls) if (name !== 'STATIONS' && src[at] === '{') starts.push(at)
  return starts
}

/** The source range of one station's object literal, found by its `id`.
 *
 *  2026-10-15 (admin audit, LOW-3) -- this was a raw substring search for
 *  `id: '<stationId>'`, then lastIndexOf('{') back from the hit. Two ways
 *  that went wrong: a track TITLE (or a comment) containing `id: 'nin'`
 *  made the needle appear twice and NIN refused every save as ambiguous; and
 *  lastIndexOf('{') only finds the station's own brace while `id` is the
 *  object's first key. It now walks the structure -- STATIONS' elements and
 *  the declared objects -- and asks each one's real `id` field, through the
 *  same comment- and string-aware scanner the patchers use. */
export function findStationObjectRange(src, stationId) {
  const hits = []
  for (const objStart of stationObjectStarts(src)) {
    const { fields, objEnd } = scanObjectFields(src, objStart)
    const f = fields.get('id')
    if (f && stringLiteralAt(src, f) === stationId) hits.push({ objStart, objEnd })
  }
  if (!hits.length) throw new Error(`No station with id "${stationId}" found in stations.js`)
  if (hits.length > 1) {
    throw new Error(`id '${stationId}' appears on more than one station -- refusing to guess which`)
  }
  return hits[0]
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
  // 2026-10-15 (admin audit) -- control characters and the two JS line
  // terminators are escaped too. A raw newline inside a quoted literal is a
  // SyntaxError, so a tagline with one in it produced a stations.js that no
  // longer parsed (verifyPatch refused it, but only after the fact).
  const ctl = (t) => t.replace(/[\u0000-\u001f\u2028\u2029]/g, (c) =>
    ({ '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  const esc = (q) => q + ctl(s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q)) + q
  if (prefer === "'" || prefer === '"') return esc(prefer)
  if (!s.includes("'")) return esc("'")
  if (!s.includes('"')) return esc('"')
  return JSON.stringify(s)
}

// 2026-10-15 (admin audit, H1) -- every KEY these patchers write must be a
// plain identifier. Keys were written into the source raw, and the server
// then eval()s the patched text (loadRosterFromText, via verifyPatch) to
// check it -- so a field named `zz: import("node:fs")...` ran in the server
// process BEFORE the check refused the save. Values were always safe
// (quoteJs / formatNumber produce literals only); keys were the hole, in
// both the fieldPath and any nested object's keys. Thrown here, in the one
// layer both the server and the dashboard go through, rather than in the
// route, so no future caller can reintroduce it by skipping a check.
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/
export function assertIdentifier(key) {
  if (typeof key !== 'string' || !IDENT_RE.test(key) || key === '__proto__') {
    throw new Error(`Refusing to write non-identifier key: ${JSON.stringify(key)}`)
  }
  return key
}

// House style keeps ident tones and gains as one-decimal floats (392.0, not
// 392) because they are pitches and levels, not counts -- String(392.0) is
// "392" and would silently restyle every ident array the first time one was
// edited. Anything already fractional prints as-is.
function formatNumber(n, oneDecimal = false) {
  if (!Number.isFinite(n)) throw new Error(`Refusing to write non-finite number: ${n}`)
  // 2026-10-15 (admin audit, LOW-7) -- String(-0) and (-0).toFixed(1) both
  // drop the sign, so -0 was written as `0`/`0.0`. Harmless to every reader
  // here (deepEqual calls them equal), but it is a value the patcher was
  // asked to write and did not.
  if (Object.is(n, -0)) return oneDecimal ? '-0.0' : '-0'
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
      .map(([k, v]) => `${assertIdentifier(k)}: ${formatValue(v, nested)}`)
      .join(', ')
    return inner ? `{ ${inner} }` : '{}'
  }
  throw new Error(`Cannot serialize value of type ${typeof value}`)
}

const ITEM_INDENT = '      '
const CLOSE_INDENT = '    '

// 2026-10-15 (admin audit, MED-3) -- a track is checked for shape BEFORE it
// is written. quoteJs(undefined) is the string 'undefined', so a request
// missing a field wrote `realTrack('…', 'undefined', 'null')` -- valid JS, a
// real-looking track, and verifyPatch (which only counted tracks) passed it.
// The id rule is the YouTube one lint-roster enforces: 11 characters of
// [A-Za-z0-9_-].
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
export function assertTrackShape(t, where = 'track') {
  if (!t || typeof t !== 'object') throw new Error(`Refusing to write ${where}: not a track object`)
  if (typeof t.youtubeId !== 'string' || !YOUTUBE_ID_RE.test(t.youtubeId)) {
    throw new Error(`Refusing to write ${where}: youtubeId ${JSON.stringify(t.youtubeId)} is not an 11-character YouTube id`)
  }
  for (const k of ['title', 'artist']) {
    if (typeof t[k] !== 'string' || !t[k].trim()) {
      throw new Error(`Refusing to write ${where} (${t.youtubeId}): ${k} must be a non-empty string, got ${JSON.stringify(t[k])}`)
    }
  }
  return t
}

export function trackLine(t) {
  assertTrackShape(t)
  return `realTrack(${quoteJs(t.youtubeId)}, ${quoteJs(t.title)}, ${quoteJs(t.artist)}),`
}

const sameTrack = (a, b) => !!a && !!b
  && a.youtubeId === b.youtubeId && a.title === b.title && a.artist === b.artist

/** The comment text in a stretch of trivia, one trimmed string per line. */
const commentLines = (text) => text.split('\n').map(l => l.trim()).filter(Boolean)

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
 *  design record this repo runs on, and nothing else holds them.
 *
 *  2026-10-15 (admin audit, MED-1) -- it still deleted four comment shapes,
 *  on every save including a no-op one, because it only ever kept the WHOLE
 *  LINES between two entries: a comment on the `tracks: [` line, a same-line
 *  trailing comment after `realTrack(...),`, an inline `/* *\/` in front of
 *  realTrack on its own line, and a tail comment between the last track and
 *  `]`. Each is now its own piece of the parse, and each has a home:
 *    openTail  -- trivia after `[` on its line; stays in place.
 *    lead      -- EVERYTHING between the previous entry's line and this
 *                 entry, verbatim: comment lines, blank lines, indentation
 *                 and any inline comment before `realTrack`. Travels with
 *                 the entry, as the comment block above it always did.
 *    pre/post  -- same-line trivia either side of the entry's comma. Also
 *                 travels with the entry -- a note on a track's own line is
 *                 about that track.
 *    tail      -- whole lines after the last entry, up to `]`; in place.
 *  Lead and trailing comments of a REMOVED entry are reported in
 *  droppedComments, which is the only way a comment ever leaves the file. */
export function parseTracksBlock(src, openIdx) {
  const closeIdx = matchBracket(src, openIdx, '[', ']')
  if (closeIdx === -1) throw new Error('Unbalanced tracks array')
  const open = sameLineTrivia(src, openIdx + 1, closeIdx, false)
  const openAtEol = src[open.end] === '\n'
  // Trailing spaces after `[` are only kept when they are all there is to
  // keep -- otherwise `[ realTrack(...)` would regenerate as `[ ` + newline.
  const openTail = openAtEol ? src.slice(openIdx + 1, open.end) : src.slice(openIdx + 1, open.end).trimEnd()
  let cursor = openAtEol ? open.end + 1 : open.end
  let atLineStart = openAtEol
  const entries = []
  while (cursor < closeIdx) {
    const entryStart = skipTrivia(src, cursor, closeIdx)
    if (entryStart >= closeIdx) break
    if (src[entryStart] === ',') {
      // A stray separator (a comma on the line after a `// note` that ended
      // the previous entry). The entry it belonged to is re-separated when
      // written; the comma itself carries nothing.
      cursor = entryStart + 1
      continue
    }
    const lead = src.slice(cursor, entryStart)
    const valEnd = skipValue(src, entryStart, closeIdx)
    const cEnd = codeEnd(src, entryStart, valEnd)
    const code = src.slice(entryStart, cEnd)
    const tr = sameLineTrivia(src, cEnd, closeIdx, true)
    const hasComma = tr.comma !== -1
    const pre = src.slice(cEnd, hasComma ? tr.comma : tr.end)
    const post = hasComma ? src.slice(tr.comma + 1, tr.end) : ''
    // Parsed rather than regexed, so an escaped quote inside a title cannot
    // desynchronise the id -- and so the caller can compare tracks by VALUE.
    let parsed = null
    // eslint-disable-next-line no-eval
    try { parsed = eval('(' + code + ')') } catch (e) { /* leave null */ }
    const leadLeadingLine = lead.slice(lead.lastIndexOf('\n') + 1)
    const lineIndent = (atLineStart || lead.includes('\n')) ? leadLeadingLine.match(/^[ \t]*/)[0] : null
    entries.push({
      youtubeId: parsed?.youtubeId ?? null,
      track: parsed,
      text: code + (hasComma ? ',' : ''),
      code, pre, post, hasComma,
      lead, leadAtLineStart: atLineStart || lead.includes('\n'),
      // Old shape, kept for callers: the comment lines this entry carries
      // (lead and same-line), so `comments.some(c => c.trim())` still reads
      // "does this entry have notes".
      comments: [...commentLines(lead), ...commentLines(pre + post)],
      indent: lineIndent,
      isRealTrack: /^realTrack\s*\(/.test(code),
      get line() { return src.slice(0, entryStart).split('\n').length },
    })
    atLineStart = src[tr.end] === '\n'
    cursor = atLineStart ? tr.end + 1 : tr.end
  }
  // Indentation is INFERRED from the block, not imposed. GREEN ROOM indents
  // its entries 4 spaces where every other station uses 6, and a hardcoded
  // house indent silently reformatted all 28 of its lines.
  const itemIndent = entries.find(e => e.indent != null)?.indent ?? ITEM_INDENT
  const closeLineStart = src.lastIndexOf('\n', closeIdx) + 1
  const closeLead = src.slice(closeLineStart, closeIdx)
  const closeIndent = /^\s*$/.test(closeLead) ? closeLead : CLOSE_INDENT
  const tail = src.slice(Math.min(cursor, closeIdx), closeIdx)
  return {
    entries, closeIdx, itemIndent, closeIndent,
    openTail, tail, tailAtLineStart: atLineStart,
    blockText: src.slice(openIdx, closeIdx + 1),
  }
}

/** Rebuild a tracks block, carrying each surviving track's comments with it.
 *
 *  Comments are keyed to the track they sit above (or beside). A track you
 *  kept keeps its notes; a track you removed takes its own notes with it,
 *  which is usually right -- but the count comes back to the caller so it can
 *  be REPORTED rather than happening silently. An unchanged track's text is
 *  reused verbatim rather than regenerated, so quote style survives too
 *  (`'Don\'t Go'` must not come back as `"Don't Go"`).
 *
 *  2026-10-15 (admin audit, MED-2) -- the carry is keyed by OCCURRENCE, not
 *  by youtubeId alone. It used a Map from id to entry, which keeps only the
 *  LAST entry per id: with a duplicated id on a station, removing one copy
 *  destroyed the other copy's comment block and reported nothing, and a
 *  commented track sent twice printed its comment twice. Each previous entry
 *  is now claimed at most once -- an exact value match first, then the
 *  earliest unclaimed entry with that id -- and whatever is left unclaimed is
 *  what was removed, so droppedComments is right by construction.
 *
 *  2026-10-15 (admin audit, LOW-6) -- an entry that is not a `realTrack(...)`
 *  call (an object literal with a custom id, say) is carried VERBATIM while
 *  its values are unchanged, and a request that would CHANGE one is refused.
 *  The alternative -- regenerate it as realTrack -- silently throws away the
 *  custom id and the shape, and the custom id is the kind of thing a later
 *  reader keys on. Refusing was chosen over rewriting in some best-effort
 *  "same shape" because a hand-written entry is hand-written for a reason
 *  this function cannot know; the dashboard says why, and stations.js is a
 *  text editor away. An entry that does not even evaluate is refused too: it
 *  has no id to carry by, and the old code dropped it without a word.
 *
 *  2026-10-15 (admin audit, LOW-5) -- every written entry ends in a comma.
 *  A last track written without one was reused verbatim wherever it moved,
 *  so appending a track after it produced `realTrack(...)\n realTrack(...)`
 *  -- `Unexpected identifier 'realTrack'`, caught by verifyPatch but only as
 *  a baffling refusal of an ordinary append. */
export function formatTracksBlock(tracks, previous = null) {
  tracks.forEach((t, k) => assertTrackShape(t, `track #${k + 1}`))
  const entries = previous?.entries ?? []
  const itemIndent = previous?.itemIndent ?? ITEM_INDENT
  const closeIndent = previous?.closeIndent ?? CLOSE_INDENT
  const hasNotes = (e) => e.comments.some(c => c.trim())

  const broken = entries.find(e => !e.track || typeof e.track.youtubeId !== 'string')
  if (broken) {
    throw new Error(`Tracks block entry on line ${broken.line} could not be read (${broken.code.slice(0, 60)}) -- refusing to rewrite the block around it`)
  }

  // A save that asks for exactly what is there writes exactly what is there,
  // whatever the layout -- two entries sharing a line, a block on one line.
  if (previous && entries.length === tracks.length && entries.every((e, k) => sameTrack(e.track, tracks[k]))) {
    return {
      text: previous.blockText,
      keptComments: entries.filter(hasNotes).length,
      droppedComments: [],
    }
  }

  const claimed = new Set()
  const claim = (t) => {
    let k = entries.findIndex((e, j) => !claimed.has(j) && sameTrack(e.track, t))
    if (k === -1) k = entries.findIndex((e, j) => !claimed.has(j) && e.youtubeId === t.youtubeId)
    if (k === -1) return null
    claimed.add(k)
    return entries[k]
  }

  const out = []
  let kept = 0
  for (const t of tracks) {
    const prev = claim(t)
    if (!prev) { out.push(itemIndent + trackLine(t)); continue }
    if (hasNotes(prev)) kept++
    // Reuse the original text when nothing about the track changed; only
    // then is it guaranteed to still say what it said. Compared by VALUE, not
    // by rendered text -- stations.js writes `'Don\\'t Go'` where quoteJs
    // would write `\"Don't Go\"`, and a text comparison calls that a change
    // and restyles the line.
    const unchanged = sameTrack(prev.track, t)
    if (!unchanged && !prev.isRealTrack) {
      throw new Error(`Track ${t.youtubeId} (line ${prev.line}) is not written as realTrack(...) in stations.js -- ` +
        'refusing to regenerate it and lose its shape; edit that entry by hand')
    }
    const code = unchanged ? prev.code : trackLine(t).slice(0, -1)
    const body = prev.hasComma
      ? code + prev.pre + ',' + prev.post
      : code + ',' + prev.pre.replace(/\s+$/, '')
    const lead = prev.leadAtLineStart ? prev.lead : itemIndent + prev.lead.replace(/^\s+/, '')
    out.push(lead + body)
  }

  const dropped = []
  entries.forEach((e, j) => {
    if (!claimed.has(j) && hasNotes(e)) {
      dropped.push({ youtubeId: e.youtubeId, comments: e.comments.filter(c => c.trim()).map(c => c.trim()) })
    }
  })

  const head = '[' + (previous?.openTail ?? '') + '\n'
  const tail = previous?.tailAtLineStart ? previous.tail : closeIndent
  return {
    text: head + out.map(l => l + '\n').join('') + tail + ']',
    keptComments: kept,
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
 *  went with a removed track. The dashboard shows the second list.
 *
 *  2026-10-15 (admin audit, MED-3) -- the result is PROVEN before it is
 *  returned: verifyPatch with the requested list and the source it started
 *  from, so every track must come back as asked and every other station
 *  byte-for-value as it was. Done here rather than left to callers because
 *  the one caller that checked (saveTracks) checked the COUNT only, and a
 *  check that lives in the layer every caller goes through cannot be
 *  skipped by the next one. */
export function patchStationTracksDetailed(src, stationId, tracks) {
  const { objStart, objEnd } = findStationObjectRange(src, stationId)
  const { openIdx, closeIdx } = findTracksRange(src, objStart, objEnd)
  const previous = parseTracksBlock(src, openIdx)
  const built = formatTracksBlock(tracks, previous)
  const text = src.slice(0, openIdx) + built.text + src.slice(closeIdx + 1)
  verifyPatch(text, stationId, tracks, { before: src })
  return {
    text,
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

/** Number style for a field that has no literal of its own to infer from.
 *
 *  2026-10-15 (admin audit, LOW-7) -- inserting a leaf that is not there yet
 *  (crt.bloomAmt on a station with no crt block, or none of that key) had
 *  nothing to infer from and wrote `2` where every other station writes the
 *  same field `2.0`. The same field on the OTHER stations is the house style
 *  for it, so they are asked: any one-decimal literal there means one-decimal
 *  here -- the same "a decimal point anywhere" rule the replace path uses.
 *  Only for numbers and number arrays: oneDecimal reaches every number in a
 *  value, and a whole inserted object mixes counts with levels. */
function inferStyleFromSiblings(src, fieldPath, value) {
  const numeric = typeof value === 'number'
    || (Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'number'))
  if (!numeric) return {}
  for (const objStart of stationObjectStarts(src)) {
    let hit
    try { hit = resolveFieldPath(src, objStart, fieldPath) } catch (e) { continue }
    if (hit.missing) continue
    const lit = src.slice(hit.valStart, codeEnd(src, hit.valStart, hit.valEnd))
    if (/\d\.\d/.test(lit)) return { oneDecimal: true }
  }
  return {}
}

/** Rewrite exactly one field's value. Every other byte of the file --
 *  including the "Nth pass" comments sitting between the fields -- is
 *  preserved verbatim. Pass value === null to REMOVE the field.
 *
 *  Inserts the field if it is not already there, so the identity editor can
 *  set e.g. crt.chroma on a station whose crt block never had one. Insertion
 *  goes just before the holder's closing brace, which for the inline
 *  `crt: { ... }` / `meter: { ... }` objects is the only sensible place.
 *
 *  2026-10-15 (admin audit, MED-3) -- proven before it is returned, like the
 *  tracks patcher: the field must read back as written AND every other field
 *  of this station and every other station must read back as it was. */
export function patchStationField(src, stationId, fieldPath, value, opts = {}) {
  String(fieldPath).split('.').forEach(assertIdentifier)
  const out = patchFieldText(src, stationId, fieldPath, value, opts)
  verifyPatch(out, stationId, { [fieldPath]: value ?? null }, { before: src })
  return out
}

function patchFieldText(src, stationId, fieldPath, value, opts) {
  const { objStart } = findStationObjectRange(src, stationId)
  const hit = resolveFieldPath(src, objStart, fieldPath)

  if (hit.missing) {
    if (value === null || value === undefined) return src   // removing an absent field: no-op
    const key = hit.key
    // 2026-09-02 (audit, L6) -- when the MISSING part is a holder rather
    // than the leaf ('crt.bloomAmt' on a station with no crt block at
    // all), the remaining path has to come into being around the value.
    // This used to insert the bare leaf at the holder's level -- `crt: 2`
    // -- which verifyPatch then refused (nothing corrupt ever reached
    // disk), but the identity editor surfaced that as a baffling error on
    // a save that should simply have worked.
    const parts = String(fieldPath).split('.')
    let text = formatValue(value, { ...inferStyleFromSiblings(src, fieldPath, value), ...opts })
    for (let i = parts.length - 1; i > hit.depth; i--) text = `{ ${parts[i]}: ${text} }`
    const holderEnd = hit.holderEnd
    // 2026-10-15 (admin audit, MED-4) -- what precedes the insertion point
    // is read as CODE: the last code character in the holder decides
    // whether a separator is needed. Reading raw text, a holder ending
    // `a: 1, /* note */ }` got a second comma (`, /* note */, key`), and a
    // multi-line holder whose last field had no comma got the new line with
    // nothing between them.
    const lastCode = src[codeEnd(src, hit.holderStart, holderEnd) - 1]
    const needSep = lastCode !== '{' && lastCode !== ','
    // Inline object (`{ a: 1, b: 2 }`) vs. multi-line: match what's there.
    const holderText = src.slice(hit.holderStart, holderEnd + 1)
    const inline = !holderText.includes('\n')
    if (inline) {
      const before = src.slice(0, holderEnd).replace(/\s+$/, '')
      return before + (needSep ? `, ${key}: ${text} ` : ` ${key}: ${text} `) + src.slice(holderEnd)
    }
    // Multi-line holder: copy the indentation of the line the closing brace
    // sits on and add one level.
    const lineStart = src.lastIndexOf('\n', holderEnd) + 1
    const beforeBrace = src.slice(lineStart, holderEnd)
    // 2026-09-02 (audit, L6) -- only when the closing brace has that line
    // to itself. A station object closes as `] }`, sharing its line with
    // the tracks array's `]`, and inserting a whole line above THAT put
    // the new field inside the array -- syntactically broken, caught by
    // verifyPatch, but the exact confusing failure this branch exists to
    // avoid. A shared line gets the inline treatment instead.
    if (!/^\s*$/.test(beforeBrace)) {
      return src.slice(0, holderEnd).replace(/\s+$/, '') + `${needSep ? ',' : ''} ${key}: ${text} ` + src.slice(holderEnd)
    }
    const closeIndent = beforeBrace.match(/^\s*/)[0]
    const newLine = `${closeIndent}  ${key}: ${text},\n`
    if (!needSep) return src.slice(0, lineStart) + newLine + src.slice(lineStart)
    const at = codeEnd(src, hit.holderStart, holderEnd)
    return src.slice(0, at) + ',' + src.slice(at, lineStart) + newLine + src.slice(lineStart)
  }

  // 2026-10-15 (admin audit, MED-4) -- the value ends at its last CODE
  // character, not its last non-space one. See codeEnd(): a trailing
  // comment before the holder's `}` used to sit inside this range, so it
  // was deleted by the replace below and its digits decided the number
  // style. Comments after the value are now outside the span and ride along
  // in the suffix, as the whitespace always did.
  // (The 2026-08-27 history of the same trim, still true: skipValue() stops
  // ON the terminator, so for the LAST key of an inline object `{ a: 1,
  // b: 1.6 }` the range includes the space before the `}` -- replacing it
  // wholesale wrote `b: 2.0}`. The idempotence sweep missed that because it
  // rewrote `crt` as a whole object, where the space cancels out; a
  // headless load of the dashboard caught it in the diff preview. Nested
  // leaf paths are in the sweep now too.)
  const valEnd = codeEnd(src, hit.valStart, hit.valEnd)

  if (value === null || value === undefined) {
    // Remove the field, its trailing comma, and -- if it had a line to
    // itself -- that line's leading indentation and newline, so removal
    // doesn't leave a blank gutter behind.
    let start = hit.keyStart
    let end = valEnd
    let j = end
    while (src[j] === ' ' || src[j] === '\t') j++
    if (src[j] === ',') {
      end = j + 1
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
    const out = src.slice(0, start) + src.slice(end)
    // 2026-10-15 (admin audit, LOW-1) -- removing the LAST key of a holder
    // left `grind: {  }` behind, and an empty holder is not the same as no
    // holder: program.js treats `{}` as truthy and computed NaN from the
    // grind/idleEvent keys it no longer had. So the holder goes too, which
    // also makes insert-then-remove round-trip byte-identically. A holder
    // that still holds a COMMENT is refused instead of removed with it --
    // that note is somebody's reasoning, and removing it should be a
    // request to remove the holder, not a side effect of removing a key.
    const parts = String(fieldPath).split('.')
    if (parts.length > 1) {
      const holderPath = parts.slice(0, -1).join('.')
      const h = resolveFieldPath(out, findStationObjectRange(out, stationId).objStart, holderPath)
      if (!h.missing && out[h.valStart] === '{') {
        const { fields, objEnd } = scanObjectFields(out, h.valStart)
        if (fields.size === 0) {
          if (out.slice(h.valStart + 1, objEnd).trim() !== '') {
            throw new Error(`Removing "${fieldPath}" would leave "${holderPath}" holding only a comment -- ` +
              `remove "${holderPath}" itself if that is what you mean`)
          }
          return patchFieldText(out, stationId, holderPath, null, opts)
        }
      }
    }
    return out
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
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

function getPath(obj, fieldPath) {
  return String(fieldPath).split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

function setPath(obj, fieldPath, value) {
  const parts = String(fieldPath).split('.')
  let o = obj
  for (const k of parts.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== 'object') o[k] = {}
    o = o[k]
  }
  o[parts[parts.length - 1]] = value
}

/** Delete a path, then any holder that deletion left empty -- the same
 *  pruning patchFieldText does to the text (LOW-1). */
function deletePath(obj, fieldPath) {
  const parts = String(fieldPath).split('.')
  const chain = [obj]
  for (const k of parts.slice(0, -1)) {
    const next = chain[chain.length - 1][k]
    if (next === null || typeof next !== 'object') return
    chain.push(next)
  }
  delete chain[chain.length - 1][parts[parts.length - 1]]
  for (let i = chain.length - 1; i >= 1; i--) {
    if (Array.isArray(chain[i]) || Object.keys(chain[i]).length) break
    delete chain[i - 1][parts[i - 1]]
  }
}

// verifyPatch re-reads two whole files per patch, and the patchers now call
// it themselves, so the idempotence sweep evaluates stations.js ~1,000 times.
// The last few parses are kept by source text. Safe only because verifyPatch
// never mutates what it reads (the target is copied before it is edited);
// loadRosterFromText itself stays uncached, since its callers may mutate.
const loadMemo = []
function loadForVerify(src) {
  const hit = loadMemo.find(m => m.src === src)
  if (hit) return hit.roster
  const roster = loadRosterFromText(src)
  loadMemo.unshift({ src, roster })
  loadMemo.length = Math.min(loadMemo.length, 4)
  return roster
}

const projectTrack = (t) => ({ youtubeId: t?.youtubeId, title: t?.title, artist: t?.artist })

/** Re-runs the SAME extraction used to read the roster against the patched
 *  text. A round-trip that yields the value we meant to write means the
 *  patch is structurally sound. Throws otherwise -- callers must not write.
 *
 *  Deliberately checks the VALUE, not just that parsing succeeded. A
 *  "did it re-parse?" check passes for a patcher that writes nothing at
 *  all, which is the decorative-test shape this repo has already paid for
 *  once (see CLAUDE.md on the STATION BREAK). tests/roster-lib.test.mjs
 *  neuters each patcher on purpose to confirm this actually goes red.
 *
 *  `expect` is one of:
 *    an array of tracks -- the station's tracks must read back as exactly
 *                          that list of {youtubeId, title, artist}, in order;
 *    an object          -- { fieldPath: value } (null = must be gone);
 *    a number           -- a track COUNT. Kept for old callers only: it is
 *                          the check that let a save write 'undefined' as a
 *                          title, and it says nothing about which tracks.
 *
 *  2026-10-15 (admin audit, MED-3) -- `opts.before`, the source the patch
 *  started from, makes this prove the patch touched NOTHING ELSE: every
 *  other station deep-equal before and after, and every other field of the
 *  target station too (tracks mode: everything but tracks; field mode:
 *  everything but the paths asked for). Value checks alone pass a patcher
 *  that writes the right value and also flattens a neighbour; both patchers
 *  now pass `before` themselves, so no caller can forget it. */
export function verifyPatch(newSrc, stationId, expect, opts = {}) {
  const after = loadForVerify(newSrc)
  const afterAll = [...after.STATIONS, ...after.SECRET_STATIONS]
  const st = afterAll.find(s => s.id === stationId)
  if (!st) throw new Error(`Post-patch check: station "${stationId}" not found`)
  const tracksMode = typeof expect === 'number' || Array.isArray(expect)
  if (typeof expect === 'number') {
    if (st.tracks.length !== expect) {
      throw new Error(`Post-patch check: expected ${expect} tracks, found ${st.tracks.length}`)
    }
  } else if (Array.isArray(expect)) {
    if (st.tracks.length !== expect.length) {
      throw new Error(`Post-patch check: expected ${expect.length} tracks, found ${st.tracks.length}`)
    }
    expect.forEach((want, k) => {
      const got = projectTrack(st.tracks[k])
      if (!deepEqual(got, projectTrack(want))) {
        throw new Error(`Post-patch check: track #${k + 1} is ${JSON.stringify(got)}, expected ${JSON.stringify(projectTrack(want))}`)
      }
    })
  } else {
    for (const [fieldPath, want] of Object.entries(expect || {})) {
      const got = getPath(st, fieldPath)
      if (want === null || want === undefined) {
        if (got !== undefined) throw new Error(`Post-patch check: "${fieldPath}" should be gone, found ${JSON.stringify(got)}`)
        continue
      }
      if (!deepEqual(got, want)) {
        throw new Error(`Post-patch check: "${fieldPath}" is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
      }
    }
  }

  if (opts.before == null) return true
  const before = loadForVerify(opts.before)
  for (const list of ['STATIONS', 'SECRET_STATIONS']) {
    const a = before[list].map(s => s.id), b = after[list].map(s => s.id)
    if (!deepEqual(a, b)) {
      throw new Error(`Post-patch check: ${list} went from [${a.join(', ')}] to [${b.join(', ')}]`)
    }
  }
  const beforeAll = [...before.STATIONS, ...before.SECRET_STATIONS]
  beforeAll.forEach((was, k) => {
    if (was.id === stationId) return
    if (!deepEqual(afterAll[k], was)) {
      throw new Error(`Post-patch check: station "${was.id}" changed although only "${stationId}" was patched`)
    }
  })
  const was = beforeAll.find(s => s.id === stationId)
  const want = structuredClone(was)
  const got = { ...st }
  if (tracksMode) {
    delete want.tracks
    delete got.tracks
  } else {
    for (const [fieldPath, v] of Object.entries(expect || {})) {
      if (v === null || v === undefined) deletePath(want, fieldPath)
      else setPath(want, fieldPath, structuredClone(v))
    }
  }
  if (!deepEqual(got, want)) {
    const keys = [...new Set([...Object.keys(got), ...Object.keys(want)])].filter(k => !deepEqual(got[k], want[k]))
    throw new Error(`Post-patch check: "${stationId}" also changed in ${keys.join(', ')}, which the patch was not asked to touch`)
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
