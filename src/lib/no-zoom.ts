/**
 * Tercera capa contra el zoom táctil (además del viewport meta y touch-action en CSS).
 * `gesturestart` es un evento propio de WebKit para el gesto de pellizco (pinch) — no está en
 * ningún estándar, pero es la única forma confiable de interceptarlo en Safari/iOS.
 */
export function preventZoomGestures(): void {
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
}
