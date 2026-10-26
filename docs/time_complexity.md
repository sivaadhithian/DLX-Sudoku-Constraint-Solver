# Time and Space Complexity

This analysis describes the current C++ implementation in
`backend/src/sudoku_solver.cpp` and `backend/src/dancing_links.cpp`. It
distinguishes the bounded work used to prepare a puzzle from the
data-dependent search performed by Algorithm X.

## Notation and exact-cover model

Let `N` be the side length of a generalized Sudoku board, with square boxes
(`sqrt(N)` by `sqrt(N)`). The implementation in this repository uses `N = 9`.

| Symbol | Meaning | For a 9 x 9 board |
| --- | --- | ---: |
| `N` | Number of rows, columns, and symbols | 9 |
| `N^2` | Number of cells and search-depth upper bound | 81 |
| `C = 4N^2` | Exact-cover constraints | 324 |
| `R` | Candidate assignment rows in the matrix | At most `N^3 = 729` |
| `W` | Data nodes in the matrix | `4R`, at most 2,916 |

Each candidate assignment `(row, column, digit)` covers four constraints:
one cell, one row-digit pair, one column-digit pair, and one box-digit pair.
The DLX structure also stores one root and one header for each constraint, so
the maximum matrix has 325 headers and 2,916 candidate nodes (3,241 nodes in
total). A clue contributes one candidate row; an empty cell contributes up to
`N` rows.

## Time complexity

| Stage | Cost | Reason |
| --- | --- | --- |
| Validate cell values and clue conflicts | `O(N^2)` | Each cell is checked a constant number of times. |
| Build the sparse exact-cover matrix | `O(C + R)` = `O(N^3)` worst case | Initialize `C` headers and insert four nodes for each of at most `N^3` candidates. |
| Choose the next constraint | `O(C)` per recursive call | `chooseColumn()` scans the active column headers to find the smallest column. |
| Cover/uncover constraints | Proportional to the linked rows and nodes traversed | Each individual pointer update is `O(1)`, but the number of updates depends on the active matrix. Uncover reverses cover in reverse order. |
| Reconstruct the first solution | `O(N^2)` | At most one assignment per cell is copied into the result grid. |

The search is input-dependent. If `T` is the number of recursive search calls
and `Q` is the total number of DLX links and candidate entries traversed during
all cover, uncover, and branch iterations, its cost can be expressed as
`O(R + T*C + Q)`. A conservative upper bound for an individual search state is
proportional to the candidate matrix size; it is not a tight estimate of a
typical puzzle.

Algorithm X is exponential in the worst case for general exact-cover inputs.
For an `N x N` Sudoku, each branch selects one assignment and therefore
resolves a previously uncovered cell, giving a recursion-depth upper bound of
`N^2`. A selected constraint has at most `N` candidate assignments in this
Sudoku model, so a deliberately loose search-tree bound is
`O(1 + N + N^2 + ... + N^(N^2))`. This bound is not a prediction for a
particular puzzle. The minimum-column (S) heuristic selects the currently
most constrained column, often reducing the practical search substantially,
but it does not change the worst-case exponential nature of the problem.

The solver stops after finding two solutions by default. That is sufficient to
distinguish a unique solution from a puzzle with multiple solutions; it does
not enumerate every solution. A zero-solution or unique-solution puzzle may
still require exploring a large part of the search tree before that conclusion
is known.

For the fixed 9 x 9 application, matrix construction and storage are bounded
small constants. Search effort, rather than matrix construction, is the
dominant variable across puzzles.

## Space complexity

The matrix stores `C + 1` headers and four data nodes for each candidate row:
`O(C + R) = O(N^3)` space, with a maximum of 3,241 nodes for this 9 x 9
implementation. The partial assignment, first solution, and recursive call
stack use at most `O(N^2)` additional space. Cover/uncover modifies the
existing linked structure in place; it does not allocate search nodes.

## Instrumentation and interpretation

The solver returns the following counters for valid puzzles:

| Field | Meaning |
| --- | --- |
| `recursiveCalls` | Number of calls made to the Algorithm X search, including terminal calls. |
| `nodesVisited` | Cumulative number of candidate links unlinked by `cover()` calls. This counts repeated unlink operations, not distinct matrix nodes. |
| `backtracks` | Candidate rows whose recursive branch did not increase the solution count. |
| `executionMs` | Elapsed time inside `solve()`, including validation, matrix construction, search, and solution reconstruction; excludes text parsing and JSON serialization. |

The counter is named `nodesVisited` in the JSON/API for compatibility, but it
measures cumulative unlink operations rather than every node inspected during
search. These counters help explain work performed; none is a substitute for
an asymptotic bound.

## Reproducible verification

The checked-in regression suite is defined by `tests/test_cases.txt` and
executed by the `sudoku_tests` CTest target. Build and run it from the
repository root with:

```bash
npm run build:backend
npm run test:backend
```

The test runner reports each case and a summary of passes and failures. For
valid puzzles, it also prints the solver's solution count, recursive-call
count, backtracks, cumulative unlink count, and elapsed milliseconds. These
measurements are specific to the compiler, build configuration, machine, and
input; elapsed time is especially variable and should not be presented as a
universal performance guarantee.
