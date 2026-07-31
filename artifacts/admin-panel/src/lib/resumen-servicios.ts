// Qué se le contrató a este proyecto, en un solo sitio.
//
// Hoy no existe: `hub_services` es un catálogo GLOBAL, sin ninguna relación con
// un proyecto ni con un contrato. Lo único que ata trabajo con lo vendido es el
// contrato, y está partido en dos documentos que nadie cruza:
//
//   · `doc.modules`  — lo comercial: qué módulos se vendieron y a qué precio.
//   · `brief.alcance` — lo técnico: qué hay que construir en cada módulo.
//
// Son la misma lista contada dos veces, con nombres de campo distintos
// (`name`/`desc` frente a `modulo`/`descripcion`) y generadas por separado, así
// que divergen. Programación abre el brief y no sabe si eso es todo lo
// contratado; ventas mira el doc y no sabe qué implica construirlo.
//
// Esto los cruza. Es todo derivado —no hay tabla nueva— y las funciones son
// puras porque el fallo que importa no es una pantalla rota: es un módulo
// vendido que no aparece en el resumen y que por tanto nadie construye.

import type { HubContract, HubProject, HubBriefModule } from "@/lib/hub-owner";

/**
 * Lo mínimo de una tarea para contar avance.
 *
 * No se pide `HubTask` entero porque /mis-tareas trabaja con `TareaVista`, que
 * es la misma tarea con otra forma. Exigir el tipo completo obligaría a
 * convertirla solo para contar, y esa conversión es justo donde se cuelan los
 * errores.
 */
export interface TareaContable {
  projectId: string;
  stage: string;
}

/** Un módulo del proyecto, ya cruzado entre lo comercial y lo técnico. */
export interface ModuloResumen {
  nombre: string;
  descripcion: string;
  /** Importe, o null si el rol no ve montos o el módulo no lo trae. */
  precio: number | null;
  entregables: string[];
  requisitos: string[];
  /** De dónde salió: sirve para avisar de lo que solo está en un lado. */
  origen: "ambos" | "comercial" | "tecnico";
}

export interface ResumenProyecto {
  proyectoId: string;
  contrato: HubContract | null;
  modulos: ModuloResumen[];
  objetivo: string;
  criteriosAceptacion: string[];
  fueraDeAlcance: string[];
  stack: string[];
  hitos: { nombre: string; detalle: string }[];
  /** Suma de los importes visibles, o null si no se ven montos. */
  total: number | null;
  /** true cuando el servidor censuró los montos para este rol. */
  sinMontos: boolean;
  avance: { hechas: number; total: number; pct: number };
}

/** Clave de comparación de nombres de módulo: sin tildes, sin puntuación. */
export function claveModulo(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cruza los módulos comerciales con los del brief.
 *
 * Se emparejan por nombre normalizado, pero lo que NO empareja no se descarta:
 * se marca de dónde vino. Un módulo que solo está en el brief es trabajo que
 * nadie facturó; uno que solo está en el doc es trabajo vendido que nadie
 * especificó. Las dos cosas hay que verlas, y descartarlas en silencio para
 * que la lista quede limpia es exactamente cómo se pierden.
 */
export function cruzarModulos(
  comerciales: readonly { name: string; desc?: string; price?: number }[],
  tecnicos: readonly HubBriefModule[],
  verMontos: boolean,
): ModuloResumen[] {
  const porClave = new Map<string, ModuloResumen>();
  const orden: string[] = [];

  for (const m of comerciales) {
    const nombre = String(m?.name ?? "").trim();
    if (!nombre) continue;
    const k = claveModulo(nombre);
    if (!porClave.has(k)) orden.push(k);
    porClave.set(k, {
      nombre,
      descripcion: String(m?.desc ?? "").trim(),
      precio: verMontos && typeof m?.price === "number" && Number.isFinite(m.price) ? m.price : null,
      entregables: [],
      requisitos: [],
      origen: "comercial",
    });
  }

  for (const t of tecnicos) {
    const nombre = String(t?.modulo ?? "").trim();
    if (!nombre) continue;
    const k = claveModulo(nombre);
    const previo = porClave.get(k);
    const entregables = Array.isArray(t?.entregables) ? t.entregables.filter(Boolean) : [];
    const requisitos = Array.isArray(t?.requisitos) ? t.requisitos.filter(Boolean) : [];

    if (previo) {
      porClave.set(k, {
        ...previo,
        // La descripción técnica es la útil para construir; la comercial se
        // conserva solo si el brief no trajo ninguna.
        descripcion: String(t?.descripcion ?? "").trim() || previo.descripcion,
        entregables,
        requisitos,
        origen: "ambos",
      });
      continue;
    }
    orden.push(k);
    porClave.set(k, {
      nombre,
      descripcion: String(t?.descripcion ?? "").trim(),
      precio: null,
      entregables,
      requisitos,
      origen: "tecnico",
    });
  }

  return orden.map((k) => porClave.get(k)!).filter(Boolean);
}

/** Avance del proyecto según sus tareas. */
export function avanceDeTareas(tareas: readonly TareaContable[], proyectoId: string) {
  const propias = tareas.filter((t) => t.projectId === proyectoId);
  const hechas = propias.filter((t) => t.stage === "done").length;
  return {
    hechas,
    total: propias.length,
    pct: propias.length === 0 ? 0 : Math.round((hechas / propias.length) * 100),
  };
}

/**
 * Resumen completo de un proyecto.
 *
 * Sin contrato asociado devuelve igualmente el avance: un proyecto interno o
 * uno cuyo contrato aún no se cargó sigue teniendo trabajo que mostrar, y
 * devolver null dejaría la sección en blanco sin explicar por qué.
 */
export function resumenDeProyecto(
  proyecto: HubProject,
  contratos: readonly HubContract[],
  tareas: readonly TareaContable[],
): ResumenProyecto {
  const contrato = contratos.find((c) => c.id === proyecto.contractId) ?? null;
  // `moneyRedacted` lo marca el servidor al censurar: es la única señal fiable
  // de si este rol ve montos. Mirar si `value` está vacío confundiría un
  // contrato sin precio con uno censurado.
  const sinMontos = Boolean(contrato?.moneyRedacted);

  const modulos = cruzarModulos(
    Array.isArray(contrato?.doc?.modules) ? contrato!.doc!.modules! : [],
    Array.isArray(contrato?.brief?.alcance) ? contrato!.brief!.alcance : [],
    !sinMontos,
  );

  const conPrecio = modulos.filter((m) => m.precio !== null);
  return {
    proyectoId: proyecto.id,
    contrato,
    modulos,
    objetivo: contrato?.brief?.objetivo ?? "",
    criteriosAceptacion: contrato?.brief?.criteriosAceptacion ?? [],
    fueraDeAlcance: contrato?.brief?.fueraDeAlcance ?? [],
    stack: contrato?.brief?.stackSugerido ?? [],
    hitos: contrato?.brief?.hitos ?? [],
    // Null y no 0: "no se ven los montos" y "suman cero" son cosas distintas, y
    // enseñar $0 en un contrato censurado sería una cifra falsa.
    total: sinMontos || conPrecio.length === 0 ? null : conPrecio.reduce((s, m) => s + (m.precio ?? 0), 0),
    sinMontos,
    avance: avanceDeTareas(tareas, proyecto.id),
  };
}

/** Módulos que están en un solo lado del contrato: lo que hay que revisar. */
export function modulosDescuadrados(resumen: ResumenProyecto) {
  return {
    sinEspecificar: resumen.modulos.filter((m) => m.origen === "comercial"),
    sinFacturar: resumen.modulos.filter((m) => m.origen === "tecnico"),
  };
}
