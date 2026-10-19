// Command-line entry point used by the Electron main process.
//
//   sudoku_solver                 read 81 cells from stdin
//   sudoku_solver <81 cells>      read the puzzle from the argument
//   sudoku_solver --version
//
// Always prints exactly one JSON object on stdout.
// Exit codes: 0 = solved / no solution, 2 = invalid input.
#include <iostream>
#include <iterator>
#include <string>

#include "sudoku_solver.h"

namespace {
constexpr const char* kVersion = "dlx-sudoku-solver 1.0.0";

int emitInvalid(const std::string& message) {
    sudoku::Result r;
    r.status = sudoku::Status::Invalid;
    r.message = message;
    std::cout << sudoku::toJson(r) << std::endl;
    return 2;
}
}  // namespace

int main(int argc, char** argv) {
    std::string input;
    if (argc > 1) {
        const std::string arg = argv[1];
        if (arg == "--version" || arg == "-v") {
            std::cout << kVersion << std::endl;
            return 0;
        }
        if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: sudoku_solver [81-cell puzzle]  (reads stdin when omitted)\n"
                         "Cells: 1-9 clue, 0 or . empty. Output: one JSON object.\n";
            return 0;
        }
        input = arg;
    } else {
        input.assign(std::istreambuf_iterator<char>(std::cin), std::istreambuf_iterator<char>());
    }

    sudoku::Grid grid{};
    std::string error;
    if (!sudoku::parsePuzzle(input, grid, error)) return emitInvalid(error);

    const sudoku::Result result = sudoku::solve(grid);
    std::cout << sudoku::toJson(result) << std::endl;
    return result.status == sudoku::Status::Invalid ? 2 : 0;
}
