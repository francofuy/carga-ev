/**
 * Motor de estimación de una carga en Casa "en curso" — física real (kW = V×A×η), no un
 * sensor: no hay forma de leer la potencia instantánea real del cargador, así que se
 * calcula a partir de amperaje/voltaje configurados en Ajustes y se corrige con el
 * historial real (ver `computeCalibrationFactor`). Resuelve la ecuación "a qué % llego a
 * una hora de corte dada" — no al revés — porque así es como funciona un EVSE real: se
 * programa por tiempo/límite de energía, no por % objetivo (ver CLAUDE.md).
 */

const ETA_AC = 0.92;
/** Después de este % de batería el litio entra en fase CV (corriente constante ya no, voltaje sí) y el cargador reduce la potencia — la curva "se achata". */
const CC_CV_THRESHOLD_PCT = 80;
/** A 100% de batería la tasa de carga cae a este factor de la potencia nominal (aproximación simple de la cola CV). */
const CV_TAPER_END_FACTOR = 0.25;

export function chargerKw(amps: number, volts: number, eta = ETA_AC): number {
  return (volts * amps * eta) / 1000;
}

function taperFactor(pct: number): number {
  if (pct < CC_CV_THRESHOLD_PCT) return 1;
  const progress = Math.min(1, (pct - CC_CV_THRESHOLD_PCT) / (100 - CC_CV_THRESHOLD_PCT));
  return 1 - progress * (1 - CV_TAPER_END_FACTOR);
}

export interface EstimateResult {
  pct: number;
  kwhDelivered: number;
}

/** Estima % de batería y kWh entregados entre `startAt` y `targetTime`, integrando minuto a minuto (misma idea numérica que `tariff.ts`'s `computeHomeChargeCost`). */
export function estimateAtTime(
  startPct: number,
  startAt: Date,
  targetTime: Date,
  nominalKw: number,
  batteryKwh: number,
  calibrationFactor = 1,
): EstimateResult {
  const totalMinutes = Math.max(0, Math.round((targetTime.getTime() - startAt.getTime()) / 60000));
  const maxKwh = batteryKwh - (batteryKwh * startPct) / 100;
  const kwhPerMinuteNominal = (nominalKw * calibrationFactor) / 60;

  let pct = startPct;
  let kwhDelivered = 0;
  for (let m = 0; m < totalMinutes; m++) {
    if (pct >= 100) break;
    kwhDelivered += kwhPerMinuteNominal * taperFactor(pct);
    pct = startPct + (kwhDelivered / batteryKwh) * 100;
  }
  pct = Math.min(100, pct);
  kwhDelivered = Math.min(kwhDelivered, maxKwh);
  return { pct, kwhDelivered };
}

export interface CalibrationResult {
  factor: number;
  sampleCount: number;
}

interface PastHomeCharge {
  startAt: string | null;
  endAt: string | null;
  startPct: number | null;
  endPct: number | null;
  kwh: number;
}

/**
 * Compara lo que el motor hubiera estimado (con factor 1, sin calibrar) contra lo que
 * realmente se cargó, para cada carga pasada en Casa con % de inicio/fin registrado —
 * no hace falta una tabla nueva, se re-deriva de `charges` en cada llamada.
 */
export function computeCalibrationFactor(
  pastHomeCharges: PastHomeCharge[],
  nominalKw: number,
  batteryKwh: number,
): CalibrationResult {
  const ratios: number[] = [];
  for (const c of pastHomeCharges) {
    if (c.startAt == null || c.endAt == null || c.startPct == null || c.endPct == null) continue;
    const theoretical = estimateAtTime(c.startPct, new Date(c.startAt), new Date(c.endAt), nominalKw, batteryKwh, 1);
    if (theoretical.kwhDelivered <= 0) continue;
    ratios.push(c.kwh / theoretical.kwhDelivered);
  }
  if (ratios.length === 0) return { factor: 1, sampleCount: 0 };
  const factor = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { factor, sampleCount: ratios.length };
}
