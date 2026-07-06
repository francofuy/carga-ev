/** Ráfaga sutil de chispas color acento — festejo puntual al guardar una carga, no un fondo permanente. */
export function sparkBurst(canvas: HTMLCanvasElement, originX: number, originY: number, color: string): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: 12 }, () => ({
    x: originX,
    y: originY,
    vx: (Math.random() - 0.5) * 60,
    vy: -Math.random() * 40 - 20,
    r: 1.5 + Math.random() * 1.5,
    life: 1,
  }));

  let raf = 0;
  function frame() {
    ctx!.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx * 0.02;
      p.y += p.vy * 0.02;
      p.vy += 0.15;
      p.life -= 0.02;
      ctx!.globalAlpha = Math.max(0, p.life);
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(frame);
  }
  cancelAnimationFrame(raf);
  frame();
}
