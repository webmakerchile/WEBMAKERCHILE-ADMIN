import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import AgenciaShell from "./shell";
import Resumen from "./resumen";
import Clientes from "./clientes";
import Presupuestos from "./presupuestos";
import Contratos from "./contratos";
import Proyectos from "./proyectos";
import Mantenimiento from "./mantenimiento";
import Finanzas from "./finanzas";
import { useAccesoAgencia } from "./modo";

/** Sección Agencia: espejo del panel autoadministrable de webmakerlatam.com. */
export default function AgenciaPage() {
  const [ubicacion, navegar] = useLocation();
  const { modo, puedeFinanzas, puedeProyectos } = useAccesoAgencia();
  const partes = ubicacion.replace(/^\/agencia\/?/, "").split("/").filter(Boolean);
  const seccion = partes[0] ?? "";
  const p1 = partes[1] ? decodeURIComponent(partes[1]) : undefined;
  const p2 = partes[2] ? decodeURIComponent(partes[2]) : undefined;

  // Presupuestos tiene tres formas de URL: /presupuestos/nuevo (builder en
  // blanco), /presupuestos/:id (detalle) y /presupuestos/:id/editar (builder
  // precargado) -- "nuevo"/"editar" son palabras clave, no ids.
  const presupuestoAccion = p1 === "nuevo" ? "nuevo" : p2 === "editar" ? "editar" : undefined;
  const presupuestoId = p1 === "nuevo" ? undefined : p1;

  // Un rol acotado (ventas/dev/contador) no tiene "Resumen": si entra por
  // /agencia a secas lo mandamos a la primera pestaña que sí puede ver, en
  // vez de mostrarle un Resumen que el servidor le va a rechazar con 403.
  useEffect(() => {
    if (modo !== "acotado" || seccion !== "") return;
    if (puedeProyectos) navegar("/agencia/proyectos", { replace: true });
    else if (puedeFinanzas) navegar("/agencia/finanzas", { replace: true });
  }, [modo, seccion, puedeProyectos, puedeFinanzas, navegar]);

  let contenido: ReactNode;
  switch (seccion) {
    case "clientes":
      contenido = <Clientes idAbierto={p1} />;
      break;
    case "presupuestos":
      contenido = <Presupuestos idAbierto={presupuestoId} accion={presupuestoAccion} />;
      break;
    case "contratos":
      contenido = <Contratos accion={p1} />;
      break;
    case "proyectos":
      contenido = <Proyectos idAbierto={p1} />;
      break;
    case "mantenimiento":
      contenido = <Mantenimiento />;
      break;
    case "finanzas":
      // Igual que clientes/contratos/proyectos: se renderiza sin gate acá.
      // Si el rol no tiene puedeFinanzas, el propio fetch del servidor
      // devuelve 403 y Finanzas lo muestra con su ErrorCarga (misma
      // consistencia que el resto de las secciones, sin un fallback
      // especial que muestre una pantalla que tampoco le corresponde).
      contenido = <Finanzas />;
      break;
    default:
      // Acotado en tránsito hacia su primera pestaña (ver efecto arriba): no
      // parpadear con un Resumen que de todos modos no va a poder ver.
      contenido = modo === "acotado" ? null : <Resumen />;
  }

  return <AgenciaShell>{contenido}</AgenciaShell>;
}
