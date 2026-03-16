import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext } from "react";
import Dashboard from "./pages/dashboard";
import VideosPage from "./pages/videos";
import CoverGeneratorPage from "./pages/cover-generator";
import DriveBrowserPage from "./pages/drive-browser";
import SchedulePage from "./pages/schedule";
import StudioPage from "./pages/studio";
import LoginPage from "./pages/login";
import NotFound from "./pages/not-found";
import { Loader2 } from "lucide-react";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthLoader>
            <Router />
          </AuthLoader>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
