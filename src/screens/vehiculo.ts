import type { Screen } from './types';
import { getVehicle, upsertVehicle } from '../lib/db/api';
import type { Vehicle } from '../lib/db/vehicle';

/**
 * Valores por defecto para el primer alta — specs reales del GAC Aion UT Max (60 kWh) según
 * la prueba de Autoblog Uruguay (consumo homologado WLTP 13,5 kWh/100km = 135 Wh/km). No hay
 * buscador por API: la investigamos (Fase 15) y ninguna base de datos gratuita cubre marcas
 * chinas de nicho como GAC — se descartó por no aportar valor real a este usuario.
 */
const DEFAULT_VEHICLE = { name: 'GAC Aion UT Max', batteryKwh: 60, consumptionWhKm: 135 };

function viewHtml(v: Vehicle): string {
  const autonomyKm = v.batteryKwh > 0 ? Math.round((v.batteryKwh / (v.consumptionWhKm / 1000)) * 100) / 100 : 0;
  return `
    <div class="vehicle-card">
      <div class="vehicle-photo"><svg viewBox="0 0 24 24"><use href="#i-car"/></svg></div>
      <div class="vehicle-name">${v.name}</div>
      <div class="vehicle-sub">Cargado manualmente</div>
      <div class="spec-row"><span>Batería</span><span class="v">${v.batteryKwh} kWh</span></div>
      <div class="spec-row"><span>Consumo homologado</span><span class="v">${v.consumptionWhKm} Wh/km</span></div>
      <div class="spec-row"><span>Autonomía estimada</span><span class="v">≈ ${autonomyKm} km</span></div>
    </div>
    <button class="link-btn" id="vehEdit">Editar vehículo</button>
  `;
}

function formHtml(v: Vehicle | null): string {
  const name = v?.name ?? DEFAULT_VEHICLE.name;
  const battery = v?.batteryKwh ?? DEFAULT_VEHICLE.batteryKwh;
  const consumption = v?.consumptionWhKm ?? DEFAULT_VEHICLE.consumptionWhKm;
  return `
    <div class="card">
      <div class="field"><label>Nombre del vehículo</label><div class="input"><input type="text" id="vName" value="${name}" placeholder="Ej. Volkswagen ID.4"></div></div>
      <div class="field"><label>Batería</label><div class="input"><input type="number" step="0.1" min="0" id="vBattery" value="${battery}"><span class="unit">kWh</span></div></div>
      <div class="field"><label>Consumo homologado</label><div class="input"><input type="number" step="0.1" min="0" id="vConsumption" value="${consumption}"><span class="unit">Wh/km</span></div></div>
      <div class="form-error" id="vError"></div>
      <button class="primary-btn" id="vSave">Guardar vehículo</button>
      ${v ? '<button class="link-btn" id="vCancel" style="margin-top:10px;">Cancelar</button>' : ''}
    </div>
  `;
}

export const vehiculoScreen: Screen = {
  id: 'vehiculo',
  render() {
    return `<div class="nav-title">Vehículo</div><div id="vehBody"><p style="color:var(--text-secondary);font-size:14px;">Cargando…</p></div>`;
  },
  async mount(root) {
    const body = root.querySelector<HTMLElement>('#vehBody')!;
    let current: Vehicle | null = null;

    function renderView() {
      body.innerHTML = current ? viewHtml(current) : formHtml(null);
      if (current) {
        body.querySelector('#vehEdit')!.addEventListener('click', renderForm);
      } else {
        wireForm();
      }
    }

    function renderForm() {
      body.innerHTML = formHtml(current);
      wireForm();
    }

    function wireForm() {
      const nameInput = body.querySelector<HTMLInputElement>('#vName')!;
      const batteryInput = body.querySelector<HTMLInputElement>('#vBattery')!;
      const consumptionInput = body.querySelector<HTMLInputElement>('#vConsumption')!;
      const errorEl = body.querySelector<HTMLElement>('#vError')!;
      const saveBtn = body.querySelector<HTMLButtonElement>('#vSave')!;
      const cancelBtn = body.querySelector<HTMLButtonElement>('#vCancel');
      cancelBtn?.addEventListener('click', renderView);
      saveBtn.addEventListener('click', () => {
        void (async () => {
          const name = nameInput.value.trim();
          const battery = parseFloat(batteryInput.value);
          const consumption = parseFloat(consumptionInput.value);
          if (!name) { errorEl.textContent = 'Ingresá un nombre para el vehículo.'; errorEl.classList.add('show'); return; }
          if (!battery || battery <= 0) { errorEl.textContent = 'Ingresá la capacidad de batería.'; errorEl.classList.add('show'); return; }
          if (!consumption || consumption <= 0) { errorEl.textContent = 'Ingresá el consumo homologado.'; errorEl.classList.add('show'); return; }
          errorEl.classList.remove('show');
          const vehicle: Vehicle = {
            name,
            batteryKwh: battery,
            consumptionWhKm: consumption,
            realConsumptionWhKm: current?.realConsumptionWhKm ?? null,
            source: 'manual',
          };
          await upsertVehicle(vehicle);
          current = vehicle;
          renderView();
        })();
      });
    }

    try {
      current = await getVehicle();
      renderView();
    } catch (err) {
      body.innerHTML = `<p style="color:var(--critical);font-size:14px;">Error cargando el vehículo — ${err instanceof Error ? err.message : String(err)}</p>`;
    }
  },
};
