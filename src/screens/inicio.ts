import type { Screen } from './types';
import {
  getStatsSince, getMonthlyTotals, listCharges, getVehicle, getRealConsumption,
  getActiveCharge, deleteActiveCharge, insertCharge, getSettings,
} from '../lib/db/api';
import type { ActiveCharge } from '../lib/db/active-charge';
import {
  bus, CHARGES_UPDATED, DRAFT_UPDATED, ACTIVE_CHARGE_UPDATED,
  requestEditCharge, requestResumeDraft, notifyDraftUpdated, notifyChargesUpdated, notifyActiveChargeUpdated,
} from '../lib/bus';
import { chargeRowHtml } from '../components/charge-row';
import { renderOdometer } from '../lib/odometer';
import { loadDraft, clearDraft, timeAgoLabel } from '../lib/draft';
import { estimatedAutonomyKm } from '../lib/consumption';
import { chargerKw, estimateAtTime } from '../lib/estimation';
import { cancelActiveChargeNotifications } from '../lib/notifications';
import { syncChargeLiveActivity, endChargeLiveActivity } from '../lib/live-activity';

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
        <div class="split-card">
          <div class="half">
            <div class="label">Gasto este mes</div>
            <div class="big-number" id="homeSpend">—</div>
            <div class="sub" id="homeCount">Cargando…</div>
          </div>
          <div class="half accented">
            <div class="label">Autonomía</div>
            <div class="big-number" id="homeAutonomy">—</div>
            <div class="sub">estimada</div>
          </div>
        </div>
        <div class="tile-row">
          <div class="tile"><div class="label">$/kWh prom.</div><div class="value" id="tileAvgKwh">—</div></div>
          <div class="tile"><div class="label">% en Valle</div><div class="value" id="tileValle">—</div></div>
          <div class="tile"><div class="label">$/km</div><div class="value" id="tileKm">—</div></div>
        </div>
        <div class="chart-card">
          <div class="chead"><span class="t">Tendencia</span><span class="p">últimos 6 meses</span></div>
          <div class="bar-chart" id="homeChart"></div>
        </div>
        <div class="chart-card" id="compCard">
          <div class="chead"><span class="t">Franja horaria</span><span class="p">este mes</span></div>
          <div id="compBody"><p style="font-size:12.5px;color:var(--text-muted);margin:0;">Sin cargas en casa todavía.</p></div>
        </div>
        <div class="section-title">Últimas cargas <a href="#" id="homeSeeAll">Ver todas →</a></div>
        <div class="list-group" id="homeList"></div>
      </div>
    `;
  },
  async mount(root) {
    const draftCardEl = root.querySelector<HTMLElement>('#draftCard')!;
    const spendEl = root.querySelector<HTMLElement>('#homeSpend')!;
    const countEl = root.querySelector<HTMLElement>('#homeCount')!;
    const tileAvgKwh = root.querySelector<HTMLElement>('#tileAvgKwh')!;
    const tileValle = root.querySelector<HTMLElement>('#tileValle')!;
    const tileKm = root.querySelector<HTMLElement>('#tileKm')!;
    const autonomyEl = root.querySelector<HTMLElement>('#homeAutonomy')!;
    const chartEl = root.querySelector<HTMLElement>('#homeChart')!;
    const compBody = root.querySelector<HTMLElement>('#compBody')!;
    const listEl = root.querySelector<HTMLElement>('#homeList')!;
    const seeAll = root.querySelector<HTMLAnchorElement>('#homeSeeAll')!;
    const sparkleBg = root.querySelector<HTMLElement>('#sparkleBg')!;

    for (let i = 0; i < 10; i++) {
      const dot = document.createElement('span');
      dot.className = 'spark-dot';
      dot.style.left = Math.random() * 100 + '%';
      dot.style.top = Math.random() * 100 + '%';
      dot.style.animationDelay = Math.random() * 2.6 + 's';
      sparkleBg.appendChild(dot);
    }

    seeAll.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector<HTMLButtonElement>('.tab[data-tab="cargas"]')?.click();
    });

    chartEl.addEventListener('click', (e) => {
      const col = (e.target as HTMLElement).closest<HTMLElement>('.bar-col');
      if (!col) return;
      chartEl.querySelectorAll('.bar-col').forEach((c) => c.classList.remove('show'));
      col.classList.add('show');
    });

    let recentCharges: Awaited<ReturnType<typeof listCharges>> = [];
    listEl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row[data-id]');
      if (!row) return;
      const charge = recentCharges.find((c) => c.id === Number(row.dataset.id));
      if (charge) requestEditCharge(charge);
    });

    async function refresh() {
      try {
        const [stats, monthly, recent, vehicle, realConsumption] = await Promise.all([
          getStatsSince(startOfMonthIso()),
          getMonthlyTotals(6),
          listCharges(3),
          getVehicle(),
          getRealConsumption(),
        ]);

        renderOdometer(spendEl, fmtMoney(stats.totalCost));
        countEl.style.color = '';
        countEl.textContent =
          stats.count === 0
            ? 'Sin cargas todavía este mes'
            : `${stats.count} carga${stats.count === 1 ? '' : 's'} registrada${stats.count === 1 ? '' : 's'}`;

        tileAvgKwh.textContent = stats.avgCostPerKwh > 0 ? '$' + stats.avgCostPerKwh.toFixed(2) : '—';
        tileValle.textContent = stats.valleSharePct > 0 || stats.count > 0 ? Math.round(stats.valleSharePct) + '%' : '—';
        tileKm.textContent = stats.costPerKm != null ? '$' + stats.costPerKm.toFixed(2) : '—';
        autonomyEl.textContent = vehicle ? estimatedAutonomyKm(vehicle, realConsumption) + ' km' : '—';

        const maxTotal = Math.max(1, ...monthly.map((m) => m.total));
        chartEl.innerHTML = monthly
          .map((m) => {
            const isPeak = m.total === maxTotal && m.total > 0;
            const heightPct = Math.max(4, Math.round((m.total / maxTotal) * 100));
            return `<div class="bar-col" data-h="${heightPct}"><div class="bar${isPeak ? ' peak' : ''}"></div><span class="bar-tooltip">${fmtMoney(m.total)}</span><div class="m">${m.monthLabel}</div></div>`;
          })
          .join('');
        requestAnimationFrame(() => {
          chartEl.querySelectorAll<HTMLElement>('.bar-col').forEach((col) => {
            col.querySelector<HTMLElement>('.bar')!.style.height = col.dataset.h + '%';
          });
        });

        const homeShareTotal = stats.valleSharePct + stats.llanoSharePct + stats.puntaSharePct;
        if (homeShareTotal > 0) {
          compBody.innerHTML = `
            <div class="comp-bar">
              <span data-w="${stats.valleSharePct}" style="background:var(--good)"></span>
              <span data-w="${stats.llanoSharePct}" style="background:var(--warning-fill)"></span>
              <span data-w="${stats.puntaSharePct}" style="background:var(--critical)"></span>
            </div>
            <div class="comp-legend">
              <div class="li"><span class="dot" style="background:var(--good)"></span>Valle <b>${Math.round(stats.valleSharePct)}%</b></div>
              <div class="li"><span class="dot" style="background:var(--warning-fill)"></span>Llano <b>${Math.round(stats.llanoSharePct)}%</b></div>
              <div class="li"><span class="dot" style="background:var(--critical)"></span>Punta <b>${Math.round(stats.puntaSharePct)}%</b></div>
            </div>`;
          requestAnimationFrame(() => {
            compBody.querySelectorAll<HTMLElement>('.comp-bar span').forEach((s) => {
              s.style.width = s.dataset.w + '%';
            });
          });
        } else {
          compBody.innerHTML = '<p style="font-size:12.5px;color:var(--text-muted);margin:0;">Sin cargas en casa todavía.</p>';
        }

        recentCharges = recent;
        listEl.innerHTML = recent.length
          ? recent.map((c) => chargeRowHtml(c)).join('')
          : '<div class="list-empty">Sin cargas todavía.</div>';
      } catch (err) {
        console.error('No se pudo inicializar la base de datos local:', err);
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        spendEl.textContent = '—';
        countEl.textContent = `Error de base de datos — ${detail}`;
        countEl.style.color = 'var(--critical)';
      }
    }

    function renderDraftCard() {
      const draft = loadDraft();
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
      draftCardEl.innerHTML = `
        <div class="draft-card">
          <div class="tag">Confirmá tu carga</div>
          <div class="row1">
            <span class="ic"><svg><use href="#i-bolt"/></svg></span>
            <span class="meta"><div class="m1">Casa · terminó</div><div class="m2">Estimado ≈${Math.round(estPct)}% · ${estKwh.toFixed(1)} kWh</div></span>
          </div>
          <div class="field" style="margin-top:8px;"><label>% final real</label><div class="input"><input type="number" step="0.1" min="0" max="100" id="confirmPct" value="${estPct.toFixed(1)}"><span class="unit">%</span></div></div>
          <div class="field"><label>kWh reales</label><div class="input"><input type="number" step="0.1" min="0" id="confirmKwh" value="${estKwh.toFixed(1)}"><span class="unit">kWh</span></div></div>
          <div class="form-error" id="confirmError"></div>
          <div class="btnrow">
            <button class="go" id="confirmSave">Guardar carga</button>
            <button class="del" id="confirmDiscard">Descartar</button>
          </div>
        </div>`;
      const confirmErrorEl = draftCardEl.querySelector<HTMLElement>('#confirmError')!;
      draftCardEl.querySelector<HTMLButtonElement>('#confirmSave')!.addEventListener('click', () => {
        void (async () => {
          const realPct = parseFloat(draftCardEl.querySelector<HTMLInputElement>('#confirmPct')!.value);
          const realKwh = parseFloat(draftCardEl.querySelector<HTMLInputElement>('#confirmKwh')!.value);
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
            await insertCharge({ location: 'home', startAt: start, endAt: atTime, kwh: realKwh, odometerKm: null, startPct: ac.startPct, endPct: realPct });
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
              startPct: activeCharge.startPct,
              targetStopAt: stop,
              networkLabel: `Casa · ${settings.homeChargerAmps}A · ${settings.homeChargerVolts}V`,
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
    void renderTopCard();
    await refresh();
  },
};
