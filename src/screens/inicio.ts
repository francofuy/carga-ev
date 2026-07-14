import type { Screen } from './types';
import { getStatsSince, getMonthlyTotals, listCharges, getVehicle, getRealConsumption } from '../lib/db/api';
import { bus, CHARGES_UPDATED, DRAFT_UPDATED, requestEditCharge, requestResumeDraft, notifyDraftUpdated } from '../lib/bus';
import { chargeRowHtml } from '../components/charge-row';
import { renderOdometer } from '../lib/odometer';
import { loadDraft, clearDraft, timeAgoLabel } from '../lib/draft';
import { estimatedAutonomyKm } from '../lib/consumption';

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

    bus.addEventListener(CHARGES_UPDATED, () => void refresh());
    bus.addEventListener(DRAFT_UPDATED, renderDraftCard);
    renderDraftCard();
    await refresh();
  },
};
