# DLX-Sudoku-Constraint-Solver
## 🏗️ Project Architecture

The project follows a modular architecture that separates the user
interface, Sudoku-solving algorithm, and testing components.

### Repository Structure

```text
DLX-Sudoku-Constraint-Solver/
│
├── README.md
├── LICENSE
├── .gitignore
│
├── frontend/
│   ├── main.js
│   ├── preload.js
│   ├── index.html
│   ├── styles.css
│   └── renderer.js
│
├── backend/
│   ├── include/
│   │   ├── dancing_links.h
│   │   └── sudoku_solver.h
│   │
│   ├── src/
│   │   ├── dancing_links.cpp
│   │   ├── sudoku_solver.cpp
│   │   └── main.cpp
│   │
│   └── CMakeLists.txt
│
├── tests/
│   ├── test_sudoku.cpp
│   └── test_cases.txt
│
├── examples/
│   └── sample_puzzles.txt
│
└── docs/
    ├── architecture.md
    ├── time_complexity.md
    └── viva_questions.md
```

### Architectural Components

#### 1. Frontend — Electron UI

**Location:** `src/`

Responsible for displaying the Sudoku grid and handling user
interactions.

- `index.html` — Defines the application interface.
- `styles.css` — Provides the visual design and layout.
- `renderer.js` — Handles grid interactions, input validation,
  and displaying solver results.
- `main.js` — Creates the Electron application window and
  manages communication with the C++ backend.
- `preload.js` — Exposes a restricted, secure API for communication
  between the renderer and main process.

**Technologies:** HTML, CSS, JavaScript, Electron.js.

#### 2. Backend — Sudoku Solver

**Location:** `backend/`

Implements the Sudoku-solving algorithm using C++.

- `dancing_links.h` — Declares the DLX node structure,
  column headers, and required operations.
- `dancing_links.cpp` — Implements the Dancing Links structure,
  including node linking, covering, and uncovering.
- `sudoku_solver.h` — Declares the Sudoku solver interface.
- `sudoku_solver.cpp` — Converts Sudoku constraints into an
  Exact Cover problem and implements Algorithm X.
- `main.cpp` — Provides the executable entry point and handles
  puzzle input and solution output.
- `CMakeLists.txt` — Defines how the C++ solver is compiled.

**Technologies:** C++, Exact Cover, Algorithm X, Dancing Links,
circular doubly linked structures, recursion, and backtracking.

#### 3. Testing and Validation

**Location:** `tests/`

Verifies the correctness and reliability of the solver.

- `test_sudoku.cpp` — Tests solver behavior.
- `test_cases.txt` — Contains test inputs for different scenarios.

Test scenarios include:

- Valid Sudoku puzzles.
- Invalid or conflicting input.
- Puzzles with no solution.
- Already completed puzzles.
- Puzzles with multiple solutions, where applicable.

#### 4. Examples

**Location:** `examples/`

Contains sample Sudoku puzzles that can be used to demonstrate
and verify the solver.

#### 5. Documentation

**Location:** `docs/`

Contains supporting documentation for the case study.

- `architecture.md` — Detailed architecture and data flow.
- `time_complexity.md` — Algorithmic time and space complexity.
- `viva_questions.md` — Important case study and viva questions.

---

### System Workflow

1. The user enters a Sudoku puzzle through the Electron interface.
2. The renderer validates the input format.
3. The Electron main process receives the request.
4. The main process invokes the compiled C++ solver.
5. The solver converts the puzzle into an Exact Cover problem.
6. Dancing Links represents the sparse constraint matrix using
   linked nodes.
7. Algorithm X searches for a solution using recursion,
   covering, and uncovering operations.
8. The C++ solver returns the result to the Electron main process.
9. Electron sends the result to the renderer.
10. The interface displays the solved puzzle or an appropriate
    error message.

### Algorithm Overview

The solver models a standard 9 × 9 Sudoku as an Exact Cover problem.

- **324 constraints:** 81 cell constraints, 81 row-number
  constraints, 81 column-number constraints, and 81 box-number
  constraints.
- **729 candidate assignments:** The maximum number of
  cell-number assignments before applying the given clues.
- **Four constraints per candidate:** Each assignment satisfies
  one constraint from each category.

Algorithm X selects constraints and explores candidate assignments.
Dancing Links supports efficient removal and restoration of nodes
during the search.

### Design Principles

- **Modularity:** The UI, solver, and tests are separated.
- **Separation of concerns:** The frontend handles presentation,
  while the C++ backend handles solving.
- **Maintainability:** Individual components can be modified
  without unnecessarily affecting other components.
- **Testability:** The solver can be tested independently of the UI.
- **Security:** Electron uses a restricted preload bridge rather
  than exposing unrestricted Node.js access to the renderer.
