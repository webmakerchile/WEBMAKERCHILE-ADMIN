---
name: Ciclos de variables CSS y fondos transparentes
description: Por qué una custom property autorreferida deja superficies sin fondo y cómo diagnosticarlo
---

# Variables CSS: autorreferencia = ciclo = fondo transparente

- **Regla:** nunca redefinir un token del tema envolviéndolo con su mismo nombre (`--card: hsl(var(--card))` en un scope). Es un ciclo → la variable queda *invalid at computed-value time* → TODA declaración que la use (incluido el `bg-card` de Tailwind, que compila a `hsl(var(--card))`) pierde su valor → fondos transparentes silenciosos. Los fallbacks `var(--card, fb)` NO salvan: con ciclo, el fallback que a su vez referencia la variable también muere.
  **Why:** el menú móvil del Hub se veía "transparentado" (reporte del CEO con captura de iPhone); el scope del Hub sombreaba `--card` con autorreferencia, rompiendo el panel y todo `var(--card)` interno en TODOS los navegadores.
  **How to apply:** para envolver un token shadcn (triplete crudo) en un scope, usar OTRO nombre (`--card1: hsl(var(--card))`). En kits compartidos dentro/fuera del scope: `var(--card1, hsl(var(--card)))`.

- **Diagnóstico:** ante "se transparenta", no juzgar por capturas (el halo del blur del scrim en el borde del panel engaña — pasó con el menú del panel principal, que estaba SANO): pedir al tester `getComputedStyle(el).backgroundColor` — `rgb()` opaco = elemento sano, buscar la causa en otra capa.

- **Jerarquía z del panel admin (referencia):** topbar hub 40 < FAB 60 < resultados búsqueda 70 < overlay/hoja 80/90 < menú móvil 96/97 < confirm 120 < toast 200. El menú móvil debe ir sobre FAB/topbar/hojas.

- **iOS:** `backdrop-filter` a pelo en CSS propio necesita también `-webkit-backdrop-filter` (iOS <18). Las utilidades de Tailwind ya emiten ambos.
