/**
 * Cliente de la API Ninjas Electric Vehicle API (https://api-ninjas.com/api/electricvehicle).
 * Verificado a mano (Fase 15): CORS abierto, se puede llamar directo desde el navegador sin
 * backend propio. Requiere una API key personal — se guarda en Ajustes, nunca en el código
 * (el repo es público, no puede tener secretos hardcodeados).
 */
export interface EvSearchResult {
  make: string;
  model: string;
  batteryKwh: number;
  consumptionWhKm: number;
}

interface EvApiRow {
  make?: string;
  model?: string;
  battery_capacity?: number | string;
  vehicle_consumption?: number | string;
}

export async function searchElectricVehicles(query: string, apiKey: string): Promise<EvSearchResult[]> {
  const trimmedKey = apiKey.trim();
  const trimmedQuery = query.trim();
  if (!trimmedKey) throw new Error('Falta la API key de API Ninjas — cargala en Ajustes.');
  if (!trimmedQuery) throw new Error('Escribí un modelo para buscar.');

  const url = `https://api.api-ninjas.com/v1/electricvehicle?model=${encodeURIComponent(trimmedQuery)}`;
  const res = await fetch(url, { headers: { 'X-Api-Key': trimmedKey } });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `La API respondió con un error (${res.status}).`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error('Respuesta inesperada de la API.');

  return (data as EvApiRow[])
    .map((v) => ({
      make: v.make ?? '',
      model: v.model ?? '',
      batteryKwh: Number(v.battery_capacity ?? 0),
      consumptionWhKm: Number(v.vehicle_consumption ?? 0),
    }))
    .filter((v) => v.batteryKwh > 0);
}
