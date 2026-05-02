import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Send } from "lucide-react";

type Props = {
  children: ReactNode;
  routeName?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
};

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[RouteErrorBoundary${this.props.routeName ? `:${this.props.routeName}` : ""}]`, error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: "" });
  };

  report = () => {
    const subject = encodeURIComponent(`Error en ${this.props.routeName || "la app"}`);
    const body = encodeURIComponent(
      `Hola,\n\nEncontré este error:\n\n${this.state.errorInfo}\n\nRuta: ${window.location.pathname}\nFecha: ${new Date().toISOString()}\n\nGracias.`,
    );
    window.location.href = `mailto:soporte@webmakerlatam.com?subject=${subject}&body=${body}`;
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-card rounded-2xl border border-foreground/10 p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/15 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-display font-bold">Algo salió mal</h2>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado al cargar esta sección. Puedes reintentar o reportarlo.
            </p>
            {this.state.errorInfo && (
              <p className="text-xs text-muted-foreground/70 mt-2 break-words font-mono">
                {this.state.errorInfo}
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-orange-400 transition"
            >
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              onClick={this.report}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition"
            >
              <Send className="w-4 h-4" />
              Reportar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
