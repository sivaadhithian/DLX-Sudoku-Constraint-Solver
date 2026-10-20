/* Keyboard and mouse interaction for the grid. Edits go through state.js; the handlers
 * passed to attachGridInput tell the renderer what to refresh. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE } = DLX.constants;

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const LOCKED_MESSAGE = 'Original clues are locked. Use Reset or Clear board to change the puzzle.';

  /** Arrow keys, Home and End. Returns true when the event was handled. */
  function handleKeyboardNavigation(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const { row, col } = DLX.state.selected;

    if (ARROWS[event.key]) {
      event.preventDefault();
      const [dr, dc] = ARROWS[event.key];
      DLX.selectCell(row + dr, col + dc, { focus: true });
      return true;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      DLX.selectCell(row, event.key === 'Home' ? 0 : SIZE - 1, { focus: true });
      return true;
    }
    return false;
  }

  /** Digits, Backspace/Delete, and rejection of everything else that is printable. */
  function handleCellInput(event, handlers) {
    if (DLX.state.status === 'solving' || DLX.state.playback) return; // read-only while busy

    const intent = DLX.interpretKey(event);
    if (intent.action === 'ignore') return;
    event.preventDefault();

    if (intent.action === 'reject') {
      handlers.onRejected(intent.message);
      return;
    }

    const { row, col } = DLX.state.selected;
    if (DLX.isClue(row, col)) {
      handlers.onRejected(LOCKED_MESSAGE);
      return;
    }

    if (DLX.state.pencil) {
      // Notes mode: digits toggle pencil marks; Backspace clears notes first, then the value.
      if (intent.action === 'set') {
        if (DLX.getValue(row, col) !== 0) handlers.onRejected('This cell already has a digit. Clear it first to add notes.');
        else if (DLX.toggleNote(row, col, intent.digit)) handlers.onEdit();
        return;
      }
      if (DLX.clearNotes(row, col)) { handlers.onEdit(); return; }
    }

    const newValue = intent.action === 'set' ? intent.digit : 0;
    const unchanged = DLX.state.solution === null && DLX.state.grid[row][col] === newValue;
    if (unchanged) return;

    if (DLX.setCellValue(row, col, newValue)) handlers.onEdit();
  }

  function attachGridInput(container, handlers) {
    container.addEventListener('keydown', (event) => {
      if (DLX.state.playback) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handlers.onToggleNotes();
        return;
      }
      if (handleKeyboardNavigation(event)) return;
      handleCellInput(event, handlers);
    });

    container.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell');
      if (cell) DLX.selectCell(Number(cell.dataset.row), Number(cell.dataset.col), { focus: true });
    });

    // Keeps selection in sync when focus arrives by Tab.
    container.addEventListener('focusin', (event) => {
      const cell = event.target.closest('.cell');
      if (cell) DLX.selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    });
  }

  Object.assign(DLX, { attachGridInput, handleKeyboardNavigation, handleCellInput });
})();
