import type { Charge } from './charges';
import type { Vehicle } from './vehicle';
import type { AppSettings } from './settings';

export const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  vehicle: Vehicle | null;
  settings: AppSettings;
  charges: Charge[];
}
