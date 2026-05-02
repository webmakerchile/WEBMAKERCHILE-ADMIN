import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus,
  Trash2,
  Edit3,
  Copy,
  Hash,
  FileText,
  Megaphone,
  Calendar,
  Loader2,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { NETWORK_LABELS, NetworkIcon, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const NETWORKS: Network[] = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"];

const FIELD_KEYS = [
  { key: "description", label: "Descripción base" },
  { key: "tiktokDescription", label: "TikTok" },
  { key: "instagramDescription", label: "Instagram" },
  { key: "youtubeTitle", label: "Título YouTube" },
  { key: "youtubeDescription", label: "Descripción YouTube" },
  { key: "linkedinDescription", label: "LinkedIn" },
  { key: "xDescription", label: "X" },
  { key: "facebookDescription", label: "Facebook" },
] as const;

type TemplateFields = Partial<Record<(typeof FIELD_KEYS)[number]["key"], string>>;

type Template = {
  id: number;
  name: string;
  description: string | null;
  fields: TemplateFields;
  networks: Network[];
  variables: string[];
  createdAt: string;
  updatedAt: string;
};

type HashtagGroup = {
  id: number;
  name: string;
  hashtags: string[];
  networks: Network[];
};

type Campaign = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

export default function BibliotecaPage() {
  const [tab, setTab] = useState<"templates" | "hashtags" | "campaigns">("templates");

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Biblioteca</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Plantillas, grupos de hashtags y campañas reutilizables.
            </p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="bg-card/60 border border-border h-auto p-1">
            <TabsTrigger value="templates" className="gap-2 px-4 py-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <FileText className="w-4 h-4" /> Plantillas
            </TabsTrigger>
            <TabsTrigger value="hashtags" className="gap-2 px-4 py-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Hash className="w-4 h-4" /> Hashtags
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2 px-4 py-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Megaphone className="w-4 h-4" /> Campañas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-6">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="hashtags" className="mt-6">
            <HashtagGroupsTab />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-6">
            <CampaignsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────

function TemplatesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: items = [], isLoading } = useQuery<Template[]>({
    queryKey: ["library", "templates"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/library/templates`);
      return r.ok ? r.json() : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`${API_BASE}/library/templates/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("No se pudo eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library", "templates"] });
      toast({ title: "Plantilla eliminada" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="bg-card/40 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Sin plantillas todavía.</p>
            <p className="text-xs mt-1">Crea una para no escribir el mismo copy desde cero cada vez.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((t) => (
            <Card key={t.id} className="bg-card/60 hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{t.name}</h3>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditing(t)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5"
                      aria-label="Editar"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar la plantilla "${t.name}"?`)) deleteMutation.mutate(t.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.networks.map((n) => (
                    <span key={n} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      <NetworkIcon network={n} className="w-3 h-3" /> {NETWORK_LABELS[n]}
                    </span>
                  ))}
                </div>
                {t.variables.length > 0 ? (
                  <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    Variables:
                    {t.variables.map((v) => (
                      <code key={v} className="px-1 py-0.5 bg-muted rounded text-[10px]">{`{{${v}}}`}</code>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TemplateEditor
          template={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["library", "templates"] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [fields, setFields] = useState<TemplateFields>(template?.fields || {});
  const [networks, setNetworks] = useState<Network[]>(template?.networks || []);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const toggleNetwork = (n: Network) => {
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const handleAiFill = async () => {
    const base = (fields.description || "").trim();
    if (!name.trim() && !base) {
      toast({
        title: "Falta información",
        description: "Ingresa un nombre o una descripción base para que la IA tenga contexto.",
        variant: "destructive",
      });
      return;
    }
    if (networks.length === 0) {
      toast({
        title: "Selecciona al menos una red",
        description: "La IA llena los campos de las redes activas.",
        variant: "destructive",
      });
      return;
    }
    setAiLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/library/templates/ai-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          base,
          networks,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { fields?: Record<string, string> };
      const generated = data.fields || {};
      if (Object.keys(generated).length === 0) {
        toast({ title: "La IA no devolvió texto", variant: "destructive" });
        return;
      }
      setFields((prev) => ({ ...prev, ...generated }));
      toast({
        title: "Plantilla autocompletada",
        description: "Revisa cada red y ajusta lo que quieras antes de guardar.",
      });
    } catch (err) {
      toast({
        title: "No se pudo autocompletar",
        description: String(err).slice(0, 200),
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Ingresa un nombre", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = template
        ? `${API_BASE}/library/templates/${template.id}`
        : `${API_BASE}/library/templates`;
      const method = template ? "PATCH" : "POST";
      const r = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, fields, networks }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: template ? "Plantilla actualizada" : "Plantilla creada" });
      onSaved();
    } catch (err) {
      toast({ title: "No se pudo guardar", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Promo viernes" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descripción interna</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué se usa esta plantilla" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Redes activas</label>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleNetwork(n)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    networks.includes(n)
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <NetworkIcon network={n} className="w-3.5 h-3.5" /> {NETWORK_LABELS[n]}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            Usa <code className="px-1 py-0.5 bg-background rounded">{`{{titulo}}`}</code> y <code className="px-1 py-0.5 bg-background rounded">{`{{enlace}}`}</code> como variables. Se rellenan al aplicar la plantilla.
          </div>

          <div className="space-y-3">
            {FIELD_KEYS.map((f, idx) => (
              <div key={f.key}>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  {idx === 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAiFill}
                      disabled={aiLoading}
                      className="h-7 px-2 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {aiLoading ? "Generando…" : "Autocompletar redes con IA"}
                    </Button>
                  )}
                </div>
                <textarea
                  value={fields[f.key] || ""}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:border-primary outline-none"
                  placeholder={f.key === "youtubeTitle" ? "Hasta 100 caracteres" : "Texto base con variables"}
                />
                {idx === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Escribe aquí la idea base con variables. Luego pulsa "Autocompletar redes con IA" para generar el texto adaptado a cada red.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hashtag groups Tab ───────────────────────────────────────────────────

function HashtagGroupsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<HashtagGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: items = [], isLoading } = useQuery<HashtagGroup[]>({
    queryKey: ["library", "hashtag-groups"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/library/hashtag-groups`);
      return r.ok ? r.json() : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`${API_BASE}/library/hashtag-groups/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("No se pudo eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library", "hashtag-groups"] });
      toast({ title: "Grupo eliminado" });
    },
  });

  const copyHashtags = async (group: HashtagGroup) => {
    const text = group.hashtags.map((h) => `#${h}`).join(" ");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado al portapapeles" });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo grupo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="bg-card/40 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Hash className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Sin grupos de hashtags.</p>
            <p className="text-xs mt-1">Agrupa hashtags por tema y úsalos con un click en cada video.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((g) => (
            <Card key={g.id} className="bg-card/60 hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{g.name}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{g.hashtags.length} hashtags</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyHashtags(g)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5"
                      aria-label="Copiar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditing(g)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5"
                      aria-label="Editar"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar el grupo "${g.name}"?`)) deleteMutation.mutate(g.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.hashtags.slice(0, 12).map((h) => (
                    <span key={h} className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">#{h}</span>
                  ))}
                  {g.hashtags.length > 12 ? (
                    <span className="text-[11px] text-muted-foreground">+{g.hashtags.length - 12}</span>
                  ) : null}
                </div>
                {g.networks.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                    {g.networks.map((n) => (
                      <span key={n} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        <NetworkIcon network={n} className="w-3 h-3" /> {NETWORK_LABELS[n]}
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <HashtagGroupEditor
          group={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["library", "hashtag-groups"] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function HashtagGroupEditor({
  group,
  onClose,
  onSaved,
}: {
  group: HashtagGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(group?.name || "");
  const [raw, setRaw] = useState((group?.hashtags || []).map((h) => `#${h}`).join(" "));
  const [networks, setNetworks] = useState<Network[]>(group?.networks || []);
  const [saving, setSaving] = useState(false);

  const toggleNetwork = (n: Network) => {
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Ingresa un nombre", variant: "destructive" });
      return;
    }
    const hashtags = raw
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^#+/, "").toLowerCase())
      .filter(Boolean);
    setSaving(true);
    try {
      const url = group
        ? `${API_BASE}/library/hashtag-groups/${group.id}`
        : `${API_BASE}/library/hashtag-groups`;
      const method = group ? "PATCH" : "POST";
      const r = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), hashtags, networks }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: group ? "Grupo actualizado" : "Grupo creado" });
      onSaved();
    } catch (err) {
      toast({ title: "No se pudo guardar", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? "Editar grupo de hashtags" : "Nuevo grupo de hashtags"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. WebDev Chile" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Hashtags</label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] focus:border-primary outline-none"
              placeholder="#webdev #chile #tipsdevs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Separa con espacio o coma. Se guardan en minúsculas, sin el #.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Redes (opcional)</label>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleNetwork(n)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    networks.includes(n)
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <NetworkIcon network={n} className="w-3.5 h-3.5" /> {NETWORK_LABELS[n]}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Si dejas vacío, el grupo aparece en todas las redes.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaigns Tab ────────────────────────────────────────────────────────

const CAMPAIGN_COLORS = [
  "#f97316", "#ef4444", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4",
];

function CampaignsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: items = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["library", "campaigns"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/library/campaigns`);
      return r.ok ? r.json() : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`${API_BASE}/library/campaigns/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("No se pudo eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library", "campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast({ title: "Campaña eliminada" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nueva campaña
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="bg-card/40 border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Sin campañas activas.</p>
            <p className="text-xs mt-1">Agrupa videos relacionados (ej. "Lanzamiento Q2") y mira sus métricas juntas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <Link key={c.id} href={`/campanas/${c.id}`}>
              <a className="block group">
                <Card className="bg-card/60 hover:border-primary/40 transition-colors h-full">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                        style={{ backgroundColor: c.color }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{c.name}</h3>
                        {c.description ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.description}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(c); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5"
                          aria-label="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (confirm(`¿Eliminar la campaña "${c.name}"? Los videos quedarán sin campaña.`)) {
                              deleteMutation.mutate(c.id);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {(c.startsAt || c.endsAt) ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <Calendar className="w-3 h-3" />
                        {c.startsAt ? new Date(c.startsAt).toLocaleDateString() : "—"}
                        {" → "}
                        {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : "—"}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <CampaignEditor
          campaign={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["library", "campaigns"] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CampaignEditor({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign?.name || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [color, setColor] = useState(campaign?.color || CAMPAIGN_COLORS[0]);
  const [startsAt, setStartsAt] = useState(
    campaign?.startsAt ? campaign.startsAt.slice(0, 10) : "",
  );
  const [endsAt, setEndsAt] = useState(
    campaign?.endsAt ? campaign.endsAt.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Ingresa un nombre", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = campaign
        ? `${API_BASE}/library/campaigns/${campaign.id}`
        : `${API_BASE}/library/campaigns`;
      const method = campaign ? "PATCH" : "POST";
      const r = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: campaign ? "Campaña actualizada" : "Campaña creada" });
      onSaved();
    } catch (err) {
      toast({ title: "No se pudo guardar", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{campaign ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Lanzamiento Q2" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descripción</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inicio</label>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fin</label>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
