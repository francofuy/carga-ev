import { computeHomeChargeCost, computePublicChargeCost, type TariffRates } from '../lib/tariff';
import { getSettings, insertCharge, getVehicle } from '../lib/db/api';
import { notifyChargesUpdated } from '../lib/bus';

type ChargeMode = 'kwh' | 'pct';

export function nuevaCargaMarkup(): string {
  return `
    <button class="fab" id="fab" aria-label="Nueva carga"><svg><use href="#i-plus"/></svg></button>
    <div class="sheet-overlay" id="ncOverlay">
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title">Nueva carga</div>
          <button class="sheet-cancel" id="ncCancel">Cancelar</button>
        </div>
        <div class="segmented" id="ncSeg">
          <button class="sel" data-origin="home">Casa</button>
          <button data-origin="public">Público o trabajo</button>
        </div>
        <div class="segmented sub" id="ncModeSeg">
          <button class="sel" data-mode="kwh">kWh</button>
          <button data-mode="pct" id="ncModePctBtn">% batería</button>
        </div>
        <div class="form-note" id="ncNoVehicleNote" style="display:none;">Configurá tu vehículo en la pestaña Vehículo para poder cargar por % de batería.</div>
        <div class="form-error" id="ncError"></div>

        <div id="ncFieldsHome">
          <div class="field"><label>Hora de inicio</label><div class="input"><input type="time" id="ncStart" value="22:00"></div></div>
          <div class="field"><label>Hora de fin</label><div class="input"><input type="time" id="ncEnd" value="06:00"></div></div>

          <div id="ncKwhBlockHome">
            <div class="field"><label>kWh cargados</label><div class="input"><input type="number" step="0.1" min="0" id="ncKwhHome" placeholder="0.0"><span class="unit">kWh</span></div></div>
          </div>
          <div id="ncPctBlockHome" style="display:none;">
            <div class="pct-row">
              <div class="field"><label>Desde %</label><div class="input"><input type="number" min="0" max="100" id="ncPctFromHome" placeholder="0"><span class="unit">%</span></div></div>
              <div class="field"><label>Hasta %</label><div class="input"><input type="number" min="0" max="100" id="ncPctToHome" placeholder="0"><span class="unit">%</span></div></div>
            </div>
            <div class="battery-strip"><span class="fill-before" id="ncStripBeforeHome"></span><span class="fill-delta" id="ncStripDeltaHome"></span></div>
            <div class="computed-kwh"><span>kWh estimados</span><b id="ncComputedKwhHome">—</b></div>
          </div>

          <div class="field"><label>Odómetro actual (opcional)</label><div class="input"><input type="number" step="1" min="0" id="ncOdoHome" placeholder="km"><span class="unit">km</span></div></div>
        </div>

        <div id="ncFieldsPublic" style="display:none;">
          <div class="field"><label>Precio por kWh</label><div class="input"><span class="unit">$</span><input type="number" step="0.01" min="0" id="ncPrice" placeholder="0.00"></div></div>

          <div id="ncKwhBlockPublic">
            <div class="field"><label>kWh cargados</label><div class="input"><input type="number" step="0.1" min="0" id="ncKwhPublic" placeholder="0.0"><span class="unit">kWh</span></div></div>
          </div>
          <div id="ncPctBlockPublic" style="display:none;">
            <div class="pct-row">
              <div class="field"><label>Desde %</label><div class="input"><input type="number" min="0" max="100" id="ncPctFromPublic" placeholder="0"><span class="unit">%</span></div></div>
              <div class="field"><label>Hasta %</label><div class="input"><input type="number" min="0" max="100" id="ncPctToPublic" placeholder="0"><span class="unit">%</span></div></div>
            </div>
            <div class="battery-strip"><span class="fill-before" id="ncStripBeforePublic"></span><span class="fill-delta" id="ncStripDeltaPublic"></span></div>
            <div class="computed-kwh"><span>kWh estimados</span><b id="ncComputedKwhPublic">—</b></div>
          </div>

          <div class="field"><label>Odómetro actual (opcional)</label><div class="input"><input type="number" step="1" min="0" id="ncOdoPublic" placeholder="km"><span class="unit">km</span></div></div>
        </div>

        <div class="cost-preview">
          <div class="label">Costo estimado</div>
          <div class="amount" id="ncAmount">$0</div>
          <div class="breakdown" id="ncBreakdown"></div>
        </div>
        <button class="primary-btn" id="ncSave">Guardar carga</button>
      </div>
    </div>
    <div class="toast-zone"><div class="toast" id="toast"><svg><use href="#i-check"/></svg><span id="toastText">Carga registrada</span></div></div>
  `;
}

/** Reconstruye una hora "HH:MM" del formulario en un Date real, asumiendo que se carga de noche y se consulta a la mañana siguiente (caso normal de uso). */
function resolveChargeWindow(startTime: string, endTime: string, now: Date): { start: Date; end: Date } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(base);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(base);
  end.setHours(eh, em, 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  if (start.getTime() > now.getTime()) {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  return { start, end };
}

export function mountNuevaCarga(root: ParentNode): void {
  const fab = root.querySelector<HTMLButtonElement>('#fab')!;
  const overlay = root.querySelector<HTMLElement>('#ncOverlay')!;
  const cancelBtn = root.querySelector<HTMLButtonElement>('#ncCancel')!;
  const seg = root.querySelector<HTMLElement>('#ncSeg')!;
  const modeSeg = root.querySelector<HTMLElement>('#ncModeSeg')!;
  const modePctBtn = root.querySelector<HTMLButtonElement>('#ncModePctBtn')!;
  const noVehicleNote = root.querySelector<HTMLElement>('#ncNoVehicleNote')!;
  const fieldsHome = root.querySelector<HTMLElement>('#ncFieldsHome')!;
  const fieldsPublic = root.querySelector<HTMLElement>('#ncFieldsPublic')!;
  const amountEl = root.querySelector<HTMLElement>('#ncAmount')!;
  const breakdownEl = root.querySelector<HTMLElement>('#ncBreakdown')!;
  const errorEl = root.querySelector<HTMLElement>('#ncError')!;
  const saveBtn = root.querySelector<HTMLButtonElement>('#ncSave')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const toastText = root.querySelector<HTMLElement>('#toastText')!;

  const startInput = root.querySelector<HTMLInputElement>('#ncStart')!;
  const endInput = root.querySelector<HTMLInputElement>('#ncEnd')!;
  const odoHomeInput = root.querySelector<HTMLInputElement>('#ncOdoHome')!;
  const priceInput = root.querySelector<HTMLInputElement>('#ncPrice')!;
  const odoPublicInput = root.querySelector<HTMLInputElement>('#ncOdoPublic')!;

  const kwhBlockHome = root.querySelector<HTMLElement>('#ncKwhBlockHome')!;
  const pctBlockHome = root.querySelector<HTMLElement>('#ncPctBlockHome')!;
  const kwhHomeInput = root.querySelector<HTMLInputElement>('#ncKwhHome')!;
  const pctFromHome = root.querySelector<HTMLInputElement>('#ncPctFromHome')!;
  const pctToHome = root.querySelector<HTMLInputElement>('#ncPctToHome')!;
  const stripBeforeHome = root.querySelector<HTMLElement>('#ncStripBeforeHome')!;
  const stripDeltaHome = root.querySelector<HTMLElement>('#ncStripDeltaHome')!;
  const computedKwhHome = root.querySelector<HTMLElement>('#ncComputedKwhHome')!;

  const kwhBlockPublic = root.querySelector<HTMLElement>('#ncKwhBlockPublic')!;
  const pctBlockPublic = root.querySelector<HTMLElement>('#ncPctBlockPublic')!;
  const kwhPublicInput = root.querySelector<HTMLInputElement>('#ncKwhPublic')!;
  const pctFromPublic = root.querySelector<HTMLInputElement>('#ncPctFromPublic')!;
  const pctToPublic = root.querySelector<HTMLInputElement>('#ncPctToPublic')!;
  const stripBeforePublic = root.querySelector<HTMLElement>('#ncStripBeforePublic')!;
  const stripDeltaPublic = root.querySelector<HTMLElement>('#ncStripDeltaPublic')!;
  const computedKwhPublic = root.querySelector<HTMLElement>('#ncComputedKwhPublic')!;

  let rates: TariffRates | null = null;
  let puntaStartHour = 19;
  let batteryKwh: number | null = null;
  let mode: ChargeMode = 'kwh';
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function origin(): 'home' | 'public' {
    return seg.querySelector('.sel')?.getAttribute('data-origin') === 'public' ? 'public' : 'home';
  }

  function showError(msg: string | null): void {
    if (!msg) {
      errorEl.classList.remove('show');
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function syncVisibility(): void {
    const isHome = origin() === 'home';
    fieldsHome.style.display = isHome ? 'block' : 'none';
    fieldsPublic.style.display = isHome ? 'none' : 'block';

    const isPct = mode === 'pct';
    kwhBlockHome.style.display = isHome && !isPct ? 'block' : 'none';
    pctBlockHome.style.display = isHome && isPct ? 'block' : 'none';
    kwhBlockPublic.style.display = !isHome && !isPct ? 'block' : 'none';
    pctBlockPublic.style.display = !isHome && isPct ? 'block' : 'none';
  }

  /** kWh = batería_kWh × (hasta% − desde%) / 100 — validado en Wireframe con el GAC Aion UT Max (60 kWh). */
  function kwhFromPct(fromInput: HTMLInputElement, toInput: HTMLInputElement, stripBefore: HTMLElement, stripDelta: HTMLElement, computedEl: HTMLElement): number {
    const from = parseFloat(fromInput.value);
    const to = parseFloat(toInput.value);
    stripBefore.style.width = (isFinite(from) ? Math.max(0, Math.min(100, from)) : 0) + '%';

    if (!isFinite(from) || !isFinite(to)) {
      stripDelta.style.width = '0%';
      computedEl.textContent = '—';
      return 0;
    }
    if (from < 0 || to > 100 || to <= from) {
      stripDelta.style.width = '0%';
      computedEl.textContent = '—';
      return -1; // marca de rango inválido, ver getKwh()
    }
    if (!batteryKwh) {
      computedEl.textContent = '—';
      return 0;
    }
    const clampedFrom = Math.max(0, from);
    const clampedTo = Math.min(100, to);
    stripDelta.style.left = clampedFrom + '%';
    stripDelta.style.width = (clampedTo - clampedFrom) + '%';
    const kwh = (batteryKwh * (clampedTo - clampedFrom)) / 100;
    computedEl.textContent = kwh.toFixed(1) + ' kWh';
    return kwh;
  }

  /** Punto único de verdad para "cuántos kWh cargaste", sin importar el modo elegido. */
  function getKwh(): number {
    if (mode === 'kwh') {
      return parseFloat(origin() === 'home' ? kwhHomeInput.value : kwhPublicInput.value) || 0;
    }
    if (origin() === 'home') {
      return kwhFromPct(pctFromHome, pctToHome, stripBeforeHome, stripDeltaHome, computedKwhHome);
    }
    return kwhFromPct(pctFromPublic, pctToPublic, stripBeforePublic, stripDeltaPublic, computedKwhPublic);
  }

  function recalcPreview(): void {
    showError(null);
    if (!rates) return;
    const kwh = getKwh();
    if (kwh === -1) {
      amountEl.textContent = '$0';
      breakdownEl.innerHTML = '';
      showError('El % de hasta tiene que ser mayor al % de desde (0–100).');
      return;
    }
    try {
      if (origin() === 'home') {
        if (!kwh || kwh <= 0) {
          amountEl.textContent = '$0';
          breakdownEl.innerHTML = '';
          return;
        }
        const { start, end } = resolveChargeWindow(startInput.value, endInput.value, new Date());
        const b = computeHomeChargeCost(start, end, kwh, rates, puntaStartHour);
        amountEl.textContent = '$' + Math.round(b.total).toLocaleString('es-UY');
        const parts: string[] = [];
        if (b.puntaKwh > 0.01) parts.push(`<span class="badge badge-critical">${b.puntaKwh.toFixed(1)} kWh Punta</span>`);
        if (b.llanoKwh > 0.01) parts.push(`<span class="badge badge-warning">${b.llanoKwh.toFixed(1)} kWh Llano</span>`);
        if (b.valleKwh > 0.01) parts.push(`<span class="badge badge-good">${b.valleKwh.toFixed(1)} kWh Valle</span>`);
        breakdownEl.innerHTML = parts.join('');
      } else {
        const price = parseFloat(priceInput.value);
        if (!price || !kwh || price <= 0 || kwh <= 0) {
          amountEl.textContent = '$0';
          breakdownEl.innerHTML = '';
          return;
        }
        const total = computePublicChargeCost(price, kwh);
        amountEl.textContent = '$' + Math.round(total).toLocaleString('es-UY');
        breakdownEl.innerHTML = `<span class="badge badge-neutral">${kwh.toFixed(1)} kWh × $${price.toFixed(2)}/kWh</span>`;
      }
    } catch {
      amountEl.textContent = '$0';
      breakdownEl.innerHTML = '';
    }
  }

  function resetForm(): void {
    kwhHomeInput.value = '';
    odoHomeInput.value = '';
    priceInput.value = '';
    kwhPublicInput.value = '';
    odoPublicInput.value = '';
    pctFromHome.value = '';
    pctToHome.value = '';
    pctFromPublic.value = '';
    pctToPublic.value = '';
    mode = 'kwh';
    modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-mode') === 'kwh'));
    showError(null);
    amountEl.textContent = '$0';
    breakdownEl.innerHTML = '';
    syncVisibility();
  }

  async function open(): Promise<void> {
    resetForm();
    overlay.classList.add('open');
    try {
      const [settings, vehicle] = await Promise.all([getSettings(), getVehicle()]);
      rates = { valle: settings.tariffValle, llano: settings.tariffLlano, punta: settings.tariffPunta };
      puntaStartHour = settings.puntaStartHour;
      batteryKwh = vehicle?.batteryKwh ?? null;
      modePctBtn.disabled = !batteryKwh;
      noVehicleNote.style.display = batteryKwh ? 'none' : 'block';
    } catch (err) {
      showError('No se pudieron cargar las tarifas: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function close(): void {
    overlay.classList.remove('open');
  }

  fab.addEventListener('click', () => void open());
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  seg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      syncVisibility();
      recalcPreview();
    });
  });

  modeSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if ((btn as HTMLButtonElement).disabled) return;
      modeSeg.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      mode = btn.getAttribute('data-mode') === 'pct' ? 'pct' : 'kwh';
      syncVisibility();
      recalcPreview();
    });
  });

  [
    startInput, endInput, kwhHomeInput, priceInput, kwhPublicInput,
    pctFromHome, pctToHome, pctFromPublic, pctToPublic,
  ].forEach((el) => el.addEventListener('input', recalcPreview));

  saveBtn.addEventListener('click', () => void handleSave());

  async function handleSave(): Promise<void> {
    if (!rates) {
      showError('Todavía no cargaron las tarifas, esperá un segundo.');
      return;
    }
    const kwh = getKwh();
    if (kwh === -1) {
      showError('El % de hasta tiene que ser mayor al % de desde (0–100).');
      return;
    }
    showError(null);
    saveBtn.disabled = true;
    try {
      if (!kwh || kwh <= 0) throw new Error(mode === 'pct' ? 'Ingresá el % de desde y hasta.' : 'Ingresá los kWh cargados.');
      if (origin() === 'home') {
        const { start, end } = resolveChargeWindow(startInput.value, endInput.value, new Date());
        const odo = odoHomeInput.value ? parseFloat(odoHomeInput.value) : null;
        const charge = await insertCharge({ location: 'home', startAt: start, endAt: end, kwh, odometerKm: odo });
        toastText.textContent = 'Carga registrada — $' + Math.round(charge.cost).toLocaleString('es-UY');
      } else {
        const price = parseFloat(priceInput.value);
        if (!price || price <= 0) throw new Error('Ingresá el precio por kWh.');
        const odo = odoPublicInput.value ? parseFloat(odoPublicInput.value) : null;
        const charge = await insertCharge({ location: 'public', kwh, pricePerKwh: price, odometerKm: odo });
        toastText.textContent = 'Carga registrada — $' + Math.round(charge.cost).toLocaleString('es-UY');
      }
      close();
      notifyChargesUpdated();
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      saveBtn.disabled = false;
    }
  }
}
