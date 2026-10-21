/* Plain-language explanations for each replay step. Pure functions: they read the replay
 * grid and the metadata recorded by dlx-trace.js and return text, they change nothing. */
(function () {
  'use strict';
  const DLX = window.DLX;

  const BOX_NAMES = ['top-left', 'top-middle', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-middle', 'bottom-right'];
  const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const boxLabel = (b) => `Box ${b + 1} (${BOX_NAMES[b]})`;
  const pos = (r, c) => `Row ${r + 1}, Column ${c + 1}`;
  const short = (r, c) => `R${r + 1}C${c + 1}`;
  const list = (arr) => (arr.length ? arr.join(', ') : 'nothing yet');

  /** Decode a constraint column (0..323) into a readable description. */
  function describeConstraint(col) {
    if (col < 81) {
      const r = Math.floor(col / 9), c = col % 9;
      return { type: 'cell', r, c, text: `${pos(r, c)} needs a digit` };
    }
    if (col < 162) {
      const i = col - 81, r = Math.floor(i / 9), d = (i % 9) + 1;
      return { type: 'row', r, d, text: `Row ${r + 1} needs a ${d}` };
    }
    if (col < 243) {
      const i = col - 162, c = Math.floor(i / 9), d = (i % 9) + 1;
      return { type: 'col', c, d, text: `Column ${c + 1} needs a ${d}` };
    }
    const i = col - 243, b = Math.floor(i / 9), d = (i % 9) + 1;
    return { type: 'box', b, d, text: `${boxLabel(b)} needs a ${d}` };
  }

  function unitDigits(grid, r, c) {
    const row = [], colm = [], box = [];
    const br = r - (r % 3), bc = c - (c % 3);
    for (let i = 0; i < 9; i++) {
      if (grid[r][i]) row.push(grid[r][i]);
      if (grid[i][c]) colm.push(grid[i][c]);
    }
    for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) if (grid[i][j]) box.push(grid[i][j]);
    const sort = (a) => a.sort((x, y) => x - y);
    return { row: sort(row), col: sort(colm), box: sort(box) };
  }

  /** The 3x3 box that contains (r, c), read from the grid. */
  function boxCells(grid, r, c) {
    const br = r - (r % 3), bc = c - (c % 3), cells = [];
    for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) cells.push({ r: i, c: j, v: grid[i][j] });
    return cells;
  }

  /** `grid` is the board BEFORE the placement. */
  function explainTry({ grid, r, c, d, col, options, option, filled }) {
    const b = boxOf(r, c);
    const used = unitDigits(grid, r, c);
    const blocked = new Set([...used.row, ...used.col, ...used.box]);
    const fits = [];
    for (let k = 1; k <= 9; k++) if (!blocked.has(k)) fits.push(k);
    const why = describeConstraint(col);

    let pick;
    if (why.type === 'cell') {
      pick = options === 1
        ? `Algorithm X looks for the most constrained requirement first. “${why.text}” has just one possible digit (${list(fits)}), so this move is forced.`
        : `Algorithm X looks for the most constrained requirement first: “${why.text}” has only ${options} possible digits (${list(fits)}). It tries them one at a time; this is option ${option} of ${options}.`;
    } else {
      const where = why.type === 'row' ? `Row ${why.r + 1}` : why.type === 'col' ? `Column ${why.c + 1}` : boxLabel(why.b);
      pick = options === 1
        ? `Algorithm X looks for the most constrained requirement first: “${why.text}” has only one cell left where it can go in ${where}, so this move is forced.`
        : `Algorithm X looks for the most constrained requirement first: “${why.text}” has only ${options} cells left in ${where}. This cell is option ${option} of ${options}.`;
    }

    const check = `${pos(r, c)} was empty. Its row already holds ${list(used.row)}, its column holds ${list(used.col)}, and ${boxLabel(b)} holds ${list(used.box)}. The digit ${d} is in none of them, so placing it creates no duplicate.`;
    const cover = `The placement covers 4 constraints at once: cell ${short(r, c)} is filled, and digit ${d} is used in Row ${r + 1}, Column ${c + 1} and ${boxLabel(b)}. Constraints covered so far: ${(filled + 1) * 4} of 324. It is tentative: Algorithm X cannot know yet whether it leads to a full solution.`;

    return {
      kind: 'place', r, c, d, box: b,
      entry: {
        kind: 'place', r, c, d,
        main: `${d} placed in ${pos(r, c)}, ${boxLabel(b)}`,
        because: pick,
        check: check,
        note: `Covers 4 constraints (${(filled + 1) * 4} of 324 so far). Tentative: Algorithm X cannot know yet whether it leads to a full solution.`,
      },
      title: `Place ${d} at ${pos(r, c)}`,
      sections: [
        ['Where', `Digit ${d} goes into ${pos(r, c)}, inside ${boxLabel(b)}.`],
        ['Why here', pick],
        ['Why it is valid', check],
        ['Exact cover', cover],
      ],
    };
  }

  function failText(col, type) {
    if (col < 0 || !type) return 'a later choice ran out of options.';
    const f = describeConstraint(col).text;
    return type === 1
      ? `the requirement “${f}” was left with no possible option.`
      : `every option for “${f}” was tried and each one failed.`;
  }

  /** `grid` is the board AFTER the placement was removed. */
  function explainUndo({ grid, r, c, d, failCol, failType, more }) {
    const b = boxOf(r, c);
    const nextText = more
      ? 'Algorithm X restores the 4 constraints it covered and tries the next option for the same requirement.'
      : 'No other option is left at this level, so Algorithm X restores the constraints and steps back one more level.';
    return {
      kind: 'undo', r, c, d, box: b,
      entry: {
        kind: 'undo', r, c, d,
        main: `${d} removed from ${pos(r, c)}, ${boxLabel(b)} (backtrack)`,
        because: `Placing ${d} here led to a dead end: ${failText(failCol, failType)}`,
        check: nextText,
        note: `With ${d} removed the cell is empty again and the board has no duplicates.`,
      },
      title: `Backtrack: remove ${d} from ${pos(r, c)}`,
      sections: [
        ['What happened', `Placing ${d} at ${pos(r, c)} in ${boxLabel(b)} led to a dead end deeper in the search.`],
        ['Why', `Further on, ${failText(failCol, failType)}`],
        ['What next', more
          ? 'Algorithm X restores the 4 constraints it covered (Dancing Links re-links them in constant time) and tries the next option for the same requirement.'
          : 'No other option is left at this level, so Algorithm X restores the constraints and steps back one more level.'],
        ['Still valid', `With ${d} removed, ${pos(r, c)} is empty again and the board contains no duplicates.`],
      ],
    };
  }

  function explainStart({ givens }) {
    return {
      kind: 'start', r: -1, c: -1, d: 0, box: -1,
      title: 'Starting position',
      sections: [
        ['Setup', `The board has ${givens} given digit${givens === 1 ? '' : 's'}, already covering ${givens * 4} of the 324 constraints.`],
        ['Method', 'Algorithm X repeatedly picks the requirement with the fewest options, tries one, and backtracks if it reaches a dead end.'],
        ['Controls', 'Use Play, Step or the speed buttons. Each move is explained here as it happens.'],
      ],
    };
  }

  function explainDone({ solved, truncated, tries, undos }) {
    return {
      kind: 'done', r: -1, c: -1, d: 0, box: -1,
      title: solved ? 'Solution reached' : truncated ? 'Replay stopped early' : 'No solution',
      sections: solved ? [
        ['Result', 'All 81 cells are filled.'],
        ['Why it is correct', 'Every one of the 324 constraints is covered exactly once, which means each cell has one digit and each row, column and box contains 1–9 exactly once.'],
        ['Effort', `${tries.toLocaleString('en-US')} placements were tried and ${undos.toLocaleString('en-US')} were backtracked.`],
      ] : [
        ['Result', truncated ? 'The replay limit was reached before a solution was found.' : 'Every option was tried and none covered all constraints.'],
      ],
    };
  }

  /** Rebuild a readable order of placements from a finished solution (the backend's result).
   *  For each digit the simplest rule that explains it is used: a naked single, a hidden
   *  single, or (if neither applies) the solver's search. Nothing here solves the puzzle:
   *  the digits themselves always come from `solution`. */
  function buildSolveSteps(board, solution) {
    const g = board.map((row) => row.slice());
    const steps = [];
    const candidates = (r, c) => {
      const u = unitDigits(g, r, c);
      const blocked = new Set([...u.row, ...u.col, ...u.box]);
      const out = [];
      for (let k = 1; k <= 9; k++) if (!blocked.has(k)) out.push(k);
      return out;
    };
    const units = [];
    for (let i = 0; i < 9; i++) {
      units.push({ type: 'row', i, cells: Array.from({ length: 9 }, (_, k) => [i, k]) });
      units.push({ type: 'col', i, cells: Array.from({ length: 9 }, (_, k) => [k, i]) });
      const br = Math.floor(i / 3) * 3, bc = (i % 3) * 3;
      units.push({ type: 'box', i, cells: Array.from({ length: 9 }, (_, k) => [br + Math.floor(k / 3), bc + (k % 3)]) });
    }
    const unitName = (u) => (u.type === 'row' ? `Row ${u.i + 1}` : u.type === 'col' ? `Column ${u.i + 1}` : boxLabel(u.i));

    const emptyCount = () => g.reduce((n, row) => n + row.filter((v) => !v).length, 0);
    while (emptyCount() > 0) {
      let pick = null;

      for (let r = 0; r < 9 && !pick; r++) {
        for (let c = 0; c < 9 && !pick; c++) {
          if (g[r][c]) continue;
          const cand = candidates(r, c);
          if (cand.length === 1 && cand[0] === solution[r][c]) pick = { r, c, d: cand[0], how: 'naked' };
        }
      }
      for (let k = 0; k < units.length && !pick; k++) {
        const u = units[k];
        for (let d = 1; d <= 9 && !pick; d++) {
          if (u.cells.some(([r, c]) => g[r][c] === d)) continue;
          const spots = u.cells.filter(([r, c]) => !g[r][c] && candidates(r, c).includes(d));
          if (spots.length === 1 && solution[spots[0][0]][spots[0][1]] === d) pick = { r: spots[0][0], c: spots[0][1], d, how: 'hidden', unit: u };
        }
      }
      if (!pick) {
        let best = null;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
          if (g[r][c]) continue;
          const n = candidates(r, c).length;
          if (!best || n < best.n) best = { r, c, n };
        }
        pick = { r: best.r, c: best.c, d: solution[best.r][best.c], how: 'search' };
      }

      const { r, c, d, how } = pick;
      const b = boxOf(r, c);
      const used = unitDigits(g, r, c);
      const check = `Row ${r + 1} holds ${list(used.row)}; Column ${c + 1} holds ${list(used.col)}; ${boxLabel(b)} holds ${list(used.box)}. ${d} is in none of them, so it creates no duplicate.`;
      let because;
      if (how === 'naked') {
        because = `It is the only digit that fits ${pos(r, c)}: the digits already in its row, column and box rule out every other digit.`;
      } else if (how === 'hidden') {
        because = `In ${unitName(pick.unit)}, the digit ${d} has only one cell left where it can go, and this is that cell.`;
      } else {
        because = `No single-step rule decides this cell, so the digit comes from the solver's search result. ${d} is the value that completes the grid.`;
      }
      steps.push({
        kind: 'place', r, c, d,
        main: `${d} placed in ${pos(r, c)}, ${boxLabel(b)}`,
        because, check,
        note: how === 'search' ? 'Taken directly from the backend solution.' : '',
      });
      g[r][c] = d;
    }
    return steps;
  }

  DLX.explain = { buildSolveSteps, explainTry, explainUndo, explainStart, explainDone, describeConstraint, boxCells, boxLabel, short };
})();
