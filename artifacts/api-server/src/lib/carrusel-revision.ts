// Revisión de coherencia de un carrusel.
//
// El carrusel ya se generaba en UNA sola llamada, así que las slides comparten
// contexto — pero nadie comprobaba el resultado. Historias sí tiene esa segunda
// pasada (`revisarGuion`) y por eso sus series salen enteras: el modelo repite
// titulares, deja slides vacías o abre con una fórmula de manual, y sin revisión
// eso llega tal cual al usuario.
//
// Vive fuera de la ruta para poder probarlo sin llamar al modelo.

export interface SlideRevisable {
  numero: number;
  rol: string;
  titulo: string;
  subtitulo: string;
  prompt_visual?: string;
}

/** Aperturas de manual: delatan que el hook no se pensó. */
const APERTURAS_DE_MANUAL = [
  "sabías que", "sabias que", "te imaginas", "¿te imaginas", "alguna vez te ha pasado",
  "imagina que", "y si te dijera", "descubre cómo", "descubre como",
];

/** Muletillas de plataforma que no aportan y envejecen mal. */
const MULETILLAS = [
  "desliza", "swipe", "sigue leyendo", "no te lo pierdas", "link en bio",
  "dale like", "comparte esto", "guarda esto",
];

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

const VACIAS = new Set([
  "el", "la", "los", "las", "un", "una", "de", "del", "que", "y", "o", "a", "en",
  "con", "por", "para", "su", "sus", "tu", "tus", "es", "son", "se", "lo", "al",
  "mas", "muy", "ya", "no", "si", "te", "le", "me", "esta", "este", "esto",
]);

/**
 * Palabras con carga semántica, reducidas a su raíz aproximada.
 *
 * El truncado a 5 caracteres hace de lematizador pobre pero suficiente:
 * "carga" y "cargar" son la misma idea repetida, y sin esto la repetición más
 * común del español —cambiar la conjugación— pasaba desapercibida.
 */
function significativas(t: string): Set<string> {
  return new Set(
    normalizar(t)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !VACIAS.has(w))
      .map((w) => w.slice(0, 5)),
  );
}

/** Cuánto se parecen dos textos, 0 a 1 (Jaccard sobre palabras con carga). */
export function similitud(a: string, b: string): number {
  const A = significativas(a);
  const B = significativas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / new Set([...A, ...B]).size;
}

/**
 * Problemas que justifican pedirle al modelo una segunda pasada.
 *
 * Devuelve frases accionables, no códigos: se le reenvían tal cual al modelo,
 * así que tienen que decir qué corregir.
 */
export function revisarCarrusel(slides: SlideRevisable[], esCarrusel: boolean): string[] {
  const issues: string[] = [];
  if (slides.length === 0) return ["no se generó ninguna slide"];

  for (const s of slides) {
    if (!s.titulo.trim()) issues.push(`la slide ${s.numero} se quedó sin título`);
    if (!s.prompt_visual?.trim()) issues.push(`la slide ${s.numero} no trae prompt_visual`);

    // Sin la puntuación de apertura: el modelo escribe "¿Sabías que...?" y
    // comparar contra el inicio crudo dejaba pasar justo la forma más común.
    const t = normalizar(s.titulo).replace(/^[¿¡"'“”‘’(\[\s]+/u, "");
    const apertura = APERTURAS_DE_MANUAL.find((a) => t.startsWith(normalizar(a)));
    if (apertura) {
      issues.push(`la slide ${s.numero} abre con la fórmula de manual "${apertura}": reescríbela`);
    }
    const muletilla = MULETILLAS.find(
      (m) => t.includes(normalizar(m)) || normalizar(s.subtitulo).includes(normalizar(m)),
    );
    if (muletilla) {
      issues.push(`la slide ${s.numero} usa "${muletilla}", que está prohibido: quítalo`);
    }
    // El subtítulo que repite el titular es la firma número uno del texto de
    // máquina: si al borrar el titular el subtítulo dice lo mismo, sobra.
    // 0.45 y no más: a partir de ahí el subtítulo ya está diciendo lo mismo
    // con otras palabras, que es la firma número uno del texto de máquina.
    if (s.subtitulo.trim() && similitud(s.titulo, s.subtitulo) >= 0.45) {
      issues.push(`en la slide ${s.numero} el subtítulo repite el título: que aporte información nueva`);
    }
  }

  // Titulares repetidos entre slides = el carrusel no avanza.
  for (let i = 0; i < slides.length; i++) {
    for (let j = i + 1; j < slides.length; j++) {
      const a = slides[i]!;
      const b = slides[j]!;
      if (!a.titulo || !b.titulo) continue;
      if (normalizar(a.titulo) === normalizar(b.titulo) || similitud(a.titulo, b.titulo) >= 0.7) {
        issues.push(`las slides ${a.numero} y ${b.numero} dicen lo mismo: el carrusel tiene que avanzar`);
      }
    }
  }

  if (esCarrusel && slides.length > 1) {
    if (slides[0]!.rol !== "portada") issues.push("la primera slide debería ser la portada (el hook)");
    if (slides[slides.length - 1]!.rol !== "cta") issues.push("la última slide debería ser el cierre con la invitación");
  }

  // Sin duplicados: el mismo aviso repetido no ayuda al modelo.
  return [...new Set(issues)];
}
