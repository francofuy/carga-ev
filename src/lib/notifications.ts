/**
 * Notificaciones locales de la carga programada (inicio/fin) — no necesitan ubicación ni
 * push, la app ya sabe la hora exacta porque la programó el usuario. En el build web
 * (GitHub Pages) el plugin no existe de verdad, así que todo queda detrás de
 * `Capacitor.isNativePlatform()` como no-op.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const START_NOTIF_ID = 9001;
const STOP_NOTIF_ID = 9002;

export async function scheduleActiveChargeNotifications(startAt: Date, targetStopAt: Date, stopTimeLabel: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: START_NOTIF_ID,
          title: 'Empezó tu carga programada',
          body: `Casa · corta a las ${stopTimeLabel}`,
          schedule: { at: startAt },
        },
        {
          id: STOP_NOTIF_ID,
          title: 'Terminó tu carga programada',
          body: 'Tocá para confirmar el resultado real.',
          schedule: { at: targetStopAt },
        },
      ],
    });
  } catch (err) {
    console.error('No se pudieron programar las notificaciones de la carga:', err);
  }
}

export async function cancelActiveChargeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: START_NOTIF_ID }, { id: STOP_NOTIF_ID }] });
  } catch (err) {
    console.error('No se pudieron cancelar las notificaciones de la carga:', err);
  }
}
