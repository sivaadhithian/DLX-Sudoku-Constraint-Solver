# Viva Questions

1. **What is an exact cover problem?** Given a set of constraints and a set of candidate rows,
   choose rows so that every constraint is satisfied by exactly one chosen row.
2. **How is Sudoku an exact cover problem?** 324 constraints (cell, row-digit, column-digit,
   box-digit) and 729 candidates `(r, c, d)`, each satisfying exactly four.
3. **What is Algorithm X?** A recursive backtracking algorithm: pick a constraint, try each row
   that satisfies it, remove all conflicting rows and satisfied constraints, recurse, restore.
4. **What are Dancing Links?** Knuth's technique of storing the matrix as circular doubly linked
   lists so a node can be removed with `L[R[x]] = L[x]; R[L[x]] = R[x]` and restored with the
   reverse assignments, using the removed node's own remembered pointers.
5. **Why must `uncover` run in reverse order?** Each node remembers its neighbours at the time it
   was removed; undoing in the opposite order guarantees those neighbours are back in place.
6. **Why choose the column with the fewest rows?** It minimises the branching factor and detects
   dead ends (size 0) early.
7. **How are clues handled?** An empty cell adds nine candidate rows; a clue adds only its digit.
8. **How do you detect multiple solutions?** Continue after the first solution and stop at two.
9. **Why use indices instead of pointers?** One contiguous vector: cache-friendly, no manual
   memory management, easy to bound-check.
10. **Why a separate C++ process instead of a native addon?** Isolation (a solver crash cannot
    take down the UI), independent testing, no native-module rebuilds per Electron version.
11. **Complexity?** See `time_complexity.md`.
12. **How is the Electron side kept secure?** Context isolation, sandbox, no Node in the renderer,
    a two-method preload bridge, validated input, no shell.
