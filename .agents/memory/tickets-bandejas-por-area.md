---
name: Bandejas de tickets embebidas vs. visibilidad de nav vs. vista completa
description: Cómo diagnosticar correctamente un reporte de "no veo los tickets"; por qué una bandeja embebida no es lo mismo que un ítem de nav; y qué dos cosas hay que sincronizar al "graduar" un widget resumido a la experiencia completa dentro de una pestaña.
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

## Graduar un widget resumido a la experiencia completa dentro de una pestaña

Cuando el siguiente pedido es "quiero la página completa (formulario + stats + filtros), no el resumen", extraer la página a un componente reusable y montarlo en la pestaña. Dos cosas hay que resolver EN CONJUNTO, no solo el contenido:

1. **Header duplicado**: la página host (Hub Ejecutivo) ya renderiza su propio título de pestaña en su barra superior para TODAS las pestañas, sin excepción. Si el componente extraído conserva su `<h1>` interno, queda duplicado. Solución: prop `showHeader` que apaga el título/subtítulo pero conserva el botón de acción principal (p. ej. "Nuevo ticket") en la misma fila.
2. **Contador del nav vs. filtro por defecto**: si el widget resumido usaba una fórmula de área fija (p. ej. "ventas" para todo rol no-dev, como alias legacy de dirección→ventas) para su contador, y la vista completa por defecto filtra por el área REAL del usuario (`myAreas` que calcula el backend, que para dirección/ceo puede ser distinta, p. ej. "direccion"), el número del badge del nav queda desalineado con lo que el usuario ve al abrir la pestaña. Hay que recalcular el contador con la misma fórmula que usa el filtro por defecto de la vista completa, no dejar la fórmula vieja del widget resumido.

**Why:** son dos superficies (badge de nav + contenido de la pestaña) que antes usaban la misma fórmula "resumida" a propósito; al cambiar solo el contenido a la fórmula "real" y dejar el badge con la vieja, se rompe la invariante de que el número siempre coincide con lo que la pestaña muestra por defecto.

**How to apply:** al graduar cualquier widget por-área a su experiencia completa dentro de una pestaña de otra página: (a) agregar supresión de header al componente extraído, (b) auditar y realinear cualquier contador/badge que dependía de la fórmula vieja del widget resumido.
