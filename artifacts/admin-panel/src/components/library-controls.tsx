import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type HashtagGroup = {
  id: number;
  name: string;
  hashtags: string[];
  networks: Network[];
};

export type Template = {
  id: number;
  name: string;
  description: string | null;
  fields: Record<string, string | undefined>;
  networks: Network[];
  variables: string[];
};

export type Campaign = {
  id: number;
  name: string;
  color: string;
};

/**
 * Insert-hashtag-group + AI-suggest controls placed beneath a per-network
 * textarea. Appends hashtags to existing text (deduplicating).
 */
export function LibraryControls({
  network,
  videoId,
  title,
  description,
  currentText,
  onAppend,
}: {
  network: Network;
  videoId?: number;
  title?: string;
  description?: string;
  currentText: string;
  onAppend: (newText: string) => void;
}) {
  const { toast } = useToast();
  const [aiBusy, setAiBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: groups = [] } = useQuery<HashtagGroup[]>({
    queryKey: ["library", "hashtag-groups"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/library/hashtag-groups`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const visibleGroups = groups.filter(
    (g) => g.networks.length === 0 || g.networks.includes(network),
  );

  const appendHashtags = (tags: string[]) => {
    if (tags.length === 0) return;
    const existing = new Set(
      (currentText.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).toLowerCase()),
    );
    const fresh = tags.filter((t) => !existing.has(t.toLowerCase())).map((t) => `#${t}`);
    if (fresh.length === 0) {
      toast({ title: "Esos hashtags ya están en el texto" });
      return;
    }
    const sep = currentText.endsWith("\n") || currentText.length === 0 ? "" : "\n\n";
    onAppend(currentText + sep + fresh.join(" "));
  };

  const insertGroup = (group: HashtagGroup) => {
    setOpen(false);
    appendHashtags(group.hashtags);
  };

  const suggestWithAI = async () => {
    if (!title && !description) {
      toast({ title: "Llena el título o descripción primero", variant: "destructive" });
      return;
    }
    setAiBusy(true);
    try {
      const r = await fetch(`${API_BASE}/content/hashtag-suggestions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, network }),
      });
      if (!r.ok) throw new Error("No se pudo generar");
      const data = (await r.json()) as { suggestions: string[] };
      appendHashtags(data.suggestions || []);
      toast({ title: "Hashtags sugeridos agregados" });
    } catch (err) {
      toast({ title: "Error al sugerir hashtags", description: String(err), variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px]">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={visibleGroups.length === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border border-border disabled:opacity-40 transition-colors"
        >
          <Hash className="w-3 h-3" />
          Insertar grupo
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && visibleGroups.length > 0 && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute z-40 left-0 mt-1 min-w-[200px] max-h-72 overflow-y-auto bg-popover border border-border rounded-lg shadow-xl py-1">
              {visibleGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => insertGroup(g)}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-xs"
                >
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground ml-2">· {g.hashtags.length}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={suggestWithAI}
        disabled={aiBusy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-md border border-primary/30 transition-colors disabled:opacity-50"
      >
        {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Sugerir con IA
      </button>
    </div>
  );
}

/**
 * Selector for a saved template + campaign in the wizard "info" step.
 * On template apply, fills variables (`{{var}}`) by interactive prompts and
 * patches the formData.
 */
export function TemplateAndCampaignSelector({
  templateId,
  campaignId,
  onTemplateChange,
  onCampaignChange,
  onApplyTemplate,
}: {
  templateId: number | null;
  campaignId: number | null;
  onTemplateChange: (id: number | null) => void;
  onCampaignChange: (id: number | null) => void;
  onApplyTemplate: (template: Template, values: Record<string, string>) => void;
}) {
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["library", "templates"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/library/templates`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["library", "campaigns"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/library/campaigns`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const applyTemplate = () => {
    if (!selectedTemplate) {
      toast({ title: "Elige una plantilla primero", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const values: Record<string, string> = {};
      for (const v of selectedTemplate.variables) {
        const ans = window.prompt(`Valor para {{${v}}}:`, "");
        if (ans === null) {
          // Cancelled
          setApplying(false);
          return;
        }
        values[v] = ans;
      }
      onApplyTemplate(selectedTemplate, values);
      toast({ title: "Plantilla aplicada" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Plantilla</label>
        <div className="flex items-center gap-2">
          <select
            value={templateId ?? ""}
            onChange={(e) => onTemplateChange(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none cursor-pointer"
          >
            <option value="">— Sin plantilla —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyTemplate}
            disabled={!selectedTemplate || applying}
            className="px-3 py-2 text-xs bg-primary/15 hover:bg-primary/25 text-primary rounded-lg border border-primary/30 disabled:opacity-40 whitespace-nowrap"
          >
            Aplicar
          </button>
        </div>
        {selectedTemplate && selectedTemplate.variables.length > 0 ? (
          <p className="text-[10px] text-muted-foreground">
            Variables: {selectedTemplate.variables.map((v) => `{{${v}}}`).join(", ")}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Campaña</label>
        <select
          value={campaignId ?? ""}
          onChange={(e) => onCampaignChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none cursor-pointer"
        >
          <option value="">— Sin campaña —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Apply variable substitutions to a template field.
 * Replaces `{{var}}` with the matching value (case-sensitive name match).
 */
export function fillTemplateVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (_m, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : `{{${name}}}`,
  );
}
