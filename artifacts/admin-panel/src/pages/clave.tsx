import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/**
 * Candado extra de la cuenta de dirección: después del login con Google, el
 * servidor bloquea TODO el panel (403 clave_requerida) hasta validar esta
 * clave. Acá solo se dibuja la puerta; la cerradura vive en el backend.
 */
export default function PantallaClave({ email, alSalir }: { email: string; alSalir: () => void }) {
  const qc = useQueryClient();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clave || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/auth/clave`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      if (r.ok) {
        // /auth/me se refresca y deja de pedir clave → la app se desbloquea.
        await qc.invalidateQueries({ queryKey: ["auth-me"] });
        return;
      }
      if (r.status === 429) {
        setError("Demasiados intentos. Esperá unos minutos y probá de nuevo.");
      } else {
        setError("Clave incorrecta.");
      }
      setClave("");
    } catch {
      setError("No se pudo verificar la clave. Revisá tu conexión.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-center text-lg font-semibold">Un paso más</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Esta cuenta tiene una clave adicional de seguridad.
          </p>
          <p className="mt-1 text-center text-xs text-muted-foreground">{email}</p>

          <form onSubmit={enviar} className="mt-5 space-y-3">
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="Clave del panel"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={!clave || enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        </div>

        <button
          onClick={alSalir}
          className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut size={14} /> Salir y entrar con otra cuenta
        </button>
      </div>
    </div>
  );
}
