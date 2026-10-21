/* In-app dialogs built on the native <dialog> element, which gives us a focus trap,
 * Escape-to-close and a backdrop. Both functions return Promises; no alert()/prompt(). */
(function () {
  'use strict';
  const DLX = window.DLX;
  const $ = (id) => document.getElementById(id);

  function closeOnBackdropClick(dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel');
    });
  }

  /** Resolves true if the user confirms, false on Cancel / Escape / backdrop click. */
  function confirmAction({ title, message, confirmLabel }) {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = message;
    $('confirm-ok').textContent = confirmLabel;
    dialog.returnValue = 'cancel';

    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      dialog.showModal();
    });
  }

  /** Resolves with a parsed 9x9 grid, or null if cancelled. Format errors stay inside the dialog. */
  function askForCustomPuzzle() {
    const dialog = $('custom-dialog');
    const input = $('custom-input');
    const errorEl = $('custom-error');
    input.value = '';
    errorEl.hidden = true;
    dialog.returnValue = 'cancel';
    let parsed = null;

    return new Promise((resolve) => {
      function onLoad() {
        const result = DLX.parsePuzzleText(input.value);
        if (!result.ok) {
          errorEl.textContent = result.message;
          errorEl.hidden = false;
          input.focus();
          return;
        }
        parsed = result.grid;
        dialog.close('confirm');
      }
      function onCancel() {
        dialog.close('cancel');
      }
      function onClose() {
        $('custom-load').removeEventListener('click', onLoad);
        $('custom-cancel').removeEventListener('click', onCancel);
        resolve(dialog.returnValue === 'confirm' ? parsed : null);
      }
      $('custom-load').addEventListener('click', onLoad);
      $('custom-cancel').addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose, { once: true });
      dialog.showModal();
      input.focus();
    });
  }

  /** Resolves 'easy' | 'medium' | 'hard', or null if cancelled. */
  function askForLevel() {
    const dialog = $('level-dialog');
    dialog.returnValue = 'cancel';
    // The clue ranges come from the generator, so the text can never drift from the real criteria.
    for (const span of dialog.querySelectorAll('[data-range]')) {
      const cfg = DLX.generator.LEVELS[span.dataset.range];
      if (cfg) span.textContent = `${cfg.min}–${cfg.max}`;
    }
    return new Promise((resolve) => {
      const buttons = Array.from(dialog.querySelectorAll('.level-btn'));
      function onPick(event) { dialog.close(event.currentTarget.dataset.level); }
      function onCancel() { dialog.close('cancel'); }
      function onClose() {
        buttons.forEach((b) => b.removeEventListener('click', onPick));
        $('level-cancel').removeEventListener('click', onCancel);
        resolve(['easy', 'medium', 'hard'].includes(dialog.returnValue) ? dialog.returnValue : null);
      }
      buttons.forEach((b) => b.addEventListener('click', onPick));
      $('level-cancel').addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose, { once: true });
      dialog.showModal();
      buttons[0].focus();
    });
  }

  function initDialogs() {
    closeOnBackdropClick($('level-dialog'));
    closeOnBackdropClick($('confirm-dialog'));
    closeOnBackdropClick($('custom-dialog'));
    $('custom-input').addEventListener('input', () => { $('custom-error').hidden = true; });
  }

  Object.assign(DLX, { confirmAction, askForCustomPuzzle, askForLevel, initDialogs });
})();
