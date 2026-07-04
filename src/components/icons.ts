// Set original de íconos (Fase 9) — no son trazados de SF Symbols ni de Phosphor, ver justificación de licencia en el sistema de diseño.
const SPRITE = `
<svg width="0" height="0" style="position:absolute">
  <defs>
    <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9h12v-9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-list" viewBox="0 0 24 24"><line x1="5" y1="7" x2="19" y2="7" stroke-width="1.7" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="1.7" stroke-linecap="round"/><line x1="5" y1="17" x2="19" y2="17" stroke-width="1.7" stroke-linecap="round"/></symbol>
    <symbol id="i-car" viewBox="0 0 24 24"><path d="M4 16V11.5L6.2 6.8A2 2 0 0 1 8 5.6h8a2 2 0 0 1 1.8 1.2L20 11.5V16" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><rect x="3" y="13" width="18" height="5.5" rx="2" stroke-width="1.6"/><circle cx="7.5" cy="19" r="1.6" stroke-width="1.5"/><circle cx="16.5" cy="19" r="1.6" stroke-width="1.5"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1" stroke-width="1.6"/><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7 16 16M8 8 6.3 6.3" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M5 7h14M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M7 7l1 12.5A2 2 0 0 0 10 21.3h4a2 2 0 0 0 2-1.8L17 7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  </defs>
</svg>`;

export function injectIconSprite(): void {
  if (document.getElementById('icon-sprite')) return;
  const wrap = document.createElement('div');
  wrap.id = 'icon-sprite';
  wrap.innerHTML = SPRITE;
  document.body.prepend(wrap);
}
