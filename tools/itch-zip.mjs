// Packages the app as an itch.io HTML project: dist/signal-itch.zip.
//
//   node tools/itch-zip.mjs          # npm run itch
//   node tools/itch-zip.mjs --list   # print what goes in, build nothing
//
// itch serves an uploaded zip from its own sandboxed origin
// (html-classic.itch.zone) and there is no way to point a Play button at a
// site hosted elsewhere, so the copy on itch is a COPY: it does not follow a
// deploy the way the Pages site does. That is the whole reason this is a tool
// rather than a hand-made zip -- re-run it after a deploy and re-upload, or
// the itch listing quietly becomes an old build. Same argument as
// shoot.mjs/record-demo.mjs: an artefact no tool owns is one that rots.
//
// What goes in is derived from what the app actually FETCHES, which is the
// same question tools/admin-server.mjs's servable() answers for the dev
// server. Kept deliberately separate rather than imported: that allowlist
// exists to stop a secret leaking over HTTP and has to be conservative about
// directories, while this one has to be exhaustive about files or the app
// breaks in a way nobody sees until it is live on someone else's site.
//
// Two things that are NOT in it and are not missing:
//   - screenshots/ (5MB of stills; itch shows its own gallery)
//   - tools/, tests/, docs, package.json -- never fetched by the page
//
// The build stamp is baked in as it stands. main.js still fetches build.json
// at load, finds the same stamp it was packaged with, and everything imports
// under it: the reload-on-deploy check (tickBuild) therefore never fires on
// itch, which is correct -- there is nothing to reload to.
import { statSync, existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const OUT = path.join(ROOT, 'dist')
const ZIP = path.join(OUT, 'signal-itch.zip')

/** Root files the page pulls in, by name. */
const ROOT_FILES = [
  'index.html', 'build.json', 'manifest.json',
  'main.js', 'program.js', 'config.js', 'stations.js', 'layout.js', 'tuning.js',
  'crt-hooks.js', 'constants.js', 'state.js', 'weather.js', 'visualizer.js',
  'game.js', 'a11y.js',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
]
/** Not fetched by the page, but required to travel with any copy.
 *
 *  2026-10-12 (audit, M6) -- the zip shipped without either. src/ is
 *  cyberspace-crt, vendored under MIT, whose one condition is that "the above
 *  copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software". The src/*.js files carry
 *  no header of their own, so NOTICE is the only place that notice exists,
 *  and an itch upload IS a copy. LICENSE goes too, for SIGNAL's own terms.
 *  (fonts/ always carried the font's OFL.txt, because it travels whole.) */
const LEGAL_FILES = ['LICENSE', 'NOTICE']
/** Directories taken whole -- every TRACKED file in them. */
const DIRS = ['src', 'ui', 'visuals', 'audio', 'fonts']
/** Tracked things at the root that are deliberately not packaged. Anything
 *  tracked at the root that is in none of these lists stops the build -- see
 *  the stray check. Markdown is never fetched and is let through by rule. */
const NOT_SHIPPED_DIRS = ['tools', 'tests', 'screenshots', '.github']
const NOT_SHIPPED_FILES = ['package.json', '.gitignore']

function git(...a) {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`git ${a.join(' ')} failed -- this tool packages what git tracks, so it needs a checkout:\n${r.stderr}`)
    process.exit(1)
  }
  return r.stdout.split('\0').filter(Boolean)
}

// 2026-10-12 (audit, M6) -- what goes in is what GIT TRACKS, not what is on
// disk. This used to walk() each directory, and the working tree is not the
// project: the built zip carried audio/dm-test.mp3, a gitignored scratch
// render from voice-render.mjs, and would have carried anything else lying
// there -- a dotfile, an editor swap file, a key dropped in the wrong
// folder. Same argument as the admin server's static allowlist: naming what
// belongs means the next stray thing is excluded without anyone having had
// to anticipate it. Tracked files are still read from the working tree, so
// an uncommitted EDIT to one is packaged, as before.
const tracked = git('ls-files', '-z')
const trackedSet = new Set(tracked)
const inDirs = (rel) => DIRS.some((d) => rel.startsWith(d + '/'))
const fileRels = [...ROOT_FILES, ...LEGAL_FILES, ...tracked.filter(inDirs)]
const files = fileRels.map((rel) => path.join(ROOT, rel))

const missing = fileRels.filter((rel) => !existsSync(path.join(ROOT, rel)) || !trackedSet.has(rel))
if (missing.length) {
  console.error('missing or untracked, so the package would be broken:')
  for (const m of missing) console.error('  ' + m)
  process.exit(1)
}

// The stray check: something the app may fetch that this tool would leave
// out. It would 404 on itch only, at run time, on someone else's machine --
// the one place nobody looks.
//
// 2026-10-12 (audit, M6) -- this was "a root .js nobody listed". It now
// covers three shapes, one of them opened by packaging from git:
//   1. a tracked root FILE in no list (a new module, stylesheet, image)
//   2. a tracked root DIRECTORY in no list (a new lib/ the page imports)
//   3. an untracked-but-not-ignored file inside a packaged directory -- a
//      new clip or module not committed yet, which git ls-files would drop
//      silently. Committing it is the fix, so the message says so.
const listed = new Set([...ROOT_FILES, ...LEGAL_FILES, ...NOT_SHIPPED_FILES])
const strayFiles = tracked.filter((rel) => !rel.includes('/') && !listed.has(rel) && !/\.md$/i.test(rel))
const strayDirs = [...new Set(tracked.filter((rel) => rel.includes('/')).map((rel) => rel.split('/')[0]))]
  .filter((d) => !DIRS.includes(d) && !NOT_SHIPPED_DIRS.includes(d))
const uncommitted = git('ls-files', '-z', '--others', '--exclude-standard', '--', ...DIRS)
if (strayFiles.length || strayDirs.length || uncommitted.length) {
  if (strayFiles.length) console.error(`tracked root files this tool does not package: ${strayFiles.join(', ')}`)
  if (strayDirs.length) console.error(`tracked root directories this tool does not package: ${strayDirs.join(', ')}`)
  if (uncommitted.length) console.error(`untracked files in packaged directories -- commit or gitignore them: ${uncommitted.join(', ')}`)
  console.error('Add each to ROOT_FILES/DIRS if the page fetches it, or to NOT_SHIPPED_* if it does not.')
  process.exit(1)
}

if (process.argv.includes('--list')) {
  for (const rel of fileRels) console.log(rel)
  console.log(`\n${files.length} files`)
  process.exit(0)
}

// 2026-10-12 (audit, M6) -- this used to rmSync the whole of dist/, which
// .gitignore names as where the itch COVER ART lives too, so every rebuild
// deleted it. Only what this tool owns is removed now: the zip (which must
// go first -- `zip -r` APPENDS to an existing archive, keeping files since
// deleted from the tree) and its own staging directory.
mkdirSync(OUT, { recursive: true })
rmSync(ZIP, { force: true })
const stage = path.join(OUT, `.itch-stage-${process.pid}`)
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
try {
  for (const rel of fileRels) {
    const dest = path.join(stage, rel)
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(path.join(ROOT, rel), dest)
  }

  // The analytics beacon does not travel. It measures the Pages site; a copy
  // running on itch's origin would either report plays as traffic to a site
  // they did not visit, or fail outright (it does: ERR_FAILED from the itch
  // sandbox). Either way it is the wrong measurement in the wrong place, so
  // the packaged index.html goes without it. itch keeps its own play counts.
  const indexPath = path.join(stage, 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  const BEACON = /\n?\s*<!-- Cloudflare Web Analytics[\s\S]*?<script[^>]*cloudflareinsights[^>]*><\/script>/
  if (!BEACON.test(html)) {
    console.error('index.html no longer matches the analytics block this tool strips.')
    console.error('Check what changed before shipping a copy that beacons from itch.')
    process.exitCode = 1
  } else {
    writeFileSync(indexPath, html.replace(BEACON, ''))
    // -r from inside the stage dir: itch needs index.html at the ZIP ROOT,
    // not nested in a folder, or the Play button serves a directory listing.
    const r = spawnSync('zip', ['-q', '-r', '-9', ZIP, '.'], { cwd: stage, stdio: 'inherit' })
    if (r.status !== 0) { console.error('zip failed'); rmSync(ZIP, { force: true }); process.exitCode = 1 }
  }
} finally {
  rmSync(stage, { recursive: true, force: true })
}

if (!process.exitCode) {
  const mb = (statSync(ZIP).size / 1e6).toFixed(1)
  console.log(`${path.relative(ROOT, ZIP)}  ${files.length} files, ${mb} MB`)
  console.log('Upload to itch as an HTML project; tick "This file will be played in the browser".')
}
