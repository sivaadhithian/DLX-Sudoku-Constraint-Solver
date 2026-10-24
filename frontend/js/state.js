/* Board state: the single source of truth.
 *
 *   grid      9x9 ints, 0 = empty   everything currently on the board
 *   original  9x9 ints              the loaded puzzle's clues (all zeros if none loaded)
 *   solution  9x9 ints | null       a genuine backend result; never generated here
 *
 * A cell is a locked CLUE when original[r][c] is non-zero. Other non-empty cells are
 * ENTERED by the user (or SOLVED, when a real backend solution is displayed). */
(function () {
  'use strict';
  const DLX = (window.DLX = window.DLX || {});

  const SIZE = 9;
  const BOX = 3;

  // A well-known puzzle with exactly one solution. Only the clues are stored.
  const EXAMPLE_ROWS = [
    '530070000',
    '600195000',
    '098000060',
    '800060003',
    '400803001',
    '700020006',
    '060000280',
    '000419005',
    '000080079',
  ];

  DLX.constants = Object.freeze({
    SIZE,
    BOX,
    EXAMPLE_PUZZLE: Object.freeze(EXAMPLE_ROWS.map((row) => Object.freeze(Array.from(row, Number)))),
  });

  const createEmptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const cloneGrid = (grid) => grid.map((row) => row.slice());
  const isGridEmpty = (grid) => grid.every((row) => row.every((v) => v === 0));

  const state = {
    grid: createEmptyGrid(),
    original: createEmptyGrid(),
    solution: null,
    selected: { row: 4, col: 4 },
    status: 'empty', // see STATUS in status.js
  };

  /* ----- Reads ----- */
  const getValue = (r, c) => (state.solution ? state.solution[r][c] : state.grid[r][c]);
  const isClue = (r, c) => state.original[r][c] !== 0;

  function getCellKind(r, c) {
    if (getValue(r, c) === 0) return 'empty';
    if (isClue(r, c)) return 'clue';
    if (state.solution && state.grid[r][c] === 0) return 'solved';
    return 'entered';
  }

  /** How many cells of each kind are currently displayed. */
  function getCounts() {
    const counts = { clue: 0, entered: 0, solved: 0, empty: 0 };
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) counts[getCellKind(r, c)]++;
    return counts;
  }

  const hasUserInput = () => getCounts().entered > 0;
  const canReset = () => hasUserInput() || state.solution !== null;
  const canClear = () => !isGridEmpty(state.grid) || state.solution !== null;

  /* ----- Writes ----- */
  /** Returns false (and changes nothing) when the cell is a locked clue. */
  function setCellValue(r, c, value) {
    if (isClue(r, c)) return false;
    state.grid[r][c] = value;
    state.solution = null; // any edit invalidates a displayed solution
    return true;
  }
  function loadPuzzle(grid) {
    state.grid = cloneGrid(grid);
    state.original = cloneGrid(grid);
    state.solution = null;
  }
  function resetToOriginal() {
    state.grid = cloneGrid(state.original);
    state.solution = null;
  }
  function clearAll() {
    state.grid = createEmptyGrid();
    state.original = createEmptyGrid();
    state.solution = null;
  }
  function setSolution(solution) {
    state.solution = cloneGrid(solution);
  }

  Object.assign(DLX, {
    state, cloneGrid, isGridEmpty, getValue, isClue, getCellKind, getCounts,
    hasUserInput, canReset, canClear, setCellValue, loadPuzzle, resetToOriginal, clearAll, setSolution,
  });
})();
