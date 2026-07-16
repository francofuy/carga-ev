import type { Charge } from './db/charges';
import type { ChargeDraft } from './draft';

/** Bus de eventos simple para que las pantallas se refresquen cuando cambian los datos, sin acoplarse entre sí. */
export const bus = new EventTarget();
export const CHARGES_UPDATED = 'charges-updated';
export const OPEN_EDIT_CHARGE = 'open-edit-charge';
export const DRAFT_UPDATED = 'draft-updated';
export const RESUME_DRAFT = 'resume-draft';
export const ACTIVE_CHARGE_UPDATED = 'active-charge-updated';
export const OPEN_PROGRAMAR = 'open-programar';

export function notifyChargesUpdated(): void {
  bus.dispatchEvent(new Event(CHARGES_UPDATED));
}

export function requestEditCharge(charge: Charge): void {
  bus.dispatchEvent(new CustomEvent<Charge>(OPEN_EDIT_CHARGE, { detail: charge }));
}

export function notifyDraftUpdated(): void {
  bus.dispatchEvent(new Event(DRAFT_UPDATED));
}

export function requestResumeDraft(draft: ChargeDraft): void {
  bus.dispatchEvent(new CustomEvent<ChargeDraft>(RESUME_DRAFT, { detail: draft }));
}

export function notifyActiveChargeUpdated(): void {
  bus.dispatchEvent(new Event(ACTIVE_CHARGE_UPDATED));
}

/** Disparado al tocar la notificación nativa de "llegaste a Casa" (ver src/lib/geofence.ts / main.ts). */
export function requestOpenProgramar(): void {
  bus.dispatchEvent(new Event(OPEN_PROGRAMAR));
}
