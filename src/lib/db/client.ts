import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL, SETTINGS_KEYS } from './schema';
import { UTE_2026_RATES, DEFAULT_PUNTA_START_HOUR } from '../tariff';

let dbPromise: Promise<OpfsSAHPoolDatabase> | null = null;

/**
 * Conexión única a la base local. Usa el VFS "opfs-sahpool" a propósito: a diferencia del VFS
 * "opfs" estándar, no requiere headers Cross-Origin-Opener/Embedder-Policy ni correr en un Worker
 * dedicado — corre en el hilo principal y funciona en cualquier hosting estático (GitHub Pages,
 * Netlify, Vercel), que es justo lo que necesita esta PWA sin backend.
 */
export function getDb(): Promise<OpfsSAHPoolDatabase> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function initDb(): Promise<OpfsSAHPoolDatabase> {
  const sqlite3 = await sqlite3InitModule();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'carga-ev' });
  const db = new poolUtil.OpfsSAHPoolDb('/carga-ev.sqlite3');
  db.exec(SCHEMA_SQL);
  seedDefaultSettings(db);

  // Reduce el riesgo de que iOS libere el storage bajo presión de espacio (Fase 14, riesgo #3).
  void navigator.storage?.persist?.();

  return db;
}

function seedDefaultSettings(db: OpfsSAHPoolDatabase): void {
  const defaults: Record<string, string> = {
    [SETTINGS_KEYS.tariffValle]: String(UTE_2026_RATES.valle),
    [SETTINGS_KEYS.tariffLlano]: String(UTE_2026_RATES.llano),
    [SETTINGS_KEYS.tariffPunta]: String(UTE_2026_RATES.punta),
    [SETTINGS_KEYS.puntaStartHour]: String(DEFAULT_PUNTA_START_HOUR),
    [SETTINGS_KEYS.notifBackupEnabled]: '1',
    [SETTINGS_KEYS.theme]: 'auto',
  };
  for (const [key, value] of Object.entries(defaults)) {
    db.exec('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', {
      bind: [key, value],
    });
  }
}

/** Helper de lectura tipado sobre `db.exec(..., rowMode: 'object')`. */
export function queryRows<T>(
  db: OpfsSAHPoolDatabase,
  sql: string,
  bind: unknown[] = [],
): T[] {
  return db.exec(sql, {
    bind: bind as never,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as unknown as T[];
}
