// Smoke test manual del motor de tarifas — no es el test suite final, solo valida el cálculo
// antes de confiar en él (riesgo crítico #1 de Fase 3/14).
import { computeHomeChargeCost, computePublicChargeCost, UTE_2026_RATES } from '../src/lib/tariff.ts';

function assertClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 0.5) {
    console.error(`FALLA: ${label} — esperado ~${expected}, obtuvo ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${label} (${actual.toFixed(2)})`);
  }
}

// Caso 1: carga toda dentro de Valle (lunes 00:00–05:00, 10 kWh)
{
  const start = new Date('2026-06-29T00:00:00'); // lunes
  const end = new Date('2026-06-29T05:00:00');
  const r = computeHomeChargeCost(start, end, 10, UTE_2026_RATES, 19);
  assertClose(r.valleKwh, 10, 'Caso 1: 10 kWh íntegros en Valle');
  assertClose(r.total, 10 * UTE_2026_RATES.valle, 'Caso 1: costo total');
}

// Caso 2: carga que cruza Punta -> Valle (lunes 22:14 -> martes 05:30), 24.3 kWh
{
  const start = new Date('2026-06-29T22:14:00'); // lunes, dentro de la franja Punta 19-23
  const end = new Date('2026-06-30T05:30:00'); // martes
  const r = computeHomeChargeCost(start, end, 24.3, UTE_2026_RATES, 19);
  const totalMin = (end - start) / 60000;
  const puntaMin = 46; // 22:14 -> 23:00 (franja Punta configurada 19-23)
  const llanoMin = 60; // 23:00 -> 00:00 (ya cerró Punta, todavía no abrió Valle)
  const valleMin = 5.5 * 60; // 00:00 -> 05:30
  console.log(`  minutos total=${totalMin} punta esperado~${puntaMin} llano esperado~${llanoMin} valle esperado~${valleMin}`);
  assertClose(r.puntaKwh, (puntaMin / totalMin) * 24.3, 'Caso 2: kWh en Punta');
  assertClose(r.llanoKwh, (llanoMin / totalMin) * 24.3, 'Caso 2: kWh en Llano (23:00-00:00)');
  assertClose(r.valleKwh, (valleMin / totalMin) * 24.3, 'Caso 2: kWh en Valle');
}

// Caso 3: fin de semana nunca tiene Punta (sábado 20:00 -> 21:00, 5 kWh, debe ser todo Llano)
{
  const start = new Date('2026-07-04T20:00:00'); // sábado
  const end = new Date('2026-07-04T21:00:00');
  const r = computeHomeChargeCost(start, end, 5, UTE_2026_RATES, 19);
  assertClose(r.llanoKwh, 5, 'Caso 3: fin de semana es Llano, nunca Punta');
  assertClose(r.puntaKwh, 0, 'Caso 3: Punta = 0 en fin de semana');
}

// Caso 4: carga pública
{
  const cost = computePublicChargeCost(15, 14);
  assertClose(cost, 210, 'Caso 4: pública 15 x 14 kWh');
}

console.log(process.exitCode ? '\nHay fallas.' : '\nTodos los casos OK.');
