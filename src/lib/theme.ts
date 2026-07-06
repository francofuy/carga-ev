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

export const ACCENT_PRESETS = [
  { name: 'Celeste', hex: '#1F8FE0' },
  { name: 'Menta', hex: '#1BAF7A' },
  { name: 'Violeta', hex: '#7C6FE0' },
  { name: 'Ámbar', hex: '#E0902F' },
  { name: 'Frambuesa', hex: '#D9527A' },
] as const;

/** Solo pisa --accent — --accent-soft/--accent-pressed se recalculan solos vía color-mix() en tokens.css. --accent-ink queda fijo por tema, ya elegido para funcionar con los 5 preset. */
export function applyAccentColor(hex: string): void {
  document.documentElement.style.setProperty('--accent', hex);
}
