// Dependency-free test runner. Reads tests/test_cases.txt and also checks
// that every returned solution is a valid grid that keeps the original clues.
#include <fstream>
#include <iostream>
#include <string>

#include "sudoku_solver.h"

#ifndef TEST_CASES_PATH
#define TEST_CASES_PATH "../tests/test_cases.txt"
#endif

namespace {

std::string trim(const std::string& s) {
    const auto b = s.find_first_not_of(" \t\r");
    if (b == std::string::npos) return "";
    return s.substr(b, s.find_last_not_of(" \t\r") - b + 1);
}

bool isValidSolution(const sudoku::Grid& g) {
    for (int i = 0; i < 9; ++i) {
        bool row[10] = {}, col[10] = {}, box[10] = {};
        for (int j = 0; j < 9; ++j) {
            const int a = g[i][j], b = g[j][i];
            const int c = g[(i / 3) * 3 + j / 3][(i % 3) * 3 + j % 3];
            if (a < 1 || a > 9 || b < 1 || b > 9 || c < 1 || c > 9) return false;
            if (row[a] || col[b] || box[c]) return false;
            row[a] = col[b] = box[c] = true;
        }
    }
    return true;
}

}  // namespace

int main() {
    std::ifstream file(TEST_CASES_PATH);
    if (!file) {
        std::cerr << "Cannot open " << TEST_CASES_PATH << "\n";
        return 2;
    }

    int passed = 0, failed = 0;
    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;

        const auto p1 = line.find('|');
        const auto p2 = line.rfind('|');
        const std::string name = trim(line.substr(0, p1));
        const std::string puzzle = trim(line.substr(p1 + 1, p2 - p1 - 1));
        const std::string expected = trim(line.substr(p2 + 1));

        std::string problem;
        sudoku::Grid grid{};
        std::string parseError;
        const bool parsed = sudoku::parsePuzzle(puzzle, grid, parseError);

        if (!parsed) {
            if (expected != "invalid") problem = "unexpected parse failure: " + parseError;
        } else {
            const sudoku::Result r = sudoku::solve(grid);
            if (expected == "invalid") {
                if (r.status != sudoku::Status::Invalid) problem = "expected invalid";
            } else if (expected == "no-solution") {
                if (r.status != sudoku::Status::NoSolution) problem = "expected no solution";
            } else if (expected == "unique" || expected == "multiple") {
                if (r.status != sudoku::Status::Solved) problem = "expected a solution";
                else if (!isValidSolution(r.solution)) problem = "returned an invalid grid";
                else if (r.multipleSolutions != (expected == "multiple"))
                    problem = std::string("expected ") + expected + " solution(s)";
                else {
                    for (int i = 0; i < 9 && problem.empty(); ++i)
                        for (int j = 0; j < 9; ++j)
                            if (grid[i][j] != 0 && grid[i][j] != r.solution[i][j]) {
                                problem = "solution changed a clue";
                                break;
                            }
                }
            } else {
                problem = "unknown expectation '" + expected + "'";
            }
        }

        if (problem.empty()) { ++passed; std::cout << "[PASS] " << name << "\n"; }
        else { ++failed; std::cout << "[FAIL] " << name << ": " << problem << "\n"; }
    }

    std::cout << passed << " passed, " << failed << " failed\n";
    return failed == 0 ? 0 : 1;
}
