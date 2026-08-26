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
const { STATIONS, STATION_PRESET_ORDER } = await import(`../stations.js?v=${V}`)

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
  guideTotalPages() { return 2 + STATION_PRESET_ORDER.length },
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
  GUIDE_CONTROL_GROUPS: [
    { head: 'TUNING', rows: [['[<-/->]', 'SEEK'], ['[ENTER]', 'LOCK'], ['[S]', 'SCAN'], ['[1-9]', 'PRESETS'], ['[B]', 'BACK']] },
    { head: 'RECEIVER', rows: [['[UP/DN]', 'VOLUME'], ['[M]', 'MUTE'], ['[N]', 'NEXT TRACK'], ['[P]', 'POWER']] },
    { head: 'DISPLAY', rows: [['[C]', 'COLOR'], ['[V]', 'VISUALIZER'], ['[G]', 'GUIDE']] },
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
    // Narrow: one group per block, keys packed two to a row.
    let y = y0
    for (let gi = 0; gi < groups.length; gi++) {
      term.text(2, y++, groups[gi].head, BOLD)
      const pairs = groups[gi].rows
      for (let i = 0; i < pairs.length; i += 2) {
        const a = `${pairs[i][0]} ${pairs[i][1]}`.padEnd(19)
        const b = pairs[i + 1] ? `${pairs[i + 1][0]} ${pairs[i + 1][1]}` : ''
        this.drawKeyLineAt(s, 2, y++, (a + b).trimEnd(), DIM)
      }
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
    this.drawGuideKeyLine(s, 5, wide
      ? 'START HERE   [P] power on   ->   [<-/->] find a carrier   ->   [ENTER] lock'
      : 'START HERE  [P] on  [ENTER] lock', NORMAL)
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
      this.drawGuideKeyLine(s, afterControls + 1, '[A] LINE IN -- live audio to meters', NORMAL)
      put(afterControls + 2, 'Optional. Meters stay synthetic if not.', MUTED)
      this.drawGuideKeyLine(s, term.rows - 1, '[->] STATIONS   [any key] CLOSE')
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
    put(21, 'Playback is real YouTube video -- ads may play without Premium.', FAINT)
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
  drawGuidePageIndex(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- STATIONS', BOLD)
    const startY = 3
    STATION_PRESET_ORDER.forEach((ch, i) => {
      const presetNum = String(i + 1).padStart(2, '0')
      const y = startY + i * 2
      // 41st pass: the dial marker leads the line, so the index doubles as
      // the legend for the band -- you can read off which shape to hunt for.
      const line = truncate(`[${presetNum}] ${ch.glyph || ' '}  ${ch.freq.toFixed(1)}   ${ch.callsign} -- ${ch.tagline}`, term.cols - 8)
      term.text(4, y, line, BRIGHT)
    })
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
    const ch = STATION_PRESET_ORDER[i]
    const presetNum = String(i + 1).padStart(2, '0')
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, `SIGNAL -- STATIONS   [${presetNum}/${String(STATION_PRESET_ORDER.length).padStart(2, '0')}]`, BOLD)
    const contentWidth = term.cols - 8
    // 41st pass: flanks the callsign the same way the STATION box does once
    // you are locked on. Deliberately NOT also led by the glyph the way the
    // index page's rows are -- the index needs it out front because it is a
    // legend you scan down a column of; here it would just print the same
    // mark three times on one line.
    const mark = ch.glyph || '●'
    term.text(4, 3, `[${presetNum}] ${ch.freq.toFixed(1)}   ${mark} ${ch.callsign} ${mark}`, BRIGHT)
    term.text(4, 4, truncate(ch.tagline, contentWidth), MUTED)
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
    if (ch.freqNote) term.text(4, 5, truncate(ch.freqNote, contentWidth), FAINT)
    term.text(4, 6, '-'.repeat(Math.min(72, contentWidth)), FAINT)
    wordWrap(ch.desc, contentWidth).slice(0, 3).forEach((line, li) => term.text(4, 8 + li, line, NORMAL))
    term.text(4, 12, 'SAMPLE TRACKS', BOLD)
    sampleTracks(ch.tracks, 6).forEach((t, ti) => {
      const line = truncate(`${t.title} -- ${t.artist}`, term.cols - 12)
      term.text(8, 14 + ti, line, MUTED)
    })
    this.drawGuideKeyLine(s, 22, '[<-] PREV        [->] NEXT        [any other key] CLOSE')
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
