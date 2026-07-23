import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Guarda el JSON de backup. En la app nativa (Capacitor/WKWebView) un `<a download>` no dispara
 * nada — no hay gestor de descargas en un WebView, a diferencia de Safari/Chrome reales — así que
 * ahí se escribe el archivo a Cache y se abre la hoja nativa "Compartir" (Guardar en Archivos,
 * AirDrop, Mail, etc.). En la PWA/web (donde sí hay un navegador de verdad) se mantiene el
 * `<a download>` de siempre, sin depender de plugins nativos que ahí no existen.
 */
export async function saveBackupFile(json: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'Backup de Carga EV', url: written.uri });
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
