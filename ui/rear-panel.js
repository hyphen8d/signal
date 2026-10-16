// SIGNAL -- the REAR PANEL card on [R]. Mixed into the program object. The
// data half -- the rows, their positions, the defaults, the reduced-motion
// rule -- is settings.js; this file draws the card and applies a setting to
// the four places it reaches.
//
// 2026-10-15. Framed as the back of the set rather than a settings screen;
// settings.js's header has the reasoning. Mechanically it is the weather
// card's sibling and borrows its whole contract: the same footprint (rows
// 8-16, imported, not restated), drawn over the set rather than clearing
// it, so the dial above and the meters below keep moving -- and, at the
// same cost, `panelOpen` has to be in every paint guard `weatherOpen` is
// in. overlayUp() in ui/desktop.js is the one predicate for that now.
//
// A change applies the moment it is made, with nothing to confirm. These
// are pots and switches: you turn one and hear or see the difference while
// your hand is still on it, which is the whole way you set one. An "apply"
// step would make each setting a guess you only get to check afterwards.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playPanelSound, playSeekStatic, setHumTrim, setStaticTrim } = await import(`../audio/sfx.js?v=${V}`)
const { stopLiveVoice } = await import(`../audio/voice.js?v=${V}`)
const { setCalmScreen, setCrtCharacter, setCrtDegradation } = await import(`../crt-hooks.js?v=${V}`)
const { centerXRange, drawBoxTop, drawBoxBottom, drawBoxSide } = await import(`../layout.js?v=${V}`)
const { LEVEL_TRIM, OPTION_LABELS, PANEL_ROWS, ROW_NOTES, stepOption } = await import(`../settings.js?v=${V}`)
const { saveSignalState } = await import(`../state.js?v=${V}`)
const { nearestSignal } = await import(`../tuning.js?v=${V}`)
const { CARD_X0, CARD_X1, CARD_Y0, CARD_Y1 } = await import(`./weather.js?v=${V}`)
const { announce, forget } = await import(`../a11y.js?v=${V}`)

/** "Hum: low." Spoken, for the live region (a11y.js). The card is drawn on
 *  a canvas, so without this a screen-reader user could open it, change
 *  four settings and hear nothing at all -- the settings most likely to
 *  matter to them (VOICE, SCREEN) included. */
const spokenRow = (row, value) => `${row.label.toLowerCase()}: ${OPTION_LABELS[value].toLowerCase()}`

// The four setting rows start here; the note and the key line sit below.
export const PANEL_ROW_Y = 10
export const PANEL_NOTE_Y = 14
export const PANEL_KEYS_Y = 15
export const PANEL_KEY_LINE = '[UP/DN] SELECT    [<-/->] SET    [R] CLOSE'

export default {

  /** Same gate as canOpenWeather(), for the same reasons: the card is drawn
   *  for the 80x25 grid, and mobile has no keyboard to drive it with. The
   *  SETTINGS still apply on mobile -- a CALM screen restored from a
   *  reduced-motion default works on any layout -- only the card does not. */
  canOpenPanel() {
    return !this.mobile && this.poweredOn && !this.panelOpen
  },

  openPanel(s) {
    if (!this.canOpenPanel()) return false
    this.panelOpen = true
    this._panelRow = 0
    playPanelSound(true)
    // openWeather()'s hygiene, line for line and for its reasons (see the
    // L9 note there): stop what paints into the covered rows, stop a scan
    // whose lock would land under the card, and settle the status row
    // instantly since its typewriter rides the queue the card gates.
    this._cancelAllResolves()
    const wasScanning = this.scanning
    this.stopScan()
    const p = this.statusPersistent
    if (wasScanning) this.setStatus(s, 'SEEKING', false, { instant: true })
    else if (p) this.setStatus(s, p.text, p.active, { instant: true })
    this.drawPanelCard(s)
    // Forgotten first: per-kind dedup would otherwise swallow the second
    // opening of an unchanged panel, which is still news to someone who
    // cannot see it come up.
    forget('panel')
    announce(`Rear panel. ${PANEL_ROWS.map((r) => spokenRow(r, this.panel[r.key])).join(', ')}. Up and down select, left and right set, R closes.`, 'panel')
    return true
  },

  closePanel(s) {
    if (!this.panelOpen) return
    this.panelOpen = false
    playPanelSound(false)
    // Same footprint as the weather card, so the same put-back.
    this.redrawWeatherRegion(s)
  },

  /** Would this arrow MOVE anything? isMappedKey() asks before the click,
   *  key() before acting, so the two cannot disagree. Row selection wraps
   *  and so always moves; a setting stops at its ends (see stepOption), and
   *  an arrow against a stop is not a command -- no click, the same answer
   *  [L] gives where there are no lyrics. */
  panelKeyMoves(e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return true
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false
    const row = PANEL_ROWS[this._panelRow]
    const cur = this.panel[row.key]
    return stepOption(row, cur, e.key === 'ArrowLeft' ? -1 : 1) !== cur
  },

  panelKey(s, e) {
    if (e.key === 'r' || e.key === 'R' || e.key === 'Escape') { this.closePanel(s); return }
    if (!this.panelKeyMoves(e)) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const n = PANEL_ROWS.length
      this._panelRow = (this._panelRow + (e.key === 'ArrowUp' ? -1 : 1) + n) % n
      this.drawPanelCard(s)
      const row = PANEL_ROWS[this._panelRow]
      announce(spokenRow(row, this.panel[row.key]), 'panel')
      return
    }
    const row = PANEL_ROWS[this._panelRow]
    this.setPanelOption(s, row.key, stepOption(row, this.panel[row.key], e.key === 'ArrowLeft' ? -1 : 1))
  },

  setPanelOption(s, key, value) {
    this.panel = { ...this.panel, [key]: value }
    this.applyPanel(s, key)
    saveSignalState(this)
    if (this.panelOpen) this.drawPanelCard(s)
    announce(spokenRow(PANEL_ROWS.find((r) => r.key === key), value), 'panel')
    // STATIC is the one row you cannot hear while locked -- the bed only
    // runs off-station -- so it plays a sample of itself, at the new level,
    // once the trim's 250ms ramp has landed. OFF plays silence, which is
    // the honest answer. A real timer is fine: this is audio scheduling,
    // the documented exception to the fx-queue rule.
    if (key === 'static') {
      setTimeout(() => { if (this.panelOpen && this.poweredOn) playSeekStatic() }, 280)
    }
  },

  /** Push the panel's state into the four places it reaches. With no `only`
   *  it applies all four -- that is init(), where a restored panel has to
   *  land before the first sound or frame. With a key it applies that row
   *  alone, so turning the hum down does not also rebuild the picture. */
  applyPanel(s, only = null) {
    const p = this.panel
    if (!only || only === 'hum') setHumTrim(LEVEL_TRIM[p.hum])
    if (!only || only === 'static') setStaticTrim(LEVEL_TRIM[p.static])
    if (only === 'voice' && p.voice === 'off') {
      // Switching VOICE off mid-clip ends the clip, the way flipping a
      // switch would -- the guards in audio/voice.js only stop clips that
      // have not started. The duck is released rather than cleared: its
      // own timer ramps the music back up, so the track returns the way it
      // does after any announcement instead of snapping to full.
      stopLiveVoice()
      if (this._duckTimer) this._duckUntil = 0
    }
    if (!only || only === 'screen') {
      setCalmScreen(p.screen === 'calm')
      // setCrtCharacter rebuilds crtBase with the calm layer in or out; then
      // the tuning-distance degrade goes back on top, or a set sitting off-
      // station would snap to a clean picture until the next retune.
      // Powered off, the station is null -- STANDBY has no station.
      const locked = this.poweredOn && this.mode === 'locked' ? this.lockedStation : null
      setCrtCharacter(s, locked)
      if (this.poweredOn) setCrtDegradation(s, nearestSignal(this.freq, this.band).dist)
    }
  },

  drawPanelCard(s) {
    const { term } = s
    for (let y = CARD_Y0; y <= CARD_Y1; y++) {
      for (let x = CARD_X0; x <= CARD_X1; x++) term.put(x, y, ' ')
    }
    drawBoxTop(term, CARD_Y0, CARD_X0, CARD_X1, 'REAR PANEL', DIM)
    for (let y = CARD_Y0 + 1; y < CARD_Y1; y++) drawBoxSide(term, y, CARD_X0, CARD_X1, DIM)
    drawBoxBottom(term, CARD_Y1, CARD_X0, CARD_X1, DIM)

    // Build every row first and centre the BLOCK, as the weather card does,
    // so the option columns line up down the card.
    const LABEL_W = Math.max(...PANEL_ROWS.map((r) => r.label.length)) + 3
    const optsW = (row) => row.options.reduce((n, o) => n + OPTION_LABELS[o].length + 3, -1)
    const blockW = 2 + LABEL_W + Math.max(...PANEL_ROWS.map(optsW))
    const IN0 = CARD_X0 + 1, IN1 = CARD_X1 - 1
    const bx = IN0 + Math.max(0, Math.floor(((IN1 - IN0 + 1) - blockW) / 2))
    PANEL_ROWS.forEach((row, i) => {
      const y = PANEL_ROW_Y + i
      const sel = i === this._panelRow
      if (sel) term.put(bx, y, '>', BRIGHT)
      term.text(bx + 2, y, row.label, sel ? BRIGHT : NORMAL)
      let x = bx + 2 + LABEL_W
      for (const opt of row.options) {
        const text = ` ${OPTION_LABELS[opt]} `
        // The position the switch is IN is drawn inverse -- a lit segment,
        // the way a selector's current position shows on a set's display.
        // Inverse rather than brackets, because brackets on this screen
        // mean "a key you can press" (drawKeyLineAt lifts them).
        const on = this.panel[row.key] === opt
        if (on) term.text(x, y, text, sel ? BOLD : DIM, 1)
        else term.text(x, y, text, sel ? DIM : FAINT)
        x += text.length + 1
      }
    })
    const note = ROW_NOTES[PANEL_ROWS[this._panelRow].key]
    term.text(centerXRange(IN0, IN1, note), PANEL_NOTE_Y, note, MUTED)
    this.drawGuideKeyLine(s, PANEL_KEYS_Y, PANEL_KEY_LINE, DIM)
  },
}
