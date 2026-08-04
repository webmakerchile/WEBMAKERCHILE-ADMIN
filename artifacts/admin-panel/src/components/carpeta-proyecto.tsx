// Los archivos del proyecto, sin salir del panel.
//
// Antes esto era un enlace suelto que abría Drive en otra pestaña: para ver si
// el cliente había subido el logo había que salir del tablero, buscar la
// carpeta y volver. Y si el proyecto no tenía carpeta —que era la mitad de los
// casos, porque crearla era un botón que había que acordarse de pulsar— no
// había ni enlace ni forma de saber que faltaba.

import { useState } from "react";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { urlDeCarpeta, idDeCarpeta } from "@/lib/proyecto-asignacion";
import { ConectarDrive, useEstadoDrive } from "@/components/conectar-drive";
import {
  Folder, File as FileIcon, ExternalLink, Loader2, AlertTriangle, ChevronDown, ChevronLeft, Check,
} from "lucide-react";

interface Paso { id: string; name: string }

export function CarpetaProyecto({ carpetaId, nombre }: { carpetaId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [ruta, setRuta] = useState<Paso[]>([{ id: carpetaId, name: nombre }]);
  const actual = ruta[ruta.length - 1];

  // Sin abrir no se pide nada: montar el explorador en cada tarjeta de proyecto
  // dispararía una consulta a Drive por proyecto al entrar en la página.
  //
  // Y antes de listar se mira si la cuenta autorizó Drive: sin permiso, las
  // listas fallaban con un error genérico en rojo cuando lo que corresponde es
  // el mismo aviso de "Conectar Google Drive" del resto del panel.
  const estado = useEstadoDrive(abierto);
  const puedeListar = abierto && !estado.cargando && estado.conectado;
  const { data: archivos, isLoading: cargandoArch, error: errArch } = useListDriveFiles(
    { folderId: actual.id },
    { query: { enabled: puedeListar, queryKey: ["drive-files", actual.id] } },
  );
  const { data: carpetas, isLoading: cargandoCarp, error: errCarp } = useListDriveFolders(
    { parentId: actual.id },
    { query: { enabled: puedeListar, queryKey: ["drive-folders", actual.id] } },
  );

  const sinPermiso = abierto && !estado.cargando && !estado.conectado;
  const cargando = estado.cargando || cargandoArch || cargandoCarp;

  // Nada de enseñar restos de caché cuando no toca: una consulta deshabilitada
  // conserva datos y errores viejos, y aquí se renderizarían junto al aviso de
  // "conectar Drive" (o tras cambiar de cuenta en la misma pestaña).
  const falloVisible = puedeListar ? (errArch || errCarp) : null;
  const carpetasVisibles = puedeListar ? (carpetas ?? []) : [];
  const archivosVisibles = puedeListar ? (archivos?.files ?? []) : [];
  // Un fallo NO es una carpeta vacía. Es el error que ya tuvimos en los otros
  // tres exploradores: sin permiso de Drive, la pantalla decía "no hay nada".
  const vacia = puedeListar && !cargando && !falloVisible && carpetasVisibles.length === 0 && archivosVisibles.length === 0;

  return (
    <div className="rounded-lg border border-foreground/10 bg-card/30 mt-2">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Folder className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium flex-1 truncate">Archivos del proyecto</span>
        <a
          href={urlDeCarpeta(carpetaId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          Drive <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="border-t border-foreground/10">
          {ruta.length > 1 && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-foreground/10">
              <button
                type="button"
                onClick={() => setRuta(ruta.slice(0, -1))}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3 h-3" /> Atrás
              </button>
              <span className="text-[11px] text-muted-foreground truncate">{actual.name}</span>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto">
            {cargando && (
              <p className="flex items-center gap-1.5 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
              </p>
            )}

            {sinPermiso && (
              <div className="p-2.5">
                <ConectarDrive volverA="mis-tareas" motivo="Por eso no se pueden ver los archivos de este proyecto." />
              </div>
            )}

            {falloVisible && (
              <div className="px-3 py-3 text-xs">
                <p className="text-red-400 font-semibold">No se pudo leer esta carpeta.</p>
                <p className="text-muted-foreground mt-0.5">
                  {(falloVisible as Error).message || "El servidor devolvió un error."} Si es de otra persona,
                  pídele que la comparta con tu cuenta.
                </p>
              </div>
            )}

            {vacia && <p className="px-3 py-4 text-xs text-muted-foreground">Esta carpeta está vacía.</p>}

            {carpetasVisibles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setRuta([...ruta, { id: c.id!, name: c.name ?? "Carpeta" }])}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-foreground/5 border-b border-foreground/5"
              >
                <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs truncate">{c.name}</span>
              </button>
            ))}

            {archivosVisibles.map((f) => (
              <a
                key={f.id}
                href={f.webViewLink ?? urlDeCarpeta(actual.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 border-b border-foreground/5"
              >
                <FileIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs truncate flex-1">{f.name}</span>
                <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Aviso de que este proyecto no tiene carpeta, con qué hacer al respecto.
 *
 * Si el rol puede escribir proyectos, la carpeta se vincula AQUÍ pegando el
 * enlace: mandar al Hub Ejecutivo era un callejón sin salida para quien sí
 * tenía permiso pero trabaja desde esta vista. Sin permiso, se sigue indicando
 * dónde se hace.
 */
export function SinCarpetaProyecto({ puedeVincular = false, onVincular, guardando = false }: {
  puedeVincular?: boolean;
  /** Recibe el enlace tal cual se pegó; el guardado es cosa de la página. */
  onVincular?: (enlace: string) => void;
  guardando?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const linkable = Boolean(puedeVincular && onVincular);

  const vincular = () => {
    // Enter no respeta el disabled del botón: sin esta salida, machacar la
    // tecla lanza PATCHes concurrentes con la misma versión base.
    if (guardando) return;
    // Se valida ANTES de guardar: un enlace que no es de carpeta se guardaría
    // igual en el blob y el proyecto seguiría "sin carpeta" a ojos de todos.
    if (!idDeCarpeta(enlace)) {
      setError("Eso no parece un enlace de carpeta de Drive. Copia la URL de la carpeta desde el navegador.");
      return;
    }
    setError(null);
    onVincular?.(enlace.trim());
  };

  return (
    <div className="mt-2">
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
        {/* Que falte la carpeta tiene que verse: si no, se asume que los archivos
            están "en algún sitio de Drive" y acaban repartidos por chats. */}
        <span>
          Este proyecto no tiene carpeta de Drive.{" "}
          {linkable ? (
            <button
              type="button"
              onClick={() => { setAbierto(v => !v); setError(null); }}
              className="text-primary hover:underline font-medium"
            >
              {abierto ? "Cancelar" : "Vincular carpeta"}
            </button>
          ) : (
            "Se vincula desde el Hub Ejecutivo, en su ficha."
          )}
        </span>
      </p>
      {linkable && abierto && (
        <div className="mt-1.5 space-y-1">
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={enlace}
              disabled={guardando}
              onChange={e => { setEnlace(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter") vincular(); if (e.key === "Escape") setAbierto(false); }}
              placeholder="https://drive.google.com/drive/folders/…"
              className="flex-1 min-w-0 h-7 rounded-lg border border-foreground/15 bg-card/60 px-2 text-[11px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={vincular}
              disabled={guardando || !enlace.trim()}
              className="h-7 px-2 rounded-lg border border-primary/40 text-primary text-[11px] font-medium inline-flex items-center gap-1 hover:bg-primary/10 disabled:opacity-50 whitespace-nowrap"
            >
              {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Vincular
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
