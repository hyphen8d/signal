// Repo-state checks shared by the two ways SIGNAL ships (2026-10-20):
// tools/admin-server.mjs's SHIP (commits the whole tree ON main) and
// tools/ship.mjs (ships a BRANCH through a pull request). The two disagree
// on most preconditions -- SHIP wants a dirty tree on main, ship.mjs wants a
// clean one on a branch -- but they agree on these, and these are the ones
// whose wording and edge cases were earned the hard way (2026-10-15 admin
// audit, C-M3). One copy, so a fix to either reaches both.
//
// Node-only, unlike tools/lib/roster.mjs: the dashboard page never imports
// this file, so `node:` imports are fine here.

import { existsSync } from 'node:fs'
import path from 'node:path'

/** `git status --porcelain` -> [{ code, file }]. Takes the RAW output:
 *  porcelain is fixed-width (XY, space, path), so an unstaged modification
 *  is " M path" and trimming the output first shifts every column by one --
 *  which is how the deploy panel once listed "ools/network.html". */
export function parsePorcelain(raw) {
  return String(raw || '').split('\n').filter(Boolean).map((l) => {
    // XY<space>PATH. A rename is "R  old -> new"; show the destination,
    // which is the name that will exist after the commit.
    const code = l.slice(0, 2).trim()
    let file = l.slice(3)
    const arrow = file.indexOf(' -> ')
    if (arrow !== -1) file = file.slice(arrow + 4)
    // Paths with spaces or non-ASCII come back quoted.
    if (file.startsWith('"') && file.endsWith('"')) {
      try { file = JSON.parse(file) } catch (e) { /* leave as-is */ }
    }
    return { code, file }
  })
}

/** A merge, rebase, cherry-pick or revert in progress, or unmerged paths:
 *  any commit made now records something other than what is on screen
 *  (`add -A` marks conflicted files RESOLVED with the markers still in them,
 *  and lint and the suite do not read README or CLAUDE.md).
 *  `gitDir` is `git rev-parse --git-dir`, resolved against `root`. */
export function inProgressBlockers(root, gitDir, dirty) {
  const out = []
  for (const f of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (existsSync(path.resolve(root, gitDir || '.git', f))) out.push(`a git ${f.replace(/_HEAD|-.*$/, '').toLowerCase()} is in progress -- finish or abort it first`)
  }
  const unmerged = dirty.filter((d) => /U|AA|DD/.test(d.code))
  if (unmerged.length) out.push(`unmerged files: ${unmerged.map((d) => d.file).join(', ')}`)
  return out
}
