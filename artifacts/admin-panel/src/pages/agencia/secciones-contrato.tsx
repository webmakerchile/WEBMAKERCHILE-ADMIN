import type { ReactNode } from "react";
import type { SeccionContrato } from "./api";

/**
 * Secciones canónicas de un contrato de servicio, según el formato que la
 * página pública de firma del panel sabe renderizar (fuente: la especificación
 * de GET /formato-contratos del panel). El contenido de un contrato NO es
 * texto plano: es este juego de secciones con marcado liviano.
 *
 * Ojo: la clave del panel para garantía es "garantía" CON tilde.
 */
export const SECCIONES_CANONICAS: ReadonlyArray<{ clave: string; titulo: string; guia: string }> = [
  { clave: "alcance", titulo: "ALCANCE DEL PROYECTO", guia: "La más importante y la más larga: qué se desarrolla, con qué tecnologías, entregables." },
  { clave: "entregables", titulo: "PROCESO DE TRABAJO", guia: "Etapas: análisis, mockups, desarrollo, QA, prueba, entrega." },
  { clave: "plazos", titulo: "PLAZOS DE ENTREGA", guia: "Plazo desde el anticipo y qué lo puede extender." },
  { clave: "condiciones", titulo: "CONDICIONES DE PAGO", guia: "Monto, forma de pago, qué pasa si no se paga." },
  { clave: "garantía", titulo: "GARANTÍA", guia: "1 mes de bugs + 1 mes de hosting; qué NO cubre." },
  { clave: "confidencialidad", titulo: "CONFIDENCIALIDAD", guia: "Confidencialidad + cesión del código al pagar el 100%." },
  { clave: "extras", titulo: "SERVICIOS INCLUIDOS", guia: "Desglose de cada servicio con su precio y el total." },
];

/** Juego de secciones en blanco para el editor manual. */
export const seccionesVacias = (): SeccionContrato[] =>
  SECCIONES_CANONICAS.map((s) => ({ titulo: s.titulo, contenido: "" }));

/* ---------------------------------------------------------------- */
/* Marcado de las secciones: **negrita**, "- " viñetas, \n\n párrafos */
/* Render con nodos React (nada de HTML crudo).                      */
/* ---------------------------------------------------------------- */

function conNegritas(texto: string): ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte));
}

export function Marcado({ texto }: { texto: string }) {
  const bloques = texto
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((b) => b.trim().length > 0);

  if (bloques.length === 0) {
    return <p className="text-xs italic text-muted-foreground">— sin contenido —</p>;
  }

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {bloques.map((bloque, bi) => {
        // Dentro de un bloque, las líneas "- item" consecutivas forman una lista.
        const grupos: Array<{ vineta: boolean; lineas: string[] }> = [];
        for (const linea of bloque.split("\n")) {
          const vineta = /^\s*-\s+/.test(linea);
          const ultimo = grupos[grupos.length - 1];
          if (ultimo && ultimo.vineta === vineta) ultimo.lineas.push(linea);
          else grupos.push({ vineta, lineas: [linea] });
        }
        return (
          <div key={bi} className="space-y-1">
            {grupos.map((g, gi) =>
              g.vineta ? (
                <ul key={gi} className="list-disc space-y-0.5 pl-5">
                  {g.lineas.map((l, li) => (
                    <li key={li}>{conNegritas(l.replace(/^\s*-\s+/, ""))}</li>
                  ))}
                </ul>
              ) : (
                <p key={gi}>
                  {g.lineas.map((l, li) => (
                    <span key={li}>
                      {li > 0 && <br />}
                      {conNegritas(l)}
                    </span>
                  ))}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Editor: un textarea por sección, o la vista previa renderizada     */
/* ---------------------------------------------------------------- */

export function EditorSecciones({
  secciones,
  vista,
  onCambiar,
}: {
  secciones: SeccionContrato[];
  vista: "editar" | "preview";
  onCambiar: (indice: number, contenido: string) => void;
}) {
  return (
    <div className="space-y-3">
      {secciones.map((s, i) => {
        const guia = SECCIONES_CANONICAS.find((c) => c.titulo === s.titulo)?.guia;
        return (
          <div key={`${s.titulo}-${i}`} className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide">{s.titulo}</p>
            {vista === "editar" ? (
              <>
                {guia && <p className="mb-1.5 mt-0.5 text-[11px] text-muted-foreground">{guia}</p>}
                <textarea
                  value={s.contenido}
                  onChange={(e) => onCambiar(i, e.target.value)}
                  rows={i === 0 ? 8 : 4}
                  placeholder="Escribí el texto de esta sección…"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </>
            ) : (
              <div className="mt-1.5">
                <Marcado texto={s.contenido} />
              </div>
            )}
          </div>
        );
      })}
      {vista === "editar" && (
        <p className="text-[11px] text-muted-foreground">
          Marcado: <code>**negrita**</code>, líneas que empiezan con <code>- </code> son viñetas, línea en blanco separa párrafos.
        </p>
      )}
    </div>
  );
}
