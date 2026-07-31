/**
 * Huella de contenido de un contrato: documento (cotización) y brief técnico.
 *
 * "Desactualizado" ya no es una bandera pegajosa que se enciende con cualquier
 * edición: es una comparación real — hash del contenido actual vs hash del
 * contenido con el que se generó el último PDF. Editar con la IA sin cambiar
 * nada material produce el mismo hash y por lo tanto NO marca el documento.
 *
 * IMPORTANTE: este archivo existe COPIADO BYTE A BYTE en dos lugares:
 *   - artifacts/api-server/src/lib/contrato-hash.ts
 *   - artifacts/admin-panel/src/lib/contrato-hash.ts
 * Un test del api-server (contrato-hash.test.ts) exige que ambos sean
 * idénticos. Si cambias uno, copia el archivo completo al otro lado.
 * Por eso mismo: cero imports, solo funciones puras.
 */

type Rec = Record<string, unknown>;

/** String recortado; null/undefined → "". */
function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

/** Número finito; cualquier otra cosa → 0. */
function num(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s) => s !== "");
}

/**
 * Normaliza el documento (WizData) a sus campos MATERIALES:
 * lo que de verdad cambia el PDF. Se descartan ids de módulos (cosméticos)
 * y los módulos sin nombre (el render también los ignora).
 */
export function normalizeDocContrato(doc: unknown): Rec {
  const d = (doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {}) as Rec;
  const mods = Array.isArray(d.modules) ? (d.modules as unknown[]) : [];
  return {
    client: str(d.client),
    project: str(d.project),
    scope: str(d.scope),
    date: str(d.date),
    advisor: str(d.advisor),
    modules: mods
      .map((m) => {
        const mm = (m && typeof m === "object" ? m : {}) as Rec;
        return { name: str(mm.name), desc: str(mm.desc), price: num(mm.price) };
      })
      .filter((m) => m.name !== ""),
    downPct: num(d.downPct),
    notes: str(d.notes),
    monthly: str(d.monthly),
    monthlyPrice: str(d.monthlyPrice),
    validityDays: num(d.validityDays),
  };
}

/** Normaliza el brief técnico; descarta `generatedAt` (no es contenido). */
export function normalizeBriefContrato(brief: unknown): Rec {
  const b = (brief && typeof brief === "object" && !Array.isArray(brief) ? brief : {}) as Rec;
  const alcance = Array.isArray(b.alcance) ? (b.alcance as unknown[]) : [];
  const hitos = Array.isArray(b.hitos) ? (b.hitos as unknown[]) : [];
  return {
    objetivo: str(b.objetivo),
    contexto: str(b.contexto),
    alcance: alcance.map((a) => {
      const aa = (a && typeof a === "object" ? a : {}) as Rec;
      return {
        modulo: str(aa.modulo),
        descripcion: str(aa.descripcion),
        entregables: strList(aa.entregables),
        requisitos: strList(aa.requisitos),
      };
    }),
    criteriosAceptacion: strList(b.criteriosAceptacion),
    fueraDeAlcance: strList(b.fueraDeAlcance),
    stackSugerido: strList(b.stackSugerido),
    hitos: hitos.map((h) => {
      const hh = (h && typeof h === "object" ? h : {}) as Rec;
      return { nombre: str(hh.nombre), detalle: str(hh.detalle) };
    }),
  };
}

/** JSON determinista: claves ordenadas, sin espacios. */
function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (typeof v === "object") {
    const rec = v as Rec;
    const keys = Object.keys(rec).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(rec[k])).join(",") + "}";
  }
  return "null";
}

/** FNV-1a 32 bits sobre las unidades de código del string (idéntico en ambos lados). */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Dos pasadas con sal distinta → 16 hex; suficiente para detectar cambios. */
function huella(s: string): string {
  return "v1:" + fnv1a32("a|" + s) + fnv1a32("b|" + s);
}

/** Hash del contenido material del documento de cotización. */
export function hashDocContrato(doc: unknown): string {
  return huella(stableStringify(normalizeDocContrato(doc)));
}

/** Hash del contenido material del brief técnico. */
export function hashBriefContrato(brief: unknown): string {
  return huella(stableStringify(normalizeBriefContrato(brief)));
}
