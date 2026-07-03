import type { Screen } from './types';

export const vehiculoScreen: Screen = {
  id: 'vehiculo',
  render() {
    return `
      <div class="nav-title">Vehículo</div>
      <p style="color:var(--text-secondary);font-size:14px;">
        Specs del vehículo — pendiente de integración con la API externa.
      </p>
    `;
  },
};
