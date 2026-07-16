/** API de datos para el resto de la app — habla con el Worker de SQLite por mensajes, sin que las pantallas tengan que saberlo. */
import { callDb } from './rpc';
import type { Charge, NewCharge, PeriodStats, MonthlyTotal, RealConsumption } from './charges';
import type { Vehicle } from './vehicle';
import type { AppSettings } from './settings';
import type { BackupData } from './backup';
import type { ActiveCharge } from './active-charge';

export function getStatsSince(sinceIso: string): Promise<PeriodStats> {
  return callDb('getStatsSince', { sinceIso });
}

export function listCharges(limit?: number): Promise<Charge[]> {
  return callDb('listCharges', { limit });
}

export function getMonthlyTotals(monthsBack: number): Promise<MonthlyTotal[]> {
  return callDb('getMonthlyTotals', { monthsBack });
}

export function insertCharge(input: NewCharge): Promise<Charge> {
  return callDb('insertCharge', { input });
}

export function updateCharge(id: number, input: NewCharge): Promise<Charge> {
  return callDb('updateCharge', { id, input });
}

export function deleteCharge(id: number): Promise<void> {
  return callDb('deleteCharge', { id });
}

export function getRealConsumption(): Promise<RealConsumption | null> {
  return callDb('getRealConsumption');
}

export function getVehicle(): Promise<Vehicle | null> {
  return callDb('getVehicle');
}

export function upsertVehicle(vehicle: Vehicle): Promise<void> {
  return callDb('upsertVehicle', { vehicle });
}

export function getActiveCharge(): Promise<ActiveCharge | null> {
  return callDb('getActiveCharge');
}

export function upsertActiveCharge(activeCharge: ActiveCharge): Promise<void> {
  return callDb('upsertActiveCharge', { activeCharge });
}

export function deleteActiveCharge(): Promise<void> {
  return callDb('deleteActiveCharge');
}

export function getSettings(): Promise<AppSettings> {
  return callDb('getSettings');
}

export function setSetting(key: string, value: string): Promise<void> {
  return callDb('setSetting', { key, value });
}

export function exportBackup(): Promise<BackupData> {
  return callDb('exportBackup');
}

export function restoreBackup(backup: BackupData): Promise<void> {
  return callDb('restoreBackup', { backup });
}

export function wipeData(): Promise<void> {
  return callDb('wipeData');
}
