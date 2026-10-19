// Sudoku -> Exact Cover reduction and Algorithm X search on top of Dancing Links.
#ifndef SUDOKU_SOLVER_H
#define SUDOKU_SOLVER_H

#include <array>
#include <string>

#include "dancing_links.h"

namespace sudoku {

constexpr int kSize = 9;
constexpr int kBox = 3;
constexpr int kCells = kSize * kSize;

using Grid = std::array<std::array<int, kSize>, kSize>;

enum class Status { Solved, NoSolution, Invalid };

struct Result {
    Status status = Status::Invalid;
    Grid solution{};                 // valid only when status == Solved
    bool multipleSolutions = false;  // true when a second solution exists
    int solutionCount = 0;           // solutions found, capped at maxSolutions
    std::string message;             // reason when status == Invalid
    dlx::SearchStats stats;
    double executionMs = 0.0;
};

// Parse 81 cells ('1'-'9' = clue, '0' or '.' = empty). Whitespace is ignored.
bool parsePuzzle(const std::string& text, Grid& grid, std::string& error);

// Reject duplicate clues in any row, column or box.
bool findClueConflict(const Grid& grid, std::string& error);

// Solve with Algorithm X. The search stops after maxSolutions (2 is enough to
// tell "unique" from "multiple").
Result solve(const Grid& grid, int maxSolutions = 2);

// Serialise a result using the contract the Electron frontend expects.
std::string toJson(const Result& result);

}  // namespace sudoku

#endif  // SUDOKU_SOLVER_H
