import './styles/tokens.css';
import './styles/shell.css';
import { injectIconSprite } from './components/icons';
import { mountShell } from './components/shell';
import { inicioScreen } from './screens/inicio';
import { cargasScreen } from './screens/cargas';
import { vehiculoScreen } from './screens/vehiculo';
import { ajustesScreen } from './screens/ajustes';

injectIconSprite();

const app = document.querySelector<HTMLDivElement>('#app')!;
mountShell(app, [inicioScreen, cargasScreen, vehiculoScreen, ajustesScreen]);
