/* The step log: one numbered, scrollable container on the right listing every move with its
 * reason ("7 placed in Row 2, Column 3 because ..."). Used by Visualize (replay moves,
 * including backtracks) and by Solve (placements rebuilt from the backend's solution). */
(function () {
  'use strict';
  const DLX = window.DLX;
  const $ = (id) => document.getElementById(id);
  const MAX_ENTRIES = 2000;
  const fmt = (n) => n.toLocaleString('en-US');

  let total = 0;      // entries added since reset
  let trimmed = false;

  const card = () => $('steplog');
  const list = () => $('sl-list');

  function updateCount() {
    const shown = list().children.length;
    $('sl-count').textContent = `${fmt(total)} step${total === 1 ? '' : 's'}`;
    $('sl-note-trim').hidden = !trimmed;
    if (trimmed) $('sl-note-trim').textContent = `Showing the latest ${fmt(shown)} steps.`;
  }

  /** Start a fresh log and show the card. */
  function reset({ note = '' } = {}) {
    list().textContent = '';
    total = 0;
    trimmed = false;
    $('sl-note').textContent = note;
    card().hidden = false;
    updateCount();
  }

  function clear() {
    if (!card() || card().hidden) return;
    list().textContent = '';
    total = 0;
    trimmed = false;
    card().hidden = true;
  }

  function buildItem(entry, number) {
    const li = document.createElement('li');
    li.className = 'sl-item';
    li.dataset.kind = entry.kind;

    const n = document.createElement('span');
    n.className = 'sl-n';
    n.textContent = entry.kind === 'info' ? '·' : String(number);
    li.appendChild(n);

    const body = document.createElement('div');
    body.className = 'sl-body';
    const addLine = (cls, label, text) => {
      if (!text) return;
      const p = document.createElement('p');
      p.className = cls;
      if (label) {
        const b = document.createElement('strong');
        b.textContent = `${label} `;
        p.appendChild(b);
      }
      p.appendChild(document.createTextNode(text));
      body.appendChild(p);
    };
    addLine('sl-main', '', entry.main);
    addLine('sl-because', 'Because', entry.because);
    addLine('sl-check', 'Check', entry.check);
    addLine('sl-extra', '', entry.note);
    li.appendChild(body);
    return li;
  }

  /** @param entries array of {kind, main, because, check, note, n?}  */
  function add(entries, { current = true, scroll = 'auto' } = {}) {
    const el = list();
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const frag = document.createDocumentFragment();
    for (const entry of entries) {
      if (entry.kind !== 'info') total++;
      frag.appendChild(buildItem(entry, entry.n !== undefined ? entry.n : total));
    }
    el.querySelectorAll('.sl-item.current').forEach((x) => x.classList.remove('current'));
    el.appendChild(frag);
    while (el.children.length > MAX_ENTRIES) { el.firstElementChild.remove(); trimmed = true; }
    if (current && el.lastElementChild) el.lastElementChild.classList.add('current');
    if (scroll === 'top') el.scrollTop = 0;
    else if (nearBottom || el.children.length === entries.length) el.scrollTop = el.scrollHeight;
    updateCount();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sl-clear').addEventListener('click', clear);
  });

  DLX.stepLog = { reset, add, clear };
})();
