---
name: Render de portadas (SVG/fuentes)
description: Trampas de librsvg/fontconfig al componer titulares de portadas con Sharp en Replit.
---

# Render de titulares con Sharp/librsvg

## Espacios en tspans
Regla: al armar líneas de texto SVG con `<tspan>` por palabra, unir con `&#160;` (NBSP), nunca con espacios normales; y cualquier capa "sombra" debe usar EXACTAMENTE la misma estructura de tspans que la capa principal.
**Why:** librsvg recorta los espacios normales en los bordes de cada chunk de texto → las palabras salen pegadas ("3ERRORESQUE"); una sombra hecha con texto plano conserva los espacios, queda más ancha y asoma por los costados como texto fantasma (ambas capas van centradas).
**How to apply:** cualquier overlay de texto SVG rasterizado con Sharp (portadas, banners). NBSP entre chunks + generar sombra con el mismo generador de tspans (fills en negro translúcido).

## Fuentes de nix invisibles para fontconfig
Regla: instalar paquetes de fuentes con nix NO las registra en fontconfig en este entorno (fc-list no las ve ni tras fc-cache -f). Para tipografías del servidor, copiar los TTF/OTF a `assets/fonts` del artifact y registrar al boot un fonts.conf generado en runtime (dir absoluto por cwd + cachedir en /tmp + include del fonts.conf del sistema) seteando `FONTCONFIG_FILE` ANTES de que Sharp/librsvg cargue (Sharp se importa dinámico al primer uso, así que setearlo al boot alcanza).
**Why:** el perfil nix no entra en los dirs que fontconfig escanea; además, empaquetar las fuentes en el repo garantiza el mismo render en desarrollo y en producción publicada (los archivos viajan con el bundle).
**How to apply:** cualquier feature que rasterice texto server-side con fuentes que no sean DejaVu. Las fuentes viven en `artifacts/api-server/assets/fonts` con setup en `src/lib/fonts.ts`; verificar con `FONTCONFIG_FILE=... fc-list`.
