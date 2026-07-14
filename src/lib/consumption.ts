/** kWh/100km es la unidad estándar de consumo EV (así se publican las fichas WLTP) — Wh/km solo se usa como unidad de entrada manual en el formulario, más simple de tipear. */
export function whKmToKwh100(whKm: number): string {
  return (whKm / 10).toFixed(1);
}

export function autonomyKmFrom(batteryKwh: number, whKm: number): number {
  return whKm > 0 ? Math.round(batteryKwh / (whKm / 1000)) : 0;
}

/** "Autonomía estimada": usa el consumo real si ya hay suficientes tramos, si no cae al homologado — un solo número, sin distinguir la fuente en la UI. */
export function estimatedAutonomyKm(vehicle: { batteryKwh: number; consumptionWhKm: number }, real: { whKm: number } | null): number {
  return autonomyKmFrom(vehicle.batteryKwh, real?.whKm ?? vehicle.consumptionWhKm);
}
