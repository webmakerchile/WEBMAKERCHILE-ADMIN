---
name: Firma con múltiples motivos (contrato / aprobación / cierre)
description: Patrón de una sola tabla de firmas con discriminador "motivo" para varios sujetos, y por qué el texto de éxito vive en más de un lugar.
---

# Una tabla de firmas, varios "motivos"

Cuando el mismo mecanismo de firma pública (dibujo/imagen/texto, sin cuenta de
cliente) sirve a más de un sujeto (contrato, aprobación de inicio de proyecto,
cierre de proyecto), conviene extender la tabla existente en vez de crear una
tabla por sujeto: columna `motivo` (texto, discriminador) + las FK-like
existentes (`contractId`, `projectId`, ...) todas nullable, sin CHECK a nivel
de DB (la tabla ya disciplinaba esto solo a nivel TS). El lookup de "enlace
pendiente" se filtra siempre por `(sujeto, motivo, estado=pendiente)`, nunca
solo por sujeto — dos motivos del mismo proyecto están pendientes en paralelo
sin pisarse.

**Why:** evita triplicar tabla/rutas/plantilla para algo que es, en esencia,
el mismo flujo con copy distinto; y el filtro por motivo (no solo por sujeto)
es lo que garantiza que "aprobación" y "cierre" del mismo proyecto convivan
como firmas independientes.

## El texto de éxito vive en más de un lugar — revisar los TRES

Al hacer el copy "por motivo" en una plantilla pública compartida, hay que
tocar independientemente:
1. La página de firma en sí (título/explicación/botón) — fácil de acordarse.
2. El mensaje de éxito **renderizado por el servidor** (fallback sin JS).
3. El mensaje de éxito que arma el **JavaScript embebido** en el cliente tras
   firmar sin recargar — este es el camino real que ve el usuario, y es el
   más fácil de olvidar porque no está cerca del resto del copy por motivo en
   el código ni se ve en una revisión rápida del handler del servidor.

**Why:** en la extensión a "aprobación"/"cierre" de proyecto, el mensaje de
éxito embebido en JS quedó con el texto de "contrato" hardcodeado para los
tres motivos — typecheck y tests no lo detectaron (no hay test de ese script
embebido); solo apareció al firmar de verdad en un e2e real. Un motivo nuevo
en un flujo de firma compartido: buscar TODAS las ramas de texto por motivo
existentes y replicar la forma exacta (mismo `if`/ternario) en las tres.

**How to apply:** al agregar un motivo nuevo a un flujo de firma compartido,
grep por el motivo anterior (ej. el string exacto de su mensaje de éxito) en
TODO el archivo de plantilla y en el handler — no solo en la función que
arma la página inicial.
