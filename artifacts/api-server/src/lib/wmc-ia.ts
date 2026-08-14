import OpenAI from "openai";

/**
 * Generadores de texto del panel wmc (mensajes, correcciones de items y
 * acuerdos de servicio).
 *
 * Ninguno de estos endpoints existio nunca en wmc: el proxy ciego devolvia el
 * HTML del SPA con 200 y el panel fallaba en silencio. Se atienden aca con el
 * mismo patron de IA que ya usa el resto del panel.
 *
 * El front manda todo el contexto que hace falta en el cuerpo, asi que lo
 * pasamos entero al modelo en vez de intentar adivinar campo por campo.
 */

export class WmcIAError extends Error {}

const MODELO = "gpt-4.1";

const VOZ = [
  "Escribis para WebMaker, una agencia digital chilena.",
  "Tono cercano y profesional, en espanol de Chile, tratando de tu.",
  "Nada de promesas exageradas ni relleno. Frases cortas y concretas.",
  "Los montos van en pesos chilenos.",
].join(" ");

async function pedirJson(
  instruccion: string,
  contexto: unknown,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new WmcIAError("Falta configurar OPENAI_API_KEY.");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: MODELO,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: VOZ + "\n\n" + instruccion },
      { role: "user", content: JSON.stringify(contexto ?? {}).slice(0, 20000) },
    ],
  });

  const crudo = completion.choices[0]?.message?.content ?? "";
  try {
    const dato = JSON.parse(crudo) as Record<string, unknown>;
    if (!dato || typeof dato !== "object") throw new Error("no es objeto");
    return dato;
  } catch {
    throw new WmcIAError("El modelo no devolvio un JSON valido.");
  }
}

function texto(valor: unknown, max = 4000): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

/** Un mensaje suelto para mandarle al cliente por el canal que sea. */
export async function generarMensaje(
  canal: "whatsapp" | "frio" | "drive",
  contexto: unknown,
): Promise<string> {
  const porCanal: Record<string, string> = {
    whatsapp:
      "Redacta UN mensaje de WhatsApp para presentarle la propuesta al cliente. " +
      "Maximo 900 caracteres, en parrafos cortos separados por saltos de linea. " +
      "Podes usar como mucho dos emojis. Cierra invitando a responder cualquier duda.",
    frio:
      "Redacta UN mensaje de primer contacto (outreach en frio) para un cliente " +
      "que todavia no nos conoce. Maximo 900 caracteres. Parte por el problema que " +
      "le resolvemos, no por nosotros. Cierra proponiendo una llamada corta.",
    drive:
      "Redacta UN mensaje breve para acompaniar el envio de la propuesta por " +
      "Google Drive. Maximo 500 caracteres. Menciona que el enlace queda disponible " +
      "y ofrece revisarla juntos.",
  };
  const dato = await pedirJson(
    porCanal[canal] +
      '\n\nDevolve exactamente este JSON: { "message": "..." }',
    contexto,
  );
  const mensaje = texto(dato.message, 2000);
  if (!mensaje) throw new WmcIAError("No se pudo generar el mensaje.");
  return mensaje;
}

export interface CorreoGenerado {
  subject: string;
  body: string;
}

/** Correo con asunto y cuerpo para mandar la propuesta. */
export async function generarCorreo(contexto: unknown): Promise<CorreoGenerado> {
  const dato = await pedirJson(
    "Redacta un correo para enviarle la propuesta al cliente. El asunto va " +
      "directo al grano, maximo 70 caracteres, sin signos de exclamacion. El " +
      "cuerpo va en parrafos cortos, maximo 1500 caracteres, y termina con una " +
      "despedida simple del equipo de WebMaker." +
      '\n\nDevolve exactamente este JSON: { "subject": "...", "body": "..." }',
    contexto,
  );
  const subject = texto(dato.subject, 200);
  const body = texto(dato.body, 4000);
  if (!subject || !body) throw new WmcIAError("No se pudo generar el correo.");
  return { subject, body };
}

export interface ItemGenerado {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function normalizarItems(bruto: unknown): ItemGenerado[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((x) => {
      const i = (x ?? {}) as Record<string, unknown>;
      const cantidad = Number(i.quantity);
      const precio = Number(i.unitPrice ?? i.total);
      return {
        name: texto(i.name, 160),
        description: texto(i.description, 600),
        quantity: Number.isFinite(cantidad) && cantidad > 0 ? Math.round(cantidad) : 1,
        unitPrice: Number.isFinite(precio) && precio >= 0 ? Math.round(precio) : 0,
      };
    })
    .filter((i) => i.name.length > 0)
    .slice(0, 30);
}

/** Aplica una correccion en lenguaje natural sobre una lista de items. */
export async function corregirItems(contexto: unknown): Promise<ItemGenerado[]> {
  const dato = await pedirJson(
    "Recibis una lista de items de un presupuesto y una correccion escrita por " +
      "la persona que lo arma. Aplica la correccion y devolve la lista completa " +
      "ya corregida, respetando lo que no se pidio cambiar. No inventes items " +
      "nuevos salvo que la correccion lo pida explicitamente. Los precios van en " +
      "pesos chilenos, como numero entero sin puntos ni simbolos." +
      '\n\nDevolve exactamente este JSON: { "items": [ { "name": "...", ' +
      '"description": "...", "quantity": 1, "unitPrice": 250000 } ] }',
    contexto,
  );
  const items = normalizarItems(dato.items);
  if (items.length === 0) throw new WmcIAError("No se pudo corregir la lista de items.");
  return items;
}

export interface ItemsDeComplemento {
  summary: string;
  items: ItemGenerado[];
}

/** Desglosa la descripcion de un complemento en items cobrables. */
export async function itemsDeComplemento(
  contexto: unknown,
): Promise<ItemsDeComplemento> {
  const dato = await pedirJson(
    "Recibis la descripcion de un complemento o trabajo adicional para un " +
      "proyecto web. Desglosalo en entre 1 y 10 items cobrables, con precios de " +
      "referencia en pesos chilenos (una pagina nueva ~150.000, una integracion " +
      "simple ~200.000, una pasarela de pago ~300.000, un panel de administracion " +
      "~800.000, mantencion mensual ~80.000). No conviertas en items los tramites " +
      "que dependen del cliente (papeles, firmas, accesos). El resumen es una " +
      "linea corta que describe el complemento completo." +
      '\n\nDevolve exactamente este JSON: { "summary": "...", "items": [ { ' +
      '"name": "...", "description": "...", "quantity": 1, "unitPrice": 150000 } ] }',
    contexto,
  );
  const items = normalizarItems(dato.items);
  if (items.length === 0) throw new WmcIAError("No se pudo generar la lista de items.");
  return { summary: texto(dato.summary, 400), items };
}

export interface SeccionAcuerdo {
  title: string;
  content: string;
}

/**
 * Secciones de un acuerdo de servicio. Los titulos importan: el panel los
 * reconoce por palabra clave para repartirlos en sus campos.
 */
const SECCIONES = [
  "Alcance y objeto del servicio",
  "Proceso y etapas de trabajo",
  "Plazos y cronograma",
  "Forma de pago y facturacion",
  "Garantia y soporte",
  "Confidencialidad y propiedad intelectual",
  "Servicios incluidos y no incluidos",
];

function normalizarSecciones(bruto: unknown): SeccionAcuerdo[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((x) => {
      const s = (x ?? {}) as Record<string, unknown>;
      return { title: texto(s.title, 160), content: texto(s.content, 6000) };
    })
    .filter((s) => s.title.length > 0 && s.content.length > 0)
    .slice(0, 12);
}

const REGLA_SECCIONES =
  "Redacta las secciones de un acuerdo de servicio entre WebMaker y el cliente. " +
  "Usa exactamente estos titulos y en este orden: " +
  SECCIONES.join(" | ") +
  ". Cada seccion va en prosa clara, sin jerga legal innecesaria, entre 400 y " +
  "1200 caracteres. No inventes plazos ni montos que no esten en el contexto." +
  '\n\nDevolve exactamente este JSON: { "sections": [ { "title": "...", ' +
  '"content": "..." } ] }';

export async function generarAcuerdo(contexto: unknown): Promise<SeccionAcuerdo[]> {
  const dato = await pedirJson(REGLA_SECCIONES, contexto);
  const secciones = normalizarSecciones(dato.sections);
  if (secciones.length === 0) throw new WmcIAError("No se pudo generar el acuerdo.");
  return secciones;
}

export async function corregirAcuerdo(contexto: unknown): Promise<SeccionAcuerdo[]> {
  const dato = await pedirJson(
    "Recibis las secciones de un acuerdo de servicio y una correccion escrita " +
      "por la persona que lo arma. Aplica la correccion y devolve TODAS las " +
      "secciones, respetando las que no se pidio cambiar. " +
      REGLA_SECCIONES,
    contexto,
  );
  const secciones = normalizarSecciones(dato.sections);
  if (secciones.length === 0) throw new WmcIAError("No se pudo corregir el acuerdo.");
  return secciones;
}

/**
 * Mini-contrato de un complemento. El panel solo lo muestra en pantalla
 * (setShowContractPreview), no lo guarda, asi que aca solo se genera el texto.
 */
export async function generarContrato(contexto: unknown): Promise<string> {
  const dato = await pedirJson(
    "Redacta un mini-contrato breve para un trabajo adicional (complemento) " +
      "sobre un proyecto ya en curso. Cubri en prosa: que incluye el trabajo, " +
      "que no incluye, plazo estimado, precio y forma de pago, y que pasa si el " +
      "cliente pide cambios despues de aprobado. Maximo 2500 caracteres, sin " +
      "jerga legal innecesaria. No inventes plazos ni montos que no esten en el " +
      "contexto: si falta un dato, dejalo indicado entre corchetes." +
      '\n\nDevolve exactamente este JSON: { "contract": "..." }',
    contexto,
  );
  const contrato = texto(dato.contract, 8000);
  if (!contrato) throw new WmcIAError("No se pudo generar el contrato.");
  return contrato;
}

/** Aplica una instruccion en lenguaje natural sobre un mini-contrato ya escrito. */
export async function editarContrato(contexto: unknown): Promise<string> {
  const dato = await pedirJson(
    "Recibis un mini-contrato y una instruccion de cambio escrita por la " +
      "persona que lo arma. Aplica el cambio y devolve el contrato completo, " +
      "respetando todo lo que no se pidio cambiar. Mantene el mismo tono y " +
      "extension." +
      '\n\nDevolve exactamente este JSON: { "contract": "..." }',
    contexto,
  );
  const contrato = texto(dato.contract, 8000);
  if (!contrato) throw new WmcIAError("No se pudo editar el contrato.");
  return contrato;
}
