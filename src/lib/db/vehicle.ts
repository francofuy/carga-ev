import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { queryRows } from './query-helper';

export interface Vehicle {
  name: string;
  batteryKwh: number;
  consumptionWhKm: number;
  realConsumptionWhKm: number | null;
  source: 'api' | 'manual';
}

interface VehicleRow {
  name: string;
  battery_kwh: number;
  consumption_wh_km: number;
  real_consumption_wh_km: number | null;
  source: string;
}

export function getVehicle(db: OpfsSAHPoolDatabase): Vehicle | null {
  const rows = queryRows<VehicleRow>(db, 'SELECT * FROM vehicle WHERE id = 1');
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    batteryKwh: row.battery_kwh,
    consumptionWhKm: row.consumption_wh_km,
    realConsumptionWhKm: row.real_consumption_wh_km,
    source: row.source as Vehicle['source'],
  };
}

export function upsertVehicle(db: OpfsSAHPoolDatabase, v: Vehicle): void {
  db.exec(
    `INSERT INTO vehicle (id, name, battery_kwh, consumption_wh_km, real_consumption_wh_km, source)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       battery_kwh = excluded.battery_kwh,
       consumption_wh_km = excluded.consumption_wh_km,
       real_consumption_wh_km = excluded.real_consumption_wh_km,
       source = excluded.source`,
    { bind: [v.name, v.batteryKwh, v.consumptionWhKm, v.realConsumptionWhKm, v.source] },
  );
}
