# Carga EV — Contexto del proyecto

PWA personal (sin backend) para registrar cargas de un vehículo eléctrico en Uruguay y calcular
su costo real según la tarifa Residencial Triple Horaria de UTE. Uso individual, un solo usuario,
un solo vehículo (GAC Aion UT Max, 60 kWh).

Repo: https://github.com/francofuy/carga-ev (público)
Live: https://francofuy.github.io/carga-ev/

## Cómo se construyó (metodología usada con Claude Code)

Se siguió un proceso de diseño en 15 fases, gateado — no se avanzaba a la siguiente sin validar
la anterior:

1. Descubrimiento → 2. Objetivos → 3. Usuarios → 4. Casos de uso → 5. Funcionalidades →
6. Arquitectura → 7. Flujos → 8. Wireframes → 9. Sistema de diseño → 10. UI alta fidelidad →
11. Microinteracciones → 12. Animaciones → 13. Prototipo navegable → 14. Validación → 15. Desarrollo real.

Cada fase visual (8 a 13) se hizo primero como **wireframe/mockup con la skill `artifact-design`**
publicado como Artifact, se revisó y aprobó, y **recién después** se aplicó al código real. Esta
regla ("wireframe primero, código después, nada se aplica sin aprobación explícita") es la
preferencia de trabajo más importante del usuario en este proyecto — se mantuvo incluso para
agregados chicos post-lanzamiento (ver "Labs visuales" abajo).

Artifacts generados durante el diseño (URLs de esta sesión de Claude, pueden no persistir para
siempre ni ser accesibles desde otra cuenta):
- Fase 8 (wireframes grises): `de442bae-56c5-43ab-b3a3-cff7d5e70f4b`
- Fase 9 (sistema de diseño): `ac763029-ee2d-47dd-b47e-a839e0d62474`
- Fase 10 (UI alta fidelidad): `b92156c3-4688-4d00-abf7-00c52d9ad43e`
- Fase 11 (microinteracciones): `bf200dd2-c560-4f74-bfb4-4bb8dad7d373`
- Fase 12 (animaciones): `838d810f-814e-400d-9a67-57eab10164d8`
- Fase 13 (prototipo navegable): `740ca4ff-7e14-4265-9460-ce6df5c323e2`
- Wireframe "carga por % de batería": `78055cb9-aa47-4bbb-b432-929661a9ad41`
- Wireframe "editar carga + consumo real": `c6b3a9d1-ffa2-4fe6-8962-77218341af2b`
- Lab visual (aurora, botones, personalización, etc.): `20b4cdea-fb04-457d-8622-dbe0aae16aaa`
- Lab estilos nuevos + temática eléctrica: `5462412d-4886-4223-ad2d-9cba2eafa673`

(URL completa: `https://claude.ai/code/artifact/<id>`)

## Stack técnico

- **Vite + TypeScript vanilla** — sin framework (React/Vue/etc.), a propósito: proyecto chico,
  un solo desarrollador (Claude + usuario), sin necesidad de la complejidad de un framework.
- **SQLite** vía `@sqlite.org/sqlite-wasm`, VFS **`opfs-sahpool`**, corriendo en un **Worker
  dedicado** (`src/lib/db/worker.ts`) — nunca en el hilo principal.
- **PWA** vía `vite-plugin-pwa`, instalable desde Safari, funciona 100% offline.
- **Sin backend propio** — todo el dato vive en OPFS del dispositivo.
- **Deploy**: GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages.

## Decisiones clave y por qué (para no repreguntarlas ni revertirlas sin querer)

- **PWA en vez de app nativa**: el usuario no tiene Mac/Xcode disponible.
- **`opfs-sahpool` en vez del VFS `opfs` estándar**: no exige headers `Cross-Origin-Opener/Embedder-Policy`
  ni un hosting especial — funciona en cualquier estático (GitHub Pages incluido).
- **SQLite corre en un Worker, no en el hilo principal**: Safari (a diferencia de Chrome) solo
  permite `createSyncAccessHandle` dentro de un Worker. Este fue un bug real encontrado en producción
  ("Missing required OPFS APIs" en iPhone) — ver sección de bugs.
- **Deploy vía GitHub Actions, no el build "legacy" de Pages**: el legacy quedaba atascado en
  "building" o fallaba sin motivo claro; Actions es instantáneo (~30s) y confiable.
- **Colores Valle/Llano/Punta separados del acento de marca**: verde/ámbar/rojo son semánticos
  (comunican "barato/medio/caro"), nunca deben confundirse con el color de marca elegible por el
  usuario.
- **SF Symbols descartado**: su licencia es para apps nativas vía Xcode, no para uso libre en una
  PWA. Se usa un set de íconos propio dibujado a mano (no son trazados de Apple ni de terceros).
- **Búsqueda de vehículo por API descartada**: se evaluaron EV Database (de pago), OpenEV Data (su
  API no resuelve en DNS, no está realmente online) y API Ninjas (funciona, pero no tiene ninguna
  marca GAC en su base — confirmado buscando "GAC" solo, sin resultados). Vehículo quedó con carga
  manual, precargada con las specs reales del GAC Aion UT Max (60 kWh, 135 Wh/km, fuente: Autoblog
  Uruguay).
- **Rive elegido sobre Lottie** para una futura ilustración de estado vacío: motor WASM más liviano,
  soporta máquinas de estado, sin backend. Lottie/dotLottie se evaluaron pero no se integraron (ver
  Labs visuales).
- **Motor de tarifas**: clasifica minuto a minuto (Valle 00-07 todos los días; Punta 4 horas
  elegidas por el usuario entre 17-23, solo días hábiles; Llano el resto). Editar tarifas en Ajustes
  **no recalcula el histórico** — cada carga guarda el costo con la tarifa vigente al momento de
  guardarla (o de editarla, ver siguiente punto).
- **Editar una carga recalcula con las tarifas de HOY**, no las vigentes cuando se registró
  originalmente (no se guarda "qué tarifa regía" en cada carga, solo el resultado).
- **Consumo real del vehículo**: se calcula "de carga a carga" con odómetro — misma lógica que
  medir consumo de nafta entre tanque y tanque. Aproximación conocida y aceptada: no separa
  pérdidas de carga.
- **Acento personalizable**: `--accent-soft` y `--accent-pressed` se derivan de `--accent` vía
  `color-mix()` en `tokens.css`, así que cambiar un solo valor (el setting `accent_color`) repinta
  toda la paleta derivada sin tocar el resto de los tokens.

## Funcionalidades implementadas (real, en producción)

- Registro de carga en Casa (con motor de tarifas) o Público (tarifa manual), por **kWh directo o
  por % de batería** (usa la capacidad del vehículo guardado).
- **Carga pública con red y cargo fijo**: se elige la red (UTE, eOne, DMC, Evergo, Otro); con UTE
  se abre solo el campo "Cargo fijo" (estatal, cobra fijo por sesión), en el resto queda disponible
  vía "+ Agregar cargo fijo" por si algún día cambia. La red se guarda con la carga y reemplaza el
  genérico "Manual" en las listas. Columnas `fixed_fee`/`network` agregadas con migración
  (`ALTER TABLE ... ADD COLUMN`) para no perder datos ya guardados en el dispositivo.
- **Consumo en kWh/100km**: Vehículo muestra consumo homologado y real en kWh/100km (antes Wh/km) —
  la unidad estándar EV, comparable a simple vista. "Autonomía estimada" sigue siendo una sola fila
  (usa el consumo real cuando hay 2+ tramos con odómetro, si no cae al homologado) — se probó
  separarla en "homologada"/"real" y se revirtió por pedido explícito del usuario, ya alcanzaba con
  corregir la unidad. Fórmulas compartidas en `src/lib/consumption.ts` (`whKmToKwh100`,
  `autonomyKmFrom`, `estimatedAutonomyKm`).
- **Autonomía en Inicio**: primero se probó como 4º tile en la fila de $/kWh, % Valle y $/km, pero
  con 4 columnas los tiles no encogían parejo (flex `min-width:auto` por defecto) y la fila se salía
  de pantalla — fix real fue `min-width:0` en `.tile`, documentado por si vuelve a pasar en otra
  fila de tiles. Después, por pedido del usuario, se sacó de ahí: ahora "Gasto este mes" y
  "Autonomía" viven en una `.split-card` (una sola tarjeta, dividida por una línea interna en dos
  mitades) arriba de la fila de tiles, que volvió a tener 3 columnas cómodas. El gasto ya no ocupa
  todo el ancho para un número chico, y la fila de tiles no vuelve a apretarse.
- Editar y eliminar una carga existente (mismo sheet, reutilizado).
- Dashboard con gasto del mes, $/kWh promedio, % en Valle, $/km, tendencia de 6 meses, composición
  por franja horaria.
- Vehículo: specs manuales + consumo real calculado + autonomía estimada.
- Ajustes: tarifas editables, franja Punta propia, notificaciones, tema (claro/oscuro/automático),
  **color de acento personalizable** (5 presets), exportar/importar backup (JSON), borrar datos.
- PWA: bloqueo de zoom táctil (pinch y doble-tap), instalable, offline-first.
- **Recuperación de borrador**: si estás creando una carga nueva y tocás afuera del sheet o
  minimizás la app, el formulario se guarda en `localStorage` (`src/lib/draft.ts`) y aparece una
  tarjeta punteada arriba de la hero card en Inicio con "Continuar"/"Eliminar". Alcance deliberado:
  solo cargas nuevas, no ediciones — el botón "Cancelar" explícito descarta directo, no guarda
  (decisión del usuario). Disparadores: `visibilitychange` + `pagehide`, además del click fuera del
  overlay. Wireframe elegido: `825f36d7-f09a-4ca3-82c8-cb8398413abf` (versión 3, tarjeta de dashboard).
- Microinteracciones aplicadas: ripple global en botones, tab bar en isla flotante con pastilla
  deslizante, reveal animado del gráfico y la composición horaria, número "Gasto este mes" que
  rueda como odómetro, chispas sutiles al guardar una carga nueva, fondo aurora + chispitas fijas
  en Inicio.

## Bugs reales encontrados en producción (para no repetirlos)

- **"Missing required OPFS APIs" en iPhone**: causa real = SQLite corría en el hilo principal;
  Safari exige que `createSyncAccessHandle` corra en un Worker. Fix: mover toda la capa de datos a
  `worker.ts`.
- **Scroll horizontal / la app se podía arrastrar de costado**: el fondo `.aurora-bg` se extendía
  `-20%` más allá del borde sin que el contenedor lo recortara. Fix: `overflow-x: hidden` en
  `html` y en `.screen`.
- **Cuadro de foco negro nativo sobre los botones al tocar (iOS Safari)**: nunca se había
  desactivado el outline/tap-highlight por defecto del navegador. Fix: `-webkit-tap-highlight-color:
  transparent` global + `button:focus-visible { outline: none; }`.
- **La pastilla del tab bar quedaba corrida, peor cuanto más a la derecha el tab**: `translateX(N%)`
  se resuelve contra el ancho del **propio** elemento (25% − 6px), no contra un cuarto real del
  tabbar — el error se acumulaba tab por tab. Fix: posicionar con píxeles reales vía
  `getBoundingClientRect()` en vez de porcentaje.
- **Deploys de GitHub Actions fallan a veces con "Deployment failed, try again later"**: error
  transitorio de GitHub, no del código — reintentar (`gh run rerun <id> --failed`) resuelve.

## Labs visuales — decisiones NO aplicadas todavía (quedan como opciones abiertas)

Explorados y **descartados o pendientes de decisión explícita** — no tocar el código en base a
estos sin confirmar primero con el usuario:

- **Cards**: ninguna variante (glow de borde, tilt 3D) fue elegida.
- **Botones alternativos**: shimmer y borde animado en loop infinito se descartaron (cansan en un
  botón de uso diario); ripple sí se aplicó. Border-reactivo-al-tacto y magnético quedaron
  evaluados, no aplicados.
- **Lottie / dotLottie**: investigado (dotLottie = WASM, sin backend/API key, gran librería
  gratis en LottieFiles), pero no integrado — el CSP de los Artifacts bloquea probarlo en vivo ahí.
- **Rive Community + IconScout Finance Lottie packs**: evaluados como fuente de íconos/animaciones
  con temática financiera, no integrados.
- **Glassmorphism, Bento grid, Claymorphism, Neo-brutalismo, Texto cinético, Blob-morph, Patrón de
  circuito**: 7 direcciones de estilo completas, ninguna aplicada — ver el lab de "estilos nuevos".
  Neo-brutalismo y texto cinético se mostraron a propósito como contraste/descarte, no como
  recomendación.
- **Ideas con temática eléctrica** (Lordicon con íconos reales "Electric Car"/"Car Battery"/
  "Plug-in Electricity"/"Battery Charger", animación de "enchufar", chispa en forma de rayo, borde
  de corriente, LED de carga con pulso, batería como gauge real, cable desenchufado para estado
  vacío): investigadas y mockeadas, ninguna aplicada al código real.

## Preferencias de colaboración (para cualquier sesión futura, este proyecto u otro)

- **Nunca aplicar un cambio visual sin antes mostrarlo en un wireframe/lab y recibir aprobación
  explícita** — incluso para agregados chicos.
- Ser honesto sobre limitaciones técnicas reales (ej. el CSP de los Artifacts bloquea pedidos de
  red — no fingir una demo en vivo de algo que no se puede cargar).
- Investigar de verdad (WebSearch/WebFetch) antes de recomendar una herramienta o librería — no
  inventar nombres ni asumir que algo está disponible sin comprobarlo.
- Dar una opinión/veredicto honesto en cada opción mostrada, no solo variantes neutras.
- Verificar con `tsc --noEmit` y `npm run build` antes de cada deploy.
- Usuario de nivel técnico avanzado — no hace falta explicar conceptos básicos de programación.

## Estructura de carpetas

```
Franco/
  apps-celular/
    Electrico/              ← este proyecto (migrado acá el 2026-07-06)
    Surtido y Cuentas/      ← proyecto nuevo, carpeta vacía, por definir
```

Nota: puede quedar un duplicado en `Franco/Electrico` (ruta vieja, pre-migración) — no se pudo
borrar porque la sesión de Claude Code que hizo la migración lo tenía como directorio de trabajo
raíz. Se puede borrar a mano una vez cerrada esa sesión.
