import type { Cotizacion } from "./schema";

/**
 * Ejemplo de estilo para el generador de cotizaciones.
 *
 * El cliente de aquí es INVENTADO, y eso es el punto. Antes este few-shot era
 * la cotización real de una clienta con nombre y apellido, su facturación, sus
 * volúmenes de venta y su dominio, y se mandaba entera —en cada generación, a
 * un servicio externo— con la instrucción "iguala este estándar". Dos
 * problemas: los datos comerciales de una clienta viajaban dentro de la
 * cotización de cualquier otra, y el modelo copiaba sus cifras y su vertical.
 * En una cotización eso no da error: sale un documento impecable con los datos
 * de otro cliente dentro, y se descubre cuando ya se envió.
 *
 * Se mantiene igual de concreto a propósito. Un ejemplo vago produce copy
 * vago: la calidad de este texto viene justo de que dice cifras, horarios y
 * situaciones, no generalidades. Lo que cambia es que nada de esto es de nadie.
 *
 * Se usa como estándar de redacción para el LLM y como fixture de tests y de
 * la vista previa de la plantilla.
 */
export const EJEMPLO_ESTILO: Cotizacion = {
  meta: {
    cliente_nombre: "Nombre del contacto",
    empresa: "Clínica Ejemplo",
    empresa_descripcion: "Centro odontológico con tres consultas",
    mes_anio: "JULIO 2026",
    anio: "2026",
  },
  portada: {
    titulo: "TU AGENDA, LLENA SIN CONTESTAR EL TELÉFONO",
    titulo_resaltado: "SIN CONTESTAR EL TELÉFONO",
    subtitulo:
      "Un sitio con reserva de horas en línea conectado a tu agenda real, para que las horas se tomen solas y tu recepción deje de vivir pegada al teléfono.",
    alcance_titulo: "Sitio web + reserva de horas + recordatorios",
    alcance_detalle: "3 módulos · más mensualidad de mantención",
  },
  contexto: {
    titulo: "Tienes los pacientes. Falta quien tome la hora.",
    titulo_resaltado: "quien tome la hora.",
    parrafos: [
      "Atienden en tres consultas y la agenda se llena, pero se llena a pulso: cada hora se coordina por teléfono o por WhatsApp, una por una, y siempre en el mismo horario en que hay pacientes esperando en recepción.",
      "El problema no es la demanda — es que quien quiere reservar llama justo cuando nadie puede contestar. Esa llamada no vuelve: se va a la clínica de al lado, que sí tenía un botón para reservar.",
    ],
    stats: [
      { valor: "3", descripcion: "consultas atendiendo en paralelo durante toda la jornada" },
      { valor: "24/7", descripcion: "horas en que se podrán reservar horas una vez publicado el sitio" },
      { valor: "0", descripcion: "llamadas necesarias para agendar una hora de control" },
    ],
    soluciones: [
      "Permitir reservar una hora desde el celular a cualquier hora, sin llamar ni esperar respuesta.",
      "Mostrar solo los bloques realmente disponibles, tomados de la agenda que ya usan.",
      "Recordar la hora por WhatsApp el día antes para que dejen de perderse las citas.",
      "Liberar a recepción de coordinar horas para que atienda a quien tiene delante.",
    ],
  },
  alcance_titulo: "Tres piezas para que la agenda se llene sola.",
  alcance_titulo_resaltado: "se llene sola.",
  modulos: [
    {
      nombre: "Sitio web de la clínica",
      descripcion:
        "Sitio propio con los tratamientos, el equipo y las sedes, escrito para que quien llega buscando un dentista entienda en diez segundos qué hacen y cómo pedir hora. Optimizado para el celular, que es desde donde llega casi todo el tráfico.",
      neto: 750000,
    },
    {
      nombre: "Reserva de horas en línea",
      descripcion:
        "Reserva conectada a la agenda real: se muestran solo los bloques libres por profesional y sede, y la hora queda tomada al instante. Sin dobles reservas y sin depender de que alguien confirme por teléfono.",
      neto: 620000,
    },
    {
      nombre: "Recordatorios automáticos",
      descripcion:
        "Aviso por WhatsApp el día antes y opción de reprogramar con un toque. Es lo que baja las horas perdidas sin que nadie tenga que llamar una por una.",
      neto: 380000,
    },
  ],
  nota_alcance:
    "Precio cerrado, sin letra chica. No incluye la ficha clínica ni la facturación, que siguen en el sistema que ya usan — la reserva se conecta a la agenda, no la reemplaza.",
  como_funciona: {
    titulo: "Que pedir hora deje de depender del teléfono.",
    titulo_resaltado: "deje de depender del teléfono.",
    intro: "Así se ve en el día a día, tanto para el paciente como para la clínica:",
    items: [
      {
        actor: "PACIENTE",
        titulo: "Reserva a cualquier hora",
        descripcion: "Elige tratamiento, profesional y bloque disponible desde el celular, aunque sean las once de la noche.",
      },
      {
        actor: "PACIENTE",
        titulo: "Recibe su recordatorio",
        descripcion: "Un mensaje el día antes con la hora, la sede y la opción de reprogramar sin llamar.",
      },
      {
        actor: "CLÍNICA",
        titulo: "Recepción deja de agendar",
        descripcion: "Las horas entran solas a la agenda; recepción atiende a quien está en el mostrador.",
      },
      {
        actor: "CLÍNICA",
        titulo: "Sin dobles reservas",
        descripcion: "Cada bloque se bloquea al tomarse, así que dos pacientes no pueden quedar a la misma hora.",
      },
      {
        actor: "AMBOS",
        titulo: "Nunca deja de agendar",
        descripcion: "Mientras la clínica está cerrada, el sitio sigue tomando horas para la semana siguiente.",
      },
      {
        actor: "AMBOS",
        titulo: "Listo para crecer",
        descripcion: "Sumar una cuarta consulta o una sede nueva es agregarla a la agenda, no rehacer el sitio.",
      },
    ],
  },
  cronograma: {
    titulo: "Tres semanas, de punta a punta.",
    titulo_resaltado: "punta.",
    intro: "De coordinar por teléfono a una agenda que se llena sola en tres semanas:",
    fases: [
      {
        titulo: "Contenidos y diseño",
        descripcion: "Recopilación de tratamientos, fotos del equipo y horarios por sede, y aprobación del diseño.",
      },
      {
        titulo: "Reserva conectada a la agenda",
        descripcion: "Configuración de profesionales, duraciones por tratamiento y bloques disponibles, con pruebas reales.",
      },
      {
        titulo: "Recordatorios y salida a producción",
        descripcion: "Conexión de los avisos por WhatsApp, ajustes finales y publicación del sitio.",
      },
    ],
    nota: "Cronograma referencial desde la fecha de inicio y el primer abono. Puede ajustarse según cuándo nos compartan los contenidos y los horarios de cada profesional.",
  },
  mensualidad: {
    titulo: "Mantención y soporte, todo en un solo pago.",
    titulo_resaltado: "todo en un solo pago.",
    intro: "Que la reserva nunca se detenga:",
    neto: 80000,
    incluye: [
      {
        titulo: "Hosting y monitoreo",
        descripcion: "El sitio alojado y vigilado: si la reserva deja de responder, nos enteramos antes que ustedes.",
      },
      {
        titulo: "Actualizaciones menores",
        descripcion: "Nuevos tratamientos, precios, horarios o profesionales que quieran cambiar, sin costo adicional.",
      },
      {
        titulo: "Soporte técnico",
        descripcion: "Ante cualquier duda o error del sitio o de la reserva, los acompañamos.",
      },
      {
        titulo: "Respaldo periódico",
        descripcion: "Copias de seguridad del sitio y de la configuración de la agenda.",
      },
    ],
    no_cubre: [
      "Desarrollos nuevos o módulos adicionales — por ejemplo, integrar la ficha clínica si no queda en el alcance inicial.",
      "Cambios grandes de estructura o rediseños completos del sitio.",
      "Cancelable con 30 días de aviso.",
    ],
  },
  pago: {
    titulo: "Cuando quieran partir, está todo listo.",
    titulo_resaltado: "está todo listo.",
    esquema: [
      { porcentaje: 50, momento: "AL INICIAR" },
      { porcentaje: 50, momento: "CONTRA ENTREGA" },
    ],
    condicion_saldo: "el sitio queda publicado y tomando horas",
    nota_personal:
      "Cualquier duda sobre el alcance la resolvemos antes de partir: esta cotización queda a su disposición para cuando decidan avanzar.",
    proximos_pasos: [
      "Nos confirman por WhatsApp que quieren avanzar.",
      "Nos comparten tratamientos, horarios por profesional y las fotos del equipo.",
      "Partimos la semana siguiente al primer abono.",
    ],
  },
  cierre: {
    linea1: "Esta cotización queda abierta a los ajustes que definamos cuando decidan avanzar.",
    linea2: "Quedamos atentos para cuando quieran ponerla en marcha.",
  },
};
