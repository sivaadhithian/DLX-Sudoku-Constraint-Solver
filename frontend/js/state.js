/* Board state: the single source of truth.
 *
 *   grid      9x9 ints, 0 = empty   everything currently on the board
 *   original  9x9 ints              the loaded puzzle's clues (all zeros if none loaded)
 *   notes     9x9 bitmasks          pencil marks (bit d set = digit d is a candidate note)
 *   key       9x9 ints | null       private answer key for instant right/wrong feedback (never shown)
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
    notes: createEmptyGrid(),
    key: null,                  // 9x9 answer key for instant checking; never displayed, never sent anywhere
    verified: createEmptyGrid(), // 1 = the user entered the correct digit here, so the cell is locked
    mistakes: 0,                // wrong entries in the current game
    solution: null,
    pencil: false,   // notes mode on/off (UI mode, not part of undo history)
    playback: false, // true while the visual replay owns the grid
    generating: false, // true while a random puzzle is being generated
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
    if (state.verified[r][c]) return 'verified';
    return 'entered';
  }

  /** Correct digits (and clues) can no longer be changed. */
  const isLocked = (r, c) => isClue(r, c) || state.verified[r][c] === 1;

  /** Check the digit just entered against the answer key.
   *  Returns 'ok' (cell becomes locked), 'bad' (mistake count +1) or null (no key / empty cell). */
  function judgeEntry(r, c) {
    if (!state.key || state.grid[r][c] === 0) return null;
    if (state.grid[r][c] === state.key[r][c]) {
      state.verified[r][c] = 1;
      return 'ok';
    }
    state.mistakes++;
    return 'bad';
  }

  /** How many cells of each kind are currently displayed. */
  function getCounts() {
    const counts = { clue: 0, entered: 0, solved: 0, empty: 0 };
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { const k = getCellKind(r, c); counts[k === 'verified' ? 'entered' : k]++; }
    return counts;
  }

  const hasUserInput = () => getCounts().entered > 0;
  const hasNotes = () => state.notes.some((row) => row.some((v) => v !== 0));
  const getNotes = (r, c) => state.notes[r][c];
  const canReset = () => hasUserInput() || hasNotes() || state.solution !== null;
  const canClear = () => !isGridEmpty(state.grid) || hasNotes() || state.solution !== null;

  /* ----- Writes ----- */
  /** Returns false (and changes nothing) when the cell is a locked clue. */
  function setCellValue(r, c, value) {
    if (isClue(r, c)) return false;
    state.grid[r][c] = value;
    state.solution = null; // any edit invalidates a displayed solution
    if (value !== 0) {
      state.notes[r][c] = 0;
      removeNoteFromPeers(r, c, value); // keep pencil marks honest
    }
    return true;
  }

  function removeNoteFromPeers(r, c, digit) {
    const bit = ~(1 << digit);
    const br = r - (r % BOX);
    const bc = c - (c % BOX);
    for (let i = 0; i < SIZE; i++) {
      state.notes[r][i] &= bit;
      state.notes[i][c] &= bit;
    }
    for (let i = br; i < br + BOX; i++) for (let j = bc; j < bc + BOX; j++) state.notes[i][j] &= bit;
  }

  /** Toggle one pencil mark. Only empty, non-clue cells can hold notes. */
  function toggleNote(r, c, digit) {
    if (isClue(r, c) || getValue(r, c) !== 0) return false;
    state.notes[r][c] ^= 1 << digit;
    return true;
  }
  function clearNotes(r, c) {
    if (state.notes[r][c] === 0) return false;
    state.notes[r][c] = 0;
    return true;
  }
  /** Start a new game. `key` is the full answer when known (generated puzzles) so entries can be checked. */
  function loadPuzzle(grid, key = null) {
    state.grid = cloneGrid(grid);
    state.original = cloneGrid(grid);
    state.notes = createEmptyGrid();
    state.key = key ? cloneGrid(key) : null;
    state.verified = createEmptyGrid();
    state.mistakes = 0;
    state.solution = null;
  }
  function resetToOriginal() { // restart the same puzzle: entries, locks and mistakes are cleared
    state.grid = cloneGrid(state.original);
    state.notes = createEmptyGrid();
    state.verified = createEmptyGrid();
    state.mistakes = 0;
    state.solution = null;
  }
  function clearAll() {
    state.grid = createEmptyGrid();
    state.original = createEmptyGrid();
    state.notes = createEmptyGrid();
    state.key = null;
    state.verified = createEmptyGrid();
    state.mistakes = 0;
    state.solution = null;
  }
  const setPencil = (on) => { state.pencil = Boolean(on); };

  /** Undo/redo snapshots. A displayed solution is a view, not an edit, so it is excluded. */
  function snapshot() {
    return {
      grid: cloneGrid(state.grid), original: cloneGrid(state.original), notes: cloneGrid(state.notes),
      verified: cloneGrid(state.verified), key: state.key ? cloneGrid(state.key) : null,
    };
  }
  function restore(snap) {
    state.grid = cloneGrid(snap.grid);
    state.original = cloneGrid(snap.original);
    state.notes = cloneGrid(snap.notes);
    state.verified = cloneGrid(snap.verified);
    state.key = snap.key ? cloneGrid(snap.key) : null;
    state.solution = null;
  }
  function setSolution(solution) {
    state.solution = cloneGrid(solution);
  }

  Object.assign(DLX, {
    state, cloneGrid, isGridEmpty, getValue, isClue, getCellKind, getCounts,
    hasUserInput, hasNotes, isLocked, judgeEntry, getNotes, canReset, canClear, setCellValue, toggleNote, clearNotes, setPencil,
    loadPuzzle, resetToOriginal, clearAll, setSolution, snapshot, restore,
  });
})();
