// Offline roster rules -- the content-ops constraints README documents,
// checked mechanically (2026-08-25 audit). No network; runs in well under a
// second. Used three ways:
//
//   node tools/lint-roster.js          # standalone, nonzero exit on any problem
//   node tools/verify-roster.js        # runs this first, then the oEmbed check
//   node --test tests/                 # tests/roster.test.mjs asserts it passes
//
// Rules (each cites where it comes from):
//   - at most 9 public stations PER BAND (README "Station count": the 1-9
//     preset keys, which are per-band as of 2026-08-31)
//   - every station names a band that exists in tuning.js's BANDS
//   - tagline fits the guide index's LANE column (README "Taglines").
//     History: a flat 35 (safe for the longest callsign), then 2026-08-25's
//     `52 - callsign.length`, which was right while the index drew one joined
//     line -- a long callsign ate the tagline's budget because they shared a
//     row. 2026-08-27 the index moved to fixed column stops, so they no
//     longer share anything: the LANE column starts at x=37 on the 80-col
//     grid and runs to the edge, giving every station the same flat 43
//     regardless of callsign. Short-callsign stations lose a little headroom
//     (CIPHER could have had 46), long-callsign ones gain a lot
//     (DISTORTION FIELD had 36). See GUIDE_INDEX_COLS in ui/guide.js.
//   - at least 10 tracks per station (README "Adding tracks")
//   - 4 ident tones per station (10th pass: "station IDs set to 4 tones long")
//   - every dial glyph actually exists in fonts/ter-u16n.bdf (an unmapped
//     codepoint renders blank and silently deletes the station from the dial
//     -- drawDial's own note)
//   - every station.visual names a built effect (visuals/index.js), else it
//     silently falls back to DRIFT
//   - frequencies inside their OWN band's range, and at least LOCK_THRESHOLD*2
//     apart from their neighbours ON THAT BAND, so two carriers can never
//     both be inside lock range at once. Asked per band because spacing is a
//     question about one dial: two stations a unit apart on different bands
//     are not close in any sense a listener can reach.
//   - no YouTube ID appears twice across the whole roster (secret included)
//   - every track has a title and artist
//   - README's screenshot captions still name the station tools/shoot.mjs
//     actually captures. The captions name a station; the recipes press a
//     preset DIGIT; presets are per-band and renumber when the band gains a
//     station. The digit is read out of shoot.mjs, not restated, so this is
//     an assertion between the two rather than a third copy.
//   - README's roster sentence still matches the roster: station count, track
//     total, the per-station min-max, and the secret-station total. It had
//     already drifted once (said 371 for a 377-track roster), and the guide's
//     station index computes the same figure live -- so the README was the
//     only copy free to be wrong. See CLAUDE.md's design-record note: where
//     something must live in two places, one of them has to assert they agree.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
globalThis.SIGNAL_BUILD ??= 'lint'
globalThis.matchMedia ??= () => ({ matches: false })

// The guide index's LANE column: 80 - GUIDE_INDEX_COLS.tagline (37). Kept as
// a literal rather than imported from ui/guide.js on purpose -- that module
// pulls in the WebAudio sfx chain at load, which Node has no business
// touching for a roster lint. tests/program.test.mjs asserts the two agree,
// so the duplication cannot drift silently.
export const TAGLINE_MAX = 43
// 2026-09-02 (audit, L11) -- exported so the admin backend's boot payload
// imports the cap instead of restating it. The dashboard was still sending
// `MAX_PUBLIC_STATIONS: 9` as a FLAT limit after the rule moved to
// 9-per-band on 2026-08-31 -- dormant only because the page did not render
// it yet, which is exactly the wrong number waiting to be believed. One
// authority (this file owns the [1-9]-presets reasoning, see the band loop
// below), everyone else imports.
export const MAX_PUBLIC_STATIONS_PER_BAND = 9

// The guide's per-station detail page (drawGuidePageStation) gives `desc`
// exactly DESC_LINES lines at DESC_WIDTH columns -- contentWidth is
// term.cols - 8, so 72 on the 80-column desktop grid -- and marks anything
// past that with a trailing " ...". The mark is honest, but it is only
// visible to someone who opens that page, which is exactly how NEON STASIS
// was first written 47 characters over and lost the end of its own sentence
// (2026-08-30). Same duplication trade as TAGLINE_MAX above, guarded the
// same way in tests/program.test.mjs.
//
// DESKTOP ONLY, deliberately. The 42-column lite layout truncates the
// tagline, the desc and the track titles as a matter of course, so requiring
// the same fit there would fail for all nine stations today and would be
// asserting a rule mobile does not actually have.
export const DESC_WIDTH = 72
export const DESC_LINES = 3

export async function lintRoster() {
  const { STATIONS, SECRET_STATIONS, STATION_PRESET_ORDER } = await import('../stations.js?v=lint')
  const { BANDS, DEFAULT_BAND, LOCK_THRESHOLD } = await import('../tuning.js?v=lint')
  const { VISUALS } = await import('../visuals/index.js?v=lint')
  const { parseBDF } = await import('../src/bdf.js')
  const { wordWrap } = await import('../layout.js?v=lint')
  const font = parseBDF(readFileSync(path.join(here, '..', 'fonts', 'ter-u16n.bdf'), 'utf8'))

  const problems = []
  const warnings = []
  const all = [...STATIONS, ...SECRET_STATIONS]
  const bandKeys = new Set(BANDS.map((b) => b.key))
  // 2026-08-31 -- was a flat "exactly 9 public stations". The ceiling was
  // never the roster's size, it was the [1-9] preset keys, and those are
  // per-band now: a tenth station on ONE band is the thing with no way to
  // reach it. So the rule moved rather than loosened. No minimum beyond one,
  // deliberately -- a band is committed with a single station on it before it
  // is filled, the same way a new station is committed with tracks: [].
  for (const b of BANDS) {
    const n = STATIONS.filter((st) => (st.band ?? DEFAULT_BAND) === b.key).length
    if (n > MAX_PUBLIC_STATIONS_PER_BAND) problems.push(`band ${b.label} has ${n} public stations; [1-9] presets fit ${MAX_PUBLIC_STATIONS_PER_BAND}`)
  }

  const seenIds = new Map()
  for (const st of all) {
    const who = `${st.callsign} (${st.id})`
    if (!st.tagline) problems.push(`${who}: no tagline`)
    else if (!st.secret && st.tagline.length > TAGLINE_MAX) {
      problems.push(`${who}: tagline is ${st.tagline.length} chars; the guide index's LANE column fits ${TAGLINE_MAX}`)
    }
    if (!st.tracks || st.tracks.length < 10) problems.push(`${who}: only ${st.tracks?.length ?? 0} tracks (min 10)`)
    if (!st.secret && st.desc) {
      const lines = wordWrap(st.desc, DESC_WIDTH)
      if (lines.length > DESC_LINES) {
        problems.push(`${who}: desc wraps to ${lines.length} lines at ${DESC_WIDTH} columns; the guide's detail page shows ${DESC_LINES} and marks the rest with "..."`)
      }
    }
    if (!Array.isArray(st.ident) || st.ident.length !== 4) problems.push(`${who}: ident has ${st.ident?.length ?? 0} tones (want 4)`)
    if (!bandKeys.has(st.band)) problems.push(`${who}: band '${st.band}' is not one of ${[...bandKeys].join(', ')}`)
    else {
      const b = BANDS.find((x) => x.key === st.band)
      if (!(st.freq >= b.freqMin && st.freq <= b.freqMax)) problems.push(`${who}: freq ${st.freq} outside ${b.label}'s ${b.freqMin}-${b.freqMax}`)
    }
    if (st.visual && !VISUALS[st.visual]) problems.push(`${who}: visual '${st.visual}' is not a built effect`)
    if (!st.secret) {
      if (!st.glyph) problems.push(`${who}: no dial glyph`)
      else if (!font.glyphs.has(st.glyph.codePointAt(0))) problems.push(`${who}: glyph '${st.glyph}' (U+${st.glyph.codePointAt(0).toString(16)}) is not in ter-u16n.bdf`)
    }
    for (const t of st.tracks || []) {
      if (!t.youtubeId || !t.title || !t.artist) problems.push(`${who}: malformed track ${JSON.stringify(t)}`)
      if (seenIds.has(t.youtubeId)) problems.push(`${who}: ${t.youtubeId} (${t.title}) already used by ${seenIds.get(t.youtubeId)}`)
      else seenIds.set(t.youtubeId, who)
    }
  }
  // Spacing is a question about ONE dial, so it is asked per band. Two
  // stations a unit apart on different bands are not close to each other in
  // any sense a listener can reach -- there is no tuning position from which
  // both are near. Asking this across the whole roster would invent conflicts
  // between stations that can never be on screen together.
  for (const bd of BANDS) {
    const sorted = all.filter((st) => st.band === bd.key).sort((a, b) => a.freq - b.freq)
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].freq - sorted[i - 1].freq
      if (gap < LOCK_THRESHOLD * 2) problems.push(`${bd.label}: ${sorted[i - 1].callsign} and ${sorted[i].callsign} are only ${gap.toFixed(1)} apart (min ${LOCK_THRESHOLD * 2})`)
    }
  }
  // 2026-08-27 -- README's roster sentence is four claims about numbers that
  // live in stations.js, and it had already drifted: it read "371 tracks
  // total" for a roster that was 377 by then, corrected by hand in the mobile
  // pass. The guide's own station index computes the same figure live, so the
  // two disagreed on a public page while one of them was right by
  // construction.
  //
  // Rather than correct it again and wait for the next curation pass to break
  // it, this is the assertion CLAUDE.md's design-record note asks for
  // whenever something must live in two places: make one of them check. A
  // roster edit that changes any of these four now fails lint with the number
  // to write, which is a better prompt than remembering.
  //
  // A problem rather than a warning on purpose. It is the landing page of a
  // public repo making a factual claim about the product, and the fix is
  // typing a different number.
  const readmePath = path.join(here, '..', 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  // 2026-08-31 -- `stations` may now be followed by a qualifier ("10 stations
  // across two bands"), so the count is no longer glued to the comma.
  // Widened rather than reverting the prose: the sentence SHOULD say there
  // are two bands, and this rule's own failure message asks for exactly this
  // when the wording moves.
  const claim = /(\d+)\s+stations\b[^,]*,\s+(\d+)\s+tracks total\s*\((\d+)-(\d+)\s+per station\b[^)]*carrying\s+(\d+)\s+more/.exec(readme)
  if (!claim) {
    // Deliberately loud. If the sentence was reworded, this rule stops
    // checking anything at all and silently passes forever -- the exact
    // failure mode it exists to prevent -- so a miss is reported, not shrugged
    // off. Update the pattern above alongside the prose.
    problems.push('README: could not find the "N stations, N tracks total (N-N per station ... carrying N more)" roster sentence -- if it was reworded, update the regex in lint-roster.js so this keeps checking')
  } else {
    const counts = STATIONS.map((s) => s.tracks.length)
    const expect = {
      stations: STATIONS.length,
      total: counts.reduce((n, c) => n + c, 0),
      min: Math.min(...counts),
      max: Math.max(...counts),
      secret: SECRET_STATIONS.reduce((n, s) => n + s.tracks.length, 0),
    }
    const got = {
      stations: +claim[1], total: +claim[2], min: +claim[3], max: +claim[4], secret: +claim[5],
    }
    for (const k of ['stations', 'total', 'min', 'max', 'secret']) {
      if (got[k] !== expect[k]) problems.push(`README roster sentence: ${k} says ${got[k]}, roster has ${expect[k]}`)
    }
  }
  // 2026-09-02 (audit, D1) -- index.html's meta/OG/twitter descriptions are
  // the same roster claim one layer further out, and the layer social
  // scrapers actually show. They are NOT covered by the README rule above,
  // and that is exactly how they sat on "Nine curated stations" for the two
  // weeks in which the roster grew to 13 across two bands -- the un-asserted
  // duplicate rot CLAUDE.md's design-record note warns about, on the page
  // most people see first. Same discipline as the README rule, including
  // the loud miss: a reworded tag that this stops matching must fail, not
  // silently stop checking.
  const indexPath = path.join(here, '..', 'index.html')
  const indexHtml = readFileSync(indexPath, 'utf8')
  const descTags = [...indexHtml.matchAll(/(?:name="description"|property="og:description"|name="twitter:description")\s+content="([^"]*)"/g)].map((m) => m[1])
  if (descTags.length !== 3) {
    problems.push(`index.html: expected 3 description metas (description, og:description, twitter:description), found ${descTags.length} -- if the tags were reworked, update the regex in lint-roster.js so this keeps checking`)
  } else {
    for (const d of descTags) {
      const m = /(\d+)\s+curated stations across two bands/.exec(d)
      if (!m) problems.push(`index.html description "${d.slice(0, 40)}..." lost its "N curated stations across two bands" claim -- reword it back or update lint-roster.js`)
      else if (+m[1] !== STATIONS.length) problems.push(`index.html description says ${m[1]} curated stations, roster has ${STATIONS.length}`)
    }
  }
  // 2026-09-02 -- the SCREENSHOT captions. README names the station in two of
  // its shots ("locked onto COLD WAVE", "DISTORTION FIELD's fire effect"),
  // and tools/shoot.mjs captures them by pressing a PRESET DIGIT -- so the
  // caption is true only while that digit still resolves to that station.
  // Nothing connected the two. A station added to the default band below
  // COLD WAVE's frequency renumbers the presets under both recipes, and the
  // next `npm run shoot` would quietly regenerate hero.jpg showing a
  // different station while the caption went on naming the old one. Exactly
  // how og.jpg went stale (a shot no tool owns is a shot that rots), one
  // level up: here the tool owns the shot and nothing owns the CLAIM.
  //
  // The digits are read out of shoot.mjs rather than restated here -- a
  // third copy is what this rule exists to prevent. Presets are per-band and
  // shoot.mjs runs on a fresh Chrome profile (mkdtempSync, no localStorage),
  // so the band is deterministically DEFAULT_BAND; if that stops being true
  // this rule is checking the wrong dial and should be told about the change.
  try {
    const shoot = readFileSync(path.join(here, 'shoot.mjs'), 'utf8')
    const presetIn = (recipe) => {
      const m = new RegExp(`async '?${recipe}'?\\(api, tmp\\)[\\s\\S]*?tuneTo\\(api, (\\d+)\\)`).exec(shoot)
      return m ? Number(m[1]) : null
    }
    const bandOrder = STATION_PRESET_ORDER.filter((st) => st.band === DEFAULT_BAND)
    const shots = [
      { recipe: 'hero', re: /!\[SIGNAL, locked onto ([^\]]+)\]\(\.\/screenshots\/hero\.jpg\)/, visual: null },
      { recipe: 'visualizer', re: /!\[The visualizer, running ([^']+)'s fire effect\]\(\.\/screenshots\/visualizer\.jpg\)/, visual: 'flame' },
    ]
    for (const shot of shots) {
      const cap = shot.re.exec(readme)
      const preset = presetIn(shot.recipe)
      if (!cap) {
        problems.push(`README: could not find the ${shot.recipe} screenshot caption -- if it was reworded, update the regex in lint-roster.js so this keeps checking`)
        continue
      }
      if (preset === null) {
        problems.push(`tools/shoot.mjs: could not read the preset the "${shot.recipe}" recipe tunes to -- if the recipe changed shape, update lint-roster.js so this keeps checking`)
        continue
      }
      const st = bandOrder[preset - 1]
      if (!st) {
        problems.push(`tools/shoot.mjs: the "${shot.recipe}" recipe presses preset ${preset}, but band ${DEFAULT_BAND} has only ${bandOrder.length} stations`)
      } else if (st.callsign !== cap[1]) {
        problems.push(`README's ${shot.recipe} caption says "${cap[1]}", but shoot.mjs presses preset ${preset}, which on band ${DEFAULT_BAND} is ${st.callsign} -- re-shoot, recaption, or change the preset`)
      } else if (shot.visual && st.visual !== shot.visual) {
        problems.push(`README's ${shot.recipe} caption calls it a ${shot.visual} effect, but ${st.callsign}'s visual is now "${st.visual}"`)
      }
    }
  } catch (e) {
    problems.push(`screenshot-caption rule could not run: ${e.message}`)
  }
  // 2026-09-02 (audit, O1) -- profile keys with no station behind them.
  // station-profiles.json is looked up strictly by current station id
  // (audition.js, the dashboard), so a rename or removal silently strands
  // that station's rejection history -- the exact "rejection record lost"
  // failure the two-files rule in CLAUDE.md exists to prevent, arriving
  // through the key instead of the file. MOMENTUM is the precedent that
  // shaped this rule: its profile was deliberately kept when MIDNIGHT NEON
  // took the slot (60th pass), with a `retired` note saying so -- and the
  // 2026-09-02 audit initially read it as an accidental orphan because
  // nothing distinguished "kept on purpose" from "lost by rename". So the
  // rule is exactly that distinction: an orphan WITH a `retired` note is a
  // record, an orphan WITHOUT one is a problem, and the fix is either the
  // note (you meant it) or moving the rejections to the successor's
  // profile (you didn't).
  try {
    const profiles = JSON.parse(readFileSync(path.join(here, 'station-profiles.json'), 'utf8'))
    const ids = new Set(all.map((s) => s.id))
    for (const key of Object.keys(profiles.stations || {})) {
      if (!ids.has(key) && !profiles.stations[key]?.retired) {
        problems.push(`station-profiles.json: "${key}" matches no station id and has no \`retired\` note -- a stranded rejection history; add the note or merge it into the successor's profile`)
      }
    }
  } catch (e) {
    problems.push(`station-profiles.json could not be read/parsed (${e.message}) -- the orphan-profile rule checked nothing`)
  }
  return { problems, warnings, stations: all.length, tracks: all.reduce((n, s) => n + s.tracks.length, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, warnings, stations, tracks } = await lintRoster()
  console.log(`Roster rules: ${stations} station(s), ${tracks} track(s), ${problems.length} problem(s), ${warnings.length} warning(s).`)
  for (const p of problems) console.log(`  - ${p}`)
  for (const w of warnings) console.log(`  ! ${w}`)
  process.exit(problems.length ? 1 : 0)
}
