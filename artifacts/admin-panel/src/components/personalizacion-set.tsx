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

export interface PresetUi { id: string; etiqueta: string; texto?: string }

export interface OpcionesSet {
  direcciones: Array<{ id: string; nombre: string; descripcion: string; colorAcento: string }>;
  poses: Array<{ id: string; etiqueta: string }>;
  estilosTitular: EstiloTitularOption[];
  gestos?: PresetUi[];
  encuadres?: Array<{ id: string; etiqueta: string; soloPrimerPlano: boolean }>;
  utileria?: Array<{ titulo: string; opciones: PresetUi[] }>;
  estilos?: PresetUi[];
  /** Poses que caben en un encuadre cerrado; el resto se apaga al elegirlo. */
  posesPrimerPlano?: string[];
}

/** Lo que se manda al servidor: idéntico en las tres secciones. */
export interface PayloadSet {
  direccion_id: string;
  pose_id?: string;
  gesto_id?: string;
  encuadre_id?: string;
  utileria?: string;
  estilo_extra?: string;
  imagen_referencia_base64?: string;
}

export interface SetEstudio {
  opciones: OpcionesSet | null;
  direccionId: string;
  poseId: string | null;
  gestoId: string | null;
  encuadreId: string | null;
  utileria: string;
  estiloExtra: string;
  refPreview: string | null;
  refEsZorro: boolean;
  mostrar: boolean;
  setMostrar: (v: boolean) => void;
  setDireccionId: (v: string) => void;
  setPoseId: (v: string | null) => void;
  setGestoId: (v: string | null) => void;
  setEncuadreId: (v: string | null) => void;
  setUtileria: (v: string) => void;
  setEstiloExtra: (v: string) => void;
  /** Añade o quita el texto de un preset dentro de un campo libre. */
  alternarPreset: (campo: "utileria" | "estiloExtra", texto: string) => void;
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
  const [gestoId, setGestoId] = useState<string | null>(null);
  const [encuadreId, setEncuadreId] = useState<string | null>(null);
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

  // Los presets escriben en el MISMO campo de texto que se puede teclear, y no
  // en una lista aparte: con dos fuentes, tocar un botón y luego editar el
  // texto dejaba el botón marcado describiendo algo que ya no se iba a pedir.
  const alternarPreset = useCallback((campo: "utileria" | "estiloExtra", texto: string) => {
    const set = campo === "utileria" ? setUtileria : setEstiloExtra;
    set((actual: string) => {
      const partes = actual.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
      const sinEl = partes.filter((p) => p !== texto);
      return (sinEl.length === partes.length ? [...partes, texto] : sinEl).join(", ");
    });
  }, []);

  const payload = useCallback((): PayloadSet => ({
    direccion_id: direccionId,
    pose_id: poseId ?? undefined,
    gesto_id: gestoId ?? undefined,
    encuadre_id: encuadreId ?? undefined,
    utileria: utileria.trim() || undefined,
    estilo_extra: estiloExtra.trim() || undefined,
    imagen_referencia_base64: refEsZorro ? undefined : refBase64.current ?? undefined,
  }), [direccionId, poseId, gestoId, encuadreId, utileria, estiloExtra, refEsZorro]);

  const activos = [
    direccionId !== DIRECCION_PREDETERMINADA ? "luz" : null,
    poseId, gestoId, encuadreId,
    utileria.trim() || null,
    estiloExtra.trim() || null,
    refEsZorro ? null : "ref",
  ].filter(Boolean).length;

  return {
    opciones, direccionId, poseId, gestoId, encuadreId, utileria, estiloExtra, refPreview, refEsZorro,
    mostrar, setMostrar, setDireccionId, setPoseId, setGestoId, setEncuadreId,
    setUtileria, setEstiloExtra, alternarPreset,
    cambiarReferencia, restaurarReferencia, aplicarSugerencia, payload, activos,
  };
}

/* ==================== Piezas reutilizables de la UI ===================== */

/** Botón de opción: se toca para elegir y se vuelve a tocar para soltar. */
function Chip({
  activo, onClick, children, deshabilitado, titulo,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  deshabilitado?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-pressed={activo}
      title={titulo}
      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium text-left transition ${
        activo
          ? "border-primary bg-primary/15 text-foreground"
          : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"
      } disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-foreground/10`}
    >
      {children}
    </button>
  );
}

/** Campo de texto libre con sus opciones de un clic encima. */
function CampoConPresets({
  etiqueta, valor, onChange, onAlternar, grupos, placeholder, ayuda, maxLength = 300,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  onAlternar: (texto: string) => void;
  grupos: Array<{ titulo: string | null; opciones: PresetUi[] }>;
  placeholder: string;
  ayuda?: string;
  maxLength?: number;
}) {
  // Marcado = su texto está dentro del campo. Así el botón nunca puede decir
  // algo distinto de lo que se va a enviar.
  const partes = valor.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{etiqueta}</label>
      {grupos.map((g) => (
        <div key={g.titulo ?? "_"} className="space-y-1">
          {g.titulo && (
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-semibold">{g.titulo}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {g.opciones.map((o) => (
              <Chip
                key={o.id}
                activo={!!o.texto && partes.includes(o.texto)}
                onClick={() => o.texto && onAlternar(o.texto)}
                titulo={o.texto}
              >
                {o.etiqueta}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:border-primary outline-none transition-all"
        placeholder={placeholder}
      />
      {ayuda && <p className="text-xs text-muted-foreground/70">{ayuda}</p>}
    </div>
  );
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
  // Con un encuadre cerrado, las poses que piden el torso se apagan en vez de
  // dejarse elegir: elegirlas daba una imagen que contradecía el encuadre.
  const cerrado = !!set.opciones?.encuadres?.find((e) => e.id === set.encuadreId)?.soloPrimerPlano;
  const posesCortas = set.opciones?.posesPrimerPlano ?? [];

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
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Encuadre de cámara</label>
                <div className="flex flex-wrap gap-1.5">
                  <Chip activo={set.encuadreId === null} onClick={() => set.setEncuadreId(null)}>
                    Automático
                  </Chip>
                  {set.opciones?.encuadres?.map((e) => (
                    <Chip key={e.id} activo={set.encuadreId === e.id} onClick={() => set.setEncuadreId(set.encuadreId === e.id ? null : e.id)}>
                      {e.etiqueta}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Pose de Webi</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <Chip activo={set.poseId === null} onClick={() => set.setPoseId(null)}>
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 shrink-0" /> Automática</span>
                  </Chip>
                  {set.opciones?.poses.map((p) => (
                    <Chip
                      key={p.id}
                      activo={set.poseId === p.id}
                      onClick={() => set.setPoseId(set.poseId === p.id ? null : p.id)}
                      deshabilitado={cerrado && !posesCortas.includes(p.id)}
                      titulo={cerrado && !posesCortas.includes(p.id) ? "Necesita ver el cuerpo: no cabe en un primer plano" : undefined}
                    >
                      {p.etiqueta}
                    </Chip>
                  ))}
                </div>
                {cerrado && (
                  <p className="text-xs text-muted-foreground/70">
                    En primer plano solo se ve la cabeza y los hombros, así que las poses que necesitan el
                    cuerpo quedan apagadas.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Expresión de la cara</label>
                <div className="flex flex-wrap gap-1.5">
                  <Chip activo={set.gestoId === null} onClick={() => set.setGestoId(null)}>
                    La que pida la pose
                  </Chip>
                  {set.opciones?.gestos?.map((g) => (
                    <Chip key={g.id} activo={set.gestoId === g.id} onClick={() => set.setGestoId(set.gestoId === g.id ? null : g.id)}>
                      {g.etiqueta}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          <CampoConPresets
            etiqueta="Utilería del set"
            valor={set.utileria}
            onChange={set.setUtileria}
            onAlternar={(t) => set.alternarPreset("utileria", t)}
            grupos={set.opciones?.utileria?.map((g) => ({ titulo: g.titulo, opciones: g.opciones })) ?? []}
            placeholder="O escríbela tú: un notebook abierto, cajas de cartón…"
            ayuda="Se dibujan como objetos reales apoyados en el set e iluminados por el foco — nunca stickers."
          />

          <CampoConPresets
            etiqueta="Toque de estilo extra"
            valor={set.estiloExtra}
            onChange={set.setEstiloExtra}
            onAlternar={(t) => set.alternarPreset("estiloExtra", t)}
            grupos={[{ titulo: null, opciones: set.opciones?.estilos ?? [] }]}
            placeholder="O escríbelo tú: más dramático, ambiente festivo…"
          />

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
