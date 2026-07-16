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

/** Crea la Activity si no existe todavía, o actualiza la existente — segura de llamar seguido. */
export async function syncChargeLiveActivity(state: ChargeLiveActivityState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LiveActivity.sync({
      startPct: state.startPct,
      targetStopAtMs: state.targetStopAt.getTime(),
      networkLabel: state.networkLabel,
      pct: state.pct,
      kwhDelivered: state.kwhDelivered,
      kwhTotal: state.kwhTotal,
    });
  } catch (err) {
    console.error('No se pudo sincronizar la Live Activity:', err);
  }
}

export async function endChargeLiveActivity(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LiveActivity.end();
  } catch (err) {
    console.error('No se pudo terminar la Live Activity:', err);
  }
}
