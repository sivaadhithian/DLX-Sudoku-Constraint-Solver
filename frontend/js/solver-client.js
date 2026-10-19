/* The renderer's only door to the solver. It talks to window.solver, which the Electron
 * preload script exposes. Every result is normalised to this contract:
 *
 *   { status: 'solved',      solution, multipleSolutions?, solutionCount?, stats? }
 *   { status: 'no-solution', stats? }
 *   { status: 'invalid',     message }
 *   { status: 'error',       code, message }
 */
(function () {
  'use strict';
  const DLX = window.DLX;

  const failure = (code, message) => ({ status: 'error', code, message });

  async function getStatus() {
    if (!window.solver) return { connected: false, backend: 'none', reason: 'Electron bridge unavailable.' };
    try {
      return await window.solver.getStatus();
    } catch (error) {
      return { connected: false, backend: 'none', reason: 'Could not reach the main process.' };
    }
  }

  async function solvePuzzle(grid) {
    if (!window.solver) return failure('BRIDGE_UNAVAILABLE', 'The Electron solver bridge is not available.');

    let result;
    try {
      result = await window.solver.solvePuzzle(grid);
    } catch (error) {
      return failure('IPC_FAILURE', 'The solver request failed before a result came back.');
    }

    if (!result || typeof result !== 'object') return failure('MALFORMED_RESULT', 'The solver returned an unreadable result.');
    switch (result.status) {
      case 'solved':
        // Never display a "solution" that contradicts the puzzle that was sent.
        return DLX.solutionMatchesPuzzle(result.solution, grid)
          ? result
          : failure('INVALID_SOLUTION', 'The solver returned a grid that does not match the puzzle.');
      case 'no-solution':
        return result;
      case 'invalid':
        return { status: 'invalid', message: String(result.message || 'The solver rejected the puzzle.') };
      case 'error':
        return failure(String(result.code || 'SOLVER_ERROR'), String(result.message || 'Unknown solver error.'));
      default:
        return failure('MALFORMED_RESULT', 'The solver returned an unknown status.');
    }
  }

  DLX.solverClient = { getStatus, solvePuzzle };
})();
