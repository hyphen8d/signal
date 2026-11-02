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
//                           putGlyph effects). program.test's "every
//                           effect draws without throwing" is NOT picked --
//                           the full suite is where that one earns its keep.
//   stations.js          -> tests that name stations.js, plus roster.test
//                           (which runs the lint). A roster edit reaches every
//                           harness boot, but what it usually breaks is lint.
//   README.md            -> roster.test (lint asserts README's roster line),
//                           roster-lib.test (the counts rewriter round-trips it).
//   .gitignore           -> admin-server.test (it checks what is ignored).
//   tools/..., tests/<helper>.mjs, package.json, tools/*.json, build.json
//                        -> every test file that names it (by basename, with a
//                           path or quote boundary so `roster.mjs` does not
//                           match `check-roster.mjs`), PLUS every test that
//                           reaches it through tools/ and tests/ (see
//                           dependents() below), and every test naming one
//                           of those. A tool nothing reaches is reported,
//                           not escalated: shoot.mjs has no tests and
//                           running all 650 would not test it.
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

// 2026-11-01 (audit L6) -- naming alone missed every library: no test
// names tools/lib/git-checks.mjs or tools/stamp.js, yet admin-writes and
// ship drive both; probe.mjs reached only probe.test, not the
// health-wiring and roster-watch tests that run it through check-roster.
// So tools/ and tests/ helpers are read as a graph -- a file depends on
// what it imports (static, `export from`, literal `import()`, relative
// specifiers only, the `?v=` query cut off) and on any `tools/<x>` path
// it spells out as a string, which is how the admin server's TASKS and
// the tests' spawns run a tool -- and a change maps to everything that
// reaches it. App code is not in the graph: it has its own branches above
// and below, and an edge from a tool into app code would point the wrong
// way for this question anyway. Comment lines are skipped, so a header
// that MENTIONS a tool is not an edge. One read of ~90 files: milliseconds.
let graph = null
const isCode = (f) => /\.(m?js)$/.test(f)
function listGraphFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const r = `${dir}/${e.name}`
      if (e.isDirectory()) walk(r)
      else if (isCode(e.name)) out.push(r)
    }
  }
  walk('tools')
  for (const f of readdirSync(path.join(ROOT, 'tests'))) if (f.endsWith('.mjs')) out.push(`tests/${f}`)
  return out
}
/** ROOT-relative files under tools/ or tests/ that `file` imports or spawns. */
export function dependenciesOf(file, src) {
  const deps = new Set()
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const add = (r) => { if (/^(tools|tests)\//.test(r) && isCode(r) && r !== file && existsSync(path.join(ROOT, r))) deps.add(r) }
  const dir = path.posix.dirname(file)
  // Relative module specifiers: from './x', import('./x'), import(`../x?v=${V}`).
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"`](\.{1,2}\/[^'"`?$]+)/g)) {
    add(path.posix.normalize(`${dir}/${m[1]}`))
  }
  // A tool path as a process argument -- first in an argv array, or joined
  // onto a root: ['tools/x.mjs', ...], ['node', ['tools/x.js']],
  // path.join(root, 'tools/x.mjs'). Only argv-shaped strings: a tool path
  // in a message or a `changed.includes(...)` check is not a dependency.
  for (const m of code.matchAll(/(?:\[\s*|path\.join\([^,()]+,\s*)['"`](?:\.\.\/|\/)*(tools\/[\w./-]+\.m?js)\b/g)) add(m[1])
  // path.join(..., 'tools', 'x.mjs') -- the tests' way of spawning one.
  for (const m of code.matchAll(/'tools'\s*,\s*'([\w.-]+\.m?js)'/g)) add(`tools/${m[1]}`)
  return [...deps]
}
/** Every file in the graph that reaches `file`, directly or not. */
export function dependents(file) {
  if (!graph) {
    graph = new Map()                         // file -> files that depend on it
    for (const f of listGraphFiles()) {
      for (const d of dependenciesOf(f, readFileSync(path.join(ROOT, f), 'utf8'))) {
        if (!graph.has(d)) graph.set(d, new Set())
        graph.get(d).add(f)
      }
    }
  }
  const seen = new Set()
  const queue = [file]
  while (queue.length) {
    for (const up of graph.get(queue.shift()) ?? []) if (!seen.has(up)) { seen.add(up); queue.push(up) }
  }
  seen.delete(file)
  return [...seen].sort()
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
  // 2026-11-01: + roster-lib.test, whose README-counts rewriter round-trips the real README.
  if (f === 'README.md') return { tests: ['tests/roster.test.mjs', 'tests/roster-lib.test.mjs'], why: "lint asserts README's roster sentence; the counts rewriter round-trips it" }
  if (f === '.gitignore') return { tests: ['tests/admin-server.test.mjs'], why: 'admin-server.test checks what git ignores' }
  if (/^(tools\/|tests\/[^/]+\.mjs$|package\.json$|build\.json$)/.test(f)) {
    const named = testsNaming(f)
    const via = isCode(f) ? dependents(f) : []
    const t = [...new Set([
      ...named,
      ...via.filter((d) => /^tests\/[^/]+\.test\.mjs$/.test(d)),
      ...via.filter((d) => !d.startsWith('tests/')).flatMap(testsNaming),
    ])].sort()
    const why = !t.length ? 'nothing names or reaches it -- nothing to run for this one'
      : t.length === named.length ? 'tests that name it'
      : `tests that name it or reach it (via ${via.filter((d) => !/\.test\.mjs$/.test(d)).map((d) => path.posix.basename(d)).join(', ') || 'direct imports'})`
    return { tests: t, why }
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
