import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/wmc/ui/card";
import { Button } from "@/components/wmc/ui/button";
import { Badge } from "@/components/wmc/ui/badge";
import { Skeleton } from "@/components/wmc/ui/skeleton";
import { Input } from "@/components/wmc/ui/input";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/wmc/queryClient";
import { useToast } from "@/hooks/wmc/use-toast";
import {
  Plus,
  Search,
  FileText,
  MoreVertical,
  Eye,
  Send,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Link2,
  Copy,
  Edit,
  Sparkles,
  Loader2,
  Package,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Proposal, Client } from "@shared/schema";
import { cn } from "@/lib/utils";

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(date: string | Date): string {
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

const statusConfig: Record<string, { color: string; icon: any; label: string; activeColor: string }> = {
  DRAFT: { color: "text-muted-foreground bg-muted/30", icon: FileText, label: "Borrador", activeColor: "text-muted-foreground bg-muted/60" },
  SENT: { color: "text-chart-2 bg-chart-2/10", icon: Send, label: "Enviado", activeColor: "text-chart-2 bg-chart-2/30" },
  VIEWED: { color: "text-chart-4 bg-chart-4/10", icon: Eye, label: "Visto", activeColor: "text-chart-4 bg-chart-4/30" },
  APPROVED: { color: "text-chart-5 bg-chart-5/10", icon: CheckCircle2, label: "Aprobado", activeColor: "text-chart-5 bg-chart-5/30" },
  REJECTED: { color: "text-destructive bg-destructive/10", icon: XCircle, label: "Rechazado", activeColor: "text-destructive bg-destructive/30" },
  EXPIRED: { color: "text-muted-foreground bg-muted/30", icon: AlertCircle, label: "Expirado", activeColor: "text-muted-foreground bg-muted/60" },
};

function ProposalCard({ proposal, client }: { proposal: Proposal; client?: Client }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const config = statusConfig[proposal.status] || statusConfig.DRAFT;
  const StatusIcon = config.icon;

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/wmc/proposals/${proposal.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals"] });
      toast({ title: "Presupuesto eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/wmc/proposals/${proposal.id}`, { status: "SENT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals"] });
      toast({ title: "Presupuesto enviado" });
    },
  });

  const generateAiMutation = useMutation({
    mutationFn: async () => {
      const aiRes = await apiRequest("POST", "/api/wmc/service-agreements/generate-ai-content", { proposalId: proposal.id });
      const aiData = await aiRes.json();

      const res = await apiRequest("POST", "/api/wmc/service-agreements", {
        proposalId: proposal.id,
        templateId: null,
        clientCompanyName: client?.companyName || "Cliente",
        clientRut: client?.rut || "",
        clientRepresentativeName: client?.contactName || "Representante",
        clientRepresentativeRut: "",
        content: JSON.stringify({ sections: aiData.sections }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/service-agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals"] });
      toast({ title: "Contrato generado con IA", description: "Revisa y edita el contrato en la seccion de Acuerdos de Servicio" });
      navigate("/admin/agreements");
    },
    onError: () => {
      toast({ title: "Error al generar contrato", description: "No se pudo generar el contrato con IA", variant: "destructive" });
    },
  });

  // NUEVO DISEÑO DE TARJETA RESPONSIVO
  return (
    <Card className="group border-border/50 hover:border-primary/20 hover:shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn("w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 border-2", config.color.replace('bg-', 'border-'))}>
            <StatusIcon className={cn("w-7 h-7", config.color.replace('bg-', 'text-'))} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-lg text-foreground truncate" data-testid={`text-proposal-client-${proposal.id}`}>
              {client?.companyName || "Cliente"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Creado el {formatDate(proposal.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`button-proposal-menu-${proposal.id}`}
                >
                  <MoreVertical className="w-5 h-5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => navigate(`/admin/proposal-builder?edit=${proposal.id}`)}
                  data-testid={`button-edit-proposal-${proposal.id}`}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => navigate(`/admin/proposals/${proposal.id}`)}
                  data-testid={`button-view-proposal-${proposal.id}`}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Ver Detalles
                </DropdownMenuItem>
                {proposal.status === "DRAFT" && (
                  <DropdownMenuItem
                    onClick={() => sendMutation.mutate()}
                    data-testid={`button-send-proposal-${proposal.id}`}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Enviar
                  </DropdownMenuItem>
                )}
                {proposal.tokenUrl && proposal.status !== "DRAFT" && (
                  <DropdownMenuItem
                    onClick={() => {
                      const url = `${window.location.origin}/propuesta/${proposal.tokenUrl}`;
                      navigator.clipboard.writeText(url);
                      toast({ title: "Enlace copiado al portapapeles" });
                    }}
                    data-testid={`button-copy-link-${proposal.id}`}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Enlace
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => generateAiMutation.mutate()}
                  disabled={generateAiMutation.isPending}
                  data-testid={`button-generate-ai-contract-${proposal.id}`}
                >
                  {generateAiMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2 text-[#E86A30]" />
                  )}
                  <span className="text-[#E86A30]">
                    {generateAiMutation.isPending ? "Generando..." : "Generar Contrato con IA"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate()}
                  data-testid={`button-delete-proposal-${proposal.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Badge className={cn("text-xs font-semibold px-3 py-1", config.color)} variant="secondary">
              {config.label}
            </Badge>
          </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-3xl font-bold font-display tracking-tight text-foreground">
            {formatCLP(proposal.total)}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Package className="w-4 h-4 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground truncate">
              {proposal.serviceCount || 0} servicios principales
            </p>
          </div>
        </div>

        {proposal.status === "APPROVED" && proposal.marginTier && proposal.marginTier !== "NONE" && (
            <div className={`mt-3 flex items-center justify-between p-3 rounded-xl border ${
              proposal.marginTier === "SOBRE_PRECIO" ? "bg-[#4A7C34]/10 border-[#4A7C34]/30" :
              proposal.marginTier === "PRECIO_BASE" ? "bg-[#F4B83A]/10 border-[#F4B83A]/30" :
              proposal.marginTier === "BAJO_PRECIO" ? "bg-[#E86A30]/10 border-[#E86A30]/30" :
              "bg-red-500/10 border-red-500/20"
            }`}>
              <div>
                <span className={`text-xs font-semibold ${
                  proposal.marginTier === "SOBRE_PRECIO" ? "text-[#4A7C34]" :
                  proposal.marginTier === "PRECIO_BASE" ? "text-[#F4B83A]" :
                  proposal.marginTier === "BAJO_PRECIO" ? "text-[#E86A30]" :
                  "text-red-400"
                }`}>
                  {proposal.marginTier === "SOBRE_PRECIO" ? "Sobre precio" : proposal.marginTier === "PRECIO_BASE" ? "Precio base" : proposal.marginTier === "BAJO_PRECIO" ? "Bajo precio" : "Bajo piso"}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Comisión closer ({proposal.closerCommissionRate}%)</p>
                <p className={`text-xs font-bold ${
                  proposal.marginTier === "SOBRE_PRECIO" ? "text-[#4A7C34]" :
                  proposal.marginTier === "PRECIO_BASE" ? "text-[#F4B83A]" :
                  proposal.marginTier === "BAJO_PRECIO" ? "text-[#E86A30]" :
                  "text-red-400"
                }`}>
                  {proposal.marginTier === "BAJO_PISO" ? "$0" : formatCLP(proposal.closerCommission)}
                </p>
              </div>
            </div>
          )}
      </CardContent>

      <CardFooter className="p-5 pt-0 border-t border-border/50 flex flex-row items-center justify-between">
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Subtotal</p>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {formatCLP(proposal.subtotal)}
          </p>
        </div>
        <Link href={`/admin/proposals/${proposal.id}`}>
          <Button variant="link" size="sm" className="text-primary hover:text-primary/80 px-0">
            Ver detalles <MoreVertical className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

// NUEVO DISEÑO DE BARRA SUPERIOR
const FilterCountCard = ({ label, count, icon: Icon, isActive, onClick, config }: { 
  label: string; 
  count: number; 
  icon: any; 
  isActive: boolean; 
  onClick: () => void;
  config: { color: string; activeColor: string };
}) => (
  <Card 
    className={cn(
      "cursor-pointer hover:border-primary/30 transition-all border border-border/50",
      isActive ? "border-primary/50 shadow-inner" : ""
    )} 
    onClick={onClick}
  >
    <CardContent className="px-5 py-4 flex flex-row items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", isActive ? config.activeColor : config.color)}>
        <Icon className={cn("w-6 h-6", isActive ? config.activeColor.replace('bg-', 'text-') : config.color.replace('bg-', 'text-'))} />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold font-display tracking-tight text-foreground">{count}</p>
      </div>
    </CardContent>
  </Card>
);

export default function Proposals() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: proposals, isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/wmc/proposals"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/wmc/clients"],
  });

  const clientMap = new Map(clients?.map(c => [c.id, c]) || []);

  const filteredProposals = proposals?.filter((proposal) => {
    const client = clientMap.get(proposal.clientId);
    const matchesSearch = !search || 
      (client?.companyName || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || proposal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = proposals?.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    // NUEVO ESPACIADO DEL CONTENEDOR PRINCIPAL
    <div className="space-y-10 px-12 py-16 pb-20 lg:pb-0">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold font-display text-foreground tracking-tighter">
            Presupuestos
          </h1>
          <p className="text-lg text-muted-foreground mt-1 max-w-lg">
            Gestiona tus propuestas comerciales de forma eficiente y profesional.
          </p>
        </div>
        <Link href="/admin/proposal-builder">
          <Button className="w-full sm:w-auto glow-primary px-8 py-6 text-lg" size="lg" data-testid="button-new-proposal-list">
            <Plus className="w-5 h-5 mr-2.5" />
            Nuevo Presupuesto
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <FilterCountCard 
          label="Todos" 
          count={proposals?.length || 0} 
          icon={Package} 
          isActive={statusFilter === null} 
          onClick={() => setStatusFilter(null)}
          config={{ color: "text-primary bg-primary/10", activeColor: "text-primary bg-primary/30" }}
        />
        {Object.entries(statusConfig).map(([status, config]) => (
          <FilterCountCard 
            key={status} 
            label={config.label} 
            count={statusCounts[status] || 0} 
            icon={config.icon} 
            isActive={statusFilter === status} 
            onClick={() => setStatusFilter(status)}
            config={config}
          />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/70" />
          <Input
            placeholder="Buscar por cliente o empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 py-6 text-lg"
            data-testid="input-search-proposals"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div className="space-y-3 flex-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-border/50 space-y-3">
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProposals && filteredProposals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              client={clientMap.get(proposal.clientId)}
            />
          ))}
        </div>
      ) : (
        <Card className="border-border/50 shadow-lg">
          <CardContent className="py-24 text-center">
            <FileText className="w-20 h-20 text-muted-foreground/30 mx-auto mb-8" />
            <h3 className="text-2xl font-semibold tracking-tight text-foreground mb-3">
              {search || statusFilter ? "No se encontraron presupuestos" : "No hay presupuestos aún"}
            </h3>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              {search || statusFilter
                ? "Intenta con otros filtros o palabras clave para encontrar la propuesta que buscas."
                : "Crea tu primer presupuesto para comenzar a vender de forma profesional con WebMaker."}
            </p>
            {!search && !statusFilter && (
              <Link href="/admin/proposal-builder">
                <Button size="lg" className="glow-primary px-8" data-testid="button-create-first-proposal-list">
                  <Plus className="w-5 h-5 mr-2.5" />
                  Crear Presupuesto
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}