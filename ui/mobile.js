// SIGNAL -- the mobile lite (42x22) screen and its touch gestures. Mixed
// into the program object -- `this` is the program. Split out in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { maybeRetryAudioTapInGesture } = await import(`../audio/tap.js?v=${V}`)
const { VERSION_TAG } = await import(`../constants.js?v=${V}`)
const { MBOX_X0, MBOX_X1, MSTATUS_Y, MWIDGET_DIVIDER_X, centerX, centerXRange, drawBoxBottom, drawBoxSide, drawBoxTop, fmtTime, mobileLayout, truncate, wrapLines } = await import(`../layout.js?v=${V}`)
const { STATION_PRESET_ORDER } = await import(`../stations.js?v=${V}`)
const { nearestStation } = await import(`../tuning.js?v=${V}`)

// 2026-08-27 -- the one threshold that splits a tap from a hold, shared by
// both gestures that gained a held meaning in the mobile pass: one finger
// held powers the set off, two fingers held open the guide. One constant so
// the two can never drift into feeling different, and 500ms because that is
// the value the two-finger colour gesture had already been using as its own
// upper bound since the 45th pass -- this names it rather than adding a
// second, subtly different idea of "held".
//
// Confirmed on a real phone the same day, not just in the harness: 500ms
// reads as a deliberate hold rather than as a laggy tap, in both directions
// (power off, and the two-finger guide). Worth recording because it is the
// one thing about this pass a test cannot tell you -- the suite can only
// assert that >= 500ms powers down and < 500ms mutes, which stays true at
// 200ms or 2000ms while feeling wrong at both. Treat a change here as a
// feel change needing a device, not a number to tune from a hunch.
const TOUCH_HOLD_MS = 500

export default {

  // 45th pass -- mobile's whole frame: wordmark, status line, STATION and
  // NOW PLAYING boxes, a touch-gesture footer instead of the keyboard hint
  // rows. No TUNING BAND/LEVELS boxes at all -- no tuner strip to drive them.
  // 2026-08-22 -- the top header mirrors what desktop has (date, time,
  // SG-1, etc) -- wordmark+clock share row 0 same as
  // desktop's title bar (left/right split instead of centered, so there's
  // room for both); the brand-plate took row 1, which used to just be blank
  // spacing between the title and the status row.
  // 2026-08-22, round 2 -- collapsed to one line, with SG-1 in the
  // middle instead of the full plate text: the two-row mirror read as too
  // heavy on a 42-col phone screen. Back to one row: wordmark left, a short
  // "SG-1" centered (not the full "MODEL SG-1 - SIGNAL RECEIVER" plate),
  // clock right. Row 1 goes back to being blank spacer, same as before the
  // two-row version existed.
  // 2026-08-22, round 4 -- header needed to be one row, not two: the
  // row-1 clear below was STILL painting an inverse (highlighted) blank
  // across the whole row, a leftover from when row 1 carried the brand-plate
  // text. Visually that reads as a solid two-row header bar even with no
  // text on the second row -- inv=1 is what makes a cell part of the "bar"
  // look, not just having text on it. Row 1 now clears to a plain (inv=0)
  // blank, so the header is genuinely one inverse row with real blank space
  // under it, not a header-colored band bleeding into what should be gap.
  mobileDrawChrome(s) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) { term.put(x, 0, ' ', NORMAL, 1); term.put(x, 1, ' ', NORMAL, 0) }
    // 2026-08-22, round 6 -- a lowercase "m" added, so SIGNAL v0.8m --
    // mobile-only suffix on the version tag, distinguishing the
    // mobile build's own title from desktop's plain "SIGNAL v0.8" without
    // touching VERSION_TAG itself (which the Guide's about page and the
    // desktop title bar both also read off of).
    const title = `SIGNAL ${VERSION_TAG}m`
    term.text(2, 0, title, BOLD, 1)
    this.drawClock(s)
    // 2026-08-22, round 5 -- SG-1 was hard to read on mobile; FAINT dims the
    // foreground, and under inv=1 that foreground IS what's drawn against
    // the bright inverse fill -- so a dim foreground on a bright ground is
    // low-contrast, the opposite of what FAINT reads as on a normal (non-
    // inverse) background. DIM instead, matching the clock just above,
    // which uses the same inverse row and wasn't flagged as hard to read.
    const brand = 'SG-1'
    term.text(centerX(term.cols, brand), 0, brand, DIM, 1)
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    this.mobileDrawFrame(s)
  },

  // Draws the STATION box, NOW PLAYING box, and hint footer at the row
  // positions in this._mLayout. Split out from mobileDrawChrome (which only
  // draws the title bar itself) so mobileRelayout() can redraw just this
  // part whenever a line-count change moves everything below the title.
  mobileDrawFrame(s) {
    const { term } = s
    const L = this._mLayout

    drawBoxTop(term, L.stationTop, MBOX_X0, MBOX_X1, 'STATION', MUTED)
    drawBoxSide(term, L.stationCall, MBOX_X0, MBOX_X1, MUTED)
    drawBoxSide(term, L.stationTag1, MBOX_X0, MBOX_X1, MUTED)
    if (L.stationTag2 != null) drawBoxSide(term, L.stationTag2, MBOX_X0, MBOX_X1, MUTED)
    drawBoxBottom(term, L.stationBot, MBOX_X0, MBOX_X1, MUTED)

    drawBoxTop(term, L.npTop, MBOX_X0, MBOX_X1, 'NOW PLAYING', BOLD)
    drawBoxSide(term, L.npTrack1, MBOX_X0, MBOX_X1, BOLD)
    if (L.npTrack2 != null) drawBoxSide(term, L.npTrack2, MBOX_X0, MBOX_X1, BOLD)
    drawBoxSide(term, L.npArtist, MBOX_X0, MBOX_X1, BOLD)
    drawBoxSide(term, L.npProgress, MBOX_X0, MBOX_X1, BOLD)
    drawBoxBottom(term, L.npBot, MBOX_X0, MBOX_X1, BOLD)

    // ASCII only -- the bitmap font doesn't carry every Unicode glyph (a
    // past pass found this the hard way with a couple of star/square glyphs
    // silently rendering as '?'), so this sticks to the same bracket idiom
    // the desktop hint rows use rather than risking arrow glyphs the face
    // may not have.
    // 45th pass: 2-finger tap (display mode/tint) added to the legend
    // alongside the original three.
    // 2026-08-26: line 2 was '[<-/->] STATION   [^/v] TRACK'. Still ASCII,
    // still no risky glyphs -- but it borrowed the DESKTOP bracket idiom,
    // which reads as "press this key" on a device with no keys. Line 1 was
    // already speaking touch ("TAP", "2-TAP") and line 2 was not. Says SWIPE
    // now, which is the actual gesture and costs one column over the
    // brackets it replaces.
    this.mobileDrawHints(s)
  },
  // 2026-08-27 (the mobile pass) -- split out of mobileDrawFrame because
  // line 1 now depends on live state (this.muted), and the frame is only
  // redrawn wholesale. Called per-frame from drawAntenna's mobile branch
  // instead, alongside mobileDrawMuteSwitch -- the natural sibling, since
  // it reflects the same flag. Cheap despite running every frame: cellgrid
  // tracks dirty rows and put() is a no-op for an unchanged cell, so a hint
  // row that has not changed costs nothing downstream.
  //
  // Line 1 is the state-aware one, and it exists because of a first-run
  // problem. A genuinely first-ever mobile visit boots MUTED on purpose
  // (see init -- nothing should play out loud before anyone has touched
  // anything), and that default's own note allows it "as long as it's
  // obvious to the user." It was signalled three ways -- [ MUTED ] in the
  // status row, MUTE [ON ] in the widget row, and this hint -- but not one
  // of them was an INSTRUCTION. "TAP MUTE" labels what tap does; it does
  // not tell someone staring at a silent radio what to do about it. One
  // beat earlier the STANDBY screen says "TAP TO POWER ON" and is
  // perfectly clear; this is the same moment and it taught nothing, so the
  // likeliest first read was that the thing is broken.
  //
  // 2-TAP COLOR left these rows to make room, and did not simply vanish:
  // the guide is reachable by touch now (2-finger hold), and its control
  // list speaks touch, so the least essential gesture is one gesture away
  // instead of occupying a third of the legend. Two rows, not three --
  // mobileLayout's worst case (2-line tagline, 2-line title) puts
  // widgetRow2 at 18, so a third hint row at 19 would sit flush against it.
  mobileDrawHints(s) {
    const { term } = s
    const L = this._mLayout
    if (!L) return
    const line1 = this.muted
      ? 'TAP TO UNMUTE   HOLD POWER   2-HOLD GUIDE'
      : 'TAP MUTE   HOLD POWER   2-HOLD GUIDE'
    const line2 = 'SWIPE L/R STATION   SWIPE U/D TRACK'
    for (let x = 0; x < term.cols; x++) { term.put(x, L.hint1, ' ', NORMAL, 1); term.put(x, L.hint2, ' ', NORMAL, 1) }
    term.text(centerX(term.cols, line1), L.hint1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), L.hint2, line2, NORMAL, 1)
  },

  // Recomputes this._mLayout when the tagline or track title's line count
  // changes (see mobileLayout()), and if it did, wipes and redraws
  // everything below the status row at the new positions. Returns whether a
  // relayout actually happened, so callers know whether the OTHER box (the
  // one they didn't just draw) needs restoring -- a relayout clears the
  // whole zone, station and now-playing both, regardless of which one's
  // line count triggered it.
  mobileRelayout(s, tagLines, trackLines) {
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const cur = this._mLayout
    if (cur.tagLines === tagLines && cur.trackLines === trackLines) return false
    const { term } = s
    this._mLayout = mobileLayout(tagLines, trackLines)
    for (let y = 3; y < term.rows; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    this.mobileDrawFrame(s)
    // Widgets and the playback bar all live in the zone that just got
    // wiped -- redraw them at their new rows immediately rather than
    // waiting for the next VU/antenna tick (up to ~120ms away).
    this.drawVU(s)
    this.drawSignal(s)
    this.drawAntenna(s, 0)
    this.drawPlayback(s)
    return true
  },

  /** Draws the whole status row -- flanking rules plus the bracketed
   *  readout -- with the first `revealed` characters of `text` shown and
   *  the rest blanked. The unrevealed remainder is padded with spaces
   *  rather than shortened, so the bracket is a constant width and the
   *  readout never shifts horizontally mid-reveal. */
  // 45th pass -- plain centered bracket, no flanking rule (BOX_X0/BOX_X1
  // are desktop columns, off the end of the 42-col mobile grid) and no
  // per-character reveal. Every setStatus()/flashStatus() caller across the
  // file funnels through here, so gating this one spot covers all of them
  // -- LOCKED, SEEKING, MUTED/UNMUTED, VOL nn, everything.
  // 2026-08-22: takes inv now too (was silently dropped before, so LOCKED's
  // inverse flash never showed on mobile even though the timer driving it
  // fired correctly).
  mobileDrawStatusRow(s, text, attr, inv = 0) {
    const { term } = s
    const bracket = `[ ${text} ]`
    for (let x = 0; x < term.cols; x++) term.put(x, MSTATUS_Y, ' ', NORMAL, 0)
    term.text(centerX(term.cols, bracket), MSTATUS_Y, bracket, attr, inv)
  },
  // 2026-08-22 -- shares the widget row with mobileDrawVU (VU left, SIG
  // right of MWIDGET_DIVIDER_X); own shorter segment count sized for the
  // half-width rather than reusing desktop's 16 (label wouldn't fit).
  mobileDrawSignal(s, pct) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow
    const segs = 10
    const filled = Math.round(pct * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    const label = `SIG[${bar}]`
    for (let x = MWIDGET_DIVIDER_X + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    term.text(centerXRange(MWIDGET_DIVIDER_X + 1, MBOX_X1 - 1, label), y, label, filled > 0 ? DIM : FAINT)
  },
  // 38th pass: opts.reveal === false draws instantly (no signal-resolve),
  // opts.revealMs shortens/lengthens it. Default is the full reveal --
  // every path that shows a station (lock, guide close, power-on resume)
  // is a moment where a receiver settling onto a signal is the right read.
  // 45th pass -- now resolves out of noise same as desktop, for a better
  // tuner animation -- mobile's station change had
  // nothing but a status-row text flash, since it has no dial to animate.
  // resolveText() is coordinate-generic (takes x/y as params, not baked-in
  // desktop constants), so this is a straight reuse, not new machinery.
  // 2026-08-22: now runs through mobileRelayout() first -- a tagline that
  // fits on one line collapses the STATION box by a row instead of leaving
  // the second row blank, using the box space better, and everything below (NOW PLAYING, the widget
  // row, the hints) shifts up to match.
  mobileShowStation(s, station, opts = {}) {
    const { term } = s
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const maxWidth = MBOX_X1 - MBOX_X0 - 4
    // wrapped across both tagline rows rather than truncated to one,
    // using additional lines as needed. Second row omitted
    // entirely (see mobileRelayout) when the tagline fits on one line.
    const [tag1, tag2] = wrapLines(station.tagline, maxWidth, 2)
    const relaid = this.mobileRelayout(s, tag2 ? 2 : 1, this._mLayout.trackLines)
    const L = this._mLayout
    for (const y of [L.stationCall, L.stationTag1, L.stationTag2]) {
      if (y == null) continue
      for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    }
    const FLAIR = station.glyph || '●'
    // 2026-08-22 -- the station freq added to the now playing line
    // after its name -- mirrors the "GLYPH CALLSIGN GLYPH · FREQ KHZ"
    // convention drawVisualizerInfo() already uses on desktop, rather than
    // inventing a new format. Reserved out of the callsign's truncation
    // budget so a long callsign still leaves room for it instead of pushing
    // the line past the box width.
    const freqPart = ` · ${station.freq.toFixed(1)} KHZ`
    const flairWidth = FLAIR.length * 2 + 2
    const callsign = truncate(station.callsign, maxWidth - flairWidth - freqPart.length)
    const flaired = `${FLAIR} ${callsign} ${FLAIR}${freqPart}`
    const callX = centerX(term.cols, flaired)
    const tag1X = centerX(term.cols, tag1)
    if (opts.reveal === false) {
      term.text(callX, L.stationCall, flaired, BRIGHT)
      term.text(tag1X, L.stationTag1, tag1, MUTED)
      if (tag2) term.text(centerX(term.cols, tag2), L.stationTag2, tag2, MUTED)
    } else {
      const ms = opts.revealMs ?? 260
      this.resolveText(s, callX, L.stationCall, flaired, BRIGHT, ms)
      this.resolveText(s, tag1X, L.stationTag1, tag1, MUTED, ms + 90)
      if (tag2) this.resolveText(s, centerX(term.cols, tag2), L.stationTag2, tag2, MUTED, ms + 90)
    }
    // mobileRelayout() wipes the whole dynamic zone including NOW PLAYING,
    // which this call didn't touch -- restore it instantly (no re-resolve)
    // rather than leaving it blank until something else redraws it.
    if (relaid && this.currentTrack) this.mobileShowTrack(s, this.currentTrack, { reveal: false })
  },
  mobileShowTrack(s, track, opts = {}) {
    const { term } = s
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const maxWidth = MBOX_X1 - MBOX_X0 - 4
    const [t1, t2] = wrapLines(track.title, maxWidth, 2)
    const relaid = this.mobileRelayout(s, this._mLayout.tagLines, t2 ? 2 : 1)
    const L = this._mLayout
    for (const y of [L.npTrack1, L.npTrack2, L.npArtist]) {
      if (y == null) continue
      for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    }
    const artist = truncate(track.artist, maxWidth)
    const t1X = centerX(term.cols, t1)
    const artistX = centerX(term.cols, artist)
    if (opts.reveal === false) {
      term.text(t1X, L.npTrack1, t1, BOLD)
      if (t2) term.text(centerX(term.cols, t2), L.npTrack2, t2, BOLD)
      term.text(artistX, L.npArtist, artist, MUTED)
    } else {
      const ms = opts.revealMs ?? 250
      this.resolveText(s, t1X, L.npTrack1, t1, BOLD, ms)
      if (t2) this.resolveText(s, centerX(term.cols, t2), L.npTrack2, t2, BOLD, ms)
      this.resolveText(s, artistX, L.npArtist, artist, MUTED, ms + 90)
    }
    if (relaid && this.lockedStation) this.mobileShowStation(s, this.lockedStation, { reveal: false })
  },
  // 2026-08-22 -- condensed single-row version for the NOW PLAYING box's
  // npProgress row: a leading state icon (desktop spells PLAYING/PAUSED/
  // BUFFERING out in full, which doesn't fit here) then a shorter bar and
  // "m:ss/m:ss" with no spaces around the slash. State reads through the
  // icon and the row's attr (BRIGHT/MUTED/DIM) rather than a text label.
  mobileDrawPlayback(s) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.npProgress
    for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    if (this.mode !== 'locked') return
    if (!this.ready || !this.player) return
    let cur, dur
    try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
    if (!(dur && isFinite(dur) && dur > 0)) return
    const fmt = fmtTime
    // 16 segments, not desktop's 28 -- with the icon, brackets and a
    // worst-case "12:34/45:67"-shaped time pair, this still needs to fit
    // inside ~38 usable columns.
    const segs = 16
    const filled = Math.round(Math.min(1, cur / dur) * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '·'
    const icons = { playing: '>', paused: '=', buffering: '.' }
    const attrs = { playing: BRIGHT, paused: MUTED, buffering: DIM }
    const icon = icons[this.playState] || ' '
    const attr = attrs[this.playState] || FAINT
    // 2026-08-22 -- the progress bar was too bright; matched the weight
    // between desktop and mobile -- this used to paint icon+bar+time as one BRIGHT/MUTED/DIM
    // string, so the bar itself flared BRIGHT whenever playing. Desktop's
    // drawPlayback never does that: the bar+time (barPart) is always FAINT,
    // and only the state label (labelPart) carries BRIGHT/MUTED/DIM. Same
    // split here -- the icon is the "label", bar+time stays FAINT.
    const iconPart = icon
    const barPart = ` [${bar}] ${fmt(cur)}/${fmt(dur)}`
    const full = iconPart + barPart
    const startX = centerX(term.cols, full)
    term.text(startX, y, iconPart, attr)
    term.text(startX + iconPart.length, y, barPart, FAINT)
  },
  // drawTriBand -- the BASS/MID/TREBLE bar meter that briefly held SIG_Y in
  // the 58th pass before drawEqRibbonLeft() took the row -- was left in place
  // as orphaned code per this file's old convention; removed 2026-08-25
  // (audit), together with its bandSamples/bandVelocities state.
  // 2026-08-22 -- shares the widget row with mobileDrawSignal (VU left of
  // MWIDGET_DIVIDER_X, SIG right). Own shorter trace tail sized for the
  // half-width -- this.vuTrace itself is unchanged (still 16 samples,
  // shared with desktop's physics), this just renders fewer of them.
  mobileDrawVU(s, playing) {
    if (!this._mLayout) return
    const { term } = s
    const chars = '▁▁▂▃▄▅▆▇█'
    const n = 8
    let bar = ''
    for (const v of this.vuTrace.slice(-n)) bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(v * (chars.length - 1))))]
    const y = this._mLayout.widgetRow
    const label = `VU ${bar}`
    for (let x = MBOX_X0 + 1; x < MWIDGET_DIVIDER_X; x++) term.put(x, y, ' ')
    term.text(centerXRange(MBOX_X0 + 1, MWIDGET_DIVIDER_X - 1, label), y, label, playing ? DIM : FAINT)
  },
  // 2026-08-22 -- mobile's second widget row: TRI (was FLD, then briefly
  // BPM -- see drawFieldReadout's header comment; renamed to "TRI,
  // for 'totally real indicator'" since the underlying number is still the
  // detected-tempo/filler blend, just not always a confident lock) left of
  // MWIDGET_DIVIDER_X, MUTE right of it, same split as VU/SIG on the row
  // above. Physics/fallback are a direct port of drawFieldReadout's (own
  // this.fieldSample/fieldVelocity, shared with desktop -- there's only
  // one receiver) since there's no shared antenna-pane geometry to hang a
  // common helper off of here.
  mobileDrawFieldReadout(s, state) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow2
    for (let x = MBOX_X0 + 1; x < MWIDGET_DIVIDER_X; x++) term.put(x, y, ' ')
    // 2026-08-23 -- on mobile the real detected tempo is fed by the MIC tier
    // (tab capture never runs there); same readout, same spring, as desktop
    // -- see _fieldReadout (2026-08-25 audit: was a copy of it).
    const [label, attr] = this._fieldReadout(state)
    term.text(centerXRange(MBOX_X0 + 1, MWIDGET_DIVIDER_X - 1, label), y, label, attr)
  },
  // "more obvious mute off/on" -- direct port of drawMuteSwitch,
  // just repositioned to the widget row's right half.
  mobileDrawMuteSwitch(s) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow2
    for (let x = MWIDGET_DIVIDER_X + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    const label = this.muted ? 'MUTE [ON ]' : 'MUTE [OFF]'
    term.text(centerXRange(MWIDGET_DIVIDER_X + 1, MBOX_X1 - 1, label), y, label, this.muted ? BRIGHT : FAINT)
  },

  // Mouse-drag-to-seek (drag distance -> frequency delta) was removed here
  // in the 44th pass, removing the mouse's ability to scan the dial --
  // alongside dropping mouse input as a visualizer-wake source, see
  // key()'s comment, so a mouse can sit idle on top of a running SIGNAL tab
  // without either scanning the dial by accident or knocking the visualizer
  // down). Touch keeps its own separate tap/swipe gesture layer just below
  // -- that was never mouse input and still needs a way in on a device with
  // no keyboard at all.

  // 22nd pass -- mobile has no keyboard, so it had no way to power on, lock
  // a station, or change stations at all before this. Tap (minimal
  // movement, quick) powers on when off, closes the guide if somehow open,
  // otherwise toggles play/pause; a clean horizontal swipe steps to the
  // next/previous station in dial order (same list [1-9] presets use).
  // Deliberately its own gesture layer rather than reusing the mouse-drag
  // seek math above -- a thumb swipe covering the whole screen width isn't
  // the same gesture as a precise mouse drag on the dial.
  // 45th pass -- added a clean vertical swipe to skip the track, giving
  // mobile the same three controls the desktop keyboard has (power, mute,
  // station, track) without adding any on-screen UI. Horizontal/vertical
  // are treated as exclusive per-gesture (whichever axis moved more wins),
  // so a swipe can't accidentally trigger both a station change and a skip.
  onTouchStart(s, e) {
    // 2026-08-22, round 4 -- true for the rest of this function's
    // synchronous body (including anything it calls directly, like
    // powerUp()/tryLock()/loadTrack() further down the stack), so
    // loadTrack() can tell a real tap/swipe apart from an async callback
    // (track ended, a player error) and only unmute immediately for the
    // former. try/finally guarantees this clears even on an early return.
    this._inUserGesture = true
    try {
    if (this.poweredOn) this._lastInputAt = Date.now()
    // 2026-08-22 (bug report, round 2 -- repro: power on,
    // silent; swipe to a new station, still silent; tap mute (shows MUTED,
    // still silent); tap it again to unmute -- THEN it plays. The
    // loadTrack()/PLAYING-handler mute-then-unmute from the previous round
    // gets the mute half right (muted autoplay is unconditionally allowed,
    // which is why playback actually starts and the UI shows real
    // progress/track info) but the auto-unmute half doesn't reliably work
    // -- unmuting a video by script is ALSO gated behind a live user
    // gesture on the stricter mobile browsers, and the PLAYING event that
    // triggers it fires from an async postMessage callback, not from
    // inside a touch handler. So it plays, but stays muted forever, until
    // a mute-tap-then-unmute-tap supplies the real gesture the
    // unMute() call needed all along -- the second tap is what actually
    // works, same as manually doing it before this fix existed.
    // Fix: stop trying to unmute from the async callback. Leave
    // _pendingUnmute set there instead, and flush it here, at the top of
    // the touch handler that already runs on every tap AND every swipe --
    // this IS a live gesture, so the very next touch after playback starts
    // (which on a phone is usually within a second or two) unmutes for
    // real, with no dedicated "tap mute twice" dance required.
    // 2026-08-22, round 3 (bug: "when I tap, it mutes after a tiny fraction
    // of time hearing audio") -- this flush worked, but the SAME tap then
    // fell through to onTouchEnd's plain single-tap gesture, which reads a
    // quick, minimal-movement tap as an explicit "toggle mute" request (see
    // the TAP MUTE hint) -- so the tap that had just un-muted the player
    // immediately re-muted it a beat later, with no other tap in between.
    // Flagging this touch as a flush-only touch tells onTouchEnd not to
    // also treat it as a manual mute toggle.
    this._suppressTapMuteToggle = false
    if (this._pendingUnmute && !this.muted && this.ready && this.player) {
      this._pendingUnmute = false
      this.player.unMute()
      this.applyVolume()
      this._suppressTapMuteToggle = true
    }
    // 2026-08-23 (live audio tap) -- see key()'s twin call: deferred mic
    // retry for gesture-gating browsers, flushed on any real touch.
    maybeRetryAudioTapInGesture(this, s)
    if (this.visualizerActive) { this.exitVisualizer(s); e.preventDefault(); return }
    if (e.target && e.target.closest && e.target.closest('#ytDock')) return
    // 45th pass -- two-finger tap cycles display mode/tint, the touch
    // equivalent of desktop's [C]. Its own tracked gesture rather than
    // folded into the single-finger tap/swipe state below -- a second
    // finger landing mid-swipe cancels whatever single-finger gesture was
    // in flight rather than being read as part of it.
    if (e.touches.length === 2) {
      this._touchActive = false
      this._twoFingerActive = true
      this._twoFingerStartTime = Date.now()
      e.preventDefault()
      return
    }
    if (e.touches.length !== 1) { this._touchActive = false; this._twoFingerActive = false; return } // ignore 3+ fingers
    this._touchActive = true
    const t = e.touches[0]
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    this._touchStartTime = Date.now()
    e.preventDefault()
    } finally { this._inUserGesture = false }
  },
  onTouchEnd(s, e) {
    this._inUserGesture = true
    try {
    if (this._twoFingerActive) {
      // BUG FIXED (found during live mobile QA -- color change seemed
      // iffy): real fingers never lift in perfect sync, so touchend fires once per
      // finger, not once for the pair. This used to clear _twoFingerActive
      // on the FIRST of those two events (when e.touches.length was still
      // 1, one finger still down), so by the time the second finger's
      // touchend actually arrived with e.touches.length === 0, the flag was
      // already false and the whole branch was skipped -- the gesture could
      // only ever fire on the rare tick where both releases coalesced into
      // one event. Now it only resolves (and only THEN clears the flag)
      // once every finger is confirmed up.
      if (e.touches.length > 0) return
      this._twoFingerActive = false
      const twoHeld = Date.now() - this._twoFingerStartTime
      if (twoHeld < TOUCH_HOLD_MS && this.poweredOn && !this.guideOpen) {
        this.cycleDisplayMode(s)
      } else if (twoHeld >= TOUCH_HOLD_MS && !this.guideOpen) {
        // 2026-08-27 -- the guide gets a touch trigger at last. It is the
        // one control the README listed under "Known gaps" that costs
        // something real: the guide is where every OTHER gesture is
        // explained, and mobile is exactly the tier that cannot discover
        // them. It had also quietly become dead weight -- ui/guide.js
        // carries narrow branches for all three page types, and two live
        // bugs were fixed in them on 2026-08-27 in rendering no phone could
        // reach. Either it is reachable or we stop paying for it.
        //
        // Two-finger HOLD rather than a new gesture: the < 500ms half of
        // this same branch has always been colour, and the >= 500ms half
        // did nothing at all, so this splits an existing gesture instead of
        // inventing one. Passing !poweredOn as fromStandby matches the
        // desktop [G]-from-STANDBY path -- closeGuide then lands back on
        // STANDBY instead of building powered-on chrome over a dark set.
        this.openGuide(s, !this.poweredOn)
      }
      return
    }
    if (!this._touchActive) return
    this._touchActive = false
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - this._touchStartX
    const dy = t.clientY - this._touchStartY
    const dt = Date.now() - this._touchStartTime
    const TAP_SLOP = 12
    const SWIPE_MIN = 40
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
      // 2026-08-27 -- a press that stays put is now read by DURATION as
      // well. The guide closes on any press, held or not (forgiving: it is
      // an overlay, and there is nothing else to mean down there), and so
      // does power-on, since with the set dark there is no competing action
      // to confuse a slow press with.
      if (this.guideOpen) { this.closeGuide(s); return }
      if (!this.poweredOn) { this.powerUp(s); return }
      // Hold to power OFF. This was the gap that actually failed the
      // governing test -- "would a real radio have this?" -- because a set
      // you can switch on and never off is not a radio, and touch had no
      // way down at all. Hold rather than a new gesture for the same reason
      // the guide uses two-finger hold: >= 500ms on a still finger already
      // fell through this branch doing nothing, so the duration split costs
      // no gesture vocabulary. Deliberately the DESTRUCTIVE action on the
      // deliberate gesture and mute on the quick one, not the reverse.
      if (dt >= TOUCH_HOLD_MS) { this.powerDown(s); return }
      // 29th pass: tap used to toggle play/pause, but SIGNAL dropped
      // play/pause entirely (a live broadcast can't be paused, only
      // muted/turned off -- see key() comment on the SPACE removal). Tap
      // now does the radio-authentic equivalent: mute toggle.
      // 2026-08-22, round 3 -- this same tap may have just been consumed by
      // onTouchStart to flush a deferred autoplay-unmute (see
      // _suppressTapMuteToggle there). That already restored the sound the
      // user's own mute setting calls for; toggling again here would mute
      // it right back, one gesture after it started playing.
      if (this._suppressTapMuteToggle) { this._suppressTapMuteToggle = false; return }
      this.toggleMute(s)
      return
    }
    // 2026-08-27 -- guide paging by swipe. Opening the guide on a phone was
    // only half a feature without this: [<-]/[->] page it on desktop, and
    // with this guard bare (it used to just `return` on guideOpen) touch
    // could reach page 1 and nothing else. The station index and all nine
    // station pages -- the entire reason the guide has more than one page --
    // were unreachable from a phone even once it could be opened.
    //
    // Left/right to match the desktop arrows, and it shares stepGuidePage()
    // with them rather than re-deriving the clamp. Unlike the arrows, a
    // swipe with nowhere to go does NOT close the guide: a key that cannot
    // act is "any other key" and closing is reasonable, but a swipe running
    // off the end of a page stack reads as a scroll that hit the end, and
    // dismissing the overlay for it would feel like a misfire.
    if (this.guideOpen) {
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) this.stepGuidePage(s, dx > 0 ? 1 : -1)
      return
    }
    if (!this.poweredOn) return
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      // 45th pass -- flipped after live mobile QA found the station swipe
      // still read as mirrored. Now matches the dial itself, which reads
      // left-to-right as low-to-high frequency in the TUNING BAND box:
      // swipe right (finger moves left-to-right, dx positive) tunes up to
      // the next station, swipe left tunes down to the previous one. The
      // old mapping treated it like a carousel (left = forward) instead.
      this.stepStation(s, dx > 0 ? 1 : -1)
    } else if (Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
      // 45th pass -- vertical swipe skips the track, same mechanism as the
      // [N] key. skip() is a no-op unless mode === 'locked', so this is
      // already safe while still tuning -- matches the horizontal-swipe
      // guard above rather than needing its own. Track selection comes out
      // of a shuffle bag, not a fixed sequence, so there's no meaningful
      // "previous" to give the down-swipe -- both directions just skip.
      // 2026-08-27 (dead-feedback audit) -- safe was not the same as
      // answered. Off-station the swipe landed on nothing whatsoever, and
      // touch has no key click, so this status flash is the ONLY
      // acknowledgement the gesture can get -- a swipe that produces no
      // response at all reads as one the screen failed to see, which is a
      // worse thought to leave a phone user with than "not here". Same word
      // as the desktop [N] case in key(), which is this gesture's twin.
      if (this.mode === 'locked') this.skip(s)
      else this.flashStatus(s, 'NO SIGNAL')
    }
    } finally { this._inUserGesture = false }
  },
  stepStation(s, dir) {
    const order = STATION_PRESET_ORDER
    let idx = this.lockedStation ? order.indexOf(this.lockedStation) : -1
    if (idx === -1) idx = order.indexOf(nearestStation(this.freq).station)
    if (idx === -1) idx = 0
    const next = order[(idx + dir + order.length) % order.length]
    this.presetTune(s, next)
  },
}
