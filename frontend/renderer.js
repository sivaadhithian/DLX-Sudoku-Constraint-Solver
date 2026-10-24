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
    buttons.solve.disabled = solving;
    buttons.solve.setAttribute('aria-busy', String(solving));
    document.getElementById('btn-solve-label').textContent = solving ? 'Solving' : 'Solve';
    buttons.example.disabled = solving;
    buttons.custom.disabled = solving;
    buttons.reset.disabled = solving || !DLX.canReset();
    buttons.clear.disabled = solving || !DLX.canClear();
    DLX.setGridBusy(solving);
  }

  /* ---------- Grid events ---------- */

  function handleRejectedInput(message) {
    DLX.showNotice(message);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(DLX.restoreMessage, NOTICE_DURATION_MS);
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
    announceLoaded('Example puzzle loaded.');
  }

  async function loadCustomPuzzle() {
    const grid = await DLX.askForCustomPuzzle();
    if (!grid) return;
    if (!(await confirmIfInputWouldBeLost('Replace the current board?', 'Load puzzle'))) return;
    DLX.loadPuzzle(grid);
    announceLoaded('Custom puzzle loaded.');
  }

  function resetPuzzle() {
    DLX.resetToOriginal();
    const loaded = !DLX.isGridEmpty(DLX.state.original);
    refreshStatus({ title: loaded ? 'Puzzle reset.' : 'Board reset.', text: loaded ? 'Your entries were removed; the original clues are back.' : 'All entries were removed.' });
  }

  async function clearBoard() {
    if (!(await confirmIfInputWouldBeLost('Clear the board?', 'Clear board'))) return;
    DLX.clearAll();
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
        DLX.renderGrid();
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
    };

    const gridEl = document.getElementById('sudoku-grid');
    DLX.createGrid(gridEl);
    DLX.attachGridInput(gridEl, { onEdit: () => refreshStatus(), onRejected: handleRejectedInput });
    DLX.initDialogs();

    buttons.solve.addEventListener('click', solvePuzzle);
    buttons.example.addEventListener('click', loadExamplePuzzle);
    buttons.custom.addEventListener('click', loadCustomPuzzle);
    buttons.reset.addEventListener('click', resetPuzzle);
    buttons.clear.addEventListener('click', clearBoard);

    refreshStatus();
    DLX.selectCell(4, 4, { focus: true });
    DLX.setBackendInfo(await DLX.solverClient.getStatus());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
