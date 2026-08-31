// SIGNAL -- the [G] guide overlay: about/controls, station index, and one
// detail page per station. Mixed into the program object. Split out in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playPanelSound, stopStaticNoise } = await import(`../audio/sfx.js?v=${V}`)
const { VERSION_TAG } = await import(`../constants.js?v=${V}`)
const { centerX, clearGrid, sampleTracks, truncate, wordWrap } = await import(`../layout.js?v=${V}`)
const { STATIONS } = await import(`../stations.js?v=${V}`)

export default {

  // [G] guide (15th pass) -- a simple
  // guide on how things work, a blurb about what the app is and that it is
  // made by Hyphen8d, inspired by his own music tastes but made for the
  // community. Full-screen takeover, same clearAll-and-redraw approach
  // the power sequences already use. Any keypress closes it (see key()) --
  // there's no separate "close" key to remember, same idea as the STANDBY
  // screen only listening for P.
  // 67th pass -- fromStandby is true only for the new [I] STANDBY entry
  // point (see key()); closeGuide() checks it to land back on STANDBY
  // instead of rebuilding the powered-on chrome underneath, since the set
  // is still off.
  openGuide(s, fromStandby) {
    if (this.guideOpen) return
    this.guideOpen = true
    this.guidePage = 1
    this._guideFromStandby = !!fromStandby
    playPanelSound(true)
    // 38th pass: the status row's sweep and any in-flight text resolve are
    // both timer-driven and would keep painting into rows the guide is
    // now using underneath it -- same class of bug as the scan timer this
    // method has always stopped, and as the 29th pass's drawPlayback leak.
    this._clearStatusTimers()
    this._cancelAllResolves()
    // A scan/preset-sweep timer left running would keep punching fresh
    // dial/freq redraws into rows the guide is now using underneath it, so
    // it gets stopped outright rather than just visually covered.
    this.stopScan()
    stopStaticNoise()
    this.drawGuidePage(s)
  },
  // 18th pass -- added a station reference to the guide. The
  // about/credit/contact/controls screen was already using ~18 of 25 rows,
  // and a full 9-station table needs about 10 more, so the guide became 2
  // pages rather than cramming both onto one.
  // 32nd pass -- reworked the stations page to show number, name, a longer
  // description, and 5 sample tracks instead of a 3-artist 'like' line:
  // that much detail per station doesn't fit in a shared table row, so the
  // station reference became its own page PER station rather than one
  // packed table. Page 1 is About, page 2 is a quick-scan Index (one line
  // per station, same spirit as the old table but without the "like" line
  // that no longer has anywhere to live), and pages 3 through 11 are one
  // detail page per station in STATION_PRESET_ORDER (dial/freq order, same
  // as the [1-9] presets). ArrowLeft/ArrowRight walk sequentially through
  // all of it; from the Index, a digit key jumps straight to that
  // station's detail page instead of arrowing past the ones you don't
  // care about (see key()). Any other key still closes the guide exactly
  // like before.
  guideTotalPages() { return 2 + this.bandPresets().length },
  /** Step the guide one page and redraw, clamped at both ends. Extracted
   *  2026-08-27 when touch gained guide paging (swipe L/R, ui/mobile.js):
   *  the arrow-key version had been inline in key(), and a second inline
   *  copy is exactly the fork CLAUDE.md's design-record note warns about.
   *  Returns whether it actually moved, so a caller can tell a no-op at the
   *  first or last page from a real step. */
  stepGuidePage(s, dir) {
    const target = this.guidePage + dir
    if (target < 1 || target > this.guideTotalPages()) return false
    this.guidePage = target
    this.drawGuidePage(s)
    return true
  },
  drawGuidePage(s) {
    const { term } = s
    clearGrid(term)
    if (this.guidePage === 1) this.drawGuidePageAbout(s)
    else if (this.guidePage === 2) this.drawGuidePageIndex(s)
    else this.drawGuidePageStation(s, this.guidePage - 3)
  },
  // 50th pass -- the commands at the bottom of guide pages now stand out
  // (the keys specifically), applied to the About page's CONTROLS block
  // too -- the guide's key lines were
  // flat, which made the keys you're supposed to press as quiet as the
  // words describing them. Used for both the footer nav rows (base FAINT)
  // and the About page's controls list (base DIM), so the two keep their
  // existing relative weight while both gain the key lift. Draws the line at `base`, then
  // redraws just the bracketed spans a notch up. Deliberately two passes
  // over the SAME string rather than splitting it into segments: the
  // centering math stays exactly what it was, and the labels keep their
  // hand-tuned spacing. Guide pages are non-inverse (unlike the visualizer
  // footer), so here BOLD buys both a heavier face and a brighter level --
  // FAINT is 100, BOLD lands at 205 -- which is the whole point.
  // Every bracketed span lifts, "[any other key]" included: the brackets
  // are this app's marker for "this is a control", and singling that one
  // out as an exception would read as an inconsistency, not a nuance.
  drawGuideKeyLine(s, y, text, base = FAINT, keyAttr = BOLD) {
    this.drawKeyLineAt(s, centerX(s.term.cols, text), y, text, base, keyAttr)
  },
  // 2026-08-26 -- the same two-pass bracket lift at a caller-chosen x, so the
  // About page's control table can align on fixed column stops instead of
  // centring every row on its own string. drawGuideKeyLine() is now just this
  // with the centred x, so the footers and every existing caller are
  // byte-identical.
  drawKeyLineAt(s, x0, y, text, base = FAINT, keyAttr = BOLD) {
    const { term } = s
    term.text(x0, y, text, base)
    const re = /\[[^\]]*\]/g
    let m
    while ((m = re.exec(text))) term.text(x0 + m.index, y, m[0], keyAttr)
  },
  // 2026-08-26 -- About page rebuilt. Three things were wrong with the
  // version this replaces, all of them structural rather than cosmetic:
  //
  //   1. The CONTROLS block was four rows each centred on its OWN string, so
  //      the key column wandered across them -- left edges at columns 16, 13,
  //      14 and 9, second columns at 36, 33, 34 and 24. It read as four
  //      unrelated sentences rather than a reference you scan down. It is one
  //      centred BLOCK with fixed column stops now (see drawKeyLineAt).
  //   2. The grouping the 29th-pass comment claimed ("rows 14-16 tuning/
  //      receiver, row 17 the not-a-real-radio trio") had stopped matching the
  //      rows: [P] POWER is not a tuning control, [A] LINE IN is the least
  //      real-radio thing on the page, and row 17 held four items, not three.
  //      The groups are labelled now, so the claim and the layout cannot
  //      drift apart again.
  //   3. [A] was drawn third on a DIM grid row and explained at FAINT -- the
  //      same register as the ads disclaimer and the version string. That is
  //      the quietest treatment available on this page, given to the only
  //      control that raises a browser permission prompt. It has its own
  //      fenced panel now, at NORMAL, above the caveats rather than among
  //      them.
  //
  // Row 4's prose ("Power it on, spin the dial, lock onto a station") became
  // the START HERE line: same row, but it names the keys in the order you
  // press them instead of describing them. VERSION_TAG folded into the title
  // to buy back the row the panel costs -- see the 28th-pass note on why it
  // is read from there and not hardcoded.
  // The touch vocabulary, for the narrow branch of drawGuideControls. Order
  // is the order you meet them: the two swipes that move you around the
  // band, then the press that does the one thing you want first (sound),
  // then the held and two-finger variants. Kept beside the key table it
  // stands in for so a gesture added to ui/mobile.js has an obvious place
  // to be documented -- the touch hint rows only have space for four of
  // these six, and this page is where the rest now live.
  GUIDE_TOUCH_ROWS: [
    ['SWIPE L/R', 'STATION'],
    ['SWIPE U/D', 'NEXT TRACK'],
    ['TAP', 'MUTE'],
    ['HOLD', 'POWER OFF'],
    ['2-TAP', 'COLOR'],
    ['2-HOLD', 'GUIDE'],
  ],
  GUIDE_CONTROL_GROUPS: [
    { head: 'TUNING', rows: [['[<-/->]', 'SEEK'], ['[ENTER]', 'LOCK'], ['[S]', 'SCAN'], ['[1-9]', 'PRESETS'], ['[B]', 'BAND']] },
    // [T] added 2026-08-27. 'SLEEP' is shorter than 'NEXT TRACK', so the
    // column keeps its width; the group goes to five rows, matching TUNING,
    // which pushes drawGuideControls' return down one -- still clear of the
    // About page's own rule at row 14.
    { head: 'RECEIVER', rows: [['[UP/DN]', 'VOLUME'], ['[M]', 'MUTE'], ['[N]', 'NEXT TRACK'], ['[T]', 'SLEEP'], ['[P]', 'POWER']] },
    // [F] added 2026-08-26 (issue #8). 'FULLSCREEN' is the same 10 chars as
    // 'VISUALIZER', so the column keeps its width and the block its centring.
    // [W] added 2026-08-29. 'WEATHER' is shorter than 'FULLSCREEN' so the
    // column keeps its width, and the group goes to five rows -- matching
    // TUNING and RECEIVER, so all three are now the same height.
    { head: 'DISPLAY', rows: [['[C]', 'COLOR'], ['[V]', 'VISUALIZER'], ['[F]', 'FULLSCREEN'], ['[W]', 'WEATHER'], ['[G]', 'GUIDE']] },
  ],
  // Three groups across on the 80-col grid; stacked two-across on anything
  // narrower. The narrow path is not reachable today -- mobile has no touch
  // trigger that OPENS the guide (README "Known gaps") -- but the page is
  // shared code and the old one was already broken there: every wide row
  // truncated mid-word and the row-22 footer fell off a 22-row grid entirely.
  // Degrading properly costs a branch, so it gets one rather than inheriting
  // that.
  drawGuideControls(s, y0) {
    const { term } = s
    const groups = this.GUIDE_CONTROL_GROUPS
    const widths = groups.map(g => ({
      k: Math.max(...g.rows.map(r => r[0].length)),
      l: Math.max(...g.rows.map(r => r[1].length)),
    }))
    const cell = (i) => Math.max(widths[i].k + 1 + widths[i].l, groups[i].head.length)
    const GUTTER = 7
    const across = groups.length
    const blockW = groups.reduce((n, _, i) => n + cell(i), 0) + GUTTER * (across - 1)
    if (blockW + 4 <= term.cols) {
      let x = centerX(term.cols, 'x'.repeat(blockW))
      for (let gi = 0; gi < across; gi++) {
        term.text(x, y0, groups[gi].head, BOLD)
        groups[gi].rows.forEach((r, ri) => {
          this.drawKeyLineAt(s, x, y0 + 1 + ri, r[0].padEnd(widths[gi].k + 1) + r[1], DIM)
        })
        x += cell(gi) + GUTTER
      }
      return y0 + 1 + Math.max(...groups.map(g => g.rows.length))
    }
    // 2026-08-27 -- narrow draws GESTURES, not keys. This branch used to
    // render the same bracketed key table as the wide one, which was
    // harmless while nothing could open the guide by touch and became
    // actively wrong the moment something could: a phone has no [ENTER],
    // no [<-/->] and no [P], so the one screen that exists to explain the
    // controls was explaining controls that device does not have. Exactly
    // the fault ui/mobile.js's own note records fixing in the hint rows --
    // "borrowed the DESKTOP bracket idiom, which reads as 'press this key'
    // on a device with no keys" -- reappearing one layer up.
    //
    // No group heads here either. Wide has room to label TUNING / RECEIVER
    // / DISPLAY and benefits from it at three columns across; six gesture
    // rows in one column are already scannable, and the heads would cost
    // three of the rows this grid does not have. Fixed column stop rather
    // than the bracket lift, since there are no brackets left to lift.
    let y = y0
    for (const [gesture, action] of this.GUIDE_TOUCH_ROWS) {
      term.text(2, y, gesture, BOLD)
      term.text(14, y, action, DIM)
      y++
    }
    return y
  },
  drawGuidePageAbout(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    const wide = term.cols >= 72
    // 28th pass: VERSION_TAG, not a second hardcoded string that can drift
    // out of sync with the title bar. Same reason, new home.
    put(1, `SIGNAL ${VERSION_TAG} -- GUIDE`, BOLD)
    put(3, wide
      ? 'A tuning-dial internet radio, rendered entirely as text.'
      : 'A tuning-dial radio, rendered as text.', NORMAL)
    // 2026-08-27: the narrow line speaks touch. It used to read
    // "START HERE  [P] on  [ENTER] lock" -- two keys a phone does not have,
    // for a tier that locks by swiping rather than by pressing anything.
    if (wide) {
      this.drawGuideKeyLine(s, 5, 'START HERE   [P] power on   ->   [<-/->] find a carrier   ->   [ENTER] lock', NORMAL)
    } else {
      const line = 'START HERE   TAP to power on'
      term.text(centerX(term.cols, line), 5, line, NORMAL)
      term.text(centerX(term.cols, line), 5, 'START HERE', BOLD)
    }
    const afterControls = this.drawGuideControls(s, 7)
    // Consent pass (2026-08-25) -- [A] is the ONLY way audio capture is ever
    // requested; nothing prompts at power-on any more. 2026-08-26: promoted
    // out of the control grid into its own fenced panel, using the same faint
    // rule the station detail pages draw at row 6. The copy says what it does
    // and that declining costs nothing, in that order -- the old FAINT line
    // said the same thing in the register readers skip.
    if (!wide) {
      // 22 rows total, so the panel is the last thing before the footer and
      // the credits do not fit at all. Every string on this branch is
      // measured against 42 cols -- the wide ones truncate mid-word here,
      // which is exactly what the page this replaced did on every row.
      // 2026-08-27: the [A] LINE IN panel is gone from the narrow page, not
      // reworded. Mobile never raises a capture prompt at all -- the tab
      // tier is desktop-Chromium only and the mic tier is deliberately not
      // offered here (tests/program.test.mjs: "consent pass: mobile never
      // asks for the microphone") -- so this was a phone being told about
      // a control that tier does not have and cannot get. The rows it frees
      // are what let the six gesture rows above breathe.
      const foot = 'SWIPE STATIONS   TAP CLOSE'
      term.text(centerX(term.cols, foot), term.rows - 1, foot, FAINT)
      return
    }
    put(14, '-'.repeat(64), FAINT)
    this.drawGuideKeyLine(s, 15, '[A] LINE IN -- feed live audio into the meters', NORMAL)
    put(16, 'Optional and never automatic. Decline and the meters stay synthetic.', MUTED)
    put(18, 'Made by Hyphen8d -- inspired by my own music taste, built for anyone', MUTED)
    put(19, 'who wants a weird little radio to leave on.  Live audio sync by End Dream.', MUTED)
    put(20, 'Got an idea, a station request, or found something broken? -- matt@gial.co', BRIGHT)
    // 20th pass -- addresses viewers without YouTube Premium hearing ads.
    // Decided against anything that tries to detect/suppress the ad itself
    // (that's ad-blocking circumvention against YouTube's ToS, not something
    // to build around even here) or a bigger re-sourcing effort. This is the
    // cheap, honest middle ground: just tell people up front so an ad reads
    // as expected rather than as SIGNAL being broken.
    // 2026-08-27 -- what the screen SAYS during an ad changed; what SIGNAL
    // DOES about one did not, and cannot. It does not block, skip, mute,
    // seek past or hide anything, and the advert plays in full exactly as
    // YouTube served it.
    //
    // Worth being precise, because an earlier version of this note claimed
    // the opposite: SIGNAL does NOT detect ads. It tried twice and a live
    // capture proved it impossible -- through a real preroll the player
    // reports the requested video's own id and own duration, exposing
    // nothing to detect (see the 22nd-pass note by detectBreak). What it
    // does instead is decline to name a track until the player confirms
    // that track started, which needs no knowledge of adverts at all. So
    // the suppression half of the 20th pass's call stands untouched, and
    // the detection half turned out not to be on offer either way.
    // Precise about WHICH ads on purpose: the hold only covers one that
    // delays a track starting. A midroll arrives with the track already
    // playing and is invisible to this -- claiming otherwise here would
    // be the same species of overstatement the break exists to remove.
    put(21, 'Playback is real YouTube video -- an ad before a track reads as a BREAK.', FAINT)
    this.drawGuideKeyLine(s, 22, '[->] STATIONS        [any other key] CLOSE')
  },
  // Quick-scan station index (32nd pass, replaces the old combined
  // header+like table) -- one line per station: preset number (zero-padded
  // to match the detail pages), freq, callsign, tagline. Deliberately
  // leaner than before since the "like" detail now lives on each
  // station's own full page; this is just for scanning/jumping. Ordered by
  // STATION_PRESET_ORDER (freq ascending, same order as the dial
  // left-to-right and the [1-9] preset keys), so the number shown here
  // always matches what actually tunes to that station, and matches the
  // digit-jump handled in key().
  // Column stops for the index, so the page can be asserted on rather than
  // eyeballed (see tests). Marker sits outside the block at x=2 -- an
  // on-air row must not shove its own columns out of line with the rest.
  GUIDE_INDEX_COLS: { mark: 2, preset: 4, glyph: 9, freq: 12, callsign: 19, tagline: 37 },
  // 2026-08-27 -- index rebuilt, applying what the About page's 2026-08-26
  // rebuild established. Same three faults, same fixes:
  //
  //   1. ONE attribute for five kinds of information. Every row was BRIGHT,
  //      so the preset number, the dial glyph, the frequency, the callsign
  //      and the tagline all read at identical weight -- on a page whose
  //      only job is "find the station you want and jump to it", nothing
  //      pointed at the callsign. Five stops, five weights now, with the
  //      callsign the brightest thing in the row.
  //   2. Rows joined as `CALLSIGN -- tagline`, so the tagline started at a
  //      different column on every line -- 10 columns of drift between
  //      CIPHER (6) and DISTORTION FIELD (16). That is precisely what the
  //      About rebuild removed from the controls block, reintroduced here.
  //      Fixed stops now, which is also why lint-roster's tagline rule went
  //      flat: a per-callsign budget only makes sense for a joined line.
  //   3. Double-spaced across rows 3-19 to fill the page, which on a
  //      scan-and-jump table doubles the eye travel and breaks the column
  //      relationship between neighbouring rows. Single-spaced, which also
  //      buys the header row and rule that tell you what the columns ARE --
  //      `[01] G 133.7` asked you to infer all four.
  //
  // The on-air marker is the point of the whole page, though: the guide had
  // no idea what the set was doing, so the index was a table rather than a
  // place you could see yourself in. Gated on poweredOn as well as the lock
  // -- opened from STANDBY (see openGuide's fromStandby) the set is off and
  // nothing is on air, so claiming a station would be a lie.
  drawGuidePageIndex(s) {
    const { term } = s
    const C = this.GUIDE_INDEX_COLS
    term.text(centerX(term.cols, 'SIGNAL -- STATIONS'), 1, 'SIGNAL -- STATIONS', BOLD)
    const wide = term.cols >= 72
    const onAir = (ch) => this.poweredOn && this.lockedStation === ch
    if (!wide) {
      // Narrow: no room for the tagline column, so the row stops at the
      // callsign rather than truncating prose mid-word. Footer at rows-1,
      // not a hardcoded 22 -- the lite grid is 22 ROWS, so the old literal
      // put it off-grid entirely (the same fault the About page's narrow
      // branch was written to avoid).
      this.bandPresets().forEach((ch, i) => {
        const y = 3 + i
        if (onAir(ch)) term.text(C.mark, y, '>', BOLD)
        term.text(C.preset, y, `[${String(i + 1).padStart(2, '0')}]`, DIM)
        term.text(C.glyph, y, ch.glyph || ' ', NORMAL)
        term.text(11, y, ch.freq.toFixed(1), MUTED)
        term.text(17, y, truncate(ch.callsign, term.cols - 18), BRIGHT)
      })
      // Touch footer: no arrows to press and no digits to jump with, so it
      // names the gesture that actually pages this overlay (2026-08-27).
      const foot = 'SWIPE PAGES   TAP CLOSE'
      term.text(centerX(term.cols, foot), term.rows - 1, foot, FAINT)
      return
    }
    term.text(C.preset, 3, 'PRESET', BOLD)
    term.text(C.freq, 3, 'DIAL', BOLD)
    term.text(C.callsign, 3, 'STATION', BOLD)
    term.text(C.tagline, 3, 'LANE', BOLD)
    term.text(4, 4, '-'.repeat(Math.min(72, term.cols - 8)), FAINT)
    this.bandPresets().forEach((ch, i) => {
      const y = 5 + i
      // 41st pass, preserved: the dial marker rides the row, so the index
      // doubles as the legend for the band -- you can read off which shape
      // to hunt for out on the dial.
      if (onAir(ch)) term.text(C.mark, y, '>', BOLD)
      term.text(C.preset, y, `[${String(i + 1).padStart(2, '0')}]`, DIM)
      term.text(C.glyph, y, ch.glyph || ' ', NORMAL)
      term.text(C.freq, y, ch.freq.toFixed(1), MUTED)
      term.text(C.callsign, y, ch.callsign, BRIGHT)
      term.text(C.tagline, y, truncate(ch.tagline, term.cols - C.tagline), MUTED)
    })
    // Single-spacing bought eight rows back, and handing them straight to
    // whitespace would just trade one kind of unfinished for another. A
    // closing rule brackets the table against the one at row 4, and the two
    // lines under it are the questions the page otherwise leaves hanging:
    // what the marker means (a bare '>' explains nothing), and how much is
    // actually behind these nine names -- the same "evidence of depth" the
    // detail pages' (6 OF n) counter provides, at roster scale.
    const rowY = 5 + this.bandPresets().length + 1
    term.text(4, rowY, '-'.repeat(Math.min(72, term.cols - 8)), FAINT)
    const trackTotal = this.bandPresets().reduce((n, ch) => n + ch.tracks.length, 0)
    term.text(4, rowY + 1, `${this.bandPresets().length} STATIONS`, BOLD)
    term.text(18, rowY + 1, `${trackTotal} TRACKS IN ROTATION`, MUTED)
    // Deliberately NOT drawKeyLineAt: brackets are this app's marker for
    // "a control you can press" (see drawGuideKeyLine's note), and the
    // on-air marker is a status glyph, not a key. Bracketing it would teach
    // the wrong thing about every other bracket on the page.
    if (this.bandPresets().some(onAir)) {
      term.text(C.mark, rowY + 2, '>', BOLD)
      term.text(C.preset, rowY + 2, 'the station you are tuned to right now', FAINT)
    }
    this.drawGuideKeyLine(s, 22, '[<-] ABOUT   [1-9] JUMP   [->] NEXT   [any other key] CLOSE')
  },
  // Per-station detail page (32nd pass) -- shows the
  // station number, name, a longer description, and 5 sample tracks
  // instead of a 3-artist 'like' line. One full page per station rather
  // than a shared table row, so there's actually room for prose and a real
  // tracklist sample. `desc` is free-form (see each station's definition
  // above) and gets word-wrapped rather than truncate()'d, since cutting a
  // sentence off mid-word with "..." would read badly here in a way it
  // doesn't for a single status line. Sample tracks are the first 6
  // entries in the station's own `tracks` array with no repeated artist
  // (see sampleTracks()) -- deliberately not a separately hand-curated
  // "highlights" list, so this can never drift from what's actually in
  // rotation the way the old `like` field could.
  drawGuidePageStation(s, i) {
    const { term } = s
    const ch = this.bandPresets()[i]
    const presetNum = String(i + 1).padStart(2, '0')
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, `SIGNAL -- STATIONS   [${presetNum}/${String(this.bandPresets().length).padStart(2, '0')}]`, BOLD)
    const contentWidth = term.cols - 8
    // 41st pass: flanks the callsign the same way the STATION box does once
    // you are locked on. Deliberately NOT also led by the glyph the way the
    // index page's rows are -- the index needs it out front because it is a
    // legend you scan down a column of; here it would just print the same
    // mark three times on one line.
    const mark = ch.glyph || '●'
    // 2026-08-27, second pass -- the header was three stacked left-aligned
    // lines (callsign / tagline / freqNote) and the lower two bled into each
    // other. Lifting freqNote FAINT -> MUTED earlier in this same pass is
    // what did it: the tagline was already MUTED, so two lines of similar
    // prose sat at identical weight, one under the other, with nothing to
    // say which was the station's own description and which was the aside.
    //
    // Fixed by removing the stack rather than re-splitting the weights --
    // the tagline joins the callsign on one line, which is what it is: the
    // station's subtitle, not a paragraph. That leaves freqNote as the only
    // line beneath, so it has nothing left to be confused with and can keep
    // the readable MUTED.
    //
    // Joined rather than column-aligned, deliberately, and the opposite call
    // to the index page in this same commit: alignment matters there because
    // you scan DOWN nine rows and the eye needs a fixed stop. Here there is
    // exactly one station on the page, so a column stop would only push the
    // tagline needlessly far from the name it belongs to.
    //
    // The lite grid does NOT get this. 42 columns cannot hold the name and a
    // tagline on one row: joining them there cut taglines to stubs like "a"
    // and "tok" -- short enough that truncate() had no room to even mark the
    // cut. So narrow keeps the stacked form, and keeps the ORIGINAL weight
    // split with it (tagline MUTED, freqNote FAINT), which is what kept
    // those two rows apart before this pass touched them. Degrading the
    // narrow path correctly, rather than forcing the wide layout through it.
    const wide = term.cols >= 72
    const head = `[${presetNum}] `
    const dial = ch.freq.toFixed(1)
    const name = `${mark} ${ch.callsign} ${mark}`
    term.text(4, 3, head, DIM)
    term.text(4 + head.length, 3, dial, MUTED)
    const nameX = 4 + head.length + dial.length + 3
    term.text(nameX, 3, truncate(name, term.cols - 4 - nameX), BRIGHT)
    if (!wide) term.text(4, 4, truncate(ch.tagline, contentWidth), MUTED)
    // Truncated against what is actually left on the row. Nothing truncates
    // today (the widest pairing lands at column 74 of 80), but lint's tagline
    // budget is now a flat 43 measured against the INDEX page's LANE column,
    // so a long callsign here no longer constrains it -- a 16-char callsign
    // with a 43-char tagline would want 83 columns. It degrades with an
    // ellipsis instead of running off the grid.
    if (wide) {
      const tagX = nameX + name.length + 3
      term.text(tagX, 3, truncate(ch.tagline, term.cols - 4 - tagX), MUTED)
    }
    // 49th pass -- notes what each station's gag frequency is an
    // homage to, kept off the main STATION box/index -- a Guide-
    // only aside for anyone curious enough to dig in. Optional field --
    // stations with no gag (or none found yet) just render nothing here.
    // Row 5, right under the tagline (the "short description") -- was
    // under the full desc block, then the page footer, before landing
    // here after later follow-up passes. Bare text only, no "freq --" prefix:
    // the freq is already shown in the header line above. Row 5 sits
    // between the tagline and the rule with nothing else using it, so no
    // reflow needed either time this moved.
    // 2026-08-27: lifted FAINT -> MUTED. Position is deliberately NOT
    // touched -- the comment above records this line having moved twice
    // before settling here, and it belongs next to the frequency it
    // explains. But FAINT is the register of the ads disclaimer and the
    // version string, and this is the reward for anyone curious enough to
    // page in this far; it was the most charming line on the page in the
    // least visible weight. One notch, no reflow.
    // MUTED on the wide grid, where the tagline has moved up onto the header
    // row and this is the only line left beneath it -- nothing to be confused
    // with, so it can be readable. FAINT on the lite grid, where the tagline
    // is still stacked directly above it and the weight split is the only
    // thing keeping the two apart.
    if (ch.freqNote) term.text(4, 5, truncate(ch.freqNote, contentWidth), wide ? MUTED : FAINT)
    term.text(4, 6, '-'.repeat(Math.min(72, contentWidth)), FAINT)
    // slice(0, 3) drops overflow SILENTLY -- no ellipsis, unlike truncate()
    // right above it. All nine descs are 2-3 lines today so nothing is lost,
    // but a longer one would vanish without a mark, so the cut is marked.
    const descLines = wordWrap(ch.desc, contentWidth)
    descLines.slice(0, 3).forEach((line, li) => {
      const last = li === 2 && descLines.length > 3
      term.text(4, 8 + li, last ? truncate(line + ' ...', contentWidth) : line, NORMAL)
    })
    // 2026-08-27: says what it is a sample OF. Six tracks with no
    // denominator reads as the station's whole tracklist -- naming the
    // total is one string and turns the page into evidence of depth.
    const total = ch.tracks.length
    term.text(4, 12, 'SAMPLE TRACKS', BOLD)
    term.text(18, 12, `(${Math.min(6, total)} OF ${total})`, FAINT)
    // Title and artist are different questions ("do I know this?" vs "who
    // is this?"), so they stop sharing one weight -- the titles are what
    // you scan down.
    sampleTracks(ch.tracks, 6).forEach((t, ti) => {
      const y = 14 + ti
      const title = truncate(t.title, term.cols - 12 - 3)
      term.text(8, y, title, NORMAL)
      const artistX = 8 + title.length
      const room = term.cols - 4 - artistX
      if (room > 4) term.text(artistX, y, truncate(` -- ${t.artist}`, room), MUTED)
    })
    // Rows 20-21 were dead on all nine pages. They earn their place only
    // when this IS the station playing -- otherwise the page stays airy
    // rather than padded. Same poweredOn gate as the index marker: from
    // STANDBY nothing is on air.
    if (this.poweredOn && this.lockedStation === ch && this.currentTrack) {
      term.text(4, 20, 'ON AIR NOW', BOLD)
      const t = this.currentTrack
      term.text(16, 20, truncate(`${t.title} -- ${t.artist}`, term.cols - 20), BRIGHT)
    }
    // term.rows - 1, not a hardcoded 22: the lite grid is 22 ROWS (0-21), so
    // the literal put this footer off-grid and the detail pages rendered with
    // no nav line at all down there. Same fault the About page's narrow
    // branch already avoided and the index page just had fixed -- this was
    // the last copy of it.
    if (wide) {
      this.drawGuideKeyLine(s, term.rows - 1, '[<-] PREV        [->] NEXT        [any other key] CLOSE')
    } else {
      const foot = 'SWIPE PAGES   TAP CLOSE'
      term.text(centerX(term.cols, foot), term.rows - 1, foot, FAINT)
    }
  },
  closeGuide(s) {
    this.guideOpen = false
    playPanelSound(false)
    // BUG FIXED (15th pass): the guide screen writes into a couple of rows
    // (the "SIGNAL -- GUIDE" header at row 1, in particular) that nothing
    // below ever redraws -- drawChrome only touches row 0, the box frames
    // start at row 3. Without an explicit clear first, that header was
    // left behind permanently after closing, printed right over the
    // status line. Same clearAll() the power sequences already use.
    const { term } = s
    clearGrid(term)
    // 67th pass -- the guide key from STANDBY (see openGuide/key(); rebound
    // [I] -> [G] the 69th pass) means the set is still off underneath; land
    // back on STANDBY rather than rebuilding powered-on chrome that was
    // never actually there.
    if (this._guideFromStandby) {
      this._guideFromStandby = false
      this.drawStandbyScreen(s)
      return
    }
    // Rebuild -- chrome, frames, meters, then resume whatever the actual
    // mode/status was before the guide opened (guide never touched
    // freq/lockedStation/playState, only covered them visually).
    this.redrawMainScreen(s)
    this.redrawLockState(s)
  },
}
