// backend/generarHistoria.js
// Endpoint para generar imágenes de Historias (Stories) para WebMakerLatam
// Stack: Node.js + Google Gemini (Imagen)

import { GoogleGenAI } from "@google/genai";
import Database from "@replit/database";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = new Database();

// ============================================
// POSES SEGÚN TIPO DE CONTENIDO
// ============================================
const POSES = {
  tip_tech: [
    "apuntando con el dedo índice hacia arriba con expresión de '¡importante!', cejas levantadas",
    "con una bombilla de idea flotando sobre su cabeza, sonrisa de descubrimiento",
    "tecleando en una laptop con cara concentrada, lentes brillando",
    "sosteniendo un engranaje/tuerca con mirada analítica, postura de experto",
    "señalando un código flotante abstracto con el dedo, expresión explicativa",
  ],
  motivacional: [
    "con los dos brazos levantados en pose de victoria, sonrisa enorme",
    "en pose de superhéroe con manos en la cintura, mirada confiada",
    "corriendo hacia adelante con sonrisa determinada, cola ondeando",
    "saltando con un puño al aire, expresión de triunfo",
    "meditando sentado con piernas cruzadas, aura de calma y enfoque",
  ],
  comunidad: [
    "saludando con la pata levantada, sonrisa amigable tipo 'hola'",
    "sosteniendo una taza de café humeante, relajado y acogedor",
    "con audífonos grandes puestos frente a un micrófono, grabando contenido",
    "riéndose con las dos patas en el estómago, expresión genuina",
    "dando un abrazo al aire con brazos abiertos, cara de cariño",
  ],
};

// ============================================
// BUILDER DEL PROMPT
// ============================================
function construirPromptHistoria({ tipo_historia, concepto, pose_override }) {
  const posesDisponibles = POSES[tipo_historia] || POSES.comunidad;
  const poseSeleccionada =
    pose_override ||
    posesDisponibles[Math.floor(Math.random() * posesDisponibles.length)];

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam.

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 35% del área visual CENTRAL. Es el PROTAGONISTA absoluto
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas
- POSE Y EXPRESIÓN OBLIGATORIA para esta historia: ${poseSeleccionada}

CONTEXTO DE LA HISTORIA:
TIPO: "${tipo_historia}"
CONCEPTO CLAVE: "${concepto}"
Adapta los objetos/iconos de la escena al concepto clave, pero NUNCA escribas el concepto como texto en la imagen.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- El 20% SUPERIOR (0px a 384px) debe ser fondo limpio SIN elementos - reservado para logo/handle
- El 25% INFERIOR (1440px a 1920px) debe ser fondo limpio SIN elementos - reservado para CTA/sticker
- Toda la acción visual se concentra entre el píxel 384 y 1440 (zona central)
- NADA puede existir en las zonas reservadas: ni el zorro, ni objetos, ni sombras, ni líneas

COMPOSICIÓN:
- El zorro ocupa el centro vertical de la imagen (entre píxeles 500 y 1400 aprox.)
- 1-3 objetos/iconos flotantes acompañan al zorro, relacionados al tipo de contenido
- Composición LIMPIA y respirable, estilo "sticker premium"
- Los objetos pueden tener un leve efecto de flotación con glow sutil

CONTRASTE DE ESTILOS (IMPORTANTE):
- El ZORRO y los OBJETOS/ICONOS se dibujan en estilo FLAT CARTOON: líneas gruesas negras, colores planos vibrantes, sin degradados, sin sombras realistas
- El FONDO es premium y oscuro con efectos de iluminación elegantes
- Este contraste entre personaje cartoon sobre fondo premium es intencional

FONDO PREMIUM:
- Color base: gradiente radial desde el centro con #1E293B (slate 800) hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% de opacidad)
- Glow ambiental naranja (#E86A30 al 20% de opacidad) con blur amplio detrás del zorro como halo
- Pequeñas partículas de luz flotantes (3-5 puntitos blancos difusos) para dar sensación premium
- Las zonas superior (20%) e inferior (25%) mantienen el tono oscuro limpio sin elementos

PALETA:
- Fondo: slate oscuros (#0F172A, #1E293B) con glow naranja difuso
- Zorro: naranja vibrante PLANO, verde sólido en camiseta, líneas gruesas negras
- Objetos: colores planos vibrantes (naranja, verde, blanco, azul eléctrico, rojo), contornos gruesos negros

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte. El zorro debe verse EXACTAMENTE como en la referencia sobre un fondo oscuro premium con zonas superior e inferior limpias para overlay de texto posterior.`;
}

// ============================================
// HANDLER DEL ENDPOINT
// ============================================
export async function generarHistoriaHandler(req, res) {
  try {
    const { tipo_historia, concepto, pose_override } = req.body;

    // Validaciones
    if (!tipo_historia || !concepto) {
      return res.status(400).json({
        success: false,
        error: "Faltan campos requeridos: tipo_historia y concepto",
      });
    }

    const tiposValidos = ["tip_tech", "motivacional", "comunidad"];
    if (!tiposValidos.includes(tipo_historia)) {
      return res.status(400).json({
        success: false,
        error: `tipo_historia debe ser uno de: ${tiposValidos.join(", ")}`,
      });
    }

    // Construir prompt
    const prompt = construirPromptHistoria({
      tipo_historia,
      concepto,
      pose_override,
    });

    // Generar imagen con Gemini Imagen
    const response = await ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "9:16",
        personGeneration: "allow_all",
      },
    });

    const imagenBase64 = response.generatedImages[0].image.imageBytes;
    const imagenDataUrl = `data:image/png;base64,${imagenBase64}`;

    // Guardar en Replit DB
    const id = `historia_${Date.now()}`;
    const registro = {
      id,
      tipo_historia,
      concepto,
      pose_usada: pose_override || "aleatoria",
      fecha: new Date().toISOString(),
      imagen: imagenDataUrl,
    };

    await db.set(id, registro);

    return res.json({
      success: true,
      data: {
        id,
        imagen: imagenDataUrl,
        tipo_historia,
        concepto,
        fecha: registro.fecha,
      },
    });
  } catch (error) {
    console.error("Error generando historia:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Error interno del servidor",
    });
  }
}

// ============================================
// LISTAR HISTORIAS GUARDADAS
// ============================================
export async function listarHistoriasHandler(req, res) {
  try {
    const keys = await db.list("historia_");
    const historias = await Promise.all(keys.map((key) => db.get(key)));

    // Ordenar por fecha descendente
    historias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return res.json({ success: true, data: historias });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
