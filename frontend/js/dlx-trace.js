/* Algorithm X on Dancing Links that RECORDS its moves, for the visual replay only.
 *
 * This is an illustration that runs in the browser. It never sets the board's solution and
 * never feeds the telemetry tiles; those come exclusively from the real solver backend.
 *
 * Event encoding (ints): kind * 729 + (row * 9 + col) * 9 + (digit - 1)
 *   kind 0 = try a placement, kind 1 = undo it (backtrack). */
(function () {
  'use strict';
  const DLX = window.DLX;

  function buildTrace(puzzle, maxEvents = 400000) {
    const N = 324;      // constraints: 81 cell + 81 row-digit + 81 column-digit + 81 box-digit
    const root = N;
    const L = [], R = [], U = [], D = [], C = [], S = new Array(N).fill(0);
    for (let i = 0; i <= N; i++) { L[i] = i - 1; R[i] = i + 1; U[i] = i; D[i] = i; C[i] = i; }
    L[0] = root; R[N - 1] = root; L[root] = N - 1; R[root] = 0; // circular header list (root links 0..N-1)

    const rowOf = []; // node -> encoded placement
    const givenNodes = [];

    function addRow(r, c, d) {
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const cols = [r * 9 + c, 81 + r * 9 + (d - 1), 162 + c * 9 + (d - 1), 243 + b * 9 + (d - 1)];
      const code = (r * 9 + c) * 9 + (d - 1);
      let first = -1;
      for (const col of cols) {
        const node = L.length;
        L[node] = R[node] = node; C[node] = col; rowOf[node] = code;
        U[node] = U[col]; D[node] = col; D[U[col]] = node; U[col] = node; S[col]++;
        if (first < 0) first = node;
        else { L[node] = L[first]; R[node] = first; R[L[first]] = node; L[first] = node; }
      }
      return first;
    }

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const given = puzzle[r][c];
        if (given) givenNodes.push(addRow(r, c, given));
        else for (let d = 1; d <= 9; d++) addRow(r, c, d);
      }
    }

    function cover(col) {
      R[L[col]] = R[col]; L[R[col]] = L[col];
      for (let i = D[col]; i !== col; i = D[i]) {
        for (let j = R[i]; j !== i; j = R[j]) { U[D[j]] = U[j]; D[U[j]] = D[j]; S[C[j]]--; }
      }
    }
    function uncover(col) {
      for (let i = U[col]; i !== col; i = U[i]) {
        for (let j = L[i]; j !== i; j = L[j]) { S[C[j]]++; U[D[j]] = j; D[U[j]] = j; }
      }
      R[L[col]] = col; L[R[col]] = col;
    }

    // Givens are fixed before the search starts, so they produce no replay events.
    for (const node of givenNodes) {
      cover(C[node]);
      for (let j = R[node]; j !== node; j = R[j]) cover(C[j]);
    }

    const events = [];
    let tries = 0, undos = 0;
    // 0 = dead end, 1 = solved, 2 = aborted (trace too long)
    function search() {
      if (R[root] === root) return 1;
      let col = R[root], best = S[col];
      for (let c = R[col]; c !== root; c = R[c]) if (S[c] < best) { best = S[c]; col = c; }
      if (best === 0) return 0;

      cover(col);
      for (let r = D[col]; r !== col; r = D[r]) {
        if (events.length >= maxEvents) return 2;
        events.push(rowOf[r]); tries++;
        for (let j = R[r]; j !== r; j = R[j]) cover(C[j]);
        const res = search();
        if (res !== 0) return res;
        for (let j = L[r]; j !== r; j = L[j]) uncover(C[j]);
        events.push(729 + rowOf[r]); undos++;
      }
      uncover(col);
      return 0;
    }

    const result = search();
    return { events, solved: result === 1, truncated: result === 2, tries, undos };
  }

  DLX.buildTrace = buildTrace;
})();
