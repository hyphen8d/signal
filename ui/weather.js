// SIGNAL -- the weather card and the row-0 readout. Mixed into the program
// object. The data half is weather.js; this file is only what gets drawn.
//
// 2026-08-29. Two pieces, and the split between them is the design:
//
//   - a nine-column readout on row 0, opposite the sleep timer across the
//     brand plate, showing right now. Blank until someone has said yes.
//   - a card on [W] with the day in three parts, the way a station reads it.
//
// WHY THIS IS A CARD AND NOT A FULL-SCREEN TAKEOVER, unlike the guide and
// the LINE INPUT card: weather is an aside, not a destination. A radio does
// not stop being a radio while it tells you the forecast, and a takeover
// says the opposite -- it says you have left the set and gone somewhere
// else. So the tuner above and the meters below stay lit and keep moving
// underneath it. That is a deliberate departure from every other overlay
// here and it costs something real, which the next comment is about.
//
// THE COST: every other overlay clears the grid and holds a "nothing else
// may paint" contract, so nothing underneath can draw through it. A card
// that leaves the chrome visible cannot rely on that -- the track title and
// the playback row sit exactly where the card does, and their timer-driven
// painters would happily write straight through it. So `weatherOpen` joins
// guideOpen/tapConsentOpen in every paint guard rather than getting a
// cheaper one of its own. The rows it covers are STATION_Y through
// NOWPLAYING_BOT_Y; anything that paints there must check.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playPanelSound } = await import(`../audio/sfx.js?v=${V}`)
const { centerXRange, drawBoxTop, drawBoxBottom, drawBoxSide } = await import(`../layout.js?v=${V}`)
const { saveSignalState } = await import(`../state.js?v=${V}`)
const WX = await import(`../weather.js?v=${V}`)

// Row 0. The brand plate ends at 51 and the clock starts at 65, which is
// thirteen columns -- the mirror of the sleep timer's stretch on the other
// side of the plate.
//
// RIGHT-ALIGNED to end at 63, not left-aligned from 52, and that is a fix
// rather than a preference: the first version started at 52 and rendered as
// "SIGNAL RECEIVER69F CLEAR", flush against the plate with no gap at all.
// Ending at 63 leaves column 64 clear before the clock and lets the reading
// grow leftwards into space nothing else uses, so a clear column survives at
// both ends for every reading the short labels can produce.
export const WX_RIGHT = 63
export const WX_MIN_X = 53

// The card. Rows 8-16 cover the STATION and NOW PLAYING boxes and stop
// short of the meters, so the dial above and the levels below stay visible
// and moving -- which is the entire point of it being a card.
const CARD_Y0 = 8
const CARD_Y1 = 16
const CARD_X0 = 14
const CARD_X1 = 65

export default {

  /** [W] is live whenever the set is on and this is not mobile. Unlike
   *  [A], there is nothing to feature-detect up front: a browser without
   *  geolocation still gets the card, and finds out there on the [Y] that
   *  the answer is no. isMappedKey() needs this to decide whether the key
   *  clicks. */
  canOpenWeather() {
    // Same structural reason the LINE INPUT card gives: this is drawn for
    // the 80x25 grid and would clamp to nonsense in mobile-lite's 42x22,
    // and mobile has no keyboard to press [W] with anyway.
    return !this.mobile && this.poweredOn && !this.weatherOpen
  },

  openWeather(s) {
    if (!this.canOpenWeather()) return false
    this.weatherOpen = true
    playPanelSound(true)
    // The guide's hygiene, for the same reason: timer-driven painters
    // pointed at the rows this card covers have to be stopped rather than
    // merely covered. The card leaves the OTHER rows alone on purpose, so
    // this is narrower than openGuide's -- the scan sweep and the status
    // line are both outside the card and keep running.
    this._cancelAllResolves()
    this.drawWeatherCard(s)
    // Fetching is deliberately AFTER the first paint: the card appears on
    // the keypress, then fills in. A card that waits for the network before
    // showing anything reads as a dropped keypress.
    if (this.weatherConsent === 'yes') this.refreshWeather(s)
    return true
  },

  closeWeather(s) {
    if (!this.weatherOpen) return
    this.weatherOpen = false
    playPanelSound(false)
    // Only the covered rows are repainted -- the rest of the screen was
    // never touched, and a full redrawMainScreen() here would blink the
    // whole set for an overlay that only ever owned nine rows.
    this.redrawWeatherRegion(s)
  },

  /** Put back exactly what the card was sitting on. */
  redrawWeatherRegion(s) {
    const { term } = s
    for (let y = CARD_Y0; y <= CARD_Y1; y++) {
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    }
    this.drawChrome(s)
    this.redrawLockState(s)
    this.drawVolume(s)
    this.drawSignal(s)
    this.drawVU(s)
  },

  /** [Y] on the consent card. The geolocation call runs inside the keypress
   *  that got here, same ordering rule the LINE INPUT card documents for
   *  getDisplayMedia -- a permission dialog wants a real user gesture
   *  behind it, and a keydown is one. */
  acceptWeather(s) {
    this.weatherConsent = 'yes'
    saveSignalState(this)
    this.drawWeatherCard(s)   // repaint as LOCATING... before we block on the prompt
    this.refreshWeather(s)
  },

  /** [N] / [Escape]. Says no and remembers it, and the card stays reachable
   *  on [W] -- "not now" should be a decision, not a door closing. */
  declineWeather(s) {
    this.weatherConsent = 'no'
    saveSignalState(this)
    this.closeWeather(s)
  },

  /** Ask the browser where we are (once), then Open-Meteo (when stale).
   *  Every failure path lands in the same place: `this._wx` stays null and
   *  the card says so. There is no error state worth drawing on a radio. */
  async refreshWeather(s) {
    if (this._wxBusy) return
    this._wxBusy = true
    try {
      // An insecure origin is NOT a refusal, and must not be recorded as
      // one -- see canLocate()'s note. Bail before asking, so the card can
      // say what is actually wrong and the answer is not remembered.
      if (!WX.canLocate()) { this._wxInsecure = true; return }
      this._wxInsecure = false
      if (!this._wxLoc) this._wxLoc = await WX.requestLocation()
      if (!this._wxLoc) {
        // A real refusal, or a prompt that was dismissed. Recorded so the
        // row-0 readout does not sit blank while the program thinks it has
        // consent, and so the card is not re-asked on every [W].
        this.weatherConsent = 'no'
        saveSignalState(this)
      } else if (WX.isStale(this._wx)) {
        const units = WX.unitsForLocale(globalThis.navigator?.language)
        this._wx = await WX.fetchWeather(this._wxLoc.lat, this._wxLoc.lon, units)
      }
    } finally {
      this._wxBusy = false
    }
    if (this.weatherOpen) this.drawWeatherCard(s)
    this.drawWeatherReadout(s)
  },

  /** Ridden off the clock's own 1s interval rather than given a timer of its
   *  own -- see program.js's note on what deliberately stays on real timers.
   *
   *  This closes a real gap rather than tuning one. Until now refreshWeather()
   *  was reached ONLY from [W] and the consent [Y], so the row-0 readout
   *  showed whatever was fetched the last time somebody opened the card and
   *  then held that reading indefinitely. isStale() and WX_MAX_AGE_MS both
   *  existed and nothing consulted them for the header. A permanently stale
   *  temperature in the title bar is worse than no temperature: it is wrong
   *  and it looks live.
   *
   *  The staleness check is a timestamp compare, so running it every second
   *  costs nothing; the fetch behind it fires at most once every fifteen
   *  minutes, and only while powered on with consent already given. It never
   *  raises a prompt -- requestLocation() is not reached from here, because
   *  `_wxLoc` is already set by the time consent is 'yes'. */
  tickWeather(s) {
    if (this.mobile || !this.poweredOn) return
    if (this.weatherConsent !== 'yes' || !this._wxLoc) return
    if (!WX.isStale(this._wx)) return
    this.refreshWeather(s)
  },

  /** Row 0. Nine columns of "69F CLEAR", blank whenever there is nothing
   *  true to say -- before consent, after a refusal, while the first fetch
   *  is in flight, and on every mobile grid. Same rule the sleep timer
   *  follows: an OFF indicator for a control most visitors never press is
   *  clutter on the busiest row on the screen. */
  drawWeatherReadout(s) {
    if (this.mobile) return
    const { term } = s
    const blank = () => { for (let x = WX_MIN_X - 1; x <= WX_RIGHT + 1; x++) term.put(x, 0, ' ', NORMAL, 1) }
    blank()
    if (!this.poweredOn || this.weatherConsent !== 'yes' || !this._wx) return
    const txt = `${this._wx.current.temp}${WX.unitSuffix(this._wx.units)} ${WX.wmoShort(this._wx.current.code)}`
    const x0 = Math.max(WX_MIN_X, WX_RIGHT - txt.length + 1)
    for (let i = 0; i < txt.length && x0 + i <= WX_RIGHT; i++) term.put(x0 + i, 0, txt[i], DIM, 1)
  },

  drawWeatherCard(s) {
    const { term } = s
    // Clear the card's own rows only. Everything outside CARD_Y0..CARD_Y1
    // is still the live screen and must not be touched.
    for (let y = CARD_Y0; y <= CARD_Y1; y++) {
      for (let x = CARD_X0; x <= CARD_X1; x++) term.put(x, y, ' ')
    }
    drawBoxTop(term, CARD_Y0, CARD_X0, CARD_X1, 'WEATHER', DIM)
    for (let y = CARD_Y0 + 1; y < CARD_Y1; y++) drawBoxSide(term, y, CARD_X0, CARD_X1, DIM)
    drawBoxBottom(term, CARD_Y1, CARD_X0, CARD_X1, DIM)
    const put = (y, text, attr) => term.text(centerXRange(CARD_X0 + 1, CARD_X1 - 1, text), y, text, attr)
    const left = (y, text, attr) => term.text(CARD_X0 + 4, y, text, attr)

    if (this.weatherConsent !== 'yes') {
      WX.CONSENT_COPY.forEach((line, i) => put(10 + i, line, i === 0 ? NORMAL : MUTED))
      this.drawGuideKeyLine(s, 14, '[Y] ALLOW          [N] NOT NOW', DIM)
      return
    }
    if (!this._wx) {
      if (this._wxInsecure) {
        // Named plainly rather than shown as a generic failure: this one is
        // fixed by changing the URL, and nothing else on the card says so.
        WX.INSECURE_COPY.forEach((line, i) => put(11 + i, line, i === 0 ? NORMAL : MUTED))
      } else {
        put(12, this._wxBusy ? 'LOCATING...' : 'NO READING', FAINT)
      }
      this.drawGuideKeyLine(s, 15, '[W] CLOSE', DIM)
      return
    }
    const suffix = WX.unitSuffix(this._wx.units)
    const IN0 = CARD_X0 + 1, IN1 = CARD_X1 - 1
    // The part of the day it is RIGHT NOW is drawn BRIGHT and the others
    // NORMAL. A three-line forecast with nothing marked makes you work out
    // which line applies to you, which is the one thing a glance at this
    // should not require. Hour comes from the FORECAST's timezone, not the
    // viewer's -- same reasoning as bucketHours(), and it only diverges when
    // the location is wrong anyway.
    const hourNow = this._wx.timezone
      ? Number(new Date().toLocaleString('en-GB', { timeZone: this._wx.timezone, hour: '2-digit', hour12: false }).slice(0, 2))
      : new Date().getHours()
    // Build the three lines first, then centre the BLOCK rather than each
    // line -- centring them individually would ragged the columns and the
    // whole point of the padding is that the temperatures line up. Earlier
    // this sat at a fixed offset from the left edge, which left roughly half
    // the card empty on the right and read as unfinished.
    const rows = this._wx.parts.map((part) => {
      const spec = WX.DAY_PARTS.find((d) => d.name === part.name)
      const temp = part.temp === null ? '--' : `${part.temp}${suffix}`
      const label = part.code === null ? '--' : WX.wmoLabel(part.code)
      // Precipitation chance earns its column by keeping the condition
      // honest: the label is the window's WORST code, so a single drizzle
      // hour makes a whole afternoon read DRIZZLE. Seen live at 8% on the
      // first run with this field. "DRIZZLE 8%" is true; "DRIZZLE" alone
      // was misleading. Blank rather than 0% when the field is missing --
      // no data and definitely-dry must not draw the same.
      const pop = part.pop === null || part.pop === undefined ? '' : `${part.pop}%`
      return {
        text: part.name.padEnd(11) + temp.padStart(5) + '   ' + label.padEnd(8) + pop.padStart(4),
        isNow: !!spec && hourNow >= spec.from && hourNow <= spec.to,
      }
    })
    const blockW = Math.max(...rows.map((r) => r.text.length))
    const blockX = IN0 + Math.max(0, Math.floor(((IN1 - IN0 + 1) - blockW) / 2))
    rows.forEach((r, i) => term.text(blockX, 10 + i, r.text, r.isNow ? BRIGHT : NORMAL))

    // Sun times, pushed out to the two ends of the interior. They are the
    // most radio thing the same request returns, and putting them at the
    // edges is what makes the card's width look chosen rather than left
    // over. Drawn only when both parsed -- one lonely time reads as a fault.
    const { rise, set } = this._wx.sun || {}
    if (rise && set) {
      // Spread to the INTERIOR's edges rather than the block's -- the block
      // is ~26 columns and pinning these to it just repacked them in the
      // middle, leaving the same empty margins the centring was meant to
      // fix. At the edges they frame the block and the card's width finally
      // has a reason to be what it is.
      const l = `SUNRISE ${rise}`, r = `SUNSET ${set}`
      term.text(IN0 + 3, 13, l, MUTED)
      term.text(IN1 - 2 - r.length, 13, r, MUTED)
    }
    this.drawGuideKeyLine(s, 15, '[W] CLOSE', DIM)
  },
}
