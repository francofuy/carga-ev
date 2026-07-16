# Retomar — laboratorio de diseño y exploración (no aplicado a producción)

Este archivo existe para que puedas clonar el repo en **otra PC** y seguir exactamente donde
quedamos. Todo lo de esta carpeta (`design-lab/`) es exploración — **nada de esto está en
`src/`, nada afecta la app real desplegada**. Los `.html` de acá son prototipos autocontenidos:
se abren directo con doble clic / en el navegador, no necesitan `npm install` ni build.

Última actualización: 2026-07-15.

## Estado actual — LEER PRIMERO

Estamos en medio de un **rediseño visual completo de la app**, a pedido explícito del usuario:
"agarrá la app ENTERA... y dame una versión TOTALMENTE DIFERENTE... sin tener en cuenta nada de
lo hecho... todo en wireframes, sin subir nada a prod". Es la segunda vuelta de este pedido — la
primera (`prototipo-bento-inicio.html`, `prototipo-completo.html`, `wireframe-3-skills*.html`,
**no incluidos en esta carpeta a propósito**) fue rechazada explícitamente por el usuario ("no me
gustó nada, simplemente olvidá lo que hicimos"). No retomar esa dirección sin que el usuario la
pida de nuevo.

**El prototipo vigente es `rediseno-instrumento.html`.** Concepto: "Instrumento de medición" (el
teléfono como un instrumento midiendo electricidad — dos canales de dato, números
monoespaciados) ejecutado con **materiales reales de Apple** (glass/blur, colores de sistema
HIG, spring easing) en vez de un panel de laboratorio literal.

**Último feedback del usuario, sin resolver:** *"despues seguiremos refinando todo con respecto
a los estilos, ya que no me convencieron del todo."* — la dirección visual actual (v5) **no está
aprobada ni cerrada**. La próxima sesión debería arrancar preguntando qué específicamente no
convenció (¿paleta? ¿los materiales glass? ¿la tipografía? ¿la densidad?) antes de seguir
agregando contenido nuevo — hay bastante volumen ya (13 etapas) y puede que lo que haga falta sea
refinar lo que existe, no sumar más.

## Cómo continuar en la otra PC

1. `git clone` del repo (ya incluye esta carpeta).
2. Abrir `design-lab/rediseno-instrumento.html` directo en el navegador para ver el estado actual.
3. Decirle a Claude algo como: *"Retomá el rediseño en design-lab/rediseno-instrumento.html, leé
   design-lab/RETOMAR.md para contexto"* — con eso alcanza para seguir sin repetir explicaciones.

## Qué contiene `rediseno-instrumento.html` (13 etapas)

| # | Etapa | Contenido |
|---|-------|-----------|
| 01 | Plan de diseño | Paleta (colores de sistema Apple reales, no inventados), tipografía, layout — el porqué de cada elección |
| 02 | Componentes | Panel base (glass), botones, campos, tags/pills, tab bar |
| 03 | Color | Los 2 canales de dato + color de alerta, aplicados a los componentes |
| 04 | Animación | Números con rueda de dígitos, aguja de galga, LED pulsante, entradas con spring |
| 05 | Pantalla completa — Inicio | Con Dynamic Island, onda de corriente en vivo, gráfico de tendencia, lista con swipe |
| 06 | Momentos inmersivos | Dynamic Island compacta, Live Activity expandida, confirmación tipo check |
| 07 | **Acciones en vivo** | Simulador tocable del ciclo completo: iniciar → progreso → completar, con causa-efecto real (no loop pasivo) |
| 08 | Pantalla completa — Nueva carga | Banner de borrador recuperado, selector Privada/Pública, chips de red/variante, chip de potencia del cargador |
| 09 | Pantalla completa — Cargas | Historial agrupado por mes, swipe-to-delete |
| 10 | Pantalla completa — Vehículo | Consumo, galga de autonomía, ficha técnica |
| 11 | Pantalla completa — Ajustes | Lista de ajustes + detalle de Personalización (color, tipografía, forma, fondo animado) con controles nuevos (segmented, chips, toggle, slider estilo iOS) |
| 12 | Motor de estimación | Fórmula física (V×A×η), por qué la curva no es lineal (CC/CV de litio), cómo se calibra con el historial real del usuario |
| 13 | Widgets de pantalla de inicio | Pila cargándose (no anillo) y velocímetro con 3 zonas fijas por fase — con nota honesta de que WidgetKit real no anima continuo |

Controles interactivos de verdad en el prototipo (no solo visuales): segmented control, chips
seleccionables, toggle, y el simulador de la Etapa 07.

## Decisiones de diseño ya tomadas (no re-litigar sin motivo)

- **Colores de sistema reales de Apple (HIG, modo oscuro)**, no inventados:
  `#FF9F0A` naranja, `#30D158` verde, `#FF453A` rojo. Elegidos a propósito tras el pedido
  explícito "¿pueden tener enfoques más Apple?".
- **Negro real (#000) de fondo**, no gris oscuro — así se ve el modo oscuro de Apple en OLED.
- **SF Mono para números** (mismo patrón que Salud/Bolsa/Wallet de Apple), texto normal (no
  mayúsculas forzadas) para etiquetas.
- **Glass material** (`backdrop-filter: blur() saturate()`) sobre un resplandor ambiental de
  fondo — reinterpretación del recurso "aurora" que ya usa la app real hoy.
- **Spring easing** (`cubic-bezier(0.34, 1.56, 0.64, 1)` y variantes) en vez de transiciones
  mecánicas/lineales.
- El "instrumento" original quedó reducido a un detalle sutil (una muesca naranja en la esquina
  de cada panel), no todo el lenguaje visual — fue un ajuste deliberado tras el pedido de que se
  sintiera "más Apple" y menos panel de laboratorio.
- **Motor de estimación de carga (Etapa 12)**: la física es real y verificable (`kW = V × A × η`,
  η≈0.92 en AC), la curva se achata después de ~80% por el ciclo CC/CV real del litio, y la
  calibración con historial es una idea de aprendizaje simple (comparar kWh reales entregados en
  cargas pasadas del mismo cargador contra el teórico) — no hay ningún sensor real involucrado,
  todo es inferencia por tiempo transcurrido.
- **Widgets (Etapa 13)**: se descartó el anillo de progreso genérico a pedido explícito del
  usuario ("enfocá el diseño como una pila cargándose o un velocímetro") — las bandas de color
  de la pila/velocímetro representan las mismas 3 fases físicas del motor de estimación (no un
  degradé decorativo), sincronizadas en los mismos puntos de corte (15% / 85%).

## Ideas de features investigadas (separadas del lab visual, tampoco aplicadas)

Esto no es sobre estilos — es research de viabilidad técnica que puede ser útil para cuando el
diseño se cierre y se decida si construir algo real:

- **App nativa sin Mac**: SÍ es posible, 100% gratis, sin comprar/rentar una Mac. Camino
  verificado: **Codemagic** (build en Mac M2 en la nube, 500 min/mes gratis, se desarrolla local
  en Windows y solo se sube a la nube para compilar/firmar) + **AltStore/Sideloadly** (instalar
  el `.ipa` en el iPhone con Apple ID gratuito). Matiz importante: la firma *automática* de
  Codemagic requiere Developer Program pago ($99/año); con Apple ID gratis la firma es manual y
  expira cada 7 días. Detalle completo y actualizado en `CLAUDE.md` (sección "Decisiones clave",
  entrada "PWA en vez de app nativa").
- **Qué abre lo nativo, para esta app puntualmente**: widgets de pantalla de inicio (estáticos e
  interactivos vía App Intents), Live Activity/Dynamic Island (ActivityKit, 100% nativo, sin
  equivalente web), NFC real (Core NFC — Web NFC no existe en Safari/iOS, confirmado), geofencing
  real en segundo plano (la Geofencing API para web fue abandonada por el W3C), Apple Watch
  companion, CarPlay (única pieza que requiere pedirle a Apple un entitlement específico y
  aprobación caso por caso, además del pago), Siri/Shortcuts vía App Intents, Control Center
  controls, Quick Actions al mantener presionado el ícono (no existe en PWA en iOS, confirmado),
  Core Spotlight (búsqueda del sistema), Share Extension (recibir contenido, no solo compartir
  hacia afuera), CloudKit/`NSPersistentCloudKitContainer` (sync multi-dispositivo gratis, sin
  backend propio — hoy la app no tiene ningún tipo de sync).
  Todo esto es únicamente código y esfuerzo salvo CarPlay (aprobación + $99/año) y evitar la
  re-firma de 7 días (también $99/año).
- **`banco-ideas-ev.html`** (en esta carpeta): investigación amplia de conceptos EV — apps de
  referencia (ABRP, UTE Mueve), fuentes de datos de cargadores, ideas varias. Guardado, nada
  aplicado, a pedido explícito del usuario de en su momento no tocar producción con esto.
- **`wireframe-buscar-cargador-maps.html`** (en esta carpeta): la idea de "filtro por
  conector/potencia en el mapa" terminó descartada en favor de algo más simple — un botón que
  abre Google Maps con un deep-link (`google.com/maps/search/?api=1&query=...`), porque Maps ya
  muestra tipo de conector/kW/ubicación sin necesidad de mantener un mapa propio ni pagar la API
  de Google Places. El usuario dijo "no hace falta" implementarlo por ahora — queda como idea
  lista para cuando se retome.

## Qué NO se llevó a esta carpeta (a propósito)

Wireframes de features que **ya se implementaron en `src/` y están documentadas en el
`CLAUDE.md` principal** (borrador de carga, cargo fijo/red, consumo real en kWh, layout de
Inicio, sugerencia de precio) — están en el scratchpad de la sesión original pero no hace falta
cargarlos acá porque el código real ya existe y es la fuente de verdad. Tampoco se llevaron los
tres prototipos de la primera vuelta del rediseño total (bento/3-skills) porque el usuario los
rechazó explícitamente.
