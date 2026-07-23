/**
 * Motor de personalización — reemplaza el selector de 5 acentos fijos por un sistema completo,
 * portado y mejorado del que ya existe en "Surtido y Cuentas" (proyecto hermano):
 * color libre por matiz (hue/hue2 + armonía + contraste WCAG automático), tipografía (escala +
 * peso), forma de los botones, estilo de contenedores, íconos, aurora, y color de alerta curado.
 *
 * A diferencia de Surtido (que es siempre oscura), Electrico tiene modos claro/oscuro/automático
 * ya establecidos — --hue/--hue2 rotan el matiz, pero la saturación y luminosidad de cada token
 * quedan fijas por tema (ver tokens.css), así que un mismo matiz se ve bien en los dos.
 */

export interface PersonalizacionConfig {
  hue: number;
  hue2: number;
  linked: boolean;
  harmony: 180 | 40 | 120;
  radiusScale: number;
  fontScale: 'compacta' | 'estandar' | 'grande';
  numberWeight: 'regular' | 'semibold';
  forma: 'plano' | 'suave' | 'profundo' | 'vivo';
  contenedores: 'solido' | 'sin' | 'contorno';
  iconos: 'contorno' | 'relleno';
  auroraIntensidad: number;
  auroraVelocidad: 'rapido' | 'normal' | 'apagado';
  alertColor: string;
}

/** Default calibrado para reproducir el celeste histórico (#1F8FE0/#4FB0F5, hue≈205°) — instalar esto no cambia nada visualmente hasta que se toque Ajustes → Personalización. */
export const DEFAULT_PERSONALIZACION: PersonalizacionConfig = {
  hue: 205,
  hue2: 25,
  linked: true,
  harmony: 180,
  radiusScale: 1,
  fontScale: 'estandar',
  numberWeight: 'regular',
  forma: 'plano',
  contenedores: 'solido',
  iconos: 'contorno',
  auroraIntensidad: 30,
  auroraVelocidad: 'normal',
  alertColor: '#d03b3b',
};

export interface PersonalizacionPreset {
  id: string;
  name: string;
  hue: number;
  hue2: number;
}

/** Los 5 acentos viejos, mapeados a su matiz real (hue2 = complementario, para que el preset ya se vea "completo" al elegirlo). */
export const PRESETS: PersonalizacionPreset[] = [
  { id: 'celeste', name: 'Celeste', hue: 205, hue2: 25 },
  { id: 'menta', name: 'Menta', hue: 157, hue2: 337 },
  { id: 'violeta', name: 'Violeta', hue: 248, hue2: 68 },
  { id: 'ambar', name: 'Ámbar', hue: 33, hue2: 213 },
  { id: 'frambuesa', name: 'Frambuesa', hue: 337, hue2: 157 },
];

export const ALERT_COLOR_CHOICES = [
  { hex: '#d03b3b', name: 'Rojo' },
  { hex: '#d68f1a', name: 'Ámbar' },
  { hex: '#e0526e', name: 'Coral' },
];

/** Solo para migrar una instalación que ya tenía un `accentColor` hex guardado (viejo sistema de 5 swatches) a un matiz — se usa una única vez si todavía no hay `personalizacion` guardada. */
export function hexToHue(hex: string): number {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return DEFAULT_PERSONALIZACION.hue;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}
function relLuminance([r, g, b]: [number, number, number]): number {
  const chan = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function contrastRatio(l1: number, l2: number): number {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}

/** Texto seguro (WCAG) sobre el acento, calculado en vivo — nunca hardcodeado, para que cualquier matiz elegido siga siendo legible. */
export function pickTextOnAccent(hue: number, s: number, l: number): { color: string; isDark: boolean; ratio: number } {
  const accentLum = relLuminance(hslToRgb(hue, s, l));
  const cDark = contrastRatio(accentLum, relLuminance([16, 17, 22]));
  const cLight = contrastRatio(accentLum, relLuminance([255, 255, 255]));
  const isDark = cDark >= cLight;
  return { color: isDark ? '#0E1116' : '#FFFFFF', isDark, ratio: isDark ? cDark : cLight };
}

/** Saturación/luminosidad del acento por tema — calibradas para reproducir el celeste histórico en hue=205. */
function accentSL(isDark: boolean): { s: number; l: number } {
  return isDark ? { s: 89, l: 64 } : { s: 76, l: 50 };
}

function isDarkActive(): boolean {
  const override = document.documentElement.dataset.theme;
  if (override === 'dark') return true;
  if (override === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/**
 * Hex del acento para la Live Activity/Dynamic Island — siempre calibrado con la saturación/
 * luminosidad del tema OSCURO, sin importar el tema real de la app: esas superficies nativas
 * siempre corren sobre fondo negro (`activityBackgroundTint(Color.black)`, fijo en
 * LiveActivityWidgetBundle.swift), así que un acento pensado para fondo claro se vería apagado ahí.
 */
export function getAccentHexForDarkChrome(hue: number): string {
  const { s, l } = accentSL(true);
  return rgbToHex(hslToRgb(hue, s, l));
}

/** S/L del acento para el tema REALMENTE activo ahora mismo — para que el badge de contraste en Ajustes no describa siempre el tema claro. */
export function getCurrentAccentSL(): { s: number; l: number } {
  return accentSL(isDarkActive());
}

const FONT_SCALE_VALUES: Record<PersonalizacionConfig['fontScale'], number> = {
  compacta: 0.94,
  estandar: 1,
  grande: 1.1,
};
const AURORA_DURATIONS: Record<PersonalizacionConfig['auroraVelocidad'], string> = {
  rapido: '9s',
  normal: '16s',
  apagado: '16s',
};

/** Aplica toda la config al documento — variables CSS + atributos de datos, para que las reglas en shell.css reaccionen sin tocar cada pantalla. Se llama al arrancar y en cada cambio desde Ajustes (sin botón de confirmar). */
export function applyPersonalizacion(config: PersonalizacionConfig): void {
  const root = document.documentElement;
  const style = root.style;
  const dark = isDarkActive();
  const { s, l } = accentSL(dark);

  style.setProperty('--hue', String(config.hue));
  style.setProperty('--hue2', String(config.hue2));
  style.setProperty('--accent-ink', pickTextOnAccent(config.hue, s, l).color);
  style.setProperty('--radius-scale', String(config.radiusScale));
  style.setProperty('--font-scale', String(FONT_SCALE_VALUES[config.fontScale]));
  style.setProperty('--number-weight', config.numberWeight === 'semibold' ? '800' : '700');
  style.setProperty('--aurora-opacity', String(config.auroraIntensidad / 100));
  style.setProperty('--aurora-duration', AURORA_DURATIONS[config.auroraVelocidad]);
  style.setProperty('--critical', config.alertColor);

  root.dataset.forma = config.forma;
  root.dataset.contenedores = config.contenedores;
  root.dataset.icons = config.iconos;
  root.dataset.auroraVelocidad = config.auroraVelocidad;
}

/** Se llama también cuando cambia el tema (claro/oscuro/automático), porque --accent-ink depende de qué tema está activo ahora mismo. */
export function reapplyAccentInkForTheme(config: PersonalizacionConfig): void {
  const dark = isDarkActive();
  const { s, l } = accentSL(dark);
  document.documentElement.style.setProperty('--accent-ink', pickTextOnAccent(config.hue, s, l).color);
}
