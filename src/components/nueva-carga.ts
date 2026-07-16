import { computeHomeChargeCost, computePublicChargeCost, type TariffRates } from '../lib/tariff';
import { getSettings, insertCharge, updateCharge, deleteCharge, getVehicle } from '../lib/db/api';
import type { Charge, NewCharge } from '../lib/db/charges';
import { bus, OPEN_EDIT_CHARGE, RESUME_DRAFT, notifyChargesUpdated, notifyDraftUpdated } from '../lib/bus';
import { sparkBurst } from '../lib/spark-burst';
import { saveDraft, clearDraft, timeAgoLabel, type ChargeDraft } from '../lib/draft';
import { getNetworkPrices, groupNetworkRows, pickDefaultVariant, type NetworkGroup, type NetworkVariant, type NetworkPriceSource } from '../lib/network-prices';
import { upsertActiveCharge, listCharges } from '../lib/db/api';
import { notifyActiveChargeUpdated } from '../lib/bus';
import { chargerKw, estimateAtTime, computeCalibrationFactor } from '../lib/estimation';
import { scheduleActiveChargeNotifications } from '../lib/notifications';

type ChargeMode = 'kwh' | 'pct';
type HomeFlow = 'programar' | 'rapido';
type WhenChoice = 'ahora' | 'tarde';

export function nuevaCargaMarkup(): string {
  return `
    <button class="fab" id="fab" aria-label="Nueva carga"><svg><use href="#i-plus"/></svg></button>
    <div class="sheet-overlay" id="ncOverlay">
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title" id="ncTitle">Nueva carga</div>
          <button class="sheet-cancel" id="ncCancel">Cancelar</button>
        </div>
        <div class="segmented" id="ncSeg">
          <button class="sel" data-origin="home">Casa</button>
          <button data-origin="public">Público o trabajo</button>
        </div>
        <div class="segmented sub" id="ncHomeFlowSeg" style="display:none;">
          <button class="sel" data-flow="programar">Programar</button>
          <button data-flow="rapido">Modo rápido</button>
        </div>
        <div class="segmented sub" id="ncModeSeg">
          <button class="sel" data-mode="kwh">kWh</button>
          <button data-mode="pct" id="ncModePctBtn">% batería</button>
        </div>
        <div class="form-note" id="ncNoVehicleNote" style="display:none;">Configurá tu vehículo en la pestaña Vehículo para poder cargar por % de batería.</div>
        <div class="form-error" id="ncError"></div>

        <div id="ncProgramarBlock" style="display:none;">
          <div class="field"><label>Cargando a</label><div class="input" id="ncPowerRef" style="color:var(--text-secondary);">—</div></div>
          <div class="segmented sub" id="ncWhenSeg">
            <button class="sel" data-when="ahora">Ahora</button>
            <button data-when="tarde">Más tarde</button>
          </div>
          <div class="field" id="ncEmpiezaField" style="display:none;"><label>Empieza a las</label><div class="input"><input type="time" id="ncEmpieza" value="00:00"></div></div>
          <div class="field"><label>Batería al iniciar</label><div class="input"><input type="number" step="0.1" min="0" max="100" id="ncBateriaInicial" placeholder="0.0"><span class="unit">%</span></div></div>
          <div class="field"><label>Corta a las</label><div class="input"><input type="time" id="ncCortaA" value="07:00"></div></div>
          <div class="cost-preview" id="ncEstimateBox">
            <div class="label" id="ncEstimateLabel">Estimado</div>
            <div class="amount" id="ncEstimateValue">—</div>
            <div class="breakdown" id="ncEstimateSub"></div>
          </div>
          <div class="form-note" id="ncEscapeLink" style="cursor:pointer;">¿Fue una carga rápida? <u>Anotar el resultado directo</u></div>
        </div>
        <div class="form-note" id="ncBackToProgramar" style="display:none;cursor:pointer;">‹ Volver a programar</div>

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
          <div class="field">
            <label>Red</label>
            <div class="chip-row" id="ncNetworkRow" style="margin-bottom:8px;"></div>
            <div class="chip-row" id="ncVariantRow" style="margin-bottom:0; display:none;"></div>
          </div>

          <div class="suggest-box" id="ncSuggestBox" style="display:none;">
            <div class="row1"><span class="suggest-label">Sugerido</span><button class="suggest-use" type="button" id="ncSuggestUse">Usar</button></div>
            <div class="suggest-amount" id="ncSuggestAmount">—</div>
            <div class="suggest-sub" id="ncSuggestSub"></div>
          </div>
          <div class="source-line" id="ncSourceLine"></div>

          <div class="field"><label>Precio por kWh</label><div class="input"><span class="unit">$</span><input type="number" step="0.01" min="0" id="ncPrice" placeholder="0.00"></div></div>

          <div class="field" id="ncFixedFeeField" style="display:none;"><label>Cargo fijo</label><div class="input"><span class="unit">$</span><input type="number" step="0.01" min="0" id="ncFixedFee" placeholder="0.00"></div></div>
          <button class="field-toggle-link" type="button" id="ncFixedFeeToggle" style="display:none;">+ Agregar cargo fijo</button>

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

        <div class="cost-preview" id="ncCostPreview">
          <div class="label">Costo estimado</div>
          <div class="amount" id="ncAmount">$0</div>
          <div class="breakdown" id="ncBreakdown"></div>
        </div>
        <button class="primary-btn" id="ncSave">Guardar carga</button>
        <button class="delete-link" id="ncDelete" style="display:none;">Eliminar esta carga</button>
      </div>
    </div>
    <canvas id="sparkFx" style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:29;"></canvas>
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

function isoToTimeInput(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/** Resuelve "HH:MM" a la próxima vez que ocurra esa hora — hoy si todavía no pasó, si no mañana. */
function resolveFutureOrNowTime(timeStr: string, now: Date): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** Resuelve "HH:MM" (hora de corte) relativo a un inicio ya conocido — mismo día si es posterior, si no al día siguiente. */
function resolveStopTime(timeStr: string, start: Date): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m, 0, 0);
  if (d.getTime() <= start.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function mountNuevaCarga(root: ParentNode): void {
  const fab = root.querySelector<HTMLButtonElement>('#fab')!;
  const overlay = root.querySelector<HTMLElement>('#ncOverlay')!;
  const cancelBtn = root.querySelector<HTMLButtonElement>('#ncCancel')!;
  const titleEl = root.querySelector<HTMLElement>('#ncTitle')!;
  const deleteBtn = root.querySelector<HTMLButtonElement>('#ncDelete')!;
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
  const sparkCanvas = root.querySelector<HTMLCanvasElement>('#sparkFx')!;

  function fireSpark(): void {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    sparkBurst(sparkCanvas, window.innerWidth / 2, window.innerHeight - 100, accent || '#1F8FE0');
  }

  const startInput = root.querySelector<HTMLInputElement>('#ncStart')!;
  const endInput = root.querySelector<HTMLInputElement>('#ncEnd')!;
  const odoHomeInput = root.querySelector<HTMLInputElement>('#ncOdoHome')!;
  const priceInput = root.querySelector<HTMLInputElement>('#ncPrice')!;
  const odoPublicInput = root.querySelector<HTMLInputElement>('#ncOdoPublic')!;
  const networkRow = root.querySelector<HTMLElement>('#ncNetworkRow')!;
  const variantRow = root.querySelector<HTMLElement>('#ncVariantRow')!;
  const suggestBox = root.querySelector<HTMLElement>('#ncSuggestBox')!;
  const suggestAmount = root.querySelector<HTMLElement>('#ncSuggestAmount')!;
  const suggestSub = root.querySelector<HTMLElement>('#ncSuggestSub')!;
  const suggestUseBtn = root.querySelector<HTMLButtonElement>('#ncSuggestUse')!;
  const sourceLine = root.querySelector<HTMLElement>('#ncSourceLine')!;
  const fixedFeeField = root.querySelector<HTMLElement>('#ncFixedFeeField')!;
  const fixedFeeToggle = root.querySelector<HTMLButtonElement>('#ncFixedFeeToggle')!;
  const fixedFeeInput = root.querySelector<HTMLInputElement>('#ncFixedFee')!;

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

  const homeFlowSeg = root.querySelector<HTMLElement>('#ncHomeFlowSeg')!;
  const programarBlock = root.querySelector<HTMLElement>('#ncProgramarBlock')!;
  const backToProgramarLink = root.querySelector<HTMLElement>('#ncBackToProgramar')!;
  const powerRefEl = root.querySelector<HTMLElement>('#ncPowerRef')!;
  const whenSeg = root.querySelector<HTMLElement>('#ncWhenSeg')!;
  const empiezaField = root.querySelector<HTMLElement>('#ncEmpiezaField')!;
  const empiezaInput = root.querySelector<HTMLInputElement>('#ncEmpieza')!;
  const bateriaInicialInput = root.querySelector<HTMLInputElement>('#ncBateriaInicial')!;
  const cortaAInput = root.querySelector<HTMLInputElement>('#ncCortaA')!;
  const estimateLabelEl = root.querySelector<HTMLElement>('#ncEstimateLabel')!;
  const estimateValueEl = root.querySelector<HTMLElement>('#ncEstimateValue')!;
  const estimateSubEl = root.querySelector<HTMLElement>('#ncEstimateSub')!;
  const escapeLink = root.querySelector<HTMLElement>('#ncEscapeLink')!;
  const costPreviewEl = root.querySelector<HTMLElement>('#ncCostPreview')!;

  let rates: TariffRates | null = null;
  let puntaStartHour = 19;
  let batteryKwh: number | null = null;
  let mode: ChargeMode = 'kwh';
  let homeFlow: HomeFlow = 'programar';
  let homeChargerAmps = 0;
  let homeChargerVolts = 0;
  let calibrationFactor = 1;
  let calibrationSampleCount = 0;
  let editingId: number | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let fixedFeeManualOpen = false;

  let networkGroups: NetworkGroup[] = [];
  let networkPricesLoaded = false;
  let networkSource: NetworkPriceSource = 'fallback';
  let networkChangedAt: number | null = null;
  let selectedGroupKey: string | null = null;
  let selectedVariant: NetworkVariant | null = null;

  function origin(): 'home' | 'public' {
    return seg.querySelector('.sel')?.getAttribute('data-origin') === 'public' ? 'public' : 'home';
  }

  /** El campo se abre solo cuando la variante elegida cobra cargo fijo (ej. UTE, Evergo); en el resto queda como sugerencia manual vía el link "+ agregar". */
  function isFixedFeeVisible(): boolean {
    return (selectedVariant?.bajada ?? 0) > 0 || fixedFeeManualOpen;
  }

  function syncFixedFeeVisibility(): void {
    const show = isFixedFeeVisible();
    fixedFeeField.style.display = show ? 'block' : 'none';
    fixedFeeToggle.style.display = !show ? 'block' : 'none';
  }

  function getFixedFee(): number {
    return isFixedFeeVisible() ? parseFloat(fixedFeeInput.value) || 0 : 0;
  }

  /** Lo que se guarda como "red" de la carga: el nombre completo de la variante sugerida, o el nombre de red/"Otro" si no hay variante (dato o precio no disponible). */
  function currentNetworkValue(): string | null {
    return selectedVariant ? selectedVariant.empresa : selectedGroupKey;
  }

  function renderSourceLine(): void {
    if (!networkPricesLoaded) {
      sourceLine.innerHTML = '';
      return;
    }
    const dotClass = networkSource === 'live' ? 'live' : networkSource === 'cache' ? 'cache' : 'fallback';
    const label =
      networkSource === 'live'
        ? 'en vivo, hace un instante'
        : networkSource === 'cache'
          ? `caché de ${networkChangedAt ? timeAgoLabel(networkChangedAt) : 'antes'} (sin conexión ahora)`
          : 'datos de referencia fijos (sin conexión, sin caché previo)';
    sourceLine.innerHTML = `<span class="source-dot ${dotClass}"></span>evuruguay.com (no oficial) · ${label}`;
  }

  function renderSuggestBox(): void {
    if (!selectedVariant) {
      suggestBox.style.display = 'none';
      return;
    }
    suggestBox.style.display = 'block';
    suggestAmount.textContent = '$' + selectedVariant.precioKwh.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' /kWh';
    suggestSub.textContent = selectedVariant.bajada > 0 ? `Cargo fijo $${selectedVariant.bajada.toLocaleString('es-UY')} · ${selectedGroupKey}` : `Sin cargo fijo · ${selectedGroupKey}`;
  }

  function renderVariantChips(group: NetworkGroup, selected: NetworkVariant | null): void {
    variantRow.innerHTML = group.variants
      .map((v) => `<button class="chip" type="button" data-variant="${v.empresa}">${v.label}</button>`)
      .join('');
    variantRow.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedVariant = group.variants.find((v) => v.empresa === btn.getAttribute('data-variant')) ?? null;
        variantRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === btn));
        syncFixedFeeVisibility();
        renderSuggestBox();
        recalcPreview();
      });
    });
    variantRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-variant') === selected?.empresa));
  }

  /** Aplica la selección de red actual: arma (o esconde) la fila de variantes y elige una por defecto — según la hora actual, salvo que se pida preservar una puntual (al restaurar una carga/borrador ya guardado). */
  function applyGroupSelection(preferredVariant?: NetworkVariant | null): void {
    const group = networkGroups.find((g) => g.key === selectedGroupKey) ?? null;
    if (!group || group.variants.length <= 1) {
      variantRow.style.display = 'none';
      variantRow.innerHTML = '';
      selectedVariant = group?.variants[0] ?? null;
    } else {
      selectedVariant = preferredVariant !== undefined ? preferredVariant : pickDefaultVariant(group, new Date());
      renderVariantChips(group, selectedVariant);
      variantRow.style.display = 'flex';
    }
    syncFixedFeeVisibility();
    renderSuggestBox();
  }

  function renderNetworkChips(): void {
    const chips = networkGroups.map((g) => `<button class="chip" type="button" data-group="${g.key}">${g.key}</button>`).join('');
    networkRow.innerHTML = chips + `<button class="chip" type="button" data-group="Otro">Otro</button>`;
    networkRow.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-group')!;
        const wasSelected = selectedGroupKey === key;
        selectedGroupKey = wasSelected ? null : key;
        networkRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', !wasSelected && b === btn));
        applyGroupSelection();
        recalcPreview();
      });
    });
    networkRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-group') === selectedGroupKey));
    renderSourceLine();
  }

  /** Trae los precios una sola vez por sesión de la app (se dispara al montar, en segundo plano) — evita pegarle a evuruguay.com en cada apertura del sheet. */
  let networkPricesPromise: Promise<void> | null = null;
  function ensureNetworkPrices(): Promise<void> {
    if (!networkPricesPromise) {
      networkPricesPromise = getNetworkPrices().then((result) => {
        networkGroups = groupNetworkRows(result.rows);
        networkSource = result.source;
        networkChangedAt = result.changedAt;
        networkPricesLoaded = true;
        renderNetworkChips();
      });
    }
    return networkPricesPromise;
  }
  void ensureNetworkPrices();

  /** Reconstruye selectedGroupKey/selectedVariant a partir de la red guardada en una carga o borrador — preserva la variante exacta (no la recalcula por la hora actual). */
  function restoreNetworkFromSaved(saved: string | null): void {
    if (!saved) {
      selectedGroupKey = null;
      selectedVariant = null;
      return;
    }
    for (const group of networkGroups) {
      const variant = group.variants.find((v) => v.empresa === saved);
      if (variant) {
        selectedGroupKey = group.key;
        selectedVariant = variant;
        return;
      }
    }
    selectedGroupKey = saved;
    selectedVariant = null;
  }

  suggestUseBtn.addEventListener('click', () => {
    if (!selectedVariant) return;
    priceInput.value = String(selectedVariant.precioKwh);
    if (selectedVariant.bajada > 0) {
      fixedFeeInput.value = String(selectedVariant.bajada);
      fixedFeeManualOpen = true;
    }
    syncFixedFeeVisibility();
    recalcPreview();
  });

  function showError(msg: string | null): void {
    if (!msg) {
      errorEl.classList.remove('show');
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function whenChoice(): WhenChoice {
    return whenSeg.querySelector('.sel')?.getAttribute('data-when') === 'tarde' ? 'tarde' : 'ahora';
  }

  function syncVisibility(): void {
    const isHome = origin() === 'home';
    const isProgramar = isHome && homeFlow === 'programar';

    homeFlowSeg.style.display = isHome ? 'flex' : 'none';
    programarBlock.style.display = isProgramar ? 'block' : 'none';
    backToProgramarLink.style.display = isHome && !isProgramar ? 'block' : 'none';
    empiezaField.style.display = isProgramar && whenChoice() === 'tarde' ? 'block' : 'none';

    // Modo rápido (kWh/%) y Público siguen igual que siempre — Programar reemplaza esa UI del todo para Casa.
    fieldsHome.style.display = isHome && !isProgramar ? 'block' : 'none';
    fieldsPublic.style.display = isHome ? 'none' : 'block';
    modeSeg.style.display = isProgramar ? 'none' : 'flex';

    const isPct = mode === 'pct';
    kwhBlockHome.style.display = isHome && !isProgramar && !isPct ? 'block' : 'none';
    pctBlockHome.style.display = isHome && !isProgramar && isPct ? 'block' : 'none';
    kwhBlockPublic.style.display = !isHome && !isPct ? 'block' : 'none';
    pctBlockPublic.style.display = !isHome && isPct ? 'block' : 'none';
    costPreviewEl.style.display = isProgramar ? 'none' : 'block';
    syncSaveButtonLabel();
  }

  /** El botón principal cambia de texto según el flujo — Programar/Ahora, Programar/Más tarde, o el guardar de siempre (modo rápido/público/edición). */
  function syncSaveButtonLabel(): void {
    if (editingId != null) {
      saveBtn.textContent = 'Guardar cambios';
      return;
    }
    if (origin() === 'home' && homeFlow === 'programar') {
      saveBtn.textContent = whenChoice() === 'ahora' ? 'Empezar carga programada' : 'Programar carga';
      return;
    }
    saveBtn.textContent = 'Guardar carga';
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
        const fixedFee = getFixedFee();
        const total = computePublicChargeCost(price, kwh, fixedFee);
        amountEl.textContent = '$' + Math.round(total).toLocaleString('es-UY');
        const parts: string[] = [];
        if (fixedFee > 0) parts.push(`<span class="badge badge-neutral">$${fixedFee.toFixed(0)} cargo fijo</span>`);
        parts.push(`<span class="badge badge-neutral">${kwh.toFixed(1)} kWh × $${price.toFixed(2)}/kWh</span>`);
        breakdownEl.innerHTML = parts.join('');
      }
    } catch {
      amountEl.textContent = '$0';
      breakdownEl.innerHTML = '';
    }
  }

  /** Recalcula el estimado en vivo del flujo Programar — física real (V×A×η) calibrada con el historial de Casa, nunca redondeada acá (solo al mostrar). */
  function recalcProgramarEstimate(): void {
    const startPctVal = parseFloat(bateriaInicialInput.value);
    if (!batteryKwh || !cortaAInput.value || !isFinite(startPctVal)) {
      estimateLabelEl.textContent = 'Estimado';
      estimateValueEl.textContent = '—';
      estimateSubEl.textContent = '';
      return;
    }
    const now = new Date();
    const tarde = whenChoice() === 'tarde';
    if (tarde && !empiezaInput.value) {
      estimateLabelEl.textContent = 'Estimado';
      estimateValueEl.textContent = '—';
      estimateSubEl.textContent = 'Falta la hora de inicio.';
      return;
    }
    const start = tarde ? resolveFutureOrNowTime(empiezaInput.value, now) : now;
    const stop = resolveStopTime(cortaAInput.value, start);
    const nominalKw = chargerKw(homeChargerAmps, homeChargerVolts);
    const { pct, kwhDelivered } = estimateAtTime(startPctVal, start, stop, nominalKw, batteryKwh, calibrationFactor);
    estimateLabelEl.textContent = `Estimado para las ${cortaAInput.value}`;
    estimateValueEl.textContent = `≈ ${Math.round(pct)}% · ${kwhDelivered.toFixed(1)} kWh`;
    estimateSubEl.textContent = tarde
      ? `No empieza a contar todavía — arranca a las ${empiezaInput.value}`
      : calibrationSampleCount > 0
        ? `Calibrado con ${calibrationSampleCount} carga${calibrationSampleCount === 1 ? '' : 's'} previa${calibrationSampleCount === 1 ? '' : 's'} en Casa`
        : 'Empieza a contar ahora mismo';
  }

  function resetForm(): void {
    editingId = null;
    titleEl.textContent = 'Nueva carga';
    saveBtn.textContent = 'Guardar carga';
    deleteBtn.style.display = 'none';
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-origin') === 'home'));
    startInput.value = '22:00';
    endInput.value = '06:00';
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
    homeFlow = 'programar';
    homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-flow') === 'programar'));
    whenSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-when') === 'ahora'));
    empiezaInput.value = '00:00';
    bateriaInicialInput.value = '';
    cortaAInput.value = '07:00';
    selectedGroupKey = null;
    selectedVariant = null;
    fixedFeeManualOpen = false;
    fixedFeeInput.value = '';
    networkRow.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
    variantRow.style.display = 'none';
    variantRow.innerHTML = '';
    suggestBox.style.display = 'none';
    syncFixedFeeVisibility();
    showError(null);
    amountEl.textContent = '$0';
    breakdownEl.innerHTML = '';
    syncVisibility();
    recalcProgramarEstimate();
  }

  async function loadContext(): Promise<void> {
    try {
      const [settings, vehicle, homeCharges] = await Promise.all([getSettings(), getVehicle(), listCharges(200)]);
      rates = { valle: settings.tariffValle, llano: settings.tariffLlano, punta: settings.tariffPunta };
      puntaStartHour = settings.puntaStartHour;
      batteryKwh = vehicle?.batteryKwh ?? null;
      homeChargerAmps = settings.homeChargerAmps;
      homeChargerVolts = settings.homeChargerVolts;
      const nominalKw = chargerKw(homeChargerAmps, homeChargerVolts);
      powerRefEl.textContent = homeChargerAmps > 0 && homeChargerVolts > 0
        ? `${homeChargerAmps}A · ${homeChargerVolts}V · ≈${nominalKw.toFixed(1)} kW`
        : 'Configurá tu cargador en Ajustes';
      if (batteryKwh) {
        const calib = computeCalibrationFactor(
          homeCharges.filter((c) => c.location === 'home'),
          nominalKw,
          batteryKwh,
        );
        calibrationFactor = calib.factor;
        calibrationSampleCount = calib.sampleCount;
      }
      recalcProgramarEstimate();
      modePctBtn.disabled = !batteryKwh;
      noVehicleNote.style.display = batteryKwh ? 'none' : 'block';
    } catch (err) {
      showError('No se pudieron cargar las tarifas: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function open(): Promise<void> {
    resetForm();
    overlay.classList.add('open');
    await Promise.all([loadContext(), ensureNetworkPrices()]);
  }

  async function openEdit(charge: Charge): Promise<void> {
    resetForm();
    editingId = charge.id;
    titleEl.textContent = 'Editar carga';
    saveBtn.textContent = 'Guardar cambios';
    deleteBtn.style.display = 'block';

    const isHome = charge.location === 'home';
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-origin') === charge.location));
    // Editar una carga ya guardada siempre usa el editor kWh/% de siempre — Programar es solo para crear una nueva.
    homeFlow = 'rapido';
    homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-flow') === 'rapido'));

    if (isHome && charge.startAt && charge.endAt) {
      startInput.value = isoToTimeInput(charge.startAt);
      endInput.value = isoToTimeInput(charge.endAt);
      odoHomeInput.value = charge.odometerKm != null ? String(charge.odometerKm) : '';
      // Si la carga tiene % guardado, reabrir en modo "por % de batería" — si no, se pierde
      // ese dato al guardar (handleSave solo persiste startPct/endPct cuando mode === 'pct').
      if (charge.startPct != null && charge.endPct != null) {
        mode = 'pct';
        modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-mode') === 'pct'));
        pctFromHome.value = String(charge.startPct);
        pctToHome.value = String(charge.endPct);
      } else {
        kwhHomeInput.value = String(charge.kwh);
      }
    } else {
      priceInput.value = charge.pricePerKwh != null ? String(charge.pricePerKwh) : '';
      kwhPublicInput.value = String(charge.kwh);
      odoPublicInput.value = charge.odometerKm != null ? String(charge.odometerKm) : '';
      await ensureNetworkPrices();
      restoreNetworkFromSaved(charge.network);
      renderNetworkChips();
      applyGroupSelection(selectedVariant);
      fixedFeeInput.value = charge.fixedFee != null ? String(charge.fixedFee) : '';
      fixedFeeManualOpen = (selectedVariant?.bajada ?? 0) <= 0 && !!charge.fixedFee && charge.fixedFee > 0;
      syncFixedFeeVisibility();
    }

    syncVisibility();
    overlay.classList.add('open');
    await loadContext();
    recalcPreview();
  }

  function close(): void {
    overlay.classList.remove('open');
  }

/** Hay carga en curso con solo el "desde %" cargado (sin saber todavía con cuánto termina) — no exigir el rango completo para guardar el borrador, ver currentDraftSnapshot(). */
  function hasAnyMeaningfulInput(): boolean {
    // Programar no genera borrador: su estado real y recuperable es la fila active_charge (recién
    // se escribe al guardar), no un formulario a medio llenar — abandonarlo sin guardar no deja rastro.
    if (origin() === 'home' && homeFlow === 'programar') return false;
    if (origin() === 'home') {
      return !!(kwhHomeInput.value || pctFromHome.value || pctToHome.value || odoHomeInput.value);
    }
    return !!(priceInput.value || kwhPublicInput.value || pctFromPublic.value || pctToPublic.value || odoPublicInput.value || selectedGroupKey);
  }

  /** Línea 2 del borrador — se degrada con gracia cuando todavía no hay como calcular un costo (ej. solo el "desde %" cargado, típico al dejar cargando de noche sin saber con cuánto va a terminar). */
  function buildDraftLine2(o: 'home' | 'public', kwh: number): string {
    if (kwh > 0) return `${kwh.toFixed(1)} kWh · ${amountEl.textContent} estimado`;
    if (mode === 'pct') {
      const from = (o === 'home' ? pctFromHome : pctFromPublic).value;
      const to = (o === 'home' ? pctToHome : pctToPublic).value;
      if (from && to) return `${from}% → ${to}% · rango inválido`;
      if (from) return `Desde ${from}% · falta el % final`;
      if (to) return `Hasta ${to}% · falta el % inicial`;
      return 'Sin % ingresado todavía';
    }
    if (o === 'public' && selectedGroupKey && !priceInput.value) return `Red ${selectedGroupKey} elegida · falta precio y kWh`;
    return 'kWh sin ingresar todavía';
  }

  /** Snapshot del formulario en curso, o null si no hay absolutamente nada escrito todavía. */
  function currentDraftSnapshot(): ChargeDraft | null {
    if (!hasAnyMeaningfulInput()) return null;
    const kwh = getKwh();
    const o = origin();
    return {
      savedAt: Date.now(),
      origin: o,
      mode,
      fields: {
        start: startInput.value,
        end: endInput.value,
        kwhHome: kwhHomeInput.value,
        pctFromHome: pctFromHome.value,
        pctToHome: pctToHome.value,
        odoHome: odoHomeInput.value,
        price: priceInput.value,
        kwhPublic: kwhPublicInput.value,
        pctFromPublic: pctFromPublic.value,
        pctToPublic: pctToPublic.value,
        odoPublic: odoPublicInput.value,
        network: currentNetworkValue() ?? '',
        fixedFee: isFixedFeeVisible() ? fixedFeeInput.value : '',
      },
      line1: o === 'home' ? `Casa · ${startInput.value}–${endInput.value}` : 'Público o trabajo',
      line2: buildDraftLine2(o, kwh),
    };
  }

  /** Autoguardado: solo para cargas nuevas (no ediciones) — se dispara al tocar afuera del sheet o al minimizar la app. */
  function persistDraftIfPossible(): void {
    if (editingId != null) return;
    const snapshot = currentDraftSnapshot();
    if (!snapshot) return;
    saveDraft(snapshot);
    notifyDraftUpdated();
  }

  function discardDraft(): void {
    clearDraft();
    notifyDraftUpdated();
  }

  async function openDraft(draft: ChargeDraft): Promise<void> {
    resetForm();
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-origin') === draft.origin));
    // Los borradores solo existen para el editor kWh/% de siempre — Programar no genera borradores (ver hasAnyMeaningfulInput).
    homeFlow = 'rapido';
    homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-flow') === 'rapido'));
    mode = draft.mode;
    modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-mode') === draft.mode));
    startInput.value = draft.fields.start ?? startInput.value;
    endInput.value = draft.fields.end ?? endInput.value;
    kwhHomeInput.value = draft.fields.kwhHome ?? '';
    pctFromHome.value = draft.fields.pctFromHome ?? '';
    pctToHome.value = draft.fields.pctToHome ?? '';
    odoHomeInput.value = draft.fields.odoHome ?? '';
    priceInput.value = draft.fields.price ?? '';
    kwhPublicInput.value = draft.fields.kwhPublic ?? '';
    pctFromPublic.value = draft.fields.pctFromPublic ?? '';
    pctToPublic.value = draft.fields.pctToPublic ?? '';
    odoPublicInput.value = draft.fields.odoPublic ?? '';
    await ensureNetworkPrices();
    restoreNetworkFromSaved(draft.fields.network || null);
    renderNetworkChips();
    applyGroupSelection(selectedVariant);
    fixedFeeInput.value = draft.fields.fixedFee ?? '';
    fixedFeeManualOpen = (selectedVariant?.bajada ?? 0) <= 0 && !!draft.fields.fixedFee;
    syncFixedFeeVisibility();
    syncVisibility();
    overlay.classList.add('open');
    await loadContext();
    recalcPreview();
  }

  fab.addEventListener('click', () => void open());
  cancelBtn.addEventListener('click', () => {
    if (editingId == null) discardDraft();
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    persistDraftIfPossible();
    close();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && overlay.classList.contains('open')) persistDraftIfPossible();
  });
  window.addEventListener('pagehide', () => {
    if (overlay.classList.contains('open')) persistDraftIfPossible();
  });
  bus.addEventListener(OPEN_EDIT_CHARGE, (e) => void openEdit((e as CustomEvent<Charge>).detail));
  bus.addEventListener(RESUME_DRAFT, (e) => void openDraft((e as CustomEvent<ChargeDraft>).detail));

  deleteBtn.addEventListener('click', () => {
    void (async () => {
      if (editingId == null) return;
      if (!confirm('¿Eliminar esta carga? No se puede deshacer.')) return;
      await deleteCharge(editingId);
      close();
      notifyChargesUpdated();
      toastText.textContent = 'Carga eliminada';
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    })();
  });

  seg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      syncVisibility();
      recalcPreview();
      recalcProgramarEstimate();
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

  homeFlowSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      homeFlow = btn.getAttribute('data-flow') === 'rapido' ? 'rapido' : 'programar';
      syncVisibility();
      recalcPreview();
      recalcProgramarEstimate();
    });
  });
  escapeLink.addEventListener('click', () => {
    homeFlow = 'rapido';
    homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-flow') === 'rapido'));
    syncVisibility();
    recalcPreview();
  });
  backToProgramarLink.addEventListener('click', () => {
    homeFlow = 'programar';
    homeFlowSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-flow') === 'programar'));
    syncVisibility();
    recalcProgramarEstimate();
  });
  whenSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      whenSeg.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      syncVisibility();
      recalcProgramarEstimate();
    });
  });

  fixedFeeToggle.addEventListener('click', () => {
    fixedFeeManualOpen = true;
    syncFixedFeeVisibility();
    recalcPreview();
  });

  [
    startInput, endInput, kwhHomeInput, priceInput, kwhPublicInput,
    pctFromHome, pctToHome, pctFromPublic, pctToPublic, fixedFeeInput,
  ].forEach((el) => el.addEventListener('input', recalcPreview));

  [empiezaInput, bateriaInicialInput, cortaAInput].forEach((el) => el.addEventListener('input', recalcProgramarEstimate));

  saveBtn.addEventListener('click', () => {
    if (origin() === 'home' && homeFlow === 'programar' && editingId == null) void handleSaveProgramar();
    else void handleSave();
  });

  async function handleSaveProgramar(): Promise<void> {
    const startPctVal = parseFloat(bateriaInicialInput.value);
    if (!isFinite(startPctVal) || startPctVal < 0 || startPctVal > 100) {
      showError('Ingresá la batería al iniciar (0–100%).');
      return;
    }
    if (!cortaAInput.value) {
      showError('Ingresá a qué hora corta.');
      return;
    }
    const tarde = whenChoice() === 'tarde';
    if (tarde && !empiezaInput.value) {
      showError('Ingresá a qué hora empieza.');
      return;
    }
    const now = new Date();
    const start = tarde ? resolveFutureOrNowTime(empiezaInput.value, now) : now;
    const stop = resolveStopTime(cortaAInput.value, start);
    if (stop.getTime() <= start.getTime()) {
      showError('La hora de corte tiene que ser posterior al inicio.');
      return;
    }
    showError(null);
    saveBtn.disabled = true;
    try {
      await upsertActiveCharge({
        mode: tarde ? 'scheduled' : 'live',
        startAt: start.toISOString(),
        targetStopAt: stop.toISOString(),
        startPct: startPctVal,
      });
      notifyActiveChargeUpdated();
      void scheduleActiveChargeNotifications(start, stop, cortaAInput.value);
      close();
      toastText.textContent = tarde ? 'Carga programada guardada' : 'Carga programada — empezó a contar';
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      saveBtn.disabled = false;
    }
  }

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
      let input: NewCharge;
      if (origin() === 'home') {
        const { start, end } = resolveChargeWindow(startInput.value, endInput.value, new Date());
        const odo = odoHomeInput.value ? parseFloat(odoHomeInput.value) : null;
        // "Por % de batería" ya pide Desde/Hasta — guardarlos también en startPct/endPct para
        // que la fila del historial dibuje la barra de rango, no solo cuando se usa Programar.
        const startPctVal = mode === 'pct' ? parseFloat(pctFromHome.value) : NaN;
        const endPctVal = mode === 'pct' ? parseFloat(pctToHome.value) : NaN;
        input = {
          location: 'home',
          startAt: start,
          endAt: end,
          kwh,
          odometerKm: odo,
          startPct: isFinite(startPctVal) ? startPctVal : null,
          endPct: isFinite(endPctVal) ? endPctVal : null,
        };
      } else {
        const price = parseFloat(priceInput.value);
        if (!price || price <= 0) throw new Error('Ingresá el precio por kWh.');
        const odo = odoPublicInput.value ? parseFloat(odoPublicInput.value) : null;
        const fixedFee = getFixedFee();
        input = { location: 'public', kwh, pricePerKwh: price, odometerKm: odo, fixedFee: fixedFee > 0 ? fixedFee : null, network: currentNetworkValue() };
      }
      const isNew = editingId == null;
      const charge = editingId == null ? await insertCharge(input) : await updateCharge(editingId, input);
      if (isNew) discardDraft();
      toastText.textContent = (isNew ? 'Carga registrada — $' : 'Carga actualizada — $') + Math.round(charge.cost).toLocaleString('es-UY');
      close();
      notifyChargesUpdated();
      toast.classList.add('show');
      if (isNew) fireSpark();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      saveBtn.disabled = false;
    }
  }
}
