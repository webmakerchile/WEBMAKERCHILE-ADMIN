import type { ReactNode } from "react";
import { useLocation } from "wouter";
import AgenciaShell from "./shell";
import Resumen from "./resumen";
import Clientes from "./clientes";
import Presupuestos from "./presupuestos";
import Contratos from "./contratos";
import Proyectos from "./proyectos";
import Mantenimiento from "./mantenimiento";
import Finanzas from "./finanzas";
import { useModoAgencia } from "./modo";

/** Sección Agencia: espejo del panel autoadministrable de webmakerlatam.com. */
export default function AgenciaPage() {
  const [ubicacion] = useLocation();
  const esCompleto = useModoAgencia() === "completo";
  const partes = ubicacion.replace(/^\/agencia\/?/, "").split("/").filter(Boolean);
  const seccion = partes[0] ?? "";
  const id = partes[1] ? decodeURIComponent(partes[1]) : undefined;

  let contenido: ReactNode;
  switch (seccion) {
    case "clientes":
      contenido = <Clientes idAbierto={id} />;
      break;
    case "presupuestos":
      contenido = <Presupuestos idAbierto={id} />;
      break;
    case "contratos":
      contenido = <Contratos accion={id} />;
      break;
    case "proyectos":
      contenido = <Proyectos />;
      break;
    case "mantenimiento":
      contenido = <Mantenimiento />;
      break;
    case "finanzas":
      // Finanzas es solo de dirección: al equipo se le muestra el resumen.
      contenido = esCompleto ? <Finanzas /> : <Resumen />;
      break;
    default:
      contenido = <Resumen />;
  }

  return <AgenciaShell>{contenido}</AgenciaShell>;
}
