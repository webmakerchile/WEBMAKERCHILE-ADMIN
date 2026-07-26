// Fuentes empaquetadas en el repo para el render de titulares (Sharp/librsvg).
// El entorno base solo trae DejaVu; Oswald y Montserrat viven en assets/fonts
// y se registran vía un fonts.conf generado en runtime (FONTCONFIG_FILE), lo
// que funciona igual en desarrollo y en producción publicada.
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

export function setupFonts(): void {
  const candidates = [
    path.join(process.cwd(), "assets", "fonts"),
    path.join(process.cwd(), "artifacts", "api-server", "assets", "fonts"),
  ];
  const fontsDir = candidates.find(p => existsSync(p));
  if (!fontsDir) {
    console.warn("[Fonts] assets/fonts no encontrado; los titulares usarán DejaVu");
    return;
  }
  try {
    const cfgDir = "/tmp/fontconfig";
    mkdirSync(path.join(cfgDir, "cache"), { recursive: true });
    const cfgFile = path.join(cfgDir, "fonts.conf");
    writeFileSync(cfgFile, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${cfgDir}/cache</cachedir>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
</fontconfig>
`);
    process.env["FONTCONFIG_FILE"] = cfgFile;
    console.log(`[Fonts] Fuentes de titulares registradas desde ${fontsDir}`);
  } catch (err) {
    console.warn("[Fonts] No se pudo registrar fonts.conf:", err);
  }
}
