#!/usr/bin/env node
// tools/test-quick.mjs -- `npm run test:quick`: run only the tests that what
// you changed can plausibly break (2026-10-20, test-speed pass).
//
// THE QUICK LOOP IS FOR ITERATING. THE FULL SUITE IS FOR MERGING. Nothing
// here replaces `npm test` before a merge, a SHIP or a PR: the mapping below
// is a guess about reach, and a guess is exactly what a full run exists to
// overrule. (SHIP and PREFLIGHT in the dashboard always run everything.)
//
//   npm run test:quick                   # what differs from origin/main
//   npm run test:quick -- frost          # tests/*frost*.test.mjs
//   npm run test:quick -- visuals/frost.js tools/probe.mjs
//   npm run test:quick -- --dry-run      # print the choice, run nothing
//
// "What changed", with no arguments, is the union of three things, because
// any one alone misses work in progress: `git diff --name-only
// origin/main...HEAD` (committed on this branch; falls back to `main` when
// there is no origin/main), `git diff --name-only HEAD` (staged and unstaged)
// and untracked files git does not ignore.
//
// The mapping, and why each line is shaped the way it is:
//
//   tests/<x>.test.mjs   -> itself.
//   visuals/<k>.js       -> tests/visual-<k>.test.mjs, plus tests/visuals.test.mjs
//                           (re-entry and odd-width checks across effects)
//                           and tests/lazy-raster.test.mjs (it rasters the
//                           five putGlyph effects). program.test's "every
//                           effect draws without throwing" is NOT picked --
//                           the full suite is where that one earns its keep.
//   stations.js          -> tests that name stations.js, plus roster.test
//                           (which runs the lint). A roster edit reaches every
//                           harness boot, but what it usually breaks is lint.
//   README.md            -> roster.test (lint asserts README's roster line).
//   .gitignore           -> admin-server.test (it checks what is ignored).
//   tools/..., tests/<helper>.mjs, package.json, tools/*.json, build.json
//                        -> every test file that names it (by basename, with a
//                           path or quote boundary so `roster.mjs` does not
//                           match `check-roster.mjs`). A tool no test names
//                           is reported, not escalated: shoot.mjs has no
//                           tests and running all 650 would not test it.
//   docs, images, audio clips, fonts, stations.md -> nothing to run.
//   ANYTHING ELSE        -> the full suite, and it says which file forced it.
//                           That is program.js, config.js, src/, ui/,
//                           audio/*.js, visualizer.js, visuals/index.js and
//                           shared.js, tests/harness.mjs ... -- app code that
//                           every harness boot imports, where no subset is
//                           honest.
//
// The suite runs with the same NODE_COMPILE_CACHE as `npm test` (see
// package.json and TASKS.test in tools/admin-server.mjs).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/')
const TESTS = readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`)
const ALL = 'ALL'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let sources = null
/** Test files whose source names `file` -- by its repo path, or by its
 *  basename behind a path separator or a quote. */
function testsNaming(file) {
  sources ??= new Map(TESTS.map((t) => [t, readFileSync(path.join(ROOT, t), 'utf8')]))
  const base = path.posix.basename(file)
  const re = new RegExp(`(^|[/'"\`\\s(])${escapeRe(base)}($|[^\\w.-])`, 'm')
  return TESTS.filter((t) => t !== file && (sources.get(t).includes(file) || re.test(sources.get(t))))
}

/** -> { tests: string[] | ALL, why: string } for one changed file. */
export function mapFile(file) {
  const f = rel(file)
  let m
  if ((m = /^tests\/[^/]+\.test\.mjs$/.exec(f))) return { tests: [f], why: 'a test file: runs itself' }
  if (f === 'tests/harness.mjs') return { tests: ALL, why: 'the harness: every boot goes through it' }
  if ((m = /^visuals\/([\w-]+)\.js$/.exec(f)) && !['index', 'shared'].includes(m[1])) {
    const own = `tests/visual-${m[1]}.test.mjs`
    return {
      tests: [own, 'tests/visuals.test.mjs', 'tests/lazy-raster.test.mjs'],
      why: `effect '${m[1]}': its own test, the cross-effect checks, the raster equivalence`,
    }
  }
  if (f === 'stations.js') return { tests: [...new Set([...testsNaming(f), 'tests/roster.test.mjs'])], why: 'the roster: lint + the tests that read stations.js' }
  if (f === 'README.md') return { tests: ['tests/roster.test.mjs'], why: "lint asserts README's roster sentence" }
  if (f === '.gitignore') return { tests: ['tests/admin-server.test.mjs'], why: 'admin-server.test checks what git ignores' }
  if (/^(tools\/|tests\/[^/]+\.mjs$|package\.json$|build\.json$)/.test(f)) {
    const t = testsNaming(f)
    return { tests: t, why: t.length ? 'tests that name it' : 'no test names it -- nothing to run for this one' }
  }
  if (/\.(md|png|jpe?g|gif|mp4|mp3|svg|bdf|ico|webmanifest)$/i.test(f) || /^(screenshots|fonts|\.github|dist)\//.test(f) || ['LICENSE', 'NOTICE', 'manifest.json'].includes(f)) {
    return { tests: [], why: 'docs or assets: no test reads it' }
  }
  return { tests: ALL, why: 'app code every harness boot imports -- no honest subset' }
}

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean) }
  catch { return null }
}

function changedFiles() {
  const base = git(['rev-parse', '--verify', '-q', 'origin/main']) ? 'origin/main' : (git(['rev-parse', '--verify', '-q', 'main']) ? 'main' : null)
  const branch = base ? (git(['diff', '--name-only', `${base}...HEAD`]) ?? []) : []
  const local = git(['diff', '--name-only', 'HEAD']) ?? []
  const untracked = git(['ls-files', '--others', '--exclude-standard']) ?? []
  return { base, files: [...new Set([...branch, ...local, ...untracked])].sort() }
}

function main(argv) {
  const dry = argv.includes('--dry-run') || argv.includes('--list')
  const args = argv.filter((a) => !a.startsWith('--'))
  const reasons = [] // [label, tests | ALL, why]

  if (args.length) {
    for (const a of args) {
      if (existsSync(path.resolve(ROOT, a)) || existsSync(path.resolve(a))) {
        const p = existsSync(path.resolve(a)) ? path.relative(ROOT, path.resolve(a)) : a
        const { tests, why } = mapFile(p)
        reasons.push([rel(p), tests, why])
      } else {
        const hits = TESTS.filter((t) => path.posix.basename(t).includes(a))
        if (!hits.length) {
          console.error(`test:quick: "${a}" is neither a path nor part of any tests/*.test.mjs name`)
          return 2
        }
        reasons.push([`"${a}"`, hits, 'test files whose name contains it'])
      }
    }
  } else {
    const { base, files } = changedFiles()
    console.log(`test:quick: changes against ${base ?? '(no origin/main or main -- uncommitted only)'} + uncommitted + untracked`)
    if (!files.length) {
      console.log('test:quick: nothing changed -- name tests or files to run (e.g. `npm run test:quick -- frost`).')
      return 0
    }
    for (const f of files) {
      const { tests, why } = mapFile(f)
      reasons.push([f, tests, why])
    }
  }

  const forcing = reasons.filter(([, t]) => t === ALL)
  for (const [label, tests, why] of reasons) {
    const what = tests === ALL ? 'FULL SUITE' : tests.length ? tests.map((t) => path.posix.basename(t)).join(', ') : '-'
    console.log(`  ${label}\n      -> ${what}   (${why})`)
  }
  let chosen
  if (forcing.length) {
    console.log(`test:quick: ${forcing.map(([l]) => l).join(', ')} cannot be mapped to a subset -- running the full suite.`)
    chosen = TESTS
  } else {
    chosen = [...new Set(reasons.flatMap(([, t]) => t))].filter((t) => existsSync(path.join(ROOT, t))).sort()
  }
  if (!chosen.length) {
    console.log('test:quick: no tests to run for these changes.')
    return 0
  }
  console.log(`test:quick: ${chosen.length} of ${TESTS.length} test files. Quick loop only -- run the full suite (npm test) before merging.`)
  if (dry) return 0
  const r = spawnSync(process.execPath, ['--test', ...chosen], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ?? path.join(ROOT, '.node-compile-cache') },
  })
  return r.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
