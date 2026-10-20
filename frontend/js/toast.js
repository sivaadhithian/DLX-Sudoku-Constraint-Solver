/* Small transient notices (copied, undone, key rejected…). They never replace the board
 * status message, so the feedback area stays stable. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const MAX = 3;

  function toast(text, { tone = 'neutral', duration = 2600 } = {}) {
    const region = document.getElementById('toasts');
    if (!region) return;
    while (region.children.length >= MAX) region.firstElementChild.remove();

    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.tone = tone;
    el.textContent = text;
    region.appendChild(el);

    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 180);
    }, duration);
  }

  /** Copy text. Uses the async clipboard API, with a textarea fallback. Resolves true/false. */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'offscreen';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  Object.assign(DLX, { toast, copyText });
})();
