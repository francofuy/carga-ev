import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';
import { queryRows } from './query-helper';
import { computeHomeChargeCost, computePublicChargeCost, type TariffRates } from '../tariff';

export type ChargeLocation = 'home' | 'public';

export interface NewHomeCharge {
  location: 'home';
  startAt: Date;
  endAt: Date;
  kwh: number;
  odometerKm: number | null;
}
export interface NewPublicCharge {
  location: 'public';
  kwh: number;
  pricePerKwh: number;
  odometerKm: number | null;
}
export type NewCharge = NewHomeCharge | NewPublicCharge;

export interface Charge {
  id: number;
  location: ChargeLocation;
  startAt: string | null;
  endAt: string | null;
  kwh: number;
  odometerKm: number | null;
  pricePerKwh: number | null;
  cost: number;
  valleKwh: number;
  llanoKwh: number;
  puntaKwh: number;
  createdAt: string;
}

interface ChargeRow {
  id: number;
  location: string;
  start_at: string | null;
  end_at: string | null;
  kwh: number;
  odometer_km: number | null;
  price_per_kwh: number | null;
  cost: number;
  breakdown_valle_kwh: number;
  breakdown_llano_kwh: number;
  breakdown_punta_kwh: number;
  created_at: string;
}

function fromRow(row: ChargeRow): Charge {
  return {
    id: row.id,
    location: row.location as ChargeLocation,
    startAt: row.start_at,
    endAt: row.end_at,
    kwh: row.kwh,
    odometerKm: row.odometer_km,
    pricePerKwh: row.price_per_kwh,
    cost: row.cost,
    valleKwh: row.breakdown_valle_kwh,
    llanoKwh: row.breakdown_llano_kwh,
    puntaKwh: row.breakdown_punta_kwh,
    createdAt: row.created_at,
  };
}

/** Inserta una carga calculando el costo con el motor de tarifas — nunca se confía en un costo pasado desde la UI. */
export function insertCharge(
  db: OpfsSAHPoolDatabase,
  input: NewCharge,
  rates: TariffRates,
  puntaStartHour: number,
): Charge {
  let cost: number, valleKwh: number, llanoKwh: number, puntaKwh: number;
  let startAt: string | null = null, endAt: string | null = null, pricePerKwh: number | null = null;

  if (input.location === 'home') {
    const b = computeHomeChargeCost(input.startAt, input.endAt, input.kwh, rates, puntaStartHour);
    cost = b.total; valleKwh = b.valleKwh; llanoKwh = b.llanoKwh; puntaKwh = b.puntaKwh;
    startAt = input.startAt.toISOString();
    endAt = input.endAt.toISOString();
  } else {
    cost = computePublicChargeCost(input.pricePerKwh, input.kwh);
    valleKwh = 0; llanoKwh = 0; puntaKwh = 0;
    pricePerKwh = input.pricePerKwh;
  }

  db.exec(
    `INSERT INTO charges
       (location, start_at, end_at, kwh, odometer_km, price_per_kwh, cost,
        breakdown_valle_kwh, breakdown_llano_kwh, breakdown_punta_kwh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    { bind: [input.location, startAt, endAt, input.kwh, input.odometerKm, pricePerKwh, cost, valleKwh, llanoKwh, puntaKwh] },
  );

  const rows = queryRows<ChargeRow>(db, 'SELECT * FROM charges WHERE id = last_insert_rowid()');
  return fromRow(rows[0]);
}

export function listCharges(db: OpfsSAHPoolDatabase, limit = 100): Charge[] {
  const rows = queryRows<ChargeRow>(
    db,
    'SELECT * FROM charges ORDER BY COALESCE(start_at, created_at) DESC LIMIT ?',
    [limit],
  );
  return rows.map(fromRow);
}

export function deleteCharge(db: OpfsSAHPoolDatabase, id: number): void {
  db.exec('DELETE FROM charges WHERE id = ?', { bind: [id] });
}

export function deleteAllCharges(db: OpfsSAHPoolDatabase): void {
  db.exec('DELETE FROM charges');
}

/**
 * Inserta una carga ya calculada tal cual, sin recalcular el costo con el motor de tarifas.
 * Solo para restaurar un backup: preserva el costo histórico real, que pudo haberse calculado
 * con tarifas UTE distintas a las vigentes hoy.
 */
export function restoreCharge(db: OpfsSAHPoolDatabase, c: Omit<Charge, 'id'>): void {
  db.exec(
    `INSERT INTO charges
       (location, start_at, end_at, kwh, odometer_km, price_per_kwh, cost,
        breakdown_valle_kwh, breakdown_llano_kwh, breakdown_punta_kwh, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    {
      bind: [
        c.location, c.startAt, c.endAt, c.kwh, c.odometerKm, c.pricePerKwh, c.cost,
        c.valleKwh, c.llanoKwh, c.puntaKwh, c.createdAt,
      ],
    },
  );
}

export interface PeriodStats {
  totalCost: number;
  count: number;
  avgCostPerKwh: number;
  valleSharePct: number;
  llanoSharePct: number;
  puntaSharePct: number;
  /** null si hay menos de 2 lecturas de odómetro en el período — no se puede estimar. */
  costPerKm: number | null;
}

/** Estadísticas para el dashboard, sobre las cargas desde `sinceIso` (inclusive). */
export function getStatsSince(db: OpfsSAHPoolDatabase, sinceIso: string): PeriodStats {
  const rows = queryRows<{
    total_cost: number | null;
    count: number;
    total_kwh: number | null;
    valle: number | null;
    llano: number | null;
    punta: number | null;
    min_odo: number | null;
    max_odo: number | null;
    odo_count: number;
  }>(
    db,
    `SELECT
       SUM(cost) AS total_cost,
       COUNT(*) AS count,
       SUM(kwh) AS total_kwh,
       SUM(breakdown_valle_kwh) AS valle,
       SUM(breakdown_llano_kwh) AS llano,
       SUM(breakdown_punta_kwh) AS punta,
       MIN(odometer_km) AS min_odo,
       MAX(odometer_km) AS max_odo,
       COUNT(odometer_km) AS odo_count
     FROM charges
     WHERE COALESCE(start_at, created_at) >= ?`,
    [sinceIso],
  );
  const r = rows[0];
  const totalCost = r?.total_cost ?? 0;
  const totalKwh = r?.total_kwh ?? 0;
  const homeKwh = (r?.valle ?? 0) + (r?.llano ?? 0) + (r?.punta ?? 0);
  const km = (r?.odo_count ?? 0) >= 2 && r?.max_odo != null && r?.min_odo != null ? r.max_odo - r.min_odo : 0;
  return {
    totalCost,
    count: r?.count ?? 0,
    avgCostPerKwh: totalKwh > 0 ? totalCost / totalKwh : 0,
    valleSharePct: homeKwh > 0 ? ((r?.valle ?? 0) / homeKwh) * 100 : 0,
    llanoSharePct: homeKwh > 0 ? ((r?.llano ?? 0) / homeKwh) * 100 : 0,
    puntaSharePct: homeKwh > 0 ? ((r?.punta ?? 0) / homeKwh) * 100 : 0,
    costPerKm: km > 0 ? totalCost / km : null,
  };
}

export interface MonthlyTotal {
  monthLabel: string;
  total: number;
}

/** Gasto total por mes, para el gráfico de tendencia — de más viejo a más nuevo. */
export function getMonthlyTotals(db: OpfsSAHPoolDatabase, monthsBack: number): MonthlyTotal[] {
  const now = new Date();
  const out: MonthlyTotal[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = monthDate.toISOString();
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();
    const rows = queryRows<{ total: number | null }>(
      db,
      `SELECT SUM(cost) AS total FROM charges
       WHERE COALESCE(start_at, created_at) >= ? AND COALESCE(start_at, created_at) < ?`,
      [start, end],
    );
    out.push({ monthLabel: monthDate.toLocaleDateString('es-UY', { month: 'short' }), total: rows[0]?.total ?? 0 });
  }
  return out;
}
