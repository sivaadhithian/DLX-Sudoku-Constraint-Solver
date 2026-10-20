/* Export: copy the last run's metrics as text, copy / paste the puzzle, save a PNG snapshot. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE } = DLX.constants;
  const fmt = (v) => (v === null || v === undefined ? '--' : v.toLocaleString('en-US'));
  const fmtMs = (v) => (v === null || v === undefined ? '--' : `${v.toFixed(v < 10 ? 2 : 1)} ms`);

  /** The board as nine lines of nine characters (0 = empty): same format as Load custom. */
  function boardText() {
    return DLX.state.grid.map((row) => row.join('')).join('\n');
  }

  async function copyPuzzle() {
    if (DLX.isGridEmpty(DLX.state.grid)) { DLX.toast('The board is empty. Nothing to copy.', { tone: 'warn' }); return; }
    const ok = await DLX.copyText(boardText());
    DLX.toast(ok ? 'Puzzle copied (9 lines, 0 = empty).' : 'Could not copy to the clipboard.', { tone: ok ? 'ok' : 'bad' });
  }

  function metricsText(run) {
    return [
      'DLX Solver run',
      `Puzzle: ${run.clues} clues`,
      `Status: ${run.status === 'solved' ? 'Solved' : 'No solution'}`,
      `Execution time: ${fmtMs(run.ms)}`,
      `Backtracks: ${fmt(run.backtracks)}`,
      `Nodes visited: ${fmt(run.nodes)}`,
      `Solutions found: ${fmt(run.solutions)}`,
      `Recursive calls: ${fmt(run.calls)}`,
    ].join('\n');
  }

  async function copyMetrics() {
    const run = DLX.runs.last();
    if (!run) { DLX.toast('No run to copy yet. Solve a puzzle first.', { tone: 'warn' }); return; }
    const ok = await DLX.copyText(metricsText(run));
    DLX.toast(ok ? 'Metrics copied.' : 'Could not copy to the clipboard.', { tone: ok ? 'ok' : 'bad' });
  }

  /* ----- PNG snapshot, drawn from the current theme's colors ----- */
  function savePng() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    const mono = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    const ui = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const S = 2; // pixel scale for a crisp image
    const W = 980, H = 560;
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);

    ctx.fillStyle = v('--bg');
    ctx.fillRect(0, 0, W, H);

    // title
    ctx.fillStyle = v('--text');
    ctx.font = `650 18px ${ui}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('DLX SOLVER', 40, 52);
    ctx.fillStyle = v('--muted');
    ctx.font = `13px ${ui}`;
    ctx.fillText('Sudoku & Constraint Solver · Algorithm X + Dancing Links', 40, 74);

    // board
    const cell = 46, bx = 40, by = 100, size = cell * SIZE;
    ctx.fillStyle = v('--cell-bg');
    ctx.fillRect(bx, by, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const val = DLX.getValue(r, c);
        if (!val) continue;
        const kind = DLX.getCellKind(r, c);
        ctx.fillStyle = kind === 'clue' ? v('--text') : kind === 'solved' ? v('--ok') : v('--info');
        ctx.font = `${kind === 'clue' ? 700 : 500} 24px ${mono}`;
        ctx.fillText(String(val), bx + c * cell + cell / 2, by + r * cell + cell / 2 + 1);
      }
    }
    ctx.strokeStyle = v('--cell-line');
    ctx.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
      if (i % 3 === 0) continue;
      ctx.beginPath(); ctx.moveTo(bx + i * cell, by); ctx.lineTo(bx + i * cell, by + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + i * cell); ctx.lineTo(bx + size, by + i * cell); ctx.stroke();
    }
    ctx.strokeStyle = v('--box-line');
    ctx.lineWidth = 2;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(bx + i * cell * 3, by); ctx.lineTo(bx + i * cell * 3, by + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + i * cell * 3); ctx.lineTo(bx + size, by + i * cell * 3); ctx.stroke();
    }

    // metrics from the last recorded run
    const run = DLX.runs.last();
    const tiles = [
      ['Execution time', run ? fmtMs(run.ms) : '--'],
      ['Backtracks', run ? fmt(run.backtracks) : '--'],
      ['Nodes visited', run ? fmt(run.nodes) : '--'],
      ['Solutions found', run ? fmt(run.solutions) : '--'],
    ];
    const tx = 500, ty = 100, tw = 220, th = 100, gap = 20;
    tiles.forEach(([label, value], i) => {
      const x = tx + (i % 2) * (tw + gap);
      const y = ty + Math.floor(i / 2) * (th + gap);
      ctx.fillStyle = v('--panel');
      ctx.strokeStyle = v('--line-strong');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, tw, th, 10); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = v('--muted');
      ctx.font = `12px ${ui}`;
      ctx.fillText(label, x + 16, y + 30);
      ctx.fillStyle = v('--text');
      ctx.font = `500 26px ${mono}`;
      ctx.fillText(value, x + 16, y + 72);
    });

    ctx.fillStyle = v('--muted');
    ctx.font = `12px ${ui}`;
    const clues = DLX.state.original.reduce((n, row) => n + row.filter((x) => x).length, 0);
    ctx.fillText(run ? `${clues} clues · ${run.status === 'solved' ? 'solved' : 'no solution'} · ${new Date().toLocaleString()}` : `${clues} clues · no run recorded · ${new Date().toLocaleString()}`, tx, 360);

    canvas.toBlob((blob) => {
      if (!blob) { DLX.toast('Could not create the image.', { tone: 'bad' }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dlx-solver-snapshot.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      DLX.toast('Snapshot saved as PNG.', { tone: 'ok' });
    }, 'image/png');
  }

  Object.assign(DLX, { boardText, copyPuzzle, copyMetrics, savePng });
})();
