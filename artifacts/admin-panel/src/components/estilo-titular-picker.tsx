// Selector compartido de estilos tipográficos del titular (portadas,
// historias y Posts IA). Las previews aproximan con CSS el render real que
// hace el servidor con las mismas familias empaquetadas (title-style).
import { Sparkles } from "lucide-react";

export interface EstiloTitularOption {
  id: string;
  nombre: string;
  descripcion: string;
}

/* Previews CSS de los estilos (el render real lo hace el servidor). */
export const PREVIEW_ESTILOS: Record<string, React.CSSProperties> = {
  impacto: { fontFamily: "'Archivo Black','Arial Black',sans-serif", color: "#fff", WebkitTextStroke: "1.2px #000", textShadow: "2px 2px 0 rgba(0,0,0,.65)" },
  titan: { fontFamily: "'Anton',Impact,sans-serif", color: "#141414", background: "#FB923C", padding: "0 5px", borderRadius: 3 },
  slab_3d: { fontFamily: "'Alfa Slab One',serif", color: "#FFF6E3", textShadow: "1px 1px 0 #17110A, 2px 2px 0 #17110A, 3px 3px 0 #17110A" },
  neon: { fontFamily: "'Bebas Neue',sans-serif", color: "#fff", textShadow: "0 0 5px #FB923C, 0 0 12px #FB923C, 0 0 20px #FB923C" },
  fuego: { fontFamily: "'Anton',Impact,sans-serif", background: "linear-gradient(180deg,#FFE45C,#FF8A00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(1px 1px 0 rgba(0,0,0,.7))" },
  placas: { fontFamily: "'Montserrat',sans-serif", fontWeight: 900, color: "#fff", background: "rgba(8,8,10,.85)", padding: "0 5px", borderRadius: 3 },
  clasico: { fontFamily: "'Montserrat',sans-serif", fontWeight: 900, color: "#fff", textShadow: "1px 1px 2px rgba(0,0,0,.6)" },
};

/** Lista local de respaldo cuando el catálogo del servidor aún no cargó. */
export const ESTILOS_FALLBACK: EstiloTitularOption[] = [
  { id: "impacto", nombre: "Impacto total", descripcion: "Letras enormes con contorno negro y sombra dura." },
  { id: "titan", nombre: "Titán condensada", descripcion: "Condensada altísima con la palabra clave sobre una placa." },
  { id: "slab_3d", nombre: "3D cartel", descripcion: "Serifa gruesa con extrusión 3D estilo cartel retro." },
  { id: "neon", nombre: "Neón eléctrico", descripcion: "Condensada con halo de neón." },
  { id: "fuego", nombre: "Degradado dorado", descripcion: "Degradado amarillo→naranja con contorno oscuro." },
  { id: "placas", nombre: "Placas premium", descripcion: "Cada línea sobre una placa oscura." },
  { id: "clasico", nombre: "Clásico limpio", descripcion: "Texto directo con sombra suave." },
];

export function EstiloTitularPicker({
  estilos,
  value,
  onChange,
  descripcionAuto = "Rota entre los estilos más impactantes; elige uno para fijarlo.",
}: {
  estilos?: EstiloTitularOption[] | null;
  value: string | null;
  onChange: (id: string | null) => void;
  descripcionAuto?: string;
}) {
  const lista = estilos && estilos.length > 0 ? estilos : ESTILOS_FALLBACK;
  const seleccionado = lista.find((e) => e.id === value) ?? null;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Tipografía del titular</label>
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg border transition ${value === null ? "border-primary bg-primary/15" : "border-foreground/10 bg-background/40 hover:border-foreground/30"}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[9px] font-medium text-muted-foreground">Automática</span>
        </button>
        {lista.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onChange(value === e.id ? null : e.id)}
            aria-pressed={value === e.id}
            title={e.descripcion}
            className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg border transition overflow-hidden bg-[#1a1a1e] ${value === e.id ? "border-primary ring-1 ring-primary" : "border-foreground/10 hover:border-foreground/30"}`}
          >
            <span className="text-[13px] leading-none whitespace-nowrap" style={PREVIEW_ESTILOS[e.id] ?? {}}>ABC</span>
            <span className="text-[9px] font-medium text-muted-foreground truncate w-full text-center">{e.nombre}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground/70">
        {seleccionado ? seleccionado.descripcion : descripcionAuto}
      </p>
    </div>
  );
}
