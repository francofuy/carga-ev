/** Persistencia del borrador de "Nueva carga" en localStorage — sobrevive a que iOS mate la pestaña en background. */

export interface ChargeDraft {
  savedAt: number;
  origin: 'home' | 'public';
  mode: 'kwh' | 'pct';
  fields: Record<string, string>;
  line1: string;
  line2: string;
}

const KEY = 'carga-ev:draft';

export function saveDraft(draft: ChargeDraft): void {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

export function loadDraft(): ChargeDraft | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChargeDraft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(KEY);
}

export function timeAgoLabel(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return 'hace un instante';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
