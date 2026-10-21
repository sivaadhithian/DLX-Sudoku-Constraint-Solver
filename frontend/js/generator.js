/* Random Sudoku puzzle generator for "Load example".
 *
 * It only CREATES puzzles (a random completed grid with digits removed while the solution
 * stays unique). The solution it uses internally is thrown away. Solving a puzzle on the
 * board is still done exclusively by the solver backend.
 *
 * Difficulty is decided by how a person would have to solve it:
 *   easy   : lots of clues; solvable with naked singles alone
 *   medium : solvable with naked + hidden singles, but needs at least one hidden single
 *   hard   : few clues; naked + hidden singles are NOT enough
 */
(function () {
  'use strict';
  const DLX = window.DLX;

  const FULL = 0x3fe; // bits 1..9
  const LEVELS = {
    easy:   { label: 'Easy',   min: 40, max: 45 },
    medium: { label: 'Medium', min: 32, max: 36 },
    hard:   { label: 'Hard',   min: 24, max: 28 },
  };
  const TIME_BUDGET_MS = 2500;

  const rand = (n) => Math.floor(Math.random() * n);
  const randBetween = (lo, hi) => lo + rand(hi - lo + 1);
  const bitCount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const clone = (g) => g.map((row) => row.slice());
  const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function masksFor(g) {
    const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = g[r][c];
        if (!v) continue;
        const bit = 1 << v;
        rows[r] |= bit; cols[c] |= bit; boxes[boxOf(r, c)] |= bit;
      }
    }
    return { rows, cols, boxes };
  }

  /** Count solutions, stopping at `limit` (2 is enough to test uniqueness). */
  function countSolutions(grid, limit) {
    const g = clone(grid);
    const { rows, cols, boxes } = masksFor(g);
    let count = 0;
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        const r = (i / 9) | 0, c = i % 9;
        if (g[r][c]) continue;
        const m = FULL & ~(rows[r] | cols[c] | boxes[boxOf(r, c)]);
        const n = bitCount(m);
        if (n < bestN) { bestN = n; best = i; bestMask = m; if (n <= 1) break; }
      }
      if (best < 0) { count++; return count >= limit; }
      if (bestN === 0) return false;
      const r = (best / 9) | 0, c = best % 9, b = boxOf(r, c);
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[r][c] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        const stop = rec();
        g[r][c] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (stop) return true;
      }
      return false;
    }
    rec();
    return count;
  }

  /** A random, fully solved grid. */
  function randomFullGrid() {
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    const { rows, cols, boxes } = masksFor(g);
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        const r = (i / 9) | 0, c = i % 9;
        if (g[r][c]) continue;
        const m = FULL & ~(rows[r] | cols[c] | boxes[boxOf(r, c)]);
        const n = bitCount(m);
        if (n < bestN) { bestN = n; best = i; bestMask = m; if (n <= 1) break; }
      }
      if (best < 0) return true;
      if (bestN === 0) return false;
      const r = (best / 9) | 0, c = best % 9, b = boxOf(r, c);
      for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[r][c] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (rec()) return true;
        g[r][c] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    }
    rec();
    return g;
  }

  /** Can the puzzle be finished with singles? (hidden singles only if allowHidden) */
  function solvableBySingles(grid, allowHidden) {
    const g = clone(grid);
    const cand = (r, c) => {
      let used = 0;
      for (let i = 0; i < 9; i++) { used |= 1 << g[r][i]; used |= 1 << g[i][c]; }
      const br = r - (r % 3), bc = c - (c % 3);
      for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) used |= 1 << g[i][j];
      return FULL & ~used;
    };
    for (;;) {
      let progress = false, empty = 0;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c]) continue;
          const m = cand(r, c);
          if (bitCount(m) === 1) { g[r][c] = Math.log2(m); progress = true; }
        }
      }
      if (!progress && allowHidden) {
        const units = [];
        for (let i = 0; i < 9; i++) {
          units.push(Array.from({ length: 9 }, (_, k) => [i, k]));
          units.push(Array.from({ length: 9 }, (_, k) => [k, i]));
          const br = Math.floor(i / 3) * 3, bc = (i % 3) * 3;
          units.push(Array.from({ length: 9 }, (_, k) => [br + Math.floor(k / 3), bc + (k % 3)]));
        }
        for (const unit of units) {
          for (let d = 1; d <= 9; d++) {
            if (unit.some(([r, c]) => g[r][c] === d)) continue;
            const spots = unit.filter(([r, c]) => !g[r][c] && (cand(r, c) & (1 << d)));
            if (spots.length === 1) { g[spots[0][0]][spots[0][1]] = d; progress = true; }
          }
        }
      }
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!g[r][c]) empty++;
      if (empty === 0) return true;
      if (!progress) return false;
    }
  }

  function removeDigits(full, target) {
    const g = clone(full);
    let clues = 81;
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k))) {
      if (clues <= target) break;
      const r = (i / 9) | 0, c = i % 9, v = g[r][c];
      g[r][c] = 0;
      if (countSolutions(g, 2) === 1) clues--; else g[r][c] = v;
    }
    return { grid: g, clues };
  }

  const fits = {
    easy: (g, clues, cfg) => clues >= cfg.min && clues <= cfg.max + 1 && solvableBySingles(g, false),
    medium: (g, clues, cfg) => clues >= cfg.min - 1 && clues <= cfg.max + 2 && !solvableBySingles(g, false) && solvableBySingles(g, true),
    hard: (g, clues, cfg) => clues <= cfg.max + 3 && !solvableBySingles(g, true),
  };

  /** @param {'easy'|'medium'|'hard'} level  @returns {{grid:number[][], clues:number, level:string, exact:boolean}} */
  function generatePuzzle(level) {
    const cfg = LEVELS[level];
    if (!cfg) throw new Error(`Unknown level: ${level}`);
    const start = Date.now();
    let fallback = null;
    do {
      const { grid, clues } = removeDigits(randomFullGrid(), randBetween(cfg.min, cfg.max));
      if (fits[level](grid, clues, cfg)) return { grid, clues, level, exact: true };
      fallback = { grid, clues, level, exact: false }; // unique, just not a perfect fit
    } while (Date.now() - start < TIME_BUDGET_MS);
    return fallback;
  }

  DLX.generator = { generatePuzzle, countSolutions, LEVELS };
})();
