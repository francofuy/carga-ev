/**
 * Motor de cálculo de la tarifa Residencial Triple Horaria de UTE.
 *
 * Simplificación conocida y documentada (Fase 6/14): UTE trata los feriados como fin de
 * semana (sin franja Punta), pero acá no hay calendario de feriados de Uruguay todavía —
 * un feriado entre semana se clasificará como día hábil. Corregible más adelante sumando
 * un calendario de feriados sin tocar el resto del motor.
 */

export interface TariffRates {
  valle: number;
  llano: number;
  punta: number;
}

export type RateClass = 'valle' | 'llano' | 'punta';

export interface ChargeBreakdown {
  valleKwh: number;
  llanoKwh: number;
  puntaKwh: number;
  total: number;
}

/** Pliego Tarifario UTE, vigente desde el 01/01/2026 (precios en $/kWh). */
export const UTE_2026_RATES: TariffRates = { valle: 2.443, llano: 5.172, punta: 12.034 };

/** Franja Punta por defecto: 19:00–23:00 (el usuario la elige entre 17:00 y 23:00 en Ajustes). */
export const DEFAULT_PUNTA_START_HOUR = 19;

/**
 * Clasifica una hora del día según la tarifa Triple Horario.
 * - Valle: 00:00–07:00, todos los días.
 * - Punta: 4 horas consecutivas a elección (17:00–23:00), solo días hábiles.
 * - Llano: el resto (incluye todo el fin de semana fuera del horario Valle).
 */
export function classifyHour(date: Date, puntaStartHour: number): RateClass {
  const hour = date.getHours();
  const day = date.getDay(); // 0 = domingo … 6 = sábado
  const isWeekday = day >= 1 && day <= 5;

  if (hour >= 0 && hour < 7) return 'valle';
  if (isWeekday && hour >= puntaStartHour && hour < puntaStartHour + 4) return 'punta';
  return 'llano';
}

/**
 * Costo de una carga en casa: recorre minuto a minuto el rango [startAt, endAt) clasificando
 * cada minuto, y reparte los kWh totales proporcionalmente al tiempo pasado en cada franja
 * (asume tasa de carga constante — no hay forma de conocer la potencia instantánea real sin
 * monitoreo en vivo del cargador, que quedó fuera de alcance en Fase 12).
 */
export function computeHomeChargeCost(
  startAt: Date,
  endAt: Date,
  totalKwh: number,
  rates: TariffRates,
  puntaStartHour: number,
): ChargeBreakdown {
  const totalMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (totalMinutes <= 0) {
    throw new Error('La hora de fin debe ser posterior a la de inicio.');
  }
  if (totalKwh <= 0) {
    throw new Error('Los kWh cargados deben ser mayores a cero.');
  }

  const minutesByClass: Record<RateClass, number> = { valle: 0, llano: 0, punta: 0 };
  const cursor = new Date(startAt);
  for (let m = 0; m < totalMinutes; m++) {
    minutesByClass[classifyHour(cursor, puntaStartHour)]++;
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  const valleKwh = (minutesByClass.valle / totalMinutes) * totalKwh;
  const llanoKwh = (minutesByClass.llano / totalMinutes) * totalKwh;
  const puntaKwh = (minutesByClass.punta / totalMinutes) * totalKwh;
  const total = valleKwh * rates.valle + llanoKwh * rates.llano + puntaKwh * rates.punta;

  return { valleKwh, llanoKwh, puntaKwh, total };
}

/**
 * Costo de una carga pública: tarifa manual del proveedor × kWh cargados, más un cargo fijo
 * opcional por sesión. En Uruguay UTE (estatal) cobra cargo fijo; eOne, DMC y Evergo (privados) no.
 */
export function computePublicChargeCost(pricePerKwh: number, kwh: number, fixedFee = 0): number {
  if (kwh <= 0) throw new Error('Los kWh cargados deben ser mayores a cero.');
  if (pricePerKwh <= 0) throw new Error('El precio por kWh debe ser mayor a cero.');
  if (fixedFee < 0) throw new Error('El cargo fijo no puede ser negativo.');
  return pricePerKwh * kwh + fixedFee;
}
