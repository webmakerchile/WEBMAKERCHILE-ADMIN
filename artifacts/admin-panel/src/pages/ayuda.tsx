import { useState } from "react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  HelpCircle,
  PlayCircle,
  Users2,
  Video,
  CalendarClock,
  Sparkles,
  MessageCircleQuestion,
} from "lucide-react";
import { startOnboardingTour } from "@/components/onboarding-tour";
import { cn } from "@/lib/utils";

type FAQ = { q: string; a: string };
type FAQGroup = { title: string; icon: typeof HelpCircle; items: FAQ[] };

const GROUPS: FAQGroup[] = [
  {
    title: "Primeros pasos",
    icon: Sparkles,
    items: [
      {
        q: "¿Por dónde empiezo?",
        a: "Sigue la lista de configuración del panel principal: conecta Google Drive, vincula al menos una red social, crea tu primer video y prográmalo. En menos de 10 minutos tendrás todo listo.",
      },
      {
        q: "¿Puedo volver a ver el tour?",
        a: "Sí. Haz clic en el botón \"Iniciar tour\" más abajo y te repetiremos la introducción con los pasos clave.",
      },
    ],
  },
  {
    title: "Cuentas sociales",
    icon: Users2,
    items: [
      {
        q: "¿Cómo conecto cada red social?",
        a: "Ve a Cuentas Sociales y pulsa \"Conectar\" en la red que necesites. TikTok, LinkedIn y X requieren tu autorización con un solo clic. Instagram y Facebook se gestionan a nivel de servidor con credenciales del administrador.",
      },
      {
        q: "Una red dice \"desconectada\" pero estaba conectada antes",
        a: "Los tokens caducan o pueden ser revocados desde la propia red. Vuelve a Cuentas Sociales y reconecta esa red. Tus videos y descripciones no se pierden.",
      },
      {
        q: "¿YouTube se conecta solo si conecto Google Drive?",
        a: "Sí. YouTube usa la misma autenticación de Google que Drive, así que al conectar Drive ya quedas habilitado para subir a YouTube.",
      },
    ],
  },
  {
    title: "Videos y publicaciones",
    icon: Video,
    items: [
      {
        q: "¿Cómo creo un video?",
        a: "Entra al Gestor de Videos y pulsa \"Nuevo Video\". Te guiará paso a paso: información básica, portada, descripciones por red y revisión final.",
      },
      {
        q: "¿Puedo personalizar la descripción por red?",
        a: "Sí. Cada red social tiene su propia descripción optimizada. Puedes generarlas con IA y editarlas a mano antes de publicar.",
      },
      {
        q: "¿Dónde se guarda el archivo del video?",
        a: "En tu Google Drive (carpeta del proyecto). Por eso es importante conectar Drive antes de subir videos pesados.",
      },
    ],
  },
  {
    title: "Programación",
    icon: CalendarClock,
    items: [
      {
        q: "¿Cómo programo una publicación?",
        a: "En Publicaciones elige el día y la hora, marca las redes en las que quieres publicar y guarda. El sistema publicará automáticamente a la hora programada.",
      },
      {
        q: "¿Qué pasa si una publicación falla?",
        a: "Verás una alerta en el panel principal con el detalle del error y un botón para reintentar en la red afectada, sin tener que rehacer el video.",
      },
    ],
  },
];

export default function AyudaPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Layout>
      <div className="space-y-8 max-w-3xl mx-auto">
        <header className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Ayuda</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Guías rápidas y respuestas a las dudas más frecuentes para sacar el máximo partido a WebMaker Admin.
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => startOnboardingTour()}
            className="text-left rounded-2xl border border-foreground/10 bg-card hover:border-primary/40 hover:bg-foreground/[0.03] transition-base p-4 flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Iniciar tour</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Repasa los pasos clave del panel en menos de 1 minuto.
              </p>
            </div>
          </button>
          <Link
            to="/cuentas"
            className="text-left rounded-2xl border border-foreground/10 bg-card hover:border-primary/40 hover:bg-foreground/[0.03] transition-base p-4 flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
              <Users2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Conectar cuentas</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Vincula tus redes sociales y Google Drive.
              </p>
            </div>
          </Link>
        </section>

        {GROUPS.map((group) => {
          const GroupIcon = group.icon;
          return (
            <section key={group.title} className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-display font-bold">
                <GroupIcon className="w-4 h-4 text-primary" />
                {group.title}
              </h2>
              <div className="rounded-2xl border border-foreground/10 bg-card divide-y divide-foreground/5 overflow-hidden">
                {group.items.map((item, idx) => {
                  const id = `${group.title}-${idx}`;
                  const open = openId === id;
                  return (
                    <div key={id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : id)}
                        aria-expanded={open}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03] transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex-1 text-sm font-medium">{item.q}</span>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-muted-foreground transition-transform",
                            open && "rotate-180 text-primary",
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 text-sm text-muted-foreground leading-relaxed">
                              {item.a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="rounded-2xl border border-foreground/10 bg-card/60 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <MessageCircleQuestion className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">¿No encontraste lo que buscabas?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Escríbele al administrador del panel para reportar dudas, errores o solicitar nuevas funciones.
            </p>
          </div>
        </section>
      </div>
    </Layout>
  );
}
