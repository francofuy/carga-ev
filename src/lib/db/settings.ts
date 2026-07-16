import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { queryRows } from './query-helper';
import { SETTINGS_KEYS } from './schema';
import type { TariffRates } from '../tariff';
import { DEFAULT_PERSONALIZACION, hexToHue, type PersonalizacionConfig } from '../personalizacion';

export interface AppSettings {
  tariffValle: number;
  tariffLlano: number;
  tariffPunta: number;
  puntaStartHour: number;
  notifBackupEnabled: boolean;
  theme: 'auto' | 'light' | 'dark';
  accentColor: string;
  personalizacion: PersonalizacionConfig;
  /** Amperaje/voltaje reales del cargador de Casa (ej. 24A/226V) — usados por src/lib/estimation.ts para calcular kW. */
  homeChargerAmps: number;
  homeChargerVolts: number;
  /** Ubicación de Casa para el futuro aviso de geofencing — null hasta que el usuario la guarde una vez. */
  homeLat: number | null;
  homeLng: number | null;
}

/** Si ya existe `personalizacion` guardada, se usa tal cual (con merge de defaults por si se agregó un campo nuevo). Si no, se migra una única vez desde el `accentColor` hex del viejo sistema de 5 swatches, para no perder el color elegido. */
function resolvePersonalizacion(raw: string | undefined, accentColor: string): PersonalizacionConfig {
  if (raw) {
    try {
      return { ...DEFAULT_PERSONALIZACION, ...(JSON.parse(raw) as Partial<PersonalizacionConfig>) };
    } catch {
      // JSON corrupto — cae al default/migración de abajo
    }
  }
  // hue2 se deriva por armonía (complementario, el default de `linked`), no igual a hue — si no,
  // la aurora de todo usuario migrado quedaría monocromática en vez de a dos tonos.
  const hue = hexToHue(accentColor);
  const hue2 = (hue + DEFAULT_PERSONALIZACION.harmony) % 360;
  return { ...DEFAULT_PERSONALIZACION, hue, hue2 };
}

export function getSettings(db: OpfsSAHPoolDatabase): AppSettings {
  const rows = queryRows<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const accentColor = map[SETTINGS_KEYS.accentColor] || '#1F8FE0';
  return {
    tariffValle: Number(map[SETTINGS_KEYS.tariffValle]),
    tariffLlano: Number(map[SETTINGS_KEYS.tariffLlano]),
    tariffPunta: Number(map[SETTINGS_KEYS.tariffPunta]),
    puntaStartHour: Number(map[SETTINGS_KEYS.puntaStartHour]),
    notifBackupEnabled: map[SETTINGS_KEYS.notifBackupEnabled] === '1',
    theme: (map[SETTINGS_KEYS.theme] as AppSettings['theme']) ?? 'auto',
    accentColor,
    personalizacion: resolvePersonalizacion(map[SETTINGS_KEYS.personalizacion], accentColor),
    homeChargerAmps: Number(map[SETTINGS_KEYS.homeChargerAmps]) || 0,
    homeChargerVolts: Number(map[SETTINGS_KEYS.homeChargerVolts]) || 0,
    homeLat: map[SETTINGS_KEYS.homeLat] ? Number(map[SETTINGS_KEYS.homeLat]) : null,
    homeLng: map[SETTINGS_KEYS.homeLng] ? Number(map[SETTINGS_KEYS.homeLng]) : null,
  };
}

export function getTariffRates(db: OpfsSAHPoolDatabase): TariffRates {
  const s = getSettings(db);
  return { valle: s.tariffValle, llano: s.tariffLlano, punta: s.tariffPunta };
}

export function setSetting(db: OpfsSAHPoolDatabase, key: string, value: string): void {
  db.exec('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', {
    bind: [key, value],
  });
}
