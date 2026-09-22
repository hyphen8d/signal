// SIGNAL -- what a screen reader gets (2026-09-22).
//
// The entire set is one <canvas>: a grid of beam intensities with no text in
// the DOM at all, so assistive technology sees an empty page with a
// keyboard-driven toy somewhere inside it. The text IS the interface here,
// which makes that a worse gap for this app than for most.
//
// Two halves, and the split matters. index.html carries the STATIC half --
// what SIGNAL is and which keys do what -- because a control list is only
// useful before you press anything, and a live region that announced it
// would be reading furniture aloud on every visit. This file is the LIVE
// half: the four things that change and that a listener would otherwise have
// no way to know -- the set going on or off, which station it locked, what
// started playing, and whether it is muted.
//
// Deliberately quiet. A polite live region interrupts nothing, but a chatty
// one is worse than none: the status row alone sweeps, flashes and re-resolves
// dozens of times a minute, and none of that is news. Nothing here fires on a
// redraw -- only on a real state change.
const V = globalThis.SIGNAL_BUILD ?? ''

let node
let last = ''
// Per-KIND, not just per-last-line. The first cut compared each message with
// the one before it, which a repaint walks straight past: closing the guide
// re-draws the station AND the track, so the two alternate and each looks
// new. Keyed, a repaint of unchanged state says nothing at all.
const said = new Map()

/** The live region, looked up once. Absent in the test harness and in any
 *  page that does not carry it, where every call below is a no-op. */
function region() {
  if (node !== undefined) return node
  try { node = document.getElementById('announce') ?? null } catch (e) { node = null }
  return node
}

/** Say something, if it is not what was just said. The dedup is what keeps a
 *  re-render from re-announcing: showTrack() runs again on a resolve, a
 *  break, an overlay closing, and the text is identical each time. */
export function announce(text, kind = 'other') {
  const say = String(text ?? '').trim()
  if (!say || say === last || said.get(kind) === say) return
  said.set(kind, say)
  last = say
  const el = region()
  if (!el) return
  // Cleared first: a live region with the same textContent written twice is
  // not guaranteed to be re-read, and two different tracks can share a line
  // (a station's own ident, say) often enough to matter.
  el.textContent = ''
  el.textContent = say
}

/** Exported for the tests, and for anything that needs to know what the last
 *  thing said was without reading the DOM. */
export function lastAnnouncement() { return last }
export function resetAnnouncements() { last = ''; said.clear(); node = undefined }

/** "COLD WAVE, 92.4 kilohertz. wave after wave after wave." Spoken, not
 *  drawn: the dial's own KHZ suffix and glyph flair would read as noise. */
export function stationLine(station) {
  if (!station) return ''
  const bits = [station.callsign]
  if (Number.isFinite(station.freq)) bits.push(`${station.freq} kilohertz`)
  return bits.join(', ') + (station.tagline ? `. ${station.tagline}` : '')
}

/** "Now playing: Stay With Me by Miki Matsubara." */
export function trackLine(track) {
  if (!track || !track.title) return ''
  return `Now playing: ${track.title}${track.artist ? ` by ${track.artist}` : ''}`
}
