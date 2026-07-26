import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, Component, lazy, Suspense, type ReactNode } from "react";
import { LangProvider } from "@/lib/lang";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { ConnectionBanner } from "@/components/connection-banner";
import { Loader2, AlertTriangle } from "lucide-react";
import { setSentryUser, setSentryRoute } from "@/lib/sentry";
import { canAccessRoute, roleHome, type TeamRole } from "@workspace/roles";
import { useEffect } from "react";

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
      // Mild default cache so navigation feels instant; per-query overrides
      // (e.g. analytics, RSS news, library) bump this further when data is
      // expensive to fetch and changes infrequently.
      staleTime: 30_000,
    }
  }
});

type AuthUser = {
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

function AccessDeniedScreen({ user }: { user: AuthUser }) {
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Ignorar: igual redirigimos al login.
    }
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

function AuthLoader({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      if (res.status === 401) throw new Error("No autenticado");
      if (!res.ok) throw new Error(`server_error_${res.status}`);
      return res.json();
    },
    retry: (failureCount, error: any) => {
      // 401 = sesión inválida, no reintentar
      if (error?.message === "No autenticado") return false;
      // Errores de servidor/red durante arranque: hasta 8 intentos (~25 s)
      return failureCount < 8;
    },
    retryDelay: (attempt) => Math.min(1500 * attempt, 5000),
    staleTime: 5 * 60 * 1000,
    // Mientras la cuenta está pendiente, re-consultar cada 30s para que al
    // aprobarla se desbloquee el panel sin recargar la página.
    refetchInterval: (query) =>
      query.state.data?.approvalStatus === "pending" ? 30_000 : false,
  });

  useEffect(() => {
    setSentryUser(user ? { id: user.id, email: user.email } : null);
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error de servidor/red (no 401): mostrar pantalla de reconexión, no login
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
      <Route path="/ejecutivo">
        <RouteShell name="ejecutivo"><EjecutivoPage /></RouteShell>
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
