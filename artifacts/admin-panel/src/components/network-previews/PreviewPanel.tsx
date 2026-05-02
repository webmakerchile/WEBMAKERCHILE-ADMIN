import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Maximize2, X as XIcon } from "lucide-react";
import { NetworkIcon, NETWORK_BG, NETWORK_LABELS, type Network } from "../social-icons";
import { NetworkPreview } from "./NetworkPreview";
import { lintContent, severity, type LintIssue } from "./lints";
import { useSocialProfiles } from "./use-social-profiles";
import { NETWORK_LIMITS } from "./limits";
import type { PreviewVideo } from "./types";

export type PreviewContent = {
  text: string;
  /** Used for YouTube. */
  title?: string;
};

export type PreviewPanelProps = {
  networks: Network[];
  /** Map of content per network. */
  content: Partial<Record<Network, PreviewContent>>;
  video?: PreviewVideo;
  className?: string;
  /** When true, the inner card stays sticky at top inside the column. */
  sticky?: boolean;
  /** Default selected network (otherwise the first in `networks`). */
  defaultNetwork?: Network;
};

const SEVERITY_STYLES: Record<NonNullable<ReturnType<typeof severity>>, string> = {
  error: "bg-rose-500/15 border-rose-500/30 text-rose-300",
  warn: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  info: "bg-sky-500/15 border-sky-500/30 text-sky-300",
};

function IssueIcon({ level }: { level: LintIssue["level"] }) {
  if (level === "error") return <AlertTriangle className="w-3.5 h-3.5" />;
  if (level === "warn") return <AlertTriangle className="w-3.5 h-3.5" />;
  return <Info className="w-3.5 h-3.5" />;
}

export function PreviewPanel({
  networks,
  content,
  video,
  className = "",
  sticky = true,
  defaultNetwork,
}: PreviewPanelProps) {
  const [active, setActive] = useState<Network>(defaultNetwork ?? networks[0]);
  const [fullscreen, setFullscreen] = useState(false);
  const { data: profiles } = useSocialProfiles();

  // If the parent's `networks` prop changes (e.g. a different wizard step),
  // make sure the active tab is always one of the available networks.
  useEffect(() => {
    if (!networks.includes(active)) setActive(defaultNetwork ?? networks[0]);
  }, [networks, active, defaultNetwork]);

  const activeContent = content[active] || { text: "" };
  const activeProfile = profiles?.[active];

  const issues = useMemo(
    () => lintContent({ network: active, text: activeContent.text || "", title: activeContent.title }),
    [active, activeContent.text, activeContent.title],
  );
  const sev = severity(issues);

  // Status counter per tab.
  const tabSeverities: Partial<Record<Network, ReturnType<typeof severity>>> = useMemo(() => {
    const out: Partial<Record<Network, ReturnType<typeof severity>>> = {};
    for (const n of networks) {
      const c = content[n] || { text: "" };
      out[n] = severity(lintContent({ network: n, text: c.text || "", title: c.title }));
    }
    return out;
  }, [networks, content]);

  const limits = NETWORK_LIMITS[active];
  const len = (activeContent.text || "").length;

  const card = (
    <div className="bg-card/70 border border-foreground/10 rounded-2xl shadow-sm flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-foreground/5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Vista previa en vivo
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          aria-label="Pantalla completa"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Pantalla completa
        </button>
      </div>

      <div className="px-2 pt-2 flex flex-wrap gap-1.5">
        {networks.map((n) => {
          const isActive = n === active;
          const s = tabSeverities[n];
          return (
            <button
              key={n}
              type="button"
              onClick={() => setActive(n)}
              className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${
                isActive
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-transparent bg-foreground/5 text-muted-foreground hover:bg-foreground/10"
              }`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center ${NETWORK_BG[n]}`}>
                <NetworkIcon network={n} className="w-2.5 h-2.5" />
              </span>
              <span>{NETWORK_LABELS[n]}</span>
              {s ? (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s === "error" ? "bg-rose-400" : s === "warn" ? "bg-amber-400" : "bg-sky-400"
                  }`}
                  aria-label={`estado: ${s}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="p-3 max-h-[calc(100vh-12rem)] overflow-y-auto">
        <NetworkPreview
          network={active}
          text={activeContent.text || ""}
          title={activeContent.title}
          profile={activeProfile}
          video={video}
        />

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {len}
              {limits.max ? ` / ${limits.max}` : ""} caracteres
              {limits.truncateAt > 0 && len > limits.truncateAt
                ? ` · se trunca a los ~${limits.truncateAt}`
                : ""}
            </span>
            {sev === null ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sin avisos
              </span>
            ) : null}
          </div>

          {issues.length > 0 ? (
            <ul className="space-y-1.5">
              {issues.map((iss, i) => (
                <li
                  key={i}
                  className={`text-[12px] rounded-md border px-2 py-1.5 flex items-start gap-1.5 ${
                    SEVERITY_STYLES[iss.level]
                  }`}
                >
                  <IssueIcon level={iss.level} />
                  <span className="leading-snug">{iss.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {activeProfile && !activeProfile.connected ? (
            <div className="text-[11px] text-muted-foreground italic">
              Cuenta no conectada · se muestra perfil genérico.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      {sticky ? <div className="sticky top-4">{card}</div> : card}

      {fullscreen ? (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Vista previa · {NETWORK_LABELS[active]}</h2>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="p-2 rounded-lg hover:bg-foreground/10"
                aria-label="Cerrar"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {networks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setActive(n)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${
                    n === active
                      ? "border-primary/50 bg-primary/10"
                      : "border-foreground/10 hover:bg-foreground/5"
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center ${NETWORK_BG[n]}`}>
                    <NetworkIcon network={n} className="w-2.5 h-2.5" />
                  </span>
                  {NETWORK_LABELS[n]}
                </button>
              ))}
            </div>
            <NetworkPreview
              network={active}
              text={activeContent.text || ""}
              title={activeContent.title}
              profile={activeProfile}
              video={video}
            />
            {issues.length > 0 ? (
              <ul className="mt-4 space-y-1.5 max-w-md mx-auto">
                {issues.map((iss, i) => (
                  <li
                    key={i}
                    className={`text-sm rounded-md border px-3 py-2 flex items-start gap-2 ${
                      SEVERITY_STYLES[iss.level]
                    }`}
                  >
                    <IssueIcon level={iss.level} />
                    <span>{iss.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
