/* Light / dark theme. Loaded in <head> (no defer) so the saved choice is applied before
 * first paint. The preference is stored in localStorage; without one, the OS setting wins
 * and is followed live. */
(function () {
  'use strict';
  const KEY = 'dlx-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: light)');

  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* storage unavailable */ } };

  function current() {
    const saved = read();
    return saved === 'light' || saved === 'dark' ? saved : (media.matches ? 'light' : 'dark');
  }

  function apply(theme) {
    root.dataset.theme = theme;
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
    btn.title = `Switch to ${next} theme`;
  }

  apply(current());

  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      write(next);
      apply(next);
    });
  });

  // Follow the OS only while the user has not chosen explicitly.
  media.addEventListener('change', () => { if (!read()) apply(current()); });
})();
