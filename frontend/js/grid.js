/* Grid DOM: creation, rendering and highlighting. It reads state but never changes it. */
(function () {
  'use strict';
  const DLX = window.DLX;
  const { SIZE, BOX } = DLX.constants;
  const cells = []; // 81 elements, index = row * 9 + col
  let gridEl = null;

  const cellAt = (r, c) => cells[r * SIZE + c];

  function createGrid(container) {
    gridEl = container;
    container.textContent = '';
    cells.length = 0;
    for (let r = 0; r < SIZE; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      rowEl.setAttribute('role', 'row');
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.tabIndex = -1; // roving tabindex: only the selected cell is a tab stop
        cells.push(cell);
        rowEl.appendChild(cell);
      }
      container.appendChild(rowEl);
    }
  }

  function noteDigits(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
    return out;
  }

  function describeCell(r, c, value, kind) {
    const where = `Row ${r + 1}, Column ${c + 1}`;
    if (value === 0) {
      const notes = noteDigits(DLX.getNotes(r, c));
      return notes.length ? `${where}, empty, notes ${notes.join(', ')}` : `${where}, empty`;
    }
    return `${where}, ${kind === 'clue' ? 'given clue' : kind} ${value}`;
  }

  /** The 3x3 pencil-mark layout inside an empty cell. */
  function buildNotes(mask) {
    const wrap = document.createElement('div');
    wrap.className = 'notes';
    for (let d = 1; d <= 9; d++) {
      const span = document.createElement('span');
      span.textContent = mask & (1 << d) ? String(d) : '';
      wrap.appendChild(span);
    }
    return wrap;
  }

  /** Redraw every cell from state. Returns the board assessment so callers can update status. */
  function renderGrid({ reveal = false } = {}) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cellAt(r, c);
        const value = DLX.getValue(r, c);
        const kind = DLX.getCellKind(r, c);
        const mask = value === 0 ? DLX.getNotes(r, c) : 0;
        const sig = `${value}|${mask}`;
        if (el._sig !== sig) {
          el._sig = sig;
          if (value !== 0) el.textContent = String(value);
          else if (mask !== 0) { el.textContent = ''; el.appendChild(buildNotes(mask)); }
          else el.textContent = '';
        }
        el.dataset.kind = kind;
        el.classList.remove('bt');
        if (reveal && kind === 'solved') {
          el.style.setProperty('--d', `${(r * SIZE + c) * 14}ms`);
          el.classList.add('reveal');
        } else {
          el.classList.remove('reveal');
        }
        el.setAttribute('aria-label', describeCell(r, c, value, kind));
        if (kind === 'clue') el.setAttribute('aria-readonly', 'true');
        else el.removeAttribute('aria-readonly');
      }
    }
    highlightSelection();
    const assessment = DLX.assessBoard(DLX.state.grid);
    highlightConflicts(assessment.conflicts);
    return assessment;
  }

  /** Selected cell, its row/column/box, and cells holding the same digit. */
  function highlightSelection() {
    const { row: sr, col: sc } = DLX.state.selected;
    const selectedValue = DLX.getValue(sr, sc);
    const boxRow = Math.floor(sr / BOX);
    const boxCol = Math.floor(sc / BOX);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cellAt(r, c);
        const isSelected = r === sr && c === sc;
        const inPeerGroup = r === sr || c === sc || (Math.floor(r / BOX) === boxRow && Math.floor(c / BOX) === boxCol);
        el.classList.toggle('selected', isSelected);
        el.classList.toggle('peer', !isSelected && inPeerGroup);
        el.classList.toggle('same', !isSelected && selectedValue !== 0 && DLX.getValue(r, c) === selectedValue);
        el.tabIndex = isSelected ? 0 : -1;
        el.setAttribute('aria-selected', String(isSelected));
      }
    }
  }

  function highlightConflicts(conflicts) {
    for (let i = 0; i < cells.length; i++) {
      const isConflict = conflicts.has(i);
      cells[i].classList.toggle('conflict', isConflict);
      if (isConflict) cells[i].setAttribute('aria-invalid', 'true');
      else cells[i].removeAttribute('aria-invalid');
    }
  }

  function selectCell(r, c, { focus = false } = {}) {
    const row = Math.max(0, Math.min(SIZE - 1, r));
    const col = Math.max(0, Math.min(SIZE - 1, c));
    DLX.state.selected = { row, col };
    highlightSelection();
    if (focus) cellAt(row, col).focus();
  }

  const setGridBusy = (busy) => gridEl.setAttribute('aria-busy', String(busy));
  const getCellEl = (r, c) => cellAt(r, c);

  Object.assign(DLX, { createGrid, renderGrid, highlightSelection, selectCell, setGridBusy, getCellEl });
})();
