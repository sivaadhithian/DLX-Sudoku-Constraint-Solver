/* Entry point: connects the buttons to the board, state and solver client. */
(function () {
  'use strict';
  const DLX = window.DLX;

  const NOTICE_DURATION_MS = 3000;
  let noticeTimer = null;
  let buttons = {};

  /* ---------- Refresh ---------- */

  /** Redraw the board and pick the status that matches it. `override` sets a one-off message. */
  function refreshStatus(override) {
    clearTimeout(noticeTimer);
    if (!DLX.state.playback) DLX.stepLog.clear(); // the log describes the board as it was; any edit makes it stale
    const assessment = DLX.renderGrid();
    DLX.updateCounts();
    DLX.setExecutionTime(null);
    DLX.setSearchStats(null);

    if (assessment.state === 'conflict') {
      DLX.updateStatus('conflict', DLX.conflictMessage(assessment.conflicts.size));
    } else {
      DLX.updateStatus(assessment.state, override && override.text, override && override.title);
    }
    syncControls();
  }

  function syncControls() {
    const solving = DLX.state.status === 'solving';
    const generating = DLX.state.generating;
    const busy = solving || DLX.state.playback || generating;
    buttons.solve.disabled = busy;
    buttons.solve.setAttribute('aria-busy', String(solving));
    document.getElementById('btn-solve-label').textContent = solving ? 'Solving' : 'Solve';
    // While generating, the example button becomes "Cancel" so a slow generation can be abandoned.
    buttons.example.disabled = solving || DLX.state.playback;
    buttons.example.textContent = generating ? 'Cancel' : 'Load example';
    buttons.example.setAttribute('aria-label', generating ? 'Cancel puzzle generation' : 'Load example');
    buttons.custom.disabled = busy;
    buttons.reset.disabled = busy || !DLX.canReset();
    buttons.clear.disabled = busy || !DLX.canClear();
    buttons.undo.disabled = busy || !(DLX.history.canUndo() || DLX.state.solution);
    buttons.redo.disabled = busy || !DLX.history.canRedo();
    buttons.notes.disabled = busy;
    buttons.notes.setAttribute('aria-pressed', String(DLX.state.pencil));
    buttons.copy.disabled = busy;
    buttons.paste.disabled = busy;
    buttons.visualize.disabled = busy;
    buttons.algo.disabled = busy;
    DLX.setGridBusy(busy);
    document.getElementById('sudoku-grid').dataset.mode = DLX.state.pencil ? 'notes' : 'digits';
  }

  /* ---------- Grid events ---------- */

  /** Rejected keys use a toast so the board status message stays put. */
  function handleRejectedInput(message) {
    DLX.toast(message, { tone: 'warn', duration: NOTICE_DURATION_MS });
  }

  function toggleNotes() {
    if (DLX.state.playback || DLX.state.generating || DLX.state.status === 'solving') return;
    DLX.setPencil(!DLX.state.pencil);
    syncControls();
  }

  /** Undo/redo. With a solution on screen, the first Ctrl+Z just hides it. */
  function undo() {
    if (DLX.state.playback || DLX.state.generating || DLX.state.status === 'solving') return;
    if (DLX.state.solution) {
      DLX.state.solution = null;
      refreshStatus({ title: 'Solution hidden.', text: 'Back to your board before solving.' });
      return;
    }
    const target = DLX.history.peek(-1);
    if (target && wouldUnlock(target)) { DLX.toast('Correct digits are locked and cannot be undone.', { tone: 'warn' }); return; }
    if (DLX.history.undo()) refreshStatus();
  }
  function redo() {
    if (DLX.state.playback || DLX.state.generating || DLX.state.status === 'solving') return;
    const target = DLX.history.peek(1);
    if (target && wouldUnlock(target)) { DLX.toast('Correct digits are locked.', { tone: 'warn' }); return; }
    if (DLX.history.redo()) refreshStatus();
  }

  /** Presentation mode: larger board and numbers, secondary controls hidden. */
  function setPresentation(on) {
    document.body.dataset.present = on ? 'on' : '';
    const btn = document.getElementById('present-toggle');
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Exit presentation mode (P or Esc)' : 'Presentation mode (P)';
  }
  const isPresenting = () => document.body.dataset.present === 'on';

  /** Load puzzle text from the clipboard or a paste event. */
  async function loadFromText(text) {
    const parsed = DLX.parsePuzzleText(text);
    if (!parsed.ok) {
      DLX.toast(`Not a puzzle: ${parsed.message}`, { tone: 'bad', duration: 4000 });
      return;
    }
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load puzzle'))) return;
    DLX.loadPuzzle(parsed.grid, keyFor(parsed.grid));
    DLX.history.commit();
    announceLoaded('Puzzle pasted.');
  }

  async function pasteButton() {
    try {
      loadFromText(await navigator.clipboard.readText());
    } catch (e) {
      DLX.toast('Clipboard access was blocked. Click the board and press Ctrl+V instead.', { tone: 'warn', duration: 4000 });
    }
  }

  /* ---------- Button actions ---------- */

  /** Only ask when replacing the board would throw away values the user typed. */
  async function confirmIfInputWouldBeLost(title, confirmLabel) {
    if (!DLX.hasUserInput()) return true;
    return DLX.confirmAction({ title, message: 'The values you entered will be lost. This cannot be undone.', confirmLabel });
  }

  function announceLoaded(title) {
    const clues = DLX.getCounts().clue;
    refreshStatus({ title, text: `${clues} clue${clues === 1 ? ' is' : 's are'} locked. Enter values in the empty cells.` });
    DLX.selectCell(4, 4, { focus: true });
  }

  /** Answer key for a typed/pasted puzzle. Only a puzzle with exactly one solution can be checked. */
  function keyFor(grid) {
    const { key, count } = DLX.generator.answerKeyFor(grid);
    if (!key) {
      DLX.toast(count === 0
        ? 'This puzzle has no solution, so answer checking is off.'
        : count === -1
          ? 'Could not verify this puzzle quickly enough, so answer checking is off.'
          : 'This puzzle has more than one solution, so answer checking is off.', { tone: 'warn', duration: 4500 });
    }
    return key;
  }

  /** Green / red feedback for an entered digit; correct digits lock, wrong ones count as mistakes. */
  function handleVerdict({ verdict, row, col }) {
    DLX.flashCell(row, col, verdict);
    if (verdict === 'bad') {
      DLX.toast(`Not correct. Mistakes: ${DLX.state.mistakes}. You can change this digit.`, { tone: 'bad', duration: 2600 });
    } else if (DLX.assessBoard(DLX.state.grid).state === 'complete') {
      DLX.toast(`Puzzle complete with ${DLX.state.mistakes} mistake${DLX.state.mistakes === 1 ? '' : 's'}.`, { tone: 'ok', duration: 4500 });
    }
  }

  /** Undo/redo must never take back a digit that was verified as correct. */
  function wouldUnlock(target) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (DLX.state.verified[r][c] && (!target.verified[r][c] || target.grid[r][c] !== DLX.state.grid[r][c])) return true;
      }
    }
    return false;
  }

  /** Ask for a difficulty, then load a freshly generated random puzzle of that level.
   *  Generation runs off the UI thread (see generator.js) and can be cancelled. The board is
   *  only touched once a valid puzzle has arrived, so failure or cancellation changes nothing. */
  let generation = null; // { cancel } while a request is in flight

  async function loadExamplePuzzle() {
    if (generation) { generation.cancel(); return; } // the button reads "Cancel" while generating

    const level = await DLX.askForLevel();
    if (!level) return;
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load puzzle'))) return;
    if (generation) return; // another request started while the dialogs were open

    const cfg = DLX.generator.LEVELS[level];
    const label = cfg.label;
    const request = DLX.generator.start(level);
    generation = request;
    DLX.state.generating = true;
    DLX.updateStatus('generating', `Creating ${level === 'easy' ? 'an' : 'a'} ${label.toLowerCase()} puzzle with exactly one solution… Press Cancel to stop.`);
    syncControls();

    let result;
    try {
      result = await request.promise;
    } catch (error) { // start() never rejects; this is a last line of defence
      result = { status: 'failed', reason: String((error && error.message) || error) };
    } finally {
      generation = null;
      DLX.state.generating = false;
    }

    try {
      if (result.status === 'cancelled') {
        refreshStatus({ title: 'Generation cancelled.', text: 'Your board was not changed.' });
      } else if (result.status === 'exact') {
        DLX.loadPuzzle(result.grid, result.key);
        DLX.history.commit();
        announceLoaded(`${label} puzzle loaded.`);
      } else if (result.status === 'approximate') {
        // A valid, unique-solution puzzle, but NOT what was asked for. Say so plainly.
        DLX.loadPuzzle(result.grid, result.key);
        DLX.history.commit();
        const actual = DLX.generator.LEVELS[result.actualLevel].label;
        refreshStatus({
          title: `Approximate puzzle loaded (not a guaranteed ${label}).`,
          text: `A ${label} puzzle could not be found in time. This one has ${result.clues} clues and ${result.reason || `plays like ${actual}`}. It has exactly one solution.`,
        });
        DLX.selectCell(4, 4, { focus: true });
        DLX.toast(`Could not guarantee ${label}. Loaded a ${actual.toLowerCase()}-style puzzle instead.`, { tone: 'warn', duration: 6000 });
      } else {
        refreshStatus({ title: 'Could not generate a puzzle.', text: `${result.reason || 'Something went wrong.'} Your board was not changed.` });
        DLX.toast('Puzzle generation failed. Your board was not changed.', { tone: 'bad', duration: 4500 });
      }
    } catch (error) {
      refreshStatus({ title: 'Could not load the puzzle.', text: `${(error && error.message) || error}` });
    } finally {
      if (DLX.state.status === 'generating') refreshStatus(); // never leave the "Generating" state behind
      syncControls();
    }
  }

  async function loadCustomPuzzle() {
    const grid = await DLX.askForCustomPuzzle();
    if (!grid) return;
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load puzzle'))) return;
    DLX.loadPuzzle(grid, keyFor(grid));
    DLX.history.commit();
    announceLoaded('Custom puzzle loaded.');
  }

  function resetPuzzle() {
    DLX.resetToOriginal();
    DLX.history.commit();
    const loaded = !DLX.isGridEmpty(DLX.state.original);
    refreshStatus({ title: loaded ? 'Puzzle reset.' : 'Board reset.', text: loaded ? 'Your entries were removed; the original clues are back.' : 'All entries were removed.' });
  }

  async function clearBoard() {
    if (!(await confirmIfInputWouldBeLost('Clear the board?', 'Clear board'))) return;
    DLX.clearAll();
    DLX.history.commit();
    refreshStatus({ title: 'Board cleared.', text: 'Enter digits 1–9, or load an example puzzle.' });
  }

  /**
   * Check the board, then ask the solver. Only a genuine backend result is ever shown;
   * with no backend the answer is an honest "not connected".
   */
  async function solvePuzzle() {
    if (DLX.state.status === 'solving') return; // no repeated requests while one is pending

    const assessment = DLX.assessBoard(DLX.state.grid);
    if (assessment.state === 'conflict') {
      DLX.updateStatus('conflict', `${DLX.conflictMessage(assessment.conflicts.size)} Solve is unavailable until they are resolved.`);
      return;
    }
    if (assessment.state === 'complete') {
      DLX.updateStatus('complete'); // rule check only; nothing to solve
      return;
    }

    const previousSolution = DLX.state.solution; // restored if anything goes wrong half-way
    DLX.updateStatus('solving');
    syncControls();
    try {
      // solverClient already turns IPC failures into normalised { status: 'error' } results.
      const result = await DLX.solverClient.solvePuzzle(DLX.cloneGrid(DLX.state.grid));
      applySolverResult(result);
    } catch (error) {
      // Only unexpected exceptions land here (a bug, or a rejected promise outside the client).
      DLX.state.solution = previousSolution;
      DLX.stepLog.clear();
      DLX.renderGrid();
      DLX.updateCounts();
      const detail = error && error.message ? error.message : String(error);
      DLX.updateStatus('error', `Something went wrong while solving, so the board was left as it was. (${detail})`);
    } finally {
      // Whatever happened, never leave the UI stuck in "Solving" with disabled controls.
      if (DLX.state.status === 'solving') DLX.updateStatus('error', 'The solve did not finish. The board was left as it was.');
      syncControls();
    }
  }
  function applySolverResult(result) {
    const stats = result.stats || {};
    switch (result.status) {
      case 'solved': {
        // Build the explanation first: if it throws, nothing has been changed yet.
        const steps = DLX.explain.buildSolveSteps(DLX.state.grid, result.solution);
        DLX.stepLog.reset({
          source: 'reconstructed',
          note: 'Educational reconstruction. These steps are rebuilt from the backend’s final answer using human-style rules; they are NOT a record of the order the backend’s DLX search actually used. Use Visualize to watch an Algorithm X replay.',
        });
        DLX.stepLog.add(steps, { current: false, scroll: 'top' });
        DLX.setSolution(result.solution);
        DLX.renderGrid({ reveal: true });
        DLX.updateCounts();
        DLX.updateStatus('solved', result.multipleSolutions ? 'The solver found a solution; this puzzle has more than one.' : undefined);
        break;
      }
      case 'no-solution':
        DLX.updateStatus('no-solution');
        break;
      case 'invalid':
        DLX.updateStatus('invalid', result.message);
        break;
      default:
        DLX.updateStatus(result.code === 'BACKEND_NOT_CONNECTED' ? 'backend-missing' : 'error', result.message);
    }
    if (result.status === 'solved' || result.status === 'no-solution') {
      DLX.setExecutionTime(stats.executionMs);
      DLX.setSearchStats({ ...stats, solutionCount: result.solutionCount });
      DLX.runs.add({ status: result.status, stats, solutionCount: result.solutionCount });
    }
    syncControls();
  }

  /* ---------- Startup ---------- */

  async function init() {
    buttons = {
      solve: document.getElementById('btn-solve'),
      example: document.getElementById('btn-example'),
      reset: document.getElementById('btn-reset'),
      clear: document.getElementById('btn-clear'),
      custom: document.getElementById('btn-custom'),
      undo: document.getElementById('btn-undo'),
      redo: document.getElementById('btn-redo'),
      notes: document.getElementById('btn-notes'),
      copy: document.getElementById('btn-copy'),
      paste: document.getElementById('btn-paste'),
      visualize: document.getElementById('btn-visualize'),
      algo: document.getElementById('btn-algo'),
    };

    const gridEl = document.getElementById('sudoku-grid');
    DLX.createGrid(gridEl);
    DLX.attachGridInput(gridEl, {
      onEdit: (info) => { DLX.history.commit(); refreshStatus(); if (info && info.verdict) handleVerdict(info); },
      onRejected: handleRejectedInput,
      onToggleNotes: toggleNotes,
    });
    DLX.initDialogs();

    buttons.solve.addEventListener('click', solvePuzzle);
    buttons.example.addEventListener('click', loadExamplePuzzle);
    buttons.custom.addEventListener('click', loadCustomPuzzle);
    buttons.reset.addEventListener('click', resetPuzzle);
    buttons.clear.addEventListener('click', clearBoard);
    buttons.undo.addEventListener('click', undo);
    buttons.redo.addEventListener('click', redo);
    buttons.notes.addEventListener('click', toggleNotes);
    buttons.copy.addEventListener('click', () => DLX.copyPuzzle());
    buttons.paste.addEventListener('click', pasteButton);
    document.getElementById('btn-copy-metrics').addEventListener('click', () => DLX.copyMetrics());
    document.getElementById('btn-export-png').addEventListener('click', () => DLX.savePng());
    document.getElementById('present-toggle').addEventListener('click', () => setPresentation(!isPresenting()));
    DLX.history.onChange(syncControls);
    document.addEventListener('dlx:playback', syncControls);

    // Paste a puzzle anywhere outside a text field (the Load custom dialog keeps its own paste).
    document.addEventListener('paste', (event) => {
      const t = event.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (DLX.state.playback || DLX.state.generating || DLX.state.status === 'solving') return;
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (text) { event.preventDefault(); loadFromText(text); }
    });

    // Global shortcuts (ignored while typing in a dialog field).
    document.addEventListener('keydown', (event) => {
      const t = event.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (document.querySelector('dialog[open]')) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); }
      else if (!mod && !event.altKey && key === 'p' && !DLX.state.playback) { event.preventDefault(); setPresentation(!isPresenting()); }
      else if (key === 'escape' && isPresenting() && !DLX.state.playback) setPresentation(false);
    });

    DLX.history.commit(); // the starting (empty) board is the first history entry
    refreshStatus();
    DLX.selectCell(4, 4, { focus: true });
    DLX.setBackendInfo(await DLX.solverClient.getStatus());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
