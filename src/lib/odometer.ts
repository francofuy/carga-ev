/** Dibuja un valor de texto como dígitos que "ruedan" tipo odómetro — coherente con el vocabulario de auto que ya usa la app (autonomía, odómetro). */
export function renderOdometer(el: HTMLElement, text: string): void {
  el.innerHTML = [...text]
    .map((ch) => {
      if (ch >= '0' && ch <= '9') {
        const rows = Array.from({ length: 10 }, (_, n) => `<div>${n}</div>`).join('');
        return `<span class="digit-wrap"><span class="digit-track" data-target="${ch}">${rows}</span></span>`;
      }
      return `<span>${ch}</span>`;
    })
    .join('');
  requestAnimationFrame(() => {
    el.querySelectorAll<HTMLElement>('.digit-track').forEach((track) => {
      const n = Number(track.dataset.target);
      track.style.transform = `translateY(-${n * 1.2}em)`;
    });
  });
}
