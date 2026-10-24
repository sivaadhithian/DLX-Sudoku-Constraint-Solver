# DLX Sudoku Constraint Solver

A desktop Sudoku application that combines an Electron front end with a C++ Exact Cover solver implemented using Dancing Links (DLX) and Algorithm X.

## Project overview

This project solves 9x9 Sudoku puzzles by modeling them as an Exact Cover problem. The solver engine is implemented in C++ and exposed to the desktop application through a restricted local IPC bridge.

The repository is structured to separate:
- the desktop UI and application shell,
- the solver engine and constraints logic,
- test cases and supporting documentation.

## Repository structure

```text
DLX-Sudoku-Constraint-Solver/
├── README.md
├── .gitignore
├── package.json
├── package-lock.json
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── main.js
│   ├── preload.js
│   ├── renderer.js
│   ├── js/
│   │   ├── algo-engine.js
│   │   ├── algo-view.js
│   │   ├── dialogs.js
│   │   ├── dlx-trace.js
│   │   ├── explain.js
│   │   ├── export.js
│   │   ├── generator-worker.js
│   │   ├── generator.js
│   │   ├── grid.js
│   │   ├── history.js
│   │   ├── input.js
│   │   ├── playback.js
│   │   ├── runs.js
│   │   ├── solver-client.js
│   │   ├── state.js
│   │   ├── status.js
│   │   ├── steplog.js
│   │   ├── tabs.js
│   │   ├── theme.js
│   │   ├── toast.js
│   │   └── validation.js
│   └── tests/
├── backend/
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── dancing_links.h
│   │   └── sudoku_solver.h
│   ├── src/
│   │   ├── dancing_links.cpp
│   │   ├── sudoku_solver.cpp
│   │   └── main.cpp
│   └── build/
├── docs/
│   ├── architecture.md
│   ├── time_complexity.md
│   └── viva_questions.md
├── examples/
├── tests/
│   ├── test_sudoku.cpp
│   └── test_cases.txt
├── frontend_issues_and_suggestions_V1.txt
├── frontend_issues_and_suggestions_V2.txt
├── frontend_issues_and_suggestions_V3.txt
└── .vscode/
```

## Tech stack

- Frontend: Electron, HTML, CSS, JavaScript
- Backend: C++, CMake
- Algorithm: Dancing Links (DLX), Algorithm X, Exact Cover
- Validation: CTest-based backend tests

## How it works

1. The Electron app loads the Sudoku UI.
2. The user enters a puzzle or selects a generated puzzle.
3. The renderer sends the grid to the main Electron process.
4. The main process invokes the compiled C++ solver executable.
5. The backend parses the puzzle and models it as an Exact Cover problem.
6. Algorithm X searches the sparse matrix using Dancing Links.
7. The solver returns a result object containing the solved grid, status, and metadata.
8. The UI displays the solution or an error message.

## Prerequisites

Before running the project, install:
- Node.js and npm
- CMake
- A C++ compiler such as GCC or Clang

## Getting started

Install dependencies:

```bash
npm install
```

Build the backend solver:

```bash
npm run build:backend
```

This creates the native solver executable under the backend build directory.

Start the Electron application:

```bash
npm start
```

Run the backend tests:

```bash
npm run test:backend
```

## Solver CLI

The native solver can also be invoked directly from the command line.

```bash
./backend/build/bin/sudoku_solver --version
./backend/build/bin/sudoku_solver "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
```

The solver reads a 81-character puzzle string or 9x9 input from stdin and prints a JSON result.

## Documentation

Detailed case-study notes and analysis are available in the docs folder:
- `docs/architecture.md`
- `docs/time_complexity.md`
- `docs/viva_questions.md`

## Notes

- This app is designed for local use on a desktop machine.
- The frontend uses a restricted preload bridge and validates input before passing it to the backend.
- The backend implementation is intentionally separated from the UI to keep the solving logic independent and testable.
