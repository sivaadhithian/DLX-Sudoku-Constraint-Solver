/* Dependency-free tests for the pure frontend logic. Run:  node frontend/tests/run-tests.js
 * (UI behaviour that needs a DOM is not covered here.) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

global.window = {}; window.DLX = {};
const js = (f) => path.join(__dirname, '..', 'js', f);
require(js('generator.js'));
const G = window.DLX.generator;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

console.log('generator');
test('dialog ranges in index.html are generated from LEVELS (no hard-coded numbers)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const level of Object.keys(G.LEVELS)) {
    assert.match(html, new RegExp(`data-range="${level}"`), `missing data-range for ${level}`);
  }
  assert.doesNotMatch(html, /About \d+–\d+ clues/, 'hard-coded clue range found in index.html');
});

for (const level of ['easy', 'medium', 'hard']) {
  test(`${level}: exact results satisfy clue range AND technique rule, and are unique`, () => {
    const cfg = G.LEVELS[level];
    let exact = 0;
    for (let i = 0; i < 8; i++) {
      const r = G.generatePuzzle(level);
      assert.ok(['exact', 'approximate'].includes(r.status), `unexpected status ${r.status}`);
      assert.equal(r.exact, r.status === 'exact');
      assert.equal(G.countSolutions(r.grid, 2), 1, 'puzzle must have exactly one solution');
      assert.equal(G.countClues(r.grid), r.clues);
      assert.equal(G.countSolutions(r.grid, 2, null) === 1 && r.key.every((row, rr) => row.every((v, c) => !r.grid[rr][c] || r.grid[rr][c] === v)), true, 'key agrees with clues');
      if (r.exact) {
        exact++;
        assert.ok(r.clues >= cfg.min && r.clues <= cfg.max, `${level} had ${r.clues} clues`);
        assert.equal(G.assessLevel(r.grid), level);
        assert.ok(G.matchesLevel(r.grid, level));
      } else {
        assert.ok(r.reason, 'approximate result must explain how it misses');
        assert.ok(!G.matchesLevel(r.grid, level), 'approximate result must not match the criteria');
      }
    }
    assert.ok(exact >= 6, `only ${exact}/8 exact matches`);
  });
}

test('matchesLevel rejects out-of-range clue counts and wrong techniques', () => {
  const key = G.generatePuzzle('easy').key;
  assert.equal(G.matchesLevel(key, 'easy'), false, 'a full grid has 81 clues');
  const hard = G.generatePuzzle('hard');
  if (hard.exact) assert.equal(G.matchesLevel(hard.grid, 'easy'), false);
});

test('a zero time budget still returns a valid, honestly-labelled result', () => {
  const r = G.generatePuzzle('hard', 0);
  assert.ok(['exact', 'approximate'].includes(r.status));
  assert.equal(G.countSolutions(r.grid, 2), 1);
  if (r.status === 'approximate') assert.equal(r.exact, false);
});

test('uniqueness check gives up (-1) instead of running forever', () => {
  const empty = Array.from({ length: 9 }, () => Array(9).fill(0));
  assert.equal(G.countSolutions(empty, 2, null, 5), -1);
  assert.equal(G.answerKeyFor(empty).key, null);
});

test('unknown level fails safely', () => {
  const r = G.generatePuzzle('impossible');
  assert.equal(r.status, 'failed');
});

console.log('explain / trace');
window.DLX.constants = { SIZE: 9 };
require(js('dlx-trace.js'));
require(js('explain.js'));
test('buildSolveSteps places every empty cell with the solution digit and never invents digits', () => {
  const r = G.generatePuzzle('medium');
  const steps = window.DLX.explain.buildSolveSteps(r.grid, r.key);
  const empties = r.grid.flat().filter((v) => v === 0).length;
  assert.equal(steps.length, empties);
  for (const s of steps) assert.equal(s.d, r.key[s.r][s.c]);
});
test('trace replay reaches a valid solution and records reasons for each move', () => {
  const r = G.generatePuzzle('hard');
  const t = window.DLX.buildTrace(r.grid);
  assert.ok(t.solved);
  assert.equal(t.cols.length, t.events.length);
  const g = r.grid.map((row) => row.slice());
  for (const ev of t.events) {
    const undo = ev >= 729, x = ev % 729, d = (x % 9) + 1, cell = (x - (d - 1)) / 9;
    g[Math.floor(cell / 9)][cell % 9] = undo ? 0 : d;
  }
  assert.deepEqual(g, r.key);
});

console.log('algorithmic visualisation engine');
require(js('algo-engine.js'));
const A = window.DLX.algo;
function runAll(m, cap = 3e6) {
  const it = A.run(m); let n = 0, last = null; const placed = new Set();
  for (let s = it.next(); !s.done && n < cap; s = it.next()) {
    n++; last = s.value;
    if (last.place !== undefined) placed.add(last.place);
    if (last.unplace !== undefined) placed.delete(last.unplace);
    for (const g of last.glows) assert.ok(g.node >= 0 && g.node < m.nodeCount && 'LRUD'.includes(g.dir), 'glow refers to a real pointer');
  }
  return { n, last, placed };
}
test('sample matrix matches the reference diagram (column sizes 2,2,2,3,2,2,4)', () => {
  const { matrix } = A.sampleMatrix();
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((i) => matrix.S[i]), [2, 2, 2, 3, 2, 2, 4]);
});
test('sample run finds the known exact cover (rows 2, 4 and 6)', () => {
  const { matrix } = A.sampleMatrix();
  const { last, placed } = runAll(matrix);
  assert.equal(last.phase, 'solution');
  assert.deepEqual([...placed].sort(), [1, 3, 5]);
});
test('pointer-level run on a generated puzzle ends in a valid solution', () => {
  const r = G.generatePuzzle('medium');
  const { matrix } = A.puzzleMatrix(r.grid);
  const { last, placed } = runAll(matrix);
  assert.equal(last.phase, 'solution');
  const out = r.grid.map((row) => row.slice());
  for (const ri of placed) { const { r: rr, c, d } = matrix.rows[ri].meta; out[rr][c] = d; }
  assert.deepEqual(out, r.key);
});
test('a search with no solution restores every pointer (dancing links invariant)', () => {
  const make = () => A.createMatrix([{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    [{ label: 'r1', cols: [0, 1] }, { label: 'r2', cols: [1, 2] }]); // no exact cover exists
  const m = make();
  const before = JSON.stringify([m.L, m.R, m.U, m.D, m.S]);
  const { last } = runAll(m);
  assert.notEqual(last.phase, 'solution');
  assert.equal(JSON.stringify([m.L, m.R, m.U, m.D, m.S]), before);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
