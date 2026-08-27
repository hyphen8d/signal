// SIGNAL -- the visualizer shell: entry/exit, the footer, effect cycling,
// per-frame dispatch into visuals/, and the [L] lyrics view. Mixed into
// the program object. Split out in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

import { BOLD, BRIGHT, DIM, FAINT, MUTED } from './src/term.js'
const V = globalThis.SIGNAL_BUILD ?? ''
const { playPanelSound } = await import(`./audio/sfx.js?v=${V}`)
const { AUDIO_BUS, audioSignalLive } = await import(`./audio/tap.js?v=${V}`)
const { lyricsCache, lyricsStateFor } = await import(`./audio/voice.js?v=${V}`)
const { pulseBloom } = await import(`./crt-hooks.js?v=${V}`)
const { VIZ_BAR_Y, VIZ_BOT, VIZ_INFO_Y1, VIZ_INFO_Y2, centerX, clearGrid, fmtTime, truncate } = await import(`./layout.js?v=${V}`)
const { saveSignalState } = await import(`./state.js?v=${V}`)
const { VISUALS, VISUAL_KEYS } = await import(`./visuals/index.js?v=${V}`)

export default {

  // Visualizer (43rd pass). Full-screen takeover -- same clearAll-and-
  // redraw approach as the Guide and the power sequences -- with row 0
  // (drawTitleBar) kept and a footer of its own for live station/track
  // info rather than duplicating the main screen's. 50th pass: the effect
  // canvas is rows 1..VIZ_BOT-1 and the footer is the three rows below it
  // (VIZ_INFO_Y1/VIZ_INFO_Y2/VIZ_BAR_Y), which no longer line up with the
  // main screen's HINT_Y1/HINT_Y2. Only ever entered while
  // locked and playing (see the idle check in frame() and the [V] case in
  // key()), so there's always a station to show on the way in.
  enterVisualizer(s) {
    if (this.visualizerActive) return
    this.visualizerActive = true
    this._vizEnterAt = Date.now()
    this._vizLastInfoDraw = 0
    // 50th pass: a stale flash from a previous visit would otherwise sit
    // in the legend's slot for up to 1.4s on re-entry.
    this._vizFlash = null
    // 2026-08-24: always re-enter on the station's own visual, not
    // whatever the lyrics view happened to be left on last time.
    this.lyricsViewOpen = false
    // Every effect re-arms its own clocks/accumulators here (see each
    // visuals/<key>.js reset()): the effect clock restarts at 0 on entry
    // (_vizEnterAt above), so anything holding an absolute `t` from a
    // previous visit would otherwise wait on a timestamp from the future --
    // the 50th pass's frozen-FLAME bug. 2026-08-25 audit: was inline here.
    for (const fx of Object.values(VISUALS)) fx.reset?.(this)
    this.repaintVisualizerChrome(s)
    playPanelSound(true)
  },
  // 2026-08-26 (issue #7) -- the clear + chrome half of entry, split out so
  // it can be replayed WITHOUT re-entering. enterVisualizer() early-returns
  // when already active and re-arms every effect's clocks, so it is the wrong
  // tool for "the LINE INPUT card just came down, put the visualizer back".
  // The effect canvas itself needs nothing here: drawVisualizerFrame() repaints
  // it on the very next frame().
  repaintVisualizerChrome(s) {
    const { term } = s
    clearGrid(term)
    this.drawTitleBar(s)
    this.drawVisualizerInfo(s)
  },
  // 65th pass -- shared with drawVisualizerFrame() so the flash label
  // Shift+C shows and the effect actually drawn can never disagree: an
  // override in this.visualOverrides (see cycleVisualEffect below) wins
  // over the locked station's own station.visual default.
  activeVisualKey() {
    const override = this.lockedStation && this.visualOverrides[this.lockedStation.id]
    if (override && VISUALS[override]) return override
    if (this.lockedStation && VISUALS[this.lockedStation.visual]) return this.lockedStation.visual
    return 'drift'
  },
  // 65th pass -- [Shift+C] in the visualizer. Advances the locked
  // station's effect one step through VISUAL_KEYS (every built effect,
  // including the ones no station ships with by default -- "any effect,
  // anywhere" per the design call), wrapping past the end. Stored per
  // station.id in this.visualOverrides and persisted immediately, same as
  // volume/mute/phosphor -- the pick sticks until cycled again, it does
  // not reset the next time this station's visualizer opens.
  cycleVisualEffect(s) {
    if (!this.lockedStation) return
    const current = this.activeVisualKey()
    const idx = VISUAL_KEYS.indexOf(current)
    const next = VISUAL_KEYS[(idx + 1) % VISUAL_KEYS.length]
    this.visualOverrides[this.lockedStation.id] = next
    saveSignalState(this)
  },
  exitVisualizer(s) {
    if (!this.visualizerActive) return
    this.visualizerActive = false
    this._lastInputAt = Date.now()
    playPanelSound(false)
    // Same rebuild closeGuide() uses: full clear, then chrome/frames/meters,
    // then whatever the actual lock/status state was underneath (the
    // visualizer never touched freq/lockedStation/playState, only covered
    // them visually).
    const { term } = s
    clearGrid(term)
    this.redrawMainScreen(s)
    this.redrawLockState(s)
  },
  // The visualizer's own footer: a live station/track readout plus the
  // control legend and the position bar, in place of the main screen's
  // hint rows. Same inverse treatment across all three rows, so it reads
  // as "system chrome" rather than new content bolted onto the effect
  // canvas.
  drawVisualizerInfo(s) {
    const { term } = s
    const station = this.lockedStation
    // 50th pass -- found during live QA that the footer read too bright and
    // some text was hard to see, so the whole footer drops from NORMAL to DIM.
    // On an INVERSE row the attr sets how bright the background is (the
    // glyph pixels are always unlit -- see term.js's `inv ? !on : on`), so
    // this is a direct brightness dial: 205 -> 150. Three full-width
    // inverse rows at NORMAL was a lot of lit area for the bloom shader to
    // chew on, and blooming a bright background over dark glyphs is exactly
    // what was eating the text. Dimmer background = less bleed = MORE
    // legible, not less. One attr across all three rows on purpose: any
    // per-row variation reads as a gradient artifact rather than hierarchy,
    // since brightness here belongs to the background, not the text.
    const foot = DIM
    for (let x = 0; x < term.cols; x++) {
      term.put(x, VIZ_INFO_Y1, ' ', foot, 1)
      term.put(x, VIZ_INFO_Y2, ' ', foot, 1)
      term.put(x, VIZ_BAR_Y, ' ', foot, 1)
    }
    if (!station) return
    // 44th pass -- glyph flanks both sides, matching showStation()'s
    // "GLYPH NAME GLYPH" treatment in the STATION box rather than a single
    // leading marker.
    const flair = station.glyph || '●'
    const line1 = ` ${flair} ${station.callsign} ${flair} · ${station.freq.toFixed(1)} KHZ`
    // `foot | BOLD`, not plain BOLD -- bolds the station name in viz
    // mode. CORRECTION to an earlier note in this function that claimed
    // BOLD costs brightness -- it doesn't. BOLD (bit 2) and BRIGHT (bit 1)
    // are separate flags, and term.js picks the level as FAINT ?? DIM ??
    // MUTED ?? LEVELS[attr & BRIGHT], so DIM wins the level regardless of
    // BOLD while BOLD still selects the bold face. On an inverse row that
    // means MORE unlit pixels per glyph, i.e. genuinely heavier text on an
    // unchanged background -- bold here is free, and it's the one emphasis
    // that works on inverse rows (you can't brighten glyphs that are
    // defined by being unlit).
    term.text(0, VIZ_INFO_Y1, line1, foot | BOLD, 1)
    // 50th pass -- replaces the plain "any key to exit" with
    // real controls. The visualizer grew a real control set ([C] color,
    // [N] skip, [M] mute, up/down volume; see key()), so this corner is now
    // a legend for them rather than the single "[ANY KEY] EXIT" it used to
    // be. Two widths because the legend has to share the row with a station
    // callsign that ranges from CIPHER (6) to DISTORTION FIELD (16) -- the
    // full legend fits comfortably next to a short one and overruns 80 cols
    // next to a long one, so measure rather than guess. Falls through to
    // drawing nothing at all if even the compact form can't fit, which no
    // current callsign triggers but a future longer one might.
    // While a control flash is live (see _vizFlash) it takes this slot
    // instead: the normal status-row feedback those controls produce
    // (flashStatus at STATUS_Y, the VOL bar in LEVELS) is underneath the
    // effect canvas and invisible here, so without this, [M] and the volume
    // keys would be completely silent acknowledgement-wise.
    // 50th pass, revised same session: '[C] COLOR' style ran 55 cols and
    // only fit next to a short callsign, so the labels fold the bracket
    // into the word ('[C]OLOR') -- 12 cols cheaper and, if anything, reads
    // faster. Also [N] is NEXT rather than SKIP now, renamed everywhere it
    // appears (drawHint, the Guide's controls page, the README) rather than
    // just here: "skip" reads as discarding something, "next" is what the
    // key actually does. And the exit hint names a real key. [E] genuinely
    // exits -- but so does every other non-control key, exactly as before;
    // it isn't special-cased anywhere, it just falls through the switch in
    // key() like everything else. Naming one key is friendlier than the old
    // '[ANY] EXIT', without narrowing what actually works.
    // 50th pass -- bolds the command key of each command. Each
    // entry is [key, label] so the bracketed key can be drawn bold and its
    // label at normal weight, which is why this is a list of pairs rather
    // than one string. Same total width as the flat string it replaces.
    const flash = this._vizFlash && Date.now() < this._vizFlash.until ? this._vizFlash.text : null
    // 50th pass, ordering pass -- reordered for logical use, emphasis, and
    // readability. Was COLOR, NEXT, MUTE, VOL,
    // EXIT. Two things wrong with that. COLOR led the line despite being
    // the one purely cosmetic control here, so the first thing your eye hit
    // was the least likely thing you wanted. And the shared controls sat in
    // a DIFFERENT relative order than drawHint()'s row 2 on the main screen
    // (NEXT, VOL, MUTE, ... MODE), which quietly fights the muscle memory
    // the main screen just finished building. Now: playback, audio pair,
    // cosmetic, exit -- same relative order as the main footer, with EXIT
    // last where it already was. Identical width (44), so the fit against
    // the longest callsign is unchanged.
    // 2026-08-24 -- the volume hint is swapped for lyrics. [UP/DN] VOL
    // drops from the legend text; the keys themselves keep working
    // silently, same as [E]XIT already only names one of the many keys
    // that actually exit. [L] takes the freed slot -- it's dimmer/plain
    // when unavailable and bold when it isn't, so the legend loop below
    // special-cases its attr rather than using the flat foot|BOLD every
    // other bracket gets.
    // 2026-08-25 -- spelled out as [L]yrics rather than bare [L], to match
    // every other full-legend entry's own
    // bracket-fold convention ("[C]OLOR", "[M]UTE"); legendCompact stays
    // bracket-only for all five entries on purpose, that's what makes it
    // compact.
    // 66th pass -- [V] added for the new cycle-effect binding (see the key
    // switch's 'v'/'V' case), right after [C]OLOR since both are cosmetic
    // cycling controls, with [E]XIT staying last. Separator tightened from
    // two spaces to one to make room. 67th pass -- spelled out as [V]IZ,
    // matching every other full-legend entry's bracket-fold convention
    // (was left bare in the 66th pass, but that read as inconsistent next
    // to [N]EXT/[L]YRICS/etc). Computed against DISTORTION FIELD (the
    // longest callsign): [V]IZ plus the one-space separator lands at 44
    // columns against a 45-column budget -- one column of headroom, no
    // fallback-to-compact threshold moved.
    const legendFull = [['[N]', 'EXT'], ['[L]', 'YRICS'], ['[M]', 'UTE'], ['[C]', 'OLOR'], ['[V]', 'IZ'], ['[E]', 'XIT']]
    const legendCompact = [['[N]', ''], ['[L]', ''], ['[M]', ''], ['[C]', ''], ['[V]', ''], ['[E]', '']]
    // Width of a rendered legend, including one trailing space of margin.
    const legendW = (items, sep) =>
      items.reduce((n, [k, l]) => n + k.length + l.length, 0) + sep.length * (items.length - 1) + 1
    if (flash) {
      // A live flash takes the legend's slot, one notch brighter than the
      // rest of the footer plus bold, so it registers as a change.
      const text = `${flash} `
      const fx = Math.max(line1.length + 2, term.cols - text.length)
      if (fx + text.length <= term.cols) term.text(fx, VIZ_INFO_Y1, text, MUTED | BOLD, 1)
    } else {
      let items = legendFull, sep = ' '
      if (line1.length + 2 + legendW(items, sep) > term.cols) { items = legendCompact; sep = ' ' }
      const w = legendW(items, sep)
      let cx = Math.max(line1.length + 2, term.cols - w)
      if (cx + w <= term.cols) {
        for (const [k, l] of items) {
          // 2026-08-24 -- [L] is the one entry whose brightness carries
          // real information (does this track have lyrics right now)
          // rather than being flat legend chrome, so it reads its own
          // state instead of always taking foot|BOLD. FAINT rather than
          // plain `foot` for "not available" so it visibly recedes next to
          // the rest of the row, same idiom drawVU/drawMuteButton already
          // use elsewhere for an inactive control.
          const keyAttr = k === '[L]'
            ? (lyricsStateFor(this.currentTrack) === 'available' ? (foot | BOLD) : FAINT)
            : (foot | BOLD)
          term.text(cx, VIZ_INFO_Y1, k, keyAttr, 1)
          cx += k.length
          if (l) { term.text(cx, VIZ_INFO_Y1, l, foot, 1); cx += l.length }
          cx += sep.length
        }
      }
    }

    // Track line -- the whole width now. The clock moved down to the bar
    // row, putting the elapsed time on the same row as the bar, which
    // is where it belongs anyway: the numbers and the bar are the same
    // reading, and splitting them across two rows made you look twice.
    // 2026-08-27 -- displayTrack(), so a COMMERCIAL BREAK reads the same in
    // here as it does on the main screen. The position bar below needs no
    // such branch: it reads the player directly, and during a break what
    // the player is playing IS the advert, so the bar honestly becomes its
    // countdown.
    const track = this.displayTrack()
    let timePart = ''
    let progress = null
    if (this.ready && this.player) {
      let cur, dur
      try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
      if (dur && isFinite(dur) && dur > 0) {
        const fmt = fmtTime
        timePart = `${fmt(cur)} / ${fmt(dur)} `
        progress = Math.min(1, Math.max(0, cur / dur))
      }
    }
    // Centred -- centers track info of song and artist, unlike the
    // left-anchored station row above it -- the two rows reading differently
    // is the point, same way the main screen's two hint rows differ. No
    // leading space here for that reason: centerX() places it.
    let line2 = track ? `${track.title}  --  ${track.artist}` : ''
    if (line2.length > term.cols - 2) line2 = truncate(line2, term.cols - 2)
    if (line2) term.text(centerX(term.cols, line2), VIZ_INFO_Y2, line2, foot, 1)

    // Position bar -- the footer's bottom row, drawn INVERSE like the two
    // text rows above it so all three read as one chrome block (see
    // VIZ_BAR_Y's comment), with the clock riding on its right end.
    //
    // The fill is '▒', not the '█' drawPlayback() uses in the NOW PLAYING
    // box. On an inverse row a '█' has every pixel unlit, i.e. pure black
    // -- and on the very bottom row of the screen that black ran straight
    // into the unlit area under the tube -- the black bled into the bottom
    // of the terminal. '▒' is a 50% pattern,
    // so the elapsed portion reads as a distinctly darker mid-tone against
    // the trough instead of a hole punched in the chrome, and the bar keeps
    // a visible bottom edge. '▓' was the other candidate at 25% -- closer
    // to the old look but close enough to black to bleed again.
    // Trough stays '·' (near-fully lit, a faint speck per cell) so the
    // bar's full extent is still legible, and everything sits at the same
    // `foot` attr as the rest of the footer: on an inverse row the attr is
    // the BACKGROUND level, so varying it per-segment would band the row
    // rather than shade the bar.
    if (progress != null) {
      const x0 = 1
      // Leave room for the clock plus a gap, rather than running the bar
      // the full width and overprinting it.
      const x1 = term.cols - timePart.length - 3
      const segs = x1 - x0 - 1
      if (segs > 0) {
        term.put(x0, VIZ_BAR_Y, '[', foot, 1)
        term.put(x1, VIZ_BAR_Y, ']', foot, 1)
        const filled = Math.round(progress * segs)
        for (let i = 0; i < segs; i++) {
          term.put(x0 + 1 + i, VIZ_BAR_Y, i < filled ? '▒' : '·', foot, 1)
        }
      }
      if (timePart) term.text(term.cols - timePart.length, VIZ_BAR_Y, timePart, foot, 1)
    }
  },
  // 67th pass -- PULSE (COLD WAVE's old neon-lattice-and-EKG effect)
  // permanently removed, alongside BLAST FIELD above. Both had sat
  // unassigned for passes with no station shipping them and no plan to
  // bring them back; the 65th pass already broke the "never delete a
  // superseded effect" convention for five other long-unassigned effects
  // on the same reasoning, and these two get the same treatment now.
  // 44th pass -- dispatches on the locked station's own `visual` field
  // (VISUAL_METHODS) rather than always drawing DRIFT, so a themed station
  // (today just DRIFT MODE) gets its own effect the moment one exists for
  // it, with no change needed here.
  drawVisualizerFrame(s, t) {
    // 65th pass -- activeVisualKey() folds in any [Shift+C] override (see
    // cycleVisualEffect) ahead of the station's own station.visual default;
    // shared with the flash label so what's drawn and what's announced can
    // never disagree.
    const key = this.activeVisualKey()
    // 2026-08-23 (live audio tap) -- the vetted per-frame view every effect
    // reads instead of the raw bus: null unless capture is live AND ungated.
    // Mute, ads, dead air and the headphones-on-mic case all trip the tap's
    // ~1.2s noise gate, flip this to null, and every effect falls back
    // wholesale to its synthetic behavior -- the "never looks broken during
    // silence" requirement, enforced in one place.
    this._au = audioSignalLive() ? AUDIO_BUS : null
    // Uniform downbeat layer: one small bloom breath on strong bass onsets,
    // at most every 1.2s -- a third of the ident's 0.5 pulse, so it reads
    // as the picture breathing with the music, not a strobe. pulseBloom
    // self-clears its shared timer and settles back to the station's own
    // crtBase.bloomAmt, and idents can't contend (a lock always exits the
    // visualizer first). DRIFT MODE is excluded: nothing about that station
    // should thump.
    if (this._au && key !== 'drift' && this._au.onset && this._au.bass > 0.55 &&
        Date.now() - this._auBloomAt > 1200) {
      this._auBloomAt = Date.now()
      pulseBloom(s, 0.16, 110)
    }
    // 2026-08-24 -- checked every frame, not just once at the moment of a
    // skip: right after N, the new track's lookup is still 'pending' (it
    // was just fired by loadTrack()), so a one-shot check at skip time
    // almost always sees 'pending' and never closes. Re-checking here each
    // tick means the instant the lookup actually resolves 'unavailable',
    // this same frame falls back to the effect instead of sitting on a
    // dead-end screen for however long the fetch takes. (QA caught this on
    // the first real skip test -- the original design assumed the skip-time
    // check alone was enough; it wasn't.)
    if (this.lyricsViewOpen && lyricsStateFor(this.currentTrack) === 'unavailable') {
      this.lyricsViewOpen = false
    }
    // [L] takes over the whole effect canvas rather than drawing on top of
    // it: every VISUAL_METHODS entry repaints rows 1..VIZ_BOT-1 in full
    // each tick (that's what makes the footer's writes into those rows
    // safe, see its own comment), so skipping the effect call entirely
    // here is the same contract, not a special case.
    if (this.lyricsViewOpen) this.drawLyricsView(s)
    else VISUALS[key].draw(this, s, (Date.now() - this._vizEnterAt) / 1000)
    // Info footer updates on the same cadence drawPlayback() already uses
    // for the normal progress bar -- plenty for a running clock, and cheap
    // (two 80-wide inverse rows) next to the effect's own per-frame cost.
    if (t - (this._vizLastInfoDraw || 0) > 0.25) {
      this._vizLastInfoDraw = t
      this.drawVisualizerInfo(s)
    }
  },
  // 2026-08-24 -- the [L] lyrics view. Centered teletext-style crawl: the
  // active line bold/bright at the canvas's vertical middle, one line
  // before it dimmed just above, two lines after it faint below. Reads off
  // player.getCurrentTime() directly rather than keeping its own clock --
  // same source drawVisualizerInfo()'s footer timer already trusts.
  drawLyricsView(s) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    }
    const midY = Math.floor((1 + VIZ_BOT) / 2)
    const track = this.currentTrack
    // 2026-08-27 -- a break takes this view too. Without it the crawl runs
    // off the ADVERT's clock (drawLyricsView reads the player's current
    // time, which during a break is the ad's), so it would sit there
    // confidently showing the first line of a song nobody is hearing.
    if (this.breakActive) {
      const label = this.breakTrack().title
      term.text(centerX(term.cols, label), midY, label, FAINT)
      return
    }
    const entry = track ? lyricsCache[track.youtubeId] : null
    if (!entry || entry.state === 'pending') {
      const label = 'TUNING IN LYRICS...'
      term.text(centerX(term.cols, label), midY, label, FAINT)
      return
    }
    if (entry.state !== 'available' || !entry.lines.length) {
      const label = 'NO LYRICS AVAILABLE'
      term.text(centerX(term.cols, label), midY, label, FAINT)
      return
    }
    let cur = 0
    if (this.ready && this.player) { try { cur = this.player.getCurrentTime() } catch (e) {} }
    const lines = entry.lines
    let idx = -1
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= cur) idx = i; else break }
    const draw = (i, y, attr) => {
      if (i < 0 || i >= lines.length) return
      let text = lines[i].text
      if (text.length > term.cols - 4) text = truncate(text, term.cols - 4)
      term.text(centerX(term.cols, text), y, text, attr)
    }
    draw(idx - 1, midY - 1, FAINT)
    draw(idx, midY, BRIGHT | BOLD)
    draw(idx + 1, midY + 1, DIM)
    draw(idx + 2, midY + 2, FAINT)
  },
}
