import { motion } from "framer-motion";
import { Clock, LogOut, Mail } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type AuthUser = { id: number; email: string; name: string | null; picture: string | null };

export default function PendingApprovalPage({ user }: { user: AuthUser }) {
  const handleLogout = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    try { localStorage.removeItem("wm_auth_hint"); } catch {}
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-card/50 backdrop-blur-xl border border-foreground/15 rounded-3xl p-10 shadow-2xl text-center">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, repeatDelay: 4, duration: 0.6 }}
            className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <Clock className="w-10 h-10 text-amber-400" />
          </motion.div>

          <h1 className="font-bold text-2xl tracking-tight mb-2">
            Acceso pendiente
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            Tu solicitud fue recibida. El administrador revisará tu cuenta y te dará acceso en breve.
          </p>

          {user.picture && (
            <div className="flex items-center gap-3 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 mb-6 text-left">
              <img src={user.picture} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.name || "Sin nombre"}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="w-3 h-3 inline" />
                  {user.email}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/60 mb-6">
            Cuando recibas acceso, recarga esta página o vuelve a iniciar sesión.
          </p>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          © {new Date().getFullYear()} WebMaker Latam
        </p>
      </motion.div>
    </div>
  );
}
