import type { Screen } from './types';
import { listCharges, deleteCharge } from '../lib/db/api';
import type { Charge } from '../lib/db/charges';
import { bus, CHARGES_UPDATED, notifyChargesUpdated, requestEditCharge } from '../lib/bus';
import { chargeRowHtml } from '../components/charge-row';

type Filter = 'all' | 'home' | 'public';

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
        ? filtered.map((c) => chargeRowHtml(c, { deletable: true })).join('')
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
