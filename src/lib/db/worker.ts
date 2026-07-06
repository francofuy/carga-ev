/**
 * Worker dedicado a SQLite. Necesario porque Safari (a diferencia de Chrome) solo permite
 * `createSyncAccessHandle` — la base del VFS opfs-sahpool — dentro de un Worker, nunca en el
 * hilo principal. Este archivo es la única parte del proyecto que toca la base de datos
 * directamente; el resto de la app le habla por mensajes (ver rpc.ts / api.ts).
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL, SETTINGS_KEYS } from './schema';
import { UTE_2026_RATES, DEFAULT_PUNTA_START_HOUR } from '../tariff';
import { getVehicle, upsertVehicle, deleteVehicle } from './vehicle';
import {
  insertCharge, updateCharge, listCharges, deleteCharge, deleteAllCharges, restoreCharge, getStatsSince,
  getMonthlyTotals, getRealConsumption,
  type NewCharge, type Charge,
} from './charges';
import { getSettings, getTariffRates, setSetting } from './settings';
import { BACKUP_VERSION, type BackupData } from './backup';

const ctx = self as unknown as {
  postMessage(msg: unknown): void;
  onmessage: ((ev: MessageEvent) => unknown) | null;
  navigator: { storage?: { persist?: () => Promise<boolean> } };
};

let dbPromise: Promise<OpfsSAHPoolDatabase> | null = null;

function getDb(): Promise<OpfsSAHPoolDatabase> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function initDb(): Promise<OpfsSAHPoolDatabase> {
  const sqlite3 = await sqlite3InitModule();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'carga-ev' });
  const db = new poolUtil.OpfsSAHPoolDb('/carga-ev.sqlite3');
  db.exec(SCHEMA_SQL);
  seedDefaultSettings(db);
  void ctx.navigator.storage?.persist?.();
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
    db.exec('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', { bind: [key, value] });
  }
}

const handlers: Record<string, (args: never) => Promise<unknown>> = {
  async getStatsSince(args: { sinceIso: string }) {
    const db = await getDb();
    return getStatsSince(db, args.sinceIso);
  },
  async listCharges(args: { limit?: number }) {
    const db = await getDb();
    return listCharges(db, args.limit);
  },
  async getMonthlyTotals(args: { monthsBack: number }) {
    const db = await getDb();
    return getMonthlyTotals(db, args.monthsBack);
  },
  async insertCharge(args: { input: NewCharge }) {
    const db = await getDb();
    const rates = getTariffRates(db);
    const settings = getSettings(db);
    const input = args.input;
    const revived: NewCharge =
      input.location === 'home'
        ? { ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt) }
        : input;
    return insertCharge(db, revived, rates, settings.puntaStartHour);
  },
  async updateCharge(args: { id: number; input: NewCharge }) {
    const db = await getDb();
    const rates = getTariffRates(db);
    const settings = getSettings(db);
    const input = args.input;
    const revived: NewCharge =
      input.location === 'home'
        ? { ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt) }
        : input;
    return updateCharge(db, args.id, revived, rates, settings.puntaStartHour);
  },
  async deleteCharge(args: { id: number }) {
    const db = await getDb();
    deleteCharge(db, args.id);
    return true;
  },
  async getRealConsumption() {
    const db = await getDb();
    return getRealConsumption(db);
  },
  async getVehicle() {
    const db = await getDb();
    return getVehicle(db);
  },
  async upsertVehicle(args: { vehicle: Parameters<typeof upsertVehicle>[1] }) {
    const db = await getDb();
    upsertVehicle(db, args.vehicle);
    return true;
  },
  async getSettings() {
    const db = await getDb();
    return getSettings(db);
  },
  async setSetting(args: { key: string; value: string }) {
    const db = await getDb();
    setSetting(db, args.key, args.value);
    return true;
  },
  async exportBackup(): Promise<BackupData> {
    const db = await getDb();
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      vehicle: getVehicle(db),
      settings: getSettings(db),
      charges: listCharges(db, Number.MAX_SAFE_INTEGER),
    };
  },
  async restoreBackup(args: { backup: BackupData }) {
    const db = await getDb();
    const { backup } = args;
    deleteAllCharges(db);
    deleteVehicle(db);
    if (backup.vehicle) upsertVehicle(db, backup.vehicle);
    for (const [key, value] of Object.entries(backup.settings)) {
      setSetting(db, keyToSettingName(key), String(value));
    }
    // Se restauran de la más vieja a la más nueva para que los ids nuevos respeten el orden original.
    const ordered = [...backup.charges].reverse();
    for (const c of ordered) {
      const { id: _id, ...rest } = c;
      restoreCharge(db, rest as Omit<Charge, 'id'>);
    }
    return true;
  },
  async wipeData() {
    const db = await getDb();
    deleteAllCharges(db);
    deleteVehicle(db);
    return true;
  },
};

function keyToSettingName(camelKey: string): string {
  const map: Record<string, string> = {
    tariffValle: 'tariff_valle',
    tariffLlano: 'tariff_llano',
    tariffPunta: 'tariff_punta',
    puntaStartHour: 'punta_start_hour',
    notifBackupEnabled: 'notif_backup_enabled',
    theme: 'theme',
  };
  return map[camelKey] ?? camelKey;
}

ctx.onmessage = async (ev: MessageEvent<{ id: number; method: string; args: never }>) => {
  const { id, method, args } = ev.data;
  try {
    const handler = handlers[method];
    if (!handler) throw new Error(`Método desconocido: ${method}`);
    const result = await handler(args);
    ctx.postMessage({ id, result });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
