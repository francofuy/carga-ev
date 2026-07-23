import type { Screen } from './types';
import { listCharges, deleteCharge, getStatsSince, getMonthlyTotals } from '../lib/db/api';
import type { Charge } from '../lib/db/charges';
import { bus, CHARGES_UPDATED, notifyChargesUpdated, requestEditCharge } from '../lib/bus';
import { chargeRowHtml } from '../components/charge-row';
import { renderOdometer } from '../lib/odometer';

type Filter = 'all' | 'home' | 'public';

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-UY');
}

export const cargasScreen: Screen = {
  id: 'cargas',
  render() {
    return `
      <div class="nav-title">Cargas</div>
      <div class="card">
        <div class="label">Gasto este mes</div>
        <div class="big-number" id="cargasSpend">—</div>
        <div class="sub" id="cargasCount">Cargando…</div>
      </div>
      <div class="tile-row">
        <div class="tile"><div class="label">$/kWh prom.</div><div class="value" id="tileAvgKwh">—</div></div>
        <div class="tile"><div class="label">% en Valle</div><div class="value" id="tileValle">—</div></div>
        <div class="tile"><div class="label">$/km</div><div class="value" id="tileKm">—</div></div>
      </div>
      <div class="chart-card">
        <div class="chead"><span class="t">Tendencia</span><span class="p">últimos 6 meses</span></div>
        <div class="bar-chart" id="cargasChart"></div>
      </div>
      <div class="chart-card" id="compCard">
        <div class="chead"><span class="t">Franja horaria</span><span class="p">este mes</span></div>
        <div id="compBody"><p style="font-size:12.5px;color:var(--text-muted);margin:0;">Sin cargas en casa todavía.</p></div>
      </div>
      <div class="chip-row" id="cargasFilter">
        <button class="chip sel" data-filter="all">Todas</button>
        <button class="chip" data-filter="home">Casa</button>
        <button class="chip" data-filter="public">Público</button>
      </div>
      <div class="list-group" id="cargasList"></div>
    `;
  },
  async mount(root) {
    const listEl = root.querySelector<HTMLElement>('#cargasList')!;
    const filterEl = root.querySelector<HTMLElement>('#cargasFilter')!;
    const spendEl = root.querySelector<HTMLElement>('#cargasSpend')!;
    const countEl = root.querySelector<HTMLElement>('#cargasCount')!;
    const tileAvgKwh = root.querySelector<HTMLElement>('#tileAvgKwh')!;
    const tileValle = root.querySelector<HTMLElement>('#tileValle')!;
    const tileKm = root.querySelector<HTMLElement>('#tileKm')!;
    const chartEl = root.querySelector<HTMLElement>('#cargasChart')!;
    const compBody = root.querySelector<HTMLElement>('#compBody')!;
    let all: Charge[] = [];
    let filter: Filter = 'all';

    function renderList() {
      const filtered = filter === 'all' ? all : all.filter((c) => c.location === filter);
      listEl.innerHTML = filtered.length
        ? filtered.map((c) => chargeRowHtml(c, { deletable: true })).join('')
        : '<div class="list-empty">Sin cargas para este filtro.</div>';
    }

    chartEl.addEventListener('click', (e) => {
      const col = (e.target as HTMLElement).closest<HTMLElement>('.bar-col');
      if (!col) return;
      chartEl.querySelectorAll('.bar-col').forEach((c) => c.classList.remove('show'));
      col.classList.add('show');
    });

    async function refresh() {
      try {
        const [charges, stats, monthly] = await Promise.all([
          listCharges(),
          getStatsSince(startOfMonthIso()),
          getMonthlyTotals(6),
        ]);
        all = charges;
        renderList();

        renderOdometer(spendEl, fmtMoney(stats.totalCost));
        countEl.style.color = '';
        countEl.textContent =
          stats.count === 0
            ? 'Sin cargas todavía este mes'
            : `${stats.count} carga${stats.count === 1 ? '' : 's'} registrada${stats.count === 1 ? '' : 's'}`;

        tileAvgKwh.textContent = stats.avgCostPerKwh > 0 ? '$' + stats.avgCostPerKwh.toFixed(2) : '—';
        tileValle.textContent = stats.valleSharePct > 0 || stats.count > 0 ? Math.round(stats.valleSharePct) + '%' : '—';
        tileKm.textContent = stats.costPerKm != null ? '$' + stats.costPerKm.toFixed(2) : '—';

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
      } catch (err) {
        listEl.innerHTML = `<div class="list-empty">Error cargando el historial — ${err instanceof Error ? err.message : String(err)}</div>`;
        spendEl.textContent = '—';
        countEl.textContent = 'Error de base de datos';
        countEl.style.color = 'var(--critical)';
      }
    }

    filterEl.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterEl.querySelectorAll('.chip').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
        filter = btn.dataset.filter as Filter;
        renderList();
      });
    });

    listEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const delBtn = target.closest<HTMLButtonElement>('[data-del]');
      if (delBtn) {
        const id = Number(delBtn.dataset.del);
        if (!confirm('¿Eliminar esta carga? No se puede deshacer.')) return;
        void deleteCharge(id).then(() => notifyChargesUpdated());
        return;
      }
      const row = target.closest<HTMLElement>('.row[data-id]');
      if (row) {
        const charge = all.find((c) => c.id === Number(row.dataset.id));
        if (charge) requestEditCharge(charge);
      }
    });

    bus.addEventListener(CHARGES_UPDATED, () => void refresh());
    await refresh();
  },
};
