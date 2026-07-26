import type { Cotizacion } from "./schema";

/**
 * Caso real M&M Moda — extraído del PDF de referencia.
 * Se usa como few-shot para el LLM (define el estándar de redacción)
 * y como fixture de tests/preview.
 */
export const MMODA_EXAMPLE: Cotizacion = {
  meta: {
    cliente_nombre: "Magaly Mamani",
    empresa: "M&M Moda",
    empresa_descripcion: "Ropa femenina al por mayor y detalle",
    mes_anio: "JULIO 2026",
    anio: "2026",
  },
  portada: {
    titulo: "TU CHATBOT, VENDIENDO LAS 24 HORAS",
    titulo_resaltado: "LAS 24 HORAS",
    subtitulo:
      "Un chatbot entrenado con tu catálogo que responde en las horas donde hoy nadie contesta, con tu equipo trabajando en un mismo sistema sin pisarse entre ustedes.",
    alcance_titulo: "Chatbot 24/7 + multiagente + multicanal",
    alcance_detalle: "3 módulos · más mensualidad de mantención",
  },
  contexto: {
    titulo: "Tienes la demanda. Falta quien responda de noche.",
    titulo_resaltado: "responda de noche.",
    parrafos: [
      "Llevas 12 años construyendo M&M Moda: eres mayorista, con una comunidad de 500 personas, 50 clientas fijas que te compran todos los días, y en temporada alta te llegan mínimo 20 modelos nuevos por semana, vendiendo un mínimo de 1.000 unidades por modelo. El negocio funciona a un volumen serio, pero sientes que está estancado.",
      "El problema no es la demanda — es que tus clientas compran de noche y tus vendedoras trabajan de 9 a 18:30. En ese horario, nadie contesta, y esas ventas simplemente se pierden.",
    ],
    stats: [
      { valor: "1.000+", descripcion: "unidades mínimas vendidas por modelo en temporada alta" },
      { valor: "20", descripcion: "modelos nuevos que te llegan por semana en temporada alta" },
      { valor: "0", descripcion: "horas del día sin respuesta, una vez tu chatbot esté funcionando" },
    ],
    soluciones: [
      "Responder automáticamente en las horas donde hoy nadie contesta, especialmente de noche.",
      "Entrenar al chatbot con tu catálogo, precios y tallas para que responda como lo harías tú, con un tono humano.",
      "Que tus vendedoras puedan tomar cualquier conversación sin pisarse entre ellas ni duplicar respuestas.",
      "Dejar todo listo para conectar tu sitio m&mmoda.cl y tu futura tienda de TikTok Shop.",
    ],
  },
  alcance_titulo: "Tres piezas para que tu negocio nunca deje de vender.",
  alcance_titulo_resaltado: "nunca deje de vender.",
  modulos: [
    {
      nombre: "Chatbot inteligente 24/7",
      descripcion:
        "Entrenado con tu catálogo, precios, tallas y colores, con un tono cálido y humano — no robótico. Responde en las horas donde hoy nadie contesta, sin dejar de vender mientras duermes o haces un vivo.",
      neto: 900000,
    },
    {
      nombre: "Multiagente para tu equipo",
      descripcion:
        "Tus vendedoras pueden tomar cualquier conversación con un clic; queda asignada a su nombre y nadie más puede escribir hasta que la liberen. Se acaban las respuestas cruzadas o duplicadas.",
      neto: 550000,
    },
    {
      nombre: "Integración multicanal",
      descripcion:
        "Un mismo chatbot conectado a WhatsApp, Instagram y tu sitio m&mmoda.cl, listo para sumar tu tienda de TikTok Shop apenas la actives.",
      neto: 650000,
    },
  ],
  nota_alcance:
    "Precio cerrado, sin letra chica. No incluye el desarrollo de m&mmoda.cl ni de tu tienda de TikTok Shop, que ya están en marcha por tu cuenta — el chatbot se conecta a ambas.",
  como_funciona: {
    titulo: "Que responder de noche deje de ser un problema.",
    titulo_resaltado: "deje de ser un problema.",
    intro: "Así se ve en el día a día, tanto para quien te escribe como para tu equipo:",
    items: [
      {
        actor: "CLIENTA",
        titulo: "Compra a cualquier hora",
        descripcion: "El chatbot responde tallas, colores y precios aunque sea la una de la madrugada.",
      },
      {
        actor: "CLIENTA",
        titulo: "Siente un trato humano",
        descripcion: "Responde con un tono cálido, no como un robot — tal como lo pediste.",
      },
      {
        actor: "TÚ",
        titulo: "Tu equipo sin pisarse",
        descripcion: "Cada vendedora toma su conversación y queda asignada a su nombre, igual que en la demo que vimos.",
      },
      {
        actor: "TÚ",
        titulo: "Un solo sistema, todo tu equipo",
        descripcion:
          "No necesitas un teléfono por vendedora — todas acceden al mismo chatbot desde su propio celular o PC.",
      },
      {
        actor: "AMBOS",
        titulo: "Nunca deja de vender",
        descripcion: "Mientras haces un vivo o duermes, el chatbot sigue respondiendo y cerrando ventas.",
      },
      {
        actor: "AMBOS",
        titulo: "Listo para crecer",
        descripcion: "Conectado a WhatsApp, Instagram, tu sitio web y pronto tu tienda de TikTok Shop.",
      },
    ],
  },
  cronograma: {
    titulo: "Tres semanas, de punta a punta.",
    titulo_resaltado: "punta.",
    intro: "De mensajes sin responder a un chatbot entrenado en tres semanas:",
    fases: [
      {
        titulo: "Parámetros y entrenamiento",
        descripcion: "Recopilación de tu catálogo, tono de respuesta y preguntas frecuentes de tus clientas.",
      },
      {
        titulo: "Chatbot multiagente",
        descripcion:
          "Configuración de la asignación de conversaciones por vendedora, con historial y colores por persona.",
      },
      {
        titulo: "Integración multicanal y pruebas",
        descripcion:
          "Conexión con WhatsApp, Instagram y tu sitio m&mmoda.cl, ajustes finales y salida a producción.",
      },
    ],
    nota: "Cronograma referencial desde la fecha de inicio y el primer abono. Puede ajustarse según cuándo nos compartas el catálogo y los parámetros de respuesta.",
  },
  mensualidad: {
    titulo: "Mantención y soporte, todo en un solo pago.",
    titulo_resaltado: "todo en un solo pago.",
    intro: "Que tu chatbot nunca se detenga:",
    neto: 80000,
    incluye: [
      {
        titulo: "Monitoreo del chatbot",
        descripcion: "Revisamos que las conversaciones y las derivaciones a tu equipo funcionen correctamente.",
      },
      {
        titulo: "Actualizaciones menores",
        descripcion:
          "Nuevos productos, precios o promociones que quieras agregar a los parámetros, sin costo adicional.",
      },
      {
        titulo: "Soporte técnico",
        descripcion: "Ante cualquier duda o error del chatbot o del panel, te acompañamos.",
      },
      {
        titulo: "Respaldo del historial",
        descripcion: "Copias de seguridad periódicas de las conversaciones y la configuración.",
      },
    ],
    no_cubre: [
      "Desarrollos nuevos o módulos adicionales — por ejemplo, conectar TikTok Shop si no queda incluido en el alcance inicial.",
      "Cambios grandes de flujo o estructura del chatbot.",
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
    condicion_saldo: "el chatbot queda publicado y funcionando",
    nota_personal:
      "Sabemos que esto lo estás conversando también con tu esposo — esta cotización queda a tu disposición para cuando decidan avanzar.",
    proximos_pasos: [
      "Nos confirmas por WhatsApp que quieren avanzar.",
      "Nos compartes tu catálogo, precios, tallas y los parámetros de cómo te gustaría que responda.",
      "Partimos la semana siguiente al primer abono.",
    ],
  },
  cierre: {
    linea1: "Esta cotización queda abierta a los ajustes que definamos cuando decidan avanzar.",
    linea2: "Quedamos atentos para cuando quieran ponerla en marcha.",
  },
};
