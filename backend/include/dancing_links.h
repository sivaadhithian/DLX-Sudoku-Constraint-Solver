// Dancing Links (DLX): a sparse exact-cover matrix stored as circular,
// doubly linked lists. Nodes live in one vector and refer to each other by
// index, which keeps the structure cache-friendly and free of raw pointers.
#ifndef DANCING_LINKS_H
#define DANCING_LINKS_H

#include <cstdint>
#include <vector>

namespace dlx {

struct SearchStats {
    std::uint64_t recursiveCalls = 0;  // calls made to the Algorithm X search
    std::uint64_t nodesVisited = 0;    // nodes unlinked by cover operations
    std::uint64_t backtracks = 0;      // candidate rows tried that led nowhere
};

class DancingLinks {
public:
    // Index 0 is the root, indices 1..numColumns are the column headers.
    explicit DancingLinks(int numColumns);

    // Add one candidate row that covers the given 0-based columns.
    void addRow(int rowId, const std::vector<int>& columns);

    // Remove a column and every row that uses it from the matrix.
    void cover(int column);
    // Exact inverse of cover(); must be called in reverse order.
    void uncover(int column);

    // Column with the fewest remaining rows (the "S heuristic").
    int chooseColumn() const;
    bool isSolved() const { return nodes_[0].right == 0; }

    // Read-only navigation used by the search routine.
    int right(int i) const { return nodes_[i].right; }
    int left(int i) const { return nodes_[i].left; }
    int down(int i) const { return nodes_[i].down; }
    int columnOf(int i) const { return nodes_[i].column; }
    int rowId(int i) const { return nodes_[i].rowId; }
    int columnSize(int column) const { return sizes_[column]; }
    std::uint64_t nodesUnlinked() const { return nodesUnlinked_; }

private:
    struct Node {
        int left, right, up, down;
        int column;  // header this node belongs to
        int rowId;   // candidate identifier (-1 for headers)
    };

    std::vector<Node> nodes_;
    std::vector<int> sizes_;  // indexed by header position
    std::uint64_t nodesUnlinked_ = 0;
};

}  // namespace dlx

#endif  // DANCING_LINKS_H
