import OpenAI from "openai";
import { CotizacionSchema, validarPreciosEntregados, type Cotizacion } from "./schema";
import { MMODA_EXAMPLE } from "./example-mmoda";

/**
 * Generación del CONTENIDO de la cotización vía LLM.
 * El LLM produce SOLO JSON (textos + precios netos). Si el JSON no pasa la
 * validación Zod + reglas de negocio, se reintenta enviándole el error
 * (máximo 2 reintentos).
 */

const SYSTEM_PROMPT = `Eres el redactor comercial de WebMaker Latam, agencia chilena de desarrollo web y software. Generas el CONTENIDO de cotizaciones comerciales en formato JSON. NO generas HTML, NO calculas IVA ni totales, NO formateas montos.

Recibirás el contexto real de un cliente (resumen de reuniones o conversaciones de WhatsApp) y opcionalmente la lista de módulos con sus precios netos. Con eso produces un único objeto JSON con el schema indicado.

REGLAS DE REDACCIÓN:
- Español chileno cercano y directo. Tuteo siempre. Cero jerga corporativa, cero tono robótico.
- portada.titulo: el BENEFICIO principal para este cliente en 4 a 8 palabras, en MAYÚSCULAS. No es el nombre del servicio, es lo que gana. Ejemplo: "TU CHATBOT, VENDIENDO LAS 24 HORAS". portada.titulo_resaltado es el fragmento final más potente (substring exacto del título).
- contexto.parrafos: párrafo 1 cuenta la historia del cliente CON SUS NÚMEROS REALES (años, clientes, volúmenes) reconociendo su mérito; párrafo 2 nombra el problema puntual con la estructura "El problema no es X — es Y".
- contexto.stats: 3 cifras. Las dos primeras son datos reales del negocio del cliente; la tercera es aspiracional del proyecto (ej: valor "0", descripción "horas del día sin respuesta, una vez tu chatbot esté funcionando").
- contexto.soluciones: 4 frases que parten con verbo en infinitivo o "Que…", concretas, mencionando detalles reales (nombre del sitio, canales, etc.).
- modulos: nombre corto y vendedor (ej: "Chatbot inteligente 24/7"); descripción de 1-2 frases centrada en el beneficio, no en la tecnología. El neto es el número entero exacto que te entregaron, sin IVA, sin puntos, sin formato.
- como_funciona.items: exactamente 6 cards. Los actores alternan entre el cliente final del negocio (CLIENTA, CLIENTE, PACIENTE… según el rubro), el dueño (TÚ) y AMBOS. Describen escenas del día a día, no features.
- pago.nota_personal: retoma UN detalle real de la conversación que humanice el cierre (ej: "Sabemos que esto lo estás conversando también con tu esposo — esta cotización queda a tu disposición para cuando decidan avanzar."). Si no hay ningún detalle así en el contexto, usa una frase cordial de disponibilidad sin inventar hechos.
- Si el contexto menciona demos, promesas o pedidos específicos del cliente, referéncialos ("igual que en la demo que vimos", "tal como lo pediste").

PROHIBIDO:
- Inventar cifras, nombres o hechos que no estén en el contexto entregado.
- Calcular o escribir montos con IVA, totales, o montos formateados con $ o puntos.
- Dejar precios en 0 o inventar precios si no te los entregaron: en ese caso usa el valor -1 en neto para que el sistema lo marque como pendiente.
- Usar markdown, backticks o texto fuera del JSON.

Responde ÚNICAMENTE con el objeto JSON válido.`;

const SCHEMA_HINT = `Estructura exacta del JSON (todos los campos obligatorios salvo los marcados opcional):
{
  "meta": { "cliente_nombre": string, "empresa": string, "empresa_descripcion": string (5-60 chars), "mes_anio": "JULIO 2026" (MES MAYÚSCULAS + año), "anio": "2026" },
  "portada": { "titulo": string MAYÚSCULAS (10-60), "titulo_resaltado": substring exacto de titulo (3-30), "subtitulo": string (40-240), "alcance_titulo": string (8-60), "alcance_detalle": string (8-70) },
  "contexto": { "titulo": string (15-90, oración con punto final), "titulo_resaltado": fragmento final del titulo que se destaca en naranjo (substring exacto, opcional pero recomendado), "parrafos": [2 strings de 60-500], "stats": [3 × { "valor": string (máx 10), "descripcion": string (10-90) }], "soluciones": [4 strings de 20-160] },
  "alcance_titulo": string (15-90, título de la página de alcance, oración con punto final),
  "alcance_titulo_resaltado": fragmento final de alcance_titulo destacado en naranjo (substring exacto, opcional pero recomendado),
  "modulos": [1-4 × { "nombre": string (5-45), "descripcion": string (30-240), "neto": entero positivo exacto entregado, o -1 si no te lo entregaron }],
  "nota_alcance": string (20-300),
  "como_funciona": { "titulo": string (15-90), "titulo_resaltado": substring exacto opcional, "intro": string (15-140), "items": [6 × { "actor": string (2-12, MAYÚSCULAS), "titulo": string (5-45), "descripcion": string (20-160) }] },
  "cronograma": { "titulo": string (10-70), "titulo_resaltado": substring exacto opcional, "intro": string (15-120), "fases": [3-4 × { "titulo": string (5-50), "descripcion": string (20-180) }], "nota": string (20-220) },
  "mensualidad": null si el proyecto no tiene mensualidad, o { "titulo": string (10-90), "titulo_resaltado": substring exacto opcional, "intro": string (10-140), "neto": entero positivo o -1, "incluye": [4 × { "titulo": string (5-40), "descripcion": string (15-140) }], "no_cubre": [2-4 strings de 10-180, el último siempre "Cancelable con 30 días de aviso."] },
  "pago": { "titulo": string (10-90), "titulo_resaltado": substring exacto opcional, "esquema": [1-3 × { "porcentaje": entero (deben sumar 100), "momento": string (3-25, MAYÚSCULAS ej "AL INICIAR") }], "condicion_saldo": string (10-140, completa "el saldo se paga cuando …"), "nota_personal": string (15-220), "proximos_pasos": [3 strings de 10-140] },
  "cierre": { "linea1": string (20-160), "linea2": string (15-120) }
}`;

export interface GenerarCotizacionInput {
  contexto_cliente: string;
  modulos_sugeridos?: string;
  precios_netos?: number[];
  mensualidad_neto?: number;
  esquema_pago?: { porcentaje: number; momento: string }[];
}

export interface GenerarCotizacionResult {
  data: Cotizacion;
  intentos: number;
}

function buildUserMessage(input: GenerarCotizacionInput, hoy: Date): string {
  const meses = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
  ];
  const mesAnio = `${meses[hoy.getMonth()]} ${hoy.getFullYear()}`;
  const parts: string[] = [
    SCHEMA_HINT,
    `\nEJEMPLO DE REFERENCIA (caso real M&M Moda — este es el estándar de calidad de redacción que debes igualar):\n${JSON.stringify(MMODA_EXAMPLE, null, 2)}`,
    `\nFecha actual: usa "mes_anio": "${mesAnio}" y "anio": "${hoy.getFullYear()}".`,
    `\nCONTEXTO DEL CLIENTE:\n${input.contexto_cliente}`,
  ];
  if (input.modulos_sugeridos?.trim()) {
    parts.push(`\nMÓDULOS SUGERIDOS (respeta esta estructura de módulos):\n${input.modulos_sugeridos.trim()}`);
  }
  if (input.precios_netos && input.precios_netos.length > 0) {
    parts.push(
      `\nPRECIOS NETOS ENTREGADOS (en CLP, sin IVA — úsalos EXACTOS y en este orden, un módulo por precio; genera exactamente ${input.precios_netos.length} módulos): ${input.precios_netos.join(", ")}`
    );
  } else {
    parts.push(`\nNo se entregaron precios netos: usa -1 en cada neto para marcarlos como pendientes.`);
  }
  if (input.mensualidad_neto != null) {
    parts.push(`\nMENSUALIDAD NETO ENTREGADA (CLP sin IVA, úsala EXACTA): ${input.mensualidad_neto}`);
  } else {
    parts.push(
      `\nNo se entregó mensualidad: si el contexto no menciona mantención/hosting mensual, usa "mensualidad": null; si la menciona sin precio, usa neto -1.`
    );
  }
  if (input.esquema_pago && input.esquema_pago.length > 0) {
    parts.push(`\nESQUEMA DE PAGO ENTREGADO (úsalo EXACTO): ${JSON.stringify(input.esquema_pago)}`);
  }
  return parts.join("\n");
}

export async function generarContenidoCotizacion(
  input: GenerarCotizacionInput,
  opts?: { hoy?: Date }
): Promise<GenerarCotizacionResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(input, opts?.hoy ?? new Date()) },
  ];

  const MAX_RETRIES = 2;
  let lastError = "";

  for (let intento = 1; intento <= MAX_RETRIES + 1; intento++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages,
    });
    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = "La respuesta no es JSON válido. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional.";
      messages.push({ role: "assistant", content: raw.slice(0, 4000) });
      messages.push({ role: "user", content: `ERROR DE VALIDACIÓN — corrige y reenvía el JSON completo:\n${lastError}` });
      continue;
    }

    const result = CotizacionSchema.safeParse(parsed);
    if (!result.success) {
      lastError = result.error.issues
        .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
        .join("\n");
      messages.push({ role: "assistant", content: raw.slice(0, 8000) });
      messages.push({
        role: "user",
        content: `ERROR DE VALIDACIÓN DEL SCHEMA — corrige estos campos y reenvía el JSON COMPLETO corregido:\n${lastError}`,
      });
      continue;
    }

    const bizErrors = validarPreciosEntregados(result.data, input.precios_netos, input.mensualidad_neto);
    if (bizErrors.length > 0) {
      lastError = bizErrors.map((e) => `- ${e}`).join("\n");
      messages.push({ role: "assistant", content: raw.slice(0, 8000) });
      messages.push({
        role: "user",
        content: `ERROR DE REGLAS DE NEGOCIO — corrige y reenvía el JSON COMPLETO corregido:\n${lastError}`,
      });
      continue;
    }

    return { data: result.data, intentos: intento };
  }

  throw new Error(
    `El contenido generado no pasó la validación después de ${MAX_RETRIES + 1} intentos. Último error:\n${lastError}`
  );
}
