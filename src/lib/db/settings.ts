import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { queryRows } from './query-helper';
import { SETTINGS_KEYS } from './schema';
import type { TariffRates } from '../tariff';

export interface AppSettings {
  tariffValle: number;
  tariffLlano: number;
  tariffPunta: number;
  puntaStartHour: number;
  notifBackupEnabled: boolean;
  theme: 'auto' | 'light' | 'dark';
  accentColor: string;
}

export function getSettings(db: OpfsSAHPoolDatabase): AppSettings {
  const rows = queryRows<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    tariffValle: Number(map[SETTINGS_KEYS.tariffValle]),
    tariffLlano: Number(map[SETTINGS_KEYS.tariffLlano]),
    tariffPunta: Number(map[SETTINGS_KEYS.tariffPunta]),
    puntaStartHour: Number(map[SETTINGS_KEYS.puntaStartHour]),
    notifBackupEnabled: map[SETTINGS_KEYS.notifBackupEnabled] === '1',
    theme: (map[SETTINGS_KEYS.theme] as AppSettings['theme']) ?? 'auto',
    accentColor: map[SETTINGS_KEYS.accentColor] || '#1F8FE0',
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
