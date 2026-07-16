import type { Screen } from './types';
import { getSettings, setSetting, exportBackup, restoreBackup, wipeData } from '../lib/db/api';
import type { AppSettings } from '../lib/db/settings';
import type { BackupData } from '../lib/db/backup';
import { notifyChargesUpdated } from '../lib/bus';
import { applyTheme } from '../lib/theme';
import { chargerKw } from '../lib/estimation';
import { Geolocation } from '@capacitor/geolocation';
import {
  applyPersonalizacion,
  reapplyAccentInkForTheme,
  pickTextOnAccent,
  getCurrentAccentSL,
  PRESETS,
  ALERT_COLOR_CHOICES,
  type PersonalizacionConfig,
} from '../lib/personalizacion';

const SETTING_KEY_MAP: Record<keyof AppSettings, string> = {
  tariffValle: 'tariff_valle',
  tariffLlano: 'tariff_llano',
  tariffPunta: 'tariff_punta',
  puntaStartHour: 'punta_start_hour',
  notifBackupEnabled: 'notif_backup_enabled',
  theme: 'theme',
  accentColor: 'accent_color',
  personalizacion: 'personalizacion',
  homeChargerAmps: 'home_charger_amps',
  homeChargerVolts: 'home_charger_volts',
  homeLat: 'home_lat',
  homeLng: 'home_lng',
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
      <div class="settings-row" id="rowPersonalizacion" style="cursor:pointer;">
        <span class="lbl">Personalización</span>
        <span class="setrow-dot" id="pznDot" style="width:18px;height:18px;border-radius:50%;flex:0 0 auto;"></span>
        <span style="color:var(--text-muted);margin-left:6px;">›</span>
      </div>
    </div>

    <div class="section-title">Carga en Casa</div>
    <div class="settings-group">
      <div class="settings-row" id="rowChargerData" style="cursor:pointer;">
        <span class="lbl">Datos de carga en Casa</span>
        <span style="color:var(--text-muted);margin-left:6px;">›</span>
      </div>
      <div class="settings-row" id="rowHomeLocation" style="cursor:pointer;">
        <span class="lbl">Ubicación de Casa</span>
        <span style="color:var(--text-muted);margin-left:6px;">›</span>
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

    <div class="sheet-overlay" id="hcOverlay">
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title">Datos de carga en Casa</div>
          <button class="sheet-cancel" id="hcClose">Cerrar</button>
        </div>
        <p style="font-size:calc(13px * var(--font-scale));color:var(--text-secondary);margin:0 0 16px;line-height:1.5;">
          Necesarios para que "Programar" pueda estimar cuánto vas a cargar — se sacan de la
          pantalla de tu propio cargador.
        </p>
        <div class="settings-row"><span class="lbl">Amperaje</span><input class="val-input" id="hcAmps" type="number" step="1" min="0"><span>A</span></div>
        <div class="settings-row"><span class="lbl">Voltaje</span><input class="val-input" id="hcVolts" type="number" step="1" min="0"><span>V</span></div>
        <div class="settings-row" style="cursor:default;"><span class="lbl">Potencia estimada</span><span id="hcKwPreview" style="font-weight:700;">—</span></div>
        <p style="font-size:calc(12px * var(--font-scale));color:var(--text-muted);margin:8px 0 0;line-height:1.5;">
          Incluye un 0,92 de eficiencia (pérdidas típicas de carga en AC) — cada carga real que
          confirmás en Casa termina de calibrar qué tan preciso es este número.
        </p>
      </div>
    </div>

    <div class="sheet-overlay" id="locOverlay">
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title">Ubicación de Casa</div>
          <button class="sheet-cancel" id="locClose">Cerrar</button>
        </div>
        <p style="font-size:calc(13px * var(--font-scale));color:var(--text-secondary);margin:0 0 16px;line-height:1.5;">
          Se usa para avisarte cuando llegás y sugerirte programar la carga. Nunca se comparte —
          vive solo en tu teléfono.
        </p>
        <div id="locState" style="margin-bottom:14px;"></div>
        <button class="link-btn" id="locUseCurrent">Usar mi ubicación actual</button>
        <div class="alert-banner" id="locMsg"></div>
      </div>
    </div>

    <div class="sheet-overlay" id="pznOverlay">
      <div class="sheet">
        <div class="sheet-head">
          <div class="sheet-title" id="pznTitle">Personalización</div>
          <button class="sheet-cancel" id="pznClose">Cerrar</button>
        </div>
        <div id="pznListStep">
          <div class="pzn-preview">
            <span class="num" id="pznPreviewNum">$330</span>
            <span class="btn">+ Carga</span>
            <span class="dot" id="pznPreviewDot"></span>
          </div>
          <button class="pzn-catrow" data-cat="color"><span><span class="name">Color</span><span class="hint" style="display:block;">Acento libre, no solo 5 fijos</span></span><span class="chev">›</span></button>
          <button class="pzn-catrow" data-cat="tipografia"><span><span class="name">Tipografía</span><span class="hint" style="display:block;">Escala y peso de los números</span></span><span class="chev">›</span></button>
          <button class="pzn-catrow" data-cat="forma"><span><span class="name">Forma y contenedores</span><span class="hint" style="display:block;">Botones, tarjetas, esquinas</span></span><span class="chev">›</span></button>
          <button class="pzn-catrow" data-cat="fondo"><span><span class="name">Fondo animado</span><span class="hint" style="display:block;">Aurora: intensidad y velocidad</span></span><span class="chev">›</span></button>
          <button class="pzn-catrow" data-cat="pantallas"><span><span class="name">Íconos y alerta</span><span class="hint" style="display:block;">Estilo de ícono, color crítico</span></span><span class="chev">›</span></button>
        </div>
        <div id="pznDetailStep" style="display:none;">
          <button class="pzn-back" id="pznBack">‹ Volver</button>
          <div class="pzn-preview">
            <span class="num" id="pznPreviewNum2">$330</span>
            <span class="btn">+ Carga</span>
            <span class="dot" id="pznPreviewDot2"></span>
          </div>
          <div id="pznDetailBody"></div>
        </div>
      </div>
    </div>
  `;
}

function showBanner(el: HTMLElement, msg: string, kind: 'success' | 'error'): void {
  el.textContent = msg;
  el.className = `alert-banner show ${kind}`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

/** Fila de chips reutilizable — mismo `.chip` que ya usa la app en Cargas/Nueva carga. */
function chipRowHtml<T extends string>(id: string, options: { value: T; label: string }[]): string {
  return `<div class="chip-row" id="${id}" style="margin-bottom:16px;">${options
    .map((o) => `<button class="chip" type="button" data-value="${o.value}">${o.label}</button>`)
    .join('')}</div>`;
}
function wireChipRow<T extends string>(root: ParentNode, id: string, getActive: () => T, onSelect: (v: T) => void): { sync: () => void } {
  const row = root.querySelector<HTMLElement>(`#${id}`)!;
  row.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSelect(btn.dataset.value as T);
      sync();
    });
  });
  function sync(): void {
    row.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-value') === getActive()));
  }
  return { sync };
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
    const pznDot = body.querySelector<HTMLElement>('#pznDot')!;

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
        reapplyAccentInkForTheme(pznConfig);
        await setSetting(SETTING_KEY_MAP.theme, value);
      })();
    });

    // ---- Datos de carga en Casa ----
    const hcOverlay = body.querySelector<HTMLElement>('#hcOverlay')!;
    const hcAmpsInput = body.querySelector<HTMLInputElement>('#hcAmps')!;
    const hcVoltsInput = body.querySelector<HTMLInputElement>('#hcVolts')!;
    const hcKwPreview = body.querySelector<HTMLElement>('#hcKwPreview')!;

    hcAmpsInput.value = settings.homeChargerAmps ? String(settings.homeChargerAmps) : '';
    hcVoltsInput.value = settings.homeChargerVolts ? String(settings.homeChargerVolts) : '';

    function updateHcKwPreview(): void {
      const amps = Number(hcAmpsInput.value) || 0;
      const volts = Number(hcVoltsInput.value) || 0;
      hcKwPreview.textContent = amps > 0 && volts > 0 ? `≈ ${chargerKw(amps, volts).toFixed(1)} kW` : '—';
    }
    updateHcKwPreview();

    body.querySelector('#rowChargerData')!.addEventListener('click', () => hcOverlay.classList.add('open'));
    body.querySelector('#hcClose')!.addEventListener('click', () => hcOverlay.classList.remove('open'));
    hcOverlay.addEventListener('click', (e) => {
      if (e.target === hcOverlay) hcOverlay.classList.remove('open');
    });
    hcAmpsInput.addEventListener('input', updateHcKwPreview);
    hcVoltsInput.addEventListener('input', updateHcKwPreview);
    hcAmpsInput.addEventListener('change', () => {
      void setSetting(SETTING_KEY_MAP.homeChargerAmps, hcAmpsInput.value);
    });
    hcVoltsInput.addEventListener('change', () => {
      void setSetting(SETTING_KEY_MAP.homeChargerVolts, hcVoltsInput.value);
    });

    // ---- Ubicación de Casa ----
    const locOverlay = body.querySelector<HTMLElement>('#locOverlay')!;
    const locStateEl = body.querySelector<HTMLElement>('#locState')!;
    const locMsg = body.querySelector<HTMLElement>('#locMsg')!;
    let homeLat = settings.homeLat;
    let homeLng = settings.homeLng;

    function renderLocState(): void {
      locStateEl.innerHTML =
        homeLat != null && homeLng != null
          ? `<p style="font-size:calc(13px * var(--font-scale));color:var(--text);margin:0 0 6px;"><b>Guardada</b> · ${homeLat.toFixed(4)}, ${homeLng.toFixed(4)}</p><button class="link-btn" id="locClear" style="color:var(--critical);">Borrar ubicación</button>`
          : `<p style="font-size:calc(13px * var(--font-scale));color:var(--text-secondary);margin:0;">Sin guardar todavía.</p>`;
      locStateEl.querySelector<HTMLButtonElement>('#locClear')?.addEventListener('click', () => {
        void (async () => {
          homeLat = null;
          homeLng = null;
          await setSetting(SETTING_KEY_MAP.homeLat, '');
          await setSetting(SETTING_KEY_MAP.homeLng, '');
          renderLocState();
        })();
      });
    }
    renderLocState();

    body.querySelector('#rowHomeLocation')!.addEventListener('click', () => locOverlay.classList.add('open'));
    body.querySelector('#locClose')!.addEventListener('click', () => locOverlay.classList.remove('open'));
    locOverlay.addEventListener('click', (e) => {
      if (e.target === locOverlay) locOverlay.classList.remove('open');
    });
    body.querySelector('#locUseCurrent')!.addEventListener('click', () => {
      void (async () => {
        try {
          // @capacitor/geolocation en vez de navigator.geolocation directo: en el build nativo
          // (Capacitor/WKWebView) la API web de geolocalización no dispara el permiso de iOS de
          // forma confiable — hacía que el botón no hiciera nada. El plugin también funciona en
          // el build web (PWA), así que reemplaza el uso directo del navegador en los dos casos.
          const pos = await Geolocation.getCurrentPosition();
          homeLat = pos.coords.latitude;
          homeLng = pos.coords.longitude;
          await setSetting(SETTING_KEY_MAP.homeLat, String(homeLat));
          await setSetting(SETTING_KEY_MAP.homeLng, String(homeLng));
          renderLocState();
          showBanner(locMsg, 'Ubicación guardada.', 'success');
        } catch (err) {
          showBanner(locMsg, 'No se pudo obtener la ubicación: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      })();
    });

    // ---- Personalización ----
    let pznConfig: PersonalizacionConfig = { ...settings.personalizacion };

    function updatePreviewDots(): void {
      [body.querySelector<HTMLElement>('#pznPreviewDot'), body.querySelector<HTMLElement>('#pznPreviewDot2')].forEach((dot) => {
        if (dot) dot.style.background = `linear-gradient(135deg, hsl(${pznConfig.hue} 70% 50%), hsl(${pznConfig.hue2} 70% 50%))`;
      });
      pznDot.style.background = `linear-gradient(135deg, hsl(${pznConfig.hue} 70% 50%), hsl(${pznConfig.hue2} 70% 50%))`;
    }

    async function applyAndPersist(): Promise<void> {
      applyPersonalizacion(pznConfig);
      updatePreviewDots();
      await setSetting(SETTING_KEY_MAP.personalizacion, JSON.stringify(pznConfig));
    }

    // Aplica lo que ya estaba guardado (o migrado desde accentColor) al arrancar esta pantalla.
    updatePreviewDots();

    const pznOverlay = body.querySelector<HTMLElement>('#pznOverlay')!;
    const pznListStep = body.querySelector<HTMLElement>('#pznListStep')!;
    const pznDetailStep = body.querySelector<HTMLElement>('#pznDetailStep')!;
    const pznDetailBody = body.querySelector<HTMLElement>('#pznDetailBody')!;
    const pznTitle = body.querySelector<HTMLElement>('#pznTitle')!;

    body.querySelector('#rowPersonalizacion')!.addEventListener('click', () => {
      pznListStep.style.display = 'block';
      pznDetailStep.style.display = 'none';
      pznTitle.textContent = 'Personalización';
      pznOverlay.classList.add('open');
    });
    body.querySelector('#pznClose')!.addEventListener('click', () => pznOverlay.classList.remove('open'));
    pznOverlay.addEventListener('click', (e) => {
      if (e.target === pznOverlay) pznOverlay.classList.remove('open');
    });
    body.querySelector('#pznBack')!.addEventListener('click', () => {
      pznListStep.style.display = 'block';
      pznDetailStep.style.display = 'none';
      pznTitle.textContent = 'Personalización';
    });

    function openDetail(name: string, html: string, wire: () => void): void {
      pznTitle.textContent = name;
      pznDetailBody.innerHTML = html;
      wire();
      pznListStep.style.display = 'none';
      pznDetailStep.style.display = 'block';
    }

    body.querySelectorAll<HTMLButtonElement>('.pzn-catrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (cat === 'color') openColorDetail();
        else if (cat === 'tipografia') openTipografiaDetail();
        else if (cat === 'forma') openFormaDetail();
        else if (cat === 'fondo') openFondoDetail();
        else if (cat === 'pantallas') openPantallasDetail();
      });
    });

    // ---- Color ----
    function openColorDetail(): void {
      const presetsHtml = PRESETS.map(
        (p) =>
          `<button class="chip" type="button" data-preset="${p.id}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px;background:linear-gradient(135deg, hsl(${p.hue} 70% 50%), hsl(${p.hue2} 70% 50%));"></span>${p.name}</button>`
      ).join('');
      const html = `
        <p class="pzn-sectlabel">Presets rápidos</p>
        <div class="chip-row" id="pznPresetRow" style="margin-bottom:16px;">${presetsHtml}</div>
        <p class="pzn-sectlabel">Acento principal (botones, tab, FAB)</p>
        <div class="pzn-swatchrow"><div class="pzn-swatch" id="pznHueSwatch"></div><input class="pzn-slider" id="pznHueSlider" type="range" min="0" max="359"></div>
        <div class="settings-row" style="padding:0 0 12px;"><span class="lbl">Vincular color secundario</span><button class="switch" id="pznLinkToggle"></button></div>
        ${chipRowHtml('pznHarmonyRow', [
          { value: '180', label: 'Complementario' },
          { value: '40', label: 'Análogo' },
          { value: '120', label: 'Triádico' },
        ])}
        <p class="pzn-sectlabel">Acento secundario (aurora)</p>
        <div class="pzn-swatchrow"><div class="pzn-swatch" id="pznHue2Swatch"></div><input class="pzn-slider" id="pznHue2Slider" type="range" min="0" max="359"></div>
        <div class="pzn-contrast" id="pznContrastBadge"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="pznContrastText"></span></div>
      `;
      openDetail('Color', html, () => {
        const hueSlider = pznDetailBody.querySelector<HTMLInputElement>('#pznHueSlider')!;
        const hue2Slider = pznDetailBody.querySelector<HTMLInputElement>('#pznHue2Slider')!;
        const hueSwatch = pznDetailBody.querySelector<HTMLElement>('#pznHueSwatch')!;
        const hue2Swatch = pznDetailBody.querySelector<HTMLElement>('#pznHue2Swatch')!;
        const linkToggle = pznDetailBody.querySelector<HTMLButtonElement>('#pznLinkToggle')!;
        const contrastText = pznDetailBody.querySelector<HTMLElement>('#pznContrastText')!;
        const harmonyRow = wireChipRow(pznDetailBody, 'pznHarmonyRow', () => String(pznConfig.harmony), (v) => {
          pznConfig.harmony = Number(v) as PersonalizacionConfig['harmony'];
          if (pznConfig.linked) {
            pznConfig.hue2 = (pznConfig.hue + pznConfig.harmony) % 360;
            void applyAndPersist();
            syncColor();
          }
        });

        function syncColor(): void {
          hueSlider.value = String(pznConfig.hue);
          hueSwatch.style.background = `hsl(${pznConfig.hue} 76% 50%)`;
          hue2Slider.value = String(pznConfig.hue2);
          hue2Swatch.style.background = `hsl(${pznConfig.hue2} 76% 50%)`;
          hue2Slider.disabled = pznConfig.linked;
          hue2Slider.style.opacity = pznConfig.linked ? '0.4' : '1';
          linkToggle.classList.toggle('on', pznConfig.linked);
          harmonyRow.sync();
          pznDetailBody.querySelectorAll('#pznPresetRow button').forEach((b) => {
            const p = PRESETS.find((pr) => pr.id === b.getAttribute('data-preset'));
            b.classList.toggle('sel', !!p && p.hue === pznConfig.hue && p.hue2 === pznConfig.hue2);
          });
          const { s, l } = getCurrentAccentSL();
          const c = pickTextOnAccent(pznConfig.hue, s, l);
          contrastText.textContent = `Contraste seguro (${c.ratio.toFixed(1)}:1) — texto ${c.isDark ? 'oscuro' : 'claro'} sobre el acento`;
        }

        hueSlider.addEventListener('input', () => {
          pznConfig.hue = Number(hueSlider.value);
          if (pznConfig.linked) pznConfig.hue2 = (pznConfig.hue + pznConfig.harmony) % 360;
          void applyAndPersist();
          syncColor();
        });
        hue2Slider.addEventListener('input', () => {
          pznConfig.hue2 = Number(hue2Slider.value);
          void applyAndPersist();
          syncColor();
        });
        linkToggle.addEventListener('click', () => {
          pznConfig.linked = !pznConfig.linked;
          if (pznConfig.linked) pznConfig.hue2 = (pznConfig.hue + pznConfig.harmony) % 360;
          void applyAndPersist();
          syncColor();
        });
        pznDetailBody.querySelectorAll<HTMLButtonElement>('#pznPresetRow button').forEach((btn) => {
          btn.addEventListener('click', () => {
            const p = PRESETS.find((pr) => pr.id === btn.dataset.preset)!;
            pznConfig.hue = p.hue;
            pznConfig.hue2 = p.hue2;
            pznConfig.linked = false;
            void applyAndPersist();
            syncColor();
          });
        });
        syncColor();
      });
    }

    // ---- Tipografía ----
    function openTipografiaDetail(): void {
      const html = `
        <p class="pzn-sectlabel">Escala de tamaño</p>
        ${chipRowHtml('pznScaleRow', [
          { value: 'compacta', label: 'Compacta' },
          { value: 'estandar', label: 'Estándar' },
          { value: 'grande', label: 'Grande' },
        ])}
        <p class="pzn-sectlabel">Peso de los números grandes</p>
        ${chipRowHtml('pznWeightRow', [
          { value: 'regular', label: 'Regular' },
          { value: 'semibold', label: 'Semibold' },
        ])}
      `;
      openDetail('Tipografía', html, () => {
        const scaleRow = wireChipRow(pznDetailBody, 'pznScaleRow', () => pznConfig.fontScale, (v) => {
          pznConfig.fontScale = v as PersonalizacionConfig['fontScale'];
          void applyAndPersist();
        });
        const weightRow = wireChipRow(pznDetailBody, 'pznWeightRow', () => pznConfig.numberWeight, (v) => {
          pznConfig.numberWeight = v as PersonalizacionConfig['numberWeight'];
          void applyAndPersist();
        });
        scaleRow.sync();
        weightRow.sync();
      });
    }

    // ---- Forma y contenedores ----
    function openFormaDetail(): void {
      const html = `
        <p class="pzn-sectlabel">Forma del botón principal</p>
        ${chipRowHtml('pznFormaRow', [
          { value: 'plano', label: 'Plano' },
          { value: 'suave', label: 'Suave' },
          { value: 'profundo', label: 'Profundo' },
          { value: 'vivo', label: 'Vivo' },
        ])}
        <p class="pzn-sectlabel">Contenedores</p>
        ${chipRowHtml('pznContenedoresRow', [
          { value: 'solido', label: 'Sólido' },
          { value: 'sin', label: 'Sin bordes' },
          { value: 'contorno', label: 'Contorno' },
        ])}
        <p class="pzn-sectlabel">Esquinas</p>
        <div class="pzn-slider-row"><div class="top"><span>Rectas ↔ redondeadas</span><span id="pznRadiusVal"></span></div><input class="pzn-slider" id="pznRadiusSlider" type="range" min="50" max="150"></div>
      `;
      openDetail('Forma y contenedores', html, () => {
        const formaRow = wireChipRow(pznDetailBody, 'pznFormaRow', () => pznConfig.forma, (v) => {
          pznConfig.forma = v as PersonalizacionConfig['forma'];
          void applyAndPersist();
        });
        const contRow = wireChipRow(pznDetailBody, 'pznContenedoresRow', () => pznConfig.contenedores, (v) => {
          pznConfig.contenedores = v as PersonalizacionConfig['contenedores'];
          void applyAndPersist();
        });
        const radiusSlider = pznDetailBody.querySelector<HTMLInputElement>('#pznRadiusSlider')!;
        const radiusVal = pznDetailBody.querySelector<HTMLElement>('#pznRadiusVal')!;
        radiusSlider.addEventListener('input', () => {
          pznConfig.radiusScale = Number(radiusSlider.value) / 100;
          radiusVal.textContent = `${radiusSlider.value}%`;
          void applyAndPersist();
        });
        radiusSlider.value = String(Math.round(pznConfig.radiusScale * 100));
        radiusVal.textContent = `${radiusSlider.value}%`;
        formaRow.sync();
        contRow.sync();
      });
    }

    // ---- Fondo animado ----
    function openFondoDetail(): void {
      const html = `
        <p class="pzn-sectlabel">Intensidad de la aurora</p>
        <div class="pzn-slider-row"><div class="top"><span>Opacidad de los blobs</span><span id="pznAuroraVal"></span></div><input class="pzn-slider" id="pznAuroraSlider" type="range" min="0" max="70"></div>
        <p class="pzn-sectlabel">Velocidad</p>
        ${chipRowHtml('pznSpeedRow', [
          { value: 'rapido', label: 'Vivo' },
          { value: 'normal', label: 'Normal' },
          { value: 'apagado', label: 'Apagado' },
        ])}
      `;
      openDetail('Fondo animado', html, () => {
        const auroraSlider = pznDetailBody.querySelector<HTMLInputElement>('#pznAuroraSlider')!;
        const auroraVal = pznDetailBody.querySelector<HTMLElement>('#pznAuroraVal')!;
        auroraSlider.addEventListener('input', () => {
          pznConfig.auroraIntensidad = Number(auroraSlider.value);
          auroraVal.textContent = `${pznConfig.auroraIntensidad}%`;
          void applyAndPersist();
        });
        auroraSlider.value = String(pznConfig.auroraIntensidad);
        auroraVal.textContent = `${pznConfig.auroraIntensidad}%`;
        const speedRow = wireChipRow(pznDetailBody, 'pznSpeedRow', () => pznConfig.auroraVelocidad, (v) => {
          pznConfig.auroraVelocidad = v as PersonalizacionConfig['auroraVelocidad'];
          void applyAndPersist();
        });
        speedRow.sync();
      });
    }

    // ---- Íconos y alerta ----
    function openPantallasDetail(): void {
      const alertChips = ALERT_COLOR_CHOICES.map(
        (a) => `<button class="chip" type="button" data-value="${a.hex}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px;background:${a.hex};"></span>${a.name}</button>`
      ).join('');
      const html = `
        <p class="pzn-sectlabel">Íconos</p>
        ${chipRowHtml('pznIconsRow', [
          { value: 'contorno', label: 'Contorno' },
          { value: 'relleno', label: 'Con relleno' },
        ])}
        <p class="pzn-sectlabel">Color de alerta</p>
        <p class="empty-hint" style="font-size:calc(12px * var(--font-scale));color:var(--text-muted);margin:0 0 10px;">Curado, no libre — tiene que seguir leyéndose como alerta.</p>
        <div class="chip-row" id="pznAlertRow" style="margin-bottom:16px;">${alertChips}</div>
      `;
      openDetail('Íconos y alerta', html, () => {
        const iconsRow = wireChipRow(pznDetailBody, 'pznIconsRow', () => pznConfig.iconos, (v) => {
          pznConfig.iconos = v as PersonalizacionConfig['iconos'];
          void applyAndPersist();
        });
        const alertRow = body.querySelector<HTMLElement>('#pznAlertRow')!;
        alertRow.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
          btn.addEventListener('click', () => {
            pznConfig.alertColor = btn.dataset.value!;
            void applyAndPersist();
            syncAlert();
          });
        });
        function syncAlert(): void {
          alertRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.getAttribute('data-value')?.toLowerCase() === pznConfig.alertColor.toLowerCase()));
        }
        iconsRow.sync();
        syncAlert();
      });
    }

    // ---- Sheet: Exportar / Importar backup ----
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
          themeSelect.value = settings.theme;
          applyTheme(settings.theme);
          pznConfig = { ...settings.personalizacion };
          applyPersonalizacion(pznConfig);
          updatePreviewDots();
        } catch (err) {
          showBanner(dataMsg, 'No se pudo importar: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      })();
    });

    body.querySelector('#rowWipe')!.addEventListener('click', () => {
      void (async () => {
        if (!confirm('¿Borrar todos los datos cargados? Esta acción no se puede deshacer. Las tarifas y la personalización no se tocan.')) return;
        await wipeData();
        notifyChargesUpdated();
        showBanner(dataMsg, 'Datos borrados.', 'success');
      })();
    });
  },
};
