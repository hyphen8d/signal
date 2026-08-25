// SIGNAL -- grid layout: the desktop 80x25 row/column constants, the mobile
// lite layout, the STANDBY splash layout, and the text/box-drawing helpers
// every draw path uses. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, DIM, FAINT, MUTED, NORMAL } from './src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''

// --- layout (80x25 grid) -----------------------------------------------

// Re-spaced 2026-08-20 (4th pass) -- boxed layout. Previous passes fixed
// vertical spacing and moved VOL/SIG below the band, but everything still
// read as loose floating text lines. Elements needed
// more presence: the tuning band, the level meters, and the station info
// are now each their own bordered panel (box-drawing chars, natively
// supported by the grid -- see term.js's join-column handling for the
// U+2500-259F range), and the control legend at the bottom gets the same
// filled-background treatment as the title bar instead of floating dim
// text. Box widths all match (columns 2-77) for a consistent frame.
export const DIAL_X0 = 4
export const DIAL_X1 = 75
export const BOX_X0 = 2
export const BOX_X1 = 77

// Row 1 sits blank between the title bar and STATUS_Y. The brand-plate
// nameplate briefly lived here (10th pass) but moved into the title bar
// itself in the 11th pass -- this row is free again.
// 23rd pass: it briefly doubled as a transient home for a "[C] DISPLAY"
// mode toast (flashDisplayMode()). 31st pass: that toast was removed --
// the antenna pane's persistent mode strip (drawModeStrip()) already shows
// the same thing, so the transient one was redundant -- a cool idea but
// no longer needed. This row is genuinely free again except
// for the guide overlay (15th pass), which still claims it for its own
// header while open (see key()).
export const DISPLAY_MODE_Y = 1
export const STATUS_Y = 2
// Fixed interior width for the status word inside setStatus()'s brackets
// (18th pass) -- longest status string in use is "BUBBLEGUM PINK" (14
// chars, one of the display-mode names flashStatus() announces as of the
// 38th pass; "POWERING DOWN" was the 13-char high-water mark before that).
// Padding every status word to this width keeps the whole "● [ STATUS ]"
// readout a constant length so the LED never shifts position between
// transitions. Bump this if a longer status string is ever added.
export const STATUS_TEXT_WIDTH = 14
// 38th pass: per-character stagger of the status row's typewriter reveal
// (see setStatus). Short enough that the longest string still lands well
// inside a quarter second -- this is punctuation, not an animation to sit
// through.
export const STATUS_REVEAL_MS = 18

export const TUNER_TOP_Y = 3
export const SCALE_Y = 4
export const DIAL_Y = 5
export const FREQ_Y = 6
export const TUNER_BOT_Y = 7

// ON AIR moved above LEVELS 2026-08-20 (5th pass) -- what's actually
// playing matters more than the volume/signal meters, so it gets the
// higher-priority slot right under the tuner, for better priority and user
// experience.
// 7th pass (same day): split the single ON AIR box into two -- STATION
// (callsign + tagline, identity, doesn't change on a track skip) and NOW
// PLAYING (title/artist + progress bar + play state, changes on every
// track). Station info needed to be broken out from current
// playing song info, since combined it read as one blob.
// 8th pass (same day): the progress bar and play-state indicator merged
// onto one PLAYBACK_Y row (drawPlayback) -- they're both about playback
// status and there was no reason they needed separate lines. That freed a
// row, spent on a blank divider inside LEVELS between the real VOL/SIG
// meters and the decorative VU row, so VU reads as its own thing instead
// of fusing into one solid block with the meters above it (previously
// read as one levels blob).
// 9th pass (same day): VOL needed further separation from SIG too,
// so LEVELS gets a second divider. Paid for by dropping the blank spacer
// row between TUNER and STATION -- those two boxes now sit border-to-
// border like NOWPLAYING/METERS already did, which is consistent rather
// than a special case.
export const STATION_TOP_Y = 8
export const STATION_Y = 9
export const TAGLINE_Y = 10
export const STATION_BOT_Y = 11

export const NOWPLAYING_TOP_Y = 12
export const TRACK_Y = 13
export const PLAYBACK_Y = 14
export const NOWPLAYING_BOT_Y = 15

export const METERS_TOP_Y = 16
export const VOL_Y = 17
export const VOL_SIG_DIVIDER_Y = 18
export const SIG_Y = 19
export const VU_DIVIDER_Y = 20
export const VU_Y = 21
export const METERS_BOT_Y = 22

// The four box-bottom rows, and each one's RESTING attribute once whatever
// touched it settles back down. Three of the four are the panel-standard
// MUTED; NOW PLAYING is the "hero" box (see drawChrome's note) and rests one
// notch brighter, at BOLD. Anything that flashes a cell on one of these rows
// and later restores it -- the always-on idle phosphor shimmer, crtIdleEvent's
// tear event -- has to look this up per row rather than hardcoding MUTED, or
// every cell it touches on the NOW PLAYING border gets quietly downgraded to
// MUTED and never brightens back up on its own. (Found live, 42nd pass: the
// NOW PLAYING border was visibly losing brightness cell by cell over a
// session, only recovering on the next power cycle's full chrome redraw --
// exactly that. playBootFlicker() hit this same trap once already, in the
// 30th pass, and fixed it locally for its own uniform boot-flicker settle;
// this generalizes that fix for every other consumer of these four rows.)
export const BOX_BOTTOM_ROWS = [TUNER_BOT_Y, STATION_BOT_Y, NOWPLAYING_BOT_Y, METERS_BOT_Y]
export const BOX_BOTTOM_REST_ATTR = new Map([
  [TUNER_BOT_Y, MUTED],
  [STATION_BOT_Y, MUTED],
  [NOWPLAYING_BOT_Y, BOLD],
  [METERS_BOT_Y, MUTED],
])
// The idle shimmer's brief pre-restore dip, one brightness notch below each
// row's own rest level (term.js: FAINT 100 < DIM 150 < MUTED 180 < BOLD/
// NORMAL ~205) -- NOT a universal DIM. A flat DIM read as an invisible
// 30-unit dip on the three MUTED rows (150 vs 180) but a much more obvious
// 55-unit dip PLUS a momentary bold-to-normal face change on NOW PLAYING
// (150 vs BOLD's ~205), since that row rests a full notch brighter than the
// others (see BOX_BOTTOM_REST_ATTR). Found live, 42nd pass, right after
// fixing the rest-attribute bug above -- same row, new symptom, same fix
// shape: don't hardcode one attribute for all four rows.
export const BOX_BOTTOM_FLASH_ATTR = new Map([
  [TUNER_BOT_Y, DIM],
  [STATION_BOT_Y, DIM],
  [NOWPLAYING_BOT_Y, MUTED],
  [METERS_BOT_Y, DIM],
])

// LEVELS split (18th pass -- room down in the levels area could be halved,
// with levels on one side and something else on the
// other) -- VOL/SIG/VU meters, which never actually needed the box's full
// ~74-column interior (their compact "LABEL [bar] NN" text just used to
// sit centered in a lot of empty space), now live in the left half only.
// The right half holds the animated antenna glyph (see drawAntenna()).
// METERS_DIVIDER_X is the vertical divider's column; interior left range is
// BOX_X0+1..METERS_DIVIDER_X-1, right range is METERS_DIVIDER_X+1..BOX_X1-1.
export const METERS_DIVIDER_X = 39

// GIAL nameplate (19th pass) -- retired 23rd pass. Was always a stated
// placeholder ("for now", "not a final wordmark" -- see git history),
// replaced with the PWR/AIR/STEREO/MONO/MUTE indicator panel, then (29th
// pass) with the animated antenna glyph (drawAntenna()) in the same LEVELS
// right half.

export const HINT_Y1 = 23
export const HINT_Y2 = 24
// 50th pass -- the visualizer's effect canvas used to run rows 1..HINT_Y1-1
// (i.e. through 22) with a two-row footer under it. The track position bar
// (live QA: an inline bar on the track row bumps into the title
// on longer song/artist pairs, which it does -- 44 cols for a title is not
// enough often enough) got its own row, so every effect stops one row
// earlier and the footer is three rows instead of two. Effects bound their
// loops with VIZ_BOT rather than HINT_Y1 for exactly that reason; anything
// that still says HINT_Y1 inside an effect is a bug that will get painted
// over by the footer every quarter second.
//
// The bar sat on TOP of the footer at first, drawn non-inverse so its fill
// read lit-on-dark like the NOW PLAYING bar does. Live QA flagged it as
// feeling out of place on the top row, better suited to the
// bottom row, inverted -- right on both counts. On top it read as a
// stray element floating between the effect and the chrome; on the bottom,
// inverse like the two rows above it, the whole footer reads as one solid
// block with the bar as its base. The polarity flips as a consequence and
// that turns out to be the better look anyway: on an inverse row '█'
// rasterises DARK and the trough stays lit (see term.js's `inv ? !on :
// on`), so progress reads as a dark bar eating into a lit strip.
//
// The visualizer no longer reuses HINT_Y1/HINT_Y2 for its own two text
// rows either -- those are the MAIN screen's hint rows (23/24) and the
// footer now starts a row above them.
export const VIZ_BOT = 22
export const VIZ_INFO_Y1 = VIZ_BOT
export const VIZ_INFO_Y2 = VIZ_BOT + 1
export const VIZ_BAR_Y = VIZ_BOT + 2

// --- mobile lite layout (45th pass) -------------------------------------
// A second, much smaller layout, live only when MOBILE_LITE picked the
// narrow GRID in config.js -- see the import comment above. Column/row
// literals here, unlike the desktop block above, since the mobile GRID is a
// fixed 42x22 whenever this path runs at all (config.js decides one grid or
// the other before this module even runs, never both). Just the identity
// essentials: station, now playing, status, a touch-gesture legend instead
// of the keyboard one. No dial, no LEVELS/antenna instrument panel, no
// clock/brand-plate -- all of that reads as noise at this size and none of
// it is interactive on a device with no keyboard and no drag-to-seek.
export const MBOX_X0 = 1
export const MBOX_X1 = 40
// 2026-08-22, round 3 -- status was bumped up too close to
// the header, moved from row 2 to row 3, trading away the blank row
// that used to sit between status and the STATION box.
// 2026-08-22, round 4 -- reverted back to row 2. The real problem wasn't
// this row's position, it was that mobileDrawChrome() painted an inverse
// (highlighted) blank across row 1 too, so the header read as a two-row
// bar with status crowded right under it regardless of which row status
// was on. With that fixed (see mobileDrawChrome), row 1 is real blank
// space again and this can go back to where it was -- which also restores
// the gap between status and the STATION box that round 3's move had
// traded away -- round 4 needed that gap restored.
export const MSTATUS_Y = 2
export const MSTATION_TOP_Y = 4
// Hints are pinned to the bottom of the 22-row grid. Everything between the
// STATION box and the hints -- NOW PLAYING, the widget row -- is computed by
// mobileLayout() below rather than fixed, so a one-line tagline or track
// title actually reclaims its row instead of leaving it blank.
export const MHINT_Y1 = 20
export const MHINT_Y2 = 21
// 2026-08-22 -- VU and signal were too close to each other, so they were
// put on the same line, spread out from each other. VU sits left
// of this column, SIG sits right of it, on one shared widget row instead of
// two stacked ones. Column left blank as the gap between them rather than
// drawing a divider glyph -- the STATION/NOW PLAYING boxes are the only
// bordered elements on this screen, and a widget row divider would compete
// with them.
export const MWIDGET_DIVIDER_X = 21

// 2026-08-22 -- the layout of text in the boxes wasn't using the
// space well, and there was room to put some fun things below now playing. Row
// positions for everything between the STATION box and the hint footer,
// derived from how many lines the current tagline/track title actually need
// (1 or 2 each -- see wrapLines()). A short tagline or title collapses its
// box by a row instead of leaving a blank line, and that reclaimed space
// becomes room for the VU/SIG widget row. Recomputed by mobileRelayout()
// whenever either line count changes; mobileShowStation/mobileShowTrack read
// the current one off this._mLayout rather than a fixed constant.
export function mobileLayout(tagLines, trackLines) {
  const top = MSTATION_TOP_Y
  const stationCall = top + 1
  const stationTag1 = top + 2
  const stationTag2 = tagLines >= 2 ? top + 3 : null
  const stationBot = top + 2 + tagLines
  // 2026-08-22, round 3 -- needed another space under now playing and
  // the widgets. That gap has to come from somewhere in a fixed 22-row
  // grid, so this donates the blank row that used to sit between the
  // STATION box and the NOW PLAYING box (npTop was stationBot+2): the two
  // boxes now sit flush against each other, and the reclaimed row moves
  // down to separate npBot from widgetRow instead, which is the gap that
  // was actually asked for this round.
  const npTop = stationBot + 1
  const npTrack1 = npTop + 1
  const npTrack2 = trackLines >= 2 ? npTop + 2 : null
  const npArtist = npTop + 1 + trackLines
  // 2026-08-22 -- needed a now playing bar with playback bar etc like
  // the full version. One more row inside the box for the
  // progress bar, same place desktop's PLAYBACK_Y sits relative to TRACK_Y.
  const npProgress = npArtist + 1
  const npBot = npProgress + 1
  // 2026-08-22 -- VU and signal were too close to each other, spread out
  // onto the same line, then the fld changing number widget and a more
  // obvious mute off/on were added --
  // two widget rows: VU|SIG, then FLD|MUTE directly below.
  // 2026-08-22, round 2 -- needed some space vertically between the
  // first row of widgets and the second. One full blank row before
  // widgetRow2.
  // 2026-08-22, round 3 -- widgetRow itself moved back off npBot (was +1,
  // i.e. no gap at all) to +2, using the row donated by npTop above, so
  // there's now a blank row between the NOW PLAYING box and the widgets too.
  // Worst case (2-line tagline + 2-line title) still lands widgetRow2 one
  // row before MHINT_Y1 with no overlap -- verified in mobileLayout(2,2).
  const widgetRow = npBot + 2
  const widgetRow2 = widgetRow + 2
  return {
    tagLines, trackLines,
    stationTop: top, stationCall, stationTag1, stationTag2, stationBot,
    npTop, npTrack1, npTrack2, npArtist, npProgress, npBot,
    widgetRow, widgetRow2,
    hint1: MHINT_Y1, hint2: MHINT_Y2,
  }
}

/** Centre text, clamped so it never starts off-grid (a too-long string
 *  would otherwise centre to a negative x and get silently clipped/garbled
 *  at both edges -- this is what broke the hint row before). */
export function centerX(cols, text) {
  return Math.max(0, Math.floor((cols - text.length) / 2))
}

/** Same idea as centerX, but centered within an arbitrary [x0, x1] column
 *  range instead of the full grid width (18th pass) -- used by the LEVELS
 *  meters now that they're confined to the box's left half rather than its
 *  full interior. */
export function centerXRange(x0, x1, text) {
  return x0 + Math.max(0, Math.floor((x1 - x0 + 1 - text.length) / 2))
}

// Date/time module (15th pass -- added date and time as a
// module). Fixed-width "MM/DD HH:MM" (always 11 chars) so drawClock() can
// write it in place every tick without needing to blank first.
// 16th pass -- seconds were distracting, and too dim/wrong spot in
// the title bar -- dropped :SS. The tick timer still fires every second
// (drawStandbyClock/scan timers elsewhere rely on the same cadence being
// cheap), but the string itself only actually changes once a minute now,
// so nothing visibly flickers.
export function formatClock(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Hard-cap a string to maxLen, marking the cut with "..." (not the U+2026
 *  ellipsis glyph -- the bitmap font may not have it, and a missing glyph
 *  silently falls back to "?", which reads worse than three periods).
 *  BUG FIXED 2026-08-20 (9th pass): centerX only clamped the START
 *  position so a string never began off-grid, but never limited the
 *  string's own length -- a long track/artist combo (e.g. "An Ending
 *  (Ascent) [arr. David Le Page] -- Brian Eno / Orchestra of the Swan")
 *  just ran straight through the STATION/NOW PLAYING box's side borders
 *  and off the edge of the 80-column grid. Every track line now goes
 *  through this before being centered. */
export function truncate(str, maxLen) {
  if (str.length <= maxLen) return str
  if (maxLen <= 3) return str.slice(0, Math.max(0, maxLen))
  return str.slice(0, maxLen - 3) + '...'
}

// 45th pass -- word-wrap into up to maxLines lines of maxWidth, rather than
// truncate()'s single-line ellipsis. Mobile's narrower columns cut off
// station names and track titles that fit fine on desktop's wider boxes;
// the whole name and title needed to stay visible, using
// additional lines as needed. Greedy fill; if there's still leftover text
// after maxLines, the last line gets truncate()'s ellipsis treatment so it's
// at least visibly cut off rather than silently dropped.
export function wrapLines(text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  let i = 0
  for (; i < words.length; i++) {
    const word = words[i]
    const candidate = cur ? `${cur} ${word}` : word
    if (candidate.length <= maxWidth) { cur = candidate; continue }
    if (!cur) { lines.push(truncate(word, maxWidth)); continue } // one word wider than the whole box
    lines.push(cur)
    cur = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && cur) { lines.push(cur); i = words.length }
  if (i < words.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines)
    const last = lines[maxLines - 1] ?? ''
    // 2026-08-25 audit (caught by tests/helpers.test.mjs): this used to fall
    // back to truncate(last, maxWidth), which returns a line that already
    // fits UNCHANGED -- so whenever the last line was within 3 chars of the
    // box width the overflow got cut with no marker at all. Always mark.
    lines[maxLines - 1] = last.length + 3 <= maxWidth ? `${last}...` : `${last.slice(0, Math.max(0, maxWidth - 3))}...`
  }
  return lines
}

/** First n tracks from a station's tracks array, deduped so no artist
 *  repeats -- used by the guide's per-station "SAMPLE TRACKS" list (32nd
 *  pass -- the same artist should not be listed more than once). Walks the
 *  array in its existing order rather than reshuffling, so the sample
 *  still reflects what's actually first in rotation -- it just skips a
 *  repeat artist's 2nd/3rd song in favor of the next distinct one, rather
 *  than picking artists at random.
 *
 *  35th pass BUG FIX -- Brian Eno as a sample track didn't work on
 *  drift mode's guide page: the original dedup keyed on the exact
 *  `artist` string, so a collaboration credit like "Brian Eno / Orchestra of
 *  the Swan" didn't register as the same artist as a solo "Brian Eno"
 *  credit elsewhere in the same station, and both slipped into the sample
 *  list -- reading as the same artist listed twice. Now dedups on the
 *  primary credited name (text before the first "/", "&", ",", "feat.",
 *  "ft.", " x ", or " and ", with a leading "The " stripped), so
 *  differently-billed credits for the same act collapse to one entry. */
export function primaryArtist(artist) {
  const first = artist.split(/\s*(?:\/|,|&|\sfeat\.|\sft\.|\sx\s|\sand\s)\s*/i)[0].trim()
  return first.replace(/^The\s+/i, '').toLowerCase()
}
export function sampleTracks(tracks, n) {
  const seen = new Set()
  const out = []
  for (const t of tracks) {
    const key = primaryArtist(t.artist)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= n) break
  }
  return out
}

/** Greedy word-wrap: splits text into lines no wider than maxWidth,
 *  breaking only on spaces. 32nd pass, for the guide's per-station
 *  description block -- unlike every other guide line (fixed-format
 *  status/header text that either fits or gets truncate()'d), a
 *  description is free-form prose, so it needs to actually wrap rather
 *  than get cut off with "...". */
export function wordWrap(text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxWidth && cur) { lines.push(cur); cur = w }
    else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Blank the whole grid (2026-08-25 audit -- this same two-line loop sat in
 *  seven places: init's first paint, both power sequences, the guide's open
 *  and close, the visualizer's entry and exit). */
export function clearGrid(term) {
  for (let y = 0; y < term.rows; y++)
    for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
}
/** m:ss for a playback clock (was a local `fmt` in three draw methods). */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** Box-drawing helpers. Borders are drawn once (in init) and never touched
 *  again -- every row-content function below clears only its own interior
 *  span, not the full canvas width, so the frame stays put across redraws. */
// labelX1 (18th pass, defaults to x1) lets a label be centered over a
// narrower span than the box's full width -- LEVELS uses this to keep its
// title clear of the METERS_DIVIDER_X vertical divider added the same
// pass, without changing how every other (unsplit) box's label centers.
export function drawBoxTop(term, y, x0, x1, label, attr, labelX1 = x1) {
  const inner = labelX1 - x0 - 1
  const tag = label ? ` ${label} ` : ''
  const tagX = tag ? x0 + 1 + Math.floor((inner - tag.length) / 2) : -1
  term.put(x0, y, '┌', attr)
  for (let x = x0 + 1; x < x1; x++) {
    if (tag && x >= tagX && x < tagX + tag.length) term.put(x, y, tag[x - tagX], attr)
    else term.put(x, y, '─', attr)
  }
  term.put(x1, y, '┐', attr)
}
export function drawBoxBottom(term, y, x0, x1, attr) {
  term.put(x0, y, '└', attr)
  for (let x = x0 + 1; x < x1; x++) term.put(x, y, '─', attr)
  term.put(x1, y, '┘', attr)
}
export function drawBoxSide(term, y, x0, x1, attr) {
  term.put(x0, y, '│', attr)
  term.put(x1, y, '│', attr)
}

/** Speaker-grille perforation pattern for the LEVELS box divider rows
 *  (10th pass). Reuses '·', already confirmed present in the bitmap font
 *  (the idle-shimmer dots on the dial use the same glyph). */
export function drawGrille(term, y, x0, x1) {
  for (let x = x0 + 1; x < x1; x++) {
    term.put(x, y, (x - x0) % 2 === 1 ? '·' : ' ', FAINT)
  }
}


// 63rd pass -- STANDBY splash wordmark, built for a better standby screen:
// SIGNAL wordmark, then version number, then standby state, then power-on
// hint. Same hand-authored 5x7 block-letter convention NEON SIGN's font
// once used (that effect was removed in the 65th pass) -- a separate font
// since this one belongs to the app chrome, not a station effect. Static
// and always fully lit, clean, over an ambient flicker -- reads as a
// stable logo, not a scene.
// No per-letter colour: the CRT is single-tint beam intensity (see
// term.js), so the depth/impact of the reference image comes from an offset
// shadow duplicate (drawn one cell down-right, FAINT) behind the bright
// glyph instead of a colour gradient -- see drawStandbyLogo().
export const STANDBY_LOGO_FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
}
export const STANDBY_LOGO_WORD = 'SIGNAL'
export const STANDBY_LOGO_LETTER_W = 5
export const STANDBY_LOGO_LETTER_H = 7
export const STANDBY_LOGO_GAP = 1
// Rows used top-to-bottom below the logo's own STANDBY_LOGO_LETTER_H: a
// blank line (the logo's bottom row casts its shadow one cell down, into
// this row -- without it the shadow collides with VERSION_TAG), then
// VERSION_TAG, another blank, STANDBY, the power-on hint, another blank,
// then the clock -- 7 in total. drawStandbyClock() computes its row from
// this same function on every independent per-second tick (it doesn't
// redraw the rest of the screen), so the two can never drift apart.
export const STANDBY_BLOCK_TAIL_ROWS = 7
// 63rd pass -- live QA found naively centering left the logo's bright rows
// straddling STATION_Y on desktop, which collided with powerDown()'s
// phosphor burn-in ghost (54th pass): it draws the last-locked callsign
// at that fixed row on its way into STANDBY, and sliced right through the
// middle of the wordmark. The 63rd pass fixed it by nudging this whole
// layout up whenever that collision was possible -- but that nudge ran
// unconditionally, every time STANDBY is drawn (fresh page load included,
// not just the power-down transition), which is why STANDBY always sat
// noticeably above true center instead of just during that one beat.
// 67th pass -- reversed: this layout is now always true-centered, full
// stop, and the collision is instead handled where it actually happens --
// powerDown() itself skips drawing that one ghost on the rare occasion it
// would land on the logo. A stronger, reliably-centered STANDBY screen
// matters more than one rare transient ghost frame.
export function standbyLayout(term, mobile) {
  const top = Math.floor((term.rows - (STANDBY_LOGO_LETTER_H + STANDBY_BLOCK_TAIL_ROWS)) / 2)
  return {
    logoTop: top,
    logoBottom: top + STANDBY_LOGO_LETTER_H - 1,
    versionY: top + STANDBY_LOGO_LETTER_H + 1,
    standbyY: top + STANDBY_LOGO_LETTER_H + 3,
    hintY: top + STANDBY_LOGO_LETTER_H + 4,
    clockY: top + STANDBY_LOGO_LETTER_H + 6,
  }
}
