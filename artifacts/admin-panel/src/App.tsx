import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as WmcToaster } from "@/components/wmc/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, Component, lazy, Suspense, type ReactNode } from "react";
import { LangProvider } from "@/lib/lang";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { ConnectionBanner } from "@/components/connection-banner";
import { Loader2, AlertTriangle } from "lucide-react";
import { setSentryUser, setSentryRoute } from "@/lib/sentry";
import { queryClient as wmcQueryClient } from "@/lib/wmc/queryClient";
import { canAccessRoute, roleHome, canManageTeam, type TeamRole } from "@workspace/roles";
import { ViewAsProvider, useEffectiveRole, useViewAs } from "@/lib/view-as";
import { useEffect } from "react";

// Eager: dashboard is the landing page; login pages are tiny and unauthed.
import Dashboard from "./pages/dashboard";
import LoginPage from "./pages/login";
import PantallaClave from "./pages/clave";
import PendingApprovalPage from "./pages/pending-approval";
import TermsPage from "./pages/terms";
import PrivacyPage from "./pages/privacy";
import NotFound from "./pages/not-found";

// Lazy: heavy/route-specific pages. Each becomes its own chunk so initial
// load only ships the dashboard.
const VideosPage = lazy(() => import("./pages/videos"));
const CoverGeneratorPage = lazy(() => import("./pages/cover-generator"));
const DriveBrowserPage = lazy(() => import("./pages/drive-browser"));
const SchedulePage = lazy(() => import("./pages/schedule"));
const StudioPage = lazy(() => import("./pages/studio"));
const HistoriasPage = lazy(() => import("./pages/historias"));
const DescripcionesPage = lazy(() => import("./pages/descripciones"));
const CuentasPage = lazy(() => import("./pages/cuentas"));
const AyudaPage = lazy(() => import("./pages/ayuda"));
const BibliotecaPage = lazy(() => import("./pages/biblioteca"));
const CampanaPage = lazy(() => import("./pages/campana"));
const InsightsPage = lazy(() => import("./pages/insights"));
const EquipoPage = lazy(() => import("./pages/equipo"));
const TranscriptorPage = lazy(() => import("./pages/transcriptor"));
const AjustesPage = lazy(() => import("./pages/ajustes"));
const DashboardEjecutivoPage = lazy(() => import("./pages/dashboard-ejecutivo"));
const TorreCeoPage = lazy(() => import("./pages/torre-ceo"));
const ProyectosPage = lazy(() => import("./pages/proyectos"));
const ClientesPage = lazy(() => import("./pages/clientes"));
const ReunionesPage = lazy(() => import("./pages/reuniones"));
const NotasPage = lazy(() => import("./pages/notas"));
const ContratosPage = lazy(() => import("./pages/contratos"));
const VentasPage = lazy(() => import("./pages/ventas"));
const CobrosPage = lazy(() => import("./pages/cobros"));
const ServiciosPage = lazy(() => import("./pages/servicios"));
const EquipoHoyPage = lazy(() => import("./pages/equipo-hoy"));
const AsistenciaPage = lazy(() => import("./pages/asistencia"));
const DriveHubPage = lazy(() => import("./pages/drive-hub"));
const ReportesPage = lazy(() => import("./pages/reportes"));
const ProyeccionesPage = lazy(() => import("./pages/proyecciones"));
const MisTareasPage = lazy(() => import("./pages/mis-tareas"));
const MisPendientesPage = lazy(() => import("./pages/mis-pendientes"));
const RrhhPage = lazy(() => import("./pages/rrhh"));
const TicketsPage = lazy(() => import("./pages/tickets"));
const EdicionPage = lazy(() => import("./pages/edicion"));
const RedesPage = lazy(() => import("./pages/redes"));
const MarketingPage = lazy(() => import("./pages/marketing"));
const MetasPage = lazy(() => import("./pages/metas"));
const MiDiaPage = lazy(() => import("./pages/mi-dia"));
const AgenciaPage = lazy(() => import("./pages/agencia"));

// Wmc: pantallas portadas 1:1 desde webmakerlatam.com (propuestas/proyectos).
// Llaman al service API del origen vía proxy — este panel no guarda sus datos.
const WmcProposalsPage = lazy(() => import("./pages/wmc/proposals"));
const WmcProposalBuilderPage = lazy(() => import("./pages/wmc/proposal-builder"));
const WmcProposalDetailsPage = lazy(() => import("./pages/wmc/proposal-details"));
const WmcProjectsPage = lazy(() => import("./pages/wmc/projects"));
const WmcProjectDetailsPage = lazy(() => import("./pages/wmc/project-details"));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Ocurrió un error</h2>
            <p className="text-sm text-muted-foreground mb-4">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: "" }); window.location.href = "/"; }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    }
  }
});

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
  teamRole?: TeamRole;
  approvalStatus?: string;
  /** La cuenta de dirección debe validar su clave extra antes de usar el panel. */
  claveRequerida?: boolean;
  /** Acceso a las pantallas portadas de webmakerlatam.com, calculado por rol (dev/ventas/ceo). */
  wmcAccess?: boolean;
};

const AuthContext = createContext<AuthUser | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

/**
 * Envuelve cada ruta con su error boundary y el control de acceso por rol:
 * si el rol del usuario no puede ver esta ruta, lo mandamos a su pantalla de
 * inicio en vez de mostrarle una página vacía o un 404.
 */
function RouteShell({ name, children }: { name: string; children: ReactNode }) {
  const user = useAuth();
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  const [location, setLocation] = useLocation();
  // Al simular otro rol, el atajo de superadmin no aplica: la gracia es ver
  // exactamente lo que ve esa persona, con sus límites.
  const isSuperAdmin = !viewAs && user?.role === "superadmin";
  const allowed = !user || canAccessRoute(effectiveRole, location, isSuperAdmin);
  const home = roleHome(effectiveRole, isSuperAdmin);

  useEffect(() => {
    if (!allowed && location !== home) setLocation(home, { replace: true });
  }, [allowed, location, home, setLocation]);

  if (!allowed) return <PageLoader />;

  return (
    <RouteErrorBoundary routeName={name}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

/**
 * Gate para las pantallas portadas 1:1 desde webmakerlatam.com (propuestas y
 * proyectos bajo /admin/*): independiente del sistema de rol/área
 * (canAccessRoute) a propósito — el acceso se decide por rol (dev/ventas/ceo),
 * no por área. La aplicación real vive en el servidor (cada llamada al proxy
 * la valida); esto solo evita mostrar la UI, con un mensaje claro en vez de
 * redirigir en silencio.
 */
function WmcRouteShell({ name, children }: { name: string; children: ReactNode }) {
  const user = useAuth();
  const allowed = !!user?.wmcAccess;

  if (!allowed) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Acceso restringido</h2>
          <p className="text-sm text-muted-foreground">
            Esta sección no está disponible para tu cuenta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={wmcQueryClient}>
      <RouteErrorBoundary routeName={name}>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </RouteErrorBoundary>
    </QueryClientProvider>
  );
}

function AccessDeniedScreen({ user }: { user: AuthUser }) {
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Ignorar: igual redirigimos al login.
    }
    clearSessionHint();
    window.location.href = "/";
  };
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Acceso denegado</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tu cuenta {user.email ? `(${user.email}) ` : ""}fue rechazada por el administrador.
          Si crees que se trata de un error, contacta al equipo.
        </p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function ReconnectingScreen() {
  const qc = useQueryClient();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center p-8 max-w-sm">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-1">Reconectando con el servidor…</h2>
        <p className="text-sm text-muted-foreground mb-5">
          El servidor está iniciando, por favor espera un momento.
        </p>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["auth-me"] })}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Reintentar ahora
        </button>
      </div>
    </div>
  );
}

const SESSION_HINT_KEY = "wm_auth_hint";

function setSessionHint() {
  try { localStorage.setItem(SESSION_HINT_KEY, "1"); } catch {}
}
function clearSessionHint() {
  try { localStorage.removeItem(SESSION_HINT_KEY); } catch {}
}
function hasSessionHint() {
  try { return !!localStorage.getItem(SESSION_HINT_KEY); } catch { return false; }
}

function AuthLoader({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      if (res.status === 401) throw new Error("No autenticado");
      if (!res.ok) throw new Error(`server_error_${res.status}`);
      const data = await res.json();
      setSessionHint();
      return data;
    },
    retry: (failureCount, error: any) => {
      if (error?.message === "No autenticado") {
        // Si el usuario estaba autenticado previamente, reintentamos hasta 4 veces
        // para cubrir el caso de un reinicio de servidor (el servidor puede devolver
        // 401 transitoriamente mientras la sesión PG se inicializa).
        if (hasSessionHint() && failureCount < 4) return true;
        return false;
      }
      return failureCount < 8;
    },
    retryDelay: (attempt, error: any) => {
      if ((error as Error)?.message === "No autenticado") return 3000;
      return Math.min(1500 * attempt, 5000);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.approvalStatus === "pending" ? 30_000 : false,
  });

  useEffect(() => {
    setSentryUser(user ? { id: user.id, email: user.email } : null);
  }, [user]);

  // Post-login redirect: send each role to its home page when landing on "/".
  useEffect(() => {
    if (!user || user.approvalStatus !== "approved") return;
    const home = roleHome(user.teamRole, user.role === "superadmin");
    if (location === "/" && home !== "/") {
      setLocation(home);
    }
  }, [user?.teamRole, user?.role, user?.approvalStatus, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && (error as Error).message !== "No autenticado") {
    return <ReconnectingScreen />;
  }

  if (error || !user) {
    return <LoginPage />;
  }

  if (user.approvalStatus === "pending") {
    return <PendingApprovalPage user={user} />;
  }

  if (user.approvalStatus === "rejected") {
    return <AccessDeniedScreen user={user} />;
  }

  if (user.claveRequerida) {
    return (
      <PantallaClave
        email={user.email}
        alSalir={async () => {
          try {
            await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
          } catch {
            // Ignorar: igual redirigimos al login.
          }
          clearSessionHint();
          window.location.href = "/";
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={user}>
      <ViewAsProvider
        realRole={user.teamRole}
        canSimulate={canManageTeam(user.teamRole, user.role === "superadmin")}
      >
        <RouteTracker />
        {children}
      </ViewAsProvider>
    </AuthContext.Provider>
  );
}

function RouteTracker() {
  const [location] = useLocation();
  useEffect(() => {
    setSentryRoute(location);
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <RouteShell name="dashboard"><Dashboard /></RouteShell>
      </Route>
      <Route path="/videos">
        <RouteShell name="videos"><VideosPage /></RouteShell>
      </Route>
      <Route path="/cover">
        <RouteShell name="cover"><CoverGeneratorPage /></RouteShell>
      </Route>
      <Route path="/drive">
        <RouteShell name="drive"><DriveBrowserPage /></RouteShell>
      </Route>
      <Route path="/schedule">
        <RouteShell name="schedule"><SchedulePage /></RouteShell>
      </Route>
      <Route path="/estudio">
        <RouteShell name="estudio"><StudioPage /></RouteShell>
      </Route>
      <Route path="/historias">
        <RouteShell name="historias"><HistoriasPage /></RouteShell>
      </Route>
      <Route path="/descripciones">
        <RouteShell name="descripciones"><DescripcionesPage /></RouteShell>
      </Route>
      <Route path="/cuentas">
        <RouteShell name="cuentas"><CuentasPage /></RouteShell>
      </Route>
      <Route path="/biblioteca">
        <RouteShell name="biblioteca"><BibliotecaPage /></RouteShell>
      </Route>
      <Route path="/insights">
        <RouteShell name="insights"><InsightsPage /></RouteShell>
      </Route>
      <Route path="/campanas/:id">
        <RouteShell name="campana"><CampanaPage /></RouteShell>
      </Route>
      <Route path="/equipo">
        <RouteShell name="equipo"><EquipoPage /></RouteShell>
      </Route>
      <Route path="/transcriptor">
        <RouteShell name="transcriptor"><TranscriptorPage /></RouteShell>
      </Route>
      <Route path="/ayuda">
        <RouteShell name="ayuda"><AyudaPage /></RouteShell>
      </Route>
      <Route path="/ajustes">
        <RouteShell name="ajustes"><AjustesPage /></RouteShell>
      </Route>
      <Route path="/mi-dia">
        <RouteShell name="mi-dia"><MiDiaPage /></RouteShell>
      </Route>
      <Route path="/dashboard-ejecutivo">
        <RouteShell name="dashboard-ejecutivo"><DashboardEjecutivoPage /></RouteShell>
      </Route>
      <Route path="/torre-ceo">
        <RouteShell name="torre-ceo"><TorreCeoPage /></RouteShell>
      </Route>
      <Route path="/proyectos">
        <RouteShell name="proyectos"><ProyectosPage /></RouteShell>
      </Route>
      <Route path="/clientes">
        <RouteShell name="clientes"><ClientesPage /></RouteShell>
      </Route>
      <Route path="/reuniones">
        <RouteShell name="reuniones"><ReunionesPage /></RouteShell>
      </Route>
      <Route path="/notas">
        <RouteShell name="notas"><NotasPage /></RouteShell>
      </Route>
      <Route path="/contratos">
        <RouteShell name="contratos"><ContratosPage /></RouteShell>
      </Route>
      <Route path="/ventas">
        <RouteShell name="ventas"><VentasPage /></RouteShell>
      </Route>
      <Route path="/cobros">
        <RouteShell name="cobros"><CobrosPage /></RouteShell>
      </Route>
      <Route path="/servicios">
        <RouteShell name="servicios"><ServiciosPage /></RouteShell>
      </Route>
      <Route path="/equipo-hoy">
        <RouteShell name="equipo-hoy"><EquipoHoyPage /></RouteShell>
      </Route>
      <Route path="/asistencia">
        <RouteShell name="asistencia"><AsistenciaPage /></RouteShell>
      </Route>
      <Route path="/drive-hub">
        <RouteShell name="drive-hub"><DriveHubPage /></RouteShell>
      </Route>
      <Route path="/reportes">
        <RouteShell name="reportes"><ReportesPage /></RouteShell>
      </Route>
      <Route path="/proyecciones">
        <RouteShell name="proyecciones"><ProyeccionesPage /></RouteShell>
      </Route>
      <Route path="/agencia">
        <RouteShell name="agencia"><AgenciaPage /></RouteShell>
      </Route>
      <Route path="/agencia/*">
        <RouteShell name="agencia"><AgenciaPage /></RouteShell>
      </Route>
      <Route path="/mis-tareas">
        <RouteShell name="mis-tareas"><MisTareasPage /></RouteShell>
      </Route>
      <Route path="/mis-pendientes">
        <RouteShell name="mis-pendientes"><MisPendientesPage /></RouteShell>
      </Route>
      <Route path="/rrhh">
        <RouteShell name="rrhh"><RrhhPage /></RouteShell>
      </Route>
      <Route path="/tickets">
        <RouteShell name="tickets"><TicketsPage /></RouteShell>
      </Route>
      <Route path="/edicion">
        <RouteShell name="edicion"><EdicionPage /></RouteShell>
      </Route>
      <Route path="/redes">
        <RouteShell name="redes"><RedesPage /></RouteShell>
      </Route>
      <Route path="/marketing">
        <RouteShell name="marketing"><MarketingPage /></RouteShell>
      </Route>
      <Route path="/metas">
        <RouteShell name="metas"><MetasPage /></RouteShell>
      </Route>
      <Route path="/admin/proposals/:id">
        <WmcRouteShell name="wmc-proposal-details"><WmcProposalDetailsPage /></WmcRouteShell>
      </Route>
      <Route path="/admin/proposals">
        <WmcRouteShell name="wmc-proposals"><WmcProposalsPage /></WmcRouteShell>
      </Route>
      <Route path="/admin/proposal-builder">
        <WmcRouteShell name="wmc-proposal-builder"><WmcProposalBuilderPage /></WmcRouteShell>
      </Route>
      <Route path="/admin/projects/:id">
        <WmcRouteShell name="wmc-project-details"><WmcProjectDetailsPage /></WmcRouteShell>
      </Route>
      <Route path="/admin/projects">
        <WmcRouteShell name="wmc-projects"><WmcProjectsPage /></WmcRouteShell>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRoutes() {
  return (
    <Switch>
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route>
        <AuthLoader>
          <Router />
        </AuthLoader>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <LangProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ConnectionBanner />
              <PublicRoutes />
            </WouterRouter>
            <Toaster />
            <WmcToaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </LangProvider>
  );
}

export default App;
