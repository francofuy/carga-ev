/**
 * Puente hacia la Live Activity nativa (Dynamic Island + pantalla bloqueada) de una carga en
 * Casa — ver ios/App/App/LiveActivityPlugin.swift. No-op en el build web (GitHub Pages) y en
 * iOS < 16.1, igual que notifications.ts.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface LiveActivityPlugin {
  isSupported(): Promise<{ value: boolean }>;
  sync(options: {
    startPct: number;
    targetStopAtMs: number;
    networkLabel: string;
    pct: number;
    kwhDelivered: number;
    kwhTotal: number;
  }): Promise<{ activityId?: string }>;
  end(): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

export interface ChargeLiveActivityState {
  startPct: number;
  targetStopAt: Date;
  networkLabel: string;
  pct: number;
  kwhDelivered: number;
  kwhTotal: number;
}

/**
 * Devuelve el mensaje de error en vez de solo loguearlo: sin Mac no hay forma de ver la consola
 * del WKWebView en el dispositivo, así que el error tiene que llegar a la UI para poder
 * diagnosticar algo — ver el toast en nueva-carga.ts/inicio.ts que lo muestra.
 */
export interface LiveActivitySyncResult {
  ok: boolean;
  error?: string;
}

/** Crea la Activity si no existe todavía, o actualiza la existente — segura de llamar seguido. */
export async function syncChargeLiveActivity(state: ChargeLiveActivityState): Promise<LiveActivitySyncResult> {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    await LiveActivity.sync({
      startPct: state.startPct,
      targetStopAtMs: state.targetStopAt.getTime(),
      networkLabel: state.networkLabel,
      pct: state.pct,
      kwhDelivered: state.kwhDelivered,
      kwhTotal: state.kwhTotal,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('No se pudo sincronizar la Live Activity:', err);
    return { ok: false, error: message };
  }
}

export async function endChargeLiveActivity(): Promise<LiveActivitySyncResult> {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    await LiveActivity.end();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('No se pudo terminar la Live Activity:', err);
    return { ok: false, error: message };
  }
}
