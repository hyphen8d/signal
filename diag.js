// TEMPORARY DIAGNOSTIC -- added 2026-08-27, to be removed once it has done
// its job. Loaded by main.js ONLY when the URL carries ?diag=1, so a normal
// visitor never fetches it and nothing about the app changes.
//
// Why it exists. The commercial break shipped and turned out to be inert
// against real YouTube prerolls: the set shows BUFFERING and the track's own
// title while an advert plays out loud. A live capture is the only way to
// learn what the IFrame API actually reports during one, and the console is
// not a reasonable thing to ask of the person who has the reproduction --
// they are running an incognito window on another machine. So the readout
// comes to them: it draws ON the page, in plain DOM over the tube, and a
// screenshot of it is the whole deliverable.
//
// Three things it must survive, each learned the hard way earlier today:
//
//  - **rAF starvation.** An occluded Chrome window sits at literally 0fps
//    while reporting itself visible and focused, which is why the app's own
//    frame-driven detection measured nothing. This runs on setInterval, so
//    it keeps sampling when frame() has stopped entirely.
//  - **The advert is transient.** It is over in fifteen seconds and nobody
//    can screenshot on cue, so this keeps a scrollback of the last DISTINCT
//    lines rather than only the current one. A screenshot taken after the
//    advert still contains it.
//  - **It must not perturb what it measures.** Pure DOM, pointer-events
//    none, no writes to the program, no canvas involvement.
//
// The line that answers the question is whichever one is on screen while an
// advert is audible. If `id=` there is not the track's own id, the player is
// exposing the advert and the break's id signal can work. If `id=` and
// `dur=` both still describe the track, the IFrame API is hiding the advert
// on purpose and no amount of gate-tuning will find it.

const STATE = {
  '-1': 'UNSTARTED', 0: 'ENDED', 1: 'PLAYING',
  2: 'PAUSED', 3: 'BUFFERING', 5: 'CUED',
}
const MAX_LINES = 16
const short = (v) => (v == null ? String(v) : String(v).slice(0, 11))

export function startDiag() {
  const box = document.createElement('div')
  box.id = 'signalDiag'
  box.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'z-index:99999',
    'max-width:min(96vw,900px)', 'padding:10px 12px',
    'background:rgba(0,0,0,.88)', 'color:#ffb000',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre', 'pointer-events:none',
    'border:1px solid #ffb000', 'overflow:hidden',
  ].join(';')
  document.body.appendChild(box)

  const lines = []
  let lastKey = null
  const t0 = Date.now()

  // Change detection deliberately EXCLUDES the playhead. Sampling four times
  // a second, a line keyed on t= would be "new" every single tick, so the
  // scrollback would churn through sixteen identical-looking entries every
  // four seconds and the advert -- the one thing this exists to catch --
  // would scroll off before anyone reached for a screenshot. The key is the
  // shape of the player's answer (which video, what state, what the detector
  // makes of it); the playhead is still printed on each line, and a live NOW
  // row underneath carries it continuously.
  const read = () => {
    const p = window.screen0 && window.screen0.program
    if (!p) return { key: 'nop', line: 'waiting for the program...' }
    const pl = p.player
    if (!pl) return { key: 'noplayer', line: 'powered off / no player yet -- press P' }
    let id, st, dur, cur, det
    try { id = pl.getVideoData && pl.getVideoData().video_id } catch (e) { id = 'ERR' }
    try { st = pl.getPlayerState && pl.getPlayerState() } catch (e) { st = 'ERR' }
    try { dur = pl.getDuration && pl.getDuration() } catch (e) { dur = 'ERR' }
    try { cur = pl.getCurrentTime && pl.getCurrentTime() } catch (e) { cur = 'ERR' }
    try { det = p.detectBreak ? p.detectBreak() : 'n/a' } catch (e) { det = 'ERR' }
    const want = p.currentTrack && p.currentTrack.youtubeId
    const mismatch = id && want && id !== want
    const num = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v))
    const line = [
      `id=${short(id)}`,
      `want=${short(want)}`,
      mismatch ? '*** MISMATCH ***' : 'same',
      `state=${STATE[st] || st}`,
      `dur=${num(dur)}`,
      `t=${num(cur)}`,
      `detect=${det}`,
      `break=${p.breakActive}`,
    ].join('  ')
    // Duration is rounded into the key: it identifies WHICH video is loaded
    // (and would change sharply if an advert's own length ever appeared),
    // without the sub-second jitter that would make every tick unique.
    const key = [id, want, st, det, p.breakActive, Math.round(typeof dur === 'number' ? dur : -1)].join('|')
    return { key, line }
  }

  setInterval(() => {
    const { key, line } = read()
    if (key !== lastKey) {
      lastKey = key
      const secs = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
      lines.push(`${secs}s  ${line}`)
      if (lines.length > MAX_LINES) lines.shift()
    }
    box.textContent =
      `SIGNAL DIAG  build=${globalThis.SIGNAL_BUILD}  -- let an advert play, then screenshot this whole box\n`
      + `looking for: a line logged while you can HEAR an advert. MISMATCH there means the player exposes it.\n`
      + '-'.repeat(104) + '\n'
      + lines.join('\n')
      + `\n${'-'.repeat(104)}\nNOW  ${read().line}`
  }, 250)

  console.log('[SIGNAL diag] running -- screenshot the amber box after an advert plays')
}
