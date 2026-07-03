import type { Screen } from './types';

export const cargasScreen: Screen = {
  id: 'cargas',
  render() {
    return `
      <div class="nav-title">Cargas</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Historial de cargas — pendiente de la capa de datos.
      </p>
    `;
  },
};
