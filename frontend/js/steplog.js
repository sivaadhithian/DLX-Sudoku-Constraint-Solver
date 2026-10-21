/* The step log: one numbered, scrollable container on the right listing every move with its
 * reason ("7 placed in Row 2, Column 3 because ..."). Used by Visualize (replay moves,
 * including backtracks) and by Solve (placements rebuilt from the backend's solution).
 *
 * Every entry is kept in a plain array (the source of truth). Only a window of the newest
 * entries is turned into DOM nodes; "Show earlier steps" brings older ones back, so long
 * traces stay light on the page without losing any history. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toLocaleString('en-US');

  const WINDOW = 150;        // entries rendered at once while following the newest step
  const PAGE = 100;          // entries added per "Show earlier steps" click
  const MAX_STORED = 20000;  // entries kept in memory; the oldest are dropped beyond this

  const SOURCES = {
    reconstructed: { label: 'Reconstructed explanation', title: 'Solve explanation' },
    replay: { label: 'Browser Algorithm X replay', title: 'Visualize replay' },
  };

  let entries = [];       // { entry, number }
  let first = 0;          // index of the first entry currently in the DOM
  let total = 0;          // steps added since reset (info lines excluded)
  let dropped = 0;        // entries discarded from the start of the array
  let currentEl = null;

  const card = () => $('steplog');
  const list = () => $('sl-list');

  function updateHeader() {
    $('sl-count').textContent = `${fmt(total)} step${total === 1 ? '' : 's'}`;
    const more = $('sl-more');
    more.hidden = first <= 0;
    if (first > 0) more.textContent = `Show earlier steps (${fmt(first)} not shown)`;
    const trim = $('sl-note-trim');
    trim.hidden = dropped === 0;
    if (dropped) trim.textContent = `The oldest ${fmt(dropped)} steps were discarded to save memory.`;
  }

  /** Start a fresh log and show the card. `source` labels what kind of log this is. */
  function reset({ note = '', source = '' } = {}) {
    entries = [];
    first = 0;
    total = 0;
    dropped = 0;
    currentEl = null;
    list().textContent = '';
    $('sl-note').textContent = note;
    const info = SOURCES[source];
    $('sl-title').textContent = info ? info.title : 'Step log';
    const chip = $('sl-source');
    chip.hidden = !info;
    chip.textContent = info ? info.label : '';
    chip.dataset.source = source;
    card().hidden = false;
    updateHeader();
  }

  function clear() {
    if (!card() || card().hidden) return;
    entries = [];
    first = 0;
    total = 0;
    dropped = 0;
    currentEl = null;
    list().textContent = '';
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

  const itemFor = (i) => buildItem(entries[i].entry, entries[i].number);

  /** Render entries[from, to) into the list, replacing what is there. */
  function renderRange(from, to) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.appendChild(itemFor(i));
    list().textContent = '';
    list().appendChild(frag);
    first = from;
    currentEl = null;
  }

  function markCurrent(el) {
    if (currentEl && currentEl.isConnected) currentEl.classList.remove('current');
    currentEl = el;
    if (el) el.classList.add('current');
  }

  /** @param newEntries array of {kind, main, because, check, note, n?}
   *  scroll: 'auto' keeps following the newest entry only if the reader is already at the bottom;
   *          'top' shows the list from its first entry (used for the Solve explanation). */
  function add(newEntries, { current = true, scroll = 'auto' } = {}) {
    if (!newEntries.length) return;
    const el = list();
    const following = scroll !== 'top' && el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const added = newEntries.length;

    for (const entry of newEntries) {
      if (entry.kind !== 'info') total++;
      entries.push({ entry, number: entry.n !== undefined ? entry.n : total });
    }
    if (entries.length > MAX_STORED) {
      const excess = entries.length - MAX_STORED;
      entries.splice(0, excess);
      dropped += excess;
      first = Math.max(0, first - excess);
      // Drop DOM nodes that belonged to discarded entries.
      while (el.children.length > entries.length - added - first) el.firstElementChild.remove();
    }

    const end = entries.length;
    if (scroll === 'top') {
      renderRange(Math.max(0, end - WINDOW), end); // short lists only (Solve): show from the first entry
      el.scrollTop = 0;
    } else if (added >= WINDOW && following) {
      renderRange(end - WINDOW, end);              // a big batch (skip to end): render only the newest window
    } else {
      const frag = document.createDocumentFragment();
      for (let i = Math.max(first, end - added); i < end; i++) frag.appendChild(itemFor(i));
      el.appendChild(frag);
      if (following) {
        while (el.children.length > WINDOW) { el.firstElementChild.remove(); first++; }
      }
    }

    if (current) markCurrent(el.lastElementChild);
    if (following) el.scrollTop = el.scrollHeight;
    updateHeader();
  }

  /** Bring back an older page of entries above the current ones, keeping the scroll position. */
  function showEarlier() {
    if (first <= 0) return;
    const el = list();
    const from = Math.max(0, first - PAGE);
    const frag = document.createDocumentFragment();
    for (let i = from; i < first; i++) frag.appendChild(itemFor(i));
    const beforeHeight = el.scrollHeight;
    el.insertBefore(frag, el.firstChild);
    el.scrollTop += el.scrollHeight - beforeHeight;
    first = from;
    updateHeader();
  }

  /** Total number of stored entries (also useful for tests). */
  const size = () => entries.length;
  const rendered = () => list().children.length;

  document.addEventListener('DOMContentLoaded', () => {
    $('sl-clear').addEventListener('click', clear);
    $('sl-more').addEventListener('click', showEarlier);
  });

  DLX.stepLog = { reset, add, clear, showEarlier, size, rendered };
})();
