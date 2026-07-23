import type { Screen, ScreenId } from '../screens/types';
import { nuevaCargaMarkup, mountNuevaCarga } from './nueva-carga';

const TAB_ICON: Record<ScreenId, string> = {
  inicio: 'i-home',
  cargas: 'i-list',
  vehiculo: 'i-car',
  ajustes: 'i-gear',
};
const TAB_LABEL: Record<ScreenId, string> = {
  inicio: 'Inicio',
  cargas: 'Cargas',
  vehiculo: 'Vehículo',
  ajustes: 'Ajustes',
};

export function mountShell(root: HTMLElement, screens: Screen[]): void {
  const screensHtml = screens
    .map((s) => `<div class="screen" data-screen="${s.id}">${s.render()}</div>`)
    .join('');

  const tabsHtml = screens
    .map(
      (s, i) => `
      <button class="tab" data-tab="${s.id}" data-i="${i}">
        <svg><use href="#${TAB_ICON[s.id]}"/></svg>
        ${TAB_LABEL[s.id]}
      </button>`
    )
    .join('');

  root.innerHTML = `
    ${screensHtml}
    <div class="tabbar"><div class="tab-slider" id="tabSlider"></div>${tabsHtml}</div>
    ${nuevaCargaMarkup()}
  `;

  const screenEls = root.querySelectorAll<HTMLElement>('.screen');
  const tabEls = root.querySelectorAll<HTMLButtonElement>('.tab');
  const tabbarEl = root.querySelector<HTMLElement>('.tabbar')!;
  const tabSlider = root.querySelector<HTMLElement>('#tabSlider')!;
  const fabEl = root.querySelector<HTMLElement>('#fab')!;

  /**
   * Posición en píxeles reales, no en porcentaje: `translateX(N%)` se resuelve contra el ancho
   * del propio slider (que mide `25% - 6px`, no un cuarto exacto del tabbar), así que un
   * porcentaje arrastraba un error acumulado — más notorio cuanto más a la derecha el tab.
   */
  function positionSlider(tabEl: HTMLElement) {
    const barRect = tabbarEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    tabSlider.style.width = `${tabRect.width}px`;
    tabSlider.style.transform = `translateX(${tabRect.left - barRect.left}px)`;
  }

  function activate(id: ScreenId) {
    screenEls.forEach((el) => el.classList.toggle('active', el.dataset.screen === id));
    tabEls.forEach((el) => el.classList.toggle('active', el.dataset.tab === id));
    // Inicio ya tiene sus propios botones "Cargar ahora" / "Carga programada" en el hero —
    // el FAB global queda de más ahí (redundante) y solo hace falta en el resto de las
    // pestañas, donde sigue siendo la única forma de agregar una carga.
    fabEl.style.display = id === 'inicio' ? 'none' : '';
    const activeTab = [...tabEls].find((el) => el.dataset.tab === id);
    if (activeTab) positionSlider(activeTab);
  }

  tabEls.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab as ScreenId));
  });

  window.addEventListener('resize', () => {
    const current = [...tabEls].find((el) => el.classList.contains('active'));
    if (current) positionSlider(current);
  });

  screens.forEach((s) => {
    const el = root.querySelector<HTMLElement>(`.screen[data-screen="${s.id}"]`);
    if (el && s.mount) s.mount(el);
  });

  mountNuevaCarga(root);

  activate(screens[0].id);
}
