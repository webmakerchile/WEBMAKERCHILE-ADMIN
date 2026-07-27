---
name: Plantillas y tipografía de portadas (v2)
description: Sistema de plantillas de composición + motor de tipografía de impacto con métricas calibradas; fidelidad de rostro multi-foto.
---

# Plantillas de composición + tipografía de impacto (julio 2026)

## Motor de titulares con métricas reales
Regla: el layout de titulares NO estima anchos con ratios promedio — usa `font-metrics.generated.ts` (avance real de cada carácter por fuente, fracción del font-size) y ajusta el font-size DE CADA LÍNEA para llenar el ancho de su columna, con partición balanceada de palabras (DP de partición lineal) y tope de contraste 2.2x entre líneas.
**Why:** el usuario reportó "las letras no encajan" y tipografía "básica"; el bloque macizo por línea es la firma de las miniaturas de canales grandes. Los ratios estimados fallaban hasta ±15% según las letras.
**How to apply:** para recalibrar (fuente nueva o cambio de librsvg): agregar la fuente a `scripts/calibrate-font-metrics.ts` y correr `npx tsx scripts/calibrate-font-metrics.ts`. Nunca editar el generated a mano.

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

## Borradores de portadas sin migración
Regla: los borradores del generador de portadas viven en `community_content` con kind `portada_borrador` (subtype=formato, topic=título, imageUrl=base64 completo, data={thumb webp, settings}) — el MISMO patrón de persistencia que historias/carruseles. CRUD en `/gemini/cover-drafts`; la lista NUNCA devuelve imageUrl (solo thumbnails); poda a 60 al insertar.
**Why:** evita una migración DDL (drizzle push cuelga; Publish solo mueve schema) y reusa un patrón ya probado en prod. El frontend auto-guarda cada generación y actualiza el borrador al ajustar.
**How to apply:** features nuevas de persistencia liviana de contenido generado → preferir kind nuevo en community_content antes que tabla nueva, salvo que necesiten relaciones/consultas ricas.

## Títulos de Historias/Posts IA con el motor de portadas
Regla: en `routes/community/index.ts` SOLO el título pasa por `construirOverlayTitular` (capa full-canvas compositada aparte, scrim "ninguno" porque topfade/botfade ya existen); sub-copy, CTA y hashtags conservan su render Inter con filtros feGaussianBlur (que sí funcionan en esta librsvg). Un `estilo_titular` por historia/carrusel completo, resuelto una vez en la ruta y persistido en data — los reintentos lo reciben del frontend para no cambiar el diseño.
**Why:** el usuario pidió "el mismo nivel" que portadas en estos apartados; la galería canon de ilustración (aprobada 10/10) NO se toca — solo la tipografía del título.

## Historias: guion único, no texto por frame
Regla: el texto de una serie de historias se genera con UNA sola llamada al LLM que devuelve el guion completo (`lib/story-script.ts`), nunca frame por frame. El guion incluye hilo conductor, protagonista, cifras y el `prompt_visual` de cada frame (que dirige la ilustración). Las IMÁGENES sí van en paralelo, porque ya comparten guion.
**Why:** el usuario reportó que las series "no tienen un auténtico sentido": la causa exacta era que `generarTextoHistoria` se llamaba por frame en `Promise.allSettled`, sin contexto cruzado. Un guion único resuelve coherencia de personaje, cifras y progresión de golpe.
**How to apply:** cualquier contenido multi-pieza (series, carruseles) debe generar el guion completo primero. Para reintentos de UN frame se pasa `hilo` + `otros_titulares` para no romper la serie ni repetir titulares.

## Historias: el CTA y los hashtags NO van en todos los frames
Regla: los bloques que dibuja cada frame los decide su LAYOUT (`story-formats.ts`), y solo los layouts de cierre incluyen `cta`/`hashtags`. `parseGuion` fuerza cadena vacía en los frames intermedios aunque el modelo los devuelva.
**Why:** el usuario se quejó de que "todas dicen Hablamos por WhatsApp, hashtags y sigue viendo". El prompt viejo tenía HARDCODEADO un microCTA de retención por frame (`CTA_INTERMEDIO_INSTRUCTION`) y el render pintaba los 4 bloques siempre.
**How to apply:** la retención se gana con el guion, no con un botón. Al agregar layouts, declarar `bloques` explícitamente y verificar con `story-formats.test.ts` (valida que las zonas no se pisen y que todo arco termine en un layout con CTA).

## Texto secundario: medir con fuente empaquetada, nunca con ratio estimado
Regla: sub-copy, CTA, hashtags y etiquetas de cifra se ajustan con `ajustarTextoMedido` (title-style) usando `montserrat_bold`, que SÍ está en assets/fonts y calibrada. Garantía: la línea más ancha nunca supera `maxWidth` (parte palabras por carácter si hace falta).
**Why:** el código pedía `font-family: 'Inter'`, pero Inter NO está empaquetada: fontconfig caía en **DejaVu Sans**, bastante más ancha que la estimación `charWidthRatio: 0.5`. Resultado: el texto de abajo se salía por los costados (el usuario lo reportó con capturas). `fitTextBlock` (estimación por caracteres) queda solo para casos legados.
**How to apply:** cualquier texto nuevo rasterizado server-side debe (a) usar una familia presente en `assets/fonts` y (b) medirse con `medirTexto`/`ajustarTextoMedido`. Si hace falta otra fuente, agregarla al banco y correr `scripts/calibrate-font-metrics.ts` (el charset ya incluye minúsculas). Verificar con `story-formats.test.ts` + el test de no-desbordamiento en `title-style.test.ts`.

## Calibrar avances: el kerning contamina la sonda "XcX"
Regla: el avance de un carácter se mide como `tinta("cc") - tinta("c")` (dos glifos IGUALES, ningún par heterogéneo que pueda kernear), se toma el máximo contra la sonda vieja `tinta("XcX") - tinta("XX")`, y se aplica un `MARGEN_SEGURIDAD` del 1.5%. Al final el script VALIDA la suma de avances contra frases de control reales y **falla** si subestima.
**Why:** la sonda "XcX" incluía el kerning de los pares X-c y c-X. En las display (Anton, Archivo Black) es ~0 y no se notaba, pero Montserrat tiene tabla de kerning rica y cada avance salía ~8px corto de 200: el ancho de una línea entera se subestimaba **5-6%** y el titular se salía de su zona. Medido: `I` avanza 70px reales, la sonda vieja daba 62.
**How to apply:** subestimar el ancho CORTA TEXTO; sobreestimar solo dibuja la línea un pelo más chica. Ante la duda, siempre el estimador mayor. Si la validación falla, subir `MARGEN_SEGURIDAD` antes que relajar la comprobación.

## Solo se dibuja lo que se puede medir
Regla: `normalizarParaFuente(texto, fuenteId)` se aplica DENTRO de `layoutTitular` y `ajustarTextoMedido`: sustituye espacios/guiones raros por equivalentes calibrados, quita tildes cuando la letra base sí existe y DESCARTA lo que no tiene métrica. Lo que se mide y lo que se pinta son la misma cadena, siempre.
**Why:** un carácter sin calibrar caía en `promedio` (~0.6) cuando una raya larga mide 1.01 y unos puntos suspensivos 0.8 — el modelo escribe "—" y "…" constantemente. Además, un glifo sin métrica suele faltar también en la display y librsvg lo pinta como cajita vacía: descartarlo arregla las dos cosas.
**How to apply:** si hace falta un signo nuevo, añadirlo al `CHARSET` del calibrador y recalibrar; nunca ensancharlo "a ojo" en el generated.

## El efecto pinta más ancho que el avance: `sangradoEstilo`
Regla: el ancho útil de una zona es `zona.width - 2·sangradoEstilo(estilo)·fs`, y las líneas alineadas a la izquierda arrancan en `zona.x + sangrado·fs`. `sangradoEstilo` cubre contorno, sombra desplazada, extrusión, halo neón, la placa de chips (0.28) y la placa de la palabra de acento (0.14). El font-size final se redondea con `floor`, nunca con `round`.
**Why:** `medirTexto` mide el avance de los glifos, no la tinta. Un titular ajustado al ancho pelado se salía de su columna e invadía al protagonista; con `round` la línea se ensanchaba hasta 6px más de lo calculado. La placa de chips a la izquierda se salía 29px.
**How to apply:** todo efecto nuevo tiene que declarar su sangrado en `sangradoEstilo`. El test de mutación de `story-render.test.ts` lo verifica: quitarlo hace fallar 12 casos.

## Recortar copy: nunca `.slice()` a media palabra
Regla: los límites de longitud del guion se aplican con `recortarLimpio` (corta en el último espacio que quepa, poda preposiciones y conjunciones colgantes y puntuación suelta). Una palabra única más larga que el límite se devuelve ENTERA salvo que sea absurda (>1.6x). `sanearDato` exige que la cifra sea numérica y `sanearHashtags` normaliza a 5 como máximo.
**Why:** era la causa DIRECTA de los "textos cortados" que reportó el usuario: `copy_principal.slice(0, 44)` convertía "…y el teléfono en silencio" en "…y el teléfono en si", y `dato.slice(0, 7)` convertía "cuarenta" en "cuarent".
**How to apply:** todo campo de texto que llegue al renderizador pasa por `sanearFrameGuion`, venga del modelo, de un borrador guardado o editado a mano en la UI.

## Los bloques inferiores se apilan, no se colocan en centros fijos
Regla: sub-copy, invitación y hashtags se posicionan con `apilarBloquesInferiores` (story-render): de abajo hacia arriba, con las alturas MEDIDAS, aire mínimo garantizado entre bloques y margen contra el borde. El scrim inferior arranca donde arranque la pila.
**Why:** los layouts declaraban un centro fijo para cada bloque mientras su alto dependía del texto: un sub-copy de tres líneas quedaba a 17px del botón y un botón alto empujaba los hashtags fuera del lienzo.
**How to apply:** el layout declara el centro PREFERIDO; el apilador solo sube bloques, nunca los baja. Layout nuevo → el test recorre 27 combinaciones de longitudes por layout y falla si dos cajas se tocan.

## El compositor de historias vive en `lib/story-render.ts`, no en la ruta
Regla: `componerHistoria` (geometría + SVG) y `renderTextoEnHistoria` (composición con sharp) están fuera de `routes/community` para poder renderizar en tests sin Express, base de datos ni IA. El demo `scripts/demo-historias.ts` llama al MISMO compositor.
**Why:** los bugs de texto cortado solo se detectan rasterizando de verdad, y una copia del compositor en el demo se desincroniza y enseña un render que no es el que la app genera (pasó).
**How to apply:** `story-render.test.ts` recorre 6 layouts x 7 estilos x 10 textos hostiles, rasteriza con librsvg y mide la caja de tinta contra la ZONA (no contra el borde del lienzo, que no detecta nada). Sus tolerancias se calculan de la geometría real (inclinación, techo de altura, sangrado), no son números mágicos. Verificado por mutación: cada protección, al quitarla, rompe el test.
