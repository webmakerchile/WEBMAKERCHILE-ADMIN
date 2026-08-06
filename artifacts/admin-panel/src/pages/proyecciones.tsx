// Proyecciones por mínimos cuadrados sobre las series reales del negocio.
//
// El gráfico junta tres líneas: lo que pasó (real), la recta que mejor lo
// describe (tendencia) y su continuación hacia adelante (proyección). La
// lectura va en palabras al lado: cuánto sube o baja por periodo y cuánta
// confianza da la recta (R² traducido a alta/media/baja). Las series con
// montos las decide el servidor según el rol: aquí solo se ofrecen las que
// vienen marcadas como disponibles.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fmtCLP } from "@/lib/hub-owner";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  AlertTriangle,
  Copy,
  Download,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as T;
}

interface SerieDef {
  id: string;
  label: string;
  unidad: "clp" | "horas" | "pct" | "unidades";
  tipoPeriodo: "mes" | "semana";
  disponible: boolean;
}
interface SeriesResp {
  series: SerieDef[];
  proyectos: { id: string; nombre: string }[];
}
interface Punto {
  periodo: string;
  valor: number;
}
interface DatosResp {
  serie: { id: string; label: string; unidad: SerieDef["unidad"]; tipoPeriodo: SerieDef["tipoPeriodo"] };
  rango: number;
  horizonte: number;
  proyecto: string | null;
  historico: Punto[];
  ajuste: Punto[];
  proyeccion: Punto[];
  pendiente: number | null;
  r2: number | null;
  variacion: { tasa: number | null; diferencia: number; anterior: number; actual: number } | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-03" → "mar 26" · "2026-W31" → "S31 '26" */
function labelPeriodo(p: string): string {
  const mes = p.match(/^(\d{4})-(\d{2})$/);
  if (mes) return `${MESES[Number(mes[2]) - 1] ?? mes[2]} ${mes[1].slice(2)}`;
  const sem = p.match(/^(\d{4})-W(\d{2})$/);
  if (sem) return `S${Number(sem[2])} '${sem[1].slice(2)}`;
  return p;
}

function fmtValor(unidad: SerieDef["unidad"], v: number): string {
  if (unidad === "clp") return fmtCLP(v);
  if (unidad === "horas") return `${v.toLocaleString("es-CL")} h`;
  if (unidad === "unidades") return v.toLocaleString("es-CL");
  return `${v.toLocaleString("es-CL")}%`;
}

/** Eje Y compacto: $12M / 8k / 95% */
function fmtEje(unidad: SerieDef["unidad"], v: number): string {
  if (unidad === "clp") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })}M`;
    if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k`;
    return `$${v}`;
  }
  if (unidad === "pct") return `${v}%`;
  return String(v);
}

const NOTA_SERIE: Record<string, string> = {
  ventas: "Montos netos de contratos ganados, en su mes de emisión.",
  cobros: "Abonos realmente recibidos, brutos (IVA incluido).",
  horas: "Horas de jornada registradas por asistencia.",
  cumplimiento: "Tareas listas / comprometidas de todo el equipo, según el cierre de cada semana.",
  produccion: "Tareas del tablero que llegaron a \"Listo\", contadas en el mes en que se completaron.",
};

export default function ProyeccionesPage() {
  const { toast } = useToast();
  const [serieId, setSerieId] = useState<string | null>(null);
  const [rango, setRango] = useState(12);
  const [horizonte, setHorizonte] = useState(3);
  const [proyecto, setProyecto] = useState("");

  const catalogo = useQuery<SeriesResp>({
    queryKey: ["proyecciones-series"],
    queryFn: () => req("/hub/proyecciones/series"),
    staleTime: 60_000,
  });

  const disponibles = useMemo(
    () => (catalogo.data?.series ?? []).filter((s) => s.disponible),
    [catalogo.data],
  );
  // Sin serie elegida todavía: la primera disponible (para RRHH será "horas").
  const serieActiva = serieId ?? disponibles[0]?.id ?? null;
  const defActiva = disponibles.find((s) => s.id === serieActiva) ?? null;
  const esSemanal = defActiva?.tipoPeriodo === "semana";
  const nombrePeriodo = esSemanal ? "semanas" : "meses";

  const datos = useQuery<DatosResp>({
    queryKey: ["proyecciones-datos", serieActiva, rango, horizonte, proyecto],
    queryFn: () => {
      const params = new URLSearchParams({ serie: serieActiva!, rango: String(rango), horizonte: String(horizonte) });
      if (serieActiva === "horas" && proyecto) params.set("proyecto", proyecto);
      return req(`/hub/proyecciones/datos?${params}`);
    },
    enabled: !!serieActiva,
  });

  const d = datos.data;

  /** Filas del gráfico: una por periodo, con la proyección enganchada al último punto real. */
  const filas = useMemo(() => {
    if (!d) return [];
    const porPeriodo = new Map<string, { periodo: string; real?: number; tendencia?: number; proyectado?: number }>();
    for (const p of d.historico) porPeriodo.set(p.periodo, { periodo: p.periodo, real: p.valor });
    for (const p of d.ajuste) {
      const fila = porPeriodo.get(p.periodo) ?? { periodo: p.periodo };
      fila.tendencia = p.valor;
      porPeriodo.set(p.periodo, fila);
    }
    const ultimo = d.historico[d.historico.length - 1];
    if (ultimo && d.proyeccion.length > 0) {
      const fila = porPeriodo.get(ultimo.periodo);
      if (fila) fila.proyectado = ultimo.valor; // conecta la línea punteada con lo real
    }
    for (const p of d.proyeccion) porPeriodo.set(p.periodo, { periodo: p.periodo, proyectado: p.valor });
    return [...porPeriodo.values()];
  }, [d]);

  const insuficiente = !!d && d.pendiente === null;
  const unidad = d?.serie.unidad ?? defActiva?.unidad ?? "clp";

  /** La pendiente en palabras, sin jerga. */
  const lecturaTendencia = useMemo(() => {
    if (!d || d.pendiente === null) return null;
    const media =
      d.historico.length > 0 ? d.historico.reduce((a, p) => a + Math.abs(p.valor), 0) / d.historico.length : 0;
    const porPeriodo = esSemanal ? "por semana" : "por mes";
    // Una pendiente diminuta frente al tamaño de la serie no es una dirección.
    if (media > 0 && Math.abs(d.pendiente) < media * 0.005) {
      return { icono: Minus, color: "text-muted-foreground", texto: `Se mantiene prácticamente estable ${porPeriodo}.` };
    }
    const sube = d.pendiente > 0;
    const magnitud =
      unidad === "pct"
        ? `${Math.abs(d.pendiente).toLocaleString("es-CL")} puntos`
        : fmtValor(unidad, Math.abs(d.pendiente));
    return {
      icono: sube ? TrendingUp : TrendingDown,
      color: sube ? "text-emerald-400" : "text-red-400",
      texto: `${sube ? "Sube" : "Baja"} ≈ ${magnitud} ${porPeriodo}.`,
    };
  }, [d, unidad, esSemanal]);

  const confianza = useMemo(() => {
    if (!d || d.r2 === null) return null;
    if (d.r2 >= 0.7)
      return { nivel: "Alta", clase: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", detalle: "Los datos siguen bien la línea: la proyección es una guía razonable." };
    if (d.r2 >= 0.4)
      return { nivel: "Media", clase: "bg-amber-500/15 text-amber-400 border-amber-500/30", detalle: "Hay meses que se salen de la línea: úsala como referencia, no como promesa." };
    return { nivel: "Baja", clase: "bg-red-500/15 text-red-400 border-red-500/30", detalle: "Los datos están muy dispersos: la línea dice poco. Tómala solo como orientación gruesa." };
  }, [d]);

  const copiarProyeccion = async () => {
    if (!d || d.proyeccion.length === 0) return;
    const texto = d.proyeccion.map((p) => `${labelPeriodo(p.periodo)}\t${fmtValor(unidad, p.valor)}`).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: "Proyección copiada", description: "Pégala donde la necesites." });
    } catch {
      toast({ title: "No se pudo copiar", description: "Tu navegador bloqueó el acceso al portapapeles.", variant: "destructive" });
    }
  };

  const descargarCsv = () => {
    if (!d) return;
    const lineas = [
      "periodo,tipo,valor",
      ...d.historico.map((p) => `${p.periodo},real,${p.valor}`),
      ...d.proyeccion.map((p) => `${p.periodo},proyectado,${p.valor}`),
    ];
    // El BOM es para que Excel abra el CSV con acentos bien desde el doble clic.
    const blob = new Blob(["\uFEFF" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proyeccion-${d.serie.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const presetsRango: { valor: number; label: string }[] = esSemanal
    ? [
        { valor: 8, label: "8 sem" },
        { valor: 12, label: "12 sem" },
        { valor: 26, label: "26 sem" },
        { valor: 0, label: "Todo" },
      ]
    : [
        { valor: 6, label: "6 meses" },
        { valor: 12, label: "12 meses" },
        { valor: 24, label: "24 meses" },
        { valor: 0, label: "Todo" },
      ];

  const borde = { borderColor: "rgba(128,128,128,.3)" };

  return (
    <Layout>
      <div className="space-y-4 max-w-6xl">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Proyecciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Tendencia de las series del negocio y su continuación si todo sigue igual. No adivina: prolonga la línea
            que mejor describe la historia reciente.
          </p>
        </div>

        {catalogo.isLoading && (
          <Card style={borde}>
            <CardContent className="p-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </CardContent>
          </Card>
        )}
        {catalogo.error instanceof Error && (
          <Card style={borde}>
            <CardContent className="p-4 text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {catalogo.error.message}
            </CardContent>
          </Card>
        )}

        {catalogo.data && (
          <Card style={borde}>
            <CardContent className="p-4 flex flex-wrap items-end gap-4">
              <label className="space-y-1 text-xs">
                <span className="opacity-60">Serie</span>
                <select
                  value={serieActiva ?? ""}
                  onChange={(e) => {
                    setSerieId(e.target.value);
                    const def = disponibles.find((s) => s.id === e.target.value);
                    setRango(12); // preset razonable para meses y semanas
                    if (def?.id !== "horas") setProyecto("");
                  }}
                  className="block bg-transparent border rounded px-2 py-1.5 text-sm min-w-56"
                  style={borde}
                  data-testid="select-serie"
                >
                  {disponibles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {serieActiva === "horas" && (
                <label className="space-y-1 text-xs">
                  <span className="opacity-60">Proyecto</span>
                  <select
                    value={proyecto}
                    onChange={(e) => setProyecto(e.target.value)}
                    className="block bg-transparent border rounded px-2 py-1.5 text-sm min-w-44"
                    style={borde}
                    data-testid="select-proyecto"
                  >
                    <option value="">Todo el equipo</option>
                    {(catalogo.data.proyectos ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="space-y-1 text-xs">
                <span className="opacity-60 block">Histórico</span>
                <div className="flex gap-1">
                  {presetsRango.map((r) => (
                    <Button
                      key={r.valor}
                      size="sm"
                      variant={rango === r.valor ? "default" : "outline"}
                      onClick={() => setRango(r.valor)}
                      data-testid={`button-rango-${r.valor}`}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>

              <label className="space-y-1 text-xs">
                <span className="opacity-60">Proyectar</span>
                <select
                  value={horizonte}
                  onChange={(e) => setHorizonte(Number(e.target.value))}
                  className="block bg-transparent border rounded px-2 py-1.5 text-sm"
                  style={borde}
                  data-testid="select-horizonte"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      +{n} {esSemanal ? (n === 1 ? "semana" : "semanas") : n === 1 ? "mes" : "meses"}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>
        )}

        {datos.isLoading && serieActiva && (
          <Card style={borde}>
            <CardContent className="p-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </CardContent>
          </Card>
        )}
        {datos.error instanceof Error && (
          <Card style={borde}>
            <CardContent className="p-4 text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {datos.error.message}
            </CardContent>
          </Card>
        )}

        {d && (
          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <Card className="lg:col-span-2" style={borde}>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{d.serie.label}</h2>
                  <p className="text-xs text-muted-foreground">{NOTA_SERIE[d.serie.id] ?? ""}</p>
                </div>

                {insuficiente && (
                  <div className="text-sm text-amber-400 flex items-center gap-2 border rounded p-3" style={{ borderColor: "rgba(245,158,11,.3)" }}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Aún no hay historia suficiente para proyectar: se necesitan al menos 2 {nombrePeriodo} con datos.
                  </div>
                )}

                {filas.length > 0 && (
                  <div className="h-80" data-testid="chart-proyeccion">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={filas} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.15)" />
                        <XAxis
                          dataKey="periodo"
                          tickFormatter={labelPeriodo}
                          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(128,128,128,.3)" }}
                        />
                        <YAxis
                          tickFormatter={(v: number) => fmtEje(unidad, v)}
                          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          domain={unidad === "pct" ? [0, 100] : undefined}
                        />
                        <Tooltip
                          formatter={(value: number | string, name: string) => [
                            fmtValor(unidad, Number(value)),
                            name,
                          ]}
                          labelFormatter={(l: string) => labelPeriodo(l)}
                          contentStyle={{
                            background: "rgba(20,20,25,.95)",
                            border: "1px solid rgba(128,128,128,.3)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {d.historico.length > 0 && d.proyeccion.length > 0 && (
                          <ReferenceLine
                            x={d.historico[d.historico.length - 1]!.periodo}
                            stroke="rgba(128,128,128,.4)"
                            strokeDasharray="3 3"
                          />
                        )}
                        <Line type="monotone" dataKey="real" name="Real" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                        <Line type="monotone" dataKey="tendencia" name="Tendencia" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        <Line type="monotone" dataKey="proyectado" name="Proyección" stroke="#34d399" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {filas.length === 0 && !insuficiente && (
                  <p className="text-sm text-muted-foreground py-8 text-center">Esta serie todavía no tiene datos.</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card style={borde}>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Lectura rápida</h3>
                  {lecturaTendencia ? (
                    <div className="flex items-start gap-2 text-sm">
                      <lecturaTendencia.icono className={`w-4 h-4 mt-0.5 shrink-0 ${lecturaTendencia.color}`} />
                      <span data-testid="text-tendencia">{lecturaTendencia.texto}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin tendencia calculable todavía.</p>
                  )}
                  {confianza && d.r2 !== null && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={confianza.clase} data-testid="badge-confianza">
                          Confianza {confianza.nivel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">R² = {d.r2.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{confianza.detalle}</p>
                    </div>
                  )}
                  {d.variacion && (
                    <p className="text-xs text-muted-foreground">
                      Último {esSemanal ? "semana" : "mes"} vs anterior:{" "}
                      <span className={d.variacion.diferencia >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {d.variacion.diferencia >= 0 ? "+" : "−"}
                        {unidad === "pct"
                          ? `${Math.abs(d.variacion.diferencia).toLocaleString("es-CL")} puntos`
                          : fmtValor(unidad, Math.abs(d.variacion.diferencia))}
                        {d.variacion.tasa !== null && ` (${d.variacion.tasa >= 0 ? "+" : ""}${Math.round(d.variacion.tasa * 100)}%)`}
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>

              {d.proyeccion.length > 0 && (
                <Card style={borde}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">
                        Próximos {nombrePeriodo}
                      </h3>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={copiarProyeccion} title="Copiar la proyección" data-testid="button-copiar">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={descargarCsv} title="Descargar CSV (histórico + proyección)" data-testid="button-csv">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {d.proyeccion.map((p) => (
                          <tr key={p.periodo} className="border-t" style={borde}>
                            <td className="py-1.5 text-muted-foreground">{labelPeriodo(p.periodo)}</td>
                            <td className="py-1.5 text-right font-medium" data-testid={`text-proyeccion-${p.periodo}`}>
                              {fmtValor(unidad, p.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground">
                      Si la historia reciente se mantiene. Un cambio de equipo, precios o demanda la deja obsoleta.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
