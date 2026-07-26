---
name: Plantillas y tipografía de portadas (v2)
description: Sistema de plantillas de composición + motor de tipografía de impacto con métricas calibradas; fidelidad de rostro multi-foto.
---

# Plantillas de composición + tipografía de impacto (julio 2026)

## Motor de titulares con métricas reales
Regla: el layout de titulares NO estima anchos con ratios promedio — usa `font-metrics.generated.ts` (avance real de cada carácter por fuente, fracción del font-size) y ajusta el font-size DE CADA LÍNEA para llenar el ancho de su columna, con partición balanceada de palabras (DP de partición lineal) y tope de contraste 2.2x entre líneas.
**Why:** el usuario reportó "las letras no encajan" y tipografía "básica"; el bloque macizo por línea es la firma de las miniaturas de canales grandes. Los ratios estimados fallaban hasta ±15% según las letras.
**How to apply:** para recalibrar (fuente nueva o cambio de librsvg): agregar la fuente a `scripts/calibrate-font-metrics.ts` y correr `npx tsx scripts/calibrate-font-metrics.ts` (mide rasterizando "XcX" vs "XX" con la MISMA librsvg del render). Nunca editar el generated a mano.

## Efectos librsvg-safe por capas
Regla: los efectos tipográficos (contorno, sombra dura, extrusión 3D, glow neón, gradiente) se componen como CAPAS de `<text>` apiladas — sin `filter`, sin `paint-order`, sin tspans. Cada palabra va en su propio `<text>` con `x` calculado por métricas (elimina de raíz el bug de espacios de librsvg entre tspans).
**Why:** librsvg no garantiza filtros/paint-order; el truco NBSP era frágil. Con posiciones por palabra además se pueden dibujar placas de acento y acentos por palabra.
**How to apply:** efectos nuevos = variantes de `renderLinea` en `title-style.ts`. OJO: las palabras de acento en modo "caja" NO pasan por las capas de efecto (quedarían como bloque negro sobre la placa) — se dibujan placa + fill `#111111` limpio.

## Plantillas que se intercalan (formatos predeterminados)
Regla: la variedad de diseño viene de `thumbnail-templates.ts`: cada plantilla define bloque de composición del prompt (QUÉ zona queda despejada), zona de texto, lado del scrim, estilo tipográfico default y extras (comillas testimonio, número gigante). Rotación FIFO por formato; `yt_testimonio` solo a pedido; `yt_top_numero` entra al pool solo si el título empieza con número.
**Why:** el usuario pidió "formatos predeterminados para ir intercalando diseño" como los youtubers famosos — antes había UN solo layout por formato.
**How to apply:** plantilla nueva = entrada en `PLANTILLAS_PORTADA` (el prompt, el overlay y la UI la toman del catálogo `cover-options`). Verificar con `npx tsx scripts/demo-titulares.ts` (render sin IA) ANTES de gastar generaciones.

## Fidelidad de rostro: multi-foto
Regla: el adaptador (`lib/integrations-gemini-ai/client.ts`) pasa TODAS las imageParts a `openai.images.edit` (array) — hasta 3 fotos de la misma persona vía `personImagesBase64`. La primera foto es la principal; el bloque de identidad del prompt exige usar todos los ángulos.
**Why:** el usuario pasó 2 fotos y "la cara pierde el diseño": el adaptador descartaba silenciosamente todas las referencias menos la primera. gpt-image-1 acepta varias imágenes en edit y mejora mucho con más ángulos (siempre con `input_fidelity: "high"`).
**How to apply:** cualquier flujo nuevo con persona real debe mandar el array completo de fotos validadas (`validarFotosPersona`, máx `MAX_FOTOS_PERSONA`) y `numFotosPersona` al prompt builder.
