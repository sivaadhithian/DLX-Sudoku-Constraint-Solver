/* Undo / redo for board edits (digits, notes, loads, reset, clear). A displayed solution is
 * a view rather than an edit, so it is not part of the history. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const LIMIT = 200;
  let stack = [];
  let index = -1;
  const listeners = [];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const notify = () => listeners.forEach((fn) => fn());

  /** Record the current board as a new history entry (no-op if nothing changed). */
  function commit() {
    const snap = DLX.snapshot();
    if (index >= 0 && same(stack[index], snap)) return;
    stack = stack.slice(0, index + 1);
    stack.push(snap);
    if (stack.length > LIMIT) stack.shift();
    index = stack.length - 1;
    notify();
  }

  const canUndo = () => index > 0;
  const canRedo = () => index >= 0 && index < stack.length - 1;

  function undo() {
    if (!canUndo()) return false;
    index--;
    DLX.restore(stack[index]);
    notify();
    return true;
  }
  function redo() {
    if (!canRedo()) return false;
    index++;
    DLX.restore(stack[index]);
    notify();
    return true;
  }

  DLX.history = { commit, undo, redo, canUndo, canRedo, onChange: (fn) => listeners.push(fn) };
})();
