import type { Screen } from './types';

export const ajustesScreen: Screen = {
  id: 'ajustes',
  render() {
    return `
      <div class="nav-title">Ajustes</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Tarifas, notificaciones y backup — pendiente de la capa de datos.
      </p>
    `;
  },
};
