import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build para la app nativa (Capacitor) en vez del sitio en GitHub Pages: activado por
// `npm run build:capacitor`. Capacitor sirve dist-capacitor/ como capacitor://localhost/,
// sin el subpath /carga-ev/ que necesita GitHub Pages, y no tiene uso para un service worker
// PWA (no hay prompt de instalación ni escenario offline que el bundle nativo no cubra ya).
const isCapacitor = process.env.CAPACITOR === '1';

export default defineConfig({
  // GitHub Pages sirve el proyecto bajo /carga-ev/, no en la raíz del dominio.
  base: isCapacitor ? '/' : '/carga-ev/',
  optimizeDeps: {
    // Requerido por @sqlite.org/sqlite-wasm: su propio empaquetado no debe pasar por el
    // pre-bundler de Vite (ver README del paquete).
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: isCapacitor ? { outDir: 'dist-capacitor' } : undefined,
  plugins: isCapacitor ? [] : [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        // SQLite WASM binary must be precached like any other asset for offline use.
        globPatterns: ['**/*.{js,css,html,wasm,png,svg}'],
      },
      manifest: {
        id: '/carga-ev/',
        name: 'Carga EV',
        short_name: 'Carga EV',
        description: 'Gasto, tiempos y costos de carga de tu vehículo eléctrico en Uruguay.',
        start_url: '/carga-ev/',
        scope: '/carga-ev/',
        display: 'standalone',
        background_color: '#F3F5F8',
        theme_color: '#1F8FE0',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
