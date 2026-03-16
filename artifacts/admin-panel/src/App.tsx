import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/dashboard";
import VideosPage from "./pages/videos";
import CoverGeneratorPage from "./pages/cover-generator";
import DriveBrowserPage from "./pages/drive-browser";
import ChatPage from "./pages/chat";
import SchedulePage from "./pages/schedule";
import StudioPage from "./pages/studio";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/videos" component={VideosPage} />
      <Route path="/cover" component={CoverGeneratorPage} />
      <Route path="/drive" component={DriveBrowserPage} />
      <Route path="/chat" component={ChatPage} />
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
