/* Random Sudoku puzzle generator for "Load example".
 *
 * It only CREATES puzzles (a random completed grid with digits removed while the solution
 * stays unique). Solving a puzzle on the board is still done exclusively by the solver backend.
 *
 * Difficulty is decided by BOTH of these, and a puzzle only counts as an exact match when
 * it satisfies both:
 *   1. Technique: what a person would need to finish it
 *        easy   : naked singles alone are enough
 *        medium : needs at least one hidden single (naked + hidden singles are enough)
 *        hard   : naked + hidden singles are NOT enough
 *   2. Clue count: the range shown in the difficulty dialog (LEVELS below is the single
 *      source of truth; the dialog text is filled from it).
 *
 * This file runs in two places: on the page (script tag) and inside js/generator-worker.js
 * (importScripts), so it must not touch `window` or the DOM.
 *
 * Results use an explicit status:
 *   'exact'       matches the requested difficulty
 *   'approximate' valid, unique-solution puzzle, but NOT matching (see actualLevel / reason)
 *   'failed'      no valid candidate could be produced
 *   'cancelled'   the caller cancelled (start() only)
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const DLX = root.DLX || (root.DLX = {});

  const FULL = 0x3fe; // bits 1..9
  const LEVELS = {
    easy:   { label: 'Easy',   min: 40, max: 45 },
    medium: { label: 'Medium', min: 32, max: 36 },
    hard:   { label: 'Hard',   min: 24, max: 28 },
  };
  const TIME_BUDGET_MS = 2500;      // how long to keep searching for an exact match
  const HARD_TIMEOUT_MS = 15000;    // watchdog for the worker: give up and report failure
  const NODE_LIMIT = 60000;         // cap on search nodes for any single uniqueness check
  const KEY_NODE_LIMIT = 400000;    // same cap for checking a user-supplied puzzle
  const SLICE_MS = 10;              // main-thread fallback: work this long, then yield to the UI
  const WORKER_URL = 'js/generator-worker.js';

  const rand = (n) => Math.floor(Math.random() * n);
  const randBetween = (lo, hi) => lo + rand(hi - lo + 1);
  const bitCount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const clone = (g) => g.map((row) => row.slice());
  const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const now = () => Date.now();

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

  /** Count solutions, stopping at `limit` (2 is enough to test uniqueness).
   *  If `first` (an array) is passed, the first solution found is copied into first[0].
   *  If more than `nodeLimit` search nodes are needed the check is abandoned and -1 is
   *  returned, so one pathological puzzle can never block for long. */
  function countSolutions(grid, limit, first, nodeLimit = NODE_LIMIT) {
    const g = clone(grid);
    const { rows, cols, boxes } = masksFor(g);
    let count = 0, nodes = 0, aborted = false;
    function rec() {
      if (++nodes > nodeLimit) { aborted = true; return true; }
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        const r = (i / 9) | 0, c = i % 9;
        if (g[r][c]) continue;
        const m = FULL & ~(rows[r] | cols[c] | boxes[boxOf(r, c)]);
        const n = bitCount(m);
        if (n < bestN) { bestN = n; best = i; bestMask = m; if (n <= 1) break; }
      }
      if (best < 0) { if (first && count === 0) first[0] = clone(g); count++; return count >= limit; }
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
    return aborted ? -1 : count;
  }

  /** For a user-supplied puzzle: its answer key, but only if the solution is unique.
   *  count: 1 unique, 0 none, 2 several, -1 could not be decided within the node limit. */
  function answerKeyFor(grid) {
    const first = [];
    const count = countSolutions(grid, 2, first, KEY_NODE_LIMIT);
    return count === 1 ? { key: first[0], count } : { key: null, count };
  }

  /** A random, fully solved grid (null only if the node limit is hit, which is not expected). */
  function randomFullGrid() {
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    const { rows, cols, boxes } = masksFor(g);
    let nodes = 0;
    function rec() {
      if (++nodes > NODE_LIMIT) return false;
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
    return rec() ? g : null;
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

  const countClues = (g) => g.reduce((n, row) => n + row.filter((v) => v !== 0).length, 0);

  /** The difficulty a puzzle plays at, judged only by the techniques needed. */
  function assessLevel(grid) {
    if (solvableBySingles(grid, false)) return 'easy';
    if (solvableBySingles(grid, true)) return 'medium';
    return 'hard';
  }

  /** Does the puzzle satisfy BOTH the technique rule and the displayed clue range of `level`? */
  function matchesLevel(grid, level) {
    const cfg = LEVELS[level];
    if (!cfg) return false;
    const clues = countClues(grid);
    return clues >= cfg.min && clues <= cfg.max && assessLevel(grid) === level;
  }

  /** How far a candidate is from the request (0 = exact). Used to keep the closest near-miss. */
  function deviation(grid, level) {
    const cfg = LEVELS[level];
    const clues = countClues(grid);
    const outside = clues < cfg.min ? cfg.min - clues : clues > cfg.max ? clues - cfg.max : 0;
    const order = { easy: 0, medium: 1, hard: 2 };
    return Math.abs(order[assessLevel(grid)] - order[level]) * 100 + outside;
  }

  function describeMiss(grid, level) {
    const cfg = LEVELS[level];
    const clues = countClues(grid);
    const actual = assessLevel(grid);
    const parts = [];
    if (actual !== level) parts.push(`it plays like ${LEVELS[actual].label}`);
    if (clues < cfg.min || clues > cfg.max) parts.push(`it has ${clues} clues (${cfg.label} is ${cfg.min}–${cfg.max})`);
    return parts.join(' and ');
  }

  /** Cooperative generator: a function* that yields at safe points so the main thread can
   *  stay responsive, and returns the final result object. In the worker it is simply run
   *  to completion. Every digit removal is verified unique, so each candidate is valid. */
  function* generationSteps(level, budgetMs = TIME_BUDGET_MS) {
    const cfg = LEVELS[level];
    if (!cfg) return { status: 'failed', exact: false, level, reason: `Unknown level: ${level}` };
    const start = now();
    let best = null, bestDev = Infinity;
    const order = Array.from({ length: 81 }, (_, k) => k);

    for (;;) {
      const full = randomFullGrid();
      if (full) {
        const g = clone(full);
        const target = randBetween(cfg.min, cfg.max);
        let clues = 81;
        for (const i of shuffle(order.slice())) {
          if (clues <= target) break;
          const r = (i / 9) | 0, c = i % 9, v = g[r][c];
          g[r][c] = 0;
          if (countSolutions(g, 2) === 1) clues--; else g[r][c] = v; // keep only unique-solution removals
          yield;
        }
        const dev = deviation(g, level);
        if (dev === 0 && matchesLevel(g, level)) {
          return { status: 'exact', exact: true, grid: g, clues, level, actualLevel: level, key: full, reason: '' };
        }
        if (dev < bestDev) {
          bestDev = dev;
          best = { grid: clone(g), clues, key: full };
        }
      }
      if (now() - start >= budgetMs) break;
      yield;
    }

    if (!best || countSolutions(best.grid, 2) !== 1) {
      return { status: 'failed', exact: false, level, reason: 'No valid puzzle could be produced.' };
    }
    return {
      status: 'approximate', exact: false, grid: best.grid, clues: best.clues, level,
      actualLevel: assessLevel(best.grid), key: best.key, reason: describeMiss(best.grid, level),
    };
  }

  /** Synchronous version (used by the worker and by tests). */
  function generatePuzzle(level, budgetMs) {
    const it = generationSteps(level, budgetMs);
    for (;;) {
      const step = it.next();
      if (step.done) return step.value;
    }
  }

  /** Main-thread fallback when a Web Worker is unavailable: runs the same steps in short
   *  slices and yields to the event loop between them. */
  function runSliced(level, isStopped) {
    return new Promise((resolve) => {
      const it = generationSteps(level);
      (function pump() {
        if (isStopped()) return resolve({ status: 'cancelled' });
        const until = now() + SLICE_MS;
        try {
          while (now() < until) {
            const step = it.next();
            if (step.done) return resolve(step.value);
          }
        } catch (error) {
          return resolve({ status: 'failed', exact: false, level, reason: String((error && error.message) || error) });
        }
        setTimeout(pump, 0);
      })();
    });
  }

  /** Page-side entry point. Generates in a Web Worker when possible (falls back to sliced
   *  main-thread work). Returns { promise, cancel }. The promise always resolves (never
   *  rejects) with a result object whose `status` is exact | approximate | failed | cancelled. */
  function start(level) {
    let worker = null, timer = null, done = false, resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (worker) { worker.terminate(); worker = null; }
      resolveFn(result);
    }
    const fallback = () => {
      if (done) return;
      if (worker) { worker.terminate(); worker = null; }
      runSliced(level, () => done).then(finish, (e) => finish({ status: 'failed', exact: false, level, reason: String((e && e.message) || e) }));
    };

    if (typeof Worker === 'function' && typeof window !== 'undefined') {
      try {
        worker = new Worker(WORKER_URL);
        worker.onmessage = (event) => {
          const m = event.data || {};
          finish(m.ok ? m.result : { status: 'failed', exact: false, level, reason: m.message || 'Generator error.' });
        };
        worker.onerror = (event) => { if (event && event.preventDefault) event.preventDefault(); fallback(); };
        timer = setTimeout(() => finish({ status: 'failed', exact: false, level, reason: 'Generation took too long.' }), HARD_TIMEOUT_MS);
        worker.postMessage({ level });
      } catch (error) {
        fallback();
      }
    } else {
      fallback();
    }
    return { promise, cancel: () => finish({ status: 'cancelled' }) };
  }

  DLX.generator = { LEVELS, generatePuzzle, start, countSolutions, answerKeyFor, assessLevel, matchesLevel, countClues };
})();
