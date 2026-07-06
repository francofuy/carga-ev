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
  const tabSlider = root.querySelector<HTMLElement>('#tabSlider')!;

  function activate(id: ScreenId) {
    screenEls.forEach((el) => el.classList.toggle('active', el.dataset.screen === id));
    tabEls.forEach((el) => el.classList.toggle('active', el.dataset.tab === id));
    const activeTab = [...tabEls].find((el) => el.dataset.tab === id);
    if (activeTab) tabSlider.style.transform = `translateX(${Number(activeTab.dataset.i) * 100}%)`;
  }

  tabEls.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab as ScreenId));
  });

  screens.forEach((s) => {
    const el = root.querySelector<HTMLElement>(`.screen[data-screen="${s.id}"]`);
    if (el && s.mount) s.mount(el);
  });

  mountNuevaCarga(root);

  activate(screens[0].id);
}
