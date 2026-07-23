import type { Screen } from './types';
import {
  getStatsSince, getMonthlyTotals, getDailyTotalsThisMonth, listCharges, getVehicle, getRealConsumption,
  getActiveCharge, deleteActiveCharge, insertCharge, getSettings,
} from '../lib/db/api';
import type { ActiveCharge } from '../lib/db/active-charge';
import {
  bus, CHARGES_UPDATED, DRAFT_UPDATED, ACTIVE_CHARGE_UPDATED,
  requestResumeDraft, requestOpenModoRapido, requestOpenProgramar, notifyDraftUpdated, notifyChargesUpdated, notifyActiveChargeUpdated,
} from '../lib/bus';
import { renderOdometer } from '../lib/odometer';
import { loadDraft, clearDraft, timeAgoLabel } from '../lib/draft';
import { estimatedAutonomyKm } from '../lib/consumption';
import { chargerKw, estimateAtTime } from '../lib/estimation';
import { cancelActiveChargeNotifications } from '../lib/notifications';
import { syncChargeLiveActivity, endChargeLiveActivity } from '../lib/live-activity';
import { getAccentHexForDarkChrome } from '../lib/personalizacion';

function isoToTimeLabel(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

function bandColor(pct: number): string {
  if (pct < 20) return 'var(--critical)';
  if (pct < 80) return 'var(--warning-fill)';
  return 'var(--good)';
}

/** Línea de corriente circulando ("bobina") para la tarjeta de carga en curso — wireframe aprobado en design-lab/animacion-carga-en-casa.html. */
function coilSvg(): string {
  const d = 'M4,11 Q 14,2 24,11 T 44,11 T 64,11 T 84,11 T 104,11 T 124,11 T 144,11 T 164,11 T 184,11 T 204,11 T 224,11 T 244,11';
  return `<svg class="coil-svg" viewBox="0 0 260 22" preserveAspectRatio="none">
    <path class="coil-base" d="${d}"/>
    <path class="coil-pulse" d="${d}"/>
  </svg>`;
}

/** Overlay de faros + haz — calibrado a mano sobre el render real del modelo a -18°, siempre
 * prendido mientras la app está abierta (independiente de si hay carga en curso). */
function idleOverlaySvg(): string {
  return `
    <div class="glow" style="width:8px;height:6px;left:70.4%;top:52%;"></div>
    <div class="glow" style="width:8px;height:6px;left:42.1%;top:53%;"></div>
    <svg class="hero-overlay-svg beam-layer" viewBox="0 0 240 200" preserveAspectRatio="none">
      <defs>
        <radialGradient id="heroGR1" cx="173" cy="107" r="45" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="22%" stop-color="#fff" stop-opacity="0.38"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <radialGradient id="heroGL1" cx="105" cy="109" r="45" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="22%" stop-color="#fff" stop-opacity="0.38"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <g>
        <polygon points="173,107 190.7,140.5 183.3,143.5" fill="url(#heroGR1)"/><circle class="hot-core" cx="173" cy="107" r="1.6"/>
        <polygon points="105,109 122.7,142.5 115.3,145.5" fill="url(#heroGL1)"/><circle class="hot-core" cx="105" cy="109" r="1.6"/>
      </g>
    </svg>`;
}

/** Overlay del cable de carga estilo Tesla (línea + punto, sin ficha física) — calibrado sobre el render real del modelo a -100°, conector arriba de la rueda delantera. */
function chargingOverlaySvg(): string {
  return `
    <svg class="hero-overlay-svg" viewBox="0 0 240 200" preserveAspectRatio="none">
      <path d="M -10,128 C 15,132 35,124 55,127 C 75,130 92,123 108,125 C 122,127 132,116 140,106 C 145,101 156,96 164,100"
            stroke="#21c05e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <circle class="port-pulse-ring" cx="164" cy="100" r="3"/>
      <circle cx="164" cy="100" r="2.4" fill="#21c05e" opacity="0.95"/>
    </svg>`;
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-UY');
}

export const inicioScreen: Screen = {
  id: 'inicio',
  render() {
    return `
      <div class="aurora-bg" aria-hidden="true"></div>
      <div class="sparkle-bg" id="sparkleBg" aria-hidden="true"></div>
      <div style="position:relative;z-index:1;">
        <div class="nav-title">Inicio</div>
        <div id="draftCard"></div>
        <div class="hero-hub">
          <div class="hero-status-line" id="heroStatusLine">Sin carga activa</div>
          <div class="hero-stage" id="stageIdle">
            <model-viewer src="car.glb" camera-orbit="-18deg 78deg auto" field-of-view="30deg" exposure="1.1" shadow-intensity="0.8" disable-zoom interaction-prompt="none"></model-viewer>
            ${idleOverlaySvg()}
          </div>
          <div class="hero-stage" id="stageCharging" style="display:none;">
            <model-viewer src="car.glb" camera-orbit="-100deg 78deg auto" field-of-view="30deg" exposure="1.1" shadow-intensity="0.8" disable-zoom interaction-prompt="none"></model-viewer>
            ${chargingOverlaySvg()}
          </div>
          <div class="hero-actions-2col" id="heroActions">
            <button class="hero-btn" id="heroChargeNow">Cargar ahora</button>
            <button class="hero-btn secondary" id="heroChargeScheduled">Carga programada</button>
          </div>
        </div>
        <div class="mini-stat">
          <div class="stat-top">
            <div><div class="label">Gasto este mes</div><div class="big-number" id="homeSpend">—</div></div>
            <span class="stat-delta" id="homeDelta" style="display:none;"></span>
          </div>
          <svg class="stat-spark" viewBox="0 0 240 32" preserveAspectRatio="none" id="homeSpark"></svg>
          <div class="stat-meta" id="homeLastCharge">—</div>
        </div>
      </div>
    `;
  },
  async mount(root) {
    const draftCardEl = root.querySelector<HTMLElement>('#draftCard')!;
    const heroStatusLine = root.querySelector<HTMLElement>('#heroStatusLine')!;
    const stageIdle = root.querySelector<HTMLElement>('#stageIdle')!;
    const stageCharging = root.querySelector<HTMLElement>('#stageCharging')!;
    const heroActions = root.querySelector<HTMLElement>('#heroActions')!;
    const spendEl = root.querySelector<HTMLElement>('#homeSpend')!;
    const deltaEl = root.querySelector<HTMLElement>('#homeDelta')!;
    const sparkEl = root.querySelector<SVGSVGElement>('#homeSpark')!;
    const lastChargeEl = root.querySelector<HTMLElement>('#homeLastCharge')!;
    const sparkleBg = root.querySelector<HTMLElement>('#sparkleBg')!;

    for (let i = 0; i < 10; i++) {
      const dot = document.createElement('span');
      dot.className = 'spark-dot';
      dot.style.left = Math.random() * 100 + '%';
      dot.style.top = Math.random() * 100 + '%';
      dot.style.animationDelay = Math.random() * 2.6 + 's';
      sparkleBg.appendChild(dot);
    }

    root.querySelector<HTMLButtonElement>('#heroChargeNow')!.addEventListener('click', () => requestOpenModoRapido());
    root.querySelector<HTMLButtonElement>('#heroChargeScheduled')!.addEventListener('click', () => requestOpenProgramar());

    /** Autonomía en texto para el estado sin carga activa — recalculada en refresh(), leída acá cuando corresponde. */
    let idleAutonomyHtml = 'Sin carga activa';

    /** Sincroniza el hero (3D + status line + botones) con el estado real de la tarjeta de arriba. */
    function setHeroMode(mode: 'idle' | 'waiting' | 'charging' | 'confirm', statusHtml: string): void {
      const charging = mode === 'charging';
      stageIdle.style.display = charging ? 'none' : 'block';
      stageCharging.style.display = charging ? 'block' : 'none';
      heroActions.style.display = mode === 'idle' ? 'flex' : 'none';
      heroStatusLine.innerHTML = statusHtml;
      heroStatusLine.classList.toggle('live', charging);
    }

    function renderSpark(daily: number[]): void {
      const w = 240;
      const h = 32;
      const pad = 2;
      const max = Math.max(1, ...daily);
      const stepX = daily.length > 1 ? w / (daily.length - 1) : w;
      const pts: [number, number][] = daily.map((v, i) => [i * stepX, h - pad - (v / max) * (h - pad * 2)]);
      const lineD = 'M ' + pts.map((p) => p.join(',')).join(' L ');
      const areaD = lineD + ` L ${w},${h} L 0,${h} Z`;
      const last = pts[pts.length - 1];
      sparkEl.innerHTML = `
        <defs><linearGradient id="homeSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.32"/>
          <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>
        </linearGradient></defs>
        <path d="${areaD}" fill="url(#homeSparkGrad)"/>
        <path d="${lineD}" fill="none" style="stroke:var(--accent)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
        ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="2.2" style="fill:var(--accent)"/>` : ''}
      `;
    }

    async function refresh() {
      try {
        const [stats, monthly2, daily, lastCharges, vehicle, realConsumption] = await Promise.all([
          getStatsSince(startOfMonthIso()),
          getMonthlyTotals(2),
          getDailyTotalsThisMonth(),
          listCharges(1),
          getVehicle(),
          getRealConsumption(),
        ]);

        renderOdometer(spendEl, fmtMoney(stats.totalCost));

        const prevTotal = monthly2[0]?.total ?? 0;
        const thisTotal = monthly2[1]?.total ?? 0;
        if (prevTotal > 0) {
          const deltaPct = ((thisTotal - prevTotal) / prevTotal) * 100;
          deltaEl.style.display = '';
          deltaEl.classList.toggle('up', deltaPct >= 0);
          deltaEl.classList.toggle('down', deltaPct < 0);
          deltaEl.textContent = (deltaPct >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(deltaPct)) + '%';
        } else {
          deltaEl.style.display = 'none';
        }

        renderSpark(daily);

        const lastCharge = lastCharges[0];
        lastChargeEl.textContent = lastCharge
          ? 'Última carga: ' + timeAgoLabel(new Date(lastCharge.startAt ?? lastCharge.createdAt).getTime())
          : 'Sin cargas todavía';

        idleAutonomyHtml = vehicle
          ? `Sin carga activa · <b>≈${estimatedAutonomyKm(vehicle, realConsumption)} km</b> de autonomía`
          : 'Sin carga activa';
      } catch (err) {
        console.error('No se pudo inicializar la base de datos local:', err);
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        spendEl.textContent = '—';
        lastChargeEl.textContent = `Error de base de datos — ${detail}`;
        lastChargeEl.style.color = 'var(--critical)';
      }
    }

    function renderDraftCard() {
      const draft = loadDraft();
      setHeroMode('idle', idleAutonomyHtml);
      if (!draft) {
        draftCardEl.innerHTML = '';
        return;
      }
      draftCardEl.innerHTML = `
        <div class="draft-card">
          <div class="tag">Borrador sin guardar · ${timeAgoLabel(draft.savedAt)}</div>
          <div class="row1">
            <span class="ic"><svg><use href="#i-bolt"/></svg></span>
            <span class="meta"><div class="m1">${draft.line1}</div><div class="m2">${draft.line2}</div></span>
          </div>
          <div class="btnrow">
            <button class="go" id="draftResume">Continuar</button>
            <button class="del" id="draftDiscard">Eliminar</button>
          </div>
        </div>`;
      draftCardEl.querySelector<HTMLButtonElement>('#draftResume')!.addEventListener('click', () => requestResumeDraft(draft));
      draftCardEl.querySelector<HTMLButtonElement>('#draftDiscard')!.addEventListener('click', () => {
        clearDraft();
        notifyDraftUpdated();
      });
    }

    let activeCardTimer: ReturnType<typeof setInterval> | undefined;
    // Las Live Activities están pensadas para actualizarse cada tanto, no en cada tick del
    // intervalo de 1s de la tarjeta — Apple recomienda no más de ~1 actualización por minuto.
    let lastLiveActivitySyncAt = 0;
    // Sin Mac no hay forma de ver la consola del WKWebView en el dispositivo real — el error
    // (si lo hay) se guarda acá para mostrarlo en la propia tarjeta, no solo en console.error.
    let lastLiveActivityError: string | null = null;

    /** Al terminar la ventana programada (o al tocar "Terminar ahora"), congela el estimado a `atTime` y pide confirmar el real — se guarda recién acá (insertCharge), no antes. */
    async function renderConfirmCard(ac: ActiveCharge, atTime: Date): Promise<void> {
      clearInterval(activeCardTimer);
      const [vehicle, settings] = await Promise.all([getVehicle(), getSettings()]);
      const start = new Date(ac.startAt);
      let estPct = ac.startPct;
      let estKwh = 0;
      if (vehicle?.batteryKwh) {
        const nominalKw = chargerKw(settings.homeChargerAmps, settings.homeChargerVolts);
        const est = estimateAtTime(ac.startPct, start, atTime, nominalKw, vehicle.batteryKwh, 1);
        estPct = est.pct;
        estKwh = est.kwhDelivered;
      }
      setHeroMode('confirm', 'Carga finalizada · <b>confirmá los datos</b>');
      draftCardEl.innerHTML = `
        <div class="draft-card">
          <div class="tag">Confirmá tu carga</div>
          <div class="row1">
            <span class="ic"><svg><use href="#i-bolt"/></svg></span>
            <span class="meta"><div class="m1">Casa · terminó</div><div class="m2">Estimado ≈${Math.round(estPct)}% · ${estKwh.toFixed(1)} kWh</div></span>
          </div>
          <div class="field" style="margin-top:8px;"><label>% final real</label><div class="input"><input type="number" step="0.1" min="0" max="100" id="confirmPct" value="${estPct.toFixed(1)}"><span class="unit">%</span></div></div>
          <div class="field"><label>kWh reales</label><div class="input"><input type="number" step="0.1" min="0" id="confirmKwh" value="${estKwh.toFixed(1)}"><span class="unit">kWh</span></div></div>
          <div class="field"><label>Odómetro (opcional)</label><div class="input"><input type="number" step="1" min="0" id="confirmOdo" placeholder="km"><span class="unit">km</span></div></div>
          <div class="form-error" id="confirmError"></div>
          <div class="btnrow">
            <button class="go" id="confirmSave">Guardar carga</button>
            <button class="del" id="confirmDiscard">Descartar</button>
          </div>
        </div>`;
      const confirmErrorEl = draftCardEl.querySelector<HTMLElement>('#confirmError')!;
      const confirmPctInput = draftCardEl.querySelector<HTMLInputElement>('#confirmPct')!;
      const confirmKwhInput = draftCardEl.querySelector<HTMLInputElement>('#confirmKwh')!;
      // Una vez que se sabe el % final REAL, el delta de batería (start% → final%) es más
      // confiable que la estimación física previa — se recalcula solo, pero sigue editable a
      // mano por si el dato no coincide (medición real distinta, etc.).
      if (vehicle?.batteryKwh) {
        const batteryKwh = vehicle.batteryKwh;
        confirmPctInput.addEventListener('input', () => {
          const realPctVal = parseFloat(confirmPctInput.value);
          if (!isFinite(realPctVal)) return;
          const kwhFromDelta = Math.max(0, (realPctVal - ac.startPct) / 100 * batteryKwh);
          confirmKwhInput.value = kwhFromDelta.toFixed(1);
        });
      }
      draftCardEl.querySelector<HTMLButtonElement>('#confirmSave')!.addEventListener('click', () => {
        void (async () => {
          const realPct = parseFloat(draftCardEl.querySelector<HTMLInputElement>('#confirmPct')!.value);
          const realKwh = parseFloat(draftCardEl.querySelector<HTMLInputElement>('#confirmKwh')!.value);
          const odoRaw = draftCardEl.querySelector<HTMLInputElement>('#confirmOdo')!.value;
          const odometerKm = odoRaw ? parseFloat(odoRaw) : null;
          if (!isFinite(realPct) || realPct < 0 || realPct > 100) {
            confirmErrorEl.textContent = 'Ingresá un % final válido (0–100).';
            confirmErrorEl.classList.add('show');
            return;
          }
          if (!isFinite(realKwh) || realKwh <= 0) {
            confirmErrorEl.textContent = 'Los kWh reales tienen que ser mayores a cero.';
            confirmErrorEl.classList.add('show');
            return;
          }
          confirmErrorEl.classList.remove('show');
          try {
            await insertCharge({ location: 'home', startAt: start, endAt: atTime, kwh: realKwh, odometerKm, startPct: ac.startPct, endPct: realPct });
            await deleteActiveCharge();
            await cancelActiveChargeNotifications();
            await endChargeLiveActivity();
            notifyActiveChargeUpdated();
            notifyChargesUpdated();
          } catch (err) {
            confirmErrorEl.textContent = err instanceof Error ? err.message : String(err);
            confirmErrorEl.classList.add('show');
          }
        })();
      });
      draftCardEl.querySelector<HTMLButtonElement>('#confirmDiscard')!.addEventListener('click', () => {
        void (async () => {
          await deleteActiveCharge();
          await cancelActiveChargeNotifications();
          await endChargeLiveActivity();
          notifyActiveChargeUpdated();
        })();
      });
    }

    /** Máquina de estados sobre el mismo slot del borrador — en espera / cargando en vivo / a confirmar, derivada solo de `active_charge` + la hora actual, sin bandera extra que mantener sincronizada. */
    async function renderTopCard(): Promise<void> {
      clearInterval(activeCardTimer);
      const ac = await getActiveCharge();
      if (!ac) {
        renderDraftCard();
        return;
      }

      // TS no arrastra el narrowing de `ac` (ActiveCharge | null) hacia adentro de la función
      // anidada `paint` — se fija en una constante ya no-nula para el resto del closure.
      const activeCharge: ActiveCharge = ac;
      const [vehicle, settings] = await Promise.all([getVehicle(), getSettings()]);
      const batteryKwh = vehicle?.batteryKwh ?? null;
      const nominalKw = chargerKw(settings.homeChargerAmps, settings.homeChargerVolts);
      const start = new Date(activeCharge.startAt);
      const stop = new Date(activeCharge.targetStopAt);

      function paint(): void {
        const now = new Date();

        if (now < start) {
          const mins = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
          const countdown = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
          setHeroMode('waiting', `Carga programada · <b>arranca en ${countdown}</b>`);
          draftCardEl.innerHTML = `
            <div class="draft-card">
              <div class="tag">Carga programada · En espera</div>
              <div class="row1">
                <span class="ic"><svg><use href="#i-bolt"/></svg></span>
                <span class="meta"><div class="m1">Casa · ${isoToTimeLabel(activeCharge.startAt)} → ${isoToTimeLabel(activeCharge.targetStopAt)}</div><div class="m2">Batería al iniciar: ${activeCharge.startPct}%</div></span>
              </div>
              <div class="m2" style="margin-top:8px;color:var(--accent);font-weight:600;">Arranca en ${countdown}</div>
              <div class="btnrow"><button class="del" id="activeCancel">Cancelar carga programada</button></div>
            </div>`;
          draftCardEl.querySelector<HTMLButtonElement>('#activeCancel')!.addEventListener('click', () => {
            void (async () => {
              await deleteActiveCharge();
              await cancelActiveChargeNotifications();
              await endChargeLiveActivity();
              notifyActiveChargeUpdated();
            })();
          });
          return;
        }

        if (now < stop) {
          // Sin vehículo configurado no hay con qué estimar el % — eso no significa que la
          // carga ya terminó, solo que no podemos calcular el número (antes esto se confundía
          // y saltaba directo a "confirmar" apenas guardabas sin tener el auto configurado).
          const estimate = batteryKwh ? estimateAtTime(activeCharge.startPct, start, now, nominalKw, batteryKwh, 1) : null;
          setHeroMode(
            'charging',
            estimate
              ? `Cargando ahora · <b>≈${Math.round(estimate.pct)}%</b> · ${estimate.kwhDelivered.toFixed(1)} kWh · corta ${isoToTimeLabel(activeCharge.targetStopAt)}`
              : `Cargando ahora · corta ${isoToTimeLabel(activeCharge.targetStopAt)}`,
          );
          const estimateHtml = estimate
            ? `<div style="margin-top:8px;font-size:26px;font-weight:700;color:${bandColor(estimate.pct)};">${Math.round(estimate.pct)}%<span style="font-size:11px;color:var(--text-muted);font-weight:500;margin-left:6px;">estimado</span></div>
                  <div class="m2" style="margin-top:2px;">${estimate.kwhDelivered.toFixed(1)} kWh entregados</div>`
            : `<div class="m2" style="margin-top:8px;color:var(--text-muted);">Configurá tu vehículo en Ajustes para ver el % estimado.</div>`;
          const liveActivityWarnHtml = lastLiveActivityError
            ? `<div class="m2" style="margin-top:6px;color:var(--critical);">Live Activity: ${lastLiveActivityError}</div>`
            : '';
          draftCardEl.innerHTML = `
            <div class="draft-card">
              <div class="tag live">Cargando ahora<span class="live-dot"></span>En vivo</div>
              <div class="row1">
                <span class="ic"><svg><use href="#i-bolt"/></svg></span>
                <span class="meta"><div class="m1">Casa · corta a las ${isoToTimeLabel(activeCharge.targetStopAt)}</div></span>
              </div>
              ${coilSvg()}
              ${estimateHtml}
              ${liveActivityWarnHtml}
              <div class="btnrow"><button class="del" id="activeFinishNow">Terminar ahora</button></div>
            </div>`;
          draftCardEl.querySelector<HTMLButtonElement>('#activeFinishNow')!.addEventListener('click', () => {
            void renderConfirmCard(activeCharge, new Date());
          });
          if (estimate && batteryKwh && now.getTime() - lastLiveActivitySyncAt > 60000) {
            lastLiveActivitySyncAt = now.getTime();
            void syncChargeLiveActivity({
              startAt: start,
              startPct: activeCharge.startPct,
              targetStopAt: stop,
              networkLabel: `Casa · ${settings.homeChargerAmps}A · ${settings.homeChargerVolts}V`,
              accentColor: getAccentHexForDarkChrome(settings.personalizacion.hue),
              pct: estimate.pct,
              kwhDelivered: estimate.kwhDelivered,
              kwhTotal: batteryKwh,
            }).then((result) => {
              lastLiveActivityError = result.ok ? null : (result.error ?? 'error desconocido');
            });
          }
          return;
        }

        void renderConfirmCard(activeCharge, stop);
      }

      // El intervalo se arranca ANTES del primer paint(): si ese primer paint ya cae en la rama
      // de confirmación, renderConfirmCard hace clearInterval(activeCardTimer) — necesita que
      // la variable ya tenga el id asignado, si no el setInterval de acá abajo lo pisa y sigue
      // repintando la tarjeta de confirmación cada segundo, borrando lo que el usuario edite.
      activeCardTimer = setInterval(paint, 1000);
      paint();
    }

    bus.addEventListener(CHARGES_UPDATED, () => void refresh());
    bus.addEventListener(DRAFT_UPDATED, () => void renderTopCard());
    bus.addEventListener(ACTIVE_CHARGE_UPDATED, () => void renderTopCard());
    await refresh();
    void renderTopCard();
  },
};
