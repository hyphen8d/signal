// SIGNAL -- the LINE INPUT consent card: the one place a browser capture
// prompt can be raised from. Mixed into the program object.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, MUTED, NORMAL } from '../src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playPanelSound, stopStaticNoise } = await import(`../audio/sfx.js?v=${V}`)
const { AUDIO_BUS, startAudioTap, stopAudioTap, tapPromptTier } = await import(`../audio/tap.js?v=${V}`)
const { centerX, clearGrid } = await import(`../layout.js?v=${V}`)
const { saveSignalState } = await import(`../state.js?v=${V}`)

export default {

  // The consent pass (2026-08-25). See audio/tap.js's own note for WHY this
  // exists; this file is the card itself.
  //
  // Two things had to be true for it to be worth building rather than just
  // deleting the prompt outright:
  //
  //   1. It has to appear at a moment the visitor created. [V] is that
  //      moment -- they just asked for the full-screen visualizer, so "this
  //      is what would make it react to the actual music" answers a question
  //      they are already holding. The old power-on prompt answered nothing:
  //      three seconds in, over a black boot screen, before a single meter
  //      had moved.
  //   2. Pressing [Y] has to still be a real user gesture, or the tab tier
  //      dies -- getDisplayMedia requires-and-consumes transient activation.
  //      It is: a keydown is a full-value activation, same as the power-on
  //      keypress the call used to ride. Nothing was weakened by moving it.
  //
  // The idle auto-entry into the visualizer (see frame()) deliberately does
  // NOT open this card -- it has no gesture behind it, so getDisplayMedia
  // would be refused anyway, and a permission card appearing on an
  // unattended screen is precisely the ambush this pass exists to remove.
  //
  // Answers persist (state.js's `tapConsent`) so the card is offered at most
  // once per visitor rather than once per session, and [A] re-opens it on
  // demand -- which is what makes "not now" feel like a decision instead of
  // a door closing.

  /** Returns true if the card took the screen, false if there was nothing
   *  to offer (no capture path on this browser) and the caller should just
   *  carry on. `then` runs on close, in place of the main-screen redraw --
   *  that's the [V] path handing back to enterVisualizer without a frame of
   *  main screen flashing in between. */
  openTapConsent(s, then) {
    if (this.tapConsentOpen) return false
    // Structural, not incidental: this card is drawn for the 80x25 desktop
    // grid and would clamp to nonsense in mobile-lite's 42x22 (centerX()
    // clamps silently -- see its own comment). Both entry points are
    // keyboard-only so mobile can't reach it anyway, but "mobile is never
    // asked for the microphone" is a promise this pass makes out loud in
    // audio/tap.js and the README, and it should hold by construction.
    if (this.mobile) return false
    const tier = tapPromptTier(this)
    if (tier === 'none') return false
    this.tapConsentOpen = true
    this._tapConsentTier = tier
    this._tapConsentThen = then || null
    playPanelSound(true)
    // Same hygiene openGuide() does, and for the same reason: this is a
    // full-screen takeover of the same grid, so any timer-driven painter
    // still pointed at the rows underneath has to be stopped, not just
    // covered. (fx-queue work is already handled -- _tickFx bails on
    // tapConsentOpen, see program.js.)
    this._clearStatusTimers()
    this._cancelAllResolves()
    this.stopScan()
    stopStaticNoise()
    this.drawTapConsent(s)
    return true
  },

  /** `note` is a ≤14-char status string (STATUS_TEXT_WIDTH) shown after the
   *  card comes down -- in the visualizer's own legend slot if that's where
   *  we're landing, since flashStatus writes to a row the visualizer covers. */
  closeTapConsent(s, note) {
    if (!this.tapConsentOpen) return
    this.tapConsentOpen = false
    this._tapConsentTier = null
    const then = this._tapConsentThen
    this._tapConsentThen = null
    playPanelSound(false)
    if (then) {
      then()
      if (note && this.visualizerActive) {
        this._vizFlash = { text: note, until: Date.now() + 2200 }
        this.drawVisualizerInfo(s)
      }
      return
    }
    // Same rebuild closeGuide()/exitVisualizer() use.
    const { term } = s
    clearGrid(term)
    this.redrawMainScreen(s)
    this.redrawLockState(s)
    if (note) this.flashStatus(s, note, 1600)
  },

  /** [Y]. startAudioTap() runs synchronously in the keypress that got here
   *  -- that ordering is the whole ballgame for the tab tier, so it happens
   *  BEFORE closeTapConsent()'s redraw, not after. */
  acceptTapConsent(s) {
    if (this._tapConsentTier === 'live') { this.closeTapConsent(s); return }
    this.tapConsent = 'yes'
    saveSignalState(this)
    startAudioTap(this, s)
    // No note: the tap answers for itself a beat later through notifyTap()
    // ('TAP: LINE' / 'TAP: MIC'), or says why it couldn't. Announcing
    // success here would be announcing a promise, not a result.
    this.closeTapConsent(s)
  },

  /** [N] / [Escape]. Also the revoke path when the card was opened with
   *  [A] over a live tap. */
  declineTapConsent(s) {
    const wasLive = this._tapConsentTier === 'live'
    this.tapConsent = 'no'
    saveSignalState(this)
    if (wasLive) {
      stopAudioTap('unpatched')
      this.closeTapConsent(s, 'LINE IN OFF')
      return
    }
    // Teach the re-arm key exactly once, at the only moment it's relevant:
    // right after someone has said no and might want to change their mind.
    this.closeTapConsent(s, '[A] = LINE IN')
  },

  drawTapConsent(s) {
    const { term } = s
    clearGrid(term)
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    const tier = this._tapConsentTier
    put(1, 'SIGNAL -- LINE INPUT', BOLD)

    if (tier === 'live') {
      const src = AUDIO_BUS.source === 'tab' ? 'TAB CAPTURE' : 'MICROPHONE'
      // Rows chosen to sit on the same spine as the offer variant below --
      // this card has two fewer blocks, so they're spread rather than
      // stacked at the top, or the whole thing reads as having been cut off.
      put(4, `LINE IN: LIVE -- ${src}`, BRIGHT)
      put(6, 'The meters and visualizers are following the real audio', NORMAL)
      put(7, 'coming out of this page.', NORMAL)
      put(10, 'ANALYSIS ONLY -- the signal reaches a level meter and', NORMAL)
      put(11, 'nothing else. Nothing is recorded. Nothing leaves this page.', NORMAL)
      put(14, 'Pull the line and every meter goes back to the synthetic', MUTED)
      put(15, 'motion it had before -- nothing else about the set changes.', MUTED)
      this.drawGuideKeyLine(s, 20, '[N] PULL THE LINE          [Y] LEAVE IT PATCHED IN', DIM)
      return
    }

    put(3, 'Every meter and visualizer on this set is running on', NORMAL)
    put(4, 'synthetic motion. Patching in a line feed lets them follow', NORMAL)
    put(5, 'the audio that is actually playing.', NORMAL)

    // Name the dialog the browser is about to raise. A tab-share picker and
    // a bare microphone request are alarming in completely different ways
    // and a generic "you'll see a permission prompt" prepares you for
    // neither -- being told "share the contents of your screen" is coming,
    // and that ticking one box is the entire point, is most of what turns
    // that dialog from an ambush into a step.
    if (tier === 'tab') {
      put(8, 'Press [Y] and your browser asks to share this tab.', BRIGHT)
      put(9, 'Choose "This tab", then tick "Also share tab audio".', NORMAL)
      put(10, 'That tick is the line feed. The tab keeps playing out loud.', NORMAL)
    } else {
      put(8, 'Press [Y] and your browser asks for the microphone.', BRIGHT)
      put(9, 'It listens to your speakers -- what it hears is the line', NORMAL)
      put(10, 'feed. Your browser remembers this one, so it asks once.', NORMAL)
    }

    put(13, 'ANALYSIS ONLY -- the signal reaches a level meter and', NORMAL)
    put(14, 'nothing else. Nothing is recorded. Nothing leaves this page.', NORMAL)

    put(16, 'Saying no costs nothing: every meter keeps the synthetic', MUTED)
    put(17, 'motion it has always had, which is what you see now.', MUTED)

    this.drawGuideKeyLine(s, 20, '[Y] PATCH IN          [N] NOT NOW', DIM)
    this.drawGuideKeyLine(s, 22, '[A] re-opens this card any time', FAINT)
  },
}
