import type { Screen } from './types';
import { getSettings, setSetting, exportBackup, restoreBackup, wipeData } from '../lib/db/api';
import type { AppSettings } from '../lib/db/settings';
import type { BackupData } from '../lib/db/backup';
import { notifyChargesUpdated } from '../lib/bus';
import { applyTheme } from '../lib/theme';

const SETTING_KEY_MAP: Record<keyof AppSettings, string> = {
  tariffValle: 'tariff_valle',
  tariffLlano: 'tariff_llano',
  tariffPunta: 'tariff_punta',
  puntaStartHour: 'punta_start_hour',
  notifBackupEnabled: 'notif_backup_enabled',
  theme: 'theme',
};

function bodyHtml(): string {
  return `
    <div class="section-title">Tarifas UTE</div>
    <div class="settings-group">
      <div class="settings-row"><span class="lbl">Horario Valle</span><input class="val-input" id="setValle" type="number" step="0.001"><span>$/kWh</span></div>
      <div class="settings-row"><span class="lbl">Horario Llano</span><input class="val-input" id="setLlano" type="number" step="0.001"><span>$/kWh</span></div>
      <div class="settings-row"><span class="lbl">Horario Punta</span><input class="val-input" id="setPunta" type="number" step="0.001"><span>$/kWh</span></div>
      <div class="settings-row">
        <span class="lbl">Mi franja Punta</span>
        <select id="setPuntaHour">
          <option value="17">17:00–21:00</option>
          <option value="18">18:00–22:00</option>
          <option value="19">19:00–23:00</option>
        </select>
      </div>
    </div>
    <button class="link-btn" id="saveTariffs" style="margin-bottom:18px;">Guardar tarifas</button>
    <div class="alert-banner" id="tariffMsg"></div>

    <div class="section-title">Notificaciones</div>
    <div class="settings-group">
      <div class="settings-row"><span class="lbl">Recordatorio de backup</span><button class="switch" id="setNotif"></button></div>
    </div>

    <div class="section-title">Apariencia</div>
    <div class="settings-group">
      <div class="settings-row">
        <span class="lbl">Tema</span>
        <select id="setTheme">
          <option value="auto">Automático</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>
    </div>

    <div class="section-title">Datos</div>
    <div class="alert-banner" id="dataMsg"></div>
    <div class="settings-group">
      <div class="settings-row" id="rowExport" style="cursor:pointer;"><span class="lbl">Exportar backup</span></div>
      <div class="settings-row" id="rowImport" style="cursor:pointer;"><span class="lbl">Importar backup</span></div>
      <div class="settings-row destructive" id="rowWipe"><span class="lbl">Borrar todos los datos</span></div>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none;">
  `;
}

function showBanner(el: HTMLElement, msg: string, kind: 'success' | 'error'): void {
  el.textContent = msg;
  el.className = `alert-banner show ${kind}`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

export const ajustesScreen: Screen = {
  id: 'ajustes',
  render() {
    return `<div class="nav-title">Ajustes</div><div id="ajustesBody"><p style="color:var(--text-secondary);font-size:14px;">Cargando…</p></div>`;
  },
  async mount(root) {
    const body = root.querySelector<HTMLElement>('#ajustesBody')!;
    let settings: AppSettings;

    try {
      settings = await getSettings();
    } catch (err) {
      body.innerHTML = `<p style="color:var(--critical);font-size:14px;">Error cargando ajustes — ${err instanceof Error ? err.message : String(err)}</p>`;
      return;
    }

    body.innerHTML = bodyHtml();

    const valleInput = body.querySelector<HTMLInputElement>('#setValle')!;
    const llanoInput = body.querySelector<HTMLInputElement>('#setLlano')!;
    const puntaInput = body.querySelector<HTMLInputElement>('#setPunta')!;
    const puntaHourSelect = body.querySelector<HTMLSelectElement>('#setPuntaHour')!;
    const tariffMsg = body.querySelector<HTMLElement>('#tariffMsg')!;
    const notifSwitch = body.querySelector<HTMLButtonElement>('#setNotif')!;
    const themeSelect = body.querySelector<HTMLSelectElement>('#setTheme')!;
    const dataMsg = body.querySelector<HTMLElement>('#dataMsg')!;
    const importFile = body.querySelector<HTMLInputElement>('#importFile')!;

    valleInput.value = String(settings.tariffValle);
    llanoInput.value = String(settings.tariffLlano);
    puntaInput.value = String(settings.tariffPunta);
    puntaHourSelect.value = String(settings.puntaStartHour);
    notifSwitch.classList.toggle('on', settings.notifBackupEnabled);
    themeSelect.value = settings.theme;

    body.querySelector('#saveTariffs')!.addEventListener('click', () => {
      void (async () => {
        await setSetting(SETTING_KEY_MAP.tariffValle, valleInput.value);
        await setSetting(SETTING_KEY_MAP.tariffLlano, llanoInput.value);
        await setSetting(SETTING_KEY_MAP.tariffPunta, puntaInput.value);
        await setSetting(SETTING_KEY_MAP.puntaStartHour, puntaHourSelect.value);
        showBanner(tariffMsg, 'Tarifas guardadas. Las cargas ya registradas no se recalculan.', 'success');
      })();
    });

    notifSwitch.addEventListener('click', () => {
      void (async () => {
        const next = !notifSwitch.classList.contains('on');
        notifSwitch.classList.toggle('on', next);
        await setSetting(SETTING_KEY_MAP.notifBackupEnabled, next ? '1' : '0');
      })();
    });

    themeSelect.addEventListener('change', () => {
      void (async () => {
        const value = themeSelect.value as AppSettings['theme'];
        applyTheme(value);
        await setSetting(SETTING_KEY_MAP.theme, value);
      })();
    });

    body.querySelector('#rowExport')!.addEventListener('click', () => {
      void (async () => {
        try {
          const backup = await exportBackup();
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const date = new Date().toISOString().slice(0, 10);
          a.href = url;
          a.download = `carga-ev-backup-${date}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showBanner(dataMsg, 'Backup exportado.', 'success');
        } catch (err) {
          showBanner(dataMsg, 'No se pudo exportar: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      })();
    });

    body.querySelector('#rowImport')!.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      void (async () => {
        const file = importFile.files?.[0];
        importFile.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const backup = JSON.parse(text) as BackupData;
          if (!backup || typeof backup !== 'object' || !Array.isArray(backup.charges) || !backup.settings) {
            throw new Error('El archivo no tiene el formato esperado de un backup.');
          }
          if (!confirm(`Se van a reemplazar todos tus datos actuales con este backup (${backup.charges.length} cargas). ¿Continuar?`)) return;
          await restoreBackup(backup);
          notifyChargesUpdated();
          showBanner(dataMsg, 'Backup importado. Revisá Inicio y Cargas.', 'success');
          settings = await getSettings();
          valleInput.value = String(settings.tariffValle);
          llanoInput.value = String(settings.tariffLlano);
          puntaInput.value = String(settings.tariffPunta);
          puntaHourSelect.value = String(settings.puntaStartHour);
        } catch (err) {
          showBanner(dataMsg, 'No se pudo importar: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      })();
    });

    body.querySelector('#rowWipe')!.addEventListener('click', () => {
      void (async () => {
        if (!confirm('¿Borrar todas las cargas y el vehículo guardado? Esta acción no se puede deshacer. Las tarifas configuradas no se tocan.')) return;
        await wipeData();
        notifyChargesUpdated();
        showBanner(dataMsg, 'Datos borrados.', 'success');
      })();
    });
  },
};
