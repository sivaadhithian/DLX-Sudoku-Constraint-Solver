/* Entry point: connects the buttons to the board, state and solver client. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { EXAMPLE_PUZZLE } = DLX.constants;

  const NOTICE_DURATION_MS = 3000;
  let noticeTimer = null;
  let buttons = {};

  /* ---------- Refresh ---------- */

  /** Redraw the board and pick the status that matches it. `override` sets a one-off message. */
  function refreshStatus(override) {
    clearTimeout(noticeTimer);
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
    const busy = solving || DLX.state.playback;
    buttons.solve.disabled = busy;
    buttons.solve.setAttribute('aria-busy', String(solving));
    document.getElementById('btn-solve-label').textContent = solving ? 'Solving' : 'Solve';
    buttons.example.disabled = busy;
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
    DLX.setGridBusy(busy);
    document.getElementById('sudoku-grid').dataset.mode = DLX.state.pencil ? 'notes' : 'digits';
  }

  /* ---------- Grid events ---------- */

  /** Rejected keys use a toast so the board status message stays put. */
  function handleRejectedInput(message) {
    DLX.toast(message, { tone: 'warn', duration: NOTICE_DURATION_MS });
  }

  function toggleNotes() {
    if (DLX.state.playback || DLX.state.status === 'solving') return;
    DLX.setPencil(!DLX.state.pencil);
    syncControls();
  }

  /** Undo/redo. With a solution on screen, the first Ctrl+Z just hides it. */
  function undo() {
    if (DLX.state.playback || DLX.state.status === 'solving') return;
    if (DLX.state.solution) {
      DLX.state.solution = null;
      refreshStatus({ title: 'Solution hidden.', text: 'Back to your board before solving.' });
      return;
    }
    if (DLX.history.undo()) refreshStatus();
  }
  function redo() {
    if (DLX.state.playback || DLX.state.status === 'solving') return;
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
    DLX.loadPuzzle(parsed.grid);
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

  async function loadExamplePuzzle() {
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load example'))) return;
    DLX.loadPuzzle(EXAMPLE_PUZZLE);
    DLX.history.commit();
    announceLoaded('Example puzzle loaded.');
  }

  async function loadCustomPuzzle() {
    const grid = await DLX.askForCustomPuzzle();
    if (!grid) return;
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load puzzle'))) return;
    DLX.loadPuzzle(grid);
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

    DLX.updateStatus('solving');
    syncControls();
    const result = await DLX.solverClient.solvePuzzle(DLX.cloneGrid(DLX.state.grid));
    applySolverResult(result);
  }

  function applySolverResult(result) {
    const stats = result.stats || {};
    switch (result.status) {
      case 'solved':
        DLX.setSolution(result.solution);
        DLX.renderGrid({ reveal: true });
        DLX.updateCounts();
        DLX.updateStatus('solved', result.multipleSolutions ? 'The solver found a solution; this puzzle has more than one.' : undefined);
        break;
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
    };

    const gridEl = document.getElementById('sudoku-grid');
    DLX.createGrid(gridEl);
    DLX.attachGridInput(gridEl, {
      onEdit: () => { DLX.history.commit(); refreshStatus(); },
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
      if (DLX.state.playback || DLX.state.status === 'solving') return;
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
