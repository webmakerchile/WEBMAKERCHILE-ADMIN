import { z } from "zod";

/**
 * Schema del CONTENIDO de una cotización (lo único que genera el LLM).
 * Sin montos calculados, sin HTML: solo textos y precios netos enteros.
 * neto = -1 significa "precio pendiente" (bloquea la generación del PDF
 * con un error claro, nunca genera un PDF malo).
 */

const netoSchema = z
  .number()
  .int()
  .refine((n) => n > 0 || n === -1, {
    message: "neto debe ser un entero positivo (o -1 si el precio está pendiente); nunca 0 ni con IVA incluido",
  });

export const CotizacionSchema = z.object({
  meta: z.object({
    cliente_nombre: z.string().min(2),
    empresa: z.string().min(2),
    empresa_descripcion: z.string().min(5).max(60),
    mes_anio: z.string().regex(/^[A-ZÁÉÍÓÚÑ]+ \d{4}$/, 'Formato "JULIO 2026" (mes en mayúsculas + año)'),
    anio: z.string().length(4),
  }),
  portada: z
    .object({
      titulo: z.string().min(10).max(60),
      titulo_resaltado: z.string().min(3).max(30),
      subtitulo: z.string().min(40).max(240),
      alcance_titulo: z.string().min(8).max(60),
      alcance_detalle: z.string().min(8).max(70),
    })
    .refine((p) => p.titulo.includes(p.titulo_resaltado), {
      message: "titulo_resaltado debe ser substring exacto de titulo",
    }),
  contexto: z.object({
    titulo: z.string().min(15).max(90),
    titulo_resaltado: z.string().min(3).max(60).optional(),
    parrafos: z.array(z.string().min(60).max(500)).length(2),
    stats: z
      .array(z.object({ valor: z.string().min(1).max(10), descripcion: z.string().min(10).max(90) }))
      .length(3),
    soluciones: z.array(z.string().min(20).max(160)).length(4),
  }),
  alcance_titulo: z.string().min(15).max(90).optional(),
  alcance_titulo_resaltado: z.string().min(3).max(60).optional(),
  modulos: z
    .array(
      z.object({
        nombre: z.string().min(5).max(45),
        descripcion: z.string().min(30).max(240),
        neto: netoSchema,
      })
    )
    .min(1)
    .max(4),
  nota_alcance: z.string().min(20).max(300),
  como_funciona: z.object({
    titulo: z.string().min(15).max(90),
    titulo_resaltado: z.string().min(3).max(60).optional(),
    intro: z.string().min(15).max(140).optional(),
    items: z
      .array(
        z.object({
          actor: z.string().min(2).max(12),
          titulo: z.string().min(5).max(45),
          descripcion: z.string().min(20).max(160),
        })
      )
      .length(6),
  }),
  cronograma: z.object({
    titulo: z.string().min(10).max(70),
    titulo_resaltado: z.string().min(3).max(60).optional(),
    intro: z.string().min(15).max(120),
    fases: z
      .array(z.object({ titulo: z.string().min(5).max(50), descripcion: z.string().min(20).max(180) }))
      .min(3)
      .max(4),
    nota: z.string().min(20).max(220),
  }),
  mensualidad: z
    .object({
      titulo: z.string().min(10).max(90).optional(),
      titulo_resaltado: z.string().min(3).max(60).optional(),
      intro: z.string().min(10).max(140).optional(),
      neto: netoSchema,
      incluye: z
        .array(z.object({ titulo: z.string().min(5).max(40), descripcion: z.string().min(15).max(140) }))
        .length(4),
      no_cubre: z.array(z.string().min(10).max(180)).min(2).max(4),
    })
    .nullable()
    .optional(),
  pago: z
    .object({
      titulo: z.string().min(10).max(90).optional(),
      titulo_resaltado: z.string().min(3).max(60).optional(),
      esquema: z
        .array(z.object({ porcentaje: z.number().int().positive(), momento: z.string().min(3).max(25) }))
        .min(1)
        .max(3),
      condicion_saldo: z.string().min(10).max(140),
      nota_personal: z.string().min(15).max(220),
      proximos_pasos: z.array(z.string().min(10).max(140)).length(3),
    })
    .refine((p) => p.esquema.reduce((a, h) => a + h.porcentaje, 0) === 100, {
      message: "Los porcentajes de pago deben sumar 100",
    }),
  cierre: z.object({ linea1: z.string().min(20).max(160), linea2: z.string().min(15).max(120) }),
});

export type Cotizacion = z.infer<typeof CotizacionSchema>;

/**
 * Reglas de negocio adicionales al schema: si el usuario entregó precios netos
 * en el request, los netos del JSON deben coincidir exactamente. Lo mismo para
 * el esquema de pago solicitado: los porcentajes deben respetarse tal cual.
 */
export function validarPreciosEntregados(
  data: Cotizacion,
  preciosNetos?: (number | null)[] | null,
  mensualidadNeto?: number | null,
  esquemaPago?: { porcentaje: number; momento: string }[] | null
): string[] {
  const errores: string[] = [];
  if (preciosNetos && preciosNetos.length > 0) {
    if (data.modulos.length !== preciosNetos.length) {
      errores.push(
        `Se entregaron ${preciosNetos.length} precios netos pero el JSON tiene ${data.modulos.length} módulos; deben coincidir en cantidad y orden.`
      );
    } else {
      data.modulos.forEach((m, i) => {
        // `null` en una posición significa "este estímalo tú". Antes no existía
        // esa posibilidad: o venían todos los precios o ninguno, así que quien
        // sabía el precio de tres módulos de cuatro veía cómo la IA se
        // inventaba también esos tres.
        const esperado = preciosNetos[i];
        if (esperado == null) return;
        if (m.neto !== esperado) {
          errores.push(
            `El módulo ${i + 1} ("${m.nombre}") tiene neto ${m.neto} pero el precio entregado es ${esperado}; usa exactamente el precio entregado.`
          );
        }
      });
    }
  }
  if (mensualidadNeto != null) {
    if (!data.mensualidad) {
      errores.push(`Se entregó mensualidad neto ${mensualidadNeto} pero el JSON no incluye el objeto mensualidad.`);
    } else if (data.mensualidad.neto !== mensualidadNeto) {
      errores.push(
        `La mensualidad tiene neto ${data.mensualidad.neto} pero el precio entregado es ${mensualidadNeto}; usa exactamente el precio entregado.`
      );
    }
  }
  if (esquemaPago && esquemaPago.length > 0) {
    const pedidos = esquemaPago.map((h) => h.porcentaje);
    const generados = data.pago.esquema.map((h) => h.porcentaje);
    if (
      generados.length !== pedidos.length ||
      generados.some((p, i) => p !== pedidos[i])
    ) {
      errores.push(
        `El esquema de pago entregado es [${pedidos.join("/")}] pero el JSON tiene [${generados.join("/")}]; usa exactamente los porcentajes entregados, en ese orden.`
      );
    }
  }
  return errores;
}
