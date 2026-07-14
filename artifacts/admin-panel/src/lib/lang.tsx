import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "es" | "en";

const T = {
  es: {
    // Login
    loginSubtitle: "Panel de administración de contenido",
    loginGoogle: "Iniciar sesión con Google",
    loginTestLink: "Iniciar con cuenta de prueba",
    loginTestLabel: "Cuenta de prueba",
    loginUser: "Usuario",
    loginPassword: "Contraseña",
    loginEnter: "Entrar",
    loginOnlyAuth: "Solo usuarios autorizados pueden acceder",
    loginAgree: "Al iniciar sesión, aceptas nuestros",
    loginTerms: "Términos de Servicio",
    loginAnd: "y",
    loginPrivacy: "Política de Privacidad",
    loginConnError: "Error de conexión",

    // Nav
    navHome: "Inicio",
    navPosts: "Publicaciones",
    navAccounts: "Cuentas Sociales",
    navVideos: "Gestor de Videos",
    navInsights: "Insights",
    navLibrary: "Biblioteca",
    navCovers: "Portadas",
    navStories: "Historias",
    navDescriptions: "Descripciones",
    navDrive: "Drive",
    navStudio: "Estudio",
    navTranscriber: "Transcriptor",
    navTeam: "Equipo",
    navHelp: "Ayuda",
    navLogout: "Cerrar Sesión",
    navSearch: "Buscar o ejecutar...",
    navMenu: "Menú",
    navMore: "Más",
    navCloseMenu: "Cerrar menú",
    navOpenMenu: "Abrir menú",

    // Cuentas
    cuentasTitle: "Cuentas Sociales",
    cuentasSubtitle: "Conecta tus redes sociales para publicar y traer estadísticas a tu Inicio.",
    cuentasHint: "Conecta cada red para publicar y traer estadísticas. Algunas redes (Facebook, Instagram) usan credenciales de servidor: aparecen como conectadas si el administrador configuró las llaves correspondientes.",
    cuentasNoConnected: "Aún no has conectado ninguna red social",
    cuentasNoConnectedDesc: "Comienza por conectar al menos una red abajo. Cada red habilita publicar videos, descripciones e historias en su plataforma.",
    cuentasConnect: "Conectar",
    cuentasDisconnect: "Desconectar",
    cuentasReconnect: "Reconectar ahora",
    cuentasRefresh: "Refrescar estado",
    cuentasNotConnected: "No conectado",
    cuentasNoSession: "Sin sesión activa",
    cuentasNoMethod: "Sin método de conexión disponible.",
    cuentasServerManaged: "Configurar credenciales en los secretos del servidor.",

    // State badges
    badgeActive: "Activo",
    badgeExpiring: "Por expirar",
    badgeExpired: "Expirada",
    badgeRevoked: "Revocada",
    badgeUnknown: "Sin datos",

    // Expiry messages
    expiresOn: "Vence el",
    expiringSoon: (days: number) => `La sesión caduca en ${days} día${days === 1 ? "" : "s"}. Reconecta pronto para evitar fallas.`,
    sessionInvalid: "La sesión ya no es válida. Reconecta tu cuenta para volver a publicar.",

    // Network descriptions
    descFacebook: "Página de Facebook conectada a nivel servidor",
    descInstagram: "Cuenta de Instagram Business vinculada a la Página",
    descLinkedin: "Personal o Página de empresa",
    descX: "Cuenta de X (Twitter)",
    descTiktok: "Modo sandbox: el video llega como borrador",
    descYoutube: "Canal vinculado a tu cuenta de Google",

    // Network server notes
    noteFacebook: "Facebook usa credenciales de System User permanentes configuradas en el servidor.",
    noteInstagram: "Instagram requiere credenciales de Meta a nivel de servidor (INSTAGRAM_ACCESS_TOKEN). Pídele al administrador que las configure en los secretos del proyecto.",

    // TikTok meta
    tiktokSandbox: "Conectado (sandbox)",

    // Instagram meta
    followers: "seguidores",
    posts: "posts",

    // LinkedIn
    linkedinChangeIdentity: "Cambiar identidad de publicación",
    linkedinChooseHow: "Elige cómo publicar en LinkedIn:",
    linkedinPersonal: "Perfil personal",
    linkedinSearching: "Buscando páginas...",
    linkedinEnterPage: "Ingresa la URL o nombre de tu Página de empresa en LinkedIn:",
    linkedinNotFound: "No se encontró esa página. Verifica el nombre exacto en linkedin.com/company/...",
    linkedinSelect: "Seleccionar →",
    linkedinCompanyPage: "Página de empresa",

    // X
    xConnected: "Cuenta de X conectada",

    // Facebook
    fbConnected: "Página de Facebook conectada",

    // LinkedIn connected meta
    linkedinCompanyPageMeta: "Página de empresa",
    linkedinPersonalMeta: "Perfil personal",

    // Lang toggle
    langLabel: "EN",
  },
  en: {
    // Login
    loginSubtitle: "Content management panel",
    loginGoogle: "Sign in with Google",
    loginTestLink: "Sign in with test account",
    loginTestLabel: "Test account",
    loginUser: "Username",
    loginPassword: "Password",
    loginEnter: "Sign in",
    loginOnlyAuth: "Only authorized users can access",
    loginAgree: "By signing in, you agree to our",
    loginTerms: "Terms of Service",
    loginAnd: "and",
    loginPrivacy: "Privacy Policy",
    loginConnError: "Connection error",

    // Nav
    navHome: "Home",
    navPosts: "Posts",
    navAccounts: "Social Accounts",
    navVideos: "Video Manager",
    navInsights: "Insights",
    navLibrary: "Library",
    navCovers: "Covers",
    navStories: "Stories",
    navDescriptions: "Descriptions",
    navDrive: "Drive",
    navStudio: "Studio",
    navTranscriber: "Transcriber",
    navTeam: "Team",
    navHelp: "Help",
    navLogout: "Sign Out",
    navSearch: "Search or run...",
    navMenu: "Menu",
    navMore: "More",
    navCloseMenu: "Close menu",
    navOpenMenu: "Open menu",

    // Cuentas
    cuentasTitle: "Social Accounts",
    cuentasSubtitle: "Connect your social networks to publish and pull stats to your Home.",
    cuentasHint: "Connect each network to publish and pull analytics. Some networks (Facebook, Instagram) use server credentials: they appear connected if the administrator configured the corresponding keys.",
    cuentasNoConnected: "No social networks connected yet",
    cuentasNoConnectedDesc: "Start by connecting at least one network below. Each network enables publishing videos, descriptions and stories on its platform.",
    cuentasConnect: "Connect",
    cuentasDisconnect: "Disconnect",
    cuentasReconnect: "Reconnect now",
    cuentasRefresh: "Refresh status",
    cuentasNotConnected: "Not connected",
    cuentasNoSession: "No active session",
    cuentasNoMethod: "No connection method available.",
    cuentasServerManaged: "Configure credentials in the server secrets.",

    // State badges
    badgeActive: "Active",
    badgeExpiring: "Expiring",
    badgeExpired: "Expired",
    badgeRevoked: "Revoked",
    badgeUnknown: "Unknown",

    // Expiry messages
    expiresOn: "Expires on",
    expiringSoon: (days: number) => `Session expires in ${days} day${days === 1 ? "" : "s"}. Reconnect soon to avoid failures.`,
    sessionInvalid: "Session is no longer valid. Reconnect your account to resume publishing.",

    // Network descriptions
    descFacebook: "Facebook Page connected at server level",
    descInstagram: "Instagram Business account linked to the Page",
    descLinkedin: "Personal profile or Company Page",
    descX: "X (Twitter) account",
    descTiktok: "Sandbox mode: video arrives as a draft",
    descYoutube: "Channel linked to your Google account",

    // Network server notes
    noteFacebook: "Facebook uses permanent System User credentials configured on the server.",
    noteInstagram: "Instagram requires Meta server-level credentials (INSTAGRAM_ACCESS_TOKEN). Ask the administrator to configure them in the project secrets.",

    // TikTok meta
    tiktokSandbox: "Connected (sandbox)",

    // Instagram meta
    followers: "followers",
    posts: "posts",

    // LinkedIn
    linkedinChangeIdentity: "Change publishing identity",
    linkedinChooseHow: "Choose how to publish on LinkedIn:",
    linkedinPersonal: "Personal profile",
    linkedinSearching: "Looking for pages...",
    linkedinEnterPage: "Enter the URL or name of your LinkedIn Company Page:",
    linkedinNotFound: "Page not found. Check the exact name at linkedin.com/company/...",
    linkedinSelect: "Select →",
    linkedinCompanyPage: "Company page",

    // X
    xConnected: "X account connected",

    // Facebook
    fbConnected: "Facebook Page connected",

    // LinkedIn connected meta
    linkedinCompanyPageMeta: "Company page",
    linkedinPersonalMeta: "Personal profile",

    // Lang toggle
    langLabel: "ES",
  },
} as const;

type Translations = typeof T.es;

interface LangCtx {
  lang: Lang;
  t: Translations;
  toggleLang: () => void;
}

const LangContext = createContext<LangCtx>({
  lang: "es",
  t: T.es,
  toggleLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const stored = (() => {
    try { return (localStorage.getItem("lang") as Lang) || "es"; } catch { return "es"; }
  })();
  const [lang, setLang] = useState<Lang>(stored === "en" ? "en" : "es");

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === "es" ? "en" : "es";
      try { localStorage.setItem("lang", next); } catch {}
      return next;
    });
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: T[lang] as typeof T.es, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
