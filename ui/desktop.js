// SIGNAL -- the desktop (80x25) screen: chrome, dial, status row, meters,
// the antenna pane, the STANDBY splash, and the idle CRT events. Mixed
// into the program object -- `this` is the program. Split out in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { AUDIO_BUS, audioSignalLive } = await import(`../audio/tap.js?v=${V}`)
const { SLEEP_FADE_MS, VERSION_TAG } = await import(`../constants.js?v=${V}`)
const { crtBase, crtDegradeForDist, flashCrtGlitch, rampCrtParams } = await import(`../crt-hooks.js?v=${V}`)
const { BOX_BOTTOM_REST_ATTR, BOX_BOTTOM_ROWS, BOX_X0, BOX_X1, DIAL_X0, DIAL_X1, DIAL_Y, FREQ_Y, HINT_Y1, HINT_Y2, MBOX_X0, MBOX_X1, METERS_BOT_Y, METERS_DIVIDER_X, METERS_TOP_Y, NOWPLAYING_BOT_Y, NOWPLAYING_TOP_Y, PLAYBACK_Y, SCALE_Y, SIG_Y, STANDBY_LOGO_FONT, STANDBY_LOGO_GAP, STANDBY_LOGO_LETTER_H, STANDBY_LOGO_LETTER_W, STANDBY_LOGO_WORD, STATION_BOT_Y, STATION_TOP_Y, STATION_Y, STATUS_REVEAL_MS, STATUS_TEXT_WIDTH, STATUS_Y, TAGLINE_Y, TRACK_Y, TUNER_BOT_Y, TUNER_TOP_Y, VOL_SIG_DIVIDER_Y, VOL_Y, VU_DIVIDER_Y, VU_Y, centerX, centerXRange, drawBoxBottom, drawBoxSide, drawBoxTop, drawGrille, fmtTime, formatClock, standbyLayout, truncate } = await import(`../layout.js?v=${V}`)
const { STATIONS, STATION_PRESET_ORDER } = await import(`../stations.js?v=${V}`)
const { NEAR_THRESHOLD, freqToCol, nearestSignal, nearestStation } = await import(`../tuning.js?v=${V}`)

export default {

  // Static chrome -- title bar, brand-plate, panel frames, grille, corner
  // brackets. Drawn once at boot and again after a power-up (12th pass);
  // extracted out of init() so both call sites stay in sync instead of
  // duplicating ~60 lines of box-drawing.
  // Title bar, inverse plane -- SIGNAL wordmark, version tag, clock,
  // brand-plate. Split out of drawChrome() (43rd pass) so the visualizer
  // can put up the exact same row 0 without dragging the panel frames along
  // with it -- and so this._clockTimer's 1s ticker (which just calls
  // drawClock() unconditionally whenever powered on) keeps working
  // unmodified whether the visualizer is up or not.
  drawTitleBar(s) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) term.put(x, 0, ' ', NORMAL, 1)
    term.text(2, 0, 'SIGNAL', BOLD, 1)
    // Version tag (28th pass, revised: same font/weight as SIGNAL itself,
    // no codename) -- sits right after the wordmark, one
    // space over, same BOLD as SIGNAL. Verified against the brand-plate's
    // centerX() start (25 at 80 cols) so the two never collide.
    term.text(9, 0, VERSION_TAG, BOLD, 1)
    // Date/time module (15th pass; repositioned 17th pass -- version number
    // removed from here and date/time put in its place, using the same
    // formatting the version number used) -- the version number used to live at
    // x=72 in this same DIM/inverse style; it's gone now and the clock sits
    // in its place instead. Drawn once here on every chrome (re)draw; the
    // 1s ticker set up in init() keeps it live after that (see
    // drawClock()/this._clockTimer).
    this.drawClock(s)

    // Brand-plate nameplate (10th pass, a skeuomorphism idea; moved into
    // the title bar itself in the 11th pass, folding "MODEL SG-1" etc into
    // the header) -- sits in the open space left of the
    // clock, same inverse plane as the rest of the title row instead of
    // floating as its own dim line underneath it. The power/lock LED used
    // to sit here too (10th pass) but moved down onto the status line in
    // the 17th pass, since it wasn't obvious tucked in next to the
    // title text -- see setStatus().
    const brand = 'MODEL SG-1  -  SIGNAL RECEIVER'
    term.text(centerX(term.cols, brand), 0, brand, FAINT, 1)
    this.drawSleep(s)
  },

  /** Sleep timer readout (2026-08-27) -- the title bar's one free stretch,
   *  between the version tag (ends at 12) and the brand plate (starts at
   *  25). Up here rather than in the LEVELS pane's switch column for one
   *  reason: row 0 is the only row the visualizer keeps (see
   *  enterVisualizer's clear), so the countdown stays readable in the state
   *  someone on their way to sleep is most likely to have left the set in.
   *
   *  Nine fixed columns, always mm:ss, so no digit ever shifts under the eye
   *  and there are two clear columns before the brand plate at the widest
   *  reading (SLP 60:00). Blank when nothing is armed -- an OFF indicator
   *  for a control most visitors will never press is clutter, and the row is
   *  shared with the wordmark. */
  drawSleep(s) {
    if (this.mobile) return // no keyboard to arm it, and no columns to spare
    const { term } = s
    const x = 14
    if (!this._sleepUntil || !this.poweredOn) {
      for (let i = 0; i < 9; i++) term.put(x + i, 0, ' ', NORMAL, 1)
      return
    }
    const left = Math.max(0, this._sleepUntil - Date.now())
    const mm = String(Math.floor(left / 60000)).padStart(2, '0')
    const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0')
    const label = `SLP ${mm}:${ss}`
    // Brightens for the run-out, which is the same stretch the volume is
    // fading over -- so the one thing on screen that explains why the sound
    // is going quiet is also the one thing getting easier to read.
    const attr = left <= SLEEP_FADE_MS ? BOLD : DIM
    for (let i = 0; i < label.length; i++) term.put(x + i, 0, label[i], attr, 1)
  },

  /** Everything the main screen draws on a rebuild, in the order every
   *  rebuild draws it (2026-08-25 audit -- this exact ten-call sequence was
   *  copy-pasted into powerUp's reveal beat, closeGuide and exitVisualizer). */
  redrawMainScreen(s) {
    this.drawChrome(s)
    this.drawScale(s)
    this.drawVolume(s)
    this.drawSignal(s)
    this.drawVU(s)
    this.drawEqRibbonLeft(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
  },
  /** Station, track and status for whatever the lock state already is --
   *  an overlay (guide, visualizer) only ever covered them. */
  redrawLockState(s) {
    if (this.mode === 'locked' && this.lockedStation) {
      this.showStation(s, this.lockedStation)
      // 2026-08-27 -- displayTrack(), not currentTrack: coming back from the
      // guide or the visualizer mid-break has to restore the break readout,
      // not the track it is covering.
      const shown = this.displayTrack()
      if (shown) this.showTrack(s, shown)
      // 2026-08-22, round 9 -- LOCKED is replaced with a persistent MUTED
      // state (not a flash) while muted, so it stays obvious that unmuting
      // is required to begin the experience -- a locked-but-muted set shows
      // MUTED here instead of LOCKED, staying that way (no flash, no revert
      // -- see setStatus's 'MUTED' handling) until toggleMute() flips it back.
      this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
    } else {
      this.clearStation(s)
      this.clearTrack(s)
      this.setStatus(s, 'SEEKING', false)
    }
    this.setPlayState(s, this.playState)
  },

  drawChrome(s) {
    if (this.mobile) { this.mobileDrawChrome(s); return }
    const { term } = s

    this.drawTitleBar(s)

    // Panel frames -- drawn once, never redrawn. Every content function
    // below only clears its own interior span, so these stay put.
    drawBoxTop(term, TUNER_TOP_Y, BOX_X0, BOX_X1, 'TUNING BAND', MUTED)
    drawBoxSide(term, SCALE_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, DIAL_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, FREQ_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, TUNER_BOT_Y, BOX_X0, BOX_X1, MUTED)

    drawBoxTop(term, STATION_TOP_Y, BOX_X0, BOX_X1, 'STATION', MUTED)
    drawBoxSide(term, STATION_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, TAGLINE_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, STATION_BOT_Y, BOX_X0, BOX_X1, MUTED)

    // 30th pass -- boxes needed more dimension to show which one is
    // active. NOW PLAYING is the "hero" box (what's actually playing
    // matters most, see the 5th-pass note above), so its frame draws a
    // notch brighter than the other three's static MUTED chrome instead of
    // all four boxes reading as identical weight. 31st pass: this was
    // BRIGHT at first, but the CRT bloom shader turns a full-BRIGHT dashed
    // border into what reads as a blown-out solid bar rather than a crisp
    // line once it's actually rendered, confirmed against a screenshot of
    // exactly that failure. BOLD is the same one-notch-up
    // idea without tripping the bloom. playBootFlicker()'s tail restores
    // this same BOLD after its uniform boot-flicker beat sequence settles
    // everything (including this box) back to MUTED.
    drawBoxTop(term, NOWPLAYING_TOP_Y, BOX_X0, BOX_X1, 'NOW PLAYING', BOLD)
    drawBoxSide(term, TRACK_Y, BOX_X0, BOX_X1, BOLD)
    drawBoxSide(term, PLAYBACK_Y, BOX_X0, BOX_X1, BOLD)
    drawBoxBottom(term, NOWPLAYING_BOT_Y, BOX_X0, BOX_X1, BOLD)

    drawBoxTop(term, METERS_TOP_Y, BOX_X0, BOX_X1, 'LEVELS', MUTED, METERS_DIVIDER_X)
    drawBoxSide(term, VOL_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VOL_SIG_DIVIDER_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, SIG_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VU_DIVIDER_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VU_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, METERS_BOT_Y, BOX_X0, BOX_X1, MUTED)

    // Speaker-grille texture (10th pass, a skeuomorphism idea)
    // -- the divider row below VOL was a plain blank interior (just the
    // box's side borders with nothing between). Filling it with a dotted
    // perforation pattern instead reads as a physical speaker grille, at
    // zero extra row cost. Confined to the left half only (18th pass, see
    // METERS_DIVIDER_X) -- the right half is reserved/blank until there's
    // content for it.
    // 58th pass -- VU_DIVIDER_Y's own grille call removed: only the
    // dotted row below volume stays, the rest of the space is for eq bars,
    // no second dotted row or gap treating them as separate rows.
    // That row is drawEqRibbonLeft()'s own content now (the middle third
    // of its 3-row-tall bars), overwritten fully every frame, so no static
    // texture should show through it any more.
    drawGrille(term, VOL_SIG_DIVIDER_Y, BOX_X0, METERS_DIVIDER_X)

    // LEVELS vertical divider (18th pass -- LEVELS halved, with levels on
    // one side and something tbd on the other) -- splits the
    // single LEVELS box into two halves without changing its outer frame.
    // T-junctions where the divider meets the box's own top/bottom border,
    // a plain vertical bar down the interior rows. Drawn after the grille
    // above so it isn't overwritten by it.
    term.put(METERS_DIVIDER_X, METERS_TOP_Y, '┳', MUTED)
    for (const y of [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]) {
      term.put(METERS_DIVIDER_X, y, '│', MUTED)
    }
    term.put(METERS_DIVIDER_X, METERS_BOT_Y, '┻', MUTED)

    // Right half's own label (58th pass -- the space on the right was the
    // only panel not labeled; STATUS fits the antenna/S-N/
    // TRI/PLS/preset-mode-mute mix better than a more literal name would,
    // since none of those are one single measurement). Embedded directly
    // into the same top-border row rather than a second drawBoxTop() call,
    // so the '┳' T-junction and the box's own '┐' corner (both already
    // placed above) aren't clobbered -- same tag-centering math
    // drawBoxTop() uses internally, just applied to the right half's own
    // METERS_DIVIDER_X..BOX_X1 span instead of the whole box width.
    {
      const tag = ' STATUS '
      const inner = BOX_X1 - METERS_DIVIDER_X - 1
      const tagX = METERS_DIVIDER_X + 1 + Math.floor((inner - tag.length) / 2)
      for (let k = 0; k < tag.length; k++) term.put(tagX + k, METERS_TOP_Y, tag[k], MUTED)
    }

    // The LEVELS right half (GIAL nameplate's old spot, then the PWR/AIR/
    // STEREO/MONO/MUTE indicator panel) is now the animated antenna glyph --
    // see drawAntenna(). Not static, so it isn't drawn here; the two call
    // sites that used to follow drawChrome() with a nameplate-is-already-
    // there assumption (powerUp's reveal beat, closeGuide()) call
    // drawAntenna() explicitly, same as they already do for drawVU().

    // Chassis corner brackets (10th pass, a skeuomorphism idea)
    // -- the 4 columns outside the panel stack (x 0-1 and 78-79)
    // were unused; bracketing the stack's outer corners there reads as a
    // physical bezel around the receiver rather than the panels just
    // floating on black.
    term.put(0, TUNER_TOP_Y, '┏', MUTED)
    term.put(term.cols - 1, TUNER_TOP_Y, '┓', MUTED)
    term.put(0, METERS_BOT_Y, '┗', MUTED)
    term.put(term.cols - 1, METERS_BOT_Y, '┛', MUTED)
  },

  // Date/time module, running-screen half (15th pass; repositioned +
  // brightened 16th pass, having been in the wrong spot and too dim; moved
  // again 17th pass onto the version number's old spot, with the version
  // number removed from here and date/time put in its place, using the
  // formatting that was used for version). Right-aligned to end at column 75 -- exactly where
  // "v0.2" used to end -- same DIM/inverse formatting the version used, so
  // it reads the same way the version did, just with the date/time in its
  // place. Same width every tick, so no blank-first needed.
  drawClock(s) {
    const { term } = s
    const str = formatClock(new Date())
    // 2026-08-22: mobile gets its own right-aligned position on the same
    // row (2 cols in from the edge) rather than desktop's fixed column 76,
    // which is well past this grid's 42 columns.
    const x = this.mobile ? term.cols - 2 - str.length : 76 - str.length
    // 2026-08-22, round 6 -- for balance, the date/time gets the same
    // treatment as SIGNAL v0.8 -- mobile's clock
    // used to be DIM against the header's inverse fill, visibly weaker
    // than the BOLD title sharing the same row; matching its weight reads
    // as one consistent header instead of two different ones stitched
    // together. Desktop's clock (a lighter touch by design, off to the
    // side of the same-weight title/brand-plate the row already carries)
    // is untouched.
    const attr = this.mobile ? BOLD : DIM
    for (let i = 0; i < str.length; i++) term.put(x + i, 0, str[i], attr, 1)
  },

  // Date/time module, STANDBY half (15th pass) -- real clock-radios keep
  // their clock lit even powered off, so this shows underneath the
  // STANDBY/"[P] POWER ON" text rather than going dark along with
  // everything else. Driven by the same this._clockTimer as drawClock().
  drawStandbyClock(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const str = formatClock(new Date())
    term.text(centerX(term.cols, str), standbyLayout(term, this.mobile).clockY, str, FAINT)
  },

  // 63rd pass -- STANDBY wordmark. Draws the SIGNAL block letters (see
  // STANDBY_LOGO_FONT) at the given top row. A FAINT copy one cell down-
  // right is drawn first as a stand-in for the reference image's layered
  // colour depth -- the CRT only has one beam-intensity channel (see
  // term.js), so an offset shadow is what "impact" translates to here --
  // then the BRIGHT glyph on top of it.
  drawStandbyLogo(s, top) {
    const { term } = s
    const letters = STANDBY_LOGO_WORD.split('')
    const totalWidth = letters.length * STANDBY_LOGO_LETTER_W + (letters.length - 1) * STANDBY_LOGO_GAP
    const startX = Math.max(0, Math.floor((term.cols - totalWidth) / 2))
    const segments = []
    let lx = startX
    for (const ch of letters) {
      const glyph = STANDBY_LOGO_FONT[ch]
      for (let row = 0; row < STANDBY_LOGO_LETTER_H; row++) {
        for (let col = 0; col < STANDBY_LOGO_LETTER_W; col++) {
          if (glyph[row][col] === '#') segments.push({ x: lx + col, y: top + row })
        }
      }
      lx += STANDBY_LOGO_LETTER_W + STANDBY_LOGO_GAP
    }
    for (const seg of segments) {
      const sx = seg.x + 1, sy = seg.y + 1
      if (sx < term.cols && sy < term.rows) term.put(sx, sy, '█', FAINT)
    }
    for (const seg of segments) term.put(seg.x, seg.y, '█', BRIGHT)
  },

  // 63rd pass -- the whole STANDBY splash: logo, version, STANDBY, the
  // power-on hint, then the clock. Both places that used to draw the
  // STANDBY/hint text inline (init()'s first paint and powerDown()'s
  // landing beat) now just call this, so the layout only exists once.
  drawStandbyScreen(s) {
    const { term } = s
    const L = standbyLayout(term, this.mobile)
    this.drawStandbyLogo(s, L.logoTop)
    term.text(centerX(term.cols, VERSION_TAG), L.versionY, VERSION_TAG, DIM)
    const label = 'STANDBY'
    term.text(centerX(term.cols, label), L.standbyY, label, FAINT)
    // 67th pass -- an info/guide hint added alongside the power-on hint,
    // desktop only (see key()'s STANDBY branch) -- the one other control a
    // powered-off set still answers. 69th pass -- relabeled [I] INFO to
    // [G] GUIDE, matching the key the in-app Guide overlay already answers
    // to everywhere else (see the 15th-pass G binding below) -- STANDBY was
    // the one place still teaching a different key for the same thing.
    const hint = this.mobile ? 'TAP TO POWER ON' : '[P] POWER ON   [G] GUIDE'
    term.text(centerX(term.cols, hint), L.hintY, hint, FAINT)
    this.drawStandbyClock(s)
  },

  drawScale(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, SCALE_Y, ' ')
    term.text(DIAL_X0 - 1, SCALE_Y, '100.0', DIM)
    term.text(freqToCol(500) - 2, SCALE_Y, '500.0', DIM)
    term.text(DIAL_X1 - 4, SCALE_Y, '900.0', DIM)
  },

  drawDial(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = DIAL_X0; x <= DIAL_X1; x++) term.put(x, DIAL_Y, '·', FAINT)
    const { station: near, dist } = nearestStation(this.freq)
    for (const ch of STATIONS) {
      const col = freqToCol(ch.freq)
      const glow = this.mode === 'seeking' && ch === near && dist <= NEAR_THRESHOLD
      const locked = this.mode === 'locked' && this.lockedStation === ch
      // 41st pass: each station's own marker (STATIONS[].glyph) instead of
      // nine identical triangles, so the band reads as a map you learn
      // rather than a row of anonymous ticks. Every glyph is verified
      // present in the Terminus BDF -- an unmapped codepoint renders blank,
      // which would silently delete a station from the dial.
      term.put(col, DIAL_Y, ch.glyph || '▲', locked ? BRIGHT : glow ? BOLD : NORMAL)
    }
    // 54th pass: _freqJitter is a purely cosmetic offset (see frame()'s
    // warm-up drift block) -- nearestStation()/the glow computation above
    // stay on the real this.freq, only the drawn cursor position wobbles.
    const cursorCol = freqToCol(this.freq + (this._freqJitter || 0))
    term.put(cursorCol, DIAL_Y, '█', BRIGHT)
  },

  drawFreq(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, FREQ_Y, ' ')
    // 54th pass: see drawDial()'s _freqJitter comment -- same cosmetic-only offset.
    const str = (this.freq + (this._freqJitter || 0)).toFixed(1)
    term.text(centerX(term.cols, str), FREQ_Y, str, BOLD)
  },

  // 11th pass -- flair added around scanning/locked status: readout-style
  // brackets instead of leaving it as bare centered text.
  //
  // 23rd pass -- the dot LED indicator next to it didn't read as an LED or
  // status, so it was removed. It also turns out to have been
  // the cause of the status line reading as off-center: `combined` (what
  // centerX() actually centered) was `ledGlyph + '  ' + bracket`, 3 columns
  // of glyph+gap tacked onto the LEFT side only with nothing to balance it
  // on the right, so the bracket itself landed 1-2 columns right of true
  // center every time. Centering the bracket alone fixes both complaints at
  // once. Lock/seek state is still visible elsewhere (the LED's old jobs:
  // the dial's ▲/█ brightness and the LEVELS SIG meter), so nothing here
  // was the only place that state showed up.
  // 38th pass -- when seeking or scanning, that flashes in
  // the status area instead of just changing the text. Everything this
  // row did used to happen in a single tick: blank it, write the new word,
  // done. That is what made a busy screen feel flat -- the ambient layer
  // (VU, EQ ribbon, antenna rings, phosphor shimmer) never stops, so
  // nothing ever punctuated it. The row is now three things instead of one
  // label:
  //   1. a typewriter reveal on any text CHANGE (see the `same` check --
  //      re-setting SEEKING on every arrow tap must not restart it, or
  //      fast seeking turns into a stutter),
  //   2. a per-state animation living in the FAINT flanking rules the 30th
  //      pass added -- a bright cell travelling out from the brackets,
  //      direction matched to the way you are tuning,
  //   3. one-shot punctuation on the two event states: LOCKED flashes the
  //      bracket inverse on the same beat as the ident, NO SIGNAL
  //      double-blinks.
  // opts.transient marks a temporary readout (see flashStatus) that must
  // not become the state the row falls back to.
  setStatus(s, text, active, opts = {}) {
    const same = this._statusText === text
    this._clearStatusTimers()
    if (!opts.transient) {
      this.statusPersistent = { text, active }
      // A real state change cancels a pending flash revert -- otherwise
      // locking mid-volume-flash would get stomped ~900ms later by the
      // flash restoring the status it captured before the lock happened.
      this.fxCancel('statusFlash')
    }
    this._statusText = text
    this._statusActive = active
    // The power sequences draw their own beats on their own timers and
    // then clear the whole grid out from under this row, so a reveal
    // staggered across a couple hundred ms would paint text back onto an
    // already-collapsed picture. Instant while _powerAnimating.
    const instant = same || this._powerAnimating || text === 'LOCKED' || text === 'MUTED' || text === 'NO SIGNAL'
    if (instant) {
      this.drawStatusRow(s, text, active, text.length)
    } else {
      this.drawStatusRow(s, text, active, 0)
      let i = 0
      this.fxEvery('status', STATUS_REVEAL_MS, () => {
        if (this._statusText !== text) return false
        this.drawStatusRow(s, text, active, ++i)
        return i < text.length
      })
    }
    this.startStatusAnim(s, text, active)
  },

  drawStatusRow(s, text, active, revealed, opts = {}) {
    if (this.mobile) { this.mobileDrawStatusRow(s, text, opts.attr ?? (active ? BRIGHT : MUTED), opts.inv ? 1 : 0); return }
    const { term } = s
    const padTotal = STATUS_TEXT_WIDTH - text.length
    const padL = Math.max(0, Math.floor(padTotal / 2))
    const padR = Math.max(0, padTotal - padL)
    const shown = text.slice(0, revealed) + ' '.repeat(Math.max(0, text.length - revealed))
    const padded = ' '.repeat(padL) + shown + ' '.repeat(padR)
    const bracket = `[ ${padded} ]`
    const bracketX = centerX(term.cols, bracket)
    this._statusBracketX = bracketX
    this._statusBracketLen = bracket.length
    for (let x = 0; x < term.cols; x++) term.put(x, STATUS_Y, ' ')
    // 30th pass -- statuses like LOCKED needed more emphasis -- the bracket
    // was already BRIGHT when active (same
    // tier as the station callsign), so the flat feeling wasn't really a
    // brightness problem: it's that the word sits alone on an otherwise
    // blank row with nothing to anchor it, one row above TUNING BAND's top
    // border. Flanking it with a thin rule spanning the same BOX_X0..
    // BOX_X1 columns as the box directly beneath gives it a "seat" -- the
    // status row and the box below now read as one joined strip instead of
    // centered text floating on dead space.
    const gap = 1
    for (let x = BOX_X0; x < bracketX - gap; x++) term.put(x, STATUS_Y, '─', FAINT)
    for (let x = bracketX + bracket.length + gap; x <= BOX_X1; x++) term.put(x, STATUS_Y, '─', FAINT)
    const attr = opts.attr ?? (active ? BRIGHT : MUTED)
    term.text(bracketX, STATUS_Y, bracket, attr, opts.inv ? 1 : 0)
  },

  /** Per-state status animation. Two one-shots (LOCKED, NO SIGNAL) and two
   *  continuous sweeps (SEEKING, SCANNING/TUNING) -- everything else just
   *  sits still, which is correct: a status that never changes shouldn't
   *  be drawing the eye. */
  startStatusAnim(s, text, active) {
    const { term } = s
    // Any deferred draw below has to re-check that this status is still
    // the current one. (It used to also check poweredOn/guideOpen -- these
    // ran on their own timers and inherited no guard from frame(). On the
    // effects queue they only tick while frame() would, so that half of the
    // check is structural now. 2026-08-25 audit.)
    const alive = () => this._statusText === text

    if (text === 'LOCKED') {
      // One-shot inverse flash, landing on the same beat as the ident and
      // the focus snap -- lock is a single event across sound, motion,
      // text and picture rather than four things that happen to coincide.
      this.drawStatusRow(s, text, active, text.length, { inv: 1 })
      this.fxAfter('status', 120, () => { if (alive()) this.drawStatusRow(s, text, active, text.length) })
      return
    }
    if (text === 'NO SIGNAL') {
      for (const [ms, attr] of [[90, FAINT], [180, MUTED], [270, FAINT], [360, MUTED]]) {
        this.fxAfter('status', ms, () => { if (alive()) this.drawStatusRow(s, text, active, text.length, { attr }) })
      }
      return
    }

    const sweeping = text.startsWith('SCANNING') || text.startsWith('TUNING')
    const seeking = text === 'SEEKING'
    if (!sweeping && !seeking) return
    // 2026-08-22 -- the tuning "line" was also drawing over the status
    // -- this whole block below is hardcoded to STATUS_Y/BOX_X0/BOX_X1,
    // desktop's row and its 2..77 column span. It was never gated for
    // mobile at all, so every TUNING/SEEKING/SCANNING status kicked this
    // off on the 42-col mobile grid too. This._statusBracketX/Len are only
    // ever written by drawStatusRow's DESKTOP branch (mobile returns before
    // reaching them), so on mobile they sit at their constructor default of
    // 0 forever -- which makes rightCols run from column 1 to BOX_X1 (77),
    // painting a FAINT rule across nearly the whole status row every tick
    // and overwriting the "[ TUNING n ]" text mobileDrawStatusRow just
    // centered there, with the BRIGHT sweep cell itself only visible for
    // the fraction of that 77-column travel that lands inside the 42-column
    // mobile grid before wrapping -- which is exactly the "animates only
    // briefly left to right" behavior observed. Mobile's status row just
    // sits still instead: 40 columns isn't enough room for a travelling
    // dash to read as motion anyway, and the LOCKED flash / NO SIGNAL blink
    // above still land correctly through drawStatusRow's mobile branch.
    if (this.mobile) return
    let i = 0
    this.fxEvery('status', sweeping ? 55 : 80, () => {
      if (!alive()) return false
      const bx = this._statusBracketX
      // Built fresh each tick rather than cached: a flashStatus revert can
      // change the bracket width underneath this between ticks.
      const leftCols = []
      for (let x = bx - 2; x >= BOX_X0; x--) leftCols.push(x)
      const rightCols = []
      for (let x = bx + this._statusBracketLen + 1; x <= BOX_X1; x++) rightCols.push(x)
      for (const x of leftCols) term.put(x, STATUS_Y, '─', FAINT)
      for (const x of rightCols) term.put(x, STATUS_Y, '─', FAINT)
      if (sweeping) {
        // Scanning sweeps the full width, hopping over the bracket -- the
        // same left-to-right pass the tuner itself is making.
        const all = leftCols.slice().reverse().concat(rightCols)
        const pos = i % all.length
        term.put(all[pos], STATUS_Y, '─', BRIGHT)
        if (pos + 1 < all.length) term.put(all[pos + 1], STATUS_Y, '─', DIM)
      } else {
        // Seeking travels outward from the bracket, on the side you are
        // tuning toward, so the row agrees with the dial below it.
        const cols = this._statusSweepDir < 0 ? leftCols : rightCols
        if (cols.length) {
          const pos = i % cols.length
          term.put(cols[pos], STATUS_Y, '─', BRIGHT)
          if (pos > 0) term.put(cols[pos - 1], STATUS_Y, '─', DIM)
        }
      }
      i++
    })
  },

  /** Drops the status row's reveal and sweep (not a pending flash revert --
   *  that has its own 'statusFlash' tag, cancelled by a real state change in
   *  setStatus or replaced by the next flashStatus). */
  _clearStatusTimers() { this.fxCancel('status') },

  /** 38th pass -- transient status readout that reverts to whatever the
   *  row was actually saying. This closed a real gap rather than adding
   *  polish: volume, mute and display mode all changed state with no
   *  acknowledgement in the status row at all, and preset digits only
   *  showed up as the dial starting to move. */
  flashStatus(s, text, ms = 900) {
    this.setStatus(s, text, true, { transient: true })
    this.fxCancel('statusFlash')
    this.fxAfter('statusFlash', ms, () => {
      const prev = this.statusPersistent
      if (prev) this.setStatus(s, prev.text, prev.active)
    })
  },

  // 38th pass -- signal resolve. Station and track text used to snap in
  // whole; each character now lands out of noise on its own staggered
  // beat, which in fiction is exactly what a receiver settling onto a
  // signal looks like. Deliberately short (under ~300ms): the moment it
  // reads as waiting rather than resolving, it is wrong.
  RESOLVE_GLYPHS: '▓▒░#%&*',
  resolveText(s, x, y, text, attr, durationMs = 250) {
    const { term } = s
    this._cancelResolve(y)
    // Per-character settle times, random rather than left-to-right: a
    // sequential wipe reads as a typewriter (which the status row already
    // is), scattered reads as noise clearing.
    const settleAt = []
    for (let i = 0; i < text.length; i++) settleAt.push(durationMs * (0.12 + 0.88 * Math.random()))
    const start = performance.now()
    const tick = (now = performance.now()) => {
      const elapsed = now - start
      let done = true
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === ' ') { term.put(x + i, y, ' '); continue }
        if (elapsed >= settleAt[i]) { term.put(x + i, y, ch, attr); continue }
        done = false
        const g = this.RESOLVE_GLYPHS[Math.floor(Math.random() * this.RESOLVE_GLYPHS.length)]
        term.put(x + i, y, g, Math.random() < 0.4 ? FAINT : DIM)
      }
      return !done
    }
    tick()
    this.fxEvery(`resolve:${y}`, 33, tick)
  },
  _cancelResolve(y) { this.fxCancel(`resolve:${y}`) },
  _cancelAllResolves() { this.fxCancel('resolve:', { prefix: true }) },

  /** 38th pass -- rare idle CRT event. Two kinds: the vertical hold
   *  drifting for about a second, or a tear (snow/chroma spike plus a
   *  scrambled run on one panel border). Locked-only on purpose: while
   *  seeking, crtDegradeForDist() is already driving these same params
   *  off the tuning distance, and a random drift layered on top of that
   *  would read as a bug rather than an event. Exposed as its own method
   *  so it can be fired on demand from the console
   *  (window.screen0.program.crtIdleEvent(window.screen0, 'tear')) --
   *  at its real frequency you cannot reliably catch one to check it. */
  crtIdleEvent(s, kind) {
    if (!s?.crt?.params) return
    const { term } = s
    const { dist } = nearestSignal(this.freq)
    // Restore to what the CURRENT tuning distance calls for, not to
    // nominal -- same reasoning as flashCrtGlitch().
    const restore = crtDegradeForDist(dist)
    kind = kind || (Math.random() < 0.5 ? 'roll' : 'tear')
    if (kind === 'roll') {
      rampCrtParams(s, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, { roll: 0.45, rollSpeed: 0.9 }, 260)
      rampCrtParams(s, { roll: 0.45, rollSpeed: 0.9 }, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, 500, 700)
      return
    }
    Object.assign(s.crt.params, { snow: 0.03, chroma: 1.6 })
    this.fxAfter('crt', 90, () => Object.assign(s.crt.params, restore))
    // Same box-BOTTOM rows the idle shimmer restricts itself to: those are
    // plain full-width '─' with no embedded panel label (drawBoxTop has
    // one, drawBoxBottom does not), so a scrambled run here can never
    // clobber something that has to stay readable.
    const y = BOX_BOTTOM_ROWS[Math.floor(Math.random() * BOX_BOTTOM_ROWS.length)]
    const runLen = 8 + Math.floor(Math.random() * 10)
    const x0 = BOX_X0 + 1 + Math.floor(Math.random() * Math.max(1, BOX_X1 - BOX_X0 - runLen - 2))
    const glyphs = '▓▒░─'
    for (let i = 0; i < runLen; i++) {
      const x = x0 + i
      // Same '┻' junction the idle shimmer nudges off of (18th pass) -- the
      // scramble write loop didn't skip it, only its own restore did, so a
      // tear event could stomp the junction with scramble glyphs for the
      // ~90ms flash window. Leave that one cell alone.
      if (y === METERS_BOT_Y && x === METERS_DIVIDER_X) continue
      term.put(x, y, glyphs[Math.floor(Math.random() * glyphs.length)], Math.random() < 0.4 ? DIM : FAINT)
    }
    const restAttr = BOX_BOTTOM_REST_ATTR.get(y)
    this.fxAfter('tear', 90, () => {
      for (let i = 0; i < runLen; i++) {
        const x = x0 + i
        // METERS_BOT_Y carries a '┻' junction at METERS_DIVIDER_X (see
        // drawChrome) -- the same trap the 18th pass hit with the idle
        // shimmer, which restores a flat '─' over everything it touches.
        // restAttr (not a hardcoded MUTED): NOW PLAYING's border rests at
        // BOLD -- see BOX_BOTTOM_REST_ATTR's definition for the bug this
        // fixes.
        term.put(x, y, y === METERS_BOT_Y && x === METERS_DIVIDER_X ? '┻' : '─', restAttr)
      }
    })
  },

  // 50th pass -- the grind micro-glitch (see frame()'s scheduler and
  // STATIONS[].grind). crtIdleEvent's little sibling: fires every few
  // seconds instead of every few minutes, so it has to stay SMALL -- a
  // stab, not an event. Three weighted shapes, CRT params only (no
  // text-grid writes at all, see the scheduler's comment):
  //   ~50%  chroma stab   -- misconvergence spikes and settles back
  //   ~30%  roll stutter  -- the picture slips a beat, catches itself
  //   ~20%  full flashCrtGlitch() -- the existing 150ms chroma+roll hit
  // Restores via crtDegradeForDist(dist) same as flashCrtGlitch/
  // crtIdleEvent -- what the CURRENT tuning distance calls for, never raw
  // crtBase/SCREEN, so it composes with the degrade instead of erasing it.
  crtGrind(s) {
    if (!s?.crt?.params) return
    if (!this.poweredOn || this.guideOpen) return
    const roll = Math.random()
    if (roll < 0.2) { flashCrtGlitch(s); return }
    const { dist } = nearestSignal(this.freq)
    const restore = crtDegradeForDist(dist)
    if (roll < 0.7) {
      rampCrtParams(s, { chroma: 1.4 + Math.random() * 0.8 }, { chroma: restore.chroma }, 220)
    } else {
      rampCrtParams(s, { roll: 0.35 + Math.random() * 0.2, rollSpeed: 1.1 }, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, 340)
    }
  },

  // Warm-up flicker (10th pass) -- a short beat sequence that redraws the
  // 4 panel top/bottom borders at varying brightness right after boot,
  // then settles back to the normal resting MUTED attr. One-shot, timer-
  // based (same pattern as the scan/preset timers elsewhere in this file),
  // not part of the per-frame loop.
  playBootFlicker(s) {
    // 45th pass -- every row/label here is a desktop box border; on
    // mobile's shorter grid several of those row numbers land on completely
    // different content (see clearStation's comment on the same collision).
    // Skipping the flicker cosmetic entirely on mobile rather than teaching
    // it a second geometry.
    if (this.mobile) return
    const { term } = s
    const tops = [
      [TUNER_TOP_Y, 'TUNING BAND'], [STATION_TOP_Y, 'STATION'],
      [NOWPLAYING_TOP_Y, 'NOW PLAYING'],
      // labelX1 = METERS_DIVIDER_X here (18th pass) -- without it this
      // would re-center "LEVELS" across the box's full width on every
      // flicker beat, colliding with (and, worse, permanently
      // mis-positioning relative to) the divider once the beats stop.
      [METERS_TOP_Y, 'LEVELS', METERS_DIVIDER_X],
    ]
    const bottoms = BOX_BOTTOM_ROWS
    const redraw = (attr) => {
      // BUG FIXED (caught live, 20th pass): this beat sequence runs for
      // ~500ms after powerUp()'s REVEAL_DELAY fires, via its own raw
      // setTimeouts -- it doesn't know about anything that happens after
      // it was scheduled. If the guide (see openGuide()) is opened during
      // that window (plausible -- it's right when the set finishes
      // powering on and controls first respond), these box-border redraws
      // punch straight through the guide's full-screen text, since they
      // never checked guideOpen. Bail out here instead.
      // 69th pass -- same bug, second instance, caught live: powering back
      // off during this same ~500ms tail used to leave these same box-
      // border redraws punching straight through STANDBY instead -- read as
      // a broken, doubled-looking wordmark once powerDown() stopped taking
      // ~900ms of its own collapse beats to get there (this tail used to
      // land mid-collapse, visually lost in the noise; a clean, static
      // STANDBY has nowhere for it to hide anymore). Added !poweredOn
      // alongside the existing guideOpen guard.
      // 2026-08-25 audit -- both guards gone: these beats sit on the normal
      // effects queue now, which doesn't tick while the guide is up and is
      // emptied by powerDown(), so neither case can reach this code.
      for (const [y, label, labelX1] of tops) drawBoxTop(term, y, BOX_X0, BOX_X1, label, attr, labelX1)
      for (const y of bottoms) drawBoxBottom(term, y, BOX_X0, BOX_X1, attr)
      // 18th pass: drawBoxTop/Bottom redraw the LEVELS row as a plain
      // border, which would otherwise erase the LEVELS divider's
      // T-junctions on every power-on (this runs on every powerUp, not
      // just the very first boot). Redrawing them at the same attr keeps
      // them in sync with the rest of the flicker instead of vanishing.
      term.put(METERS_DIVIDER_X, METERS_TOP_Y, '┳', attr)
      term.put(METERS_DIVIDER_X, METERS_BOT_Y, '┻', attr)
      // 58th pass -- same reasoning as the T-junctions just above: the
      // full-width drawBoxTop() call for METERS_TOP_Y just wiped the right
      // half's own STATUS tag (see drawChrome()), so it needs redrawing
      // here too or it would vanish on every power-on.
      {
        const tag = ' STATUS '
        const inner = BOX_X1 - METERS_DIVIDER_X - 1
        const tagX = METERS_DIVIDER_X + 1 + Math.floor((inner - tag.length) / 2)
        for (let k = 0; k < tag.length; k++) term.put(tagX + k, METERS_TOP_Y, tag[k], attr)
      }
    }
    const beats = [[FAINT, 30], [NORMAL, 110], [FAINT, 40], [DIM, 90], [BRIGHT, 70], [MUTED, 160]]
    let t = 0
    for (const [attr, delay] of beats) {
      t += delay
      this.fxAfter('boot', t, () => redraw(attr))
    }
    // 30th pass: the beats above flicker all 4 boxes uniformly, including a
    // final MUTED settle -- which would leave NOW PLAYING dimmed down to
    // match its neighbors, undoing drawChrome()'s brighter resting frame
    // for it (see the "hero box" note there). Restore it once the beats
    // land, same as it's already drawn everywhere else.
    this.fxAfter('boot', t + 40, () => {
      drawBoxTop(term, NOWPLAYING_TOP_Y, BOX_X0, BOX_X1, 'NOW PLAYING', BOLD)
      drawBoxSide(term, TRACK_Y, BOX_X0, BOX_X1, BOLD)
      drawBoxSide(term, PLAYBACK_Y, BOX_X0, BOX_X1, BOLD)
      drawBoxBottom(term, NOWPLAYING_BOT_Y, BOX_X0, BOX_X1, BOLD)
    })
  },

  drawVolume(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    // 18th pass: confined to the LEVELS box's left half (see
    // METERS_DIVIDER_X) -- only clears/centers up to the divider now,
    // leaving the reserved right half alone.
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, VOL_Y, ' ')
    // Segment count trimmed from 24 to 16 in the 18th pass to fit the
    // halved width with clean margins either side of the divider.
    const segs = 16
    // 2026-08-27 -- the SLEEP fade is shown, not hidden. this.volume is the
    // setting; sleepScaledVolume() is what the speaker is actually at, and
    // during a sleep run-out those differ. Drawing the setting would put a
    // steady VOL 70 above a speaker fading to nothing, which is the same
    // shape of lie as a BUFFERING readout over a running progress bar. No
    // timer armed means the two are identical and this changes nothing.
    const level = Math.round(this.sleepScaledVolume())
    const filled = this.muted ? 0 : Math.round((level / 100) * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    const label = this.muted ? `VOL [${bar}] MUTE` : `VOL [${bar}] ${level}`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), VOL_Y, label, DIM)
  },

  // Decorative, but reinforces the tuning fantasy: fills in as you approach
  // a station while seeking, full once locked.
  // 2026-08-22 -- room opened up below now playing for some fun things,
  // like VU + signal -- the mobile early-return used to sit at
  // the very top, so the SIG bar didn't even exist on mobile before now.
  // Percent computation is shared with desktop; only the render target
  // (row + width) differs, via mobileDrawSignal.
  // 58th pass -- desktop's own SIG_Y bar removed, since signal can be
  // dropped if needed, freeing the row for drawTriBand()'s
  // BASS/MID/TREBLE meter). pct is now mobile-only; mobile keeps its SIG
  // widget untouched, same reception-distance fiction it always had.
  drawSignal(s) {
    let pct = 0
    if (this.mode === 'locked') pct = 1
    else {
      // 41st pass: nearestSignal, not nearestStation -- the SIG meter is a
      // reception readout, and the secret station is really there.
      const { dist } = nearestSignal(this.freq)
      if (dist <= NEAR_THRESHOLD) pct = 1 - dist / NEAR_THRESHOLD
    }
    if (this.mobile) this.mobileDrawSignal(s, pct)
  },

  // STATION (callsign + tagline) and NOW PLAYING (track) are separate
  // boxes now -- station identity doesn't change on a track skip, so it
  // gets its own clear/draw pair instead of being wiped and redrawn
  // alongside the track every time -- station info broken out from current
  // playing song info (8/20).
  clearStation(s) {
    // 45th pass -- desktop's STATION_Y/TAGLINE_Y row numbers land on
    // completely different content on mobile's shorter grid (row 9 is the
    // NOW PLAYING box's top border there, not station text), so this can't
    // just no-op out of range the way a plain column overrun would.
    // 2026-08-22: row positions now come from this._mLayout (see
    // mobileLayout()) rather than fixed constants -- the box height varies
    // with tagline line count.
    if (this.mobile) {
      const { term } = s
      if (!this._mLayout) return
      const L = this._mLayout
      for (const y of [L.stationCall, L.stationTag1, L.stationTag2]) {
        if (y == null) continue
        for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
      }
      return
    }
    const { term } = s
    // 38th pass: kill any in-flight resolve on these rows first, or its
    // next tick paints characters back onto a row we just cleared.
    this._cancelResolve(STATION_Y)
    this._cancelResolve(TAGLINE_Y)
    for (const y of [STATION_Y, TAGLINE_Y]) {
      for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, y, ' ')
    }
  },

  showStation(s, station, opts = {}) {
    if (this.mobile) { this.mobileShowStation(s, station, opts); return }
    const { term } = s
    this.clearStation(s)
    const maxWidth = BOX_X1 - BOX_X0 - 4
    // 37th pass -- some flair added on either side of the station name,
    // to jazz up the interface -- flanking on-air lamps. Budgeted
    // out of the same maxWidth truncate() already enforces, so even the
    // longest callsign (DISTORTION FIELD) still can't push the box past its
    // border.
    // 41st pass -- the station glyphs extended to either side of the
    // station name, replacing the "on air" circles -- the flair is now the
    // station's own dial marker, so the shape you hunt for on the band is
    // the same shape that frames the callsign once you land on it. The two
    // places a station identifies itself now agree. Falls back to the
    // original dot for anything without a glyph -- which today means the
    // secret station, and that is correct: it has no marker on the dial to
    // echo, because it has no marker at all.
    const FLAIR = station.glyph || '●'
    const flairWidth = FLAIR.length * 2 + 2 // "● " + " ●"
    const callsign = truncate(station.callsign, maxWidth - flairWidth)
    const flaired = `${FLAIR} ${callsign} ${FLAIR}`
    const tagline = truncate(station.tagline, maxWidth)
    const callX = centerX(term.cols, flaired)
    const tagX = centerX(term.cols, tagline)
    if (opts.reveal === false) {
      term.text(callX, STATION_Y, flaired, BRIGHT)
      term.text(tagX, TAGLINE_Y, tagline, MUTED)
    } else {
      const ms = opts.revealMs ?? 260
      this.resolveText(s, callX, STATION_Y, flaired, BRIGHT, ms)
      // Tagline settles a beat behind the callsign -- identity first, then
      // the description, rather than both landing as one block.
      this.resolveText(s, tagX, TAGLINE_Y, tagline, MUTED, ms + 90)
    }
  },

  clearTrack(s) {
    const { term } = s
    if (this.mobile) {
      if (!this._mLayout) { this.updateTabTitle(); return }
      const L = this._mLayout
      for (const y of [L.npTrack1, L.npTrack2, L.npArtist, L.npProgress]) {
        if (y == null) continue
        for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
      }
      this.updateTabTitle()
      return
    }
    this._cancelResolve(TRACK_Y) // see clearStation
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, TRACK_Y, ' ')
    this.updateTabTitle()
  },
  // 38th pass: same reveal options as showStation(). skip() passes a
  // shorter one -- a track change within a station you are already locked
  // onto is a smaller event than finding the station was.
  showTrack(s, track, opts = {}) {
    if (this.mobile) { this.mobileShowTrack(s, track, opts); return }
    const { term } = s
    this.clearTrack(s)
    const maxWidth = BOX_X1 - BOX_X0 - 4
    let line = `${track.title}  --  ${track.artist}`
    if (line.length > maxWidth) {
      // Truncate the title first and keep the artist whole where possible
      // -- who it's by matters more once space runs out than the last
      // few words of a long title.
      const suffix = `  --  ${track.artist}`
      const titleBudget = maxWidth - suffix.length
      line = titleBudget >= 8
        ? truncate(track.title, titleBudget) + suffix
        : truncate(line, maxWidth)
    }
    // 30th pass -- the current playing song needed to be brighter, like
    // the station name is -- was NORMAL, a full tier under the station
    // callsign's BRIGHT. Bumped to BOLD rather than matching BRIGHT exactly
    // so station (identity) and track (content) stay visually distinct
    // tiers instead of collapsing to the same weight.
    const lineX = centerX(term.cols, line)
    if (opts.reveal === false) term.text(lineX, TRACK_Y, line, BOLD)
    else this.resolveText(s, lineX, TRACK_Y, line, BOLD, opts.revealMs ?? 250)
    this.updateTabTitle(track)
  },
  // 21st pass (0.3 wishlist: browser tab title shows now-playing)
  // -- the whole point of SIGNAL living in one tab is you leave it running
  // in the background, so the tab itself is the only always-visible surface
  // once you've switched away. clearTrack() (called whenever nothing's
  // loaded -- seeking, scanning, power-off) resets to the bare title;
  // showTrack() sets it to callsign + track. Cheap: just a document.title
  // write, no extra DOM/animation cost.
  updateTabTitle(track) {
    document.title = (this.lockedStation && track)
      ? `${this.lockedStation.callsign} · ${track.title} — SIGNAL`
      : 'SIGNAL'
  },

  // Progress bar + play-state indicator, merged onto one row 2026-08-20
  // (8th pass) -- they used to be two separate lines but both are just
  // "playback status", and combining them paid for the LEVELS divider row
  // below. Only source of playback feedback at all now that the player
  // itself is off-screen: without this there'd be no way to tell playing
  // from paused, how far into a track you are, or that a track ended and
  // skipped. setPlayState() updates this.playState; drawPlayback() is the
  // only thing that actually draws, called from frame() (throttled -- time
  // display doesn't need per-frame precision) and after any state change.
  setPlayState(s, state) {
    this.playState = this.mode === 'locked' ? state : null
    this.drawPlayback(s)
  },
  // BUG FIXED (29th pass, found verifying the hint-bar reflow): the YT
  // player's onStateChange fires async, outside frame()'s own guideOpen
  // bail, and used to draw straight through to PLAYBACK_Y (row 14)
  // regardless -- which happens to be the same row the guide's CONTROLS
  // block now uses for its first line, so a state change mid-guide (e.g.
  // BUFFERING -> PLAYING right as you open it) punched "> PLAYING" over
  // "[<-/->] SEEK...". `this.playState` above the guard in setPlayState()
  // still gets updated while the guide is open, so nothing is lost --
  // closeGuide() already calls setPlayState(s, this.playState) as its
  // last step, which redraws this row correctly once the guide closes.
  // 2026-08-22 -- a now playing bar with playback bar etc, like the full
  // version, now working without a tuner strip on mobile view -- was
  // flatly disabled on mobile before; now
  // routes to mobileDrawPlayback for a condensed version inside the NOW
  // PLAYING box's own extra row instead of desktop's fixed PLAYBACK_Y.
  drawPlayback(s) {
    // 69th pass -- found live: player.pauseVideo() (called from
    // powerDown()) triggers the YT iframe's PAUSED state change
    // ASYNCHRONOUSLY, same "outside frame()'s own guards" class of bug the
    // 29th pass fixed for guideOpen -- onStateChange -> setPlayState ->
    // here can land well after STANDBY has already drawn, painting stale
    // "|| PAUSED" + a progress bar straight into PLAYBACK_Y regardless.
    // Harmless-looking on the old multi-beat collapse (that row was usually
    // mid-glitch/collapsed by the time this landed); with powerDown() now
    // snapping straight to a static STANDBY and staying there, that stray
    // write landed squarely on the finished picture and stuck -- read as a
    // broken, doubled-looking wordmark, since PLAYBACK_Y falls inside
    // STANDBY's centered layout on some grid sizes. The actual bug, not a
    // CRT persistence artifact -- a decay/clearPersist() workaround in
    // powerDown() couldn't have fixed this either way, since nothing here
    // was reading persistence; it was a genuine second write to the buffer.
    if (!this.poweredOn || this.guideOpen) return
    if (this.mobile) { this.mobileDrawPlayback(s); return }
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, PLAYBACK_Y, ' ')
    if (this.mode !== 'locked') return

    let barPart = ''
    if (this.ready && this.player) {
      let cur, dur
      try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
      if (dur && isFinite(dur) && dur > 0) {
        const fmt = fmtTime
        const segs = 28
        const filled = Math.round(Math.min(1, cur / dur) * segs)
        let bar = ''
        for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '·'
        barPart = `[${bar}] ${fmt(cur)} / ${fmt(dur)}`
      }
    }

    const labels = {
      playing: ['> PLAYING', BRIGHT],
      paused: ['|| PAUSED', MUTED],
      buffering: ['BUFFERING...', DIM],
      // 2026-08-27 -- derived from breakActive rather than stored in
      // this.playState, which belongs to the YouTube player: a PLAYING
      // event arriving mid-advert (they do) would otherwise stomp it back
      // to "> PLAYING" and put the lie straight back on the screen.
      break: ['COMMERCIAL', BOLD],
    }
    const entry = labels[this.breakActive ? 'break' : this.playState]
    const labelPart = entry ? entry[0] : ''
    const sep = barPart && labelPart ? '   ' : ''
    const full = barPart + sep + labelPart
    if (!full) return
    const startX = centerX(term.cols, full)
    if (barPart) term.text(startX, PLAYBACK_Y, barPart, FAINT)
    if (labelPart) term.text(startX + barPart.length + sep.length, PLAYBACK_Y, labelPart, entry[1])
  },

  // Scrolling waveform squiggle (11th pass -- the analog needle from the
  // 10th pass wasn't landing; this replacement was picked from a set of
  // proposed alternatives). A ring buffer of recent amplitude samples
  // (this.vuTrace) shifts left every draw and a fresh sample lands on the
  // right, so the whole row reads as a live trace scrolling past rather
  // than bars bouncing in place or one marker sliding. The sample itself
  // still comes from spring-damped continuity (this.vuSample/vuVelocity)
  // rather than pure noise, so consecutive samples flow into each other
  // like a real waveform instead of looking like static. Still decorative
  // -- WebAudio has no visibility into the YouTube iframe's actual output.
  // 2026-08-22: mobile early-return used to sit right here, before the
  // spring physics even ran -- this.vuSample/vuVelocity/vuTrace never
  // advanced at all in mobile mode. Now the physics always run (shared with
  // desktop, one clock for the whole receiver) and only the render target
  // branches, via mobileDrawVU.
  drawVU(s) {
    const playing = this.mode === 'locked' && this.playState === 'playing'
    // 23rd pass -- more animation, so it's fun to see it change as you do
    // things: the target was previously a flat 0.15-0.95 swing whenever
    // playing, regardless of volume/mute, and a flat 0.03 the rest of the
    // time -- so muting or turning the volume down didn't do anything to
    // it, and it went dead the instant you weren't locked. Two changes:
    //   1. Volume/mute now actually scale the swing, so a quiet or muted
    //      set reads as a quiet or flat meter, not a full-swing one.
    //   2. 'seeking' mode (this covers both idle-tuned and actively
    //      scanning -- see the mode comment in init()) gets its own low
    //      flutter instead of pinning to the same 0.03 floor as powered-on-
    //      but-paused, so hunting for a signal still reads as "alive".
    const volFactor = this.muted ? 0 : this.volume / 100
    const searching = this.mode === 'seeking'
    // 41st pass -- per-station ballistics (see stationBallistics). Only the
    // PLAYING target is scaled by swing: the seeking flutter and the resting
    // floor belong to the receiver, not to whatever station happens to be
    // loaded, so they stay identical everywhere on the dial.
    const b = this.stationBallistics()
    let target
    // 2026-08-23 (live audio tap) -- with a live signal the VU stops rolling
    // dice and tracks the track's actual loudness. Only the TARGET changes:
    // the spring/damping below (and so each station's meter character) is
    // untouched, and volFactor stays multiplied in deliberately -- the AGC
    // in the tap normalizes per-track loudness, so without volFactor a
    // turned-down set would re-inflate to full swing within seconds,
    // undoing the 23rd pass's volume/mute behavior. Seeking flutter and the
    // resting floor stay synthetic: they belong to the receiver, not the
    // program material (same reasoning as the 41st-pass swing note above).
    if (playing && audioSignalLive()) target = Math.min(1, volFactor * b.swing * (0.08 + 0.92 * AUDIO_BUS.level))
    else if (playing) target = Math.min(1, volFactor * b.swing * (0.15 + Math.random() * 0.8))
    else if (searching) target = 0.04 + Math.random() * 0.10
    else target = 0.03
    const spring = b.spring
    const damping = b.damping
    const accel = (target - this.vuSample) * spring - this.vuVelocity * damping
    this.vuVelocity += accel
    this.vuSample = Math.max(0, Math.min(1, this.vuSample + this.vuVelocity))
    this.vuTrace.shift()
    this.vuTrace.push(this.vuSample)
    // 2026-08-22 (bug report: "no ... VU" while muted) -- chars[0] used to
    // be a literal space, so once volFactor hit 0 (any station, whenever
    // muted -- not specific to the secret station) the spring eventually
    // settles vuSample to exactly 0 and the *entire* row rendered as
    // blank, reading as "the VU meter is gone" rather than the intended
    // "flat line" (see the 23rd-pass comment above: "a quiet or muted set
    // reads as a quiet or flat meter, not a full-swing one" -- flat, not
    // invisible). '▁' is the lowest non-empty block, so the floor is
    // always at least a visible flat trace.
    // 58th pass -- desktop's own VU_Y trace removed, replaced with the
    // bass/mid/treble bars, see drawTriBand(). The physics
    // above still runs on every platform: mobile's own VU widget and
    // pulseVU()'s lock/skip kick both depend on vuSample/vuVelocity/
    // vuTrace staying alive, they just don't render on desktop any more.
    if (this.mobile) this.mobileDrawVU(s, playing)
  },

  /** 41st pass -- per-station meter ballistics. Three numbers per station, feeding both
   *  the VU trace and the EQ ribbon:
   *    spring  -- how hard the meter is pulled toward its target
   *    damping -- how fast that pull is bled off
   *    swing   -- how far the target itself travels while playing
   *  DRIFT MODE drifts (0.16/0.72/0.55, barely moving); CIPHER and the
   *  secret station snap (0.6+/0.4/1.05+). The defaults below are the values
   *  every station used before this pass, so anything without a `meter`
   *  field behaves exactly as it always did -- including "no station at
   *  all", which is what the meters fall back to while seeking. */
  /** The four-way state every meter reads: 'seeking' | 'buffering' |
   *  'playing' | 'paused' (2026-08-25 audit -- was derived identically,
   *  inline, in three draw methods). */
  playbackState() {
    if (!(this.mode === 'locked' && this.lockedStation)) return 'seeking'
    if (this.playState === 'buffering') return 'buffering'
    if (this.playState === 'playing') return 'playing'
    return 'paused'
  },
  DEFAULT_BALLISTICS: { spring: 0.4, damping: 0.5, swing: 1 },
  stationBallistics() {
    const m = this.mode === 'locked' && this.lockedStation && this.lockedStation.meter
    return m ? { ...this.DEFAULT_BALLISTICS, ...m } : this.DEFAULT_BALLISTICS
  },

  // 23rd pass: a one-shot push into the spring rather than a new state
  // machine -- pulseVU() just shoves vuVelocity, and the existing
  // spring/damping in drawVU() above pulls it back down over the next few
  // draws, so a lock/skip reads as an attack-and-decay hit instead of
  // blending invisibly into the ambient random walk.
  pulseVU(amount) {
    this.vuVelocity += amount
  },

  // Animated antenna glyph (29th pass, replacing the PWR/AIR/STEREO/MONO/
  // MUTE bracketed indicator rows -- an animated "signal" graphic
  // in the lower right, antenna-looking, animating depending on
  // status). Fills the same LEVELS right-half rows those indicators used
  // (VOL_Y..VU_Y), redrawn on the same per-frame cadence as drawVU() (see
  // the frame() call site) so it actually animates rather than only
  // updating on a state-change event.
  //
  // A nested-arc broadcast tower -- mast+base always faintly visible (PWR
  // is implicit: this only ever runs while powered on, same reasoning the
  // old PWR light used), 3 rings of arcs above it that read as the
  // "signal" part:
  //   seeking (not locked)  -- innermost ring blinks slowly on its own, a
  //                            "still listening" pulse rather than silence.
  //   locked + buffering     -- erratic single-ring flicker, unstable read.
  //   locked + playing       -- rings pulse outward in sequence (inner to
  //                            outer, looping), both sides together -- the
  //                            "actively on air" state.
  //   locked + paused        -- steady mid-ring, no animation.
  // 31st pass -- the antenna and FLD should still be active even
  // while muted -- mute used to be its own branch here (frozen dim
  // ring), which conflated "the tuner is locked onto a signal" with "the
  // speaker is silenced". Those are different things -- a muted radio is
  // still receiving. Rings/FLD now key off playState only, same as an
  // unmuted set; only the EQ ribbon (an audio-level analog, like the VU
  // meter it sits next to) and the MUTE switch widget still check
  // this.muted directly.
  ANTENNA_TEMPLATE: [
    '(           )',
    ' (         ) ',
    '  (   |   )  ',
    '      |      ',
    '    __|__    ',
  ],
  // [row index into ANTENNA_TEMPLATE/antennaRows, left-char offset, right-char offset]
  ANTENNA_RINGS: [
    { row: 0, left: 0, right: 12 },
    { row: 1, left: 1, right: 11 },
    { row: 2, left: 2, right: 10 },
  ],
  // 2026-08-22 -- the FLD changing-number widget added, along with a more
  // obvious mute off/on -- mobile has no antenna glyph/rings (there's no
  // tuner strip to drive them, same reason there's no TUNING BAND box), but
  // FLD still wants the locked/buffering/playing/paused state this function
  // already derives, so mobile branches off with that same state string
  // rather than recomputing it separately.
  drawAntenna(s, t) {
    if (this.mobile) {
      const state = this.playbackState()
      this.mobileDrawFieldReadout(s, state)
      this.mobileDrawMuteSwitch(s)
      return
    }
    const { term } = s
    const rows = [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]
    for (const y of rows) for (let x = METERS_DIVIDER_X + 1; x < BOX_X1; x++) term.put(x, y, ' ')

    const template = this.ANTENNA_TEMPLATE
    const startX = centerXRange(METERS_DIVIDER_X + 1, BOX_X1 - 1, template[0])

    // Base structure (mast, base, and all 3 rings faintly) -- drawn fresh
    // every frame so the previous frame's brightened ring reverts to faint
    // before this frame picks its own active ring, rather than smearing.
    for (let r = 0; r < template.length; r++) {
      const line = template[r]
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ') term.put(startX + i, rows[r], line[i], FAINT)
      }
    }

    const lightRing = (ringIdx, attr) => {
      const ring = this.ANTENNA_RINGS[ringIdx]
      term.put(startX + ring.left, rows[ring.row], '(', attr)
      term.put(startX + ring.right, rows[ring.row], ')', attr)
    }

    // 30th pass: this used to `return` straight out of each branch --
    // switched to a shared `state` string instead so drawFieldReadout()
    // below can run once, in every branch, without duplicating the locked/
    // buffering/playing checks. The ring logic itself is unchanged. (31st
    // pass: dropped the separate muted branch -- see the comment above
    // ANTENNA_TEMPLATE. 58th pass: drawEqRibbon() moved out of this pane
    // entirely, see drawEqRibbonLeft().)
    const locked = this.mode === 'locked' && this.lockedStation
    let state
    if (!locked) {
      // Seeking -- slow symmetric blink on the innermost ring only.
      if (Math.floor(t / 0.6) % 2 === 0) lightRing(2, DIM)
      state = 'seeking'
    } else if (this.playState === 'buffering') {
      // Erratic flicker -- a random ring, each side independently on this
      // redraw, unstable read rather than a clean pulse.
      const ring = this.ANTENNA_RINGS[Math.floor(Math.random() * 3)]
      if (Math.random() < 0.7) term.put(startX + ring.left, rows[ring.row], '(', BRIGHT)
      if (Math.random() < 0.7) term.put(startX + ring.right, rows[ring.row], ')', BRIGHT)
      state = 'buffering'
    } else if (this.playState === 'playing') {
      // Inbound pulse -- rings cycle outer -> inner, then the pulse
      // continues straight down the mast to the base, so the whole chain
      // reads as a signal arriving from the air and travelling all the way
      // to the ground rather than stopping once it reaches the pole
      // -- the signal "goes down" the mast too. MAST_COL is
      // the '|' column shared by template rows 2-4 (rings' row 2, the bare
      // rod row 3, and the '__|__' base row 4), so the flash tracks the
      // same vertical line the rings already converge on.
      const MAST_COL = 6
      const step = Math.floor(t / 0.25) % 5
      if (step < 3) {
        lightRing(step, BRIGHT)
      } else if (step === 3) {
        term.put(startX + MAST_COL, rows[3], '|', BRIGHT)
      } else {
        for (let dx = -2; dx <= 2; dx++) {
          term.put(startX + MAST_COL + dx, rows[4], dx === 0 ? '|' : '_', BRIGHT)
        }
      }
      state = 'playing'
    } else {
      // Paused -- steady mid-ring, no animation.
      lightRing(1, BRIGHT)
      state = 'paused'
    }

    this.drawSnrReadout(s, startX, rows, state)
    this.drawFieldReadout(s, startX, rows, state)
    this.drawPulseReadout(s, startX, rows, state)
    // 31st pass -- filled that empty space, making
    // them look like switches / buttons -- the antenna glyph is only 13
    // columns wide inside a ~37-column pane, so there's a matching ~10-
    // column margin on the LEFT that's been sitting empty since the FLD
    // readout/EQ ribbon only claimed the right side. These three mirror
    // live state that's otherwise only readable from the bottom legend's
    // key bindings or (for display mode) the screen's overall tint, with
    // no on-screen readout at all.
    this.drawPresetStrip(s, rows)
    this.drawModeStrip(s, rows)
    this.drawMuteSwitch(s, rows)
  },

  // Preset position (1-9), left margin top row -- the 9 stations map
  // directly to the [1-9] keys in frequency order (STATION_PRESET_ORDER),
  // same mapping the guide's station table and the [B]ack logic already
  // use. Brightness-only (no brackets) to keep it a fixed 9-column strip.
  drawPresetStrip(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[0] // VOL_Y
    const x0 = METERS_DIVIDER_X + 2
    const idx = this.lockedStation ? STATION_PRESET_ORDER.indexOf(this.lockedStation) : -1
    for (let i = 0; i < STATION_PRESET_ORDER.length; i++) {
      term.put(x0 + i, y, String(i + 1), i === idx ? BRIGHT : FAINT)
    }
  },

  // Display-mode selector, left margin middle row -- mirrors [C]'s cycle
  // through DISPLAY_MODES. This is the one addition here that closes an
  // actual gap rather than just duplicating something shown elsewhere:
  // right now the only feedback for which phosphor tint is active is the
  // whole screen's own color, with no on-screen label anywhere.
  drawModeStrip(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[2] // SIG_Y
    const x0 = METERS_DIVIDER_X + 2
    const letters = ['G', 'A', 'B', 'M', 'P'] // matches DISPLAY_MODES order
    const activeIdx = this.displayModeIndex
    for (let i = 0; i < letters.length; i++) {
      term.put(x0 + i * 2, y, letters[i], i === activeIdx ? BRIGHT : FAINT)
    }
    // Bracket the active letter using its flanking gap columns instead of
    // a separate label row -- keeps the whole strip a fixed 9 columns.
    term.put(x0 + activeIdx * 2 - 1, y, '[', BRIGHT)
    term.put(x0 + activeIdx * 2 + 1, y, ']', BRIGHT)
  },

  // MUTE rocker, left margin bottom row -- a real switch-style readout
  // rather than the antenna's own frozen-ring mute state, which only ever
  // reads as "not animating" (easy to miss). Lit/BRIGHT when mute is
  // actually engaged, same convention as a physical mute button's own LED.
  drawMuteSwitch(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[4] // VU_Y
    const x0 = METERS_DIVIDER_X + 2
    const label = this.muted ? 'MUTE [ON ]' : 'MUTE [OFF]'
    term.text(x0, y, label, this.muted ? BRIGHT : FAINT)
  },

  /** 39th pass -- signal-to-noise, in the last free block of the antenna
   *  pane's right margin (the row directly above TRI, formerly FLD then
   *  briefly BPM). The pair is the point: TRI is how MUCH signal is
   *  arriving (or, since the 57th pass, the tempo riding on it), S/N is
   *  how CLEAN it is, and real receivers show both because they answer
   *  different questions.
   *
   *  Unlike every other readout in this pane, this one is not decorative --
   *  it is derived from the actual tuning distance, on the same
   *  NEAR_THRESHOLD curve the static bed (staticGainForDist) and the CRT
   *  degrade (crtDegradeForDist) already use. So it agrees with what you
   *  are hearing and seeing by construction rather than by coincidence:
   *  hunting between stations reads in the teens, easing onto a carrier
   *  climbs it, locked pins it at the top.
   *
   *  Deliberately NO randomness or spring, which is what separates it from
   *  its neighbours: the rings, the EQ ribbon and TRI are all continuous
   *  and fast, and a fourth jittering number would just add noise to the
   *  busiest corner of the screen. This only changes when the dial does.
   *  Fixed-width output (always "S/N " + 2 digits), so it can never leave a
   *  stray character behind between redraws. */
  SNR_MAX: 56,
  SNR_MIN: 9,
  drawSnrReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[0] // VOL_Y -- directly above TRI (formerly FLD) on SIG_Y
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    // Locked pins to a clean reading rather than measuring. dist is 0 at a
    // station's own frequency anyway, so this is the same number 99% of the
    // time -- but it also means nothing (a rounding artifact, a redraw
    // landing mid-sweep before tryLock has retuned to the exact frequency)
    // can ever show a degraded S/N on a carrier the set is holding. Locked
    // is locked.
    const pct = state === 'seeking' ? Math.min(1, nearestSignal(this.freq).dist / NEAR_THRESHOLD) : 0
    const snr = Math.round(this.SNR_MAX + (this.SNR_MIN - this.SNR_MAX) * pct)
    // Same attribute convention as drawFieldReadout() below, so the two
    // readouts read as one stacked pair rather than two unrelated labels.
    term.text(x0, y, `S/N ${String(snr).padStart(2, '0')}`, state === 'seeking' ? FAINT : DIM)
  },

  // Secondary readout, upper-right margin of the antenna pane (30th pass --
  // a secondary readout made sense; switched from FLD to BPM in a
  // follow-up to show bpm; renamed
  // again from BPM to TRI -- "totally real indicator" -- in a further
  // follow-up, keeping the exact same value underneath). Shows the real
  // detected tempo (AUDIO_BUS.bpm/bpmConf, the same rolling-median estimate
  // HACKBACK's meters and beatPhase already key off) once it's confident;
  // until then it falls back to the same spring/damping filler FLD always
  // used, just rescaled into a plausible tempo band instead of FLD's 30-95
  // range, so the readout never sits dead waiting on a lock -- which is
  // exactly why "totally real" is a wink, not a promise: it's honest tempo
  // when confident, atmospheric filler otherwise, same as it's always been.
  // Fixed-width output only (always "TRI " + 3 chars) so it never leaves a
  // stray trailing character behind between redraws.
  drawFieldReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[2] // SIG_Y -- vertically centered on the glyph
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    const [label, attr] = this._fieldReadout(state)
    term.text(x0, y, label, attr)
  },
  /** [label, attr] for the TRI readout in a given playback state, stepping
   *  the shared spring (this.fieldSample/fieldVelocity -- there is only one
   *  receiver, so desktop and mobile read one value). 2026-08-25 audit:
   *  drawFieldReadout and mobileDrawFieldReadout each carried a copy. */
  _fieldReadout(state) {
    if (state === 'seeking') return ['TRI ---', FAINT]
    if (state === 'buffering') return ['TRI ...', DIM]
    // playing/paused -- same spring/damping shape drawVU() uses for
    // vuSample, kept as its own independent value (this.fieldSample) so
    // this doesn't just visually mirror the VU bar's motion.
    if (state === 'playing' && audioSignalLive() && AUDIO_BUS.bpm && AUDIO_BUS.bpmConf >= 0.5) {
      return [`TRI ${String(Math.round(AUDIO_BUS.bpm)).padStart(3, '0')}`, DIM]
    }
    // No confident lock yet (or muted/no tap/paused) -- same atmospheric
    // filler FLD always fell back to, rescaled 70-160 (a plausible tempo
    // band) instead of FLD's old 30-95 signal-strength range. 31st pass's
    // ignore-mute rule survives by construction: muting silences the tab,
    // the tap gates, audioSignalLive() goes false, and this drops back to
    // the same synthetic flicker it always had while muted.
    const target = state === 'playing'
      ? (audioSignalLive() ? 0.30 + 0.65 * AUDIO_BUS.mid : 0.55 + Math.random() * 0.4)
      : 0.5 + Math.random() * 0.06
    const spring = 0.3, damping = 0.55
    const accel = (target - this.fieldSample) * spring - this.fieldVelocity * damping
    this.fieldVelocity += accel
    this.fieldSample = Math.max(0, Math.min(1, this.fieldSample + this.fieldVelocity))
    const val = String(Math.round(70 + this.fieldSample * 90)).padStart(3, '0')
    return [`TRI ${val}`, state === 'playing' ? DIM : FAINT]
  },

  // Pulse readout, antenna pane's bottom-right (58th pass -- fills the slot
  // the EQ ribbon vacated when it moved to the LEVELS box's left half, see
  // drawEqRibbonLeft(); replaces what used to be on the
  // right with something for onset/pulse, PLS, showing an
  // interesting/changing numeric value. Real signal: AUDIO_BUS.pulse is
  // the 1->0 decay that fires after every detected onset (TAP_PULSE_TAU =
  // 0.12s -- see sampleAudioTap()), which decays faster than this readout's
  // own ~0.12s redraw cadence, so displaying it raw would mostly flash
  // between near-99 and 0 rather than reading as a number. this._pulseDisplay
  // is a slower peak-hold on top of it (own 0.85-per-redraw decay, own
  // state, own init) purely for legibility -- every spike is still a real
  // onset, it just bleeds out over a readable ~1s instead of one frame.
  drawPulseReadout(s, startX, rows, state) {
    if (this.mobile) return
    const { term } = s
    const y = rows[4] // VU_Y -- vertically centered on the glyph's base
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    if (state === 'seeking') {
      term.text(x0, y, 'PLS --', FAINT)
      this._pulseDisplay = 0
      return
    }
    if (state === 'buffering') {
      term.text(x0, y, 'PLS ..', DIM)
      return
    }
    if (state === 'playing' && audioSignalLive() && !this.muted) {
      this._pulseDisplay = Math.max(this._pulseDisplay * 0.85, AUDIO_BUS.pulse)
    } else if (state === 'playing') {
      // No live tap (or muted) -- same "still alive" filler idiom as every
      // other readout in this pane: occasional random spikes riding the
      // same decay curve, so it never just sits flat while powered on.
      if (Math.random() < 0.06) this._pulseDisplay = 0.5 + Math.random() * 0.5
      else this._pulseDisplay *= 0.85
    } else {
      this._pulseDisplay *= 0.85 // paused -- let it bleed out, no new spikes
    }
    const val = String(Math.round(Math.max(0, Math.min(1, this._pulseDisplay)) * 99)).padStart(2, '0')
    term.text(x0, y, `PLS ${val}`, state === 'playing' && audioSignalLive() && !this.muted ? DIM : FAINT)
  },

  // Spectrum ribbon (30th pass -- thin horizontal
  // ribbons fit the space) -- moved 58th pass from a single-char-per-band strip in the
  // antenna pane's cramped right-half margin to its own full-width row in
  // the LEVELS box's left half, replacing one of the doubled rows
  // of bars with the eq ribbon: this replaces the right-
  // half ribbon outright rather than living alongside it. Widened 6 -> 9
  // bands same pass (bumped up to 9 bands -- see TAP_BAND_EDGES_HZ/
  // TAP_BANDS), then given the tri-band meter's row too, for more
  // headroom, dropping the horizontal bass/treble/mid layout -- drawTriBand() is
  // no longer called anywhere, left in place as orphaned code per this
  // file's own convention for retired widgets/effects). First cut split
  // each band across just SIG_Y/VU_Y with the VU_DIVIDER_Y grille still
  // dotted through the middle -- a follow-up review (no second dotted
  // row and no gap, don't treat them as separate rows) called that out as
  // still reading like two stacked widgets, not one meter. Final shape:
  // the VU_DIVIDER_Y grille call is gone entirely (see drawChrome()) and
  // this now spans all 3 rows -- SIG_Y, VU_DIVIDER_Y, VU_Y -- as one
  // continuous column per band, 24 discrete levels (8 eighths x 3 rows),
  // fully overwritten every frame so nothing shows through the middle row.
  // Own spring-damped state (this.eqSamples/eqVelocities) rather than one
  // scrolling trace like drawVU()'s bar. Computes its own `state` the same
  // way drawTriBand() used to, since it's not called from inside
  // drawAntenna() and can't share that function's local variable.
  drawEqRibbonLeft(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const state = this.playbackState()
    const b = this.stationBallistics()
    const chars = ' ▁▂▃▄▅▆▇█' // 9 glyphs = 8 eighth-block steps per row
    // 9 bands across the 36-col interior -- 3 cols of solid fill + 1 col
    // gap per band tiles it exactly (9*4=36) and still reads as 9 distinct
    // bars rather than one continuous ribbon, though thinner than the
    // original 6-band version's 5-wide bars.
    const barW = 3, step = 4
    for (let i = 0; i < this.eqSamples.length; i++) {
      let target
      if (this.muted) target = 0.05
      // 2026-08-23 (live audio tap) -- the ribbon becomes a real 9-band
      // spectrum, low on the left to high on the right, when the tap is
      // live. Muted stays first and stays flat (31st-pass rule), doubly
      // guaranteed: muted tab audio goes silent, so the tap's gate would
      // zero these bands anyway. Springs below untouched, same as the VU.
      else if (state === 'playing' && audioSignalLive()) target = Math.min(1, b.swing * (0.05 + 0.95 * AUDIO_BUS.bands9[i]))
      else if (state === 'playing') target = Math.min(1, b.swing * (0.15 + Math.random() * 0.8))
      else if (state === 'buffering') target = Math.random() * 0.6
      else if (state === 'seeking') target = 0.03 + Math.random() * 0.08
      else target = 0.05 // paused -- nearly flat
      // 41st pass: same station ballistics as the VU, scaled down slightly
      // -- the ribbon reads as several narrow bands rather than one summed
      // level, and bands that snap exactly as hard as the main meter make
      // the two look like copies of each other instead of two instruments
      // watching the same signal.
      const spring = b.spring * 0.9, damping = b.damping
      const accel = (target - this.eqSamples[i]) * spring - this.eqVelocities[i] * damping
      this.eqVelocities[i] += accel
      this.eqSamples[i] = Math.max(0, Math.min(1, this.eqSamples[i] + this.eqVelocities[i]))
      // Split one 0..1 sample across all 3 rows for real vertical headroom
      // instead of one row's 9-level glyph ramp: VU_Y (bottom) carries the
      // first third of the range, VU_DIVIDER_Y (middle) only lights once
      // the bottom is already full, and SIG_Y (top) only lights once the
      // middle is full too -- a 3-row LED ladder, so a band that's merely
      // loud fills the bottom while only a genuinely hot one reaches the
      // top. clamp8() keeps each row's slice of the 0..24 range in the
      // chars array's own 0..8 bounds.
      const clamp8 = (v) => Math.max(0, Math.min(8, Math.round(v)))
      const twentyFourths = this.eqSamples[i] * 24
      const botCh = chars[clamp8(Math.min(8, twentyFourths))]
      const midCh = chars[clamp8(Math.min(8, Math.max(0, twentyFourths - 8)))]
      const topCh = chars[clamp8(Math.max(0, twentyFourths - 16))]
      // 58th pass -- flat DIM/FAINT, not visualizerLevelAttr's per-value
      // brightness ramp (which reaches all the way to BRIGHT). A darker
      // color was needed -- they looked too similar to the other
      // bars right above -- the tri-band meter that used to sit above
      // this used that same level-scaled brightness, so the two widgets
      // were popping the same way; this keeps the ribbon on the flat
      // two-tone attr it always had (back when it lived in the antenna
      // pane's right half) so it still reads as a dimmer, secondary
      // readout even now that it owns all 3 rows.
      const attr = !this.muted && state === 'playing' ? DIM : FAINT
      const x0 = BOX_X0 + 1 + i * step
      for (let k = 0; k < barW; k++) {
        term.put(x0 + k, VU_Y, botCh, attr)
        term.put(x0 + k, VU_DIVIDER_Y, midCh, attr)
        term.put(x0 + k, SIG_Y, topCh, attr)
      }
      term.put(x0 + barW, VU_Y, ' ')
      term.put(x0 + barW, VU_DIVIDER_Y, ' ')
      term.put(x0 + barW, SIG_Y, ' ')
    }
  },


  // Filled-background control panel, same treatment as the title bar
  // (8/20: distinguishes the controls from the rest of the screen
  // the same way SIGNAL/v0.2 stand out up top, not as dim floating text).
  drawHint(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    // 29th pass -- top row = radio-esque, bottom row = things a
    // real radio doesn't have: line1 is now just tuning/receiver
    // primitives -- seek, lock, scan, presets, back. GUIDE moved down to
    // line2 (a real radio never had a help screen) and PLAY/PAUSE was
    // removed outright (see key() comment) rather than moved, since it's
    // not being kept anywhere.
    const line1 = '[<-/->] SEEK   [ENTER] LOCK   [S] SCAN   [1-9] PRESETS   [B] BACK'
    // 23rd pass: "[C] MODE" rather than the fuller "[C] DISPLAY" -- kept
    // short for the same reason now that GUIDE joined this line too (the
    // fixed hint row has broken before on an over-length string, see
    // centerX()'s own clamping comment).
    // 43rd/44th pass: gaps tightened 3sp->2sp across this whole line to make
    // room for [V] VIZ without breaking 80 cols (centerX() clamps silently
    // on overflow -- see its own comment -- so this was worth getting
    // right). "VIZ" not "SAVER" -- calling it a screensaver breaks
    // immersion a bit; the feature is the Visualizer.
    // 50th pass -- standardized on COLOR -- was '[C] MODE'. The
    // same control was called MODE here, DISPLAY MODE in the Guide and
    // COLOR in the visualizer; three names for one key. COLOR wins: it's
    // what the control actually does (every mode is a phosphor color),
    // it's plainer to a first-time user than 'mode', and it's the only
    // one that keeps the visualizer legend's '[C]OLOR' bracket-fold
    // working. Row goes 74 -> 75 cols, still inside 80. NOTE the code
    // vocabulary stays 'mode' (DISPLAY_MODES, cycleDisplayMode,
    // drawModeStrip) -- deliberate, renaming those buys nothing and this
    // is a label decision, not a model one.
    const line2 = '[N] NEXT  [UP/DOWN] VOL  [M] MUTE  [P] POWER  [G] GUIDE  [C] COLOR  [V] VIZ'
    // 52nd pass -- the lower bar footer in main view mode was too
    // bright and hard to read, dialed down. First cut dropped the row
    // fill to DIM but kept the text calls at NORMAL -- in inverse mode the
    // attr paints each cell's BACKGROUND swatch, not just the ink, so
    // every cell a letter sits in got repainted at the text's (brighter)
    // attr while the blank cells around it stayed at the fill's DIM,
    // leaving a patchwork of little bright rectangles across a dim bar,
    // with the command text background different from the
    // footer. Fixed by matching text and fill so the bar reads as one
    // flat shade. Line1 then went back to BOLD to mark
    // SEEK/LOCK/SCAN/PRESETS/BACK as the primary row -- checked this
    // doesn't reintroduce the same patchwork (pixel-sampled the rendered
    // bar column by column) and it doesn't: BOLD's own background reads
    // as one flat brighter shade across the whole row, same as line2's
    // flat DIM, so the two rows are each internally uniform and only
    // differ from each other, which is what "define the main commands"
    // actually wants.
    for (let x = 0; x < term.cols; x++) { term.put(x, HINT_Y1, ' ', DIM, 1); term.put(x, HINT_Y2, ' ', DIM, 1) }
    term.text(centerX(term.cols, line1), HINT_Y1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), HINT_Y2, line2, DIM, 1)
  },
}
