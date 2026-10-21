/* Runs puzzle generation off the UI thread. Started by DLX.generator.start() in generator.js,
 * which also terminates it to cancel. Only the puzzle is posted back. */
'use strict';
importScripts('generator.js');

self.onmessage = (event) => {
  try {
    const result = self.DLX.generator.generatePuzzle(event.data.level);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, message: String((error && error.message) || error) });
  }
};
