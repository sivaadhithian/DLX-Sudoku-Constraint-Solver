# DLX Sudoku Solver — Constraint-Based Puzzle Solving

A Sudoku-solving application powered by **Knuth’s Algorithm X and Dancing Links (DLX)**, featuring a C++20 backend and an interactive JavaScript frontend.

The project demonstrates how linked data structures, constraint satisfaction, and backtracking-based search can be applied to solve Sudoku puzzles efficiently while providing an interactive environment for exploring the solving process.

## Overview

Sudoku is a constraint satisfaction problem in which every row, column, and 3 × 3 subgrid must contain the digits 1–9 exactly once.

Traditional Sudoku solvers commonly use recursive backtracking. This project uses **Algorithm X with Dancing Links**, which represents the puzzle as an exact-cover problem and efficiently explores valid candidate assignments by manipulating a circular, doubly linked structure.

The application separates the solving engine from the user interface, allowing the C++ backend to handle puzzle solving and validation while the frontend manages interaction, visualization, and results.

## Key Features

- **Exact-Cover Solver:** Implements Algorithm X using the Dancing Links technique.
- **C++20 Backend:** Performs puzzle solving and processes requests through a REST API.
- **Interactive Sudoku Grid:** Enter, edit, and solve Sudoku puzzles through the browser interface.
- **Puzzle Validation:** Checks grid dimensions, cell values, and duplicate clues.
- **Solution Analysis:** Supports solution counting, uniqueness detection, and search statistics.
- **Algorithm Visualization:** Explore the solving process through the existing visualization and playback interface.
- **Backend Connectivity:** Displays whether the C++ solver service is available.
- **Puzzle Generation:** Generate example puzzles and use them to explore the solver.
- **Run History and Tools:** Includes browser-side history, notes, undo/redo, step logs, and export functionality.
- **Automated Testing:** Includes C++ unit tests, frontend tests, API integration tests, and UI smoke tests.
- **Configurable Server:** Supports environment-based configuration for the backend.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | C++20 |
| HTTP Framework | Drogon |
| Core Algorithm | Algorithm X + Dancing Links |
| Build System | CMake |
| Build Tool | Ninja |
| API Format | REST API with JSON |
| Frontend Testing | Node.js |
| UI Testing | jsdom |
| Version Control | Git and GitHub |

## Understanding the Algorithm

### 1. Sudoku as an Exact-Cover Problem

A standard 9 × 9 Sudoku puzzle can be represented using 729 possible candidate assignments: each of the 81 cells can potentially contain one of nine digits.

Each candidate assignment must satisfy four constraints:

1. **Cell constraint:** Every cell contains exactly one digit.
2. **Row constraint:** Every digit appears exactly once in each row.
3. **Column constraint:** Every digit appears exactly once in each column.
4. **Box constraint:** Every digit appears exactly once in each 3 × 3 subgrid.

This produces an exact-cover matrix with **729 candidate rows and 324 constraint columns** before considering the clues already provided.

### 2. Algorithm X

Algorithm X searches for a collection of candidate rows that covers every constraint exactly once.

The algorithm repeatedly selects an uncovered constraint, chooses a compatible candidate, and explores the resulting possibilities. If a choice leads to a contradiction, it backtracks and explores another candidate.

### 3. Dancing Links (DLX)

Dancing Links is a technique for efficiently implementing Algorithm X using a sparse, circular, doubly linked structure.

Each node maintains links to neighboring nodes. When a candidate is selected, conflicting constraints and candidates can be temporarily removed from the structure. If the search needs to backtrack, the removed nodes are restored.

This approach avoids repeatedly rebuilding the entire constraint matrix.

### 4. Search and Results

The solver processes the puzzle, searches for valid solutions, and returns the result through the C++ backend.

The application can report solving outcomes and statistics such as execution time, recursive calls, visited nodes, backtracks, and the number of solutions found, subject to the configured search limits.

## System Architecture

The application follows a layered architecture that separates the user interface, HTTP handling, business logic, and solving algorithm.

```text
┌───────────────────────────────────────┐
│          Browser Frontend             │
│        HTML, CSS, JavaScript           │
│                                       │
│  Sudoku Grid • Visualization • History│
└──────────────────┬────────────────────┘
                   │
                   │ JSON over HTTP
                   ▼
┌───────────────────────────────────────┐
│            Drogon Server              │
│                                       │
│  HTTP Routing • Middleware • CORS     │
└──────────────────┬────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│          Solver Controller            │
│                                       │
│       Request and Response Handling   │
└──────────────────┬────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│           Service Layer               │
│                                       │
│  Grid Validation • Sudoku Service     │
│          Result Mapping               │
└──────────────────┬────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│             DLX Solver                │
│                                       │
│     Algorithm X + Dancing Links       │
└───────────────────────────────────────┘
```

### Backend Responsibilities

- `solver/` — Contains the DLX solving algorithm and shared solver types.
- `service/` — Handles puzzle validation, solver orchestration, and result mapping.
- `controllers/` — Exposes solver functionality through HTTP endpoints.
- `http/` — Handles middleware, CORS policy, and HTTP responses.
- `Config.cpp` and `Config.h` — Manage backend configuration.
- `main.cpp` — Initializes and starts the application.

### Frontend Responsibilities

- Render and manage the Sudoku grid.
- Handle user input and puzzle validation.
- Communicate with the C++ backend.
- Display solving results and backend connectivity.
- Provide algorithm visualization, playback, and supporting tools.

## Project Structure

```text
dlx-solver/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── SolverController.cpp
│   │   │   └── SolverController.h
│   │   ├── http/
│   │   │   ├── CorsPolicy.h
│   │   │   ├── Middleware.cpp
│   │   │   └── Responses.cpp
│   │   ├── service/
│   │   │   ├── GridValidation.cpp
│   │   │   ├── SudokuService.cpp
│   │   │   └── ResultMapper.cpp
│   │   ├── solver/
│   │   │   ├── DlxSolver.cpp
│   │   │   ├── DlxSolver.h
│   │   │   └── Types.h
│   │   ├── AppContext.h
│   │   ├── Config.cpp
│   │   ├── Config.h
│   │   └── main.cpp
│   ├── tests/
│   │   └── unit_tests.cpp
│   ├── CMakeLists.txt
│   └── CMakePresets.json
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── renderer.js
│   ├── js/
│   │   ├── solver-client.js
│   │   ├── algo-engine.js
│   │   ├── algo-view.js
│   │   ├── validation.js
│   │   ├── generator.js
│   │   └── ...
│   └── tests/
│       └── run-tests.js
├── docs/
│   └── API.md
├── scripts/
│   ├── build-backend.sh
│   ├── run.sh
│   ├── test-api.sh
│   └── test-ui.sh
├── tests/
│   ├── integration/
│   │   └── api.test.js
│   └── ui/
│       └── ui-smoke.test.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

Install the following tools:

- A C++20-compatible compiler
- CMake
- Ninja
- Drogon and its required dependencies
- Node.js and npm for the test suites

### macOS Installation

The following instructions are intended for macOS, including Apple Silicon Macs.

**1. Install the required tools**

```bash
xcode-select --install
brew install cmake ninja drogon node
```

If the Xcode Command Line Tools are already installed, you can skip the first command.

**2. Clone the repository**

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd dlx-solver
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with your actual GitHub repository URL.

**3. Configure the environment**

```bash
cp .env.example .env
```

The example configuration provides the starting point for backend settings. Review `.env.example` before changing any values.

**4. Build the C++ backend**

```bash
chmod +x scripts/*.sh
./scripts/build-backend.sh
```

**5. Start the application**

```bash
./scripts/run.sh
```

Open the application in your browser:

http://127.0.0.1:8080

The run script starts the backend and serves the frontend through the same origin.

## API Endpoints

The frontend communicates with the C++ backend through a JSON REST API.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/status` | Check backend availability |
| `POST` | `/api/solve` | Submit a Sudoku grid for solving |

### Example Solve Request

```http
POST /api/solve
Content-Type: application/json
```

The request contains a Sudoku grid represented as a 9 × 9 array. Empty cells are represented by `0`.

```json
{
  "grid": [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9]
  ]
}
```

The response reports the solving outcome, the resulting grid when available, and relevant solver statistics. Exact fields and error codes are documented in [`docs/API.md`](docs/API.md).

Possible normalized outcomes include:

- `solved` — A solution was found.
- `no-solution` — No valid solution was found.
- `invalid` — The submitted puzzle failed validation.
- `error` — An unexpected solving or server error occurred.

## Testing

The repository contains multiple test suites to check the solver, frontend, API, and UI integration.

### 1. C++ Unit Tests

```bash
ctest --test-dir backend/build --output-on-failure
```

Tests cover solver behavior, puzzle validation, configuration, HTTP-related policies, and response contracts.

### 2. Frontend Tests

```bash
node frontend/tests/run-tests.js
```

Tests frontend logic and communication with the backend.

### 3. API Integration Tests

```bash
./scripts/test-api.sh
```

Tests the HTTP API against a running C++ server, including solving requests and error handling.

### 4. UI Smoke Tests

```bash
npm install
./scripts/test-ui.sh
```

Uses jsdom to exercise the frontend and its interactions with the solver client.

To run the available test suites individually, use the commands above. Build the backend before running the C++ test suite.

## Performance and Complexity

Let:

- \(R\) represent the number of candidate rows.
- \(C\) represent the number of constraints.
- \(N\) represent the number of nodes visited during search.

For a standard Sudoku exact-cover formulation, there are 729 candidate rows and 324 constraint columns before clues are applied.

The construction and storage costs depend on the representation and number of nonzero entries in the constraint matrix. Search performance depends on the puzzle, candidate-selection strategy, and amount of backtracking.

Algorithm X has exponential worst-case search behavior in general. Dancing Links improves the efficiency of candidate removal and restoration, but it does not eliminate the worst-case complexity of the underlying search problem.

For this reason, performance should be evaluated using measured execution time and search statistics rather than a single guaranteed time-complexity figure.

## Design Decisions

**Why C++ for the backend?**

C++ provides direct control over data structures and memory management, making it suitable for implementing and studying the pointer operations used by Dancing Links.

**Why Dancing Links instead of a basic backtracking solver?**

DLX provides a structured way to represent exact-cover constraints and efficiently remove and restore candidates during search.

**Why separate the frontend and backend?**

The separation keeps UI behavior independent of the solving implementation. The solver can be tested through its C++ unit tests and HTTP API without requiring every test to run through the interface.

**Why use a REST API?**

A JSON-based API defines a clear boundary between the frontend and the solver. It also makes integration testing and future interface changes easier.

## Limitations and Future Improvements

Potential areas for further development include:

- Benchmarking DLX against conventional backtracking and other solving strategies.
- Improving algorithm-step visualization and explanations.
- Adding more extensive performance profiling across puzzle difficulty levels.
- Expanding automated tests for edge cases and malformed requests.
- Improving accessibility and responsive UI behavior.
- Adding optional puzzle-generation difficulty controls and additional solver statistics.
- Exploring additional constraint-satisfaction problems that can be represented using exact cover.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add appropriate tests.
4. Run the relevant test suites.
5. Submit a pull request describing the change.

For team projects, keep commits focused on individual tasks and document major implementation decisions.

## License

No license has been specified in this repository. If you intend to distribute or reuse the project publicly, add a `LICENSE` file with the license you choose.

## Acknowledgements

This project is based on the exact-cover formulation of Sudoku and Knuth’s Algorithm X, implemented using the Dancing Links technique.

The project is intended for educational exploration of algorithms, linked data structures, constraint satisfaction, C++ backend development, and frontend–backend integration.
