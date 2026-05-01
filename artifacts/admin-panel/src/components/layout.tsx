import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";
import { useQueryClient } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Video, 
  Image as ImageIcon, 
  FolderTree, 
  CalendarClock,
  Clapperboard,
  Sparkles,
  MessageSquareText,
  Users2,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Inicio" },
  { href: "/schedule", icon: CalendarClock, label: "Publicaciones" },
  { href: "/cuentas", icon: Users2, label: "Cuentas Sociales" },
  { href: "/videos", icon: Video, label: "Gestor de Videos" },
  { href: "/cover", icon: ImageIcon, label: "Portadas" },
  { href: "/historias", icon: Sparkles, label: "Historias" },
  { href: "/descripciones", icon: MessageSquareText, label: "Descripciones" },
  { href: "/drive", icon: FolderTree, label: "Drive" },
  { href: "/estudio", icon: Clapperboard, label: "Estudio" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const user = useAuth();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  };

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-white/5 bg-card/50 backdrop-blur-xl flex-col relative z-20">
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg mr-3" />
          <h1 className="font-display font-bold text-xl tracking-tight text-gradient">
            WebMaker<span className="text-primary">Admin</span>
          </h1>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-3 rounded-xl transition-all duration-300 group relative",
                  isActive 
                    ? "text-primary-foreground font-medium" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute inset-0 bg-gradient-to-r from-primary/90 to-orange-500/80 rounded-xl shadow-lg shadow-primary/20"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon className={cn("w-5 h-5 mr-3 relative z-10", isActive ? "text-white" : "group-hover:text-primary transition-colors")} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-3">
              {user.picture ? (
                <img src={user.picture} alt={user.name || ""} className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {(user.name || user.email || "?")[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name || "Admin"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition-all duration-200"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-white/5 bg-card/80 backdrop-blur-xl relative z-30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg" />
            <span className="font-display font-bold text-lg text-gradient">
              WebMaker<span className="text-primary">Admin</span>
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-card border-l border-white/5 z-50 flex flex-col"
              >
                <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
                  <span className="font-display font-bold text-lg">Menú</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-white/10">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                  {navItems.map((item) => {
                    const isActive = location === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center px-4 py-3.5 rounded-xl transition-all",
                          isActive
                            ? "bg-gradient-to-r from-primary/90 to-orange-500/80 text-white font-medium shadow-lg shadow-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        <Icon className={cn("w-5 h-5 mr-3", isActive ? "text-white" : "")} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="p-4 border-t border-white/5 space-y-3">
                  {user && (
                    <div className="flex items-center gap-3 px-3">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name || ""} className="w-9 h-9 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                          {(user.name || user.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name || "Admin"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-3 py-3 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Cerrar Sesión
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 relative overflow-y-auto overflow-x-hidden bg-background">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="min-h-full px-4 py-6 lg:p-8 max-w-7xl mx-auto relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {children}
            </motion.div>
          </div>
        </main>

        <nav className="lg:hidden flex-shrink-0 border-t border-white/5 bg-card/80 backdrop-blur-xl safe-bottom">
          <div className="flex items-center justify-around h-16 px-1">
            {navItems.slice(0, 5).map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors min-w-0 flex-1",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_rgba(249,115,22,0.5)]")} />
                  <span className={cn("text-[10px] leading-tight truncate max-w-full", isActive && "font-semibold")}>{item.label.split(" ")[0]}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg text-muted-foreground min-w-0 flex-1"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] leading-tight">Más</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
