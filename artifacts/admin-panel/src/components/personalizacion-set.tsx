// Personalización del set: UN SOLO componente para Portadas, Posts IA e Historias.
//
// Estaba duplicado por sección y por eso se separaban: Historias se quedó sin
// idea, sin pose, sin utilería y con la luz rotando al azar mientras Posts IA
// ya tenía todo. Con un componente compartido, añadir una luz o cambiar un
// texto lo reciben las tres a la vez — que es justo lo que hace falta para que
// el mismo concepto no salga con dos estilos distintos.

import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, SlidersHorizontal, ChevronDown, Upload, X, Loader2, Wand2 } from "lucide-react";
import type { EstiloTitularOption } from "@/components/estilo-titular-picker";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
export const REFERENCIA_ZORRO_URL = `${import.meta.env.BASE_URL}images/fox-reference-default.png?v=2`;

/** El spotlight ámbar es la luz de la marca: es lo que sale si nadie elige. */
export const DIRECCION_PREDETERMINADA = "estudio_spotlight";
/** Valor que pide rotación entre las 8 luces (lo entiende el servidor). */
export const DIRECCION_AUTOMATICA = "auto";

export interface OpcionesSet {
  direcciones: Array<{ id: string; nombre: string; descripcion: string; colorAcento: string }>;
  poses: Array<{ id: string; etiqueta: string }>;
  estilosTitular: EstiloTitularOption[];
}

/** Lo que se manda al servidor: idéntico en las tres secciones. */
export interface PayloadSet {
  direccion_id: string;
  pose_id?: string;
  utileria?: string;
  estilo_extra?: string;
  imagen_referencia_base64?: string;
}

export interface SetEstudio {
  opciones: OpcionesSet | null;
  direccionId: string;
  poseId: string | null;
  utileria: string;
  estiloExtra: string;
  refPreview: string | null;
  refEsZorro: boolean;
  mostrar: boolean;
  setMostrar: (v: boolean) => void;
  setDireccionId: (v: string) => void;
  setPoseId: (v: string | null) => void;
  setUtileria: (v: string) => void;
  setEstiloExtra: (v: string) => void;
  cambiarReferencia: (e: React.ChangeEvent<HTMLInputElement>) => void;
  restaurarReferencia: () => void;
  /** Aplica el set que propuso la IA. Devuelve true si cambió algo. */
  aplicarSugerencia: (s: { direccion_id?: string | null; pose_id?: string | null; utileria?: string | null; estilo_extra?: string | null }) => boolean;
  /** Campos listos para el cuerpo de la petición. */
  payload: () => PayloadSet;
  /** Cuántos ajustes están fuera del valor por defecto. */
  activos: number;
}

export function useSetEstudio(): SetEstudio {
  const [opciones, setOpciones] = useState<OpcionesSet | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [direccionId, setDireccionId] = useState<string>(DIRECCION_PREDETERMINADA);
  const [poseId, setPoseId] = useState<string | null>(null);
  const [utileria, setUtileria] = useState("");
  const [estiloExtra, setEstiloExtra] = useState("");
  const [refPreview, setRefPreview] = useState<string | null>(REFERENCIA_ZORRO_URL);
  const [refEsZorro, setRefEsZorro] = useState(true);
  const refBase64 = useRef<string | null>(null);
  const objetoUrl = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`${API_BASE}/community/set-options`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.success) setOpciones(d.data); })
      .catch(() => { /* sin catálogo se genera igual con el valor por defecto */ });
    return () => { vivo = false; };
  }, []);

  // Las URL de objeto hay que revocarlas o la pestaña se va llenando de blobs.
  useEffect(() => () => { if (objetoUrl.current) URL.revokeObjectURL(objetoUrl.current); }, []);

  const cambiarReferencia = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (objetoUrl.current) URL.revokeObjectURL(objetoUrl.current);
    objetoUrl.current = URL.createObjectURL(file);
    setRefPreview(objetoUrl.current);
    setRefEsZorro(false);
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result as string;
      refBase64.current = r.split(",")[1] ?? null;
    };
    reader.readAsDataURL(file);
  }, []);

  const restaurarReferencia = useCallback(() => {
    if (objetoUrl.current) { URL.revokeObjectURL(objetoUrl.current); objetoUrl.current = null; }
    setRefPreview(REFERENCIA_ZORRO_URL);
    setRefEsZorro(true);
    refBase64.current = null;
  }, []);

  const aplicarSugerencia: SetEstudio["aplicarSugerencia"] = useCallback((s) => {
    let cambio = false;
    if (s.direccion_id) { setDireccionId(s.direccion_id); cambio = true; }
    if (s.pose_id) { setPoseId(s.pose_id); cambio = true; }
    if (s.utileria) { setUtileria(s.utileria); cambio = true; }
    if (s.estilo_extra) { setEstiloExtra(s.estilo_extra); cambio = true; }
    if (cambio) setMostrar(true);
    return cambio;
  }, []);

  const payload = useCallback((): PayloadSet => ({
    direccion_id: direccionId,
    pose_id: poseId ?? undefined,
    utileria: utileria.trim() || undefined,
    estilo_extra: estiloExtra.trim() || undefined,
    imagen_referencia_base64: refEsZorro ? undefined : refBase64.current ?? undefined,
  }), [direccionId, poseId, utileria, estiloExtra, refEsZorro]);

  const activos = [
    direccionId !== DIRECCION_PREDETERMINADA ? "luz" : null,
    poseId,
    utileria.trim() || null,
    estiloExtra.trim() || null,
    refEsZorro ? null : "ref",
  ].filter(Boolean).length;

  return {
    opciones, direccionId, poseId, utileria, estiloExtra, refPreview, refEsZorro,
    mostrar, setMostrar, setDireccionId, setPoseId, setUtileria, setEstiloExtra,
    cambiarReferencia, restaurarReferencia, aplicarSugerencia, payload, activos,
  };
}

/** Bloque "Tu idea" + "Escribir con IA", el mismo par que abre Portadas. */
export function IdeaConIA({
  valor,
  onChange,
  onRedactar,
  redactando,
  etiqueta = "Tu idea",
  ayuda = "Escríbela a lo bruto — la IA la redacta y te sugiere el tema, la luz del estudio, la pose, la utilería y el estilo; después ajustas lo que quieras.",
  deshabilitado,
}: {
  valor: string;
  onChange: (v: string) => void;
  onRedactar: () => void;
  redactando: boolean;
  etiqueta?: string;
  ayuda?: string;
  deshabilitado?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-2">{etiqueta}</label>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        maxLength={2000}
        placeholder="Cuéntala con tus palabras: qué quieres mostrar, qué emoción, qué elementos…"
        className="w-full px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary min-h-[110px]"
      />
      <button
        type="button"
        onClick={onRedactar}
        disabled={redactando || deshabilitado}
        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {redactando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {redactando ? "Redactando tu idea..." : "Escribir con IA"}
      </button>
      <p className="text-xs text-muted-foreground/70 mt-1">{ayuda}</p>
    </div>
  );
}

/** Panel plegable con las 8 luces, la pose, la utilería, el estilo y la referencia. */
export function PersonalizacionSet({ set, conPose = true }: { set: SetEstudio; conPose?: boolean }) {
  const seleccionada = set.opciones?.direcciones.find((d) => d.id === set.direccionId) ?? null;

  return (
    <div className="border border-foreground/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => set.setMostrar(!set.mostrar)}
        className="w-full flex items-center justify-between px-4 py-3 bg-background/40 hover:bg-background/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          Personalización del set
          {set.activos > 0 ? (
            <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {set.activos} activo{set.activos > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${set.mostrar ? "rotate-180" : ""}`} />
      </button>

      {set.mostrar && (
        <div className="p-4 space-y-5 border-t border-foreground/10">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Iluminación del estudio</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => set.setDireccionId(DIRECCION_AUTOMATICA)}
                aria-pressed={set.direccionId === DIRECCION_AUTOMATICA}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${set.direccionId === DIRECCION_AUTOMATICA ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                Automática
              </button>
              {set.opciones?.direcciones.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => set.setDireccionId(d.id)}
                  aria-pressed={set.direccionId === d.id}
                  title={d.descripcion}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${set.direccionId === d.id ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: d.colorAcento }} />
                  <span className="truncate">{d.nombre.replace(/^Estudio /, "")}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70">
              {set.direccionId === DIRECCION_AUTOMATICA
                ? "Rota sola entre las 8 luces del estudio para que ninguna pieza se repita."
                : seleccionada
                  ? `${seleccionada.descripcion}${set.direccionId === DIRECCION_PREDETERMINADA ? " Es la luz predeterminada de la marca." : ""}`
                  : "El spotlight ámbar es la luz predeterminada de la marca."}
            </p>
          </div>

          {conPose && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Pose de Webi</label>
              <select
                value={set.poseId ?? ""}
                onChange={(e) => set.setPoseId(e.target.value || null)}
                className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all"
              >
                <option value="">Automática (según el tema)</option>
                {set.opciones?.poses.map((p) => (
                  <option key={p.id} value={p.id}>{p.etiqueta}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Utilería del set</label>
            <input
              value={set.utileria}
              onChange={(e) => set.setUtileria(e.target.value)}
              maxLength={300}
              className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:border-primary outline-none transition-all"
              placeholder="Ej: un notebook abierto, una taza de café, cajas de cartón"
            />
            <p className="text-xs text-muted-foreground/70">
              Se dibujan como objetos reales apoyados en el set e iluminados por el foco — nunca stickers.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Toque de estilo extra</label>
            <input
              value={set.estiloExtra}
              onChange={(e) => set.setEstiloExtra(e.target.value)}
              maxLength={300}
              className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:border-primary outline-none transition-all"
              placeholder="Ej: tono más dramático, ambiente festivo…"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Imagen de referencia <span className="text-xs text-muted-foreground font-normal">(el zorro va por defecto)</span>
            </label>
            {set.refPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-foreground/10">
                <img src={set.refPreview} alt="Referencia del personaje" className="w-full h-24 object-cover" />
                {set.refEsZorro ? (
                  <div className="absolute bottom-2 left-2 bg-black/60 text-xs text-white/80 px-2 py-0.5 rounded-full">
                    Zorro predeterminado
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={set.restaurarReferencia}
                    className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                    aria-label="Volver al zorro predeterminado"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                )}
                <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
                  <span className="text-sm text-white font-medium">Cambiar imagen</span>
                  <input type="file" className="hidden" accept="image/*" onChange={set.cambiarReferencia} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-foreground/20 hover:border-primary/50 hover:bg-primary/5 rounded-xl cursor-pointer transition-all group">
                <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary mb-1.5 transition-colors" />
                <span className="text-sm text-muted-foreground font-medium">Subir foto o captura</span>
                <input type="file" className="hidden" accept="image/*" onChange={set.cambiarReferencia} />
              </label>
            )}
            {!set.refEsZorro && (
              <p className="text-xs text-amber-400">
                Con tu propia referencia se desactiva el control de consistencia de Webi: el personaje será el de tu imagen.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
