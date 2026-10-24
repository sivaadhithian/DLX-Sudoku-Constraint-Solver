/* Everything that shows status: the message under the board, the header indicator and the
 * telemetry tab. Runtime fields (execution time, search statistics) stay "--" until a real
 * backend result supplies them. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const $ = (id) => document.getElementById(id);
  const UNAVAILABLE = '--';

  const STATUS = {
    empty: {
      label: 'Empty board', tone: 'neutral', title: 'Ready',
      text: 'Enter digits 1–9, or load an example puzzle.',
    },
    incomplete: {
      label: 'Incomplete', tone: 'neutral', title: 'Incomplete, no conflicts',
      text: 'No duplicate values so far. That does not mean a solution exists; only the solver can decide that.',
    },
    conflict: { label: 'Conflicts found', tone: 'bad', title: 'Conflicting values', text: 'The board contains duplicate digits.' },
    complete: {
      label: 'Complete', tone: 'ok', title: 'Board complete',
      text: 'Every cell is filled and no row, column or box repeats a digit. This is a rule check only; the solver has not run.',
    },
    solving: { label: 'Solving', tone: 'info', title: 'Solving', text: 'Waiting for the solver backend…' },
    solved: { label: 'Solved', tone: 'ok', title: 'Solved', text: 'The solver returned a solution. Your clues are unchanged.' },
    'no-solution': {
      label: 'No solution', tone: 'bad', title: 'No solution',
      text: 'The solver reports that no valid solution exists for these digits.',
    },
    'backend-missing': {
      label: 'Solver not connected', tone: 'warn', title: 'Solver not connected',
      text: 'Solver backend not connected yet.',
    },
    invalid: { label: 'Invalid input', tone: 'bad', title: 'Invalid input', text: 'The solver rejected this puzzle.' },
    error: { label: 'Solver error', tone: 'bad', title: 'Solver error', text: 'The solver could not complete the request.' },
  };

  let currentMessage = null; // what to restore after a transient notice

  function renderMessage({ tone, title, text }) {
    $('message').dataset.tone = tone;
    $('message-title').textContent = title;
    $('message-text').textContent = text;
  }

  /** Set the board/solver status everywhere: message, header, status bar. */
  function updateStatus(kind, text, title) {
    const def = STATUS[kind] || STATUS.error;
    DLX.state.status = kind;
    currentMessage = { tone: def.tone, title: title || def.title, text: text || def.text };
    renderMessage(currentMessage);
    $('progress').hidden = kind !== 'solving';

    // data-solver drives the pulse / shimmer animations in CSS.
    document.body.dataset.solver = kind === 'solving' ? 'solving' : 'idle';
    $('header-status').dataset.tone = def.tone;
    $('header-status-text').textContent = def.label;
  }

  /** A short-lived message (for example a rejected key). Does not change the board status. */
  function showNotice(text, title = 'Not allowed', tone = 'warn') {
    renderMessage({ tone, title, text });
  }
  function restoreMessage() {
    if (currentMessage) renderMessage(currentMessage);
  }

  /** Clue / entered / empty counters were removed with the status bar. Kept as a no-op so
   *  existing callers (renderer.js) keep working. */
  function updateCounts() {}

  /** Execution time comes only from a real backend result. */
  function setExecutionTime(ms) {
    const available = typeof ms === 'number' && Number.isFinite(ms);
    const text = available ? `${ms.toFixed(ms < 10 ? 2 : 1)} ms` : null;
    $('ss-time').textContent = text || UNAVAILABLE;
    $('ss-time').classList.toggle('unavailable', !available);
  }

  /** Search statistics also come only from the backend. */
  function setSearchStats(stats) {
    const fields = { 'ss-calls': 'recursiveCalls', 'ss-nodes': 'nodesVisited', 'ss-backtracks': 'backtracks', 'ss-solutions': 'solutionCount' };
    for (const [id, key] of Object.entries(fields)) {
      const value = stats && stats[key];
      const available = typeof value === 'number' && Number.isFinite(value);
      $(id).textContent = available ? value.toLocaleString('en-US') : UNAVAILABLE;
      $(id).classList.toggle('unavailable', !available);
    }
  }

  function setBackendInfo(info) {
    const connected = Boolean(info && info.connected);
    $('ss-solver').textContent = connected ? 'Connected' : 'Not connected';
    $('ss-solver').dataset.tone = connected ? 'ok' : 'warn';
  }

  Object.assign(DLX, { updateStatus, showNotice, restoreMessage, updateCounts, setExecutionTime, setSearchStats, setBackendInfo });
})();
