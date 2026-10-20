/* Visual replay of Algorithm X on the board. The replay works on its own copy of the grid and
 * paints cells directly; the real board state is untouched and is redrawn when it closes. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE } = DLX.constants;
  const $ = (id) => document.getElementById(id);

  // Speed slider position (1-8) -> events per second.
  const RATES = [0, 2, 5, 12, 30, 90, 300, 1200, 6000];
  const FLASH_BELOW_RATE = 100; // only flash backtracks when slow enough to see them

  let trace = null;   // { events, solved, truncated, tries, undos }
  let grid = null;    // replay grid
  let given = null;   // which cells are original givens
  let pos = 0;        // events applied so far
  let tries = 0, undos = 0;
  let playing = false;
  let raf = 0, lastT = 0, carry = 0;

  const rate = () => RATES[Number($('pb-speed').value)] || RATES[4];

  function decode(ev) {
    const kind = ev >= 729 ? 1 : 0;
    const x = ev % 729;
    const digit = (x % 9) + 1;
    const cell = (x - (digit - 1)) / 9;
    return { kind, r: Math.floor(cell / SIZE), c: cell % SIZE, digit };
  }

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

  function readout(text) {
    $('pb-readout').textContent = text ||
      `Step ${pos.toLocaleString('en-US')} of ${trace.events.length.toLocaleString('en-US')} · ${tries.toLocaleString('en-US')} tries · ${undos.toLocaleString('en-US')} backtracks`;
  }

  function finish() {
    pause();
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!given[r][c] && grid[r][c]) DLX.getCellEl(r, c).dataset.kind = trace.solved ? 'solved' : 'trying';
    readout(`${trace.solved ? 'Replay finished: a solution was reached' : 'Trace stopped early (limit reached)'} · ${tries.toLocaleString('en-US')} tries · ${undos.toLocaleString('en-US')} backtracks`);
    $('pb-play').disabled = true;
    $('pb-step').disabled = true;
    $('pb-end').disabled = true;
  }

  function applyOne(flash) {
    const { kind, r, c, digit } = decode(trace.events[pos]);
    grid[r][c] = kind === 0 ? digit : 0;
    if (kind === 0) tries++; else undos++;
    pos++;
    if (flash !== null) paint(r, c, kind === 1 && flash);
  }

  function frame(t) {
    if (!playing) return;
    carry += ((t - lastT) / 1000) * rate();
    lastT = t;
    const n = Math.floor(carry);
    if (n > 0) {
      carry -= n;
      const flash = rate() < FLASH_BELOW_RATE;
      for (let i = 0; i < n && pos < trace.events.length; i++) applyOne(flash);
      if (pos >= trace.events.length) { readout(); finish(); return; }
      readout();
    }
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || pos >= trace.events.length) return;
    playing = true;
    lastT = performance.now();
    carry = 0;
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
    if (pos < trace.events.length) applyOne(true);
    readout();
    if (pos >= trace.events.length) finish();
  }

  function toEnd() {
    pause();
    while (pos < trace.events.length) applyOne(null); // no painting while skipping
    paintAll();
    readout();
    finish();
  }

  function open() {
    if (DLX.state.playback || DLX.state.status === 'solving') return;
    const assessment = DLX.assessBoard(DLX.state.grid);
    if (assessment.state === 'conflict') { DLX.toast('Fix the conflicting cells before visualizing.', { tone: 'warn' }); return; }
    if (assessment.state === 'complete') { DLX.toast('The board is already complete.', { tone: 'warn' }); return; }

    // Any digits on the board are treated as givens for the replay.
    const puzzle = DLX.cloneGrid(DLX.state.grid);
    trace = DLX.buildTrace(puzzle);
    grid = DLX.cloneGrid(puzzle);
    given = puzzle.map((row) => row.map((v) => v !== 0));
    pos = tries = undos = 0;

    if (!trace.solved && !trace.truncated) {
      DLX.toast('Algorithm X found no solution for this board.', { tone: 'bad' });
      return;
    }

    DLX.state.playback = true;
    document.body.dataset.playback = 'on';
    $('playback').hidden = false;
    $('pb-play').disabled = false;
    $('pb-step').disabled = false;
    $('pb-end').disabled = false;
    paintAll();
    readout();
    document.dispatchEvent(new CustomEvent('dlx:playback'));
    play();
  }

  function close() {
    if (!DLX.state.playback) return;
    pause();
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DLX.state.playback && !document.querySelector('dialog[open]')) close();
    });
  });

  DLX.playback = { open, close };
})();
