/** Bus de eventos simple para que las pantallas se refresquen cuando cambian los datos, sin acoplarse entre sí. */
export const bus = new EventTarget();
export const CHARGES_UPDATED = 'charges-updated';

export function notifyChargesUpdated(): void {
  bus.dispatchEvent(new Event(CHARGES_UPDATED));
}
