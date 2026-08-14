import OpenAI from "openai";

/**
 * Desglosa la descripcion de un proyecto en items cobrables para un presupuesto.
 *
 * El panel wmc expone este boton ("Generar Items (IA)") pero su endpoint nunca
 * existio del otro lado: el proxy /api/wmc/* devolvia el HTML del SPA y el
 * navegador moria al parsearlo. Se resuelve aca, en el admin, que ya tiene la
 * clave de OpenAI y el mismo patron que usa el resto de la IA del panel.
 */

const MAX_ITEMS = 20;

export interface ItemPresupuesto {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export class PresupuestoIAError extends Error {}

export async function desglosarEnItems(
  texto: string,
  nombreCliente?: string,
): Promise<ItemPresupuesto[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new PresupuestoIAError("Falta configurar OPENAI_API_KEY.");
  }
  const limpio = texto.trim();
  if (limpio.length < 15) {
    throw new PresupuestoIAError("Contame un poco mas del proyecto para poder desglosarlo.");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Sos el lider tecnico y comercial de una agencia digital chilena (sitios web, e-commerce, software a medida, branding y contenido). Armas presupuestos claros para el cliente. Responde SOLO con JSON valido.",
      },
      {
        role: "user",
        content: `Descripcion del proyecto${nombreCliente ? ` (cliente: ${nombreCliente})` : ""}:
"""
${limpio.slice(0, 12000)}
"""

Devolve este JSON exacto:
{ "items": [ { "nombre": "...", "descripcion": "...", "cantidad": 1, "precioUnitario": 250000 } ] }

Reglas:
- Entre 3 y ${MAX_ITEMS} items. Uno por entregable o modulo cobrable; no partas de mas.
- nombre: corto y comercial (max 70 caracteres). Ej: "Landing page responsiva", "Integracion Transbank/WebPay".
- descripcion: 1 o 2 frases que le vendan el valor al cliente, en espanol de Chile, sin tecnicismos innecesarios.
- precioUnitario: precio referencial de mercado en PESOS CHILENOS, numero entero sin puntos ni simbolos. Cobra lo que cobraria una agencia chilena seria: una landing simple ~250.000, un sitio corporativo ~600.000, un e-commerce ~1.200.000, integracion de pasarela ~300.000, panel de administracion a medida ~800.000, mantencion mensual ~80.000. Ajusta segun lo que se pida.
- cantidad: normalmente 1. Usa mas solo si el texto dice cuantas unidades (ej. "3 videos", "12 meses de hosting").
- Solo lo que se pueda cobrar. Si el texto menciona un bloqueo del cliente (papeles, firmas, cuentas pendientes), NO lo conviertas en item.
- No inventes servicios que nadie pidio.`,
      },
    ],
  });

  const crudo = completion.choices[0]?.message?.content || "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    throw new PresupuestoIAError("El modelo no devolvio un JSON valido.");
  }

  const bruto = Array.isArray(parsed.items) ? parsed.items : [];
  const items = bruto
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .slice(0, MAX_ITEMS)
    .map((it) => {
      const cantidad = Number(it.cantidad);
      const precio = Number(it.precioUnitario);
      return {
        name: typeof it.nombre === "string" ? it.nombre.trim().slice(0, 120) : "",
        description:
          typeof it.descripcion === "string" ? it.descripcion.trim().slice(0, 1000) : "",
        quantity: Number.isFinite(cantidad) && cantidad > 0 ? Math.round(cantidad) : 1,
        unitPrice: Number.isFinite(precio) && precio >= 0 ? Math.round(precio) : 0,
      };
    })
    .filter((it) => it.name.length > 0);

  if (items.length === 0) {
    throw new PresupuestoIAError(
      "No se pudo armar la lista con ese texto. Proba describiendo el proyecto con mas detalle.",
    );
  }
  return items;
}
