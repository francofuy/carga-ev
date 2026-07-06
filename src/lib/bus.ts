import type { Charge } from './db/charges';

/** Bus de eventos simple para que las pantallas se refresquen cuando cambian los datos, sin acoplarse entre sí. */
export const bus = new EventTarget();
export const CHARGES_UPDATED = 'charges-updated';
export const OPEN_EDIT_CHARGE = 'open-edit-charge';

export function notifyChargesUpdated(): void {
  bus.dispatchEvent(new Event(CHARGES_UPDATED));
}

export function requestEditCharge(charge: Charge): void {
  bus.dispatchEvent(new CustomEvent<Charge>(OPEN_EDIT_CHARGE, { detail: charge }));
}
