#include "sudoku_solver.h"

#include <chrono>
#include <cstdio>
#include <sstream>
#include <vector>

namespace sudoku {
namespace {

// Column layout of the 324-column exact-cover matrix.
constexpr int kCellOffset = 0;
constexpr int kRowOffset = kCells;
constexpr int kColOffset = 2 * kCells;
constexpr int kBoxOffset = 3 * kCells;
constexpr int kColumns = 4 * kCells;

int boxOf(int r, int c) { return (r / kBox) * kBox + (c / kBox); }
int encodeRow(int r, int c, int d) { return (r * kSize + c) * kSize + (d - 1); }

// One candidate (r, c, d) satisfies exactly four constraints.
std::vector<int> constraintsFor(int r, int c, int d) {
    return {
        kCellOffset + r * kSize + c,
        kRowOffset + r * kSize + (d - 1),
        kColOffset + c * kSize + (d - 1),
        kBoxOffset + boxOf(r, c) * kSize + (d - 1),
    };
}

// Algorithm X over a DancingLinks matrix.
class Searcher {
public:
    Searcher(dlx::DancingLinks& links, int maxSolutions)
        : links_(links), maxSolutions_(maxSolutions) {}

    void run() { search(); }

    int count() const { return count_; }
    const std::vector<int>& firstSolution() const { return first_; }
    dlx::SearchStats stats() const {
        dlx::SearchStats s = stats_;
        s.nodesVisited = links_.nodesUnlinked();
        return s;
    }

private:
    void search() {
        ++stats_.recursiveCalls;

        if (links_.isSolved()) {
            if (count_ == 0) first_ = partial_;
            ++count_;
            return;
        }

        const int column = links_.chooseColumn();
        if (links_.columnSize(column) == 0) return;  // dead end

        links_.cover(column);
        for (int row = links_.down(column); row != column && count_ < maxSolutions_;
             row = links_.down(row)) {
            partial_.push_back(links_.rowId(row));
            for (int j = links_.right(row); j != row; j = links_.right(j)) {
                links_.cover(links_.columnOf(j));
            }

            const int before = count_;
            search();
            if (count_ == before) ++stats_.backtracks;

            for (int j = links_.left(row); j != row; j = links_.left(j)) {
                links_.uncover(links_.columnOf(j));
            }
            partial_.pop_back();
        }
        links_.uncover(column);
    }

    dlx::DancingLinks& links_;
    const int maxSolutions_;
    int count_ = 0;
    std::vector<int> partial_;
    std::vector<int> first_;
    dlx::SearchStats stats_;
};

}  // namespace

bool parsePuzzle(const std::string& text, Grid& grid, std::string& error) {
    int index = 0;
    for (char ch : text) {
        if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n') continue;
        int value;
        if (ch >= '0' && ch <= '9') value = ch - '0';
        else if (ch == '.') value = 0;
        else {
            error = std::string("Unexpected character '") + ch + "'. Use digits 0-9 or '.'.";
            return false;
        }
        if (index >= kCells) {
            error = "Too many cells. Expected exactly 81.";
            return false;
        }
        grid[index / kSize][index % kSize] = value;
        ++index;
    }
    if (index != kCells) {
        error = "Expected exactly 81 cells but received " + std::to_string(index) + ".";
        return false;
    }
    return true;
}

bool findClueConflict(const Grid& grid, std::string& error) {
    bool rowSeen[kSize][kSize + 1] = {};
    bool colSeen[kSize][kSize + 1] = {};
    bool boxSeen[kSize][kSize + 1] = {};
    for (int r = 0; r < kSize; ++r) {
        for (int c = 0; c < kSize; ++c) {
            const int d = grid[r][c];
            if (d == 0) continue;
            const int b = boxOf(r, c);
            if (rowSeen[r][d] || colSeen[c][d] || boxSeen[b][d]) {
                error = "Digit " + std::to_string(d) + " repeats in row " + std::to_string(r + 1) +
                        ", column " + std::to_string(c + 1) + " or its box.";
                return true;
            }
            rowSeen[r][d] = colSeen[c][d] = boxSeen[b][d] = true;
        }
    }
    return false;
}

Result solve(const Grid& grid, int maxSolutions) {
    const auto started = std::chrono::steady_clock::now();
    Result result;

    for (const auto& row : grid) {
        for (int v : row) {
            if (v < 0 || v > 9) {
                result.status = Status::Invalid;
                result.message = "Cell values must be between 0 and 9.";
                return result;
            }
        }
    }
    if (findClueConflict(grid, result.message)) {
        result.status = Status::Invalid;
        return result;
    }

    // Build the matrix. A clue contributes one candidate row; an empty cell nine.
    dlx::DancingLinks links(kColumns);
    for (int r = 0; r < kSize; ++r) {
        for (int c = 0; c < kSize; ++c) {
            const int given = grid[r][c];
            for (int d = (given ? given : 1); d <= (given ? given : 9); ++d) {
                links.addRow(encodeRow(r, c, d), constraintsFor(r, c, d));
            }
        }
    }

    Searcher searcher(links, maxSolutions < 1 ? 1 : maxSolutions);
    searcher.run();

    result.stats = searcher.stats();
    result.solutionCount = searcher.count();
    result.multipleSolutions = searcher.count() > 1;

    if (searcher.count() == 0) {
        result.status = Status::NoSolution;
    } else {
        result.status = Status::Solved;
        for (int id : searcher.firstSolution()) {
            const int d = id % kSize + 1;
            const int cell = id / kSize;
            result.solution[cell / kSize][cell % kSize] = d;
        }
    }

    result.executionMs =
        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
    return result;
}

namespace {
std::string escapeJson(const std::string& s) {
    std::string out;
    for (char ch : s) {
        if (ch == '"' || ch == '\\') { out += '\\'; out += ch; }
        else if (ch == '\n') out += "\\n";
        else if (static_cast<unsigned char>(ch) >= 0x20) out += ch;
    }
    return out;
}
}  // namespace

std::string toJson(const Result& result) {
    std::ostringstream out;
    char ms[32];
    std::snprintf(ms, sizeof ms, "%.3f", result.executionMs);
    const std::string stats = std::string("{\"executionMs\":") + ms +
        ",\"recursiveCalls\":" + std::to_string(result.stats.recursiveCalls) +
        ",\"nodesVisited\":" + std::to_string(result.stats.nodesVisited) +
        ",\"backtracks\":" + std::to_string(result.stats.backtracks) + "}";

    switch (result.status) {
        case Status::Invalid:
            out << "{\"status\":\"invalid\",\"message\":\"" << escapeJson(result.message) << "\"}";
            break;
        case Status::NoSolution:
            out << "{\"status\":\"no-solution\",\"solutionCount\":0,\"stats\":" << stats << "}";
            break;
        case Status::Solved:
            out << "{\"status\":\"solved\",\"solution\":[";
            for (int r = 0; r < kSize; ++r) {
                out << (r ? "," : "") << "[";
                for (int c = 0; c < kSize; ++c) out << (c ? "," : "") << result.solution[r][c];
                out << "]";
            }
            out << "],\"multipleSolutions\":" << (result.multipleSolutions ? "true" : "false")
                << ",\"solutionCount\":" << result.solutionCount << ",\"stats\":" << stats << "}";
            break;
    }
    return out.str();
}

}  // namespace sudoku
