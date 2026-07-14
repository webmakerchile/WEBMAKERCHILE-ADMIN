import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState } from "react";
import { Loader2, Languages } from "lucide-react";
import { useLang } from "@/lib/lang";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export default function LoginPage() {
  const { t, toggleLang, lang } = useLang();
  const [showTestLogin, setShowTestLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testError, setTestError] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/auth/google`;
  };

  const handleTestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestError("");
    setTestLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/test-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error || "Error al iniciar sesión");
        return;
      }
      window.location.href = "/";
    } catch {
      setTestError(t.loginConnError);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <button
        onClick={toggleLang}
        title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
        className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-xs font-semibold text-muted-foreground hover:bg-foreground/10 transition-colors"
      >
        <Languages className="w-3.5 h-3.5" />
        {t.langLabel}
      </button>
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-card/50 backdrop-blur-xl border border-foreground/15 rounded-3xl p-10 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <motion.img
              src="/icon-192.png"
              alt="WebMakerAdmin"
              className="w-20 h-20 rounded-2xl mb-6 shadow-lg shadow-primary/20"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
            />
            <h1 className="font-display font-bold text-3xl tracking-tight text-center">
              WebMaker<span className="text-primary">Admin</span>
            </h1>
            <p className="text-muted-foreground mt-3 text-center text-sm">
              {t.loginSubtitle}
            </p>
          </div>

          <Button
            onClick={handleGoogleLogin}
            className="w-full h-14 text-base font-semibold rounded-xl bg-white hover:bg-gray-100 text-gray-800 border border-gray-200 shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t.loginGoogle}
          </Button>

          {!showTestLogin ? (
            <button
              onClick={() => setShowTestLogin(true)}
              className="w-full mt-4 text-xs text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors py-2"
            >
              {t.loginTestLink}
            </button>
          ) : (
            <form onSubmit={handleTestLogin} className="mt-4 space-y-3">
              <div className="border-t border-foreground/15 pt-4">
                <p className="text-xs text-muted-foreground/60 text-center mb-3">{t.loginTestLabel}</p>
                <input
                  type="text"
                  placeholder={t.loginUser}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-background/60 border border-foreground/15 text-foreground text-sm placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  autoComplete="username"
                />
                <input
                  type="password"
                  placeholder={t.loginPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-2 px-4 py-3 rounded-xl bg-background/60 border border-foreground/15 text-foreground text-sm placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  autoComplete="current-password"
                />
                {testError && (
                  <p className="text-xs text-red-400 mt-2 text-center">{testError}</p>
                )}
                <Button
                  type="submit"
                  disabled={testLoading || !username || !password}
                  className="w-full mt-3 h-11 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                >
                  {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.loginEnter}
                </Button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground/60">
              {t.loginOnlyAuth}
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-[11px] text-muted-foreground/50">
              {t.loginAgree}{" "}
              <a href={`${import.meta.env.BASE_URL}terms`.replace(/\/+/g, "/")} className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">
                {t.loginTerms}
              </a>
              {" "}{t.loginAnd}{" "}
              <a href={`${import.meta.env.BASE_URL}privacy`.replace(/\/+/g, "/")} className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">
                {t.loginPrivacy}
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          © {new Date().getFullYear()} WebMaker Latam
        </p>
      </motion.div>
    </div>
  );
}
