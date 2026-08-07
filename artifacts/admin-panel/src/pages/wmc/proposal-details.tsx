import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/wmc/ui/card";
import { Button } from "@/components/wmc/ui/button";
import { Badge } from "@/components/wmc/ui/badge";
import { Skeleton } from "@/components/wmc/ui/skeleton";
import { Textarea } from "@/components/wmc/ui/textarea";
import { useToast } from "@/hooks/wmc/use-toast";
import { queryClient, apiRequest } from "@/lib/wmc/queryClient";
import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  Send,
  FileText,
  ExternalLink,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Building2,
  Mail,
  Package,
  Calculator,
  Link as LinkIcon,
  MessageSquare,
  Sparkles,
  Loader2,
  Check,
  RefreshCw,
  FolderOpen,
  Target,
} from "lucide-react";
import { Input } from "@/components/wmc/ui/input";
import type { Proposal, ProposalItem, Client, Project } from "@shared/schema";

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  DRAFT: { color: "bg-muted text-muted-foreground", icon: FileText, label: "Borrador" },
  SENT: { color: "bg-chart-2/20 text-chart-2", icon: Send, label: "Enviado" },
  VIEWED: { color: "bg-chart-4/20 text-chart-4", icon: Eye, label: "Visto por Cliente" },
  APPROVED: { color: "bg-chart-5/20 text-chart-5", icon: CheckCircle2, label: "Aprobado" },
  REJECTED: { color: "bg-destructive/20 text-destructive", icon: XCircle, label: "Rechazado" },
  EXPIRED: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Expirado" },
};

interface ProposalWithItems extends Proposal {
  items: ProposalItem[];
}

export default function ProposalDetails() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: proposal, isLoading } = useQuery<ProposalWithItems>({
    queryKey: ["/api/wmc/proposals", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/wmc/proposals/${params.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/wmc/clients"],
  });

  const { data: agreement } = useQuery<{ id: string; tokenUrl: string } | null>({
    queryKey: ["/api/wmc/service-agreements/proposal", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/wmc/service-agreements/proposal/${params.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: allProjects } = useQuery<Project[]>({
    queryKey: ["/api/wmc/projects"],
  });

  const client = clients?.find(c => c.id === proposal?.clientId);
  const linkedProject = allProjects?.find(p => p.proposalId === proposal?.id);
  const config = statusConfig[proposal?.status || "DRAFT"] || statusConfig.DRAFT;

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/wmc/proposals/${params.id}`, { status: "SENT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals", params.id] });
      toast({ title: "Presupuesto enviado al cliente" });
    },
  });

  const generateTokenMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/wmc/proposals/${params.id}/generate-token`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals", params.id] });
      toast({ title: "Token generado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al generar token", variant: "destructive" });
    },
  });

  const [whatsappMsgText, setWhatsappMsgText] = useState("");
  const [whatsappGeneratedMsg, setWhatsappGeneratedMsg] = useState("");
  const [whatsappMsgLoading, setWhatsappMsgLoading] = useState(false);
  const [whatsappMsgCopied, setWhatsappMsgCopied] = useState(false);
  const [manualDriveLink, setManualDriveLink] = useState("");

  const [driveMsgText, setDriveMsgText] = useState("");
  const [driveGeneratedMsg, setDriveGeneratedMsg] = useState("");
  const [driveMsgLoading, setDriveMsgLoading] = useState(false);
  const [driveMsgCopied, setDriveMsgCopied] = useState(false);

  const [coldMsgText, setColdMsgText] = useState("");
  const [coldGeneratedMsg, setColdGeneratedMsg] = useState("");
  const [coldMsgLoading, setColdMsgLoading] = useState(false);
  const [coldMsgCopied, setColdMsgCopied] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}/propuesta/${proposal?.tokenUrl}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Enlace copiado al portapapeles" });
  };

  const driveUrl = linkedProject?.driveFolderUrl || manualDriveLink.trim() || "";
  const hasDriveLink = !!driveUrl;

  const generateWhatsappMessage = async () => {
    if (!proposal || proposal.items.length === 0) return;
    setWhatsappMsgLoading(true);
    try {
      const clientName = client?.contactName || "";
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-whatsapp-message", {
        items: proposal.items.map((item) => ({
          name: item.name,
          description: item.description,
        })),
        clientName,
        additionalContext: whatsappMsgText.trim() || undefined,
        includeDriveLink: hasDriveLink,
      });
      const data = await response.json();
      if (data.message) {
        let msg = data.message;
        if (proposal.tokenUrl) {
          const proposalLink = `https://webmakerlatam.com/propuesta/${proposal.tokenUrl}`;
          const contractLink = agreement?.tokenUrl 
            ? `https://webmakerlatam.com/contrato/${agreement.tokenUrl}` 
            : proposalLink;
          msg = msg.replace(/\[LINK_PROPUESTA\]/g, proposalLink);
          msg = msg.replace(/\[LINK_CONTRATO\]/g, contractLink);
        }
        if (hasDriveLink) {
          msg = msg.replace(/\[LINK_DRIVE\]/g, driveUrl);
        }
        setWhatsappGeneratedMsg(msg);
      }
    } catch {
      toast({ title: "Error al generar mensaje", variant: "destructive" });
    } finally {
      setWhatsappMsgLoading(false);
    }
  };

  const copyWhatsappMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappGeneratedMsg);
      setWhatsappMsgCopied(true);
      toast({ title: "Mensaje copiado al portapapeles" });
      setTimeout(() => setWhatsappMsgCopied(false), 2000);
    } catch {
      toast({ title: "Error al copiar", variant: "destructive" });
    }
  };

  const generateColdOutreach = async () => {
    if (!proposal || proposal.items.length === 0) return;
    setColdMsgLoading(true);
    try {
      const clientName = client?.contactName || "";
      const companyName = client?.companyName || "";
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-cold-outreach", {
        items: proposal.items.map((item) => ({
          name: item.name,
          description: item.description,
        })),
        clientName,
        companyName,
        additionalContext: coldMsgText.trim() || undefined,
      });
      const data = await response.json();
      if (data.message) {
        let msg = data.message;
        if (proposal.tokenUrl) {
          const proposalLink = `https://webmakerlatam.com/propuesta/${proposal.tokenUrl}`;
          msg = msg.replace(/\[LINK_PROPUESTA\]/g, proposalLink);
        }
        setColdGeneratedMsg(msg);
      }
    } catch {
      toast({ title: "Error al generar mensaje", variant: "destructive" });
    } finally {
      setColdMsgLoading(false);
    }
  };

  const copyColdMessage = async () => {
    try {
      await navigator.clipboard.writeText(coldGeneratedMsg);
      setColdMsgCopied(true);
      toast({ title: "Mensaje copiado al portapapeles" });
      setTimeout(() => setColdMsgCopied(false), 2000);
    } catch {
      toast({ title: "Error al copiar", variant: "destructive" });
    }
  };

  const generateDriveMessage = async () => {
    if (!proposal || proposal.items.length === 0) return;
    setDriveMsgLoading(true);
    try {
      const clientName = client?.contactName || "";
      const companyName = client?.companyName || "";
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-drive-message", {
        items: proposal.items.map((item) => ({
          name: item.name,
          description: item.description,
        })),
        clientName,
        companyName,
        additionalContext: driveMsgText.trim() || undefined,
        driveFolderUrl: driveUrl || undefined,
      });
      const data = await response.json();
      if (data.message) {
        setDriveGeneratedMsg(data.message);
      }
    } catch {
      toast({ title: "Error al generar mensaje de Drive", variant: "destructive" });
    } finally {
      setDriveMsgLoading(false);
    }
  };

  const copyDriveMessage = async () => {
    try {
      await navigator.clipboard.writeText(driveGeneratedMsg);
      setDriveMsgCopied(true);
      toast({ title: "Mensaje de Drive copiado al portapapeles" });
      setTimeout(() => setDriveMsgCopied(false), 2000);
    } catch {
      toast({ title: "Error al copiar", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <FileText className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Propuesta no encontrada</h2>
        <Button variant="outline" onClick={() => navigate("/admin/proposals")}>
          Volver a Presupuestos
        </Button>
      </div>
    );
  }

  const StatusIcon = config.icon;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/proposals")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
              Presupuesto
            </h1>
            <p className="text-sm text-muted-foreground">
              {client?.companyName || "Cliente"} - {formatDate(proposal.createdAt)}
            </p>
          </div>
        </div>
        <Badge className={`${config.color} gap-1.5`} variant="secondary">
          <StatusIcon className="w-3.5 h-3.5" />
          {config.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-primary/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                Enlace para el Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {proposal.tokenUrl ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Comparte este enlace con tu cliente para que pueda ver y aprobar el presupuesto.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 p-3 bg-muted/50 rounded-lg border border-border font-mono text-sm break-all">
                      {window.location.origin}/propuesta/{proposal.tokenUrl}
                    </div>
                    <Button onClick={copyLink} data-testid="button-copy-link">
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </Button>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {proposal.status === "DRAFT" && (
                      <Button
                        className="glow-primary"
                        onClick={() => sendMutation.mutate()}
                        disabled={sendMutation.isPending}
                        data-testid="button-send-proposal"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {sendMutation.isPending ? "Enviando..." : "Marcar como Enviado"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => window.open(`/propuesta/${proposal.tokenUrl}`, "_blank")}
                      data-testid="button-preview"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Vista Previa
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`/api/wmc/proposals/${proposal.id}/pdf`, "_blank")}
                      data-testid="button-download-pdf"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Este presupuesto fue creado antes de la nueva funcionalidad de enlaces. Genera un token para poder compartirlo.
                  </p>
                  <Button
                    onClick={() => generateTokenMutation.mutate()}
                    disabled={generateTokenMutation.isPending}
                    data-testid="button-generate-token"
                  >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    {generateTokenMutation.isPending ? "Generando..." : "Generar Enlace de Cliente"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/api/wmc/proposals/${proposal.id}/pdf`, "_blank")}
                    data-testid="button-download-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar PDF
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {client && (
            <Card className="glass-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-display flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-chart-4/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{client.companyName}</h3>
                    <p className="text-sm text-muted-foreground">{client.contactName}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                      <Mail className="w-4 h-4" />
                      {client.contactEmail}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Servicios Incluidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {proposal.items.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-lg border border-border bg-card/30"
                    data-testid={`proposal-item-${index}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h4 className="font-medium text-foreground">{item.name}</h4>
                      <span className="font-bold text-foreground">{formatCLP(item.total)}</span>
                    </div>
                    {item.description && (
                      <div className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap bg-background/50 rounded-md p-3 border border-border/50">
                        {item.description}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Cantidad: {item.quantity}</span>
                      <span>Precio unitario: {formatCLP(item.unitPrice)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {proposal.notes && (
            <Card className="glass-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-display">Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{proposal.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="glass-card sticky top-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span className="text-foreground">{proposal.items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium">{formatCLP(proposal.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA (19%)</span>
                  <span className="text-foreground font-medium">{formatCLP(proposal.iva)}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between">
                  <span className="text-foreground font-semibold">Total</span>
                  <span className="text-2xl font-bold font-display text-gradient" data-testid="text-total">
                    {formatCLP(proposal.total)}
                  </span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Creado: {formatDate(proposal.createdAt)}</span>
                </div>
                {proposal.status === "VIEWED" && (
                  <div className="flex items-center gap-2 text-sm text-chart-4">
                    <Eye className="w-4 h-4" />
                    <span>El cliente ha visto esta propuesta</span>
                  </div>
                )}
                {proposal.status === "APPROVED" && (
                  <div className="flex items-center gap-2 text-sm text-chart-5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Propuesta aprobada por el cliente</span>
                  </div>
                )}
                {proposal.status === "REJECTED" && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4" />
                    <span>Propuesta rechazada</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#2E7D32]" />
                Mensaje para el Cliente
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Genera un mensaje de WhatsApp con IA para enviarle al cliente
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {linkedProject?.driveFolderUrl ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#2E7D32]/10 border border-[#2E7D32]/20" data-testid="drive-link-auto">
                  <FolderOpen className="w-4 h-4 text-[#4A7C34] shrink-0" />
                  <span className="text-xs text-[#4A7C34] truncate flex-1">Drive: {linkedProject.driveFolderUrl}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-[#4A7C34]"
                    onClick={() => {
                      navigator.clipboard.writeText(linkedProject.driveFolderUrl || "");
                      toast({ title: "Link de Drive copiado" });
                    }}
                    data-testid="button-copy-drive-auto"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Link de Drive (opcional, se incluye en el mensaje)
                  </label>
                  <Input
                    value={manualDriveLink}
                    onChange={(e) => setManualDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="text-xs h-8"
                    data-testid="input-manual-drive-link"
                  />
                </div>
              )}

              {!whatsappGeneratedMsg ? (
                <div className="space-y-3">
                  <Textarea
                    value={whatsappMsgText}
                    onChange={(e) => setWhatsappMsgText(e.target.value)}
                    placeholder="Opcional: indicaciones especiales, ej: 'menciona que es urgente' o 'dile que ya hablamos por teléfono'..."
                    className="resize-y text-sm min-h-[80px]"
                    rows={3}
                    disabled={whatsappMsgLoading}
                    data-testid="textarea-whatsapp-msg-detail"
                  />
                  <Button
                    className="w-full bg-gradient-to-r from-[#4A7C34] to-[#5D9442] text-white border-0"
                    onClick={generateWhatsappMessage}
                    disabled={whatsappMsgLoading || proposal.items.length === 0}
                    data-testid="button-generate-whatsapp-detail"
                  >
                    {whatsappMsgLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generando mensaje...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generar Mensaje
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={whatsappGeneratedMsg}
                    onChange={(e) => setWhatsappGeneratedMsg(e.target.value)}
                    className="resize-y text-sm min-h-[200px] leading-relaxed"
                    rows={10}
                    data-testid="textarea-whatsapp-message-detail"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant={whatsappMsgCopied ? "default" : "outline"}
                      onClick={copyWhatsappMessage}
                      data-testid="button-copy-whatsapp-detail"
                    >
                      {whatsappMsgCopied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Mensaje
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setWhatsappGeneratedMsg("");
                        setWhatsappMsgText("");
                      }}
                      data-testid="button-regenerate-whatsapp-detail"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-[#2E7D32]" />
                Mensaje de Drive
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Genera un mensaje con IA explicando al cliente su carpeta de Google Drive
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {driveUrl && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#2E7D32]/10 border border-[#2E7D32]/20" data-testid="drive-link-msg-auto">
                  <FolderOpen className="w-4 h-4 text-[#4A7C34] shrink-0" />
                  <span className="text-xs text-[#4A7C34] truncate flex-1">{driveUrl}</span>
                </div>
              )}

              {!driveGeneratedMsg ? (
                <div className="space-y-3">
                  <Textarea
                    value={driveMsgText}
                    onChange={(e) => setDriveMsgText(e.target.value)}
                    placeholder="Opcional: indicaciones especiales, ej: 'pedir fotos de productos urgente' o 'mencionar que necesitamos el logo en alta resolucion'..."
                    className="resize-y text-sm min-h-[80px]"
                    rows={3}
                    disabled={driveMsgLoading}
                    data-testid="textarea-drive-msg-detail"
                  />
                  <Button
                    className="w-full bg-gradient-to-r from-[#4A7C34] to-[#5D9442] text-white border-0"
                    onClick={generateDriveMessage}
                    disabled={driveMsgLoading || proposal.items.length === 0}
                    data-testid="button-generate-drive-detail"
                  >
                    {driveMsgLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generando mensaje...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generar Mensaje de Drive
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={driveGeneratedMsg}
                    onChange={(e) => setDriveGeneratedMsg(e.target.value)}
                    className="resize-y text-sm min-h-[200px] leading-relaxed"
                    rows={10}
                    data-testid="textarea-drive-message-detail"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant={driveMsgCopied ? "default" : "outline"}
                      onClick={copyDriveMessage}
                      data-testid="button-copy-drive-detail"
                    >
                      {driveMsgCopied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Mensaje
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setDriveGeneratedMsg("");
                        setDriveMsgText("");
                      }}
                      data-testid="button-regenerate-drive-detail"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-[#E86A30]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Target className="w-5 h-5 text-[#E86A30]" />
                Mensaje de Prospección
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Mensaje para clientes que NO nos conocen — primer contacto en frío
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!coldGeneratedMsg ? (
                <div className="space-y-3">
                  <Textarea
                    value={coldMsgText}
                    onChange={(e) => setColdMsgText(e.target.value)}
                    placeholder="Opcional: ej: 'vi su restaurante en Instagram y no tiene web', 'su competencia ya tiene tienda online'..."
                    className="resize-y text-sm min-h-[80px]"
                    rows={3}
                    disabled={coldMsgLoading}
                    data-testid="textarea-cold-msg-detail"
                  />
                  <Button
                    className="w-full bg-gradient-to-r from-[#d45e28] to-[#E86A30] text-white border-0"
                    onClick={generateColdOutreach}
                    disabled={coldMsgLoading || proposal.items.length === 0}
                    data-testid="button-generate-cold-detail"
                  >
                    {coldMsgLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generando mensaje...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generar Mensaje en Frío
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={coldGeneratedMsg}
                    onChange={(e) => setColdGeneratedMsg(e.target.value)}
                    className="resize-y text-sm min-h-[200px] leading-relaxed"
                    rows={10}
                    data-testid="textarea-cold-message-detail"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant={coldMsgCopied ? "default" : "outline"}
                      onClick={copyColdMessage}
                      data-testid="button-copy-cold-detail"
                    >
                      {coldMsgCopied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Mensaje
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setColdGeneratedMsg("");
                        setColdMsgText("");
                      }}
                      data-testid="button-regenerate-cold-detail"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
