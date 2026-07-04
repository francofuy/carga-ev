import './styles/tokens.css';
import './styles/shell.css';
import { injectIconSprite } from './components/icons';
import { mountShell } from './components/shell';
import { inicioScreen } from './screens/inicio';
import { cargasScreen } from './screens/cargas';
import { vehiculoScreen } from './screens/vehiculo';
import { ajustesScreen } from './screens/ajustes';
import { getSettings } from './lib/db/api';
import { applyTheme } from './lib/theme';
import { preventZoomGestures } from './lib/no-zoom';

injectIconSprite();
preventZoomGestures();

const app = document.querySelector<HTMLDivElement>('#app')!;
mountShell(app, [inicioScreen, cargasScreen, vehiculoScreen, ajustesScreen]);

void getSettings()
  .then((s) => applyTheme(s.theme))
  .catch(() => {
    /* si falla, se queda en automático (comportamiento por defecto de tokens.css) */
  });
