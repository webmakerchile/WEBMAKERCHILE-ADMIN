---
name: Ajustes por edición de imagen (chat de portadas)
description: Cómo editar una imagen ya generada sin que el modelo la reencuadre ni toque el resto (letterbox determinista + fidelidad alta)
---

# Ajustes conversacionales sobre imágenes generadas

Regla: para "cambia X y deja todo lo demás igual" NO se regenera — se usa images.edit con la imagen actual como referencia, `input_fidelity: "high"` y un prompt de regla maestra (todo idéntico salvo el cambio pedido; titular intocable; texto dentro de objetos solo si el usuario lo pide, con ortografía exacta).

**Why:** regenerar con el prompt modificado nunca conserva la escena; editar sí, pero el lienzo de gpt-image-1 (1536x1024/1024x1536) no coincide con 16:9/9:16 y el modelo REENCUADRA para llenarlo → titulares cortados (pasó en la primera prueba).

**How to apply:** letterbox determinista alrededor del edit: antes, rellenar con franjas negras al lienzo EXACTO (todo en enteros: 1280x720→1536x864+80px arriba/abajo; 1080x1920→864x1536+80px por lado) y avisar en el prompt que las franjas no se tocan; después, extraer la región central y escalar al tamaño final. El encuadre queda idéntico.

Quirk de sharp: solo admite UN resize por pipeline — el segundo pisa al primero y un extract posterior puede caer fuera de rango ("bad extract area"). Normalizar tamaño y extraer en dos pases con buffer intermedio.

En el frontend, el override del ajuste vive aparte de la generación (ajustada ?? generada) con época por formato: cada generación nueva sube la época y las respuestas de ajustes viejos en vuelo se descartan; además los botones de regenerar se bloquean mientras hay ajuste en curso.
