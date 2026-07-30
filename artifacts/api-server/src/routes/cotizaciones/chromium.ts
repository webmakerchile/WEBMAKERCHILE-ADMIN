// Dónde está el Chromium que convierte la cotización en PDF.
//
// "El sistema no está generando los contratos" tenía dos causas posibles que
// desde la pantalla se veían EXACTAMENTE iguales: o no hay Chromium para
// renderizar el PDF, o el PDF se generó bien y falló al subirlo a Drive. Sin
// distinguirlas no se podía arreglar ninguna.
//
// La búsqueda estaba en `which chromium` a secas. En Nix y en contenedores el
// binario suele llamarse de otra forma o vivir fuera del PATH, así que bastaba
// con eso para que no se generara ni un solo contrato.

import { execFileSync } from "child_process";
import fs from "fs";

/**
 * Nombres y rutas donde suele estar Chromium, en orden de preferencia.
 *
 * `chromium-browser` es el nombre en Debian/Ubuntu; la ruta de Playwright
 * aparece en contenedores que ya lo traen instalado, y ahorra pedir otro
 * paquete solo para imprimir un PDF.
 */
export const CANDIDATOS_CHROMIUM = [
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
] as const;

/** Nombres a buscar en el PATH cuando ninguna ruta fija existe. */
export const NOMBRES_CHROMIUM = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"] as const;

export interface SondaChromium {
  /** ¿Existe este fichero? */
  existe: (ruta: string) => boolean;
  /** Resuelve un nombre por el PATH, o null. */
  enPath: (nombre: string) => string | null;
  /** Valor de PUPPETEER_EXECUTABLE_PATH, si lo hay. */
  configurado?: string | undefined;
}

/**
 * Elige el ejecutable, o null si no hay ninguno.
 *
 * Separado de la búsqueda real para poder probar el orden de preferencia sin
 * depender de qué haya instalado en la máquina donde corren los tests.
 */
export function elegirChromium(sonda: SondaChromium): string | null {
  // Lo configurado a mano manda, aunque no exista: si alguien lo puso y está
  // mal, tiene que verlo, no que se lo sustituyamos por otro en silencio.
  const configurado = sonda.configurado?.trim();
  if (configurado) return configurado;

  for (const ruta of CANDIDATOS_CHROMIUM) {
    if (sonda.existe(ruta)) return ruta;
  }
  for (const nombre of NOMBRES_CHROMIUM) {
    const encontrado = sonda.enPath(nombre);
    if (encontrado) return encontrado;
  }
  return null;
}

/** Mensaje para quien lo va a leer en la pantalla, no en los logs. */
export const SIN_CHROMIUM =
  "El servidor no tiene instalado el navegador que convierte la cotización en PDF. " +
  "Es un problema del servidor, no de la cotización: avisa a soporte para que instale " +
  "Chromium o defina PUPPETEER_EXECUTABLE_PATH. Mientras tanto puedes usar la vista " +
  "previa y guardarla desde el navegador.";

const sondaReal: SondaChromium = {
  existe: (ruta) => {
    try { return fs.existsSync(ruta); } catch { return false; }
  },
  enPath: (nombre) => {
    try {
      const r = execFileSync("which", [nombre], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      return r || null;
    } catch { return null; }
  },
  get configurado() { return process.env.PUPPETEER_EXECUTABLE_PATH; },
};

/** Ruta real de Chromium, o null si no hay ninguno en esta máquina. */
export function buscarChromium(): string | null {
  return elegirChromium(sondaReal);
}
