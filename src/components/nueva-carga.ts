import { computeHomeChargeCost, computePublicChargeCost, type TariffRates } from '../lib/tariff';
import { getSettings, insertCharge } from '../lib/db/api';
import { notifyChargesUpdated } from '../lib/bus';

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
        <div class="form-error" id="ncError"></div>
        <div id="ncFieldsHome">
          <div class="field"><label>Hora de inicio</label><div class="input"><input type="time" id="ncStart" value="22:00"></div></div>
          <div class="field"><label>Hora de fin</label><div class="input"><input type="time" id="ncEnd" value="06:00"></div></div>
          <div class="field"><label>kWh cargados</label><div class="input"><input type="number" step="0.1" min="0" id="ncKwhHome" placeholder="0.0"><span class="unit">kWh</span></div></div>
          <div class="field"><label>Odómetro actual (opcional)</label><div class="input"><input type="number" step="1" min="0" id="ncOdoHome" placeholder="km"><span class="unit">km</span></div></div>
        </div>
        <div id="ncFieldsPublic" style="display:none;">
          <div class="field"><label>Precio por kWh</label><div class="input"><span class="unit">$</span><input type="number" step="0.01" min="0" id="ncPrice" placeholder="0.00"></div></div>
          <div class="field"><label>kWh cargados</label><div class="input"><input type="number" step="0.1" min="0" id="ncKwhPublic" placeholder="0.0"><span class="unit">kWh</span></div></div>
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
  const kwhHomeInput = root.querySelector<HTMLInputElement>('#ncKwhHome')!;
  const odoHomeInput = root.querySelector<HTMLInputElement>('#ncOdoHome')!;
  const priceInput = root.querySelector<HTMLInputElement>('#ncPrice')!;
  const kwhPublicInput = root.querySelector<HTMLInputElement>('#ncKwhPublic')!;
  const odoPublicInput = root.querySelector<HTMLInputElement>('#ncOdoPublic')!;

  let rates: TariffRates | null = null;
  let puntaStartHour = 19;
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

  function recalcPreview(): void {
    showError(null);
    if (!rates) return;
    try {
      if (origin() === 'home') {
        const kwh = parseFloat(kwhHomeInput.value);
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
        const kwh = parseFloat(kwhPublicInput.value);
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
    showError(null);
    amountEl.textContent = '$0';
    breakdownEl.innerHTML = '';
  }

  async function open(): Promise<void> {
    resetForm();
    overlay.classList.add('open');
    try {
      const settings = await getSettings();
      rates = { valle: settings.tariffValle, llano: settings.tariffLlano, punta: settings.tariffPunta };
      puntaStartHour = settings.puntaStartHour;
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
      const isHome = btn.getAttribute('data-origin') === 'home';
      fieldsHome.style.display = isHome ? 'block' : 'none';
      fieldsPublic.style.display = isHome ? 'none' : 'block';
      recalcPreview();
    });
  });

  [startInput, endInput, kwhHomeInput, priceInput, kwhPublicInput].forEach((el) =>
    el.addEventListener('input', recalcPreview),
  );

  saveBtn.addEventListener('click', () => void handleSave());

  async function handleSave(): Promise<void> {
    if (!rates) {
      showError('Todavía no cargaron las tarifas, esperá un segundo.');
      return;
    }
    showError(null);
    saveBtn.disabled = true;
    try {
      if (origin() === 'home') {
        const kwh = parseFloat(kwhHomeInput.value);
        if (!kwh || kwh <= 0) throw new Error('Ingresá los kWh cargados.');
        const { start, end } = resolveChargeWindow(startInput.value, endInput.value, new Date());
        const odo = odoHomeInput.value ? parseFloat(odoHomeInput.value) : null;
        const charge = await insertCharge({ location: 'home', startAt: start, endAt: end, kwh, odometerKm: odo });
        toastText.textContent = 'Carga registrada — $' + Math.round(charge.cost).toLocaleString('es-UY');
      } else {
        const price = parseFloat(priceInput.value);
        const kwh = parseFloat(kwhPublicInput.value);
        if (!price || price <= 0) throw new Error('Ingresá el precio por kWh.');
        if (!kwh || kwh <= 0) throw new Error('Ingresá los kWh cargados.');
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
