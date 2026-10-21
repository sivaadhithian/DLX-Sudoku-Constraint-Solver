/* Visual replay of Algorithm X on the board, with a step-by-step explanation panel.
 * The replay works on its own copy of the grid and paints cells directly; the real board
 * state is untouched and is redrawn when the replay closes. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE } = DLX.constants;
  const $ = (id) => document.getElementById(id);

  const BASE_RATE = 1;      // steps per second at 1x, slow enough to read each explanation
  const LIST_TAIL = 1500;   // when skipping to the end, list at most this many of the last steps

  let trace = null;   // { events, cols, as, bs, solved, truncated, tries, undos, givens }
  let grid = null;    // replay grid
  let given = null;   // which cells are original givens
  let pos = 0;        // events applied so far
  let tries = 0, undos = 0, filled = 0;
  let speed = 1;      // multiplier: 0.5, 0.75, 1, 1.5, 2
  let playing = false, finished = false;
  let raf = 0, lastT = 0, carry = 0;

  const fmt = (n) => n.toLocaleString('en-US');

  function decode(ev) {
    const kind = ev >= 729 ? 1 : 0;
    const x = ev % 729;
    const digit = (x % 9) + 1;
    const cell = (x - (digit - 1)) / 9;
    return { kind, r: Math.floor(cell / SIZE), c: cell % SIZE, digit };
  }

  /* ---------- grid painting ---------- */
  function paint(r, c, flash) {
    const el = DLX.getCellEl(r, c);
    const v = grid[r][c];
    el._sig = null; // force the real renderer to redraw this cell when the replay closes
    el.textContent = v ? String(v) : '';
    el.dataset.kind = given[r][c] ? 'clue' : v ? 'trying' : 'empty';
    el.classList.remove('bt', 'reveal');
    if (flash) { void el.offsetWidth; el.classList.add('bt'); }
  }
  function paintAll() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) paint(r, c, false);
  }

  /** Tint the box and the row/column of the active step so "where" is obvious. */
  function clearFocus() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) DLX.getCellEl(r, c).classList.remove('ex-focus', 'ex-box', 'ex-line');
  }
  function setFocus(r, c) {
    clearFocus();
    if (r < 0) return;
    const br = r - (r % 3), bc = c - (c % 3);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const inBox = i >= br && i < br + 3 && j >= bc && j < bc + 3;
        const el = DLX.getCellEl(i, j);
        if (inBox) el.classList.add('ex-box');
        else if (i === r || j === c) el.classList.add('ex-line');
      }
    }
    DLX.getCellEl(r, c).classList.add('ex-focus');
  }

  /* ---------- step log ---------- */
  function logStep(exp) {
    if (!exp) return;
    DLX.stepLog.add([{ ...exp.entry, n: pos }]);
    setFocus(exp.r, exp.c);
  }

  function readout() {
    $('pb-readout').textContent = `Step ${fmt(pos)} of ${fmt(trace.events.length)} · ${fmt(tries)} tries · ${fmt(undos)} backtracks`;
  }

  /* ---------- stepping ---------- */
  function applyOne({ text = true, paintCell = true } = {}) {
    const { kind, r, c, digit } = decode(trace.events[pos]);
    let exp = null;
    if (kind === 0) {
      if (text) exp = DLX.explain.explainTry({ grid, r, c, d: digit, col: trace.cols[pos], options: trace.as[pos], option: trace.bs[pos], filled });
      grid[r][c] = digit; filled++; tries++;
    } else {
      grid[r][c] = 0; filled--; undos++;
      if (text) exp = DLX.explain.explainUndo({ grid, r, c, d: digit, failCol: trace.cols[pos], failType: trace.as[pos], more: trace.bs[pos] === 1 });
    }
    pos++;
    if (paintCell) paint(r, c, kind === 1);
    if (text) logStep(exp);
  }

  function finish() {
    pause();
    finished = true;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!given[r][c] && grid[r][c]) DLX.getCellEl(r, c).dataset.kind = trace.solved ? 'solved' : 'trying';
    const done = DLX.explain.explainDone({ solved: trace.solved, truncated: trace.truncated, tries, undos });
    DLX.stepLog.add([{ kind: 'info', main: done.title, because: done.sections.map((x) => x[1]).join(' ') }]);
    clearFocus();
    readout();
    for (const id of ['pb-play', 'pb-step', 'pb-end']) $(id).disabled = true;
  }

  function frame(t) {
    if (!playing) return;
    carry += ((t - lastT) / 1000) * BASE_RATE * speed;
    lastT = t;
    if (carry >= 1) {
      carry -= 1;
      if (pos < trace.events.length) applyOne();
      readout();
      if (pos >= trace.events.length) { finish(); return; }
    }
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || finished) return;
    playing = true;
    lastT = performance.now();
    carry = 1; // take the first step right away
    $('pb-play').textContent = 'Pause';
    $('pb-play').setAttribute('aria-label', 'Pause replay');
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    $('pb-play').textContent = 'Play';
    $('pb-play').setAttribute('aria-label', 'Play replay');
  }

  function step() {
    pause();
    if (pos < trace.events.length) applyOne();
    readout();
    if (pos >= trace.events.length) finish();
  }

  function toEnd() {
    pause();
    const skipped = trace.events.length - pos;
    const textFrom = Math.max(pos, trace.events.length - LIST_TAIL);
    // Silent for the early part (no text, no painting), then list the remaining steps.
    while (pos < textFrom) applyOne({ text: false, paintCell: false });
    if (textFrom > 0 && skipped > 0 && pos > 0) {
      DLX.stepLog.add([{ kind: 'info', main: `Steps up to #${fmt(pos)} were skipped and are not listed. Use Step or a lower speed to read every move.` }], { current: false });
    }
    while (pos < trace.events.length) applyOne({ text: true, paintCell: false });
    paintAll();
    finish();
  }

  function setSpeed(value) {
    speed = value;
    for (const b of document.querySelectorAll('.speed-btn')) b.setAttribute('aria-checked', String(Number(b.dataset.speed) === value));
  }

  /* ---------- open / close ---------- */
  function open() {
    if (DLX.state.playback || DLX.state.status === 'solving') return;
    const assessment = DLX.assessBoard(DLX.state.grid);
    if (assessment.state === 'conflict') { DLX.toast('Fix the conflicting cells before visualizing.', { tone: 'warn' }); return; }
    if (assessment.state === 'complete') { DLX.toast('The board is already complete.', { tone: 'warn' }); return; }

    // Any digits on the board are treated as givens for the replay.
    const puzzle = DLX.cloneGrid(DLX.state.grid);
    trace = DLX.buildTrace(puzzle);
    if (!trace.solved && !trace.truncated) {
      trace = null;
      DLX.toast('Algorithm X found no solution for this board.', { tone: 'bad' });
      return;
    }
    grid = DLX.cloneGrid(puzzle);
    given = puzzle.map((row) => row.map((v) => v !== 0));
    pos = tries = undos = 0;
    filled = trace.givens;
    finished = false;

    DLX.state.playback = true;
    document.body.dataset.playback = 'on';
    $('playback').hidden = false;
    DLX.stepLog.reset({ note: 'Illustrative replay of Algorithm X, including backtracks. Each entry says where a digit goes and why.' });
    for (const id of ['pb-play', 'pb-step', 'pb-end']) $(id).disabled = false;
    paintAll();
    readout();
    DLX.stepLog.add([{ kind: 'info', main: `Start: ${trace.givens} given digit${trace.givens === 1 ? '' : 's'} cover ${trace.givens * 4} of the 324 constraints.`, because: 'Algorithm X picks the requirement with the fewest options, tries one, and backtracks on a dead end.' }], { current: false });
    document.dispatchEvent(new CustomEvent('dlx:playback'));
    play();
  }

  function close() {
    if (!DLX.state.playback) return;
    pause();
    clearFocus();
    DLX.state.playback = false;
    document.body.dataset.playback = '';
    $('playback').hidden = true;
    trace = null;
    DLX.renderGrid();
    document.dispatchEvent(new CustomEvent('dlx:playback'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-visualize').addEventListener('click', open);
    $('pb-play').addEventListener('click', () => (playing ? pause() : play()));
    $('pb-step').addEventListener('click', step);
    $('pb-end').addEventListener('click', toEnd);
    $('pb-close').addEventListener('click', close);
    for (const b of document.querySelectorAll('.speed-btn')) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
    setSpeed(1);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DLX.state.playback && !document.querySelector('dialog[open]')) close();
    });
  });

  DLX.playback = { open, close };
})();
