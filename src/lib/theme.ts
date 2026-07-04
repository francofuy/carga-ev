export type Theme = 'auto' | 'light' | 'dark';

/** Aplica el tema guardado — sin atributo, sigue prefers-color-scheme (automático), como en tokens.css. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
