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

    // ── Videos page ──────────────────────────────────────────────
    stepInfo: "Información Básica",
    stepInfoShort: "Info",
    stepCover: "Portada",
    stepCoverShort: "Portada",
    stepTikTokInstagram: "TikTok e Instagram",
    stepTikTokShort: "TikTok/IG",
    stepYouTube: "YouTube",
    stepYouTubeShort: "YouTube",
    stepLinkedInX: "LinkedIn y X",
    stepLinkedInXShort: "LinkedIn/X",
    stepReview: "Revisar y Programar",
    stepReviewShort: "Programar",
    stepComments: "Comentarios y Aprobación",
    stepCommentsShort: "Comentarios",

    searchPlaceholder: "Buscar por título, descripción o red...",
    filterAllStatuses: "Todos los estados",
    filterDraft: "Borrador",
    filterCoverReady: "Portada lista",
    filterScheduled: "Programado",
    filterPublished: "Publicado",
    filterPartial: "Parcial",
    filterError: "Con error",
    filterAllNetworks: "Todas las redes",
    filterAllMonths: "Todos los meses",
    filterAllCampaigns: "Todas las campañas",
    filterNoCampaign: "Sin campaña",
    filterAllTemplates: "Todas las plantillas",
    filterNoTemplate: "Sin plantilla",
    filterClear: "Limpiar",
    filterClearFilters: "Limpiar filtros",
    noVideos: "Sin videos registrados",
    noVideosDesc: "Crea tu primer video. Te guiaremos paso a paso: información, portada, descripciones por red y revisión final.",
    createFirstVideo: "Crear primer video",
    noResults: "Ningún video coincide con tus filtros.",
    showingOf: (showing: number, total: number) => `Mostrando ${showing} de ${total}`,
    videosSelected: (n: number) => `${n} seleccionado${n === 1 ? "" : "s"}`,
    videosCount: (n: number) => `${n} video${n === 1 ? "" : "s"}`,

    statusPublished: "Publicado",
    statusPartial: "Parcial",
    statusError: "Error",
    statusScheduled: "Programado",
    statusReady: "Listo",
    statusDraft: "Borrador",
    statusComplete: (pct: number) => `${pct}% completo`,

    wizardNewVideo: "Nuevo Video",
    wizardCompleteAll: "Completa todos los pasos para programar en las 6 plataformas",
    wizardAutoGenerating: "Generando contenido con IA para todas las plataformas...",
    wizardSaving: "Guardando",
    wizardUnsaved: "Sin guardar",
    wizardSavingTooltip: "Guardando...",
    wizardUnsavedTooltip: "Hay cambios sin guardar",
    wizardBack: "Volver al listado",
    wizardBackShort: "Volver",
    wizardDelete: "Eliminar",

    btnSave: "Guardar",
    btnCancel: "Cancelar",
    btnContinue: "Continuar",
    btnContinueWithoutCover: "Continuar sin portada",
    btnCreateContinue: "Crear y Continuar",
    btnSaveContinue: "Guardar y Continuar",
    btnPrev: "Anterior",
    btnGenerate: "Generar con IA",
    btnGenerating: "Generando...",
    btnRegenerate: "Regenerar con IA",
    btnUpload: "Subir portada",
    btnUploading: "Subiendo...",
    btnReplace: "Reemplazar",
    btnRemove: "Quitar",
    btnCopyAll: "Copiar todo",
    btnDownloadTxt: "Descargar .txt",
    btnExportPdf: "Exportar .pdf",
    btnExportingPdf: "Exportando...",
    btnGenerateAI: "✨ Generar con IA",
    btnSchedule: "Programar",
    btnCopy: "Copiar",
    btnChange: "Cambiar",
    btnViewHelp: "Ver ayuda",

    coverTitle: "Portada del Video",
    coverOptional: "(opcional)",
    coverSubtitle: "Sube tu propia portada o genérala con IA. Si no quieres definirla ahora, puedes continuar y volver más tarde.",
    coverReady: "Portada lista",
    coverHowItLooks: "Cómo se verá en cada red",
    coverPromptLabel: "Prompt personalizado para la IA",
    coverPromptActive: "Activo",
    coverPromptDesc: "Escribe instrucciones específicas (estilo, colores, texto en pantalla, escena). Se sobrescribe sobre el prompt por defecto. Déjalo vacío para volver al estilo automático.",
    coverGenerateWithPrompt: "Generar con este prompt",
    coverFileHint: "PNG, JPG o WEBP · La portada es opcional, puedes continuar sin ella.",

    stepInfoTitle: "Información Básica",
    fromGoogleDrive: "Desde Google Drive",
    fromGoogleDriveHint: "Selecciona un video de tu Drive",
    uploadOrDrag: "Subir o arrastrar archivo",
    uploadOrDragHint: (mb: number) => `MP4, MOV · Máx ${mb} MB`,
    linkingFromDrive: "Vinculando desde Drive...",
    uploadingToDrive: "Subiendo a Google Drive...",
    uploadCancel: "Cancelar",
    preparing: "Preparando...",

    stepTikTokTitle: "TikTok e Instagram",
    stepTikTokSubtitle: "Escribe las descripciones para TikTok e Instagram. Incluye hashtags y emojis.",
    genTikTokPlaceholder: "descripción de TikTok",
    genInstagramPlaceholder: "descripción de Instagram",
    tiktokCharHint: (n: number) => `Máximo 2200 caracteres · ${n}/2200`,
    instagramCharHint: (n: number) => `Máximo 2200 caracteres · ${n}/2200`,

    stepYouTubeTitle: "YouTube",
    stepYouTubeSubtitle: "Título y descripción para YouTube Shorts. El título es diferente al de TikTok/Instagram.",
    ytTitleLabel: "Título para YouTube",
    ytDescLabel: "Descripción para YouTube",
    genYTTitlePlaceholder: "título de YouTube",
    genYTDescPlaceholder: "descripción de YouTube",
    ytTitlePlaceholder: "Título optimizado para YouTube (máx. 100 caracteres)",
    ytTitleHint: (n: number) => `${n}/100 caracteres`,
    ytDescHint: (n: number) => `${n}/5000 caracteres`,

    stepLinkedInXTitle: "LinkedIn, X y Facebook",
    stepLinkedInXSubtitle: "Textos para LinkedIn (máx. 3000), X (máx. 280) y Facebook (máx. 500). Facebook es opcional.",
    fbDescOptional: "(opcional)",
    genLinkedInPlaceholder: "descripción de LinkedIn",
    genXPlaceholder: "tweet para X",
    linkedinCharHint: (n: number) => `Máximo 3000 caracteres · ${n}/3000`,
    xCharHint: (n: number) => `Máximo 280 caracteres · ${n}/280`,
    fbCharHint: (n: number) => `Máximo 500 caracteres · ${n}/500`,

    reviewTitle: "Revisar y Programar",
    reviewSubtitle: "Revisa todo antes de programar en las 6 plataformas",
    reviewReady: "Listo",
    reviewPending: "Pendiente",
    reviewScheduled: "Programado",
    reviewIncomplete: "Faltan datos por completar",
    reviewIncompleteDesc: "Completa todos los pasos anteriores antes de programar",
    reviewPartiallyPublished: "Publicado parcialmente",
    reviewPublishErrors: "Hubo errores al publicar",
    reviewScheduledSuccess: "Programado en las plataformas configuradas",
    reviewScheduledTime: "Hora programada:",
    reviewImmediateUpload: "Subida Inmediata",
    reviewImmediateSubtitle: "· Se sube ahora, no en la hora programada",
    reviewImmediateSubtitleIG: "· Se sube ahora como Reel público",
    reviewUploadYTNow: "Subir a YouTube ahora",
    reviewUploadTTNow: "Subir a TikTok ahora",
    reviewUploadIGNow: "Subir a Instagram ahora",
    reviewUploadPrivateYT: (name: string) => `Subir "${name}" como Short privado`,
    reviewUploadPrivateTT: (name: string) => `Subir "${name}" como privado`,
    reviewUploadReel: (name: string) => `Subir "${name}" como Reel`,
    reviewSelectFromDrive: "Selecciona un video desde Drive",
    reviewUploadFromDrive: "Subir desde Drive",
    reviewFromDrive: "Desde Drive",
    reviewUploading: "Subiendo...",
    reviewUploadedToYT: "Subido a YouTube",
    reviewUploadedToTT: "Subido a TikTok",
    reviewUploadedToIG: "Subido a Instagram",
    reviewSentToTT: "Enviado",
    reviewPublishedIG: "Publicado",
    reviewThumbnailApplied: "✓ Portada aplicada como miniatura",
    reviewThumbnailError: (e: string) => `⚠ Portada no aplicada: ${e}`,
    reviewViewOnYT: "Ver en YouTube",
    reviewTTSuccessTitle: "Subida exitosa a TikTok",
    reviewIGSuccessTitle: "Subida exitosa a Instagram",
    reviewIncludeFacebook: "Incluir Facebook",

    saveViewPlaceholder: "Nombre de la vista",

    // ── Studio page ──────────────────────────────────────────────
    studioListening: "Escuchando",
    studioEndOfScript: "FIN DEL GUION",
    studioMarkedRecorded: "Listo, grabado",
    studioSlow: "Lento",
    studioFast: "Rapido",
    studioSpeakFollow: "Habla y el guion te sigue",
    studioActivatingMic: "Activando microfono...",
    studioCameraError: "Error al iniciar la camara",
    studioCameraPermission: "Verifica los permisos de camara en la configuracion de tu navegador o app",
    studioCameraRetry: "Reintentar",
    studioCameraBack: "Volver",
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

    // ── Videos page ──────────────────────────────────────────────
    stepInfo: "Basic Info",
    stepInfoShort: "Info",
    stepCover: "Cover",
    stepCoverShort: "Cover",
    stepTikTokInstagram: "TikTok & Instagram",
    stepTikTokShort: "TikTok/IG",
    stepYouTube: "YouTube",
    stepYouTubeShort: "YouTube",
    stepLinkedInX: "LinkedIn & X",
    stepLinkedInXShort: "LinkedIn/X",
    stepReview: "Review & Schedule",
    stepReviewShort: "Schedule",
    stepComments: "Comments & Approval",
    stepCommentsShort: "Comments",

    searchPlaceholder: "Search by title, description or network...",
    filterAllStatuses: "All statuses",
    filterDraft: "Draft",
    filterCoverReady: "Cover ready",
    filterScheduled: "Scheduled",
    filterPublished: "Published",
    filterPartial: "Partial",
    filterError: "Error",
    filterAllNetworks: "All networks",
    filterAllMonths: "All months",
    filterAllCampaigns: "All campaigns",
    filterNoCampaign: "No campaign",
    filterAllTemplates: "All templates",
    filterNoTemplate: "No template",
    filterClear: "Clear",
    filterClearFilters: "Clear filters",
    noVideos: "No videos yet",
    noVideosDesc: "Create your first video. We'll guide you step by step: info, cover, per-network descriptions, and final review.",
    createFirstVideo: "Create first video",
    noResults: "No videos match your filters.",
    showingOf: (showing: number, total: number) => `Showing ${showing} of ${total}`,
    videosSelected: (n: number) => `${n} selected`,
    videosCount: (n: number) => `${n} video${n === 1 ? "" : "s"}`,

    statusPublished: "Published",
    statusPartial: "Partial",
    statusError: "Error",
    statusScheduled: "Scheduled",
    statusReady: "Ready",
    statusDraft: "Draft",
    statusComplete: (pct: number) => `${pct}% complete`,

    wizardNewVideo: "New Video",
    wizardCompleteAll: "Complete all steps to schedule across all 6 platforms",
    wizardAutoGenerating: "Generating AI content for all platforms...",
    wizardSaving: "Saving",
    wizardUnsaved: "Unsaved",
    wizardSavingTooltip: "Saving...",
    wizardUnsavedTooltip: "There are unsaved changes",
    wizardBack: "Back to list",
    wizardBackShort: "Back",
    wizardDelete: "Delete",

    btnSave: "Save",
    btnCancel: "Cancel",
    btnContinue: "Continue",
    btnContinueWithoutCover: "Continue without cover",
    btnCreateContinue: "Create & Continue",
    btnSaveContinue: "Save & Continue",
    btnPrev: "Previous",
    btnGenerate: "Generate with AI",
    btnGenerating: "Generating...",
    btnRegenerate: "Regenerate with AI",
    btnUpload: "Upload cover",
    btnUploading: "Uploading...",
    btnReplace: "Replace",
    btnRemove: "Remove",
    btnCopyAll: "Copy all",
    btnDownloadTxt: "Download .txt",
    btnExportPdf: "Export .pdf",
    btnExportingPdf: "Exporting...",
    btnGenerateAI: "✨ Generate with AI",
    btnSchedule: "Schedule",
    btnCopy: "Copy",
    btnChange: "Change",
    btnViewHelp: "View help",

    coverTitle: "Video Cover",
    coverOptional: "(optional)",
    coverSubtitle: "Upload your own cover or generate one with AI. You can skip this and come back later.",
    coverReady: "Cover ready",
    coverHowItLooks: "How it will look on each network",
    coverPromptLabel: "Custom AI prompt",
    coverPromptActive: "Active",
    coverPromptDesc: "Write specific instructions (style, colors, on-screen text, scene). Overrides the default prompt. Leave empty to revert to automatic style.",
    coverGenerateWithPrompt: "Generate with this prompt",
    coverFileHint: "PNG, JPG or WEBP · Cover is optional, you can continue without it.",

    stepInfoTitle: "Basic Info",
    fromGoogleDrive: "From Google Drive",
    fromGoogleDriveHint: "Select a video from your Drive",
    uploadOrDrag: "Upload or drag file",
    uploadOrDragHint: (mb: number) => `MP4, MOV · Max ${mb} MB`,
    linkingFromDrive: "Linking from Drive...",
    uploadingToDrive: "Uploading to Google Drive...",
    uploadCancel: "Cancel",
    preparing: "Preparing...",

    stepTikTokTitle: "TikTok & Instagram",
    stepTikTokSubtitle: "Write descriptions for TikTok and Instagram. Include hashtags and emojis.",
    genTikTokPlaceholder: "TikTok description",
    genInstagramPlaceholder: "Instagram description",
    tiktokCharHint: (n: number) => `Maximum 2200 characters · ${n}/2200`,
    instagramCharHint: (n: number) => `Maximum 2200 characters · ${n}/2200`,

    stepYouTubeTitle: "YouTube",
    stepYouTubeSubtitle: "Title and description for YouTube Shorts. The title is different from TikTok/Instagram.",
    ytTitleLabel: "YouTube Title",
    ytDescLabel: "YouTube Description",
    genYTTitlePlaceholder: "YouTube title",
    genYTDescPlaceholder: "YouTube description",
    ytTitlePlaceholder: "Optimized title for YouTube (max 100 characters)",
    ytTitleHint: (n: number) => `${n}/100 characters`,
    ytDescHint: (n: number) => `${n}/5000 characters`,

    stepLinkedInXTitle: "LinkedIn, X & Facebook",
    stepLinkedInXSubtitle: "Text for LinkedIn (max 3000), X (max 280) and Facebook (max 500). Facebook is optional.",
    fbDescOptional: "(optional)",
    genLinkedInPlaceholder: "LinkedIn description",
    genXPlaceholder: "X tweet",
    linkedinCharHint: (n: number) => `Maximum 3000 characters · ${n}/3000`,
    xCharHint: (n: number) => `Maximum 280 characters · ${n}/280`,
    fbCharHint: (n: number) => `Maximum 500 characters · ${n}/500`,

    reviewTitle: "Review & Schedule",
    reviewSubtitle: "Review everything before scheduling across all 6 platforms",
    reviewReady: "Ready",
    reviewPending: "Pending",
    reviewScheduled: "Scheduled",
    reviewIncomplete: "Missing information",
    reviewIncompleteDesc: "Complete all previous steps before scheduling",
    reviewPartiallyPublished: "Partially published",
    reviewPublishErrors: "There were publishing errors",
    reviewScheduledSuccess: "Scheduled on configured platforms",
    reviewScheduledTime: "Scheduled time:",
    reviewImmediateUpload: "Immediate Upload",
    reviewImmediateSubtitle: "· Uploads now, not at the scheduled time",
    reviewImmediateSubtitleIG: "· Uploads now as a public Reel",
    reviewUploadYTNow: "Upload to YouTube now",
    reviewUploadTTNow: "Upload to TikTok now",
    reviewUploadIGNow: "Upload to Instagram now",
    reviewUploadPrivateYT: (name: string) => `Upload "${name}" as private Short`,
    reviewUploadPrivateTT: (name: string) => `Upload "${name}" as private`,
    reviewUploadReel: (name: string) => `Upload "${name}" as Reel`,
    reviewSelectFromDrive: "Select a video from Drive",
    reviewUploadFromDrive: "Upload from Drive",
    reviewFromDrive: "From Drive",
    reviewUploading: "Uploading...",
    reviewUploadedToYT: "Uploaded to YouTube",
    reviewUploadedToTT: "Uploaded to TikTok",
    reviewUploadedToIG: "Uploaded to Instagram",
    reviewSentToTT: "Sent",
    reviewPublishedIG: "Published",
    reviewThumbnailApplied: "✓ Cover applied as thumbnail",
    reviewThumbnailError: (e: string) => `⚠ Cover not applied: ${e}`,
    reviewViewOnYT: "View on YouTube",
    reviewTTSuccessTitle: "Successfully uploaded to TikTok",
    reviewIGSuccessTitle: "Successfully uploaded to Instagram",
    reviewIncludeFacebook: "Include Facebook",

    saveViewPlaceholder: "View name",

    // ── Studio page ──────────────────────────────────────────────
    studioListening: "Listening",
    studioEndOfScript: "END OF SCRIPT",
    studioMarkedRecorded: "Done, recorded",
    studioSlow: "Slow",
    studioFast: "Fast",
    studioSpeakFollow: "Speak and the script follows you",
    studioActivatingMic: "Activating microphone...",
    studioCameraError: "Failed to start camera",
    studioCameraPermission: "Check camera permissions in your browser or app settings",
    studioCameraRetry: "Retry",
    studioCameraBack: "Back",
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
