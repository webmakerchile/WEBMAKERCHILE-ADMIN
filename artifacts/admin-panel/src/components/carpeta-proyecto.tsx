// Los archivos del proyecto, sin salir del panel.
//
// Antes esto era un enlace suelto que abría Drive en otra pestaña: para ver si
// el cliente había subido el logo había que salir del tablero, buscar la
// carpeta y volver. Y si el proyecto no tenía carpeta —que era la mitad de los
// casos, porque crearla era un botón que había que acordarse de pulsar— no
// había ni enlace ni forma de saber que faltaba.

import { useState } from "react";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { urlDeCarpeta } from "@/lib/proyecto-asignacion";
import {
  Folder, File as FileIcon, ExternalLink, Loader2, AlertTriangle, ChevronDown, ChevronLeft,
} from "lucide-react";

interface Paso { id: string; name: string }

export function CarpetaProyecto({ carpetaId, nombre }: { carpetaId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [ruta, setRuta] = useState<Paso[]>([{ id: carpetaId, name: nombre }]);
  const actual = ruta[ruta.length - 1];

  // Sin abrir no se pide nada: montar el explorador en cada tarjeta de proyecto
  // dispararía una consulta a Drive por proyecto al entrar en la página.
  const { data: archivos, isLoading: cargandoArch, error: errArch } = useListDriveFiles(
    { folderId: actual.id },
    { query: { enabled: abierto, queryKey: ["drive-files", actual.id] } },
  );
  const { data: carpetas, isLoading: cargandoCarp, error: errCarp } = useListDriveFolders(
    { parentId: actual.id },
    { query: { enabled: abierto, queryKey: ["drive-folders", actual.id] } },
  );

  const cargando = cargandoArch || cargandoCarp;
  // Un fallo NO es una carpeta vacía. Es el error que ya tuvimos en los otros
  // tres exploradores: sin permiso de Drive, la pantalla decía "no hay nada".
  const fallo = errArch || errCarp;
  const listaCarpetas = carpetas ?? [];
  const listaArchivos = archivos?.files ?? [];
  const vacia = !cargando && !fallo && listaCarpetas.length === 0 && listaArchivos.length === 0;

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

            {fallo && (
              <div className="px-3 py-3 text-xs">
                <p className="text-red-400 font-semibold">No se pudo leer esta carpeta.</p>
                <p className="text-muted-foreground mt-0.5">
                  {(fallo as Error).message || "El servidor devolvió un error."} Si es de otra persona,
                  pídele que la comparta con tu cuenta.
                </p>
              </div>
            )}

            {vacia && <p className="px-3 py-4 text-xs text-muted-foreground">Esta carpeta está vacía.</p>}

            {listaCarpetas.map((c) => (
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

            {listaArchivos.map((f) => (
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

/** Aviso de que este proyecto no tiene carpeta, con qué hacer al respecto. */
export function SinCarpetaProyecto() {
  return (
    <p className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
      {/* Que falte la carpeta tiene que verse: si no, se asume que los archivos
          están "en algún sitio de Drive" y acaban repartidos por chats. */}
      Este proyecto no tiene carpeta de Drive. Se vincula desde el Hub Ejecutivo, en su ficha.
    </p>
  );
}
