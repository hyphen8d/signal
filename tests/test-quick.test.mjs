// tools/test-quick.mjs's mapping (2026-10-20). The quick loop is only as
// good as its guess about reach, and its one dangerous failure is quiet: a
// file that should force the full suite getting a small subset instead.
// So the escalations are pinned here alongside the narrow mappings.
//
// Run: node --test tests/

import test from 'node:test'
import assert from 'node:assert/strict'
import { mapFile, dependenciesOf } from '../tools/test-quick.mjs'

test('test:quick maps effects, tests and tools to their own tests', () => {
  assert.deepEqual(mapFile('visuals/frost.js').tests, ['tests/visual-frost.test.mjs', 'tests/visuals.test.mjs', 'tests/lazy-raster.test.mjs'])
  assert.deepEqual(mapFile('tests/game.test.mjs').tests, ['tests/game.test.mjs'])
  assert.ok(mapFile('stations.js').tests.includes('tests/roster.test.mjs'))
  assert.ok(mapFile('tools/lib/roster.mjs').tests.includes('tests/roster-lib.test.mjs'))
  // The boundary: lib/roster.mjs must not pull in every test that names
  // check-roster.mjs, and vice versa.
  assert.ok(!mapFile('tools/lib/roster.mjs').tests.includes('tests/health-wiring.test.mjs'))
  assert.ok(mapFile('tools/check-roster.mjs').tests.includes('tests/health-wiring.test.mjs'))
  assert.deepEqual(mapFile('CLAUDE.md').tests, [])
})

test('test:quick falls back to the full suite for anything every boot imports', () => {
  for (const f of ['program.js', 'config.js', 'src/term.js', 'ui/desktop.js', 'audio/voice.js', 'visualizer.js', 'visuals/index.js', 'visuals/shared.js', 'tests/harness.mjs', 'index.html']) {
    assert.equal(mapFile(f).tests, 'ALL', `${f} must force the full suite`)
  }
})

// 2026-11-01 (audit L6) -- a library reaches the tests that drive it through
// a tool, not only the tests that spell its name. Before this, the first two
// mapped to nothing at all.
test('test:quick follows imports and tool spawns, not only names', () => {
  const reach = (f, ...want) => {
    const got = mapFile(f).tests
    for (const w of want) assert.ok(got.includes(`tests/${w}.test.mjs`), `${f} should reach ${w}: got ${got.join(', ')}`)
  }
  reach('tools/lib/git-checks.mjs', 'admin-writes', 'ship')            // imported by admin-server and ship.mjs
  reach('tools/stamp.js', 'admin-writes')                              // spawned by admin-server's TASKS
  reach('tools/lib/probe.mjs', 'probe', 'health-wiring', 'roster-watch') // through check-roster, spawned by roster-watch
  reach('tools/lib/roster.mjs', 'roster-lib', 'admin-writes')
  // Still a subset: a mention in a message is not an edge.
  assert.ok(!mapFile('tools/lib/capture.mjs').tests.includes('tests/program.test.mjs'))
  assert.deepEqual(dependenciesOf('tools/x.mjs', "say(`tools/ship.mjs: no`)\n// node tools/stamp.js\nspawn('node', ['tools/stamp.js'])\nimport { a } from './lib/stamp.mjs?v=1'\n").sort(),
    ['tools/lib/stamp.mjs', 'tools/stamp.js'])
})
