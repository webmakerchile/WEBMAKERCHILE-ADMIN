import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Database,
  Server,
  Users,
  UserCheck,
  UserX,
  Clock,
  ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { NETWORK_BG, NETWORK_LABELS, NetworkIcon, type Network } from "@/components/social-icons";
import { useLang } from "@/lib/lang";
import { useAuth } from "@/App";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type CredentialStatus = {
  key: string;
  hasValue: boolean;
  isFromDb: boolean;
  source: "db" | "env" | "none";
  updatedAt: string | null;
  updatedBy: string | null;
  label: string;
  network: string;
  secret: boolean;
};

type NetworkGroup = {
  network: Network;
  credentials: CredentialStatus[];
};

const NETWORK_ORDER: Network[] = ["tiktok", "instagram", "facebook", "linkedin", "x"];

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function SourceBadge({ source }: { source: "db" | "env" | "none" }) {
  if (source === "db") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        <Database className="w-2.5 h-2.5" />
        DB
      </span>
    );
  }
  if (source === "env") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
        <Server className="w-2.5 h-2.5" />
        Entorno
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-foreground/10 text-muted-foreground border border-foreground/10">
      <AlertCircle className="w-2.5 h-2.5" />
      No configurado
    </span>
  );
}

function CredentialRow({
  cred,
  onSave,
  onDelete,
}: {
  cred: CredentialStatus;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(cred.key, value.trim());
      setEditing(false);
      setValue("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la credencial "${cred.label}" de la base de datos?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(cred.key);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border border-foreground/10 rounded-xl p-4 bg-card/40">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-foreground/5 border border-foreground/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          {cred.secret ? (
            <Lock className="w-4 h-4 text-amber-400" />
          ) : (
            <KeyRound className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold">{cred.label}</span>
            {cred.secret && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                Secreto
              </span>
            )}
            <SourceBadge source={cred.source} />
          </div>

          <p className="text-[11px] text-muted-foreground font-mono mb-2">{cred.key}</p>

          {cred.hasValue && !editing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Valor configurado</span>
              {cred.isFromDb && cred.updatedAt && (
                <span className="text-foreground/30">·</span>
              )}
              {cred.isFromDb && cred.updatedAt && (
                <span>
                  Actualizado {new Date(cred.updatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
                  {cred.updatedBy ? ` por ${cred.updatedBy}` : ""}
                </span>
              )}
            </div>
          )}

          {editing && (
            <div className="mt-2 space-y-2">
              <div className="relative">
                <input
                  type={showValue ? "text" : "password"}
                  placeholder={`Ingresa el nuevo ${cred.label}…`}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setEditing(false); setValue(""); } }}
                  autoFocus
                  className="w-full bg-background border border-foreground/20 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !value.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Guardar
                </button>
                <button
                  onClick={() => { setEditing(false); setValue(""); setError(null); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-xs font-medium hover:bg-foreground/5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              title="Editar credencial"
              onClick={() => { setEditing(true); setError(null); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {cred.isFromDb && (
              <button
                title="Eliminar credencial de la base de datos"
                onClick={handleDelete}
                disabled={deleting}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NetworkCard({ group, onSave, onDelete }: { group: NetworkGroup; onSave: (key: string, value: string) => Promise<void>; onDelete: (key: string) => Promise<void> }) {
  const configured = group.credentials.filter((c) => c.hasValue).length;
  const total = group.credentials.length;
  const allOk = configured === total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-foreground/10 rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${NETWORK_BG[group.network]}`}>
          <NetworkIcon network={group.network} className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{NETWORK_LABELS[group.network]}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              allOk
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : configured > 0
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-foreground/10 text-muted-foreground border border-foreground/10"
            }`}>
              {configured}/{total} credenciales
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {group.credentials.map((cred) => (
          <CredentialRow key={cred.key} cred={cred} onSave={onSave} onDelete={onDelete} />
        ))}
      </div>
    </motion.div>
  );
}

type ManagedUser = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
  teamRole: string;
  approvalStatus: string;
  createdAt: string;
  lastLoginAt: string;
};

const TEAM_ROLES = ["ceo", "editora", "programador", "publicista", "rrhh"] as const;
type TeamRole = typeof TEAM_ROLES[number];

const TEAM_ROLE_CONFIG: Record<TeamRole, { label: string; color: string }> = {
  ceo: { label: "CEO", color: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
  editora: { label: "Editora", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  programador: { label: "Programador", color: "bg-green-500/15 text-green-400 border-green-500/25" },
  publicista: { label: "Publicista", color: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
  rrhh: { label: "RRHH", color: "bg-rose-500/15 text-rose-400 border-rose-500/25" },
};

function TeamRoleBadge({ teamRole }: { teamRole: string }) {
  const cfg = TEAM_ROLE_CONFIG[teamRole as TeamRole];
  if (!cfg) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-foreground/10 text-muted-foreground border border-foreground/15">
      {teamRole}
    </span>
  );
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function TeamRoleSelector({
  userId,
  currentRole,
  onChanged,
}: {
  userId: number;
  currentRole: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (role: TeamRole) => {
    if (role === currentRole) { setOpen(false); return; }
    setSaving(true);
    try {
      await apiFetch(`/admin/users/${userId}/team-role`, {
        method: "PATCH",
        body: JSON.stringify({ teamRole: role }),
      });
      onChanged();
    } catch {
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-dashed border-foreground/25 hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ChevronDown className="w-2.5 h-2.5" />}
        Rol
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-foreground/15 rounded-xl shadow-xl py-1 min-w-[130px]">
          {TEAM_ROLES.map((r) => {
            const cfg = TEAM_ROLE_CONFIG[r];
            return (
              <button
                key={r}
                onClick={() => handleSelect(r)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-foreground/5 transition-colors ${r === currentRole ? "font-semibold" : ""}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full border ${cfg.color}`} />
                {cfg.label}
                {r === currentRole && <CheckCircle2 className="w-3 h-3 ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsersPanel({
  showToast,
  isSuperAdmin,
  isCeo,
}: {
  showToast: (msg: string, type: "ok" | "err") => void;
  isSuperAdmin: boolean;
  isCeo: boolean;
}) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setApproval = async (id: number, status: string) => {
    try {
      await apiFetch(`/admin/users/${id}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const labels: Record<string, string> = { approved: "aprobado", rejected: "rechazado", pending: "pendiente" };
      showToast(`Usuario ${labels[status] || status}`, "ok");
      await load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`¿Eliminar permanentemente a ${email}?`)) return;
    try {
      await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
      showToast("Usuario eliminado", "ok");
      await load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        <UserCheck className="w-2.5 h-2.5" /> Aprobado
      </span>
    );
    if (status === "rejected") return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25">
        <UserX className="w-2.5 h-2.5" /> Rechazado
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
        <Clock className="w-2.5 h-2.5" /> Pendiente
      </span>
    );
  };

  const pending = (users ?? []).filter((u) => u.approvalStatus === "pending");
  const rest = (users ?? []).filter((u) => u.approvalStatus !== "pending");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 border border-foreground/10 rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-foreground/10">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Users className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Gestión de usuarios</p>
          <p className="text-xs text-muted-foreground">
            {isSuperAdmin ? "Aprueba, rechaza y asigna roles al equipo" : "Asigna roles al equipo"}
          </p>
        </div>
        {!loading && pending.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-black">
            {pending.length} pendiente{pending.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando usuarios…</span>
        </div>
      )}

      {!loading && (users ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aún no hay otros usuarios registrados.
        </p>
      )}

      {!loading && (users ?? []).length > 0 && (
        <div className="divide-y divide-foreground/8">
          {[...pending, ...rest].map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3">
              {u.picture ? (
                <img src={u.picture} alt="" className="w-9 h-9 rounded-full flex-shrink-0 object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-muted-foreground">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                  {statusBadge(u.approvalStatus)}
                  <TeamRoleBadge teamRole={u.teamRole} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(isCeo || isSuperAdmin) && (
                  <TeamRoleSelector
                    userId={u.id}
                    currentRole={u.teamRole}
                    onChanged={load}
                  />
                )}
                {isSuperAdmin && u.approvalStatus !== "approved" && (
                  <button
                    onClick={() => setApproval(u.id, "approved")}
                    title="Aprobar acceso"
                    className="w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {isSuperAdmin && u.approvalStatus !== "rejected" && (
                  <button
                    onClick={() => setApproval(u.id, "rejected")}
                    title="Rechazar acceso"
                    className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => deleteUser(u.id, u.email)}
                    title="Eliminar usuario"
                    className="w-7 h-7 rounded-lg bg-foreground/5 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 flex items-center justify-center transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function AjustesPage() {
  const { t } = useLang();
  const auth = useAuth();
  const isSuperAdmin = auth?.role === "superadmin";
  const isCeo = auth?.teamRole === "ceo";
  const [credentials, setCredentials] = useState<CredentialStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch("/credentials");
      setCredentials(data);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleSave = async (key: string, value: string) => {
    await apiFetch(`/credentials/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    showToast("Credencial guardada y encriptada correctamente", "ok");
    await loadCredentials();
  };

  const handleDelete = async (key: string) => {
    await apiFetch(`/credentials/${key}`, { method: "DELETE" });
    showToast("Credencial eliminada de la base de datos", "ok");
    await loadCredentials();
  };

  const groups: NetworkGroup[] = NETWORK_ORDER.map((network) => ({
    network,
    credentials: (credentials ?? []).filter((c) => c.network === network),
  })).filter((g) => g.credentials.length > 0);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">{t.ajustesTitle}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t.ajustesSubtitle}</p>
        </div>

        {(isSuperAdmin || isCeo) && (
          <UsersPanel showToast={showToast} isSuperAdmin={isSuperAdmin} isCeo={isCeo} />
        )}

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-300">{t.ajustesSecurity}</p>
            <p className="text-xs text-muted-foreground">{t.ajustesSecurityDesc}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">DB</span> = guardado en base de datos encriptado
              </span>
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3 text-blue-400" />
                <span className="text-blue-400 font-medium">Entorno</span> = variable de entorno del servidor
              </span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando credenciales…</span>
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <div className="space-y-5">
            {groups.map((group) => (
              <NetworkCard
                key={group.network}
                group={group}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border ${
          toast.type === "ok"
            ? "bg-emerald-950 text-emerald-300 border-emerald-700"
            : "bg-rose-950 text-rose-300 border-rose-700"
        }`}>
          {toast.type === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </Layout>
  );
}
