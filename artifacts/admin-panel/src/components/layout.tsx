import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";
import { useQueryClient } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Video, 
  Image as ImageIcon, 
  FolderTree, 
  MessageSquare, 
  CalendarClock,
  Clapperboard,
  LogOut,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/videos", icon: Video, label: "Gestor de Videos" },
  { href: "/cover", icon: ImageIcon, label: "Generador de Portadas" },
  { href: "/drive", icon: FolderTree, label: "Explorador Drive" },
  { href: "/estudio", icon: Clapperboard, label: "Estudio de Trabajo" },
  { href: "/chat", icon: MessageSquare, label: "Asistente AI" },
  { href: "/schedule", icon: CalendarClock, label: "Programación" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const user = useAuth();
  const queryClient = useQueryClient();

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
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <motion.aside 
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        className="w-64 flex-shrink-0 border-r border-white/5 bg-card/50 backdrop-blur-xl flex flex-col relative z-20"
      >
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <Sparkles className="w-6 h-6 text-primary mr-3" />
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
                <img
                  src={user.picture}
                  alt={user.name || ""}
                  className="w-8 h-8 rounded-full border border-white/10"
                  referrerPolicy="no-referrer"
                />
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
      </motion.aside>

      <main className="flex-1 relative overflow-y-auto overflow-x-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="min-h-full p-8 max-w-7xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
