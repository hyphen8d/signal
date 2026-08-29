// The rejection stores' merge rules, kept pure and kept here so both the
// admin server and a test can reach them. No `node:` imports, same rule
// tools/lib/roster.mjs follows -- file IO belongs to the caller.
//
// Why this exists (2026-08-28). A rejection has to land in BOTH stores or it
// is lost: station-profiles.json's list is what audition.js prints back at
// you as "x rejected before", pending-tracks.json's is the queue's own
// record. The server was the single writer for both and required a reason,
// which fixed the half of the problem CLAUDE.md warned about -- and appended
// blindly, which left the other half.
//
// It bit within a day. Semi-Charmed Life was rejected by hand into the
// profile on 2026-08-27 and again through the API on 2026-08-29, so
// audition.js printed the same rejection twice, and would have gone on
// printing it once per re-rejection forever. The hand-written entry carried
// no youtubeId, which is the detail that matters: a guard keyed only on the
// id would have missed it and duplicated anyway. Older records are exactly
// the ones most likely to be sparse, so identity falls back to artist+track.
//
// Three outcomes rather than two, because "already there" is not one thing:
//
//   added    -- no existing record, so this is the record.
//   skipped  -- an existing record says the same thing. Do nothing; saying
//               it twice is not saying it more.
//   amended  -- an existing record says something DIFFERENT. The new
//               reasoning is appended to it as a dated note instead of
//               becoming a second entry. A second curator's reason for the
//               same call is worth keeping; a second entry is not, because
//               the whole value of these files is that the next pass reads
//               one answer and not an argument between two.

/** Loose equality for a track across stores that disagree about their
 *  fields. youtubeId wins when both sides have one; otherwise artist+track,
 *  which is what makes a hand-written entry findable. */
export function sameTrack(a, b) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  if (a.youtubeId && b.youtubeId) return a.youtubeId === b.youtubeId
  return norm(a.artist) === norm(b.artist) && norm(a.track ?? a.title) === norm(b.track ?? b.title)
}

const sameReason = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim()

/** Does `reason` already appear in `existing.reason`, verbatim or as a
 *  previously appended note? Stops a repeated re-reject stacking the same
 *  paragraph over and over. */
const alreadySays = (existing, reason) => {
  const hay = String(existing ?? '').replace(/\s+/g, ' ').trim()
  const needle = String(reason ?? '').replace(/\s+/g, ' ').trim()
  return !!needle && hay.includes(needle)
}

/** Merge one rejection into one store's list.
 *
 *  Returns { list, outcome, existing } where outcome is 'added' | 'skipped'
 *  | 'amended'. The list is a NEW array; the caller decides whether to write
 *  it, which is what keeps this testable without touching disk. */
export function mergeRejection(list, entry, { today, reason }) {
  const out = Array.isArray(list) ? list.slice() : []
  const at = out.findIndex((e) => sameTrack(e, entry))
  if (at === -1) return { list: [...out, entry], outcome: 'added', existing: null }

  const existing = out[at]
  const field = 'reason' in existing ? 'reason' : 'rejectedReason'
  const prior = existing[field]
  if (sameReason(prior, reason) || alreadySays(prior, reason)) {
    return { list: out, outcome: 'skipped', existing }
  }
  out[at] = { ...existing, [field]: `${prior}\n\n${today}: ${reason}` }
  return { list: out, outcome: 'amended', existing }
}
