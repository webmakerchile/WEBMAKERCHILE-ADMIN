import { Layout } from "@/components/layout";
import { Inbox } from "lucide-react";
import { ReportesDiarios, InformeSemanal } from "@/components/rrhh-reportes";

/**
 * Apartado de Dirección: los reportes diarios y el informe semanal que
 * redacta RRHH, ordenados como llegarían por correo (uno por fecha, el
 * informe semanal con sus tres secciones separadas). Reusa los mismos
 * componentes y endpoints que RRHH usa para redactarlos — comparten permiso
 * (`canManagePeople`) — pero acá quedan solos, sin el resto de la operación
 * de RRHH (fichas, sueldos, contratos), en la sección propia que Dirección
 * pedía.
 */
export default function InformesRrhhPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-2">
            <Inbox className="w-6 h-6 sm:w-8 sm:h-8 text-primary" /> Informes de RRHH
          </h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Lo que RRHH envía a dirección: reporte del día e informe semanal, con notificación y copia por correo al emitirse.
          </p>
        </header>

        <ReportesDiarios />
        <InformeSemanal />
      </div>
    </Layout>
  );
}
