---
name: Bandejas de tickets embebidas vs. visibilidad de nav
description: Cómo diagnosticar correctamente un reporte de "no veo los tickets" y por qué una bandeja embebida en una sola pestaña no es lo mismo que un ítem de navegación.
---

# Bandejas de tickets embebidas vs. visibilidad de nav

Cuando alguien reporta que una función "no se ve" o "no funciona" en una pantalla con pestañas, antes de asumir un bug hay que descartar, en este orden:

1. **Build viejo**: ¿el fix ya está en la versión publicada? Compararlo bajando el bundle JS de producción y buscando las strings/lógica del cambio (ver `prod-build-skew.md`), no confiar en la fecha del deploy.
2. **Pestaña equivocada**: si la función vive DENTRO de una sola pestaña de una página con varias, un usuario que está parado en otra pestaña reporta "no se ve" con la misma frase que usaría para un bug real. Pedir (o inferir de una captura) en qué pestaña estaba parado antes de tocar código.

Solo si ambas cosas están descartadas es un bug real.

Además, esto reveló una distinción de producto que vale la pena anticipar: una bandeja de tickets (u otro widget) embebida como parte del contenido de una pestaña (p. ej. dentro del Dashboard) NO es lo mismo que tener un ítem propio en el nav. Para el usuario ambas cosas se sienten como "no lo encuentro", pero son pedidos distintos:
- Embebida = visible solo mientras esa pestaña específica está activa.
- Ítem de nav = visible/alcanzable desde cualquier pestaña, con su propio contador.

**Why:** en este proyecto ya pasó dos veces que una bandeja por-área (tickets) se implementó embebida en una pestaña y el usuario, al no verla desde otra pestaña, lo reportó como si la función no existiera — cuando en realidad estaba viva pero en el lugar equivocado para lo que él quería.

**How to apply:** ante un reporte de "no veo X" en una página con pestañas, verificar primero build+pestaña antes de tocar código. Si la función pedida es "que se vea sin importar dónde esté parado", el pedido real es un ítem de nav nuevo (con su propio contador, reusando la lógica de filtrado/área ya existente), no un ajuste al lugar donde ya vive embebida.
