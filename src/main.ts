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
import { applyPersonalizacion } from './lib/personalizacion';
import { preventZoomGestures } from './lib/no-zoom';
import { initGlobalRipple } from './lib/ripple';
import { LocalNotifications } from '@capacitor/local-notifications';
import { requestOpenProgramar } from './lib/bus';

injectIconSprite();
preventZoomGestures();

// La notificación de "llegaste a Casa" (HomeGeofenceManager.swift) se dispara nativamente, no vía
// el JS de notifications.ts — pero @capacitor/local-notifications igual se entera de que la
// tocaron, porque su plugin nativo es el UNUserNotificationCenterDelegate para TODA la app, no
// solo para las notificaciones que él mismo programó.
void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
  if (action.notification.extra?.openProgramar) requestOpenProgramar();
});

const app = document.querySelector<HTMLDivElement>('#app')!;
mountShell(app, [inicioScreen, cargasScreen, vehiculoScreen, ajustesScreen]);
initGlobalRipple(app);

void getSettings()
  .then((s) => {
    applyTheme(s.theme);
    applyPersonalizacion(s.personalizacion);
  })
  .catch(() => {
    /* si falla, se queda en automático (comportamiento por defecto de tokens.css) */
  });
