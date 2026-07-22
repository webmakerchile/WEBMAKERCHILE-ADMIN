/* ============================================================
   HUB EJECUTIVO — punto de entrada
   La página vive en ./ejecutivo/ (datos del servidor vía
   TanStack Query contra /api/hub/*). Este archivo solo re-exporta
   el componente para que el lazy import de App.tsx no cambie.
   ============================================================ */
export { default } from "./ejecutivo/page";
