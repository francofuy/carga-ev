import './styles/tokens.css';
import './styles/shell.css';
import { injectIconSprite } from './components/icons';
import { mountShell } from './components/shell';
import { inicioScreen } from './screens/inicio';
import { cargasScreen } from './screens/cargas';
import { vehiculoScreen } from './screens/vehiculo';
import { ajustesScreen } from './screens/ajustes';
import { getSettings } from './lib/db/api';
import { applyTheme, applyAccentColor } from './lib/theme';
import { preventZoomGestures } from './lib/no-zoom';
import { initGlobalRipple } from './lib/ripple';

injectIconSprite();
preventZoomGestures();

const app = document.querySelector<HTMLDivElement>('#app')!;
mountShell(app, [inicioScreen, cargasScreen, vehiculoScreen, ajustesScreen]);
initGlobalRipple(app);

void getSettings()
  .then((s) => {
    applyTheme(s.theme);
    applyAccentColor(s.accentColor);
  })
  .catch(() => {
    /* si falla, se queda en automático (comportamiento por defecto de tokens.css) */
  });
