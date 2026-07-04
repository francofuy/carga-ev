import type { Screen } from './types';
import { getVehicle, upsertVehicle, getSettings } from '../lib/db/api';
import type { Vehicle } from '../lib/db/vehicle';
import { searchElectricVehicles, type EvSearchResult } from '../lib/ev-api';

function viewHtml(v: Vehicle): string {
  const autonomyKm = v.batteryKwh > 0 ? Math.round((v.batteryKwh / (v.consumptionWhKm / 1000)) * 100) / 100 : 0;
  return `
    <div class="vehicle-card">
      <div class="vehicle-photo"><svg viewBox="0 0 24 24"><use href="#i-car"/></svg></div>
      <div class="vehicle-name">${v.name}</div>
      <div class="vehicle-sub">${v.source === 'api' ? 'Agregado vía búsqueda automática' : 'Cargado manualmente'}</div>
      <div class="spec-row"><span>Batería</span><span class="v">${v.batteryKwh} kWh</span></div>
      <div class="spec-row"><span>Consumo homologado</span><span class="v">${v.consumptionWhKm} Wh/km</span></div>
      <div class="spec-row"><span>Autonomía estimada</span><span class="v">≈ ${autonomyKm} km</span></div>
    </div>
    <button class="link-btn" id="vehEdit">Editar vehículo</button>
  `;
}

function searchResultRow(r: EvSearchResult, i: number): string {
  return `
    <div class="row" data-idx="${i}" style="cursor:pointer;">
      <div class="icon-dot"><svg><use href="#i-car"/></svg></div>
      <div class="meta">
        <div class="primary">${r.make} ${r.model}</div>
        <div class="secondary">${r.batteryKwh} kWh · ${r.consumptionWhKm} Wh/km</div>
      </div>
    </div>`;
}

function formHtml(v: Vehicle | null): string {
  const showSearch = !v;
  return `
    ${showSearch ? `
    <div class="card">
      <div class="field"><label>Buscar vehículo</label><div class="input"><input type="text" id="vSearchQuery" placeholder="Ej. Model 3, ID.4, Leaf"></div></div>
      <button class="link-btn" id="vSearchBtn">Buscar</button>
      <div id="vSearchResults" style="margin-top:10px;"></div>
    </div>
    <p style="text-align:center;font-size:12.5px;color:var(--text-muted);margin:14px 0;">— o cargalo manualmente —</p>
    ` : ''}
    <div class="card">
      <div class="field"><label>Nombre del vehículo</label><div class="input"><input type="text" id="vName" value="${v?.name ?? ''}" placeholder="Ej. Volkswagen ID.4"></div></div>
      <div class="field"><label>Batería</label><div class="input"><input type="number" step="0.1" min="0" id="vBattery" value="${v?.batteryKwh ?? ''}"><span class="unit">kWh</span></div></div>
      <div class="field"><label>Consumo homologado</label><div class="input"><input type="number" step="0.1" min="0" id="vConsumption" value="${v?.consumptionWhKm ?? ''}"><span class="unit">Wh/km</span></div></div>
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
    let lastResults: EvSearchResult[] = [];

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
      const searchInput = body.querySelector<HTMLInputElement>('#vSearchQuery');
      const searchBtn = body.querySelector<HTMLButtonElement>('#vSearchBtn');
      const searchResults = body.querySelector<HTMLElement>('#vSearchResults');

      cancelBtn?.addEventListener('click', renderView);

      async function saveVehicle(vehicle: Vehicle) {
        await upsertVehicle(vehicle);
        current = vehicle;
        renderView();
      }

      searchBtn?.addEventListener('click', () => {
        void (async () => {
          if (!searchInput || !searchResults) return;
          searchResults.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Buscando…</p>';
          try {
            const settings = await getSettings();
            lastResults = await searchElectricVehicles(searchInput.value, settings.evApiKey);
            searchResults.innerHTML = lastResults.length
              ? `<div class="list-group">${lastResults.map(searchResultRow).join('')}</div>`
              : '<p style="font-size:13px;color:var(--text-muted);">Sin resultados — probá cargarlo manualmente abajo.</p>';
          } catch (err) {
            searchResults.innerHTML = `<p style="font-size:13px;color:var(--critical);">${err instanceof Error ? err.message : String(err)}</p>`;
          }
        })();
      });

      searchResults?.addEventListener('click', (e) => {
        const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
        if (!rowEl) return;
        const r = lastResults[Number(rowEl.dataset.idx)];
        if (!r) return;
        void saveVehicle({
          name: `${r.make} ${r.model}`.trim(),
          batteryKwh: r.batteryKwh,
          consumptionWhKm: r.consumptionWhKm,
          realConsumptionWhKm: null,
          source: 'api',
        });
      });

      saveBtn.addEventListener('click', () => {
        void (async () => {
          const name = nameInput.value.trim();
          const battery = parseFloat(batteryInput.value);
          const consumption = parseFloat(consumptionInput.value);
          if (!name) { errorEl.textContent = 'Ingresá un nombre para el vehículo.'; errorEl.classList.add('show'); return; }
          if (!battery || battery <= 0) { errorEl.textContent = 'Ingresá la capacidad de batería.'; errorEl.classList.add('show'); return; }
          if (!consumption || consumption <= 0) { errorEl.textContent = 'Ingresá el consumo homologado.'; errorEl.classList.add('show'); return; }
          errorEl.classList.remove('show');
          await saveVehicle({
            name,
            batteryKwh: battery,
            consumptionWhKm: consumption,
            realConsumptionWhKm: current?.realConsumptionWhKm ?? null,
            source: 'manual',
          });
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
