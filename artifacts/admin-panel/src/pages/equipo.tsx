import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users2, Loader2, ChevronDown } from "lucide-react";
import { AREAS, AREA_LABELS, AREA_BADGE, type Area } from "@workspace/areas";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type AdminUser = {
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

function AreaBadge({ area }: { area: string }) {
  const a = (AREAS.includes(area as Area) ? area : "ceo") as Area;
  const { bg, text } = AREA_BADGE[a];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {AREA_LABELS[a]}
    </span>
  );
}

function AreaSelector({
  userId,
  currentArea,
  disabled,
  onChange,
}: {
  userId: number;
  currentArea: string;
  disabled: boolean;
  onChange: (area: Area) => void;
}) {
  const [open, setOpen] = useState(false);
  const a = (AREAS.includes(currentArea as Area) ? currentArea : "ceo") as Area;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-foreground/15 bg-card hover:bg-foreground/5 transition-base text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span style={{ color: AREA_BADGE[a].text }}>{AREA_LABELS[a]}</span>
        {disabled ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-36 bg-card border border-foreground/15 rounded-xl shadow-xl z-20 overflow-hidden">
            {AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (area !== a) onChange(area);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-foreground/5 transition-base"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: AREA_BADGE[area].text }}
                />
                <span className={area === a ? "font-semibold" : ""}>{AREA_LABELS[area]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EquipoPage() {
  const me = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const isCeo = me?.role === "superadmin" || me?.teamRole === "ceo";

  const { data: members = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/admin/users`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isCeo,
  });

  const updateArea = useMutation({
    mutationFn: async ({ id, teamRole }: { id: number; teamRole: Area }) => {
      const r = await fetch(`${API_BASE}/admin/users/${id}/team-role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamRole }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any)?.error || "Error al actualizar área");
      }
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: `Área actualizada → ${AREA_LABELS[vars.teamRole]}` });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
    onSettled: () => setBusyId(null),
  });

  const approved = members.filter((m) => m.approvalStatus === "approved");
  const pending = members.filter((m) => m.approvalStatus === "pending");

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Equipo</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Gestiona las áreas de acceso de cada integrante del equipo.
          </p>
        </header>

        {/* Area legend */}
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: AREA_BADGE[a].bg,
                color: AREA_BADGE[a].text,
                borderColor: `${AREA_BADGE[a].text}33`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AREA_BADGE[a].text }} />
              {AREA_LABELS[a]}
            </span>
          ))}
        </div>

        {/* Approved members */}
        <Card className="bg-card/40 border-foreground/10">
          <CardContent className="p-2 sm:p-4">
            <p className="px-2 pb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Miembros aprobados
            </p>
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : approved.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Aún no hay miembros aprobados.
              </div>
            ) : (
              <ul className="divide-y divide-foreground/5">
                {approved.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-2 sm:px-3 py-3">
                    {m.picture ? (
                      <img
                        src={m.picture}
                        alt={m.name || ""}
                        className="w-9 h-9 rounded-full border border-foreground/15 flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name || m.email}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <AreaBadge area={m.teamRole} />
                    {isCeo && (
                      <AreaSelector
                        userId={m.id}
                        currentArea={m.teamRole}
                        disabled={busyId === m.id}
                        onChange={(area) => {
                          setBusyId(m.id);
                          updateArea.mutate({ id: m.id, teamRole: area });
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending members (info only for CEO) */}
        {isCeo && pending.length > 0 && (
          <Card className="bg-card/40 border-foreground/10">
            <CardContent className="p-2 sm:p-4">
              <p className="px-2 pb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Pendientes de aprobación
              </p>
              <ul className="divide-y divide-foreground/5">
                {pending.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-2 sm:px-3 py-3">
                    {m.picture ? (
                      <img
                        src={m.picture}
                        alt={m.name || ""}
                        className="w-9 h-9 rounded-full border border-foreground/15 flex-shrink-0 opacity-50"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-foreground/10 text-muted-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-muted-foreground">{m.name || m.email}</p>
                      <p className="text-[11px] text-muted-foreground/70 truncate">{m.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground border border-foreground/10 rounded-full px-2 py-0.5">
                      Pendiente
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          El <strong>área</strong> controla a qué secciones del panel tiene acceso cada integrante.
          Solo el CEO puede reasignar áreas.
        </p>
      </div>
    </Layout>
  );
}
