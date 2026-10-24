# Time and Space Complexity

Let N = 9 (grid side), so there are N^2 = 81 cells, N^3 = 729 candidates and 4N^2 = 324 constraints.

## Building the matrix
- At most N^3 candidate rows with 4 nodes each: O(N^3) time and space (2,916 nodes + 325 headers).

## cover / uncover
- `cover(c)` visits every row in column `c` and unlinks that row's other nodes: O(rows x 4) = O(N) here.
- `uncover(c)` is the exact reverse and costs the same. Both are constant-time per node.

## Algorithm X search
- Worst case is exponential in the number of empty cells, as for any backtracking search
  (Sudoku generalised to N^2 x N^2 is NP-complete).
- Choosing the column with the fewest rows (the S heuristic) prunes aggressively: most
  puzzles need very few branches, and a column of size 0 ends a branch immediately.
- Recursion depth is at most 81 (one level per cell).

## Space
- Matrix: O(N^3). Recursion stack and partial solution: O(N^2).
- No allocation happens during the search; DLX restores the matrix in place.

## Measured (this implementation, release build)
| Puzzle | Recursive calls | Backtracks | Time |
|---|---|---|---|
| Classic easy | 82 | 0 | ~0.1 ms |
| Arto Inkala "hardest" | 2,741 | 2,659 | ~1.6 ms |
