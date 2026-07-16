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

/**
 * Barra de rango continua (0→inicio% gris, inicio%→fin% verde) — el % de inicio vive dentro de
 * la zona gris y el % final dentro de la verde, nunca como texto aparte. Redondea solo acá, al
 * dibujar; el dato guardado sigue siendo el decimal real.
 */
function rangeBarSvg(startPct: number, endPct: number): string {
  const innerX = 3;
  const innerW = 194;
  const clampedStart = Math.max(0, Math.min(100, startPct));
  const clampedEnd = Math.max(clampedStart, Math.min(100, endPct));
  const baseW = (clampedStart / 100) * innerW;
  const gainW = ((clampedEnd - clampedStart) / 100) * innerW;
  const startLabelColor = baseW > 14 ? 'var(--text)' : '#fff';
  const endLabelColor = gainW > 14 ? '#fff' : 'var(--text)';
  return `
    <svg class="pct-bar-svg" viewBox="0 0 220 28" preserveAspectRatio="none">
      <rect x="1" y="1" width="200" height="26" rx="3" ry="3" fill="none" stroke="var(--border)" stroke-width="1.5"/>
      <rect x="204" y="9" width="4" height="10" rx="1.5" fill="var(--border)"/>
      <rect x="${innerX}" y="4" width="${innerW}" height="20" rx="3" fill="var(--surface-3)"/>
      <rect x="${innerX + baseW}" y="4" width="${gainW}" height="20" rx="3" fill="var(--good)"/>
      <text x="${innerX + baseW / 2}" y="18" text-anchor="middle" font-size="10.5" font-weight="700" fill="${startLabelColor}">${Math.round(clampedStart)}%</text>
      <text x="${innerX + baseW + gainW / 2}" y="18" text-anchor="middle" font-size="10.5" font-weight="700" fill="${endLabelColor}">${Math.round(clampedEnd)}%</text>
    </svg>`;
}

export function chargeRowHtml(c: Charge, opts: { deletable?: boolean } = {}): string {
  const hasRange = c.startPct != null && c.endPct != null;
  return `
    <div class="row" data-id="${c.id}">
      <div class="row-left">
        <div class="row-meta-line">
          <span class="row-date">${formatWhen(c)}</span>
          <span class="row-place">${c.location === 'home' ? 'Casa' : 'Público'} ${locationBadge(c)}</span>
        </div>
        ${hasRange ? `<div class="pct-bar-wrap">${rangeBarSvg(c.startPct!, c.endPct!)}</div>` : ''}
      </div>
      <div class="row-right">
        <div class="row-cost">$${Math.round(c.cost).toLocaleString('es-UY')}</div>
        <div class="row-kwh">${c.kwh.toFixed(1)} kWh</div>
      </div>
      ${opts.deletable ? `<button class="row-delete" data-del="${c.id}" aria-label="Eliminar carga"><svg><use href="#i-trash"/></svg></button>` : ''}
    </div>`;
}
