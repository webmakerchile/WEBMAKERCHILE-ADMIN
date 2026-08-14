import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/wmc/ui/card";
import { Button } from "@/components/wmc/ui/button";
import { Badge } from "@/components/wmc/ui/badge";
import { Skeleton } from "@/components/wmc/ui/skeleton";
import { Progress } from "@/components/wmc/ui/progress";
import { Input } from "@/components/wmc/ui/input";
import { Textarea } from "@/components/wmc/ui/textarea";
import { Label } from "@/components/wmc/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/wmc/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/wmc/ui/alert-dialog";
import { useToast } from "@/hooks/wmc/use-toast";
import { useUpload } from "@/hooks/wmc/use-upload";
import { queryClient, apiRequest } from "@/lib/wmc/queryClient";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Code2,
  TestTube,
  Truck,
  Palette,
  User,
  Building,
  Calendar,
  DollarSign,
  Link as LinkIcon,
  Key,
  Trash2,
  FileText,
  Plus,
  Image as ImageIcon,
  Clock,
  Video,
  Upload,
  X,
  Package,
  Server,
  Wrench,
  UserCog,
  Wallet,
  Cpu,
  Timer,
  AlertTriangle,
  Send,
  XCircle,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  FileSignature,
  Eye,
  EyeOff,
  ClipboardList,
  ChevronDown,
  FolderOpen,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { Project, Client, ProjectLog, Payment, Developer, ProjectAddon, ProjectAddonItem } from "@shared/schema";

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

const statusConfig: Record<string, { 
  color: string; 
  icon: any; 
  label: string; 
  progress: number;
  bgColor: string;
}> = {
  MOCKUP: { 
    color: "text-chart-4", 
    icon: Palette, 
    label: "Diseño", 
    progress: 20,
    bgColor: "bg-chart-4/20"
  },
  DEVELOPMENT: { 
    color: "text-chart-2", 
    icon: Code2, 
    label: "Desarrollo", 
    progress: 50,
    bgColor: "bg-chart-2/20"
  },
  QA: { 
    color: "text-[#E86A30]", 
    icon: TestTube, 
    label: "Testing", 
    progress: 75,
    bgColor: "bg-[#E86A30]/20"
  },
  DELIVERY: { 
    color: "text-primary", 
    icon: Truck, 
    label: "Entrega", 
    progress: 90,
    bgColor: "bg-primary/20"
  },
  COMPLETED: { 
    color: "text-chart-5", 
    icon: CheckCircle2, 
    label: "Completado", 
    progress: 100,
    bgColor: "bg-chart-5/20"
  },
};

const statusOrder = ["MOCKUP", "DEVELOPMENT", "QA", "DELIVERY", "COMPLETED"];

export default function ProjectDetails() {
  const [, params] = useRoute("/admin/projects/:id");
  const projectId = params?.id || null;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showLogForm, setShowLogForm] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logContent, setLogContent] = useState("");
  const [logPhase, setLogPhase] = useState("MOCKUP");
  const [uploadedImages, setUploadedImages] = useState<{ objectPath: string; name: string; previewUrl: string }[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const { uploadFile } = useUpload();
  const [videoUrl, setVideoUrl] = useState("");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TRANSFERENCIA");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [editDeadlineDays, setEditDeadlineDays] = useState<string>("");
  const [now, setNow] = useState(() => Date.now());
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [addonTitle, setAddonTitle] = useState("");
  const [addonDescription, setAddonDescription] = useState("");
  const [addonHasIVA, setAddonHasIVA] = useState(true);
  const [addonItems, setAddonItems] = useState<{ name: string; description: string; unitPrice: number; quantity: number }[]>([
    { name: "", description: "", unitPrice: 0, quantity: 1 },
  ]);
  const [addonAiInput, setAddonAiInput] = useState("");
  const [showAiSection, setShowAiSection] = useState(true);
  const [isAddonRecording, setIsAddonRecording] = useState(false);
  const [addonMediaRecorder, setAddonMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isAddonGenerating, setIsAddonGenerating] = useState(false);
  const [isAddonTranscribing, setIsAddonTranscribing] = useState(false);
  const [showContractPreview, setShowContractPreview] = useState<string | null>(null);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [contractEditInput, setContractEditInput] = useState("");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [isEditingContract, setIsEditingContract] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/wmc/projects"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/wmc/clients"],
  });

  const { data: projectLogs = [] } = useQuery<ProjectLog[]>({
    queryKey: ["/api/wmc/projects", projectId, "logs"],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/wmc/projects/${projectId}/logs`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: paymentsData } = useQuery<{ payments: Payment[]; totalPaid: number }>({
    queryKey: ["/api/wmc/projects", projectId, "payments"],
    queryFn: async () => {
      if (!projectId) return { payments: [], totalPaid: 0 };
      const res = await fetch(`/api/wmc/projects/${projectId}/payments`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: developers = [] } = useQuery<Developer[]>({
    queryKey: ["/api/wmc/developers"],
  });

  const { data: addons = [] } = useQuery<(ProjectAddon & { items?: ProjectAddonItem[] })[]>({
    queryKey: ["/api/wmc/projects", projectId, "addons"],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/wmc/projects/${projectId}/addons`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const createAddonMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/wmc/projects/${projectId}/addons`, {
        title: addonTitle,
        description: addonDescription || undefined,
        hasIVA: addonHasIVA,
        items: addonItems.filter((i) => i.name.trim()),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
      setAddonTitle("");
      setAddonDescription("");
      setAddonItems([{ name: "", description: "", unitPrice: 0, quantity: 1 }]);
      setShowAddonForm(false);
      toast({ title: "Servicio adicional creado" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const sendAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      await apiRequest("PATCH", `/api/wmc/addons/${addonId}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
      toast({ title: "Servicio adicional enviado al cliente" });
    },
  });

  const deleteAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      await apiRequest("DELETE", `/api/wmc/addons/${addonId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
      toast({ title: "Servicio adicional eliminado" });
    },
  });

  const toggleAddonPaidMutation = useMutation({
    mutationFn: async (addonId: string) => {
      await apiRequest("POST", `/api/wmc/addons/${addonId}/toggle-paid`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
      toast({ title: "Estado de pago actualizado" });
    },
  });

  const startAddonRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          setIsAddonTranscribing(true);
          try {
            const res = await fetch("/api/wmc/addons/transcribe-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64, mimeType }),
            });
            const data = await res.json();
            if (data.text) setAddonAiInput((prev) => (prev ? prev + " " : "") + data.text);
          } catch {
            toast({ variant: "destructive", title: "Error al transcribir audio" });
          } finally {
            setIsAddonTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setAddonMediaRecorder(recorder);
      setIsAddonRecording(true);
    } catch {
      toast({ variant: "destructive", title: "No se pudo acceder al microfono" });
    }
  };

  const stopAddonRecording = () => {
    if (addonMediaRecorder && addonMediaRecorder.state !== "inactive") {
      addonMediaRecorder.stop();
    }
    setIsAddonRecording(false);
    setAddonMediaRecorder(null);
  };

  const generateAddonItemsWithAI = async () => {
    if (!addonAiInput.trim()) return;
    setIsAddonGenerating(true);
    try {
      const res = await fetch("/api/wmc/addons/generate-items-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: addonAiInput }),
      });
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setAddonItems(data.items.map((it: { name: string; description?: string; unitPrice: number; quantity?: number }) => ({
          name: it.name || "",
          description: it.description || "",
          unitPrice: it.unitPrice || 0,
          quantity: it.quantity || 1,
        })));
        if (!addonTitle.trim()) {
          setAddonTitle(data.summary || data.items.map((it: { name: string }) => it.name).slice(0, 2).join(" + "));
        }
        if (!addonDescription.trim() && data.summary) {
          setAddonDescription(data.summary);
        }
        setShowAiSection(false);
        toast({ title: "Items generados con IA", description: `${data.items.length} items creados` });
      }
    } catch {
      toast({ variant: "destructive", title: "Error al generar items con IA" });
    } finally {
      setIsAddonGenerating(false);
    }
  };

  const generateAddonContract = async (addonId: string, datos?: unknown) => {
    setIsGeneratingContract(true);
    try {
      const res = await fetch("/api/wmc/addons/generate-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonId, addon: datos }),
      });
      const data = await res.json();
      if (data.contract) {
        queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
        setShowContractPreview(data.contract);
        toast({ title: "Mini-contrato generado" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error al generar contrato" });
    } finally {
      setIsGeneratingContract(false);
    }
  };

  const editAddonContract = async (addonId: string, datos?: unknown) => {
    if (!contractEditInput.trim()) return;
    setIsEditingContract(true);
    try {
      const res = await fetch("/api/wmc/addons/edit-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addonId,
          addon: datos,
          instruction: contractEditInput,
        }),
      });
      const data = await res.json();
      if (data.contract) {
        queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
        setShowContractPreview(data.contract);
        setContractEditInput("");
        toast({ title: "Contrato actualizado con IA" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error al editar contrato" });
    } finally {
      setIsEditingContract(false);
    }
  };

  const handleCopyAddonLink = (tokenUrl: string | null) => {
    if (!tokenUrl) return;
    const link = `${window.location.origin}/addon/${tokenUrl}`;
    navigator.clipboard.writeText(link).then(() => {
      toast({ title: "Link copiado", description: "El enlace de aprobacion ha sido copiado." });
    });
  };

  const addonStatusConfig: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Borrador", className: "bg-zinc-500/20 text-zinc-400" },
    SENT: { label: "Enviado", className: "bg-[#E86A30]/20 text-[#E86A30]" },
    APPROVED: { label: "Aprobado", className: "bg-primary/20 text-primary" },
    REJECTED: { label: "Rechazado", className: "bg-destructive/20 text-destructive" },
  };

  const driveFolderMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await apiRequest("POST", `/api/wmc/projects/${projectId}/create-drive-folder`, { force });
      return res.json();
    },
    onSuccess: (data: { driveFolderUrl?: string; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId] });
      toast({
        title: "Carpeta de Drive lista",
        description: data.message || "La carpeta del cliente está disponible.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error con Drive",
        description: error?.message || "No se pudo generar la carpeta en Drive.",
      });
    },
  });

  const assignDeveloperMutation = useMutation({
    mutationFn: async (developerId: string | null) => {
      await apiRequest("PATCH", `/api/wmc/projects/${projectId}/assign-developer`, { developerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId] });
      toast({
        title: "Desarrollador actualizado",
        description: "El desarrollador asignado ha sido actualizado.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el desarrollador asignado.",
      });
    },
  });

  const { data: completionOffer } = useQuery<{ selectedService: string | null; acceptedBundle: boolean }>({
    queryKey: ["/api/wmc/projects", projectId, "completion-offer"],
    queryFn: async () => {
      if (!projectId) return { selectedService: null, acceptedBundle: false };
      const res = await fetch(`/api/wmc/projects/${projectId}/completion-offer`, {
        credentials: "include"
      });
      if (!res.ok) return { selectedService: null, acceptedBundle: false };
      return res.json();
    },
    enabled: !!projectId,
  });

  const project = projects?.find((p) => p.id === projectId);
  const client = clients?.find((c) => c.id === project?.clientId);
  const config = statusConfig[project?.status || "MOCKUP"];
  const StatusIcon = config?.icon || Palette;

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/wmc/projects/${project?.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects"] });
      toast({
        title: "Estado actualizado",
        description: "El estado del proyecto ha sido actualizado.",
      });
    },
  });

  const updateCostsMutation = useMutation({
    mutationFn: async () => {
      const deadlineDays = parseInt(editDeadlineDays) || 0;
      await apiRequest("PATCH", `/api/wmc/projects/${project?.id}`, { deadlineDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects"] });
      toast({
        title: "Costos actualizados",
        description: "Los costos internos han sido guardados.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron guardar los costos.",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/wmc/projects/${project?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects"] });
      toast({
        title: "Proyecto eliminado",
        description: "El proyecto ha sido eliminado correctamente.",
      });
      setLocation("/admin/projects");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el proyecto.",
      });
    },
  });

  const createLogMutation = useMutation({
    mutationFn: async () => {
      const imageUrls = uploadedImages.map((img) => img.objectPath);
      
      await apiRequest("POST", `/api/wmc/projects/${project?.id}/logs`, {
        title: logTitle,
        content: logContent,
        phase: logPhase,
        videoUrl: videoUrl.trim() || undefined,
        imageUrls,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "logs"] });
      setLogTitle("");
      setLogContent("");
      setLogPhase(project?.status || "MOCKUP");
      setUploadedImages([]);
      setVideoUrl("");
      setShowLogForm(false);
      toast({
        title: "Entrada agregada",
        description: "La entrada de bitacora ha sido agregada.",
      });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      await apiRequest("DELETE", `/api/wmc/project-logs/${logId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "logs"] });
      toast({
        title: "Entrada eliminada",
        description: "La entrada de bitacora ha sido eliminada.",
      });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(paymentAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Monto invalido");
      }
      const pending = project?.totalValue ? project.totalValue - (paymentsData?.totalPaid || 0) : 0;
      if (amount > pending) {
        throw new Error("El monto excede el saldo pendiente");
      }
      await apiRequest("POST", `/api/wmc/projects/${projectId}/payments`, {
        amount,
        paymentMethod,
        description: paymentDescription,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "payments"] });
      setPaymentAmount("");
      setPaymentDescription("");
      setShowPaymentForm(false);
      toast({
        title: "Pago registrado",
        description: "El pago ha sido registrado exitosamente.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo registrar el pago.",
      });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("DELETE", `/api/wmc/payments/${paymentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "payments"] });
      toast({
        title: "Pago eliminado",
        description: "El pago ha sido eliminado.",
      });
    },
  });

  const handleCopyToken = () => {
    if (!project) return;
    navigator.clipboard.writeText(project.id).then(() => {
      toast({
        title: "Token copiado",
        description: "Token de acceso copiado al portapapeles.",
      });
    });
  };

  const handleCopyAdminLink = () => {
    if (!project) return;
    const link = `${window.location.origin}/portal/login?token=${project.id}&view=admin`;
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link admin copiado",
        description: "Link con precios copiado al portapapeles.",
      });
    });
  };

  const handleCopyClientLink = () => {
    if (!project) return;
    const link = `${window.location.origin}/portal/login?token=${project.id}&view=client`;
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link cliente copiado",
        description: "Link sin precios copiado al portapapeles.",
      });
    });
  };

  if (projectsLoading) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <Link href="/admin/projects">
          <Button variant="ghost" data-testid="button-volver-proyectos">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Proyectos
          </Button>
        </Link>
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Proyecto no encontrado
            </h3>
            <p className="text-muted-foreground">
              El proyecto que buscas no existe o ha sido eliminado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStatusIndex = statusOrder.indexOf(project.status);

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/admin/projects">
            <Button variant="ghost" data-testid="button-volver-proyectos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground tracking-tight" data-testid="text-project-title">
              {project.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              Detalles del proyecto
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-project">
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar Proyecto
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar proyecto</AlertDialogTitle>
              <AlertDialogDescription>
                Esta accion no se puede deshacer. Se eliminara permanentemente el proyecto
                "{project.name}" y toda su información asociada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteProjectMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteProjectMutation.isPending ? "Eliminando..." : "Si, eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StatusIcon className={`w-5 h-5 ${config.color}`} />
                Estado del Proyecto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Badge className={`${config.bgColor} ${config.color}`} variant="secondary">
                  {config.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {config.progress}% completado
                </span>
              </div>

              <Progress value={config.progress} className="h-3" />

              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {statusOrder.map((status, index) => {
                  const sConfig = statusConfig[status];
                  const SIcon = sConfig.icon;
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;

                  return (
                    <div key={status} className="flex items-center">
                      <Button
                        variant={isCurrent ? "default" : isCompleted ? "secondary" : "outline"}
                        size="sm"
                        className={`whitespace-nowrap ${isCurrent ? "ring-2 ring-primary" : ""}`}
                        onClick={() => updateStatusMutation.mutate(status)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-status-${status.toLowerCase()}`}
                      >
                        <SIcon className="w-4 h-4 mr-1" />
                        {sConfig.label}
                      </Button>
                      {index < statusOrder.length - 1 && (
                        <div className={`w-4 h-0.5 mx-1 ${isCompleted ? "bg-chart-5" : "bg-muted"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5 text-muted-foreground" />
                Información del Proyecto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-medium text-foreground">{client?.companyName || "Sin cliente"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha de Inicio</p>
                    <p className="font-medium text-foreground">{formatDate(project.createdAt)}</p>
                  </div>
                </div>
                {project.deadlineDays > 0 && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                    <Timer className="w-5 h-5 text-[#E86A30]" />
                    <div>
                      <p className="text-sm text-muted-foreground">Plazo de Entrega</p>
                      <p className="font-medium text-foreground">{project.deadlineDays} dias</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 sm:col-span-2">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total</p>
                    <p className="font-bold text-xl text-foreground">{formatCLP(project.totalValue)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-[#E86A30]" />
                Plazo de Entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-[#E86A30]" />
                  <Label className="text-sm text-muted-foreground">Días de plazo</Label>
                </div>
                <Input
                  type="number"
                  placeholder={String(project.deadlineDays || 0)}
                  value={editDeadlineDays}
                  onChange={(e) => setEditDeadlineDays(e.target.value)}
                  className="font-mono"
                  data-testid="input-deadline-days"
                />
                <p className="text-xs text-muted-foreground">Actual: {project.deadlineDays || 0} dias</p>
              </div>

              {project.deadlineDays > 0 && project.deadlineStartDate && (() => {
                const startMs = new Date(project.deadlineStartDate!).getTime();
                const endMs = startMs + (project.deadlineDays * 24 * 60 * 60 * 1000);
                const totalDuration = endMs - startMs;
                const elapsed = now - startMs;
                const percentElapsed = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                const remaining = endMs - now;
                const isOverdue = remaining < 0;
                const percentRemaining = 100 - percentElapsed;

                let statusLabel: string;
                let statusColor: string;
                let barColor: string;
                let StatusDeadlineIcon: typeof Timer;
                let pulse = false;

                if (isOverdue) {
                  statusLabel = "Vencido";
                  statusColor = "text-destructive";
                  barColor = "bg-destructive";
                  StatusDeadlineIcon = AlertTriangle;
                  pulse = true;
                } else if (percentRemaining < 10) {
                  statusLabel = "Crítico";
                  statusColor = "text-destructive";
                  barColor = "bg-destructive";
                  StatusDeadlineIcon = AlertTriangle;
                } else if (percentRemaining < 25) {
                  statusLabel = "Urgente";
                  statusColor = "text-[#E86A30]";
                  barColor = "bg-[#E86A30]";
                  StatusDeadlineIcon = AlertTriangle;
                } else if (percentRemaining < 50) {
                  statusLabel = "Atención";
                  statusColor = "text-[#E86A30]";
                  barColor = "bg-[#E86A30]";
                  StatusDeadlineIcon = Timer;
                } else {
                  statusLabel = "En Tiempo";
                  statusColor = "text-[#4A7C34]";
                  barColor = "bg-[#4A7C34]";
                  StatusDeadlineIcon = CheckCircle2;
                }

                let countdownText: string;
                if (isOverdue) {
                  const overdueDays = Math.floor(Math.abs(remaining) / (1000 * 60 * 60 * 24));
                  const overdueHours = Math.floor((Math.abs(remaining) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  countdownText = `Vencido hace ${overdueDays} dias, ${overdueHours} horas`;
                } else {
                  const remDays = Math.floor(remaining / (1000 * 60 * 60 * 24));
                  const remHours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  countdownText = `${remDays} dias, ${remHours} horas restantes`;
                }

                const deadlineEndFormatted = new Intl.DateTimeFormat("es-CL", {
                  timeZone: "America/Santiago",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(endMs));

                return (
                  <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3" data-testid="deadline-countdown-widget">
                    <div className={`flex items-center gap-2 ${pulse ? "animate-pulse" : ""}`}>
                      <StatusDeadlineIcon className={`w-5 h-5 ${statusColor}`} />
                      <span className={`font-bold text-lg ${statusColor}`}>{statusLabel}</span>
                    </div>

                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(percentElapsed, 100)}%` }}
                      />
                    </div>

                    <div className="space-y-1">
                      <p className={`font-semibold ${statusColor}`} data-testid="text-countdown">
                        {countdownText}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid="text-deadline-end">
                        Fecha límite: {deadlineEndFormatted}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <Button
                onClick={() => updateCostsMutation.mutate()}
                disabled={updateCostsMutation.isPending}
                className="w-full bg-[#4A7C34] text-white"
                data-testid="button-save-costs"
              >
                {updateCostsMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-card border-2 border-[#E86A30]/30 bg-gradient-to-br from-[#E86A30]/10 to-[#E86A30]/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#E86A30]">
                <Key className="w-5 h-5" />
                ACCESO DE CLIENTE
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Token de Acceso</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm font-mono text-foreground truncate" data-testid="text-access-token">
                    {project?.id}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyToken} data-testid="button-copy-token">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Link Admin (con precios)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm font-mono text-foreground truncate" data-testid="text-admin-link">
                    {`${window.location.origin}/portal/login?token=${project?.id}&view=admin`}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyAdminLink} data-testid="button-copy-admin-link">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Link Cliente (sin precios)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm font-mono text-foreground truncate" data-testid="text-client-link">
                    {`${window.location.origin}/portal/login?token=${project?.id}&view=client`}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyClientLink} data-testid="button-copy-client-link">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  className="w-full bg-[#4A7C34] text-white"
                  onClick={handleCopyAdminLink}
                  data-testid="button-copy-admin-link-main"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  Link Admin
                </Button>
                <Button
                  className="w-full bg-[#E86A30] text-white"
                  onClick={handleCopyClientLink}
                  data-testid="button-copy-client-link-main"
                >
                  <LinkIcon className="w-4 h-4 mr-1" />
                  Link Cliente
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                El link admin muestra precios. El link cliente oculta los precios.
              </p>
            </CardContent>
          </Card>

          {client && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-sm">Datos del Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Empresa</p>
                  <p className="font-medium text-foreground">{client.companyName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Contacto</p>
                  <p className="font-medium text-foreground">{client.contactName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{client.contactEmail}</p>
                </div>
                {client.contactPhone && (
                  <div>
                    <p className="text-muted-foreground">Teléfono</p>
                    <p className="font-medium text-foreground">{client.contactPhone}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass-card" data-testid="card-drive-folder">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FolderOpen className="w-5 h-5 text-muted-foreground" />
                Carpeta de Drive
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {project.driveFolderUrl ? (
                <>
                  <a
                    href={project.driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline break-all"
                    data-testid="link-drive-folder"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    Abrir carpeta del cliente
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => driveFolderMutation.mutate(true)}
                    disabled={driveFolderMutation.isPending}
                    data-testid="button-regenerate-drive"
                  >
                    {driveFolderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Regenerar Drive
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Este proyecto todavía no tiene carpeta en Drive. Si el cliente ya
                    tiene una carpeta de otro proyecto, se reutilizará automáticamente.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => driveFolderMutation.mutate(false)}
                    disabled={driveFolderMutation.isPending}
                    data-testid="button-create-drive"
                  >
                    {driveFolderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4 mr-2" />
                    )}
                    Crear carpeta en Drive
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-assigned-developer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCog className="w-5 h-5 text-muted-foreground" />
                Contratado Asignado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {project.assignedDeveloperId ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="secondary" data-testid="badge-assigned-developer">
                      {developers.find((d) => d.id === project.assignedDeveloperId)?.name || "Contratado"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => assignDeveloperMutation.mutate(null)}
                      disabled={assignDeveloperMutation.isPending}
                      data-testid="button-unassign-developer"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {(() => {
                    const dev = developers.find((d) => d.id === project.assignedDeveloperId);
                    return dev ? (
                      <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-[#4A7C34]" />
                          <span className="text-xs text-muted-foreground">Sueldo mensual</span>
                        </div>
                        <p className="font-bold text-lg text-[#4A7C34]" data-testid="text-dev-salary">
                          {formatCLP((dev as any).salary || 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Se paga el día 5 de cada mes</p>
                      </div>
                    ) : null;
                  })()}
                </>
              ) : (
                <Select
                  onValueChange={(value) => assignDeveloperMutation.mutate(value)}
                  disabled={assignDeveloperMutation.isPending}
                >
                  <SelectTrigger data-testid="select-assign-developer">
                    <SelectValue placeholder="Seleccionar contratado" />
                  </SelectTrigger>
                  <SelectContent>
                    {developers.filter((d) => d.isActive === 1).map((dev) => (
                      <SelectItem key={dev.id} value={dev.id} data-testid={`option-developer-${dev.id}`}>
                        {dev.name} {(dev as any).salary > 0 ? `(${formatCLP((dev as any).salary)}/mes)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {(project.monthlyMaintenance > 0 || completionOffer?.selectedService) && (
            <Card className="glass-card border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-primary">
                  <Package className="w-5 h-5" />
                  Mantenimiento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {project.monthlyMaintenance > 0 ? (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <p className="text-muted-foreground mb-1">Mantenimiento Pre-acordado</p>
                    <p className="text-xl font-bold text-primary" data-testid="text-maintenance-amount">
                      {formatCLP(project.monthlyMaintenance)}<span className="text-sm font-normal">/mes</span>
                    </p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                      <span>Hosting, soporte y actualizaciones incluidos</span>
                    </div>
                  </div>
                ) : completionOffer?.selectedService ? (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <p className="text-muted-foreground mb-1">Servicio Seleccionado</p>
                    <div className="flex items-center gap-2">
                      {completionOffer.selectedService === "HOSTING" && <Server className="w-5 h-5 text-primary" />}
                      {completionOffer.selectedService === "SUPPORT" && <Wrench className="w-5 h-5 text-primary" />}
                      {completionOffer.selectedService === "BUNDLE" && <Package className="w-5 h-5 text-primary" />}
                      <span className="font-semibold text-foreground" data-testid="text-selected-service">
                        {completionOffer.selectedService === "HOSTING" ? "Hosting Web" :
                         completionOffer.selectedService === "SUPPORT" ? "Soporte Técnico" :
                         completionOffer.selectedService === "BUNDLE" ? "Bundle Completo" : completionOffer.selectedService}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                      <span>Cliente acepto el servicio de mantenimiento</span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card className="glass-card border-2 border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="w-5 h-5 text-primary" />
                Seguimiento de Pagos
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                data-testid="button-add-payment"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Proyecto</span>
                  <span className="font-medium" data-testid="text-payment-total">{formatCLP(project.totalValue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pagado</span>
                  <span className="font-medium text-primary" data-testid="text-payment-paid">{formatCLP(paymentsData?.totalPaid || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pendiente</span>
                  <span className="font-medium text-secondary" data-testid="text-payment-pending">{formatCLP(project.totalValue - (paymentsData?.totalPaid || 0))}</span>
                </div>
                <Progress 
                  value={Math.min(100, Math.max(0, project.totalValue > 0 ? ((paymentsData?.totalPaid || 0) / project.totalValue) * 100 : 0))} 
                  className="h-2"
                  data-testid="progress-payment"
                />
              </div>

              {showPaymentForm && (
                <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount" className="text-xs">Monto (CLP)</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Ej: 150000"
                      data-testid="input-payment-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-method" className="text-xs">Metodo</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                        <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                        <SelectItem value="TARJETA">Tarjeta</SelectItem>
                        <SelectItem value="OTRO">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-description" className="text-xs">Descripcion (opcional)</Label>
                    <Input
                      id="payment-description"
                      value={paymentDescription}
                      onChange={(e) => setPaymentDescription(e.target.value)}
                      placeholder="Ej: Anticipo 50%"
                      data-testid="input-payment-description"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => createPaymentMutation.mutate()}
                    disabled={!paymentAmount || createPaymentMutation.isPending}
                    data-testid="button-save-payment"
                  >
                    {createPaymentMutation.isPending ? "Guardando..." : "Registrar Pago"}
                  </Button>
                </div>
              )}

              {paymentsData?.payments && paymentsData.payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Historial de Pagos</p>
                  {paymentsData.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                      data-testid={`payment-item-${payment.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{formatCLP(payment.amount)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {payment.paymentMethod} - {formatDate(payment.paymentDate)}
                        </p>
                        {payment.description && (
                          <p className="text-xs text-muted-foreground truncate">{payment.description}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePaymentMutation.mutate(payment.id)}
                        disabled={deletePaymentMutation.isPending}
                        data-testid={`button-delete-payment-${payment.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {(!paymentsData?.payments || paymentsData.payments.length === 0) && !showPaymentForm && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No hay pagos registrados
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="glass-card" data-testid="card-admin-addons">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-chart-4" />
            Servicios Adicionales
          </CardTitle>
          <Button size="sm" onClick={() => setShowAddonForm(!showAddonForm)} data-testid="button-admin-new-addon">
            <Plus className="w-4 h-4 mr-1" /> Nuevo
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddonForm && (
            <div className="p-4 rounded-lg border border-[#4A7C34]/30 bg-gradient-to-br from-[#4A7C34]/5 to-transparent space-y-4">
              <div className="p-3 rounded-lg border border-[#4A7C34]/20 bg-[#4A7C34]/5">
                <button
                  type="button"
                  onClick={() => setShowAiSection(!showAiSection)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Sparkles className="w-4 h-4 text-[#4A7C34]" />
                  <Label className="text-sm font-semibold text-[#4A7C34] cursor-pointer">Crear con IA</Label>
                  <ChevronDown className={`w-4 h-4 text-[#4A7C34] ml-auto transition-transform ${showAiSection ? "rotate-180" : ""}`} />
                </button>
                {showAiSection && (
                  <div className="space-y-3 mt-3">
                    <p className="text-xs text-muted-foreground">Describe el servicio por texto o voz y la IA generara los items con precios estimados</p>
                    <Textarea
                      value={addonAiInput}
                      onChange={(e) => setAddonAiInput(e.target.value)}
                      placeholder="Ej: El cliente necesita un modulo de pagos con Mercado Pago, integración de facturación electronica y dashboard de ventas..."
                      className="min-h-[80px] max-h-[120px] text-sm"
                      data-testid="input-admin-addon-ai-description"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant={isAddonRecording ? "destructive" : "outline"}
                        onClick={isAddonRecording ? stopAddonRecording : startAddonRecording}
                        disabled={isAddonTranscribing}
                        data-testid="button-admin-addon-voice"
                      >
                        {isAddonTranscribing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : isAddonRecording ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                        {isAddonTranscribing ? "Transcribiendo..." : isAddonRecording ? "Detener" : "Dictar"}
                      </Button>
                      {isAddonRecording && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                          Grabando...
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={generateAddonItemsWithAI}
                        disabled={!addonAiInput.trim() || isAddonGenerating}
                        className="bg-[#4A7C34] hover:bg-[#3d6b2b] text-white ml-auto"
                        data-testid="button-admin-addon-generate-ai"
                      >
                        {isAddonGenerating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                        Generar con IA
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Titulo del servicio adicional</Label>
                  <Input value={addonTitle} onChange={(e) => setAddonTitle(e.target.value)} placeholder="Ej: Modulo de pagos online" data-testid="input-admin-addon-title" />
                </div>
                <div className="space-y-2">
                  <Label>Descripcion (opcional)</Label>
                  <Textarea value={addonDescription} onChange={(e) => setAddonDescription(e.target.value)} placeholder="Breve descripcion del servicio" className="min-h-[40px] max-h-[80px] text-sm" data-testid="input-admin-addon-desc" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#E86A30]" />
                    Items de Cotizacion
                  </Label>
                  <Button variant="ghost" size="sm" onClick={() => setAddonItems([...addonItems, { name: "", description: "", unitPrice: 0, quantity: 1 }])} data-testid="button-admin-addon-add-item">
                    <Plus className="w-3 h-3 mr-1" /> Agregar
                  </Button>
                </div>
                {addonItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <Label className="text-xs text-muted-foreground">Nombre</Label>}
                      <Input value={item.name} onChange={(e) => { const u = [...addonItems]; u[idx].name = e.target.value; setAddonItems(u); }} placeholder="Nombre" data-testid={`input-admin-addon-item-name-${idx}`} />
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <Label className="text-xs text-muted-foreground">Precio</Label>}
                      <Input type="number" value={item.unitPrice || ""} onChange={(e) => { const u = [...addonItems]; u[idx].unitPrice = parseInt(e.target.value) || 0; setAddonItems(u); }} placeholder="Precio" data-testid={`input-admin-addon-item-price-${idx}`} />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-xs text-muted-foreground">Cant.</Label>}
                      <Input type="number" value={item.quantity} onChange={(e) => { const u = [...addonItems]; u[idx].quantity = parseInt(e.target.value) || 1; setAddonItems(u); }} min={1} data-testid={`input-admin-addon-item-qty-${idx}`} />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {addonItems.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => setAddonItems(addonItems.filter((_, i) => i !== idx))}><X className="w-4 h-4 text-muted-foreground" /></Button>
                      )}
                    </div>
                  </div>
                ))}
                {addonItems.some((i) => i.unitPrice > 0) && (
                  <div className="text-right text-sm space-y-1 pt-2 border-t border-border">
                    <p className="text-muted-foreground">Subtotal: {formatCLP(addonItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</p>
                    {addonHasIVA && <p className="text-muted-foreground">IVA (19%): {formatCLP(Math.round(addonItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 0.19))}</p>}
                    <p className="font-bold text-[#E86A30]">Total: {formatCLP(addonItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) + (addonHasIVA ? Math.round(addonItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 0.19) : 0))}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={addonHasIVA} onChange={(e) => setAddonHasIVA(e.target.checked)} className="rounded" id="admin-addon-iva" data-testid="checkbox-admin-addon-iva" />
                <Label htmlFor="admin-addon-iva" className="text-sm cursor-pointer">Incluir IVA (19%)</Label>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowAddonForm(false); setAddonTitle(""); setAddonDescription(""); setAddonAiInput(""); setShowAiSection(true); setAddonItems([{ name: "", description: "", unitPrice: 0, quantity: 1 }]); }}>Cancelar</Button>
                <Button onClick={() => createAddonMutation.mutate()} disabled={!addonTitle.trim() || !addonItems.some((i) => i.name.trim() && i.unitPrice > 0) || createAddonMutation.isPending} className="bg-[#E86A30] hover:bg-[#d45e28] text-white" data-testid="button-admin-submit-addon">
                  {createAddonMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Crear Servicio Adicional
                </Button>
              </div>
            </div>
          )}

          {addons.length > 0 ? (
            <div className="space-y-4">
              {addons.map((addon, addonIdx) => {
                const aConfig = addonStatusConfig[addon.status] || addonStatusConfig.DRAFT;
                return (
                  <div key={addon.id} className="p-4 rounded-lg border-2 border-border/80 bg-card/50 space-y-3 relative" data-testid={`admin-addon-card-${addon.id}`}>
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-[#E86A30]/60" />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-foreground">{addon.title}</h4>
                          <Badge className={aConfig.className} variant="secondary">{aConfig.label}</Badge>
                          {addon.paidAt && (
                            <Badge className="bg-[#2E7D32]/20 text-[#4A7C34]" variant="secondary">Pagado</Badge>
                          )}
                        </div>
                        {addon.description && <p className="text-xs text-muted-foreground mt-1">{addon.description}</p>}
                      </div>
                      <p className="font-bold text-[#E86A30] whitespace-nowrap">{formatCLP(addon.total)}</p>
                    </div>
                    <div className="space-y-1">
                      {addon.items?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-muted/50">
                          <span className="text-muted-foreground">{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                          <span className="text-foreground">{formatCLP(item.total)}</span>
                        </div>
                      ))}
                    </div>
                    {addon.clientNote && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-[#E86A30]/50 pl-2">Nota del cliente: {addon.clientNote}</p>
                    )}
                    {addon.contractContent && (
                      <div className="border-t border-border pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const isOpen = showContractPreview === addon.contractContent;
                            setShowContractPreview(isOpen ? null : (addon.contractContent ?? null));
                            if (isOpen) setEditingContractId(null);
                          }}
                          className="text-xs"
                          data-testid={`button-admin-toggle-contract-${addon.id}`}
                        >
                          {showContractPreview === addon.contractContent ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                          {showContractPreview === addon.contractContent ? "Ocultar Contrato" : "Ver Mini-Contrato"}
                        </Button>
                        {showContractPreview === addon.contractContent && addon.contractContent && (
                          <div className="mt-2 space-y-3">
                            <div className="p-3 rounded-lg bg-muted/30 border border-border max-h-[400px] overflow-y-auto">
                              {addon.contractContent.split("---").map((section, si) => {
                                const sText = section.trim();
                                const renderedParts = sText.split(/(\*[^*\n]+\*)/g).map((part, pi) => {
                                  if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
                                    return <strong key={pi} className="font-semibold">{part.slice(1, -1)}</strong>;
                                  }
                                  return <span key={pi}>{part}</span>;
                                });
                                return (
                                <div key={si} className={si > 0 ? "mt-3 pt-3 border-t border-border/50" : ""}>
                                  <p className="text-xs text-foreground whitespace-pre-wrap">{renderedParts}</p>
                                </div>
                                );
                              })}
                            </div>
                            {(addon.status === "DRAFT" || addon.status === "SENT") && (
                              <div className="p-3 rounded-lg border border-[#4A7C34]/20 bg-[#4A7C34]/5 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-3 h-3 text-[#4A7C34]" />
                                  <span className="text-xs font-medium text-[#4A7C34]">Editar contrato con IA</span>
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    value={editingContractId === addon.id ? contractEditInput : ""}
                                    onChange={(e) => { setEditingContractId(addon.id); setContractEditInput(e.target.value); }}
                                    onFocus={() => setEditingContractId(addon.id)}
                                    placeholder="Ej: Cambiar el plazo a 10 dias, agregar clausula de confidencialidad..."
                                    className="text-xs h-8"
                                    data-testid={`input-admin-edit-contract-${addon.id}`}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => editAddonContract(addon.id, addon)}
                                    disabled={!contractEditInput.trim() || isEditingContract || editingContractId !== addon.id}
                                    className="bg-[#4A7C34] hover:bg-[#3d6b2b] text-white h-8 px-3 shrink-0"
                                    data-testid={`button-admin-edit-contract-${addon.id}`}
                                  >
                                    {isEditingContract && editingContractId === addon.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => generateAddonContract(addon.id, addon)}
                                    disabled={isGeneratingContract}
                                    className="text-xs text-muted-foreground h-6"
                                    data-testid={`button-admin-regen-contract-${addon.id}`}
                                  >
                                    <FileSignature className="w-3 h-3 mr-1" />
                                    Regenerar completo
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      await fetch(`/api/wmc/addons/${addon.id}/clear-contract`, { method: "POST" });
                                      queryClient.invalidateQueries({ queryKey: ["/api/wmc/projects", projectId, "addons"] });
                                      setShowContractPreview(null);
                                      toast({ title: "Contrato eliminado" });
                                    }}
                                    className="text-xs text-destructive hover:text-destructive/80 h-6"
                                    data-testid={`button-admin-clear-contract-${addon.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Borrar contrato
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(addon.status === "DRAFT" || addon.status === "SENT") && (
                        <>
                          {!addon.contractContent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateAddonContract(addon.id, addon)}
                              disabled={isGeneratingContract}
                              className="border-[#4A7C34]/30 text-[#4A7C34]"
                              data-testid={`button-admin-gen-contract-${addon.id}`}
                            >
                              {isGeneratingContract ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileSignature className="w-3 h-3 mr-1" />}
                              Generar Contrato
                            </Button>
                          )}
                          {addon.status === "DRAFT" && (
                            <Button size="sm" variant="outline" onClick={() => sendAddonMutation.mutate(addon.id)} disabled={sendAddonMutation.isPending} data-testid={`button-admin-send-addon-${addon.id}`}>
                              <Send className="w-3 h-3 mr-1" /> Enviar al Cliente
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteAddonMutation.mutate(addon.id)} disabled={deleteAddonMutation.isPending} data-testid={`button-admin-delete-addon-${addon.id}`}>
                            <Trash2 className="w-3 h-3 mr-1 text-destructive" /> Eliminar
                          </Button>
                        </>
                      )}
                      {addon.status === "APPROVED" && (
                        <Button
                          size="sm"
                          variant={addon.paidAt ? "outline" : "default"}
                          onClick={() => toggleAddonPaidMutation.mutate(addon.id)}
                          disabled={toggleAddonPaidMutation.isPending}
                          className={addon.paidAt ? "border-[#2E7D32]/30 text-[#4A7C34] hover:bg-[#2E7D32]/10" : "bg-[#2E7D32] hover:bg-[#256b29] text-white"}
                          data-testid={`button-admin-toggle-addon-paid-${addon.id}`}
                        >
                          {addon.paidAt ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Pagado</> : <><DollarSign className="w-3 h-3 mr-1" /> Marcar Pagado</>}
                        </Button>
                      )}
                      {(addon.status === "SENT" || addon.status === "APPROVED") && (
                        <Button size="sm" variant="ghost" onClick={() => handleCopyAddonLink(addon.tokenUrl)} data-testid={`button-admin-copy-addon-${addon.id}`}>
                          <Copy className="w-3 h-3 mr-1" /> Copiar Link
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !showAddonForm ? (
            <div className="text-center py-6">
              <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin servicios adicionales</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            Bitacora del Proyecto
          </CardTitle>
          <Button
            onClick={() => setShowLogForm(!showLogForm)}
            data-testid="button-add-log"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Entrada
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showLogForm && (
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="log-title">Titulo</Label>
                  <Input
                    id="log-title"
                    value={logTitle}
                    onChange={(e) => setLogTitle(e.target.value)}
                    placeholder="Ej: Avance en el diseño de la página principal"
                    data-testid="input-log-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="log-phase">Fase del Proyecto</Label>
                  <Select value={logPhase} onValueChange={setLogPhase}>
                    <SelectTrigger data-testid="select-log-phase">
                      <SelectValue placeholder="Selecciona la fase" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOrder.map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusConfig[status]?.label || status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-content">Descripcion</Label>
                <Textarea
                  id="log-content"
                  value={logContent}
                  onChange={(e) => setLogContent(e.target.value)}
                  placeholder="Describe el avance realizado..."
                  rows={4}
                  data-testid="input-log-content"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Imagenes (opcional)</Label>
                  <div className="space-y-2">
                    {uploadedImages.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uploadedImages.map((img, idx) => (
                          <div key={idx} className="relative">
                            <img
                              src={img.previewUrl}
                              alt={`Preview ${idx + 1}`}
                              className="w-16 h-16 object-cover rounded border border-border"
                            />
                            <button
                              type="button"
                              onClick={() => setUploadedImages(uploadedImages.filter((_, i) => i !== idx))}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
                            >
                              <X className="w-3 h-3 text-destructive-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {isUploadingImage && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Subiendo imagen...
                      </div>
                    )}
                    <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {uploadedImages.length > 0 ? "Agregar mas" : "Subir imagenes"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        disabled={isUploadingImage}
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setIsUploadingImage(true);
                            try {
                              const newImages: { objectPath: string; name: string; previewUrl: string }[] = [];
                              for (const file of Array.from(e.target.files)) {
                                const result = await uploadFile(file);
                                if (result) {
                                  newImages.push({
                                    objectPath: result.objectPath,
                                    name: file.name,
                                    previewUrl: result.objectPath,
                                  });
                                }
                              }
                              setUploadedImages([...uploadedImages, ...newImages]);
                            } catch (error) {
                              toast({
                                variant: "destructive",
                                title: "Error",
                                description: "No se pudieron subir las imagenes",
                              });
                            } finally {
                              setIsUploadingImage(false);
                            }
                          }
                        }}
                        data-testid="input-log-images"
                      />
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="log-video">Video URL (opcional)</Label>
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-muted-foreground" />
                    <Input
                      id="log-video"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=... o link de video"
                      data-testid="input-log-video"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Soporta YouTube, Vimeo, Loom u otros links de video
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLogForm(false);
                    setLogTitle("");
                    setLogContent("");
                    setLogPhase(project?.status || "MOCKUP");
                    setUploadedImages([]);
                    setVideoUrl("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => createLogMutation.mutate()}
                  disabled={!logTitle.trim() || !logContent.trim() || createLogMutation.isPending}
                  data-testid="button-save-log"
                >
                  {createLogMutation.isPending ? "Guardando..." : "Guardar Entrada"}
                </Button>
              </div>
            </div>
          )}

          {!showLogForm && projectLogs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pb-2">
              <span className="text-sm text-muted-foreground">Filtrar por fase:</span>
              <div className="flex items-center gap-1 flex-wrap">
                <Badge
                  variant={filterPhase === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setFilterPhase("all")}
                  data-testid="filter-all"
                >
                  Todas
                </Badge>
                {statusOrder.map((status) => {
                  const phaseConfig = statusConfig[status];
                  const hasLogs = projectLogs.some((log: any) => log.phase === status);
                  if (!hasLogs) return null;
                  return (
                    <Badge
                      key={status}
                      variant={filterPhase === status ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setFilterPhase(status)}
                      data-testid={`filter-${status.toLowerCase()}`}
                    >
                      {phaseConfig?.label || status}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {projectLogs.length === 0 && !showLogForm ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                No hay entradas en la bitacora
              </p>
              <p className="text-sm text-muted-foreground/70">
                Registra los avances del proyecto aquí
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {projectLogs
                .filter((log: any) => filterPhase === "all" || log.phase === filterPhase)
                .map((log: any) => {
                  const phaseConfig = statusConfig[log.phase as string];
                  const PhaseIcon = phaseConfig?.icon || FileText;
                  return (
                    <div
                      key={log.id}
                      className="p-4 rounded-lg border border-border bg-card/50"
                      data-testid={`log-entry-${log.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">{log.title}</h4>
                            {log.phase && (
                              <Badge variant="outline" className={`${phaseConfig?.bgColor} ${phaseConfig?.color} border-0 text-xs`}>
                                <PhaseIcon className="w-3 h-3 mr-1" />
                                {phaseConfig?.label || log.phase}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(log.createdAt)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {log.content}
                          </p>
                          {log.imageUrls && log.imageUrls.length > 0 && (
                            <div className="flex items-center gap-3 mt-3 flex-wrap">
                              {log.imageUrls.map((url: string, idx: number) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={url}
                                    alt={`Imagen ${idx + 1}`}
                                    className="w-20 h-20 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          {log.videoUrls && log.videoUrls.length > 0 && (
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              {log.videoUrls.map((url: string, idx: number) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline bg-primary/10 px-2 py-1 rounded"
                                >
                                  <Video className="w-3 h-3" />
                                  Ver Video {idx + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLogMutation.mutate(log.id)}
                          disabled={deleteLogMutation.isPending}
                          data-testid={`button-delete-log-${log.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
