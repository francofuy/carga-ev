import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { queryRows } from './query-helper';

export interface ActiveCharge {
  mode: 'scheduled' | 'live';
  startAt: string;
  targetStopAt: string;
  startPct: number;
}

interface ActiveChargeRow {
  mode: string;
  start_at: string;
  target_stop_at: string;
  start_pct: number;
}

export function getActiveCharge(db: OpfsSAHPoolDatabase): ActiveCharge | null {
  const rows = queryRows<ActiveChargeRow>(db, 'SELECT * FROM active_charge WHERE id = 1');
  const row = rows[0];
  if (!row) return null;
  return {
    mode: row.mode as ActiveCharge['mode'],
    startAt: row.start_at,
    targetStopAt: row.target_stop_at,
    startPct: row.start_pct,
  };
}

export function upsertActiveCharge(db: OpfsSAHPoolDatabase, ac: ActiveCharge): void {
  db.exec(
    `INSERT INTO active_charge (id, mode, start_at, target_stop_at, start_pct)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode,
       start_at = excluded.start_at,
       target_stop_at = excluded.target_stop_at,
       start_pct = excluded.start_pct`,
    { bind: [ac.mode, ac.startAt, ac.targetStopAt, ac.startPct] },
  );
}

export function deleteActiveCharge(db: OpfsSAHPoolDatabase): void {
  db.exec('DELETE FROM active_charge WHERE id = 1');
}
