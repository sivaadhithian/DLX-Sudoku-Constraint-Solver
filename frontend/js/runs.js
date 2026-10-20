/* Run history: the last solver runs, a sparkline of execution time, and "vs last run"
 * deltas under the metric tiles. Only genuine backend numbers are recorded. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const $ = (id) => document.getElementById(id);
  const MAX_RUNS = 20;
  const SPARK_POINTS = 10;
  const LIST_ROWS = 5;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const runs = [];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const fmt = (v) => (v === null ? '--' : v.toLocaleString('en-US'));
  const fmtMs = (v) => (v === null ? '--' : `${v.toFixed(v < 10 ? 2 : 1)} ms`);

  const DELTAS = [
    { key: 'ms', id: 'ss-time-delta' },
    { key: 'backtracks', id: 'ss-backtracks-delta' },
    { key: 'nodes', id: 'ss-nodes-delta' },
  ];

  function clearDeltas() {
    for (const { id } of DELTAS) {
      const el = $(id);
      if (!el) continue;
      el.textContent = '';
      el.dataset.trend = '';
    }
  }

  function showDeltas(cur, prev) {
    for (const { key, id } of DELTAS) {
      const el = $(id);
      if (!el) continue;
      const a = cur[key];
      const b = prev ? prev[key] : null;
      el.textContent = '';
      el.dataset.trend = '';
      if (a === null || b === null) continue;
      if (b === 0) {
        if (a === 0) { el.textContent = 'Same as last run'; el.dataset.trend = 'flat'; }
        continue;
      }
      const pct = ((a - b) / b) * 100;
      if (Math.abs(pct) < 1) { el.textContent = 'Same as last run'; el.dataset.trend = 'flat'; continue; }
      const arrow = pct < 0 ? '↓' : '↑';
      el.textContent = `${arrow} ${Math.abs(pct).toFixed(0)}% vs last run`;
      el.dataset.trend = pct < 0 ? 'down' : 'up'; // lower is better
    }
  }

  function renderSpark() {
    const svg = $('run-spark');
    svg.textContent = '';
    const data = runs.map((r) => r.ms).filter((v) => v !== null).slice(-SPARK_POINTS);
    $('run-spark-empty').hidden = data.length >= 2;
    svg.hidden = data.length < 2;
    if (data.length < 2) return;

    const W = 240, H = 48, PAD = 5;
    const max = Math.max(...data), min = Math.min(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => [PAD + (i * (W - 2 * PAD)) / (data.length - 1), H - PAD - ((v - min) / span) * (H - 2 * PAD)]);

    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    line.setAttribute('class', 'spark-line');
    svg.appendChild(line);
    pts.forEach(([x, y], i) => {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', i === pts.length - 1 ? 3.2 : 2);
      dot.setAttribute('class', i === pts.length - 1 ? 'spark-dot spark-dot-last' : 'spark-dot');
      svg.appendChild(dot);
    });
  }

  function renderList() {
    const list = $('run-list');
    list.textContent = '';
    $('run-empty').hidden = runs.length > 0;
    $('run-clear').hidden = runs.length === 0;
    runs.slice(-LIST_ROWS).reverse().forEach((run) => {
      const li = document.createElement('li');
      li.className = 'run-row';
      const cells = [
        [`#${run.n}`, 'run-n'],
        [run.status === 'solved' ? 'Solved' : 'No solution', `run-status run-${run.status}`],
        [`${run.clues} clues`, 'run-clues'],
        [fmtMs(run.ms), 'run-ms'],
        [`${fmt(run.backtracks)} bt`, 'run-bt'],
      ];
      for (const [text, cls] of cells) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      }
      list.appendChild(li);
    });
  }

  let counter = 0;
  function add({ status, stats, solutionCount }) {
    const s = stats || {};
    const run = {
      n: ++counter,
      status,
      clues: DLX.state.original.reduce((n, row) => n + row.filter((v) => v !== 0).length, 0),
      ms: num(s.executionMs),
      backtracks: num(s.backtracks),
      nodes: num(s.nodesVisited),
      calls: num(s.recursiveCalls),
      solutions: num(solutionCount),
    };
    const prev = runs.length ? runs[runs.length - 1] : null;
    runs.push(run);
    if (runs.length > MAX_RUNS) runs.shift();
    showDeltas(run, prev);
    renderSpark();
    renderList();
  }

  function clearAllRuns() {
    runs.length = 0;
    clearDeltas();
    renderSpark();
    renderList();
  }

  const last = () => (runs.length ? runs[runs.length - 1] : null);

  document.addEventListener('DOMContentLoaded', () => {
    $('run-clear').addEventListener('click', clearAllRuns);
    renderSpark();
    renderList();
  });

  DLX.runs = { add, last, clearDeltas, clear: clearAllRuns };
})();
