import type { Screen } from './types';
import { getDb } from '../lib/db/client';
import { getStatsSince } from '../lib/db/charges';

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
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
    `;
  },
  async mount(root) {
    const spendEl = root.querySelector<HTMLElement>('#homeSpend')!;
    const countEl = root.querySelector<HTMLElement>('#homeCount')!;
    try {
      const db = await getDb();
      const stats = getStatsSince(db, startOfMonthIso());
      spendEl.textContent = '$ ' + Math.round(stats.totalCost).toLocaleString('es-UY');
      countEl.textContent =
        stats.count === 0
          ? 'Sin cargas todavía este mes'
          : `${stats.count} carga${stats.count === 1 ? '' : 's'} registrada${stats.count === 1 ? '' : 's'}`;
    } catch (err) {
      console.error('No se pudo inicializar la base de datos local:', err);
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      spendEl.textContent = '—';
      countEl.textContent = `Error de base de datos — ${detail}`;
      countEl.style.color = 'var(--critical)';
    }
  },
};
