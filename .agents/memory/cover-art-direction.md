---
name: Dirección de arte de portadas
description: Decisión de diseño aprobada por el usuario para las portadas verticales (TikTok) y lecciones de prompt-engineering de utilería.
---

# Dirección de arte de portadas verticales

## Identidad aprobada: familia "Estudio spotlight"
Regla: TODAS las portadas verticales usan la familia "estudio fotográfico en penumbra con foco de luz" — la variedad viene de variantes de iluminación (color/posición de la luz: ámbar, medianoche, esmeralda, púrpura, carmesí, dorado lateral, contraluz, duotono), NO de mundos visuales distintos. El zorro Webi sigue flat cartoon (referencia master intacta).
**Why:** el usuario (2026-07-26) aprobó explícitamente el demo "Estudio spotlight" y pidió "sigamos este estilo desde ahora", descartando el banco anterior de 8 mundos dispares (neón, selva, papel, etc.).
**How to apply:** cualquier variante nueva de portada debe ser otra iluminación del mismo estudio; no reintroducir mundos ajenos al set fotográfico salvo pedido explícito.

## Utilería real, jamás stickers
Regla: los objetos de apoyo son props físicos del set — apoyados en el piso o sobre otro objeto, con volumen, iluminados por el mismo foco (cara iluminada/cara en penumbra) y con sombra proyectada coherente. Prohibido: iconos/pegatinas con contorno grueso, objetos flotantes, y símbolos abstractos dibujados en el aire ("?", flechas, gráficos) — una idea abstracta va IMPRESA en un objeto físico (pizarra, pantalla encendida, caja estampada).
**Why:** feedback crítico del usuario ("muy pero muy importante"): los stickers pegados encima matan la sensación de portada trabajada. Los modelos de imagen tienden a dibujar símbolos flotantes cuando la pose expresa emoción (confusión → "?") y a colar el kit cliché de marketing (cohete/embudo/carrito) en temas de negocio: hay que prohibirlos nombrándolos explícitamente Y dar la alternativa física.
**How to apply:** al editar el prompt de ilustración en el sistema de portadas, mantener el bloque "UTILERÍA REAL, NO STICKERS" y la regla de símbolos-en-objetos; instruir al zorro flat cartoon pero utilería con volumen sin contornos cartoon.

## Variante YouTube (horizontal 16:9)
La familia "estudio spotlight" se extiende a miniaturas de YouTube 1280x720: mismas 8 luces y reglas anti-sticker, pero encuadre horizontal con la franja IZQUIERDA despejada/oscura para el titular (compuesto por el servidor, alineado a la izquierda) y protagonista grande al lado derecho.
**Protagonista YouTube:** la foto de una persona real (rostro IDÉNTICO, fotorrealista, prohibido cartoonizar — energía youtuber) o Webi si no hay foto. Las poses del banco son exclusivas de Webi.
**Why:** El usuario pidió que la diferencia vertical (TikTok/IG) vs horizontal (YouTube) se note de inmediato, y que en YouTube pueda salir él u otra persona real.
**How to apply:** gpt-image-1 solo soporta 1536x1024 como lienzo apaisado → pedir ese tamaño y recortar con sharp a 1280x720 (el crop come ~11% arriba/abajo: componer pensando en encuadre cintura-arriba).
