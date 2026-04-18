import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, Component, type ReactNode } from "react";
import Dashboard from "./pages/dashboard";
import VideosPage from "./pages/videos";
import CoverGeneratorPage from "./pages/cover-generator";
import DriveBrowserPage from "./pages/drive-browser";
import SchedulePage from "./pages/schedule";
import StudioPage from "./pages/studio";
import HistoriasPage from "./pages/historias";
import DescripcionesPage from "./pages/descripciones";
import LoginPage from "./pages/login";
import TermsPage from "./pages/terms";
import PrivacyPage from "./pages/privacy";
import NotFound from "./pages/not-found";
import { Loader2, AlertTriangle } from "lucide-react";

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
    }
  }
});

type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
};

const AuthContext = createContext<AuthUser | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthLoader({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      if (!res.ok) throw new Error("No autenticado");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !user) {
    return <LoginPage />;
  }

  return (
    <AuthContext.Provider value={user}>
      {children}
    </AuthContext.Provider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/videos" component={VideosPage} />
      <Route path="/cover" component={CoverGeneratorPage} />
      <Route path="/drive" component={DriveBrowserPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/estudio" component={StudioPage} />
      <Route path="/historias" component={HistoriasPage} />
      <Route path="/descripciones" component={DescripcionesPage} />
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <PublicRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
