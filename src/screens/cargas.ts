import type { Screen } from './types';
import { listCharges, deleteCharge } from '../lib/db/api';
import type { Charge } from '../lib/db/charges';
import { bus, CHARGES_UPDATED, notifyChargesUpdated } from '../lib/bus';

type Filter = 'all' | 'home' | 'public';

function formatWhen(c: Charge): string {
  const iso = c.location === 'home' ? c.startAt : c.createdAt;
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-UY', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function locationBadge(c: Charge): string {
  if (c.location !== 'home') return '<span class="badge badge-neutral">Manual</span>';
  const max = Math.max(c.valleKwh, c.llanoKwh, c.puntaKwh);
  if (max <= 0) return '';
  if (c.puntaKwh === max) return '<span class="badge badge-critical">Punta</span>';
  if (c.llanoKwh === max) return '<span class="badge badge-warning">Llano</span>';
  return '<span class="badge badge-good">Valle</span>';
}

function rowHtml(c: Charge): string {
  return `
    <div class="row" data-id="${c.id}">
      <div class="icon-dot"><svg><use href="#i-bolt"/></svg></div>
      <div class="meta">
        <div class="primary">${formatWhen(c)}</div>
        <div class="secondary">${c.location === 'home' ? 'Casa' : 'Público'} ${locationBadge(c)}</div>
      </div>
      <div class="amount">
        <div class="cost">$${Math.round(c.cost).toLocaleString('es-UY')}</div>
        <div class="kwh">${c.kwh.toFixed(1)} kWh</div>
      </div>
      <button class="row-delete" data-del="${c.id}" aria-label="Eliminar carga"><svg><use href="#i-trash"/></svg></button>
    </div>`;
}

export const cargasScreen: Screen = {
  id: 'cargas',
  render() {
    return `
      <div class="nav-title">Cargas</div>
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
    let all: Charge[] = [];
    let filter: Filter = 'all';

    function render() {
      const filtered = filter === 'all' ? all : all.filter((c) => c.location === filter);
      listEl.innerHTML = filtered.length
        ? filtered.map(rowHtml).join('')
        : '<div class="list-empty">Sin cargas para este filtro.</div>';
    }

    async function refresh() {
      try {
        all = await listCharges();
        render();
      } catch (err) {
        listEl.innerHTML = `<div class="list-empty">Error cargando el historial — ${err instanceof Error ? err.message : String(err)}</div>`;
      }
    }

    filterEl.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterEl.querySelectorAll('.chip').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
        filter = btn.dataset.filter as Filter;
        render();
      });
    });

    listEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
      if (!btn) return;
      const id = Number(btn.dataset.del);
      if (!confirm('¿Eliminar esta carga? No se puede deshacer.')) return;
      void deleteCharge(id).then(() => {
        notifyChargesUpdated();
      });
    });

    bus.addEventListener(CHARGES_UPDATED, () => void refresh());
    await refresh();
  },
};
