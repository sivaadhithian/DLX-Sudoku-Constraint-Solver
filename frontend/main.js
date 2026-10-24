'use strict';
/* Electron main process: creates the window and runs the C++ solver.
 *
 * The renderer never touches the executable. It sends a 9x9 grid over IPC; this file
 * validates it, pipes 81 digits into the solver's stdin (no shell, no user-controlled
 * arguments) and returns the JSON result in the contract solver-client.js expects. */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const SOLVE_TIMEOUT_MS = 15000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const EXE_NAME = process.platform === 'win32' ? 'sudoku_solver.exe' : 'sudoku_solver';

let mainWindow = null;

/* ---------- Locating the solver ---------- */

function isExecutable(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findSolver() {
  const candidates = [];
  if (process.env.DLX_SOLVER_PATH) candidates.push(process.env.DLX_SOLVER_PATH);
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'backend', EXE_NAME));
  const build = path.join(__dirname, '..', 'backend', 'build');
  candidates.push(path.join(build, 'bin', EXE_NAME), path.join(build, EXE_NAME));
  return candidates.find(isExecutable) || null;
}

/* ---------- Helpers ---------- */

const failure = (code, message) => ({ status: 'error', code, message });

function validateGrid(grid) {
  const ok =
    Array.isArray(grid) &&
    grid.length === 9 &&
    grid.every((row) => Array.isArray(row) && row.length === 9 && row.every((v) => Number.isInteger(v) && v >= 0 && v <= 9));
  return ok ? null : 'The puzzle must be a 9x9 grid of digits 0-9.';
}

const isGrid = (g) => !validateGrid(g);
const finiteOrUndefined = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Copy only the fields the renderer is allowed to see. */
function normaliseResult(raw) {
  if (!raw || typeof raw !== 'object') return failure('MALFORMED_OUTPUT', 'The solver returned unreadable output.');
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const cleanStats = {
    executionMs: finiteOrUndefined(stats.executionMs),
    recursiveCalls: finiteOrUndefined(stats.recursiveCalls),
    nodesVisited: finiteOrUndefined(stats.nodesVisited),
    backtracks: finiteOrUndefined(stats.backtracks),
  };
  switch (raw.status) {
    case 'solved':
      if (!isGrid(raw.solution)) return failure('MALFORMED_OUTPUT', 'The solver returned an invalid grid.');
      return {
        status: 'solved',
        solution: raw.solution,
        multipleSolutions: Boolean(raw.multipleSolutions),
        solutionCount: finiteOrUndefined(raw.solutionCount),
        stats: cleanStats,
      };
    case 'no-solution':
      return { status: 'no-solution', solutionCount: 0, stats: cleanStats };
    case 'invalid':
      return { status: 'invalid', message: String(raw.message || 'The solver rejected the puzzle.') };
    default:
      return failure('MALFORMED_OUTPUT', 'The solver returned an unknown status.');
  }
}

/* ---------- IPC handlers ---------- */

function getStatus() {
  const exe = findSolver();
  if (!exe) {
    return Promise.resolve({
      connected: false,
      backend: 'none',
      reason: 'Solver executable not found. Build it with "npm run build:backend".',
    });
  }
  return new Promise((resolve) => {
    execFile(exe, ['--version'], { timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (error) resolve({ connected: false, backend: 'cpp-dlx', reason: 'The solver executable could not be started.' });
      else resolve({ connected: true, backend: 'cpp-dlx', version: String(stdout).trim() });
    });
  });
}

function solvePuzzle(grid) {
  const problem = validateGrid(grid);
  if (problem) return Promise.resolve({ status: 'invalid', message: problem });

  const exe = findSolver();
  if (!exe) return Promise.resolve(failure('BACKEND_NOT_CONNECTED', 'Solver backend not connected. Build the C++ solver first.'));

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
    } catch {
      resolve(failure('SOLVER_SPAWN_FAILED', 'The solver could not be started.'));
      return;
    }

    let stdout = '';
    let overflow = false;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(failure('SOLVER_TIMEOUT', `The solver did not finish within ${SOLVE_TIMEOUT_MS / 1000} seconds.`));
    }, SOLVE_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        overflow = true;
        child.kill();
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {}); // solver may exit before reading everything
    child.on('error', (err) =>
      finish(err.code === 'ENOENT'
        ? failure('BACKEND_NOT_CONNECTED', 'Solver backend not connected.')
        : failure('SOLVER_SPAWN_FAILED', 'The solver could not be started.'))
    );
    child.on('close', (code) => {
      if (overflow) return finish(failure('MALFORMED_OUTPUT', 'The solver produced too much output.'));
      try {
        finish(normaliseResult(JSON.parse(stdout)));
      } catch {
        finish(failure('SOLVER_CRASH', `The solver exited unexpectedly (code ${code}).`));
      }
    });

    child.stdin.end(grid.map((row) => row.join('')).join('') + '\n');
  });
}

function trusted(event) {
  return mainWindow !== null && event.sender === mainWindow.webContents;
}

ipcMain.handle('solver:get-status', (event) =>
  trusted(event) ? getStatus() : { connected: false, backend: 'none', reason: 'Untrusted sender.' }
);
ipcMain.handle('solver:solve', (event, grid) =>
  trusted(event) ? solvePuzzle(grid) : failure('UNTRUSTED_SENDER', 'Request rejected.')
);

/* ---------- Window ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0B0B0D',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // The app is a single local page: block navigation and pop-ups.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
