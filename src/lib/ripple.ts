const RIPPLE_SELECTOR = '.primary-btn, .fab, .link-btn';

/** Ripple estilo Material — delegado en el root, así funciona en botones que se re-renderizan (innerHTML) sin tener que re-conectar nada. */
export function initGlobalRipple(root: HTMLElement): void {
  root.addEventListener('pointerdown', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(RIPPLE_SELECTOR);
    if (!target || target.disabled) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    target.appendChild(dot);
    setTimeout(() => dot.remove(), 620);
  });
}
