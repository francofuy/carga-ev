/**
 * Puente hacia el geofencing nativo ("llegaste a Casa") — ver ios/App/App/GeofencePlugin.swift
 * y HomeGeofenceManager.swift. No-op en el build web (GitHub Pages), igual que
 * notifications.ts/live-activity.ts.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface GeofencePlugin {
  startMonitoringHome(options: { lat: number; lng: number }): Promise<void>;
  stopMonitoring(): Promise<void>;
  isMonitoring(): Promise<{ value: boolean }>;
}

const Geofence = registerPlugin<GeofencePlugin>('Geofence');

export interface GeofenceResult {
  ok: boolean;
  error?: string;
}

export async function startHomeGeofence(lat: number, lng: number): Promise<GeofenceResult> {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    await Geofence.startMonitoringHome({ lat, lng });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('No se pudo activar el aviso de llegada a Casa:', err);
    return { ok: false, error: message };
  }
}

export async function stopHomeGeofence(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Geofence.stopMonitoring();
  } catch (err) {
    console.error('No se pudo desactivar el aviso de llegada a Casa:', err);
  }
}
