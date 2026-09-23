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
import { readdirSync, statSync, existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
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
/** Directories taken whole. */
const DIRS = ['src', 'ui', 'visuals', 'audio', 'fonts']

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const files = [
  ...ROOT_FILES.map((f) => path.join(ROOT, f)),
  ...DIRS.flatMap((d) => walk(path.join(ROOT, d))),
]

const missing = files.filter((f) => !existsSync(f))
if (missing.length) {
  console.error('missing, so the package would be broken:')
  for (const m of missing) console.error('  ' + path.relative(ROOT, m))
  process.exit(1)
}

// A root .js the app imports but nobody listed is the failure this catches:
// it would 404 on itch only, at run time, on someone else's machine.
const listed = new Set(files.map((f) => path.relative(ROOT, f)))
const strays = readdirSync(ROOT)
  .filter((f) => f.endsWith('.js') && !listed.has(f) && f !== 'package.json')
if (strays.length) {
  console.error(`root .js files exist that this tool does not package: ${strays.join(', ')}`)
  console.error('Add them to ROOT_FILES if the page fetches them, or ignore this if it does not.')
  process.exit(1)
}

if (process.argv.includes('--list')) {
  for (const f of files) console.log(path.relative(ROOT, f))
  console.log(`\n${files.length} files`)
  process.exit(0)
}

rmSync(OUT, { recursive: true, force: true })
const stage = path.join(OUT, 'signal')
mkdirSync(stage, { recursive: true })
for (const f of files) {
  const rel = path.relative(ROOT, f)
  const dest = path.join(stage, rel)
  mkdirSync(path.dirname(dest), { recursive: true })
  cpSync(f, dest)
}

// The analytics beacon does not travel. It measures the Pages site; a copy
// running on itch's origin would either report plays as traffic to a site
// they did not visit, or fail outright (it does: ERR_FAILED from the itch
// sandbox). Either way it is the wrong measurement in the wrong place, so the
// packaged index.html goes without it. itch keeps its own play counts.
const indexPath = path.join(stage, 'index.html')
const html = readFileSync(indexPath, 'utf8')
const BEACON = /\n?\s*<!-- Cloudflare Web Analytics[\s\S]*?<script[^>]*cloudflareinsights[^>]*><\/script>/
if (!BEACON.test(html)) {
  console.error('index.html no longer matches the analytics block this tool strips.')
  console.error('Check what changed before shipping a copy that beacons from itch.')
  process.exit(1)
}
writeFileSync(indexPath, html.replace(BEACON, ''))
// -r from inside the stage dir: itch needs index.html at the ZIP ROOT, not
// nested in a folder, or the Play button serves a directory listing.
const r = spawnSync('zip', ['-q', '-r', '-9', ZIP, '.'], { cwd: stage, stdio: 'inherit' })
if (r.status !== 0) { console.error('zip failed'); process.exit(1) }
rmSync(stage, { recursive: true, force: true })

const mb = (statSync(ZIP).size / 1e6).toFixed(1)
console.log(`${path.relative(ROOT, ZIP)}  ${files.length} files, ${mb} MB`)
console.log('Upload to itch as an HTML project; tick "This file will be played in the browser".')
