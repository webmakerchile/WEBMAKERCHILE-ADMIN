---
name: Elección de modelo de imágenes para portadas
description: Por qué seguimos en gpt-image-1 y no gpt-image-2; cómo re-evaluar con el switch AI_IMAGE_MODEL
---

# Modelo de imágenes: gpt-image-1 se queda (evaluado julio 2026)

Decisión: las portadas siguen en gpt-image-1 aunque exista gpt-image-2 (disponible en la misma integración de Replit).

**Why:** gpt-image-2 rechaza `input_fidelity` con 400 ("does not support the 'input_fidelity' parameter") y sin ese parámetro **pierde la identidad de la persona** en el flujo foto→miniatura: el A/B con la misma foto, prompt y dirección produjo claramente OTRA persona. Para testimonios con gente real eso es descalificatorio. En EDICIONES (chat de ajustes) gpt-image-2 sí conserva la identidad — la imagen base es la referencia — y rinde igual o mejor, pero no vale la pena un split de modelos por flujo.

**How to apply:**
- El adaptador (lib integrations-gemini-ai) elige modelo con `AI_IMAGE_MODEL` (default gpt-image-1), leído EN CADA LLAMADA — para A/B basta exportar la variable en un script, sin tocar código.
- El adaptador tiene fallback: si un modelo rechaza `input_fidelity` (detectado por status/param estructurados), reintenta una vez sin el parámetro. No dejar que un parámetro de afinado tumbe la generación.
- Re-evaluar gpt-image-2 (u otro) cuando soporte fidelidad de identidad: repetir el A/B con misma foto + mismo prompt fijando la dirección de arte (la preparación de prompts tiene componentes aleatorios: construir el prompt UNA vez y reutilizarlo para ambos modelos).
- Ojo con comparaciones: cada workspace/tsc — consumidores typecheckean contra dist de la lib; tras editar la lib correr `tsc -b lib/<pkg>`.
