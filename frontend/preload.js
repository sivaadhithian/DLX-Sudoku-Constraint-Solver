'use strict';
// The only API the renderer gets. No Node.js, no file system, no process spawning.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'solver',
  Object.freeze({
    getStatus: () => ipcRenderer.invoke('solver:get-status'),
    solvePuzzle: (grid) => ipcRenderer.invoke('solver:solve', grid),
  })
);
