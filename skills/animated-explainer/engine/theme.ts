// Light/dark theme. Follows the system (prefers-color-scheme)
// live; `toggleTheme` flips it and remembers the choice in localStorage, or
// forgets it when the choice matches the system again. build.mjs inlines the
// same resolution in <head> so the first paint already has the right theme.
// The CSS keys off <html data-theme>: chrome gets dark variables, canvases an
// Excalidraw-style invert filter (their pixels stay light).
const KEY = 'animate-theme';
const system = matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;
const systemTheme = () => (system.matches ? 'dark' : 'light');

function stored() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

const apply = () => (root.dataset.theme = stored() ?? systemTheme());
system.addEventListener('change', apply);
apply();

export function toggleTheme() {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    if (next === systemTheme()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {}
  root.dataset.theme = next;
}
