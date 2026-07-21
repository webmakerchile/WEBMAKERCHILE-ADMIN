// Guías por red social compartidas entre los generadores de contenido con IA:
// - lib/generate-descriptions.ts (descripciones automáticas de videos)
// - routes/community/index.ts (generador de comunidad: posts + historias)
// Única fuente de verdad para límites de caracteres, cantidad de hashtags y
// nombre de marca. Antes estos valores vivían duplicados y contradictorios en
// ambos archivos (ej: Instagram 5-10 vs 8-12 hashtags, marca "WebMakerChile"
// vs "WebMakerLatam").

// Marca canon: el resto del código (mascota registrada, hashtags de marca,
// catálogo de servicios, CTAs) usa "WebMakerLatam".
export const BRAND_NAME = "WebMakerLatam";

export const BRAND_HASHTAGS = ["#WebMakerLatam", "#WebMaker", "#ComunidadWebMaker"] as const;

export type PlatformKey = "tiktok" | "instagram" | "youtube" | "linkedin" | "x" | "facebook";

// Límites de caracteres por red — los mismos que valida/pinta la UI
// (ver admin-panel: lang.tsx y components/network-previews/limits.ts).
export const PLATFORM_LIMITS: Record<PlatformKey, number> = {
  tiktok: 2200,
  instagram: 2200,
  youtube: 5000,
  linkedin: 3000,
  x: 280,
  facebook: 500,
};

// Rango de hashtags recomendado por red (texto listo para inyectar en prompts).
export const PLATFORM_HASHTAGS = {
  tiktok: "4-6",
  instagram: "5-10",
  youtube_shorts: "4-6",
  linkedin: "2-3",
  x: "1-2",
  facebook: "1-3",
} as const;

// Guía completa por red para prompts de generación de descripciones.
export const PLATFORM_GUIDES: Record<PlatformKey, string> = {
  tiktok: `TikTok (máx ${PLATFORM_LIMITS.tiktok}): tono cercano, hook fuerte en la 1ra línea, ${PLATFORM_HASHTAGS.tiktok} hashtags relevantes en español.`,
  instagram: `Instagram (máx ${PLATFORM_LIMITS.instagram}): tono inspirador, emojis moderados, ${PLATFORM_HASHTAGS.instagram} hashtags al final en español.`,
  youtube: `YouTube descripción (máx ${PLATFORM_LIMITS.youtube}): primer párrafo descriptivo con keywords SEO, luego beneficios, sin hashtags.`,
  linkedin: `LinkedIn (máx ${PLATFORM_LIMITS.linkedin} caracteres): tono profesional, sin emojis excesivos, ${PLATFORM_HASHTAGS.linkedin} hashtags al final.`,
  x: `X/Twitter (HASTA ${PLATFORM_LIMITS.x} caracteres ESTRICTOS, incluyendo hashtags): un solo tweet conciso, ${PLATFORM_HASHTAGS.x} hashtags.`,
  facebook: `Facebook (máx ${PLATFORM_LIMITS.facebook} caracteres): tono cercano y conversacional, ${PLATFORM_HASHTAGS.facebook} hashtags, invita a interactuar (comentar/compartir).`,
};
