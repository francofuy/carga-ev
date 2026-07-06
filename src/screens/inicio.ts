import type { Screen } from './types';
import { getStatsSince, getMonthlyTotals, listCharges } from '../lib/db/api';
import { bus, CHARGES_UPDATED, requestEditCharge } from '../lib/bus';
import { chargeRowHtml } from '../components/charge-row';

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
      <div class="nav-title">Inicio</div>
      <div class="card">
        <div class="label">Gasto este mes</div>
        <div class="big-number" id="homeSpend">—</div>
        <div class="sub" id="homeCount">Cargando…</div>
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
    `;
  },
  async mount(root) {
    const spendEl = root.querySelector<HTMLElement>('#homeSpend')!;
    const countEl = root.querySelector<HTMLElement>('#homeCount')!;
    const tileAvgKwh = root.querySelector<HTMLElement>('#tileAvgKwh')!;
    const tileValle = root.querySelector<HTMLElement>('#tileValle')!;
    const tileKm = root.querySelector<HTMLElement>('#tileKm')!;
    const chartEl = root.querySelector<HTMLElement>('#homeChart')!;
    const compBody = root.querySelector<HTMLElement>('#compBody')!;
    const listEl = root.querySelector<HTMLElement>('#homeList')!;
    const seeAll = root.querySelector<HTMLAnchorElement>('#homeSeeAll')!;

    seeAll.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector<HTMLButtonElement>('.tab[data-tab="cargas"]')?.click();
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
        const [stats, monthly, recent] = await Promise.all([
          getStatsSince(startOfMonthIso()),
          getMonthlyTotals(6),
          listCharges(3),
        ]);

        spendEl.textContent = fmtMoney(stats.totalCost);
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
            return `<div class="bar-col"><div class="bar${isPeak ? ' peak' : ''}" style="height:${heightPct}%"></div><div class="m">${m.monthLabel}</div></div>`;
          })
          .join('');

        const homeShareTotal = stats.valleSharePct + stats.llanoSharePct + stats.puntaSharePct;
        if (homeShareTotal > 0) {
          compBody.innerHTML = `
            <div class="comp-bar">
              <span style="width:${stats.valleSharePct}%;background:var(--good)"></span>
              <span style="width:${stats.llanoSharePct}%;background:var(--warning-fill)"></span>
              <span style="width:${stats.puntaSharePct}%;background:var(--critical)"></span>
            </div>
            <div class="comp-legend">
              <div class="li"><span class="dot" style="background:var(--good)"></span>Valle <b>${Math.round(stats.valleSharePct)}%</b></div>
              <div class="li"><span class="dot" style="background:var(--warning-fill)"></span>Llano <b>${Math.round(stats.llanoSharePct)}%</b></div>
              <div class="li"><span class="dot" style="background:var(--critical)"></span>Punta <b>${Math.round(stats.puntaSharePct)}%</b></div>
            </div>`;
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

    bus.addEventListener(CHARGES_UPDATED, () => void refresh());
    await refresh();
  },
};
