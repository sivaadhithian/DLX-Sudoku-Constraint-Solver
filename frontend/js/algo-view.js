/* "Algorithmic visualisation": a full-screen view of the Dancing Links structure.
 * It draws the header h, the column headers (name:size), the nodes and their four pointers
 * (L red, R green, U orange, D blue) as in a textbook diagram, and steps Algorithm X one
 * pointer at a time. The pointer being read or written glows. The arrows are drawn from the
 * live pointer arrays, so when a row is unlinked you see the neighbours' arrows jump past it.
 *
 * Illustrative, browser-side: it is not a recording of the backend's own run. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const A = DLX.algo;
  const $ = (id) => document.getElementById(id);

  const BASE_RATE = 3;        // pointer steps per second at 1x
  const GLOW_MS = 1100;
  const SEEK_BUDGET_MS = 12;  // time slice per frame while running to the next move

  const LAYOUT = {
    sample: { gx: 170, gy: 150, node: 17, head: [46, 46], root: [28, 28], font: 26, xL: -0.95, xR: 1.85, yT: -0.85, yB: 1.4 },
    puzzle: { gx: 120, gy: 64, node: 10, head: [44, 15], root: [14, 14], font: 14, xL: -2.4, xR: 1.9, yT: -1.2, yB: 1.6 },
  };
  const PHASES = {
    choose: 'Choose a column', cover: 'Cover', try: 'Try a row', uncover: 'Uncover',
    backtrack: 'Backtrack', solution: 'Solution found', 'dead-end': 'Dead end', ready: 'Ready',
  };

  // ---- state -------------------------------------------------------------------------
  let mode = 'sample', cfg = LAYOUT.sample;
  let m = null, cellColumn = null, givens = null, gen = null, ev = null, finished = false;
  let steps = 0, reads = 0, writes = 0, maxDepth = 0;
  let placed = [];                           // row indexes currently chosen by the search
  const glows = new Map();                   // "node:dir" -> { t0, kind }
  let cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  let follow = true, playing = false, speed = 1, seeking = false, carry = 0, lastT = 0, raf = 0;
  let size = { w: 800, h: 600, dpr: 1 }, theme = null, dirty = true, statsDirty = true;
  let ctx = null, observer = null, themeObserver = null;

  // ---- geometry ----------------------------------------------------------------------
  const pos = (n) => ({ x: m.col[n] * cfg.gx, y: m.rowIdx[n] * cfg.gy });
  function half(n) {
    if (n === 0) return cfg.root;
    if (n <= m.N) return cfg.head;
    return [cfg.node, cfg.node];
  }
  const margins = () => ({
    xL: cfg.xL * cfg.gx, xR: (m.N + cfg.xR) * cfg.gx,
    yT: cfg.yT * cfg.gy, yB: (m.rowNodes.length + cfg.yB) * cfg.gy,
  });
  const DIRS = { L: [-1, 0, 0, -3], R: [1, 0, 0, 3], U: [0, -1, 3, 0], D: [0, 1, -3, 0] }; // dx, dy, offset x, offset y

  /** Line for pointer `dir` of node n: from its edge to the target's edge, or a stub to the
   *  margin when the pointer wraps around (like the arrows leaving the diagram in a textbook figure). */
  function segment(n, dir) {
    const t = m[dir][n];
    const p = pos(n), q = pos(t), hs = half(n), ht = half(t);
    const [dx, dy, ox, oy] = DIRS[dir];
    const natural = t !== n && (dir === 'R' ? q.x > p.x : dir === 'L' ? q.x < p.x : dir === 'D' ? q.y > p.y : q.y < p.y);
    const x1 = p.x + dx * hs[0] + ox, y1 = p.y + dy * hs[1] + oy;
    let x2, y2;
    if (natural) { x2 = q.x - dx * ht[0] + ox; y2 = q.y - dy * ht[1] + oy; }
    else {
      const mg = margins();
      x2 = dir === 'R' ? mg.xR : dir === 'L' ? mg.xL : p.x + ox;
      y2 = dir === 'D' ? mg.yB : dir === 'U' ? mg.yT : p.y + oy;
    }
    return { x1, y1, x2, y2, natural };
  }

  const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + size.w / 2, y: (y - cam.y) * cam.z + size.h / 2 });
  const toWorld = (sx, sy) => ({ x: (sx - size.w / 2) / cam.z + cam.x, y: (sy - size.h / 2) / cam.z + cam.y });

  function worldBounds() {
    const mg = margins();
    return { x0: mg.xL - (mode === 'puzzle' ? 130 : 40), x1: mg.xR + 40, y0: mg.yT - 30, y1: mg.yB + 30 };
  }
  function fit() {
    const b = worldBounds();
    const z = Math.min(size.w / (b.x1 - b.x0), size.h / (b.y1 - b.y0)) * 0.94;
    cam.z = cam.tz = z;
    cam.x = cam.tx = (b.x0 + b.x1) / 2;
    cam.y = cam.ty = (b.y0 + b.y1) / 2;
    dirty = true;
  }

  // ---- theme -------------------------------------------------------------------------
  function readTheme() {
    const dark = document.documentElement.dataset.theme !== 'light';
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    theme = dark
      ? { L: '#ff6464', R: '#46c37b', U: '#ffb347', D: '#6f8fff', node: '#202028', head: '#26262e', stroke: '#c9c9d2', text: '#f2f2f3', ghost: '#5a5a66', label: v('--text-2') }
      : { L: '#ff0000', R: '#008000', U: '#ffa500', D: '#0000ff', node: '#fffff0', head: '#fffff0', stroke: '#111111', text: '#111111', ghost: '#b8b8b0', label: v('--text-2') };
    dirty = true;
  }

  // ---- drawing -----------------------------------------------------------------------
  function arrow(x1, y1, x2, y2, color, lw, head, glow) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (head) {
      const a = Math.atan2(y2 - y1, x2 - x1), s = 0.42;
      ctx.moveTo(x2 - head * Math.cos(a - s), y2 - head * Math.sin(a - s));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a + s), y2 - head * Math.sin(a + s));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function visible(x1, y1, x2, y2, vb) {
    return !(Math.max(x1, x2) < vb.x0 || Math.min(x1, x2) > vb.x1 || Math.max(y1, y2) < vb.y0 || Math.min(y1, y2) > vb.y1);
  }

  function draw(now) {
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const tl = toWorld(0, 0), br = toWorld(size.w, size.h);
    const vb = { x0: tl.x - 80, y0: tl.y - 80, x1: br.x + 80, y1: br.y + 80 };
    const z = cam.z;
    const lw = Math.max(1.3, 1.6 * z) / z;       // about 1.6 screen px at any zoom
    const head = z < 0.28 ? 0 : Math.max(9, 7 / z * Math.min(1, z * 1.6));

    ctx.save();
    ctx.translate(size.w / 2, size.h / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    ctx.lineJoin = 'round';

    // 1. normal pointers of everything linked
    const total = m.nodeCount;
    for (let n = 0; n < total; n++) {
      if (!A.isLinked(m, n)) continue;
      for (const dir of ['L', 'R', 'U', 'D']) {
        const g = glows.get(`${n}:${dir}`);
        if (g && now - g.t0 < GLOW_MS) continue; // drawn in the glow pass
        const s = segment(n, dir);
        if (!visible(s.x1, s.y1, s.x2, s.y2, vb)) continue;
        arrow(s.x1, s.y1, s.x2, s.y2, theme[dir], lw, head);
      }
    }

    // 2. glowing pointers (any node, even one just unlinked)
    let anyGlow = false;
    for (const [key, g] of glows) {
      const age = now - g.t0;
      if (age >= GLOW_MS) { glows.delete(key); continue; }
      anyGlow = true;
      const [ns, dir] = key.split(':');
      const s = segment(+ns, dir);
      const k = 1 - age / GLOW_MS;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      arrow(s.x1, s.y1, s.x2, s.y2, theme[dir], lw * (2 + 2.2 * k), head * 1.5, 26 * k * Math.max(1, 1 / z * 0.6));
      ctx.globalAlpha = 1;
      arrow(s.x1, s.y1, s.x2, s.y2, '#ffffff', lw * 0.7, 0);
    }

    // 3. nodes
    const showText = z * cfg.font >= 6.5;
    ctx.font = `${cfg.font}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let n = 0; n < total; n++) {
      const p = pos(n), hs = half(n);
      if (p.x + hs[0] < vb.x0 || p.x - hs[0] > vb.x1 || p.y + hs[1] < vb.y0 || p.y - hs[1] > vb.y1) continue;
      const linked = A.isLinked(m, n);
      const isHead = n <= m.N;
      ctx.globalAlpha = linked ? 1 : 0.3;
      ctx.fillStyle = isHead ? theme.head : theme.node;
      ctx.strokeStyle = linked ? theme.stroke : theme.ghost;
      ctx.lineWidth = Math.max(1.4, 1.4 * z) / z * (isHead ? 1.2 : 1);
      ctx.fillRect(p.x - hs[0], p.y - hs[1], hs[0] * 2, hs[1] * 2);
      ctx.strokeRect(p.x - hs[0], p.y - hs[1], hs[0] * 2, hs[1] * 2);
      if (showText && isHead) {
        ctx.fillStyle = theme.text;
        ctx.fillText(n === 0 ? 'h' : `${m.columns[n - 1].name}:${m.S[n]}`, p.x, p.y + 1);
      } else if (showText && !isHead && mode === 'puzzle' && z > 0.7) {
        ctx.fillStyle = theme.text;
        ctx.font = `${cfg.font - 3}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillText(String(m.rows[m.ROW[n]].meta.d), p.x, p.y + 1);
        ctx.font = `${cfg.font}px ui-monospace, Menlo, Consolas, monospace`;
      }
      ctx.globalAlpha = 1;
    }

    // 4. focus ring on the node the algorithm is looking at
    if (ev && ev.focus !== undefined) {
      const p = pos(ev.focus), hs = half(ev.focus);
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = (2 + pulse * 1.5) / z;
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 14;
      const pad = 5 / z + 2;
      ctx.strokeRect(p.x - hs[0] - pad, p.y - hs[1] - pad, (hs[0] + pad) * 2, (hs[1] + pad) * 2);
      ctx.shadowBlur = 0;
    }

    // 5. row labels in the left gutter (puzzle mode)
    if (mode === 'puzzle' && z > 0.45) {
      ctx.fillStyle = theme.label;
      ctx.font = `${cfg.font - 2}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'right';
      const mg = margins();
      m.rowNodes.forEach((nodes, ri) => {
        const y = (ri + 1) * cfg.gy;
        if (y < vb.y0 || y > vb.y1 || !nodes.length || !A.isLinked(m, nodes[0])) return;
        ctx.fillText(m.rows[ri].label, mg.xL - 10, y);
      });
    }
    ctx.restore();
    return anyGlow;
  }

  // ---- stepping ----------------------------------------------------------------------
  function resetRun() {
    const built = mode === 'sample' ? A.sampleMatrix() : A.puzzleMatrix(givens);
    m = built.matrix;
    cellColumn = built.cellColumn;
    cfg = LAYOUT[mode];
    gen = A.run(m);
    ev = null; finished = false; steps = reads = writes = maxDepth = 0;
    placed = []; glows.clear(); playing = false; seeking = false; carry = 0;
    $('algo-phase').textContent = PHASES.ready;
    $('algo-phase').dataset.phase = 'ready';
    $('algo-caption').textContent = mode === 'sample'
      ? 'This is the 7-column example from the textbook diagram. Press Play or Step. Each pointer glows as it is followed.'
      : 'This is the exact-cover matrix of your current puzzle, with the given digits already removed. Press Play, Step, or Next move.';
    fit();
    updateBoard();
    syncButtons();
    statsDirty = true;
  }

  function apply(e) {
    ev = e;
    steps++;
    const now = performance.now();
    for (const g of e.glows) {
      glows.set(`${g.node}:${g.dir}`, { t0: now, kind: g.kind });
      if (g.kind === 'read') reads++; else writes++;
    }
    if (e.depth > maxDepth) maxDepth = e.depth;
    if (e.place !== undefined && !placed.includes(e.place)) placed.push(e.place);
    if (e.unplace !== undefined) placed = placed.filter((x) => x !== e.unplace);
    $('algo-phase').textContent = PHASES[e.phase] || e.phase;
    $('algo-phase').dataset.phase = e.phase;
    $('algo-caption').textContent = e.text;
    if (follow && e.focus !== undefined) {
      const p = pos(e.focus);
      cam.tx = p.x; cam.ty = p.y;
      if (mode === 'puzzle') cam.tz = Math.max(cam.tz, 0.8);
    }
    statsDirty = true;
    dirty = true;
  }

  function advance() {
    if (finished) return false;
    const r = gen.next();
    if (r.done) { finished = true; playing = false; syncButtons(); return false; }
    apply(r.value);
    if (r.value.phase === 'solution') { finished = true; playing = false; syncButtons(); }
    return true;
  }

  const isMove = (e) => e.phase === 'try' && e.place !== undefined && e.glows[0] && e.glows[0].dir === 'D' ||
    e.phase === 'solution' || e.phase === 'dead-end' || (e.phase === 'backtrack' && e.unplace !== undefined);

  /** Run (in short slices, so the page stays responsive) until the next row is tried or undone. */
  function seekNextMove() {
    seeking = true; playing = false;
    syncButtons();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    if (seeking) {
      const until = performance.now() + SEEK_BUDGET_MS;
      let guard = 0;
      while (performance.now() < until && guard++ < 200000) {
        if (!advance()) { seeking = false; break; }
        if (isMove(ev)) { seeking = false; break; }
      }
      if (!seeking) syncButtons();
    } else if (playing) {
      carry += dt * BASE_RATE * speed;
      let n = Math.floor(carry);
      carry -= n;
      n = Math.min(n, 400);
      while (n-- > 0 && advance()) { /* apply */ }
    }

    if (follow) {
      const k = 1 - Math.pow(0.0008, dt);
      cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;
    }
    draw(now);
    if (statsDirty) { statsDirty = false; updateStats(); updateBoard(); }
  }

  // ---- mini board (puzzle mode) ------------------------------------------------------
  function regionOf(node) {
    const cells = new Set();
    let focus = -1;
    if (!m || node === undefined || node === 0) return { cells, focus };
    if (node <= m.N) {
      const meta = m.columns[node - 1].meta;
      if (!meta) return { cells, focus };
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          if ((meta.type === 'cell' && r === meta.r && c === meta.c) || (meta.type === 'row' && r === meta.r) ||
              (meta.type === 'col' && c === meta.c) || (meta.type === 'box' && b === meta.b)) cells.add(r * 9 + c);
        }
      }
      if (meta.type === 'cell') focus = meta.r * 9 + meta.c;
    } else {
      const meta = m.rows[m.ROW[node]].meta;
      if (meta) { cells.add(meta.r * 9 + meta.c); focus = meta.r * 9 + meta.c; }
    }
    return { cells, focus };
  }

  function buildBoard() {
    const el = $('algo-board');
    el.textContent = '';
    for (let i = 0; i < 81; i++) {
      const d = document.createElement('div');
      d.className = 'ab-cell';
      d.dataset.i = String(i);
      d.setAttribute('role', 'gridcell');
      if (i % 9 === 2 || i % 9 === 5) d.classList.add('box-r');
      if (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5) d.classList.add('box-b');
      el.appendChild(d);
    }
  }

  function updateBoard() {
    const wrap = $('algo-board-wrap');
    wrap.hidden = mode !== 'puzzle' || !givens;
    if (wrap.hidden) return;
    const { cells, focus } = regionOf(ev ? ev.focus : undefined);
    const tent = new Map();
    for (const ri of placed) { const mt = m.rows[ri].meta; tent.set(mt.r * 9 + mt.c, mt.d); }
    const kids = $('algo-board').children;
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9, el = kids[i];
      const given = givens[r][c];
      const text = given ? String(given) : tent.has(i) ? String(tent.get(i)) : '';
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('given', Boolean(given));
      el.classList.toggle('tent', !given && tent.has(i));
      el.classList.toggle('region', cells.has(i));
      el.classList.toggle('focus', i === focus);
      el.classList.toggle('jump', !given && Boolean(cellColumn && cellColumn[i] && A.isLinked(m, cellColumn[i])));
    }
  }

  function updateStats() {
    $('algo-st-steps').textContent = steps.toLocaleString('en-US');
    $('algo-st-reads').textContent = reads.toLocaleString('en-US');
    $('algo-st-writes').textContent = writes.toLocaleString('en-US');
    $('algo-st-depth').textContent = `${ev ? ev.depth : 0} (max ${maxDepth})`;
  }

  function syncButtons() {
    const busy = finished;
    $('algo-play').textContent = playing ? 'Pause' : 'Play';
    $('algo-play').disabled = busy || seeking;
    $('algo-step').disabled = busy || seeking;
    $('algo-next').disabled = busy || seeking || mode === 'sample';
    $('algo-next').title = mode === 'sample' ? 'Next move is for the puzzle view; the sample is short enough to step through' : 'Run quickly until the next row is tried or undone';
  }

  // ---- mode, open, close -------------------------------------------------------------
  function setMode(next) {
    if (next === 'puzzle') {
      const assessment = DLX.assessBoard(DLX.state.grid);
      if (assessment.state === 'conflict') { DLX.toast('Fix the conflicting cells first, then open the puzzle view.', { tone: 'warn' }); return; }
      if (assessment.state === 'complete') { DLX.toast('The board is already complete: there is nothing left to cover.', { tone: 'warn' }); return; }
      givens = DLX.cloneGrid(DLX.state.grid);
    }
    mode = next;
    $('algo-mode-sample').setAttribute('aria-pressed', String(mode === 'sample'));
    $('algo-mode-puzzle').setAttribute('aria-pressed', String(mode === 'puzzle'));
    follow = mode === 'puzzle';
    $('algo-follow').checked = follow;
    resetRun();
  }

  function resize() {
    const stage = $('algo-stage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const canvas = $('algo-canvas');
    const firstTime = size.w === 800 && size.h === 600 && !canvas.width;
    size = { w: rect.width, h: rect.height, dpr };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    if (firstTime || !follow) fit();
    dirty = true;
  }

  function open() {
    const dialog = $('algo-dialog');
    if (dialog.open) return;
    dialog.showModal();
    ctx = $('algo-canvas').getContext('2d');
    readTheme();
    resize();
    setMode(mode === 'puzzle' && givens ? 'puzzle' : 'sample');
    cancelAnimationFrame(raf);
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    $('algo-close').focus();
  }

  function close() {
    const dialog = $('algo-dialog');
    playing = false; seeking = false;
    cancelAnimationFrame(raf);
    if (dialog.open) dialog.close();
  }

  function wire() {
    $('btn-algo').addEventListener('click', open);
    $('algo-close').addEventListener('click', close);
    $('algo-dialog').addEventListener('close', () => { playing = false; seeking = false; cancelAnimationFrame(raf); });
    $('algo-mode-sample').addEventListener('click', () => setMode('sample'));
    $('algo-mode-puzzle').addEventListener('click', () => setMode('puzzle'));
    $('algo-restart').addEventListener('click', resetRun);
    $('algo-play').addEventListener('click', () => { if (!finished) { playing = !playing; carry = 1; syncButtons(); } });
    $('algo-step').addEventListener('click', () => { playing = false; advance(); syncButtons(); });
    $('algo-next').addEventListener('click', seekNextMove);
    $('algo-fit').addEventListener('click', fit);
    $('algo-follow').addEventListener('change', (e) => { follow = e.target.checked; });
    for (const b of document.querySelectorAll('#algo-speed .speed-btn')) {
      b.addEventListener('click', () => {
        speed = Number(b.dataset.speed);
        for (const x of document.querySelectorAll('#algo-speed .speed-btn')) x.setAttribute('aria-checked', String(x === b));
      });
    }

    // pan and zoom
    const canvas = $('algo-canvas');
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      cam.x = cam.tx = drag.cx - (e.clientX - drag.x) / cam.z;
      cam.y = cam.ty = drag.cy - (e.clientY - drag.y) / cam.z;
    });
    const end = () => { drag = null; canvas.classList.remove('grabbing'); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('dblclick', fit);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const before = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const factor = Math.exp(-e.deltaY * 0.0015);
      cam.z = cam.tz = Math.min(3, Math.max(0.02, cam.z * factor));
      const after = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      cam.x = cam.tx = cam.x + (before.x - after.x);
      cam.y = cam.ty = cam.y + (before.y - after.y);
    }, { passive: false });

    // clicking an empty square on the mini board jumps to its column in the structure
    $('algo-board').addEventListener('click', (e) => {
      const el = e.target.closest('.ab-cell');
      if (!el || !cellColumn) return;
      const node = cellColumn[Number(el.dataset.i)];
      if (node && A.isLinked(m, node)) {
        const p = pos(node);
        cam.tx = p.x; cam.ty = p.y; cam.tz = Math.max(cam.z, 0.9);
        follow = true; $('algo-follow').checked = true;
      } else {
        DLX.toast('That square is already filled, so its column is out of the structure.', { duration: 2200 });
      }
    });

    observer = new ResizeObserver(() => { if ($('algo-dialog').open) resize(); });
    observer.observe($('algo-stage'));
    themeObserver = new MutationObserver(() => { if (ctx) readTheme(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    buildBoard();
  }

  document.addEventListener('DOMContentLoaded', wire);
  DLX.algoView = { open, close };
})();
