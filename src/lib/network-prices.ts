/**
 * Precios de carga pública por red (UTE, eOne, DMC, Evergo, Mobility, DISA) desde una fuente NO
 * oficial: ningún operador publica esto ellos mismos (confirmado — sus sitios institucionales no
 * tienen tarifas). evuruguay.com mantiene un CSV público, compilado a mano por su dueño mirando
 * cada app — se usa acá solo como sugerencia editable, nunca como verdad absoluta.
 *
 * Estrategia en cascada: fetch en vivo -> si falla, el último fetch exitoso guardado en este
 * dispositivo -> si nunca hubo uno (primer uso sin red), un snapshot fijo tomado a mano.
 */

export interface NetworkPriceRow {
  empresa: string;
  bajada: number;
  precioKwh: number;
}

export type NetworkPriceSource = 'live' | 'cache' | 'fallback';

export interface NetworkPricesResult {
  rows: NetworkPriceRow[];
  source: NetworkPriceSource;
  /** epoch ms de cuándo ESTE dispositivo bajó el archivo (live) o lo tenía cacheado (cache) — null si es el snapshot fijo. */
  fetchedAt: number | null;
  /**
   * epoch ms de la última vez que detectamos que el CONTENIDO cambió, comparado contra el fetch
   * anterior — no es la fecha real de modificación del archivo (el servidor no manda `Last-Modified`
   * y no expone `ETag` vía CORS), es una aproximación acotada a qué tan seguido se abre la app.
   * null si es el snapshot fijo o si es la primera vez que se ve este archivo en este dispositivo.
   */
  changedAt: number | null;
}

const SOURCE_URL = 'https://evuruguay.com/cargadores_all.csv';
const CACHE_KEY = 'carga-ev:network-prices-cache';
const FETCH_TIMEOUT_MS = 4000;

/** Snapshot tomado a mano el 2026-07-14 desde evuruguay.com/cargadores_all.csv — red de resguardo final. */
const FALLBACK_SNAPSHOT: NetworkPriceRow[] = [
  { empresa: "UTE 'Rápidos' (CC)", bajada: 132.9, precioKwh: 11.8 },
  { empresa: "UTE 'Rápidos' Predios Privados (CC)", bajada: 199.4, precioKwh: 11.8 },
  { empresa: "UTE 'Lentos' (AC)", bajada: 54.8, precioKwh: 10.4 },
  { empresa: 'Eone', bajada: 0, precioKwh: 18.3 },
  { empresa: 'Eone (18 a 23hrs)', bajada: 0, precioKwh: 23.851 },
  { empresa: 'DMC (00 a 06hrs)', bajada: 0, precioKwh: 18 },
  { empresa: 'DMC (06 a 17hrs)', bajada: 0, precioKwh: 16 },
  { empresa: 'DMC (17 a 24hrs)', bajada: 0, precioKwh: 15 },
  { empresa: 'Evergo', bajada: 122, precioKwh: 19.52 },
  { empresa: 'Mobility CCS2', bajada: 130, precioKwh: 12.5 },
  { empresa: 'Mobility CCS2 (18 a 22hrs)', bajada: 130, precioKwh: 25.6 },
  { empresa: 'Mobility GBT (18 a 22hrs)', bajada: 130, precioKwh: 30 },
  { empresa: 'Mobility GBT (00 a 7hrs)', bajada: 130, precioKwh: 21.6 },
  { empresa: 'Mobility GBT', bajada: 130, precioKwh: 26.4 },
  { empresa: 'DISA (18 a 22hrs)', bajada: 120, precioKwh: 16 },
  { empresa: 'DISA (00 a 07hrs)', bajada: 120, precioKwh: 10 },
  { empresa: 'DISA', bajada: 120, precioKwh: 12 },
];

function parseCsv(text: string): NetworkPriceRow[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const rows: NetworkPriceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [empresa, bajadaRaw, precioRaw] = line.split(',');
    const bajada = parseFloat(bajadaRaw);
    const precioKwh = parseFloat(precioRaw);
    if (!empresa || !isFinite(precioKwh)) continue;
    rows.push({ empresa: empresa.trim(), bajada: isFinite(bajada) ? bajada : 0, precioKwh });
  }
  return rows;
}

interface CacheShape {
  fetchedAt: number;
  changedAt: number;
  rows: NetworkPriceRow[];
}

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheShape;
  } catch {
    return null;
  }
}

function writeCache(cache: CacheShape): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — no es crítico, seguimos sin cache
  }
}

function rowsEqual(a: NetworkPriceRow[], b: NetworkPriceRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.empresa === b[i].empresa && row.bajada === b[i].bajada && row.precioKwh === b[i].precioKwh);
}

export async function getNetworkPrices(): Promise<NetworkPricesResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(SOURCE_URL, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    if (rows.length === 0) throw new Error('CSV vacío o con formato inesperado');

    const prev = readCache();
    const now = Date.now();
    const changedAt = prev && rowsEqual(prev.rows, rows) ? prev.changedAt : now;
    writeCache({ fetchedAt: now, changedAt, rows });
    return { rows, source: 'live', fetchedAt: now, changedAt };
  } catch {
    const cached = readCache();
    if (cached) return { rows: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt, changedAt: cached.changedAt };
    return { rows: FALLBACK_SNAPSHOT, source: 'fallback', fetchedAt: null, changedAt: null };
  }
}

/* ============================
   Agrupamiento por red + variantes (horario o tipo de conector)
============================ */

export interface NetworkVariant {
  /** nombre completo tal cual viene en el CSV — esto es lo que se guarda como "red" de la carga. */
  empresa: string;
  /** lo que diferencia esta variante dentro de su red — ej. "(18 a 23hrs)", "'Lentos' (AC)", o "Estándar" si la red no tiene variantes. */
  label: string;
  bajada: number;
  precioKwh: number;
  /** [horaInicio, horaFin) si esta variante aplica solo en una franja horaria — null si no varía por hora. */
  timeRange: [number, number] | null;
}

export interface NetworkGroup {
  /** nombre de red para el chip principal — UTE, eOne, DMC, Evergo, Mobility, DISA. */
  key: string;
  variants: NetworkVariant[];
}

const NETWORK_DEFS: { key: string; pattern: RegExp }[] = [
  { key: 'UTE', pattern: /^UTE/i },
  { key: 'eOne', pattern: /^Eone/i },
  { key: 'DMC', pattern: /^DMC/i },
  { key: 'Evergo', pattern: /^Evergo/i },
  { key: 'Mobility', pattern: /^Mobility/i },
  { key: 'DISA', pattern: /^DISA/i },
];

function parseTimeRange(label: string): [number, number] | null {
  const m = label.match(/(\d{1,2})\s*a\s*(\d{1,2})\s*hrs/i);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  return isFinite(start) && isFinite(end) ? [start, end] : null;
}

/**
 * Agrupa las filas del CSV por red reconocida. Filas de redes que no reconocemos (ej. si
 * evuruguay.com agrega una nueva mañana) simplemente no generan grupo — no rompen nada, solo no
 * aparecen como chip todavía.
 */
export function groupNetworkRows(rows: NetworkPriceRow[]): NetworkGroup[] {
  const groups = new Map<string, NetworkVariant[]>();
  for (const row of rows) {
    const def = NETWORK_DEFS.find((d) => d.pattern.test(row.empresa));
    if (!def) continue;
    const rest = row.empresa.replace(def.pattern, '').trim();
    const label = rest || 'Estándar';
    const variant: NetworkVariant = { empresa: row.empresa, label, bajada: row.bajada, precioKwh: row.precioKwh, timeRange: parseTimeRange(label) };
    if (!groups.has(def.key)) groups.set(def.key, []);
    groups.get(def.key)!.push(variant);
  }
  return Array.from(groups.entries()).map(([key, variants]) => ({ key, variants }));
}

/** Elige la variante que aplica ahora mismo según la hora del dispositivo, con fallback a la variante sin horario si ninguna franja matchea. */
export function pickDefaultVariant(group: NetworkGroup, now: Date): NetworkVariant | null {
  if (group.variants.length === 0) return null;
  const hour = now.getHours();
  const timeMatch = group.variants.find((v) => v.timeRange && hour >= v.timeRange[0] && hour < v.timeRange[1]);
  if (timeMatch) return timeMatch;
  return group.variants.find((v) => !v.timeRange) ?? group.variants[0];
}
