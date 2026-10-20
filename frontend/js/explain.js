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
    return {
      kind: 'undo', r, c, d, box: b,
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

  DLX.explain = { explainTry, explainUndo, explainStart, explainDone, describeConstraint, boxCells, boxLabel, short };
})();
