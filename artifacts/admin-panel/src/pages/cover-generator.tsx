import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGenerateCover, useGenerateYoutubeCover, useGetCoverOptions, useImproveCoverIdea, useAdjustCover, useImproveAdjustInstruction,
  useListCoverDrafts, useCreateCoverDraft, useUpdateCoverDraft, useDeleteCoverDraft, getCoverDraft,
  getListCoverDraftsQueryKey,
} from "@workspace/api-client-react";
import { EstiloTitularPicker } from "@/components/estilo-titular-picker";
import { Layout } from "@/components/layout";
import { fileToBase64 } from "@/lib/utils";
import { 
  Sparkles, Upload, Loader2, Download, X, AlertTriangle, RefreshCw, Settings, Wand2, SlidersHorizontal, ChevronDown, Youtube, Smartphone, UserRound, Maximize2, MessageSquare, Send, FolderOpen, Trash2
} from "lucide-react";
import { motion } from "framer-motion";

const DEFAULT_REFERENCE_URL = `${import.meta.env.BASE_URL}images/fox-reference-default.png?v=2`;

type FormatoPortada = "vertical" | "youtube";

/* Esquema en miniatura de cada plantilla: dónde va el texto (barras naranjas)
 * y dónde el protagonista (círculo claro). */
function MiniPlantilla({ id }: { id: string }) {
  const barra = "rounded-[1px] bg-primary/90";
  const persona = "rounded-full bg-white/35";
  const lienzo = id.startsWith("v_")
    ? "relative w-[22px] h-[38px] rounded-[3px] bg-black/50 border border-white/15 shrink-0 overflow-hidden"
    : "relative w-[42px] h-[24px] rounded-[3px] bg-black/50 border border-white/15 shrink-0 overflow-hidden";
  switch (id) {
    case "yt_lateral_izquierda":
      return <span className={lienzo}><span className={`absolute left-[4px] top-[6px] w-[14px] h-[3px] ${barra}`} /><span className={`absolute left-[4px] top-[11px] w-[11px] h-[3px] ${barra}`} /><span className={`absolute left-[4px] top-[16px] w-[13px] h-[3px] ${barra}`} /><span className={`absolute right-[4px] top-[5px] w-[13px] h-[13px] ${persona}`} /></span>;
    case "yt_lateral_derecha":
      return <span className={lienzo}><span className={`absolute right-[4px] top-[6px] w-[14px] h-[3px] ${barra}`} /><span className={`absolute right-[4px] top-[11px] w-[11px] h-[3px] ${barra}`} /><span className={`absolute right-[4px] top-[16px] w-[13px] h-[3px] ${barra}`} /><span className={`absolute left-[4px] top-[5px] w-[13px] h-[13px] ${persona}`} /></span>;
    case "yt_cara_gigante":
      return <span className={lienzo}><span className={`absolute left-[3px] top-[4px] w-[12px] h-[3px] ${barra}`} /><span className={`absolute left-[3px] top-[9px] w-[9px] h-[3px] ${barra}`} /><span className={`absolute right-[2px] top-[2px] w-[19px] h-[19px] ${persona}`} /></span>;
    case "yt_impacto_inferior":
      return <span className={lienzo}><span className={`absolute left-[14px] top-[2px] w-[13px] h-[13px] ${persona}`} /><span className={`absolute left-[5px] bottom-[3px] w-[32px] h-[4px] ${barra}`} /></span>;
    case "yt_testimonio":
      return <span className={lienzo}><span className="absolute left-[3px] top-[1px] text-[8px] leading-none text-primary/90 font-black">“</span><span className={`absolute left-[4px] top-[10px] w-[13px] h-[3px] ${barra}`} /><span className={`absolute left-[4px] top-[15px] w-[10px] h-[3px] ${barra}`} /><span className={`absolute right-[4px] top-[5px] w-[13px] h-[13px] ${persona}`} /></span>;
    case "yt_top_numero":
      return <span className={lienzo}><span className="absolute left-[4px] top-[1px] text-[11px] leading-none text-primary font-black">5</span><span className={`absolute left-[4px] top-[14px] w-[14px] h-[3px] ${barra}`} /><span className={`absolute left-[4px] top-[19px] w-[11px] h-[3px] ${barra}`} /><span className={`absolute right-[4px] top-[5px] w-[13px] h-[13px] ${persona}`} /></span>;
    case "v_titular_superior":
      return <span className={lienzo}><span className={`absolute left-[3px] top-[4px] w-[16px] h-[3px] ${barra}`} /><span className={`absolute left-[3px] top-[9px] w-[12px] h-[3px] ${barra}`} /><span className={`absolute left-[5px] bottom-[3px] w-[12px] h-[12px] ${persona}`} /></span>;
    case "v_titular_inferior":
      return <span className={lienzo}><span className={`absolute left-[5px] top-[4px] w-[12px] h-[12px] ${persona}`} /><span className={`absolute left-[3px] bottom-[9px] w-[16px] h-[3px] ${barra}`} /><span className={`absolute left-[3px] bottom-[4px] w-[12px] h-[3px] ${barra}`} /></span>;
    default:
      return <span className={lienzo} />;
  }
}
type MsgAjuste = { role: "user" | "ia"; text: string };
type ImagenGenerada = { b64_json: string; mimeType: string };

export default function CoverGeneratorPage() {
  const [formato, setFormato] = useState<FormatoPortada>("vertical");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [direccionId, setDireccionId] = useState<string | null>(null);
  const [poseId, setPoseId] = useState<string | null>(null);
  // Plantilla de diseño (composición) y estilo tipográfico del titular:
  // null = rotación automática para ir intercalando diseños.
  const [plantillaId, setPlantillaId] = useState<string | null>(null);
  const [estiloTitularId, setEstiloTitularId] = useState<string | null>(null);
  const [utileria, setUtileria] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(DEFAULT_REFERENCE_URL);
  const [isDefaultRef, setIsDefaultRef] = useState(true);
  const [customRefBase64, setCustomRefBase64] = useState<string | null>(null);
  const [defaultRefBase64, setDefaultRefBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fotos de la persona protagonista (solo miniaturas de YouTube): hasta 3
  // ángulos de LA MISMA persona — más fotos = rostro más fiel.
  const MAX_FOTOS = 3;
  const [personFotos, setPersonFotos] = useState<Array<{ preview: string; base64: string }>>([]);
  const personInputRef = useRef<HTMLInputElement>(null);
  const hayPersona = personFotos.length > 0;
  const [modalAjuste, setModalAjuste] = useState(false);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // Previsualización a pantalla completa del resultado (clic en la imagen).
  // La imagen se CAPTURA al hacer clic (no se lee del estado vivo): así un
  // cambio de pestaña en segundo plano no puede alterar lo que se está viendo.
  const [preview, setPreview] = useState<{ src: string; download: string; alt: string } | null>(null);
  const previewOverlayRef = useRef<HTMLDivElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const previewReturnFocusRef = useRef<HTMLElement | null>(null);
  // Chat de ajustes con IA sobre la imagen ya generada (uno por formato).
  const [chatMensajes, setChatMensajes] = useState<Record<FormatoPortada, MsgAjuste[]>>({ vertical: [], youtube: [] });
  const [chatTexto, setChatTexto] = useState("");
  const chatTextoRef = useRef(""); // espejo del texto vivo, para descartar redacciones tardías
  const [imagenAjustada, setImagenAjustada] = useState<Record<FormatoPortada, ImagenGenerada | null>>({ vertical: null, youtube: null });
  // Época por formato: cada generación nueva la sube, y las respuestas de
  // ajustes lanzados en una época anterior se descartan (no pueden pisar
  // una imagen más nueva ni resucitar burbujas en un chat ya limpiado).
  const ajusteEpochRef = useRef<Record<FormatoPortada, number>>({ vertical: 0, youtube: 0 });

  const generateCover = useGenerateCover();
  const generateYoutube = useGenerateYoutubeCover();
  const coverOptions = useGetCoverOptions();
  // Borradores persistentes: cada generación se auto-guarda en el servidor
  // para que nada se pierda al salir de la página.
  const queryClient = useQueryClient();
  const listaBorradores = useListCoverDrafts();
  const crearBorrador = useCreateCoverDraft();
  const actualizarBorrador = useUpdateCoverDraft();
  const eliminarBorrador = useDeleteCoverDraft();
  const [cargandoBorrador, setCargandoBorrador] = useState<number | null>(null);
  // id del borrador "vivo" de cada formato (la última generación o el cargado).
  const borradorIdRef = useRef<Record<FormatoPortada, number | null>>({ vertical: null, youtube: null });
  const improveIdea = useImproveCoverIdea();
  const adjustCover = useAdjustCover();
  const improveAjuste = useImproveAdjustInstruction();
  const esYoutube = formato === "youtube";
  // Estado de generación del formato activo (cada pestaña recuerda su último resultado).
  const activeGen = esYoutube ? generateYoutube : generateCover;
  // Lo que se muestra: el último ajuste del chat (si existe) o la generación original.
  const imagenMostrada: ImagenGenerada | null = imagenAjustada[formato] ?? activeGen.data ?? null;
  const direccionSeleccionada = coverOptions.data?.direcciones.find((d) => d.id === direccionId) ?? null;
  const plantillasFormato = coverOptions.data?.plantillas.filter((p) => p.formato === (esYoutube ? "youtube" : "vertical")) ?? [];
  const plantillaSeleccionada = plantillasFormato.find((p) => p.id === plantillaId) ?? null;
  const estiloTitularSeleccionado = coverOptions.data?.estilosTitular.find((e) => e.id === estiloTitularId) ?? null;

  const cambiarChatTexto = (v: string) => {
    chatTextoRef.current = v;
    setChatTexto(v);
  };

  const abrirPreview = () => {
    if (!imagenMostrada) return;
    previewReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setModalAjuste(false); // nunca dos overlays a la vez
    setPreview({
      src: `data:${imagenMostrada.mimeType};base64,${imagenMostrada.b64_json}`,
      download: `${esYoutube ? "miniatura-youtube" : "portada"}-${title || "webmakerchile"}.png`,
      alt: esYoutube ? "Miniatura de YouTube en grande" : "Portada vertical en grande",
    });
  };

  const cerrarPreview = () => {
    setPreview(null);
    const prev = previewReturnFocusRef.current;
    if (prev && document.contains(prev)) prev.focus();
  };

  // Lightbox modal de verdad: foco inicial en "cerrar", Escape cierra y Tab
  // queda atrapado dentro del overlay (no se puede operar el fondo).
  useEffect(() => {
    if (!preview) return;
    previewCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cerrarPreview();
        return;
      }
      if (e.key === "Tab") {
        const overlay = previewOverlayRef.current;
        if (!overlay) return;
        const focusables = overlay.querySelectorAll<HTMLElement>("button, a[href]");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !overlay.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);
  const ajustesActivos = esYoutube
    ? [direccionId, plantillaId, estiloTitularId, utileria.trim() || null, style.trim() || null].filter(Boolean).length
    : [direccionId, poseId, plantillaId, estiloTitularId, utileria.trim() || null, style.trim() || null, !isDefaultRef ? "ref" : null].filter(Boolean).length;

  // Refs espejo para leer el valor MÁS RECIENTE cuando vuelve la respuesta de
  // la IA: si el usuario tocó un campo mientras tanto, ese campo no se pisa;
  // y un contador de secuencia descarta respuestas viejas fuera de orden.
  const titleRef = useRef(title);
  titleRef.current = title;
  const descriptionRef = useRef(description);
  descriptionRef.current = description;
  const utileriaRef = useRef(utileria);
  utileriaRef.current = utileria;
  const styleRef = useRef(style);
  styleRef.current = style;
  const direccionIdRef = useRef(direccionId);
  direccionIdRef.current = direccionId;
  const plantillaIdRef = useRef(plantillaId);
  plantillaIdRef.current = plantillaId;
  const estiloTitularIdRef = useRef(estiloTitularId);
  estiloTitularIdRef.current = estiloTitularId;
  const formatoRef = useRef(formato);
  formatoRef.current = formato;
  const improveSeqRef = useRef(0);
  const improvingRef = useRef(false);

  const handleImproveIdea = () => {
    if (improvingRef.current || improveIdea.isPending) return;
    const sentTitle = title.trim();
    const sentIdea = description.trim();
    if (!sentTitle && !sentIdea) return;
    const sentUtileria = utileria;
    const sentStyle = style;
    const sentDireccion = direccionId;
    const sentPlantilla = plantillaId;
    const sentEstiloTitular = estiloTitularId;
    const seq = ++improveSeqRef.current;
    improvingRef.current = true;
    improveIdea.mutate(
      {
        data: {
          title: sentTitle || undefined,
          idea: sentIdea || undefined,
          formato,
          conPersona: esYoutube ? hayPersona : undefined,
        },
      },
      {
        onSettled: () => {
          if (seq === improveSeqRef.current) improvingRef.current = false;
        },
        onSuccess: (r) => {
          if (seq !== improveSeqRef.current) return; // respuesta vieja: ignorar
          // La redacción es específica del formato (persona youtuber vs Webi
          // vertical): si cambió de pestaña mientras la IA respondía, descartarla.
          if (formatoRef.current !== formato) {
            setToast("Cambiaste de formato — descarté la redacción anterior");
            setTimeout(() => setToast(null), 3500);
            return;
          }
          const ideaUntouched = descriptionRef.current.trim() === sentIdea;
          const applied = Boolean(r.idea) && ideaUntouched;
          if (applied) setDescription(r.idea);
          if (r.title && !titleRef.current.trim()) setTitle(r.title);

          // Set sugerido por la IA (utilería, estilo e iluminación): cada campo
          // se aplica solo si el usuario no lo tocó mientras la IA respondía.
          // Una iluminación fuera del catálogo la resetea el useEffect de sync.
          let setSugerido = false;
          if (r.utileria && utileriaRef.current === sentUtileria) {
            setUtileria(r.utileria);
            setSugerido = true;
          }
          if (r.estiloExtra && styleRef.current === sentStyle) {
            setStyle(r.estiloExtra);
            setSugerido = true;
          }
          if (r.direccionId && direccionIdRef.current === sentDireccion) {
            setDireccionId(r.direccionId);
            setSugerido = true;
          }
          if (r.plantillaId && plantillaIdRef.current === sentPlantilla) {
            setPlantillaId(r.plantillaId);
            setSugerido = true;
          }
          if (r.estiloTitularId && estiloTitularIdRef.current === sentEstiloTitular) {
            setEstiloTitularId(r.estiloTitularId);
            setSugerido = true;
          }
          if (setSugerido) setShowAdvanced(true);

          setToast(
            applied
              ? setSugerido
                ? "✨ Listo — idea redactada y set sugerido (revísalo abajo)"
                : "✨ Listo — la IA redactó tu idea"
              : setSugerido
                ? "Mantuve tu texto — te dejé un set sugerido abajo"
                : "Seguiste escribiendo — mantuve tu versión"
          );
          setTimeout(() => setToast(null), 3500);
        },
      }
    );
  };

  // Si el catálogo cambia (o se cambia de formato) y una selección ya no
  // aplica, volver a automático. Las plantillas son específicas del formato.
  useEffect(() => {
    if (!coverOptions.data) return;
    if (direccionId && !coverOptions.data.direcciones.some((d) => d.id === direccionId)) setDireccionId(null);
    if (poseId && !coverOptions.data.poses.some((p) => p.id === poseId)) setPoseId(null);
    const formatoActivo = formato === "youtube" ? "youtube" : "vertical";
    if (plantillaId && !coverOptions.data.plantillas.some((p) => p.id === plantillaId && p.formato === formatoActivo)) setPlantillaId(null);
    if (estiloTitularId && !coverOptions.data.estilosTitular.some((e) => e.id === estiloTitularId)) setEstiloTitularId(null);
  }, [coverOptions.data, direccionId, poseId, plantillaId, estiloTitularId, formato]);

  useEffect(() => {
    fetch(DEFAULT_REFERENCE_URL)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setDefaultRefBase64(result.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      setIsDefaultRef(false);
      fileToBase64(file).then(b64 => {
        setCustomRefBase64(b64.split(",")[1]);
      });
    }
  };

  const handleRemoveRef = () => {
    setPreviewUrl(null);
    setIsDefaultRef(false);
    setCustomRefBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreDefault = () => {
    setPreviewUrl(DEFAULT_REFERENCE_URL);
    setIsDefaultRef(true);
    setCustomRefBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePersonFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (personInputRef.current) personInputRef.current.value = "";
    if (files.length === 0) return;
    // Leer TODAS antes de agregar: conserva el orden de selección (la primera
    // foto es la "principal" del prompt) aunque las lecturas resuelvan fuera
    // de orden.
    let nuevas: Array<{ preview: string; base64: string }>;
    try {
      nuevas = await Promise.all(
        files.map(async (file) => ({
          preview: URL.createObjectURL(file),
          base64: (await fileToBase64(file)).split(",")[1],
        })),
      );
    } catch {
      setToast("⚠️ No se pudo leer una de las fotos. Intenta de nuevo.");
      setTimeout(() => setToast(null), 3500);
      return;
    }
    // Efectos (revocar URLs, toast) FUERA del updater de estado: en StrictMode
    // los updaters corren dos veces y revocarían/avisarían doble.
    const espacio = Math.max(0, MAX_FOTOS - personFotos.length);
    const dentro = nuevas.slice(0, espacio);
    const descartadas = nuevas.slice(espacio);
    if (descartadas.length > 0) {
      for (const f of descartadas) URL.revokeObjectURL(f.preview);
      setToast(`Máximo ${MAX_FOTOS} fotos — descarté ${descartadas.length} de más`);
      setTimeout(() => setToast(null), 3500);
    }
    if (dentro.length > 0) {
      setPersonFotos(prev => [...prev, ...dentro].slice(0, MAX_FOTOS));
    }
  };

  const handleRemovePersonFoto = (index: number) => {
    setPersonFotos(prev => {
      const foto = prev[index];
      if (foto) URL.revokeObjectURL(foto.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const refrescarBorradores = () => {
    queryClient.invalidateQueries({ queryKey: getListCoverDraftsQueryKey() });
  };

  // Auto-guardado silencioso: la imagen recién generada queda como borrador
  // en el servidor (best-effort: si falla, la generación no se ve afectada).
  const autoGuardarBorrador = (formatoGen: FormatoPortada, b64: string, tituloGen: string) => {
    crearBorrador.mutate(
      {
        data: {
          formato: formatoGen,
          title: tituloGen || "Sin título",
          imageBase64: b64,
          settings: {
            description: descriptionRef.current || undefined,
            style: styleRef.current || undefined,
            direccionId: direccionIdRef.current ?? undefined,
            poseId: poseId ?? undefined,
            plantillaId: plantillaIdRef.current ?? undefined,
            estiloTitularId: estiloTitularIdRef.current ?? undefined,
            utileria: utileriaRef.current || undefined,
          },
        },
      },
      {
        onSuccess: (r) => {
          borradorIdRef.current[formatoGen] = r.id;
          refrescarBorradores();
        },
        onError: () => { /* best-effort: no molestar al usuario */ },
      },
    );
  };

  const handleGenerate = async (ajuste?: string) => {
    if (!title) return alert("El título es requerido");

    // Una generación nueva parte de cero: descarta los ajustes del chat de este
    // formato e invalida cualquier ajuste que siga en vuelo (sube la época).
    ajusteEpochRef.current[formato] += 1;
    setImagenAjustada((prev) => ({ ...prev, [formato]: null }));
    setChatMensajes((prev) => ({ ...prev, [formato]: [] }));

    let base64: string | undefined = undefined;
    if (isDefaultRef && defaultRefBase64) {
      base64 = defaultRefBase64;
    } else if (!isDefaultRef && customRefBase64) {
      base64 = customRefBase64;
    }

    const descripcionExtendida = ajuste
      ? `${description || ""}\n\nAJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${ajuste}`.trim()
      : description;

    if (esYoutube) {
      generateYoutube.mutate(
        {
          data: {
            title,
            description: descripcionExtendida || undefined,
            style: style.trim() || undefined,
            personImagesBase64: hayPersona ? personFotos.map((f) => f.base64) : undefined,
            direccionId: direccionId ?? undefined,
            plantillaId: plantillasFormato.some((p) => p.id === plantillaId) ? plantillaId! : undefined,
            estiloTitularId: estiloTitularId ?? undefined,
            utileria: utileria.trim() || undefined,
          },
        },
        {
          onSuccess: (r) => {
            setIntentos((n) => n + 1);
            autoGuardarBorrador("youtube", r.b64_json, title);
            if (ajuste) {
              setToast(`✅ Miniatura regenerada con ajuste`);
              setTimeout(() => setToast(null), 3500);
            }
          },
        }
      );
      return;
    }

    generateCover.mutate(
      {
        data: {
          title,
          description: descripcionExtendida,
          style: style.trim() || undefined,
          referenceImageBase64: base64,
          direccionId: direccionId ?? undefined,
          poseId: poseId ?? undefined,
          plantillaId: plantillasFormato.some((p) => p.id === plantillaId) ? plantillaId! : undefined,
          estiloTitularId: estiloTitularId ?? undefined,
          utileria: utileria.trim() || undefined,
        },
      },
      {
        onSuccess: (r) => {
          setIntentos((n) => n + 1);
          autoGuardarBorrador("vertical", r.b64_json, title);
          if (ajuste) {
            setToast(`✅ Portada regenerada con ajuste`);
            setTimeout(() => setToast(null), 3500);
          }
        },
      }
    );
  };

  // Envía la instrucción del chat: el backend EDITA la imagen actual (no
  // regenera desde cero) manteniendo todo lo que no se pidió cambiar.
  const enviarAjuste = () => {
    const txt = chatTexto.trim();
    const base = imagenAjustada[formato] ?? activeGen.data;
    if (!txt || adjustCover.isPending || !base) return;
    const formatoEnviado = formato; // fijado al enviar: inmune a cambios de pestaña
    const epochEnviada = ajusteEpochRef.current[formatoEnviado];
    setChatMensajes((prev) => ({ ...prev, [formatoEnviado]: [...prev[formatoEnviado], { role: "user" as const, text: txt }] }));
    cambiarChatTexto("");
    adjustCover.mutate(
      { data: { instruction: txt, imageBase64: base.b64_json, formato: formatoEnviado } },
      {
        onSuccess: (r) => {
          if (ajusteEpochRef.current[formatoEnviado] !== epochEnviada) return; // hubo regeneración: respuesta obsoleta
          setImagenAjustada((prev) => ({ ...prev, [formatoEnviado]: r }));
          setChatMensajes((prev) => ({ ...prev, [formatoEnviado]: [...prev[formatoEnviado], { role: "ia" as const, text: "Listo — apliqué el cambio manteniendo el resto igual." }] }));
          // El borrador guardado sigue a la imagen: se actualiza con el ajuste.
          const borradorId = borradorIdRef.current[formatoEnviado];
          if (borradorId) {
            actualizarBorrador.mutate(
              { id: borradorId, data: { imageBase64: r.b64_json } },
              { onSuccess: refrescarBorradores, onError: () => {} },
            );
          }
        },
        onError: (e: any) => {
          if (ajusteEpochRef.current[formatoEnviado] !== epochEnviada) return;
          setChatMensajes((prev) => ({ ...prev, [formatoEnviado]: [...prev[formatoEnviado], { role: "ia" as const, text: `No pude aplicar el ajuste: ${e?.message || "intenta de nuevo."}` }] }));
        },
      },
    );
  };

  // "Redactar con IA": reescribe la instrucción cruda ANTES de enviarla; el
  // usuario revisa el texto mejorado y decide cuándo aplicarlo.
  const redactarAjuste = () => {
    const txt = chatTexto.trim();
    if (!txt || improveAjuste.isPending || adjustCover.isPending) return;
    improveAjuste.mutate(
      { data: { instruction: txt, formato, title: title.trim() || undefined } },
      {
        onSuccess: (r) => {
          // Solo reemplaza si el usuario no siguió escribiendo mientras tanto.
          if (chatTextoRef.current.trim() !== txt) return;
          cambiarChatTexto(r.instruction);
        },
        onError: (e: any) => {
          setToast(`⚠️ ${e?.message || "No se pudo redactar la instrucción."}`);
          setTimeout(() => setToast(null), 3500);
        },
      },
    );
  };

  const cargarBorrador = async (id: number) => {
    if (cargandoBorrador !== null) return;
    setCargandoBorrador(id);
    try {
      const d = await getCoverDraft(id);
      const f: FormatoPortada = d.formato === "youtube" ? "youtube" : "vertical";
      setFormato(f);
      setTitle(d.title);
      setDescription(d.settings.description ?? "");
      setStyle(d.settings.style ?? "");
      setUtileria(d.settings.utileria ?? "");
      setDireccionId(d.settings.direccionId ?? null);
      setPoseId(d.settings.poseId ?? null);
      setPlantillaId(d.settings.plantillaId ?? null);
      setEstiloTitularId(d.settings.estiloTitularId ?? null);
      // La imagen del borrador pasa a ser la imagen activa del formato
      // (mismo carril que usan los ajustes del chat).
      ajusteEpochRef.current[f] += 1;
      setChatMensajes((prev) => ({ ...prev, [f]: [] }));
      setImagenAjustada((prev) => ({ ...prev, [f]: { b64_json: d.imageBase64, mimeType: "image/png" } }));
      borradorIdRef.current[f] = d.id;
      setToast("📂 Borrador cargado — puedes seguir ajustándolo o regenerar");
      setTimeout(() => setToast(null), 3500);
    } catch {
      setToast("⚠️ No se pudo cargar el borrador. Intenta de nuevo.");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setCargandoBorrador(null);
    }
  };

  const borrarBorrador = (id: number) => {
    eliminarBorrador.mutate(
      { id },
      {
        onSuccess: () => {
          if (borradorIdRef.current.vertical === id) borradorIdRef.current.vertical = null;
          if (borradorIdRef.current.youtube === id) borradorIdRef.current.youtube = null;
          refrescarBorradores();
        },
      },
    );
  };

  const confirmarAjusteCustom = () => {
    if (!ajusteTexto.trim()) return;
    const txt = ajusteTexto.trim();
    setModalAjuste(false);
    setAjusteTexto("");
    handleGenerate(txt);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-4xl font-display font-bold text-gradient mb-2">Generador AI de Portadas</h1>
          <p className="text-muted-foreground text-lg">
            {esYoutube
              ? "Miniaturas horizontales estilo youtuber: tu foto (o la de alguien) integrada al set de la marca."
              : 'Cuenta tu idea con tus palabras y aprieta "Escribir con IA" — el estilo "Estudio Spotlight" de la marca se aplica solo.'}
          </p>
        </header>

        {/* Selector de formato: vertical (TikTok/Instagram) vs horizontal (YouTube) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormato("vertical")}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${!esYoutube ? "border-primary bg-primary/10 shadow-lg shadow-primary/10" : "border-foreground/10 bg-background/40 opacity-60 hover:opacity-100 hover:border-foreground/25"}`}
          >
            <span className={`w-7 h-11 rounded-md border-2 shrink-0 flex items-center justify-center ${!esYoutube ? "border-primary bg-primary/20" : "border-foreground/30"}`}>
              <Smartphone className={`w-4 h-4 ${!esYoutube ? "text-primary" : "text-muted-foreground"}`} />
            </span>
            <span>
              <span className={`block font-bold text-sm ${!esYoutube ? "text-foreground" : "text-muted-foreground"}`}>TikTok / Instagram</span>
              <span className="block text-xs text-muted-foreground">Portada VERTICAL 9:16 · protagonista Webi</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFormato("youtube")}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${esYoutube ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/10" : "border-foreground/10 bg-background/40 opacity-60 hover:opacity-100 hover:border-foreground/25"}`}
          >
            <span className={`w-11 h-7 rounded-md border-2 shrink-0 flex items-center justify-center ${esYoutube ? "border-red-500 bg-red-500/20" : "border-foreground/30"}`}>
              <Youtube className={`w-4 h-4 ${esYoutube ? "text-red-500" : "text-muted-foreground"}`} />
            </span>
            <span>
              <span className={`block font-bold text-sm ${esYoutube ? "text-foreground" : "text-muted-foreground"}`}>YouTube</span>
              <span className="block text-xs text-muted-foreground">Miniatura HORIZONTAL 16:9 · tu foto estilo youtuber</span>
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card p-6 rounded-3xl space-y-5 border border-foreground/10">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Título Principal</label>
                <input 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Texto destacado en la miniatura..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tu idea</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[110px]"
                  placeholder="Cuéntala con tus palabras: qué quieres mostrar, qué emoción, qué elementos…"
                />
                <button
                  type="button"
                  onClick={handleImproveIdea}
                  disabled={improveIdea.isPending || (!title.trim() && !description.trim())}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {improveIdea.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {improveIdea.isPending ? "Redactando tu idea..." : "Escribir con IA"}
                </button>
                <p className="text-xs text-muted-foreground/70">
                  Escríbela a lo bruto — la IA la redacta y te sugiere título, luz del estudio, utilería y estilo; después ajustas lo que quieras.
                </p>
                {improveIdea.isError && (
                  <p className="text-xs text-red-400">
                    {(improveIdea.error as any)?.message || "No se pudo redactar la idea. Intenta de nuevo."}
                  </p>
                )}
              </div>

              {esYoutube && (
                <div className="space-y-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <UserRound className="w-4 h-4 text-red-400" />
                    La persona de la miniatura
                    <span className="text-xs text-muted-foreground font-normal">(opcional · hasta {MAX_FOTOS} fotos)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {personFotos.map((foto, i) => (
                      <div key={foto.preview} className="relative rounded-xl overflow-hidden border border-foreground/10 aspect-square">
                        <img src={foto.preview} alt={`Foto ${i + 1} de la persona`} className="w-full h-full object-cover" />
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 bg-black/70 text-[9px] text-white/90 px-1.5 py-0.5 rounded-full">
                            Principal
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePersonFoto(i)}
                          aria-label={`Quitar foto ${i + 1}`}
                          className="absolute top-1 right-1 z-10 w-6 h-6 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                    {personFotos.length < MAX_FOTOS && (
                      <label className={`flex flex-col items-center justify-center border-2 border-dashed border-red-500/30 hover:border-red-500/60 hover:bg-red-500/5 rounded-xl cursor-pointer transition-all group aspect-square ${personFotos.length === 0 ? "col-span-3 aspect-auto h-24" : ""}`}>
                        <Upload className="w-5 h-5 text-muted-foreground group-hover:text-red-400 mb-1 transition-colors" />
                        <span className="text-xs text-muted-foreground font-medium text-center px-1">
                          {personFotos.length === 0 ? "Subir tu foto (o la de alguien)" : "Agregar ángulo"}
                        </span>
                        <input ref={personInputRef} type="file" className="hidden" accept="image/*" multiple onChange={handlePersonFilesChange} />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    {hayPersona
                      ? "Sube 2-3 ángulos de LA MISMA persona: la IA usa todos para que el rostro quede idéntico. La primera foto manda."
                      : "La IA integra a la persona al set con el rostro idéntico y expresión de youtuber. Sin foto, Webi el zorro es el protagonista."}
                  </p>
                </div>
              )}

              {/* Diseño de la portada: plantilla de composición + tipografía del titular.
                  En "Automática" ambos rotan solos entre generaciones para intercalar diseños. */}
              <div className="space-y-4 rounded-xl border border-foreground/10 bg-background/30 p-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Plantilla de diseño</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlantillaId(null)}
                      aria-pressed={plantillaId === null}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-[11px] font-medium transition text-left ${plantillaId === null ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span>Automática<span className="block text-[9px] text-muted-foreground">intercala diseños</span></span>
                    </button>
                    {plantillasFormato.map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => setPlantillaId(plantillaId === pl.id ? null : pl.id)}
                        aria-pressed={plantillaId === pl.id}
                        title={pl.descripcion}
                        className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-[11px] font-medium transition text-left ${plantillaId === pl.id ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                      >
                        <MiniPlantilla id={pl.id} />
                        <span className="truncate">{pl.nombre}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    {plantillaSeleccionada ? plantillaSeleccionada.descripcion : "Cada generación usa una plantilla distinta para variar el diseño (como los canales grandes)."}
                  </p>
                </div>

                <EstiloTitularPicker
                  estilos={coverOptions.data?.estilosTitular ?? null}
                  value={estiloTitularId}
                  onChange={setEstiloTitularId}
                />
              </div>

              <div className="border border-foreground/10 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-background/40 hover:bg-background/60 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    Personalización del set
                    {ajustesActivos > 0 ? (
                      <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                        {ajustesActivos} activo{ajustesActivos > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>

                {showAdvanced && (
                  <div className="p-4 space-y-5 border-t border-foreground/10">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Iluminación del estudio</label>
                      {coverOptions.isError && (
                        <p className="text-xs text-amber-400/80">No se pudieron cargar las opciones — la portada usará rotación automática.</p>
                      )}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDireccionId(null)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${direccionId === null ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          Automática
                        </button>
                        {coverOptions.data?.direcciones.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setDireccionId(direccionId === d.id ? null : d.id)}
                            title={d.descripcion}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${direccionId === d.id ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: d.colorAcento }} />
                            <span className="truncate">{d.nombre.replace(/^Estudio /, "")}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        {direccionSeleccionada ? direccionSeleccionada.descripcion : "Rota sola entre las 8 luces del estudio para que ninguna portada se repita."}
                      </p>
                    </div>

                    {!esYoutube && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Pose de Webi</label>
                        <select
                          value={poseId ?? ""}
                          onChange={(e) => setPoseId(e.target.value || null)}
                          className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all"
                        >
                          <option value="">Automática (según el tema)</option>
                          {coverOptions.data?.poses.map((p) => (
                            <option key={p.id} value={p.id}>{p.etiqueta}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Utilería del set</label>
                      <input
                        value={utileria}
                        onChange={(e) => setUtileria(e.target.value)}
                        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none transition-all"
                        placeholder="Ej: un notebook abierto, una taza de café, cajas de cartón"
                      />
                      <p className="text-xs text-muted-foreground/70">
                        Se dibujan como objetos reales apoyados en el set e iluminados por el foco — nunca stickers.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Toque de estilo extra</label>
                      <input
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none transition-all"
                        placeholder="Ej: tono más dramático, ambiente festivo…"
                      />
                    </div>

                    {!esYoutube && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Imagen de referencia <span className="text-xs text-muted-foreground font-normal">(el zorro va por defecto)</span>
                      </label>
                      {previewUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-foreground/10">
                          <img src={previewUrl} alt="Referencia" className="w-full h-24 object-cover" />
                          <button
                            type="button"
                            onClick={handleRemoveRef}
                            className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                          {isDefaultRef && (
                            <div className="absolute bottom-2 left-2 bg-black/60 text-xs text-white/80 px-2 py-0.5 rounded-full">
                              Zorro predeterminado
                            </div>
                          )}
                          <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
                            <span className="text-sm text-white font-medium">Cambiar imagen</span>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                          </label>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-foreground/20 hover:border-primary/50 hover:bg-primary/5 rounded-xl cursor-pointer transition-all group">
                            <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary mb-1.5 transition-colors" />
                            <span className="text-sm text-muted-foreground font-medium">Subir foto o captura</span>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                          </label>
                          <button
                            type="button"
                            onClick={handleRestoreDefault}
                            className="w-full text-xs text-primary hover:text-orange-400 transition-colors py-1"
                          >
                            Restaurar imagen del zorro predeterminada
                          </button>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleGenerate()}
                disabled={activeGen.isPending || adjustCover.isPending || !title}
                className={`w-full flex items-center justify-center px-6 py-4 text-white rounded-xl font-bold shadow-xl disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-300 ${esYoutube ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-500/20 hover:shadow-red-500/40" : "bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 shadow-primary/20 hover:shadow-primary/40"}`}
              >
                {activeGen.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : esYoutube ? (
                  <Youtube className="w-5 h-5 mr-2" />
                ) : (
                  <Sparkles className="w-5 h-5 mr-2" />
                )}
                {activeGen.isPending ? "Generando Magia..." : esYoutube ? "Generar Miniatura de YouTube" : "Generar Portada Vertical"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glass-card rounded-3xl h-full min-h-[500px] border border-foreground/10 flex flex-col items-center justify-center p-8 relative overflow-hidden">
              {!activeGen.data && !activeGen.isPending && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none flex items-center justify-center">
                  <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover" />
                </div>
              )}

              {activeGen.isPending ? (
                <div className="flex flex-col items-center relative z-10">
                  <div className="w-20 h-20 relative">
                    <div className={`absolute inset-0 border-4 rounded-full ${esYoutube ? "border-red-500/20" : "border-primary/20"}`}></div>
                    <div className={`absolute inset-0 border-4 rounded-full border-t-transparent animate-spin ${esYoutube ? "border-red-500" : "border-primary"}`}></div>
                  </div>
                  <p className="mt-6 text-lg font-medium text-foreground animate-pulse">
                    {esYoutube ? "Gemini está creando tu miniatura de YouTube..." : "Gemini está creando tu portada..."}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground/60">Esto puede tomar hasta 30 segundos</p>
                </div>
              ) : activeGen.isError ? (
                <div className="flex flex-col items-center relative z-10 text-center px-4">
                  <AlertTriangle className="w-16 h-16 text-orange-400 mb-4" />
                  <h3 className="text-xl font-medium text-foreground mb-2">Error al generar</h3>
                  <p className="text-sm text-muted-foreground/80 mb-6 max-w-sm">
                    {(activeGen.error as any)?.message || "No se pudo generar la imagen. Intenta de nuevo."}
                  </p>
                  <button
                    onClick={() => handleGenerate()}
                    className="flex items-center px-6 py-3 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Reintentar
                  </button>
                </div>
              ) : imagenMostrada ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full relative z-10 space-y-4"
                >
                  {/* La imagen se muestra en su formato real: 16:9 apaisada o 9:16 vertical.
                      Clic → previsualización a pantalla completa (sin necesidad de descargar). */}
                  <button
                    type="button"
                    onClick={abrirPreview}
                    disabled={adjustCover.isPending}
                    title="Ver en grande"
                    className={`group relative block w-full rounded-2xl overflow-hidden shadow-2xl border border-foreground/10 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${esYoutube ? "" : "max-w-[300px] mx-auto"}`}
                  >
                    <img 
                      src={`data:${imagenMostrada.mimeType};base64,${imagenMostrada.b64_json}`} 
                      alt={esYoutube ? "Miniatura de YouTube generada" : "Portada vertical generada"} 
                      className={`w-full h-auto object-cover ${esYoutube ? "aspect-video" : "aspect-[9/16]"}`}
                    />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5" />
                        Ver en grande
                      </span>
                    </span>
                    {adjustCover.isPending && (
                      <span className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-white" />
                        <span className="text-white text-xs font-bold">Aplicando tu ajuste…</span>
                      </span>
                    )}
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <a 
                      href={`data:${imagenMostrada.mimeType};base64,${imagenMostrada.b64_json}`} 
                      download={`${esYoutube ? "miniatura-youtube" : "portada"}-${title || "webmakerchile"}.png`}
                      className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Descargar
                    </a>
                    <button
                      onClick={() => handleGenerate()}
                      disabled={activeGen.isPending || adjustCover.isPending}
                      className="flex items-center justify-center px-4 py-3 bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 rounded-xl font-bold transition-all"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Reintentar
                    </button>
                    <button
                      onClick={() => { setPreview(null); setModalAjuste(true); setAjusteTexto(""); }}
                      disabled={activeGen.isPending || adjustCover.isPending}
                      className="flex items-center justify-center px-4 py-3 bg-foreground/10 hover:bg-foreground/20 disabled:bg-foreground/5 text-foreground rounded-xl font-bold transition-all"
                    >
                      <Settings className="w-5 h-5 mr-2" />
                      Ajustar
                    </button>
                  </div>
                  {/* Chat de ajustes con IA: pide cambios puntuales en lenguaje natural.
                      El backend EDITA la imagen actual — todo lo no pedido queda igual. */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" />Ajustes con IA
                    </div>
                    {chatMensajes[formato].length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto mb-2 pr-1">
                        {chatMensajes[formato].map((m, i) => (
                          <div
                            key={i}
                            className={`text-xs rounded-lg px-3 py-2 whitespace-pre-wrap ${
                              m.role === "user"
                                ? "bg-primary/15 border border-primary/20 text-foreground ml-6"
                                : "bg-foreground/5 border border-foreground/10 text-muted-foreground mr-6"
                            }`}
                          >
                            {m.text}
                          </div>
                        ))}
                        {adjustCover.isPending && (
                          <div className="bg-foreground/5 border border-foreground/10 text-muted-foreground mr-6 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Editando la imagen…
                          </div>
                        )}
                      </div>
                    )}
                    <textarea
                      value={chatTexto}
                      onChange={(e) => cambiarChatTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          enviarAjuste();
                        }
                      }}
                      rows={2}
                      maxLength={1000}
                      placeholder='Ej: mantén todo igual, pero la pizarra debe decir "Abogada Mily"'
                      className="w-full bg-background/50 border border-foreground/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none placeholder:text-muted-foreground/40"
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={redactarAjuste}
                        disabled={!chatTexto.trim() || improveAjuste.isPending || adjustCover.isPending}
                        title="La IA reescribe tu instrucción para que el cambio salga bien"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
                      >
                        {improveAjuste.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        Redactar con IA
                      </button>
                      <button
                        onClick={enviarAjuste}
                        disabled={!chatTexto.trim() || adjustCover.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
                      >
                        {adjustCover.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Aplicar a la imagen
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      Cambia solo lo que pidas — el resto de la imagen (y el titular) se mantiene igual. "Redactar con IA" mejora tu instrucción antes de enviarla.
                    </p>
                  </div>

                  {intentos >= 5 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2">
                      Has reintentado {intentos} veces. Prueba con un ajuste personalizado para guiar mejor al modelo.
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="text-center relative z-10">
                  {/* Marco con el aspecto real del formato activo, para que se note la diferencia */}
                  <div className={`mx-auto mb-5 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 ${esYoutube ? "w-72 h-[162px] border-red-500/40 bg-red-500/5" : "w-40 h-[284px] border-primary/40 bg-primary/5"}`}>
                    {esYoutube ? (
                      <>
                        <Youtube className="w-10 h-10 text-red-500/60" />
                        <span className="text-[11px] font-bold tracking-wider text-red-400/80">HORIZONTAL 16:9</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-10 h-10 text-primary/60" />
                        <span className="text-[11px] font-bold tracking-wider text-primary/80">VERTICAL 9:16</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-xl font-medium text-muted-foreground">
                    {esYoutube ? "Tu miniatura de YouTube aparecerá aquí" : "Tu portada vertical aparecerá aquí"}
                  </h3>
                  <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm mx-auto">
                    {esYoutube
                      ? "Sube tu foto si quieres salir en la miniatura, cuenta tu idea y presiona generar."
                      : "Completa los detalles a la izquierda y presiona generar para ver el resultado de la IA."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Borradores guardados: cada generación se auto-guarda en el servidor */}
        <div className="glass-card rounded-3xl border border-foreground/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Borradores guardados
            </h2>
            <span className="text-xs text-muted-foreground">
              Cada portada que generas se guarda sola — nada se pierde al salir
            </span>
          </div>
          {listaBorradores.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando borradores…
            </div>
          ) : listaBorradores.isError ? (
            <p className="text-sm text-muted-foreground py-4">No se pudieron cargar los borradores.</p>
          ) : (listaBorradores.data?.drafts.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground/70 py-4 text-center">
              Todavía no hay borradores — genera tu primera portada y aparecerá aquí automáticamente.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {listaBorradores.data!.drafts.map((d) => (
                <div key={d.id} className="group relative rounded-xl overflow-hidden border border-foreground/10 bg-background/40">
                  <button
                    type="button"
                    onClick={() => cargarBorrador(d.id)}
                    disabled={cargandoBorrador !== null}
                    className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title={`Cargar "${d.title}"`}
                  >
                    <div className={`w-full bg-black/40 ${d.formato === "youtube" ? "aspect-video" : "aspect-[9/16] max-h-44"} overflow-hidden`}>
                      {d.thumb ? (
                        <img src={`data:image/webp;base64,${d.thumb}`} alt={d.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xs">Sin vista previa</div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-foreground truncate">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        {d.formato === "youtube" ? <Youtube className="w-3 h-3 text-red-400" /> : <Smartphone className="w-3 h-3 text-primary" />}
                        {d.formato === "youtube" ? "YouTube 16:9" : "Vertical 9:16"}
                        <span>· {new Date(d.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</span>
                      </p>
                    </div>
                    {cargandoBorrador === d.id && (
                      <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => borrarBorrador(d.id)}
                    aria-label={`Eliminar borrador "${d.title}"`}
                    className="absolute top-1.5 right-1.5 z-10 w-7 h-7 bg-black/70 hover:bg-red-600 rounded-full items-center justify-center transition-colors hidden group-hover:flex"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox: ver el resultado en grande antes de descargar */}
        {preview && (
          <motion.div
            ref={previewOverlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Previsualización de la imagen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 cursor-zoom-out"
            onClick={cerrarPreview}
          >
            <button
              type="button"
              ref={previewCloseRef}
              onClick={cerrarPreview}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Cerrar previsualización"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={preview.src}
              alt={preview.alt}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
            <a
              href={preview.src}
              download={preview.download}
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex items-center px-5 py-2.5 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar
            </a>
          </motion.div>
        )}

        {modalAjuste && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setModalAjuste(false)}
          >
            <div
              className="glass-card w-full max-w-md rounded-2xl border border-foreground/10 p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                {esYoutube ? "Ajustar miniatura" : "Ajustar portada"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Describe qué quieres cambiar y se regenera con tu indicación como máxima prioridad.
              </p>
              <textarea
                value={ajusteTexto}
                onChange={(e) => setAjusteTexto(e.target.value)}
                autoFocus
                className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none min-h-[90px]"
                placeholder={esYoutube && hayPersona ? "Ej: que la persona sonría más, menos objetos en el set…" : "Ej: que el zorro mire de frente, menos objetos en la mesa…"}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setModalAjuste(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-foreground/10 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarAjusteCustom}
                  disabled={!ajusteTexto.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-orange-500 text-white disabled:opacity-40 transition"
                >
                  Regenerar
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background/90 border border-primary/30 text-foreground text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl backdrop-blur">
            {toast}
          </div>
        )}
      </div>
    </Layout>
  );
}
