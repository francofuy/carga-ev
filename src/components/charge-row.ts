import type { Charge } from '../lib/db/charges';

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
  if (c.location !== 'home') return `<span class="badge badge-neutral">${c.network ?? 'Manual'}</span>`;
  const max = Math.max(c.valleKwh, c.llanoKwh, c.puntaKwh);
  if (max <= 0) return '';
  if (c.puntaKwh === max) return '<span class="badge badge-critical">Punta</span>';
  if (c.llanoKwh === max) return '<span class="badge badge-warning">Llano</span>';
  return '<span class="badge badge-good">Valle</span>';
}

export function chargeRowHtml(c: Charge, opts: { deletable?: boolean } = {}): string {
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
      ${opts.deletable ? `<button class="row-delete" data-del="${c.id}" aria-label="Eliminar carga"><svg><use href="#i-trash"/></svg></button>` : ''}
    </div>`;
}
