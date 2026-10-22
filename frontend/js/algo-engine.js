/* Dancing Links at pointer level, for the "Algorithmic visualisation".
 *
 * A matrix is the classic DLX structure: node 0 is the root header `h`, nodes 1..N are the
 * column headers, and every 1 in the matrix is a node with four pointers L, R, U, D. `run()`
 * executes Algorithm X on it as a generator that yields one event per pointer read or write,
 * so a viewer can make exactly the pointer being used glow.
 *
 * Pure logic, no DOM: it is also loaded by the Node tests.
 *
 * Event: { phase, text, glows: [{ node, dir, kind: 'read'|'write' }], focus, depth,
 *          place?: rowIndex, unplace?: rowIndex }
 * phases: choose | cover | try | uncover | backtrack | solution | dead-end
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const DLX = root.DLX || (root.DLX = {});
  const H = 0;

  /** columns: [{ name, meta? }], rows: [{ label, cols: [columnIndex...], meta? }] (column indexes 0-based). */
  function createMatrix(columns, rows) {
    const N = columns.length;
    const L = [], R = [], U = [], D = [], C = [], S = new Array(N + 1).fill(0), ROW = [];
    const col = [], rowIdx = [];   // grid position (in column / row units) of every node
    for (let i = 0; i <= N; i++) {
      L[i] = i === 0 ? N : i - 1;
      R[i] = i === N ? 0 : i + 1;
      U[i] = i; D[i] = i; C[i] = i; ROW[i] = -1;
      col[i] = i; rowIdx[i] = 0;
    }
    const rowNodes = [];
    rows.forEach((row, ri) => {
      const cols = row.cols.slice().sort((a, b) => a - b);
      let first = -1;
      const nodes = [];
      for (const cj of cols) {
        const header = cj + 1;
        const node = L.length;
        L[node] = R[node] = node;
        C[node] = header; ROW[node] = ri; col[node] = header; rowIdx[node] = ri + 1;
        U[node] = U[header]; D[node] = header; D[U[header]] = node; U[header] = node; S[header]++;
        if (first < 0) first = node;
        else { L[node] = L[first]; R[node] = first; R[L[first]] = node; L[first] = node; }
        nodes.push(node);
      }
      rowNodes.push(nodes);
    });
    return { N, L, R, U, D, C, S, ROW, col, rowIdx, columns, rows, rowNodes, nodeCount: L.length };
  }

  /** Knuth's 7-column example (the diagram in the reference image). */
  function sampleMatrix() {
    const columns = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: String(n) }));
    const rows = [[1, 4, 7], [1, 4], [4, 5, 7], [3, 5, 6], [2, 3, 6, 7], [2, 7]]
      .map((cols, i) => ({ label: `row ${i + 1}`, cols: cols.map((c) => c - 1) }));
    return { matrix: createMatrix(columns, rows), cellColumn: null };
  }

  const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  /** The exact-cover matrix of a Sudoku with the given digits already fixed: only the
   *  columns and candidate rows that are still open are present. cellColumn maps each empty
   *  cell to its column header node, so the board squares can point into the structure. */
  function puzzleMatrix(grid) {
    const usedRow = Array.from({ length: 9 }, () => Array(10).fill(false));
    const usedCol = Array.from({ length: 9 }, () => Array(10).fill(false));
    const usedBox = Array.from({ length: 9 }, () => Array(10).fill(false));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const d = grid[r][c];
        if (d) { usedRow[r][d] = true; usedCol[c][d] = true; usedBox[boxOf(r, c)][d] = true; }
      }
    }
    const columns = [], index = new Map();
    const add = (key, name, meta) => { index.set(key, columns.length); columns.push({ name, meta }); };
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!grid[r][c]) add(`x${r}${c}`, `r${r + 1}c${c + 1}`, { type: 'cell', r, c });
    for (let r = 0; r < 9; r++) for (let d = 1; d <= 9; d++) if (!usedRow[r][d]) add(`r${r}${d}`, `R${r + 1}=${d}`, { type: 'row', r, d });
    for (let c = 0; c < 9; c++) for (let d = 1; d <= 9; d++) if (!usedCol[c][d]) add(`c${c}${d}`, `C${c + 1}=${d}`, { type: 'col', c, d });
    for (let b = 0; b < 9; b++) for (let d = 1; d <= 9; d++) if (!usedBox[b][d]) add(`b${b}${d}`, `B${b + 1}=${d}`, { type: 'box', b, d });

    const rows = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c]) continue;
        for (let d = 1; d <= 9; d++) {
          const b = boxOf(r, c);
          if (usedRow[r][d] || usedCol[c][d] || usedBox[b][d]) continue;
          rows.push({
            label: `${d} @ r${r + 1}c${c + 1}`,
            cols: [index.get(`x${r}${c}`), index.get(`r${r}${d}`), index.get(`c${c}${d}`), index.get(`b${b}${d}`)],
            meta: { r, c, d },
          });
        }
      }
    }
    const cellColumn = {};
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!grid[r][c]) cellColumn[r * 9 + c] = index.get(`x${r}${c}`) + 1;
    return { matrix: createMatrix(columns, rows), cellColumn };
  }

  /** Is this node still reachable through its neighbours' pointers? (false once unlinked by cover) */
  function isLinked(m, n) {
    if (n === H) return true;
    if (n <= m.N) return m.R[m.L[n]] === n;
    return m.D[m.U[n]] === n;
  }

  /** Run Algorithm X on the matrix, one pointer access per yielded event. Mutates the matrix. */
  function* run(m) {
    const { L, R, U, D, C, S } = m;
    const name = (c) => m.columns[c - 1].name;
    const rd = (node, dir) => ({ node, dir, kind: 'read' });
    const wr = (node, dir) => ({ node, dir, kind: 'write' });
    let depth = 0;
    const ev = (phase, text, glows, focus, extra) => ({ phase, text, glows, focus, depth, ...extra });

    function* cover(c) {
      yield ev('cover', `Cover column ${name(c)}: first read its left and right neighbours in the header list.`, [rd(c, 'L'), rd(c, 'R')], c);
      R[L[c]] = R[c];
      yield ev('cover', `R[L[${name(c)}]] ← R[${name(c)}]: the header on the left now skips column ${name(c)}.`, [wr(L[c], 'R')], L[c]);
      L[R[c]] = L[c];
      yield ev('cover', `L[R[${name(c)}]] ← L[${name(c)}]: the header on the right now skips it too. Column ${name(c)} is out of the header list.`, [wr(R[c], 'L')], R[c]);
      yield ev('cover', `Follow D from the header to the first row that uses column ${name(c)}.`, [rd(c, 'D')], D[c]);
      for (let i = D[c]; i !== c; i = D[i]) {
        let j = R[i];
        yield ev('cover', 'Follow R along this row to reach its other nodes.', [rd(i, 'R')], j);
        for (; j !== i; j = R[j]) {
          const up = U[j], down = D[j], col = C[j];
          U[down] = up;
          yield ev('cover', `U[D[node]] ← U[node]: the node below now points up past this node. Unlinks it from column ${name(col)}.`, [wr(down, 'U')], down);
          D[up] = down;
          S[col]--;
          yield ev('cover', `D[U[node]] ← D[node]: the node above now points down past it. Size of column ${name(col)} is now ${S[col]}.`, [wr(up, 'D')], up);
          yield ev('cover', 'Follow R to the next node of this row.', [rd(j, 'R')], R[j]);
        }
        yield ev('cover', `Row finished. Follow D to the next row in column ${name(c)}.`, [rd(i, 'D')], D[i]);
      }
    }

    function* uncover(c) {
      yield ev('uncover', `Uncover column ${name(c)}: walk up its rows (U) in the opposite order.`, [rd(c, 'U')], U[c]);
      for (let i = U[c]; i !== c; i = U[i]) {
        let j = L[i];
        yield ev('uncover', 'Follow L along this row to its other nodes.', [rd(i, 'L')], j);
        for (; j !== i; j = L[j]) {
          const up = U[j], down = D[j], col = C[j];
          S[col]++;
          U[down] = j;
          yield ev('uncover', `U[D[node]] ← node: the node below points back up to it. Size of column ${name(col)} is now ${S[col]}.`, [wr(down, 'U')], down);
          D[up] = j;
          yield ev('uncover', 'D[U[node]] ← node: the node above points back down to it. The node is relinked.', [wr(up, 'D')], up);
          yield ev('uncover', 'Follow L to the next node of this row.', [rd(j, 'L')], L[j]);
        }
        yield ev('uncover', 'Row relinked. Follow U to the next row.', [rd(i, 'U')], U[i]);
      }
      R[L[c]] = c;
      yield ev('uncover', `R[L[${name(c)}]] ← ${name(c)}: the left header points to it again.`, [wr(L[c], 'R')], L[c]);
      L[R[c]] = c;
      yield ev('uncover', `L[R[${name(c)}]] ← ${name(c)}: the right header points back. Column ${name(c)} is restored.`, [wr(R[c], 'L')], R[c]);
    }

    function* search() {
      yield ev('choose', 'Read R[h]: if it points back to h, no columns are left and every constraint is covered.', [rd(H, 'R')], R[H]);
      if (R[H] === H) {
        yield ev('solution', 'R[h] points to h: the header list is empty. Every constraint is covered exactly once. Solution found.', [rd(H, 'R')], H);
        return true;
      }
      let best = R[H];
      yield ev('choose', `Scan the headers with R to find the smallest column. ${name(best)} has size ${S[best]}: best so far.`, [rd(H, 'R')], best);
      for (let c = R[best]; c !== H; c = R[c]) {
        const better = S[c] < S[best];
        if (better) best = c;
        yield ev('choose', `Follow R to column ${name(c)} (size ${S[c]}). ${better ? 'Smaller: new minimum.' : `Not smaller than ${name(best)} (size ${S[best]}).`}`, [rd(L[c], 'R')], c);
      }
      yield ev('choose', `Choose column ${name(best)} (size ${S[best]}): the fewest options, so it fails fastest if it must.`, [rd(R[best] === H ? best : best, 'R')], best);
      if (S[best] === 0) {
        yield ev('dead-end', `Column ${name(best)} has size 0: nothing can cover it. Dead end, so backtrack.`, [], best);
        return false;
      }
      yield* cover(best);
      for (let r = D[best]; r !== best; r = D[r]) {
        yield ev('try', `Try this row (${m.rows[m.ROW[r]].label}): it will cover every column it touches.`, [rd(best, 'D')], r, { place: m.ROW[r] });
        let j = R[r];
        for (; j !== r; j = R[j]) {
          yield ev('try', 'Follow R to the next column this row touches and cover it.', [rd(L[j], 'R')], j, { place: m.ROW[r] });
          yield* cover(C[j]);
        }
        depth++;
        const solved = yield* search();
        depth--;
        if (solved) return true;
        for (j = L[r]; j !== r; j = L[j]) {
          yield ev('backtrack', 'Backtrack: follow L to the columns this row covered and uncover them in reverse.', [rd(R[j], 'L')], j);
          yield* uncover(C[j]);
        }
        yield ev('backtrack', `Undo row ${m.rows[m.ROW[r]].label}. Follow D to the next row in column ${name(best)}.`, [rd(r, 'D')], D[r], { unplace: m.ROW[r] });
      }
      yield* uncover(best);
      yield ev('backtrack', `Every row of column ${name(best)} failed. Column restored; go back one level.`, [], best);
      return false;
    }

    return yield* search();
  }

  DLX.algo = { H, createMatrix, sampleMatrix, puzzleMatrix, isLinked, run };
})();
