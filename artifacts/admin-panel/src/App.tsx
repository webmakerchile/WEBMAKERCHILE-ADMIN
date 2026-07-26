import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, Component, lazy, Suspense, type ReactNode } from "react";
import { LangProvider } from "@/lib/lang";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { ConnectionBanner } from "@/components/connection-banner";
import { Loader2, AlertTriangle, ShieldOff } from "lucide-react";
import { setSentryUser, setSentryRoute } from "@/lib/sentry";
import { canAccessRoute, roleHome, type TeamRole } from "@workspace/roles";
import { useEffect } from "react";
import { areaCanAccessPage, toArea, AREA_HOME, type Area } from "@workspace/areas";

// Eager: dashboard is the landing page; login pages are tiny and unauthed.
import Dashboard from "./pages/dashboard";
import LoginPage from "./pages/login";
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
const EjecutivoPage = lazy(() => import("./pages/ejecutivo"));
const ReportesPage = lazy(() => import("./pages/reportes"));
const VentasPage = lazy(() => import("./pages/ventas"));
const MisTareasPage = lazy(() => import("./pages/mis-tareas"));
const RrhhPage = lazy(() => import("./pages/rrhh"));
const TicketsPage = lazy(() => import("./pages/tickets"));
const MiDiaPage = lazy(() => import("./pages/mi-dia"));

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
  const [location, setLocation] = useLocation();
  const isSuperAdmin = user?.role === "superadmin";
  const allowed = !user || canAccessRoute(user.teamRole, location, isSuperAdmin);
  const home = roleHome(user?.teamRole, isSuperAdmin);

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

/** Shown when a user tries to access a page outside their area. */
function UnauthorizedPage() {
  const user = useAuth();
  const area = toArea(user?.teamRole);
  const home = AREA_HOME[area];
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center p-8 max-w-sm">
        <ShieldOff className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold mb-1">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tu área no tiene permiso para ver esta sección.
        </p>
        <button
          onClick={() => setLocation(home)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
        >
          Ir a mi panel
        </button>
      </div>
    </div>
  );
}

/** Wraps a page and shows UnauthorizedPage if the current user's area cannot access path. */
function AreaGuard({ path, children }: { path: string; children: ReactNode }) {
  const user = useAuth();
  const area = toArea(user?.teamRole);
  if (!areaCanAccessPage(area, path)) {
    return <UnauthorizedPage />;
  }
  return <>{children}</>;
}

/** Legacy guard kept for the /ejecutivo route — now expanded to include "ejecutivo" area. */
function EjecutivoRoute({ children }: { children: ReactNode }) {
  const user = useAuth();
  if (!user) return null;
  const area = toArea(user.teamRole);
  if (user.role !== "superadmin" && area !== "ceo" && area !== "ejecutivo" && area !== "rrhh") {
    return <UnauthorizedPage />;
  }
  return <>{children}</>;
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

  // Post-login redirect: send each area to its home page when landing on "/".
  useEffect(() => {
    if (!user || user.approvalStatus !== "approved") return;
    const area = toArea(user.teamRole);
    const home = AREA_HOME[area as Area];
    if (location === "/" && home !== "/") {
      setLocation(home);
    }
  }, [user?.teamRole, user?.approvalStatus, location, setLocation]);

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

  return (
    <AuthContext.Provider value={user}>
      <RouteTracker />
      {children}
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
        <AreaGuard path="/">
          <RouteShell name="dashboard"><Dashboard /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/videos">
        <AreaGuard path="/videos">
          <RouteShell name="videos"><VideosPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/cover">
        <AreaGuard path="/cover">
          <RouteShell name="cover"><CoverGeneratorPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/drive">
        <AreaGuard path="/drive">
          <RouteShell name="drive"><DriveBrowserPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/schedule">
        <AreaGuard path="/schedule">
          <RouteShell name="schedule"><SchedulePage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/estudio">
        <AreaGuard path="/estudio">
          <RouteShell name="estudio"><StudioPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/historias">
        <AreaGuard path="/historias">
          <RouteShell name="historias"><HistoriasPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/descripciones">
        <AreaGuard path="/descripciones">
          <RouteShell name="descripciones"><DescripcionesPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/cuentas">
        <AreaGuard path="/cuentas">
          <RouteShell name="cuentas"><CuentasPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/biblioteca">
        <AreaGuard path="/biblioteca">
          <RouteShell name="biblioteca"><BibliotecaPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/insights">
        <AreaGuard path="/insights">
          <RouteShell name="insights"><InsightsPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/campanas/:id">
        <AreaGuard path="/biblioteca">
          <RouteShell name="campana"><CampanaPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/equipo">
        <AreaGuard path="/equipo">
          <RouteShell name="equipo"><EquipoPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/transcriptor">
        <AreaGuard path="/transcriptor">
          <RouteShell name="transcriptor"><TranscriptorPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/ayuda">
        <AreaGuard path="/ayuda">
          <RouteShell name="ayuda"><AyudaPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/ajustes">
        <AreaGuard path="/ajustes">
          <RouteShell name="ajustes"><AjustesPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/mi-dia">
        <AreaGuard path="/mi-dia">
          <RouteShell name="mi-dia"><MiDiaPage /></RouteShell>
        </AreaGuard>
      </Route>
      <Route path="/ejecutivo">
        <EjecutivoRoute>
          <RouteShell name="ejecutivo"><EjecutivoPage /></RouteShell>
        </EjecutivoRoute>
      </Route>
      <Route path="/reportes">
        <RouteShell name="reportes"><ReportesPage /></RouteShell>
      </Route>
      <Route path="/ventas">
        <RouteShell name="ventas"><VentasPage /></RouteShell>
      </Route>
      <Route path="/mis-tareas">
        <RouteShell name="mis-tareas"><MisTareasPage /></RouteShell>
      </Route>
      <Route path="/rrhh">
        <RouteShell name="rrhh"><RrhhPage /></RouteShell>
      </Route>
      <Route path="/tickets">
        <RouteShell name="tickets"><TicketsPage /></RouteShell>
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
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </LangProvider>
  );
}

export default App;
