---
name: Reportes/informes de RRHH hacia Dirección
description: Convención de guardado silencioso vs. envío explícito para registros periódicos, y cuándo un rol necesita un apartado propio en vez de heredar acceso a la página operativa de otro rol.
---

# Reportes/informes de RRHH hacia Dirección

## Guardado silencioso vs. envío explícito

Un registro periódico que se edita de forma continua antes de estar "listo" (p. ej. un informe semanal guardado con upsert/PUT en la misma fila toda la semana) necesita DOS acciones separadas, no una:

- Guardar (PUT/upsert silencioso): no notifica a nadie ni manda correo. Sirve para autoguardar mientras se redacta.
- Enviar (POST explícito, p. ej. `/enviar`): valida contenido mínimo, marca `sentAt`, SÍ avisa (notifyCeos) y SÍ manda copia por correo (enviarCorreo a CORREO_DIRECCION).

**Why:** si "guardar" y "avisar" fueran la misma acción, cada tecla o autoguardado dispararía una notificación/correo a dirección. A diferencia de un reporte diario (una fila nueva por día, así que "crear" ya es un evento discreto), un informe semanal es una sola fila que se reedita — el evento "enviar" tiene que ser explícito y se puede repetir en la misma semana si hay novedades.

**How to apply:** al agregar cualquier otro reporte/informe periódico con guardado continuo, replicar este patrón (columnas `sentAt`/`emailStatus`/`emailDetail`, botón "Guardar borrador" separado de "Enviar a dirección"). El fallo de notificación o correo NUNCA debe bloquear el guardado ni el envío — se registra en `emailStatus`/`emailDetail` y se muestra como aviso no bloqueante en la UI.

## Apartado propio vs. página operativa compartida

Un rol (p. ej. CEO con `routes: ["*"]`) puede tener acceso técnico de sobra a la página operativa de otro rol (p. ej. `/rrhh`), pero eso no resuelve "Dirección no tiene un apartado" — esa página está diseñada y organizada para quien opera el área, no para quien solo necesita ver lo que le compete.

**Why:** la queja real no es "no puedo entrar", es "no hay un lugar pensado para mí". Reusar `/rrhh` tal cual para Dirección la obliga a bucear entre fichas de personas, sueldos y contratos para encontrar los dos reportes que le interesan.

**How to apply:** cuando el pedido es que un rol de supervisión (CEO/Dirección) vea algo que hoy vive dentro de la página operativa de otra área, considerar una página nueva y angosta que reutilice los MISMOS componentes/endpoints (mismo permiso, ej. `canManagePeople`), en vez de forzar al rol de supervisión a navegar la página completa del área operativa. Mantener la página operativa original sin tocar su rol dueño.

## Este patrón se revirtió una vez — no es definitivo

El apartado angosto para Dirección ("Informes RRHH") terminó fusionado de vuelta dentro de la página operativa (`/rrhh`) porque el usuario prefirió un solo lugar en vez de dos secciones adyacentes en el menú. La fusión fue simple porque la página operativa ya embebía los mismos componentes de reporte al final — solo hubo que quitar el apartado propio (nav/ruta/página) y agregar una **ancla navegable**: un `id` en el contenedor de la sección + un efecto que hace `scrollIntoView` cuando la URL trae ese hash al cargar. Cualquier link guardado (avisos, plantillas de correo) que apuntaba a la página angosta pasa a `rutaOperativa#ancla`.

**Why:** "un apartado propio" y "todo junto" son ambas preferencias válidas de UX y pueden alternar con el tiempo — no hay una respuesta universalmente correcta, así que no hay que tratar la sección "Apartado propio vs. página operativa compartida" de arriba como una regla permanente.

**How to apply:** antes de crear (o de asumir que corresponde mantener) un apartado propio para un rol de supervisión, confirmar la preferencia vigente. Si piden fusionar uno existente hacia la página operativa, reusar la técnica de ancla + scroll-on-mount en vez de dejar a la persona aterrizando arriba de toda la página operativa.
