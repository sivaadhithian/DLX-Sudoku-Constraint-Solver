# Architecture and Data Flow

```
Renderer (HTML/CSS/JS)  --window.solver-->  preload.js  --IPC-->  main.js  --stdin/stdout-->  sudoku_solver (C++)
```

| Layer | File | Responsibility |
|---|---|---|
| Renderer | `frontend/renderer.js`, `frontend/js/*` | Board, input, rule check, display of results |
| Bridge | `frontend/preload.js` | Exposes only `getStatus()` and `solvePuzzle(grid)` |
| Main | `frontend/main.js` | Validates the grid, runs the solver without a shell, normalises the JSON result |
| Solver | `backend/src/main.cpp` | Parses 81 cells, calls the solver, prints one JSON object |
| Reduction + search | `backend/src/sudoku_solver.cpp` | Sudoku -> exact cover, Algorithm X with the min-column heuristic |
| Data structure | `backend/src/dancing_links.cpp` | Circular doubly linked sparse matrix, `cover` / `uncover` |

## Solver protocol
Input: 81 characters on stdin (`1-9` clue, `0` or `.` empty). Output: one JSON line.

```json
{"status":"solved","solution":[[...]],"multipleSolutions":false,"solutionCount":1,
 "stats":{"executionMs":0.1,"recursiveCalls":82,"nodesVisited":1467,"backtracks":0}}
{"status":"no-solution","solutionCount":0,"stats":{...}}
{"status":"invalid","message":"..."}
```
Exit code 0 for solved / no-solution, 2 for invalid input.

## Exact-cover model
- 324 columns: 81 cell, 81 row-digit, 81 column-digit, 81 box-digit constraints.
- A candidate `(r, c, d)` is one row covering exactly four columns.
- A clue adds only its own candidate; an empty cell adds nine. Clues are therefore
  "pre-selected" without any special case in the search.
- The search stops after two solutions, which is enough to report "unique" or "multiple".

## Statistics
- `recursiveCalls`: calls to the Algorithm X search.
- `nodesVisited`: nodes unlinked by `cover` operations.
- `backtracks`: candidate rows that were tried and undone without producing a solution.
- `solutionCount` is capped at 2.

## Security
The renderer has no Node.js access. `main.js` accepts only a 9x9 grid of integers 0-9,
spawns the solver with `shell: false` and no user-controlled arguments, applies a 15 s
timeout and a 1 MB output cap, and forwards only whitelisted fields back to the renderer.
