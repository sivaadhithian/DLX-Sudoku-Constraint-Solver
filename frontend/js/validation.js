/* Rule checking for the CURRENT board. This is not a solver: it only finds duplicates. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE, BOX } = DLX.constants;

  /** Decide what a key press means for the selected cell. */
  function interpretKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return { action: 'ignore' };
    const key = event.key;

    if (key === 'Backspace' || key === 'Delete') return { action: 'clear' };
    if (/^[1-9]$/.test(key)) return { action: 'set', digit: Number(key) };
    if (key === '0') {
      return { action: 'reject', message: '0 isn’t a valid entry. Use 1–9, or press Backspace to clear the cell.' };
    }
    if (key.length === 1) {
      const shown = key === ' ' ? 'Space' : `“${key}”`;
      return { action: 'reject', message: `${shown} isn’t a valid entry. Use the digits 1–9.` };
    }
    return { action: 'ignore' }; // Tab, Shift, Escape, F-keys; arrows are handled in input.js
  }

  /** Cells (as r * 9 + c) whose digit repeats in their row, column or box. Empty cells never conflict. */
  function findConflicts(grid) {
    const conflicts = new Set();

    function checkUnit(cells) {
      const firstSeen = new Map(); // digit -> index of first cell holding it
      for (const [r, c] of cells) {
        const digit = grid[r][c];
        if (digit === 0) continue;
        const index = r * SIZE + c;
        if (firstSeen.has(digit)) {
          conflicts.add(firstSeen.get(digit));
          conflicts.add(index);
        } else {
          firstSeen.set(digit, index);
        }
      }
    }

    for (let i = 0; i < SIZE; i++) {
      checkUnit(Array.from({ length: SIZE }, (_, k) => [i, k])); // row i
      checkUnit(Array.from({ length: SIZE }, (_, k) => [k, i])); // column i
    }
    for (let br = 0; br < SIZE; br += BOX) {
      for (let bc = 0; bc < SIZE; bc += BOX) {
        const cells = [];
        for (let r = br; r < br + BOX; r++) for (let c = bc; c < bc + BOX; c++) cells.push([r, c]);
        checkUnit(cells);
      }
    }
    return conflicts;
  }

  /**
   * Classify a board. Only 'conflict' and 'complete' are rule facts; 'empty' and
   * 'incomplete' say nothing about whether a solution exists.
   */
  function assessBoard(grid) {
    const conflicts = findConflicts(grid);
    const filled = grid.reduce((n, row) => n + row.filter((v) => v !== 0).length, 0);
    let state = 'incomplete';
    if (conflicts.size > 0) state = 'conflict';
    else if (filled === 0) state = 'empty';
    else if (filled === SIZE * SIZE) state = 'complete';
    return { state, conflicts, filled, empty: SIZE * SIZE - filled };
  }

  function conflictMessage(count) {
    return `${count} cell${count === 1 ? '' : 's'} repeat a digit in a row, column or box. Fix the cells marked in red.`;
  }

  function isWellFormedGrid(grid) {
    return (
      Array.isArray(grid) &&
      grid.length === SIZE &&
      grid.every((row) => Array.isArray(row) && row.length === SIZE && row.every((v) => Number.isInteger(v) && v >= 0 && v <= 9))
    );
  }

  /** A solver result must not contradict the puzzle that was sent. */
  function solutionMatchesPuzzle(solution, puzzle) {
    if (!isWellFormedGrid(solution)) return false;
    if (solution.some((row) => row.some((v) => v === 0))) return false;
    if (findConflicts(solution).size > 0) return false;
    return puzzle.every((row, r) => row.every((v, c) => v === 0 || v === solution[r][c]));
  }

  /**
   * Parse the custom puzzle text format: nine lines of nine characters,
   * digits 1-9 for clues and 0 or . for empty cells. Blank lines are ignored.
   */
  function parsePuzzleText(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
    if (lines.length !== SIZE) {
      return { ok: false, message: `Expected 9 lines, found ${lines.length}.` };
    }
    const grid = [];
    for (let r = 0; r < SIZE; r++) {
      const line = lines[r];
      if (line.length !== SIZE) {
        return { ok: false, message: `Line ${r + 1} has ${line.length} characters; expected 9.` };
      }
      const bad = line.search(/[^0-9.]/);
      if (bad !== -1) {
        return { ok: false, message: `Line ${r + 1}, character ${bad + 1}: “${line[bad]}” is not allowed. Use 1–9, 0 or . only.` };
      }
      grid.push(Array.from(line, (ch) => (ch === '.' ? 0 : Number(ch))));
    }
    return { ok: true, grid };
  }

  Object.assign(DLX, { interpretKey, findConflicts, assessBoard, conflictMessage, isWellFormedGrid, solutionMatchesPuzzle, parsePuzzleText });
})();
