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
    const { term } = s
    const x0 = centerX(term.cols, text)
    term.text(x0, y, text, base)
    const re = /\[[^\]]*\]/g
    let m
    while ((m = re.exec(text))) term.text(x0 + m.index, y, m[0], keyAttr)
  },
  drawGuidePageAbout(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- GUIDE', BOLD)
    put(3, 'A tuning-dial internet radio, rendered entirely as text.', NORMAL)
    put(4, 'Power it on, spin the dial, lock onto a station, and let it play.', NORMAL)
    put(6, 'Made by Hyphen8d -- inspired by my own music taste,', MUTED)
    put(7, 'built for anyone who wants a weird little radio to leave on.', MUTED)
    // 2026-08-23 (live audio tap) -- credit for the visualizer audio-sync
    // work, same MUTED register as the "Made by" lines above.
    put(8, 'Live audio sync by End Dream.', MUTED)
    put(9, 'Got an idea, a station request, or found something broken?', NORMAL)
    put(10, 'Reach out -- matt@gial.co', BRIGHT)
    put(12, 'CONTROLS', BOLD)
    // 29th pass: reflowed after PLAY/PAUSE was removed (see key()) --
    // rows 14-16 are tuning/receiver controls, row 17 is the "not a real
    // radio" trio (skip, guide, display mode), matching the same grouping
    // now used in the on-screen hint bar (drawHint()).
    this.drawGuideKeyLine(s, 14, '[<-/->] SEEK        [ENTER] LOCK        [S] SCAN', DIM)
    this.drawGuideKeyLine(s, 15, '[1-9] PRESETS       [B] BACK            [UP/DOWN] VOL', DIM)
    this.drawGuideKeyLine(s, 16, '[M] MUTE            [P] POWER', DIM)
    // 49th pass: the Guide's own controls reference was missing [V] VIZ --
    // the on-screen hint bar (drawHint()) picked it up back in the
    // 43rd/44th pass but this page never did. Caught in the 0.9 QA pass.
    this.drawGuideKeyLine(s, 17, '[N] NEXT       [G] GUIDE       [C] COLOR       [V] VISUALIZER', DIM)
    // 2026-08-23 (live audio tap) -- same honest-caveat register as the
    // ads line below: the power-on share/mic prompt is unexpected enough
    // to deserve one plain sentence saying what it's for and that saying
    // no costs nothing (the meters just stay synthetic).
    put(18, 'The audio-share prompt at power-on feeds the live meters -- optional', FAINT)
    // 20th pass -- addresses viewers without YouTube Premium hearing ads.
    // Decided against anything that tries to
    // detect/suppress the ad itself (that's ad-blocking circumvention
    // against YouTube's ToS, not something to build around even here) or a
    // bigger re-sourcing effort. This is the cheap, honest middle ground:
    // just tell people up front so an ad reads as expected rather than as
    // SIGNAL being broken.
    put(19, "Playback is real YouTube video -- ads may play without Premium", FAINT)
    // 28th pass: was hardcoded 'SIGNAL v0.5' -- a second, separate version
    // string that had drifted out of sync with the title bar (which was
    // last bumped at some earlier pass without this one following). Now
    // driven off the same VERSION_TAG the title bar uses, so the two can't
    // drift apart again.
    put(20, `SIGNAL ${VERSION_TAG}`, FAINT)
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
