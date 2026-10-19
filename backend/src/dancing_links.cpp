#include "dancing_links.h"

#include <stdexcept>

namespace dlx {

DancingLinks::DancingLinks(int numColumns) : sizes_(numColumns + 1, 0) {
    nodes_.reserve(static_cast<std::size_t>(numColumns) + 1 + 4096);
    for (int i = 0; i <= numColumns; ++i) {
        Node header;
        header.left = (i == 0) ? numColumns : i - 1;
        header.right = (i == numColumns) ? 0 : i + 1;
        header.up = header.down = i;
        header.column = i;
        header.rowId = -1;
        nodes_.push_back(header);
    }
}

void DancingLinks::addRow(int rowId, const std::vector<int>& columns) {
    int first = -1;
    for (int col : columns) {
        const int header = col + 1;
        if (header < 1 || header >= static_cast<int>(sizes_.size())) {
            throw std::out_of_range("DancingLinks::addRow: column out of range");
        }
        const int index = static_cast<int>(nodes_.size());

        Node node;
        node.column = header;
        node.rowId = rowId;
        // Insert at the bottom of the column.
        node.up = nodes_[header].up;
        node.down = header;
        nodes_[nodes_[header].up].down = index;
        nodes_[header].up = index;
        ++sizes_[header];

        // Link into the row's circular list.
        if (first < 0) {
            first = index;
            node.left = node.right = index;
            nodes_.push_back(node);
        } else {
            node.left = nodes_[first].left;
            node.right = first;
            nodes_.push_back(node);
            nodes_[nodes_[first].left].right = index;
            nodes_[first].left = index;
        }
    }
}

void DancingLinks::cover(int c) {
    nodes_[nodes_[c].right].left = nodes_[c].left;
    nodes_[nodes_[c].left].right = nodes_[c].right;
    for (int i = nodes_[c].down; i != c; i = nodes_[i].down) {
        for (int j = nodes_[i].right; j != i; j = nodes_[j].right) {
            nodes_[nodes_[j].down].up = nodes_[j].up;
            nodes_[nodes_[j].up].down = nodes_[j].down;
            --sizes_[nodes_[j].column];
            ++nodesUnlinked_;
        }
    }
}

void DancingLinks::uncover(int c) {
    for (int i = nodes_[c].up; i != c; i = nodes_[i].up) {
        for (int j = nodes_[i].left; j != i; j = nodes_[j].left) {
            ++sizes_[nodes_[j].column];
            nodes_[nodes_[j].down].up = j;
            nodes_[nodes_[j].up].down = j;
        }
    }
    nodes_[nodes_[c].right].left = c;
    nodes_[nodes_[c].left].right = c;
}

int DancingLinks::chooseColumn() const {
    int best = nodes_[0].right;
    for (int c = nodes_[best].right; c != 0; c = nodes_[c].right) {
        if (sizes_[c] < sizes_[best]) best = c;
    }
    return best;
}

}  // namespace dlx
