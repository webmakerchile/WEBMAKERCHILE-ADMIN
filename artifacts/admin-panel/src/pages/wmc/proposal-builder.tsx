import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/wmc/ui/card";
import { Button } from "@/components/wmc/ui/button";
import { Input } from "@/components/wmc/ui/input";
import { Textarea } from "@/components/wmc/ui/textarea";
import { Badge } from "@/components/wmc/ui/badge";
import { Skeleton } from "@/components/wmc/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/wmc/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/wmc/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/wmc/ui/form";
import { useToast } from "@/hooks/wmc/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/wmc/queryClient";
import { Switch } from "@/components/wmc/ui/switch";
import { Label } from "@/components/wmc/ui/label";
import { Checkbox } from "@/components/wmc/ui/checkbox";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Package,
  Save,
  Send,
  FileText,
  Calculator,
  GripVertical,
  Users,
  Receipt,
  Percent,
  Wrench,
  Calendar,
  Ticket,
  FileSignature,
  ChevronDown,
  ChevronUp,
  Eye,
  Sparkles,
  Loader2,
  Mic,
  Square,
  MessageSquare,
  Copy,
  Check,
  RefreshCw,
  Zap,
  ListChecks,
  Mail,
  Target,
  Search,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/wmc/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/wmc/ui/collapsible";
import { ScrollArea } from "@/components/wmc/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/wmc/ui/popover";
import type { Service, Client, ProposalItem, AgreementTemplate, ServiceAgreement, CompanySettings } from "@shared/schema";
import { cn } from "@/lib/utils";

function ClientSearchSelect({ clients, value, onChange, testId }: { clients: Client[] | undefined; value: string; onChange: (id: string) => void; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = clients?.find(c => c.id === value);

  const filtered = (clients || []).filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.companyName || "").toLowerCase().includes(q) ||
      (c.contactName || "").toLowerCase().includes(q) ||
      (c.contactEmail || "").toLowerCase().includes(q) ||
      (c.contactPhone || "").toLowerCase().includes(q) ||
      (c.rut || "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 justify-between font-normal h-12 px-4 border-border/60 hover:border-primary/40 bg-card/50 hover:bg-card transition-all"
          data-testid={testId || "select-client"}
        >
          {selected ? (
            <span className="flex items-center gap-3 truncate">
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2E7D32]/20 to-[#4A7C34]/20 text-[#4A7C34] flex items-center justify-center text-xs font-bold shrink-0">
                {selected.companyName.charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-medium">{selected.companyName} <span className="text-muted-foreground font-normal ml-1">- {selected.contactName}</span></span>
            </span>
          ) : (
            <span className="text-muted-foreground text-base">Buscar o seleccionar cliente...</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-border/50 rounded-xl" align="start">
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar por nombre, empresa, email, RUT..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-none focus-visible:ring-1"
              data-testid="input-search-client"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No se encontraron clientes
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(client => (
                <button
                  key={client.id}
                  type="button"
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors hover:bg-accent/50 ${client.id === value ? "bg-[#2E7D32]/10 text-[#4A7C34]" : ""}`}
                  onClick={() => { onChange(client.id); setOpen(false); }}
                  data-testid={`option-client-${client.id}`}
                >
                  <span className="w-8 h-8 rounded-full bg-[#2E7D32]/15 text-[#4A7C34] flex items-center justify-center text-xs font-bold shrink-0">
                    {client.companyName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{client.companyName}</div>
                    <div className="text-xs text-muted-foreground truncate">{client.contactName}{client.contactEmail ? ` · ${client.contactEmail}` : ""}</div>
                  </div>
                  {client.id === value && <Check className="w-4 h-4 text-[#4A7C34] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

const DEFAULT_IVA_RATE = 0.19;

interface ProposalItemLocal {
  id: string;
  serviceId?: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

const clientFormSchema = z.object({
  companyName: z.string().min(1, "Requerido"),
  rut: z.string().optional(),
  contactName: z.string().min(1, "Requerido"),
  contactEmail: z.string().email("Email invalido"),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
});

// NUEVO DISEÑO TARJETA DE SERVICIO
function ServiceCard({ service, onAdd }: { service: Service; onAdd: () => void }) {
  return (
    <div
      className="relative overflow-hidden p-5 rounded-2xl border border-card-border/60 bg-card/40 hover:bg-card/70 hover:border-[#E86A30]/40 hover:shadow-[0_16px_40px_-20px_rgba(232,106,48,0.45)] cursor-pointer transition-all duration-300 group"
      onClick={onAdd}
      data-testid={`service-card-${service.id}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-28 h-28 rounded-full bg-[#E86A30]/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/25 to-[#E86A30]/15 border border-card-border/50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-1 group-hover:text-[#E86A30] transition-colors">{service.name}</h4>
            <p className="text-xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-[#E86A30] to-[#F0A861]">{formatCLP(service.basePrice)}</p>
          </div>
        </div>
        <Button size="icon" variant="ghost" className="flex-shrink-0 rounded-full h-9 w-9 bg-muted/50 group-hover:bg-[#E86A30] group-hover:text-white transition-colors">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// NUEVO DISEÑO FILA DE ITEMS
function ProposalItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: ProposalItemLocal;
  onUpdate: (updates: Partial<ProposalItemLocal>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-5 rounded-xl border border-border/50 bg-card/30 group hover:border-border transition-colors">
      <div className="pt-2 text-muted-foreground/40 hover:text-muted-foreground cursor-grab transition-colors">
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Input
              value={item.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Nombre del servicio o entregable"
              className="font-semibold text-base h-10 bg-background/50 border-transparent hover:border-border focus:bg-background transition-all"
              data-testid={`input-item-name-${item.id}`}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all rounded-full h-8 w-8"
            onClick={onRemove}
            data-testid={`button-remove-item-${item.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        <Textarea
          value={item.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Descripción detallada del item (opcional)..."
          className="resize-y text-sm min-h-[80px] bg-background/50 border-transparent hover:border-border focus:bg-background transition-all"
          rows={3}
          data-testid={`input-item-description-${item.id}`}
        />
        <div className="grid grid-cols-2 sm:grid-cols-[100px_1fr_auto] gap-4 items-end bg-background/30 p-3 rounded-lg border border-border/30">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cant.</span>
            <Input
              type="number"
              value={item.quantity}
              onChange={(e) => {
                const qty = Math.max(1, parseInt(e.target.value) || 1);
                onUpdate({ quantity: qty, total: qty * item.unitPrice });
              }}
              className="w-full text-center"
              min={1}
              data-testid={`input-item-quantity-${item.id}`}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Precio Unit.</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                value={item.unitPrice}
                onChange={(e) => {
                  const price = Math.max(0, parseInt(e.target.value) || 0);
                  onUpdate({ unitPrice: price, total: item.quantity * price });
                }}
                className="pl-8 w-full"
                data-testid={`input-item-price-${item.id}`}
              />
            </div>
          </div>
          <div className="text-right col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 sm:pl-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Total</p>
            <p className="text-lg font-bold text-foreground">{formatCLP(item.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (clientId: string) => void;
}) {
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      companyName: "",
      rut: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      address: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof clientFormSchema>) =>
      apiRequest("POST", "/api/wmc/clients", data),
    onSuccess: async (response) => {
      const client = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/clients"] });
      toast({ title: "Cliente creado" });
      form.reset();
      onOpenChange(false);
      onCreated(client.id);
    },
    onError: () => {
      toast({ title: "Error al crear cliente", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Nuevo Cliente</DialogTitle>
          <DialogDescription>Añade rápidamente a tu base de datos para presupuestar.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa o Marca</FormLabel>
                  <FormControl>
                    <Input placeholder="Empresa S.A." {...field} data-testid="input-new-company" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacto</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan Pérez" {...field} data-testid="input-new-contact" className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RUT</FormLabel>
                    <FormControl>
                      <Input placeholder="12.345.678-9" {...field} data-testid="input-new-rut" className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="contacto@empresa.cl" {...field} data-testid="input-new-email" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-6">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="glow-primary px-6" data-testid="button-create-client-modal">
                {mutation.isPending ? "Creando..." : "Crear Cliente"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ProposalWithItems {
  id: string;
  clientId: string;
  status: string;
  subtotal: number;
  iva: number;
  total: number;
  notes: string | null;
  hasIVA: number;
  paymentModality: string | null;
  installmentCount: number | null;
  customPaymentTerms: string | null;
  maintenanceType: string | null;
  monthlyMaintenance: number | null;
  discount: number | null;
  couponId: string | null;
  includeContract: number;
  tokenUrl: string | null;
  validUntil: string | null;
  items: ProposalItem[];
}

export default function ProposalBuilder({ embedded, embeddedEditId, onBack }: { embedded?: boolean; embeddedEditId?: string | null; onBack?: () => void } = {}) {
  const [location, navigate] = useLocation();
  const isCloserMode = embedded || location.startsWith("/closer");
  const basePath = isCloserMode ? "/closer" : "/admin";
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const preselectedClientId = embedded ? null : urlParams.get("clientId");
  const editId = embedded ? (embeddedEditId || null) : urlParams.get("edit");

  const { toast } = useToast();
  const [proposalId, setProposalId] = useState<string | null>(editId);
  const [selectedClientId, setSelectedClientId] = useState<string>(preselectedClientId || "");
  const [items, setItems] = useState<ProposalItemLocal[]>([]);
  const [notes, setNotes] = useState("");
  const [newClientDialogOpen, setNewClientDialogOpen] = useState(false);
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!editId);

  const [hasIva, setHasIva] = useState(true);
  const [paymentModality, setPaymentModality] = useState<"STANDARD" | "MILESTONES" | "FULL_ADVANCE" | "INSTALLMENTS" | "CUSTOM">("STANDARD");
  const [installmentCount, setInstallmentCount] = useState(3);
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [maintenanceType, setMaintenanceType] = useState<"NONE" | "TO_BE_DEFINED" | "CUSTOM">("NONE");
  const [monthlyMaintenance, setMonthlyMaintenance] = useState(0);
  const [validUntil, setValidUntil] = useState<string>("");

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [validatedCoupon, setValidatedCoupon] = useState<{
    id: string;
    code: string;
    discountPercent: number;
    includesFreeMeeting: boolean;
    originalDocumentUrl?: string;
  } | null>(null);
  const [couponError, setCouponError] = useState("");

  // Contract state
  const [contractEnabled, setContractEnabled] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [contractContent, setContractContent] = useState<{
    alcance: string;
    entregables: string;
    plazos: string;
    condiciones: string;
    garantía: string;
    confidencialidad: string;
    extras: string;
  }>({
    alcance: "",
    entregables: "",
    plazos: "",
    condiciones: "",
    garantía: "",
    confidencialidad: "",
    extras: "",
  });
  const [contractExpanded, setContractExpanded] = useState(false);
  const [existingAgreementId, setExistingAgreementId] = useState<string | null>(null);
  const [existingAgreementToken, setExistingAgreementToken] = useState<string | null>(null);
  const [existingAgreementStatus, setExistingAgreementStatus] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [correctingAi, setCorrectingAi] = useState(false);
  const [itemsCorrectionText, setItemsCorrectionText] = useState("");
  const [correctingItems, setCorrectingItems] = useState(false);

  // Mensajería State
  const [whatsappMsgText, setWhatsappMsgText] = useState("");
  const [whatsappMsgLoading, setWhatsappMsgLoading] = useState(false);
  const [whatsappGeneratedMsg, setWhatsappGeneratedMsg] = useState("");
  const [whatsappMsgCopied, setWhatsappMsgCopied] = useState(false);

  const [coldMsgText, setColdMsgText] = useState("");
  const [coldMsgLoading, setColdMsgLoading] = useState(false);
  const [coldGeneratedMsg, setColdGeneratedMsg] = useState("");
  const [coldMsgCopied, setColdMsgCopied] = useState(false);

  const [emailMsgText, setEmailMsgText] = useState("");
  const [emailMsgLoading, setEmailMsgLoading] = useState(false);
  const [emailGeneratedSubject, setEmailGeneratedSubject] = useState("");
  const [emailGeneratedBody, setEmailGeneratedBody] = useState("");
  const [emailMsgCopied, setEmailMsgCopied] = useState(false);

  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillText, setAutoFillText] = useState("");
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFillChecklist, setAutoFillChecklist] = useState({
    items: false,
    prices: false,
    payment: false,
    maintenance: false,
    timeline: false,
    notes: false,
  });

  const [aiItemsOpen, setAiItemsOpen] = useState(false);
  const [aiItemsText, setAiItemsText] = useState("");
  const [aiItemsLoading, setAiItemsLoading] = useState(false);
  const [aiGeneratedItems, setAiGeneratedItems] = useState<{name: string, description: string, unitPrice: number, quantity: number, selected: boolean}[]>([]);

  // Micrófono / Grabación State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingTarget, setRecordingTarget] = useState<"aiItems" | "itemsCorrection" | "contractCorrection" | "whatsappMsg" | "coldMsg" | "emailMsg" | "autoFill">("aiItems");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTargetRef = useRef<"aiItems" | "itemsCorrection" | "contractCorrection" | "whatsappMsg" | "coldMsg" | "emailMsg" | "autoFill">("aiItems");

  const getRecordingMimeType = useCallback(() => {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const type of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }, []);

  const cleanupRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingTime(0);
  }, []);

  const startRecording = useCallback(async (target: "aiItems" | "itemsCorrection" | "contractCorrection" | "whatsappMsg" | "emailMsg" | "autoFill" | "coldMsg" = "aiItems") => {
    const mimeType = getRecordingMimeType();
    if (!mimeType) {
      toast({ title: "Tu navegador no soporta grabacion de audio. Usa Chrome o Firefox.", variant: "destructive" });
      return;
    }

    try {
      setRecordingTarget(target);
      recordingTargetRef.current = target;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingTime(0);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size === 0) return;

        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve(base64);
            };
          });
          reader.readAsDataURL(audioBlob);
          const audioData = await base64Promise;

          const response = await apiRequest("POST", "/api/wmc/proposals/transcribe-audio", {
            audioData,
            mimeType: mimeType.split(";")[0],
          });
          const data = await response.json();
          if (data.text) {
            if (recordingTargetRef.current === "itemsCorrection") {
              setItemsCorrectionText((prev) => prev ? prev + " " + data.text : data.text);
            } else if (recordingTargetRef.current === "autoFill") {
              setAutoFillText((prev) => prev ? prev + " " + data.text : data.text);
            } else if (recordingTargetRef.current === "contractCorrection") {
              setCorrectionText((prev) => prev ? prev + " " + data.text : data.text);
            } else if (recordingTargetRef.current === "whatsappMsg") {
              setWhatsappMsgText((prev) => prev ? prev + " " + data.text : data.text);
            } else if (recordingTargetRef.current === "coldMsg") {
              setColdMsgText((prev) => prev ? prev + " " + data.text : data.text);
            } else if (recordingTargetRef.current === "emailMsg") {
              setEmailMsgText((prev) => prev ? prev + " " + data.text : data.text);
            } else {
              setAiItemsText((prev) => prev ? prev + "\n\n" + data.text : data.text);
            }
            toast({ title: "Audio transcrito correctamente" });
          }
        } catch {
          toast({ title: "Error al transcribir el audio", variant: "destructive" });
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      toast({ title: "No se pudo acceder al microfono", variant: "destructive" });
    }
  }, [toast, getRecordingMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const { data: services, isLoading: loadingServices } = useQuery<Service[]>({ queryKey: ["/api/wmc/services"] });
  const { data: clients, isLoading: loadingClients } = useQuery<Client[]>({ queryKey: ["/api/wmc/clients"] });
  const { data: agreementTemplates } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/wmc/agreement-templates"] });
  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ["/api/wmc/settings"] });

  const ivaRate = companySettings?.ivaRate != null ? companySettings.ivaRate / 100 : DEFAULT_IVA_RATE;

  const { data: existingAgreement } = useQuery<ServiceAgreement | null>({
    queryKey: ["/api/wmc/service-agreements/proposal", editId],
    enabled: !!editId,
  });

  const { data: existingProposal } = useQuery<ProposalWithItems>({
    queryKey: ["/api/wmc/proposals", editId],
    enabled: !!editId,
  });

  useEffect(() => {
    if (existingProposal && !isLoaded) {
      setSelectedClientId(existingProposal.clientId);
      setNotes(existingProposal.notes || "");
      setHasIva(existingProposal.hasIVA === 1);
      setPaymentModality((existingProposal.paymentModality as "STANDARD" | "MILESTONES" | "FULL_ADVANCE" | "INSTALLMENTS" | "CUSTOM") || "STANDARD");
      setInstallmentCount(existingProposal.installmentCount || 3);
      setCustomPaymentTerms(existingProposal.customPaymentTerms || "");
      setMaintenanceType((existingProposal.maintenanceType as "NONE" | "TO_BE_DEFINED" | "CUSTOM") || "NONE");
      setMonthlyMaintenance(existingProposal.monthlyMaintenance || 0);
      setValidUntil(existingProposal.validUntil ? new Date(existingProposal.validUntil).toISOString().split('T')[0] : "");

      if (existingProposal.items) {
        const localItems: ProposalItemLocal[] = existingProposal.items.map((item) => ({
          id: item.id,
          serviceId: item.serviceId || undefined,
          name: item.name,
          description: item.description || "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        }));
        setItems(localItems);
      }

      if (existingProposal.couponId) {
        fetch(`/api/wmc/coupons/${existingProposal.couponId}`)
          .then(res => res.json())
          .then(coupon => {
            if (coupon && !coupon.error) {
              setValidatedCoupon({
                id: coupon.id,
                code: coupon.code,
                discountPercent: coupon.discountPercent,
                includesFreeMeeting: coupon.includesFreeMeeting === 1,
                originalDocumentUrl: coupon.originalDocumentUrl,
              });
              setCouponCode(coupon.code);
            }
          })
          .catch(() => {});
      }

      if (existingProposal.includeContract !== undefined) {
        setContractEnabled(existingProposal.includeContract === 1);
      }

      setIsLoaded(true);
    }
  }, [existingProposal, isLoaded]);

  useEffect(() => {
    if (existingAgreement) {
      setContractEnabled(true);
      setExistingAgreementId(existingAgreement.id);
      setExistingAgreementToken(existingAgreement.tokenUrl);
      setExistingAgreementStatus(existingAgreement.status);
      setSelectedTemplateId(existingAgreement.templateId || "");
      try {
        const parsed = JSON.parse(existingAgreement.content);
        setContractContent({
          alcance: parsed.alcance || "",
          entregables: parsed.entregables || "",
          plazos: parsed.plazos || "",
          condiciones: parsed.condiciones || "",
          garantía: parsed.garantía || "",
          confidencialidad: parsed.confidencialidad || "",
          extras: parsed.extras || "",
        });
      } catch {
        setContractContent({
          alcance: existingAgreement.content,
          entregables: "", plazos: "", condiciones: "", garantía: "", confidencialidad: "", extras: "",
        });
      }
    }
  }, [existingAgreement]);

  // Funciones de IA (Mantenidas intactas para no romper lógica, solo UI cambia)
  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = agreementTemplates?.find(t => t.id === templateId);
    if (template) {
      try {
        const parsed = JSON.parse(template.content);
        if (parsed.sections && Array.isArray(parsed.sections)) {
          const sectionMap: Record<string, string> = {};
          parsed.sections.forEach((section: { title: string; content: string }) => {
            const titleLower = section.title.toLowerCase();
            if (titleLower.includes("alcance") || titleLower.includes("objeto")) sectionMap.alcance = (sectionMap.alcance || "") + section.content + "\n\n";
            else if (titleLower.includes("proceso") || titleLower.includes("etapa") || titleLower.includes("trabajo") || titleLower.includes("entregable")) sectionMap.entregables = (sectionMap.entregables || "") + section.content + "\n\n";
            else if (titleLower.includes("plazo") || titleLower.includes("vigencia") || titleLower.includes("ejecucion") || titleLower.includes("entrega")) sectionMap.plazos = (sectionMap.plazos || "") + section.content + "\n\n";
            else if (titleLower.includes("pago") || titleLower.includes("monto") || titleLower.includes("modalidad") || titleLower.includes("condicion") || titleLower.includes("costo")) sectionMap.condiciones = (sectionMap.condiciones || "") + section.content + "\n\n";
            else if (titleLower.includes("garantía") || titleLower.includes("garantia") || titleLower.includes("bug")) sectionMap.garantía = (sectionMap.garantía || "") + section.content + "\n\n";
            else if (titleLower.includes("confidencial") || titleLower.includes("propiedad") || titleLower.includes("intelectual")) sectionMap.confidencialidad = (sectionMap.confidencialidad || "") + section.content + "\n\n";
            else if (titleLower.includes("servicio") || titleLower.includes("incluido") || titleLower.includes("responsabilidad") || titleLower.includes("detalle")) sectionMap.extras = (sectionMap.extras || "") + section.content + "\n\n";
          });
          setContractContent({
            alcance: (sectionMap.alcance || "").trim(),
            entregables: (sectionMap.entregables || "").trim(),
            plazos: (sectionMap.plazos || "").trim(),
            condiciones: (sectionMap.condiciones || "").trim(),
            garantía: (sectionMap.garantía || "").trim(),
            confidencialidad: (sectionMap.confidencialidad || "").trim(),
            extras: (sectionMap.extras || "").trim(),
          });
        } else {
          setContractContent({
            alcance: parsed.alcance || "",
            entregables: parsed.entregables || "",
            plazos: parsed.plazos || "",
            condiciones: parsed.condiciones || "",
            garantía: parsed.garantía || "",
            confidencialidad: parsed.confidencialidad || "",
            extras: parsed.extras || "",
          });
        }
        toast({ title: `Plantilla "${template.name}" aplicada` });
      } catch {
        toast({ title: "Error al aplicar plantilla", variant: "destructive" });
      }
    }
  };

  const generateContractWithAI = async () => {
    setGeneratingAi(true);
    try {
      let body: Record<string, unknown>;
      if (proposalId) {
        body = { proposalId };
      } else {
        body = {
          clientId: selectedClientId,
          items: items.map(i => ({ name: i.name, description: i.description, total: i.total })),
          total, paymentModality, customPaymentTerms, installmentCount,
        };
      }
      const response = await apiRequest("POST", "/api/wmc/service-agreements/generate-ai-content", body);
      const data = await response.json();
      if (data.sections && Array.isArray(data.sections)) {
        const sectionMap: Record<string, string> = {};
        data.sections.forEach((section: { title: string; content: string }) => {
          const titleLower = section.title.toLowerCase();
          if (titleLower.includes("alcance") || titleLower.includes("objeto")) sectionMap.alcance = (sectionMap.alcance || "") + section.content + "\n\n";
          else if (titleLower.includes("proceso") || titleLower.includes("etapa") || titleLower.includes("trabajo")) sectionMap.entregables = (sectionMap.entregables || "") + section.content + "\n\n";
          else if (titleLower.includes("plazo") || titleLower.includes("cronograma") || titleLower.includes("ejecucion") || titleLower.includes("entrega")) sectionMap.plazos = (sectionMap.plazos || "") + section.content + "\n\n";
          else if (titleLower.includes("pago") || titleLower.includes("facturación") || titleLower.includes("condicion") || titleLower.includes("costo")) sectionMap.condiciones = (sectionMap.condiciones || "") + section.content + "\n\n";
          else if (titleLower.includes("garantía") || titleLower.includes("soporte") || titleLower.includes("bug")) sectionMap.garantía = (sectionMap.garantía || "") + section.content + "\n\n";
          else if (titleLower.includes("confidencial") || titleLower.includes("propiedad") || titleLower.includes("intelectual")) sectionMap.confidencialidad = (sectionMap.confidencialidad || "") + section.content + "\n\n";
          else if (titleLower.includes("servicio") || titleLower.includes("incluido") || titleLower.includes("detalle")) sectionMap.extras = (sectionMap.extras || "") + section.content + "\n\n";
        });
        setContractContent({
          alcance: (sectionMap.alcance || "").trim(),
          entregables: (sectionMap.entregables || "").trim(),
          plazos: (sectionMap.plazos || "").trim(),
          condiciones: (sectionMap.condiciones || "").trim(),
          garantía: (sectionMap.garantía || "").trim(),
          confidencialidad: (sectionMap.confidencialidad || "").trim(),
          extras: (sectionMap.extras || "").trim(),
        });
        setContractExpanded(true);
        toast({ title: "Contrato generado con IA exitosamente" });
      }
    } catch (error) {
      toast({ title: "Error al generar contrato con IA", variant: "destructive" });
    } finally {
      setGeneratingAi(false);
    }
  };

  const correctItemsWithAI = async () => {
    if (!itemsCorrectionText.trim() || items.length === 0) return;
    setCorrectingItems(true);
    try {
      const response = await apiRequest("POST", "/api/wmc/proposals/correct-items-ai", {
        items: items.map((item) => ({ name: item.name, description: item.description, unitPrice: item.unitPrice, quantity: item.quantity })),
        correction: itemsCorrectionText,
      });
      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        const newItems: ProposalItemLocal[] = data.items.map(
          (aiItem: { name: string; description: string; unitPrice: number; quantity: number }, idx: number) => {
            const matchByName = items.find((orig) => orig.name.toLowerCase().trim() === aiItem.name.toLowerCase().trim());
            const matchByIdx = items[idx];
            const matched = matchByName || matchByIdx;
            return {
              id: matched?.id || `ai-corrected-${Date.now()}-${idx}`,
              serviceId: matched?.serviceId,
              name: aiItem.name,
              description: aiItem.description,
              unitPrice: aiItem.unitPrice,
              quantity: aiItem.quantity,
              total: aiItem.unitPrice * aiItem.quantity,
            };
          },
        );
        setItems(newItems);
        setItemsCorrectionText("");
        toast({ title: "Items corregidos exitosamente" });
      }
    } catch (error) {
      toast({ title: "Error al corregir items", variant: "destructive" });
    } finally {
      setCorrectingItems(false);
    }
  };

  const correctContractWithAI = async () => {
    if (!correctionText.trim()) return;
    setCorrectingAi(true);
    try {
      const response = await apiRequest("POST", "/api/wmc/service-agreements/correct-ai-content", { sections: contractContent, correction: correctionText });
      const data = await response.json();
      if (data.sections && Array.isArray(data.sections)) {
        const sectionMap: Record<string, string> = {};
        data.sections.forEach((section: { title: string; content: string }) => {
          const titleLower = section.title.toLowerCase();
          if (titleLower.includes("alcance") || titleLower.includes("objeto")) sectionMap.alcance = (sectionMap.alcance || "") + section.content + "\n\n";
          else if (titleLower.includes("proceso") || titleLower.includes("etapa") || titleLower.includes("trabajo")) sectionMap.entregables = (sectionMap.entregables || "") + section.content + "\n\n";
          else if (titleLower.includes("plazo") || titleLower.includes("cronograma") || titleLower.includes("ejecucion") || titleLower.includes("entrega")) sectionMap.plazos = (sectionMap.plazos || "") + section.content + "\n\n";
          else if (titleLower.includes("pago") || titleLower.includes("facturación") || titleLower.includes("condicion") || titleLower.includes("costo")) sectionMap.condiciones = (sectionMap.condiciones || "") + section.content + "\n\n";
          else if (titleLower.includes("garantía") || titleLower.includes("soporte") || titleLower.includes("bug")) sectionMap.garantía = (sectionMap.garantía || "") + section.content + "\n\n";
          else if (titleLower.includes("confidencial") || titleLower.includes("propiedad") || titleLower.includes("intelectual")) sectionMap.confidencialidad = (sectionMap.confidencialidad || "") + section.content + "\n\n";
          else if (titleLower.includes("servicio") || titleLower.includes("incluido") || titleLower.includes("detalle")) sectionMap.extras = (sectionMap.extras || "") + section.content + "\n\n";
        });
        setContractContent({
          alcance: (sectionMap.alcance || contractContent.alcance).trim(),
          entregables: (sectionMap.entregables || contractContent.entregables).trim(),
          plazos: (sectionMap.plazos || contractContent.plazos).trim(),
          condiciones: (sectionMap.condiciones || contractContent.condiciones).trim(),
          garantía: (sectionMap.garantía || contractContent.garantía).trim(),
          confidencialidad: (sectionMap.confidencialidad || contractContent.confidencialidad).trim(),
          extras: (sectionMap.extras || contractContent.extras).trim(),
        });
        setCorrectionText("");
        toast({ title: "Correcciones aplicadas exitosamente" });
      }
    } catch (error) {
      toast({ title: "Error al aplicar correcciones", variant: "destructive" });
    } finally {
      setCorrectingAi(false);
    }
  };

  const generateItemsWithAI = async () => {
    if (!aiItemsText.trim()) return;
    setAiItemsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-items-ai", { text: aiItemsText, clientId: selectedClientId || undefined });
      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        setAiGeneratedItems(data.items.map((item: any) => ({ ...item, selected: true })));
      }
    } catch (error) {
      toast({ title: "Error al generar items", variant: "destructive" });
    } finally {
      setAiItemsLoading(false);
    }
  };

  const addAIItems = () => {
    const selected = aiGeneratedItems.filter(i => i.selected);
    const newItems = selected.map(item => ({
      id: crypto.randomUUID(),
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.unitPrice * item.quantity,
    }));
    setItems([...items, ...newItems]);
    setAiItemsOpen(false);
    setAiItemsText("");
    setAiGeneratedItems([]);
    toast({ title: `${selected.length} items agregados` });
  };

  const generateWhatsappMessage = async () => {
    if (items.length === 0) return;
    setWhatsappMsgLoading(true);
    try {
      const clientName = clients?.find((c: Client) => c.id === selectedClientId)?.contactName || "";
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-whatsapp-message", {
        items: items.map((item) => ({ name: item.name, description: item.description })),
        clientName, additionalContext: whatsappMsgText.trim() || undefined,
      });
      const data = await response.json();
      if (data.message) setWhatsappGeneratedMsg(data.message);
    } catch (error) {
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
    if (items.length === 0) return;
    setColdMsgLoading(true);
    try {
      const client = clients?.find((c: Client) => c.id === selectedClientId);
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-cold-outreach", {
        items: items.map((item) => ({ name: item.name, description: item.description })),
        clientName: client?.contactName || "", companyName: client?.companyName || "", additionalContext: coldMsgText.trim() || undefined,
      });
      const data = await response.json();
      if (data.message) setColdGeneratedMsg(data.message);
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

  const generateEmailMessage = async () => {
    if (items.length === 0) return;
    setEmailMsgLoading(true);
    try {
      const client = clients?.find((c: Client) => c.id === selectedClientId);
      const response = await apiRequest("POST", "/api/wmc/proposals/generate-email-message", {
        items: items.map((item) => ({ name: item.name, description: item.description })),
        clientName: client?.contactName || "", companyName: client?.companyName || "", additionalContext: emailMsgText.trim() || undefined,
      });
      const data = await response.json();
      if (data.body) {
        setEmailGeneratedSubject(data.subject || "");
        setEmailGeneratedBody(data.body);
      }
    } catch {
      toast({ title: "Error al generar correo", variant: "destructive" });
    } finally {
      setEmailMsgLoading(false);
    }
  };

  const copyEmailMessage = async () => {
    try {
      const fullEmail = emailGeneratedSubject ? `Asunto: ${emailGeneratedSubject}\n\n${emailGeneratedBody}` : emailGeneratedBody;
      await navigator.clipboard.writeText(fullEmail);
      setEmailMsgCopied(true);
      toast({ title: "Correo copiado al portapapeles" });
      setTimeout(() => setEmailMsgCopied(false), 2000);
    } catch {
      toast({ title: "Error al copiar", variant: "destructive" });
    }
  };

  const autoFillFromAudio = async () => {
    if (!autoFillText.trim()) return;
    setAutoFillLoading(true);
    try {
      const response = await apiRequest("POST", "/api/wmc/proposals/auto-fill-from-audio", { text: autoFillText });
      const data = await response.json();

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const newItems: ProposalItemLocal[] = data.items
          .filter((item: any) => item && typeof item.name === "string" && item.name.trim())
          .map((item: any) => ({
            id: crypto.randomUUID(),
            name: String(item.name || "").trim(),
            description: String(item.description || "").trim(),
            quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
            unitPrice: typeof item.unitPrice === "number" ? Math.round(item.unitPrice) : 0,
            total: (typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1) * (typeof item.unitPrice === "number" ? Math.round(item.unitPrice) : 0),
          }));
        if (newItems.length > 0) setItems(newItems);
      }

      if (data.paymentModality && ["STANDARD", "MILESTONES", "FULL_ADVANCE", "INSTALLMENTS", "CUSTOM"].includes(data.paymentModality)) setPaymentModality(data.paymentModality as any);
      if (data.installmentCount && typeof data.installmentCount === "number") setInstallmentCount(data.installmentCount);
      if (data.customPaymentTerms && typeof data.customPaymentTerms === "string") setCustomPaymentTerms(data.customPaymentTerms);
      if (typeof data.hasIva === "boolean") setHasIva(data.hasIva);
      if (data.maintenanceType && ["NONE", "TO_BE_DEFINED", "CUSTOM"].includes(data.maintenanceType)) setMaintenanceType(data.maintenanceType as any);
      if (data.monthlyMaintenance && typeof data.monthlyMaintenance === "number") setMonthlyMaintenance(data.monthlyMaintenance);
      if (data.validUntil && typeof data.validUntil === "string") setValidUntil(data.validUntil);
      if (data.notes && typeof data.notes === "string") setNotes(data.notes);
      if (data.includeContract === true) setContractEnabled(true);

      setAutoFillOpen(false);
      setAutoFillText("");
      toast({ title: "Presupuesto completado con IA" });
    } catch (error) {
      toast({ title: "Error al procesar", variant: "destructive" });
    } finally {
      setAutoFillLoading(false);
    }
  };

  const itemsSubtotal = items.reduce((sum, item) => sum + item.total, 0);
  const effectiveMaintenance = maintenanceType === "CUSTOM" ? monthlyMaintenance : 0;
  const subtotal = itemsSubtotal;
  const paymentDiscountRate = paymentModality === "FULL_ADVANCE" ? 0.10 : 0;
  const paymentDiscount = Math.round(subtotal * paymentDiscountRate);
  const couponDiscountRate = validatedCoupon ? validatedCoupon.discountPercent / 100 : 0;
  const couponDiscount = Math.round((subtotal - paymentDiscount) * couponDiscountRate);
  const discount = paymentDiscount + couponDiscount;
  const afterDiscount = subtotal - discount;
  const iva = hasIva ? Math.round(afterDiscount * ivaRate) : 0;
  const total = afterDiscount + iva;

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponError("");
    try {
      const response = await fetch(`/api/wmc/coupons/validate/${couponCode.trim().toUpperCase()}`);
      const data = await response.json();
      if (data.valid) {
        setValidatedCoupon(data.coupon);
        setCouponCode(data.coupon.code);
        toast({ title: "Cupon aplicado", description: `${data.coupon.discountPercent}% de descuento${data.coupon.includesFreeMeeting ? " + reunión gratis" : ""}`, className: "bg-[#256b29] border-[#256b29] text-white" });
      } else {
        setCouponError(data.error || "Cupon no valido");
        setValidatedCoupon(null);
      }
    } catch (error) {
      setCouponError("Error al validar cupon");
      setValidatedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setValidatedCoupon(null); setCouponCode(""); setCouponError("");
  };

  const addServiceToProposal = (service: Service) => {
    const newItem: ProposalItemLocal = { id: crypto.randomUUID(), serviceId: service.id, name: service.name, description: service.description || "", quantity: 1, unitPrice: service.basePrice, total: service.basePrice };
    setItems([...items, newItem]);
    toast({ title: `${service.name} agregado` });
  };

  const addCustomItem = () => {
    const newItem: ProposalItemLocal = { id: crypto.randomUUID(), name: "", description: "", quantity: 1, unitPrice: 0, total: 0 };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, updates: Partial<ProposalItemLocal>) => setItems(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  const removeItem = (id: string) => setItems(items.filter((item) => item.id !== id));

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const proposalData = {
        clientId: selectedClientId, status, subtotal: afterDiscount, iva, total, notes,
        hasIVA: hasIva ? 1 : 0, paymentModality, installmentCount: paymentModality === "INSTALLMENTS" ? installmentCount : null,
        customPaymentTerms: paymentModality === "CUSTOM" ? customPaymentTerms : null,
        maintenanceType, monthlyMaintenance: maintenanceType === "CUSTOM" ? monthlyMaintenance : 0,
        discount, validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        couponId: validatedCoupon?.id || null, includeContract: contractEnabled ? 1 : 0,
      };

      let proposal;
      if (proposalId) {
        const response = await apiRequest("PATCH", `/api/wmc/proposals/${proposalId}`, proposalData);
        proposal = await response.json();
        await apiRequest("DELETE", `/api/wmc/proposals/${proposalId}/items`);
      } else {
        const response = await apiRequest("POST", "/api/wmc/proposals", proposalData);
        proposal = await response.json();
      }

      for (const item of items) {
        await apiRequest("POST", "/api/wmc/proposal-items", {
          proposalId: proposal.id, serviceId: item.serviceId || null, name: item.name, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total,
        });
      }

      let latestAgreementToken = existingAgreementToken;

      if (contractEnabled && selectedClientId) {
        const client = clients?.find(c => c.id === selectedClientId);
        const agreementData = {
          proposalId: proposal.id, templateId: selectedTemplateId || null,
          clientCompanyName: client?.companyName || "", clientRut: client?.rut || null,
          clientRepresentativeName: client?.contactName || "", clientRepresentativeRut: null,
          content: JSON.stringify(contractContent), validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        };

        if (existingAgreementId) {
          if (existingAgreementStatus !== "SIGNED") {
            try {
              const patchResponse = await apiRequest("PATCH", `/api/wmc/service-agreements/${existingAgreementId}`, { ...agreementData, status: status === "SENT" ? "PENDING_SIGNATURE" : "DRAFT" });
              if (!patchResponse.ok) throw new Error("Agreement not found");
            } catch (error) {
              const agreementResponse = await apiRequest("POST", "/api/wmc/service-agreements", agreementData);
              const newAgreement = await agreementResponse.json();
              setExistingAgreementId(newAgreement.id); setExistingAgreementToken(newAgreement.tokenUrl); latestAgreementToken = newAgreement.tokenUrl;
            }
          }
        } else {
          const agreementResponse = await apiRequest("POST", "/api/wmc/service-agreements", agreementData);
          const newAgreement = await agreementResponse.json();
          setExistingAgreementId(newAgreement.id); setExistingAgreementToken(newAgreement.tokenUrl); latestAgreementToken = newAgreement.tokenUrl;
        }
      }

      return { proposal, agreementToken: latestAgreementToken };
    },
    onSuccess: (result, status) => {
      const { proposal, agreementToken } = result;
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wmc/service-agreements"] });

      if (whatsappGeneratedMsg && proposal.tokenUrl) {
        const baseUrl = "https://www.webmakerlatam.com";
        let updatedMsg = whatsappGeneratedMsg
          .replace(/\[LINK_PROPUESTA\]/g, `${baseUrl}/propuesta/${proposal.tokenUrl}`)
          .replace(/\[LINK_CONTRATO\]/g, agreementToken ? `${baseUrl}/contrato/${agreementToken}` : "[Contrato se generará al guardar]");
        setWhatsappGeneratedMsg(updatedMsg);
      }

      if (!proposalId && status === "DRAFT") {
        setProposalId(proposal.id);
        window.history.replaceState(null, "", `${basePath}/proposal-builder?edit=${proposal.id}`);
        toast({ title: "Borrador guardado" });
      } else if (status === "DRAFT") {
        toast({ title: "Borrador actualizado" });
      } else {
        toast({ title: "Presupuesto guardado exitosamente" });
        if (embedded && onBack) { onBack(); } else { navigate(isCloserMode ? `/closer?section=proposals` : `/admin/proposals/${proposal.id}`); }
      }
    },
    onError: () => {
      toast({ title: "Error al guardar presupuesto", variant: "destructive" });
    },
  });

  const canSave = selectedClientId && items.length > 0;

  return (
    // NUEVO DISEÑO: ESPACIADO Y ESTRUCTURA GENERAL
    <div className="relative isolate space-y-10 px-6 sm:px-12 py-10 sm:py-16 pb-24 lg:pb-12 max-w-[1600px] mx-auto">

      {/* ATMÓSFERA CINEMATOGRÁFICA DE MARCA */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="cinematic-blob cinematic-blob-orange" style={{ width: "38rem", height: "38rem", top: "-12rem", right: "-10rem", opacity: 0.1 }} />
        <div className="cinematic-blob cinematic-blob-green" style={{ width: "34rem", height: "34rem", top: "45%", left: "-14rem", opacity: 0.08 }} />
      </div>

      {/* HEADER SECTION */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-card-border/40 pb-8">
        <div className="flex items-center gap-5">
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-2xl border border-card-border/50 bg-card/50 backdrop-blur-sm hover:bg-card hover:border-primary/40 transition-all shrink-0"
            onClick={() => { if (embedded && onBack) { onBack(); } else { navigate(isCloserMode ? "/closer?section=proposals" : "/admin/proposals"); } }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-[#E86A30] to-transparent" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E86A30]">Propuesta comercial</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-display tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-foreground via-foreground to-[#E86A30]">
              {proposalId ? "Editar Presupuesto" : "Nuevo Presupuesto"}
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg mt-2 max-w-xl">
              {proposalId ? "Modifica y ajusta tu propuesta comercial." : "Construye una propuesta comercial imbatible."}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAutoFillOpen(true)}
          className="group relative overflow-hidden bg-gradient-to-r from-[#E86A30] to-[#F0894B] text-white border-0 shadow-[0_12px_34px_-10px_rgba(232,106,48,0.65)] hover:shadow-[0_16px_44px_-10px_rgba(232,106,48,0.8)] transition-all hover:-translate-y-0.5 rounded-2xl px-6 py-6 h-auto text-base font-semibold w-full sm:w-auto"
          data-testid="button-super-audio"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <Zap className="w-5 h-5 mr-3 fill-white" />
          Completar con Audio AI
        </Button>
      </div>

      {/* BARRA DE ACCIONES — siempre accesible arriba, sin necesidad de bajar */}
      <div className="sticky top-0 z-30 -mx-6 sm:-mx-12 px-6 sm:px-12 py-3.5 bg-background/70 backdrop-blur-xl border-b border-card-border/40 flex items-center justify-between gap-4 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.7)]">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] sm:text-xs uppercase tracking-wide text-muted-foreground font-semibold shrink-0">Total</span>
          <span className="text-lg sm:text-2xl font-black font-display tabular-nums truncate text-transparent bg-clip-text bg-gradient-to-r from-[#E86A30] to-[#4A7C34]" data-testid="text-top-total">{formatCLP(total)}</span>
          {!canSave && (
            <span className="hidden sm:inline text-xs text-destructive font-medium ml-2">Falta cliente o items</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-3 sm:px-4 font-semibold border-primary/30 text-primary hover:bg-primary/5 rounded-xl"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate("SENT")}
            data-testid="button-top-mark-sent"
          >
            <Send className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Marcar Enviado</span>
          </Button>
          <Button
            size="sm"
            className="h-10 px-3 sm:px-5 font-bold glow-primary rounded-xl"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate("DRAFT")}
            data-testid="button-top-save-draft"
          >
            <Save className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{saveMutation.isPending ? "Guardando..." : "Guardar Borrador"}</span>
            <span className="sm:hidden">{saveMutation.isPending ? "..." : "Guardar"}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">

        {/* COLUMNA IZQUIERDA: CONTENIDO PRINCIPAL */}
        <div className="xl:col-span-2 space-y-10">

          {/* CLIENTE CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_24px_55px_-24px_rgba(232,106,48,0.22)]">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 sm:px-8 py-5">
              <CardTitle className="text-xl font-display flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                Selección de Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <ClientSearchSelect
                    clients={clients}
                    value={selectedClientId}
                    onChange={setSelectedClientId}
                    testId="select-client"
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-12 px-6 rounded-lg border-border/60 hover:bg-muted/50"
                  onClick={() => setNewClientDialogOpen(true)}
                  data-testid="button-add-client"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Crear Nuevo
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* CATÁLOGO DE SERVICIOS CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_24px_55px_-24px_rgba(232,106,48,0.22)]">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 sm:px-8 py-5">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-xl font-display flex items-center gap-3">
                  <Package className="w-6 h-6 text-primary" />
                  Catálogo de Servicios Rápidos
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8">
              {loadingServices ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-[90px] rounded-xl" />
                  ))}
                </div>
              ) : services && services.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      onAdd={() => addServiceToProposal(service)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border/50">
                  <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg">No hay servicios en tu catálogo</p>
                  <Button
                    variant="outline"
                    className="mt-6"
                    onClick={() => { if (embedded && onBack) { onBack(); } else { navigate(isCloserMode ? "/closer?section=services" : "/admin/services"); } }}
                    data-testid="button-go-to-services"
                  >
                    Ir a Configurar Servicios
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ITEMS DEL PRESUPUESTO CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_24px_55px_-24px_rgba(232,106,48,0.22)]">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 sm:px-8 py-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <CardTitle className="text-xl font-display flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  Estructura del Presupuesto
                </CardTitle>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button 
                    variant="outline" 
                    className="bg-gradient-to-r from-[#E86A30]/10 to-[#E86A30]/5 hover:from-[#E86A30]/20 hover:to-[#E86A30]/10 border-[#E86A30]/30 text-[#E86A30] font-medium"
                    onClick={() => setAiItemsOpen(true)}
                    data-testid="button-generate-items-ai"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generar Items (IA)
                  </Button>
                  <Button variant="outline" onClick={addCustomItem} data-testid="button-add-custom-item" className="bg-background">
                    <Plus className="w-4 h-4 mr-2" />
                    Fila Manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 sm:p-8">
              {items.length > 0 ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    {items.map((item) => (
                      <ProposalItemRow
                        key={item.id}
                        item={item}
                        onUpdate={(updates) => updateItem(item.id, updates)}
                        onRemove={() => removeItem(item.id)}
                      />
                    ))}
                  </div>

                  {/* SECCIÓN CORRECCIÓN IA DE ITEMS */}
                  <div className="rounded-xl border border-[#E86A30]/30 bg-gradient-to-br from-[#E86A30]/5 to-transparent p-5 mt-8 shadow-inner">
                    <Label className="text-base font-semibold flex items-center gap-2 text-[#E86A30] mb-3">
                      <Sparkles className="w-5 h-5" />
                      Ajustes Rápidos con IA
                    </Label>
                    <p className="text-sm text-muted-foreground mb-4">Pídele a la IA que modifique precios, agregue filas o cambie descripciones masivamente.</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Textarea
                          value={itemsCorrectionText}
                          onChange={(e) => setItemsCorrectionText(e.target.value)}
                          placeholder='Ej: "Sube el precio del primer item a $800.000" o "Agrega integración con WhatsApp como nuevo item de 150k"'
                          className="resize-y text-sm min-h-[60px] pr-12 bg-background border-[#E86A30]/20 focus-visible:ring-[#E86A30]/50"
                          rows={2}
                          disabled={correctingItems || (isRecording && recordingTarget === "itemsCorrection")}
                          data-testid="textarea-items-correction"
                        />
                        <div className="absolute top-2 right-2">
                           <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (isRecording && recordingTarget === "itemsCorrection") {
                                  stopRecording();
                                } else {
                                  startRecording("itemsCorrection");
                                }
                              }}
                              disabled={correctingItems || isTranscribing || (isRecording && recordingTarget !== "itemsCorrection")}
                              className="h-8 w-8 hover:bg-[#E86A30]/10"
                              data-testid="button-mic-items-correction"
                            >
                              {isTranscribing && recordingTarget === "itemsCorrection" ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#E86A30]" />
                              ) : isRecording && recordingTarget === "itemsCorrection" ? (
                                <Square className="w-4 h-4 text-red-500 fill-red-500" />
                              ) : (
                                <Mic className="w-4 h-4 text-[#E86A30]" />
                              )}
                            </Button>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={correctItemsWithAI}
                        disabled={correctingItems || !itemsCorrectionText.trim()}
                        className="sm:self-stretch bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 text-white border-0 hover:scale-[1.02] transition-transform"
                        data-testid="button-apply-items-correction"
                      >
                        {correctingItems ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Aplicando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Aplicar
                          </>
                        )}
                      </Button>
                    </div>
                    {(isRecording && recordingTarget === "itemsCorrection") && (
                      <p className="text-sm font-medium text-red-500 mt-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Grabando... {recordingTime}s
                      </p>
                    )}
                    {(isTranscribing && recordingTarget === "itemsCorrection") && (
                      <p className="text-sm text-[#E86A30] mt-2 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Transcribiendo audio...</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 border-2 border-dashed border-border/60 bg-muted/10 rounded-xl transition-colors hover:bg-muted/20">
                  <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-border/50">
                     <FileText className="w-8 h-8 text-muted-foreground/60" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Presupuesto Vacío</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Comienza agregando servicios desde tu catálogo arriba, o añade una fila manual.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CONTRATO DE SERVICIO CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_24px_55px_-24px_rgba(232,106,48,0.22)]">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 sm:px-8 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-xl font-display flex items-center gap-3">
                  <FileSignature className="w-6 h-6 text-primary" />
                  Acuerdo Legal (Contrato)
                </CardTitle>
                <div className="flex items-center gap-3 bg-background px-4 py-2 rounded-lg border border-border/50 shadow-sm">
                  <Label htmlFor="contract-enabled" className="text-sm font-semibold cursor-pointer">
                    Habilitar Contrato
                  </Label>
                  <Switch
                    id="contract-enabled"
                    checked={contractEnabled}
                    onCheckedChange={(checked) => {
                      setContractEnabled(checked);
                      if (checked) setContractExpanded(true);
                    }}
                    data-testid="switch-contract-enabled"
                  />
                </div>
              </div>
            </CardHeader>
            {contractEnabled && (
              <CardContent className="p-6 sm:p-8 space-y-8">
                {existingAgreementStatus === "SIGNED" && (
                  <div className="flex items-center gap-3 rounded-xl border border-[#4A7C34]/40 bg-[#4A7C34]/10 p-4 text-[#4A7C34]">
                    <Check className="w-5 h-5 shrink-0" />
                    <span className="font-medium text-sm">Este contrato ya fue <strong>firmado</strong> por el cliente y ha quedado bloqueado para modificaciones.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-foreground">Cargar Plantilla Base</Label>
                    <Select value={selectedTemplateId} onValueChange={applyTemplate} disabled={existingAgreementStatus === "SIGNED"}>
                      <SelectTrigger className="h-12 bg-muted/20" data-testid="select-contract-template">
                        <SelectValue placeholder="Seleccionar formato legal..." />
                      </SelectTrigger>
                      <SelectContent>
                        {agreementTemplates?.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    onClick={generateContractWithAI}
                    disabled={generatingAi || (!selectedClientId || items.length === 0)}
                    className="h-12 w-full bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 hover:from-[#d45e28] hover:to-[#d45e28]/80 text-white border-0 shadow-md"
                    data-testid="button-generate-ai-contract"
                  >
                    {generatingAi ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Escribiendo Contrato...</>
                    ) : (
                      <><Sparkles className="w-5 h-5 mr-2" /> Redactar Contrato Inteligente</>
                    )}
                  </Button>
                </div>

                {(!selectedClientId || items.length === 0) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 bg-muted/30 p-3 rounded-lg border border-border/50">
                    <Users className="w-4 h-4" /> La IA necesita que selecciones un cliente y agregues items para redactar el contrato.
                  </p>
                )}

                {/* CORRECCIÓN IA DEL CONTRATO */}
                {(contractContent.alcance || contractContent.entregables || contractContent.plazos || contractContent.condiciones || contractContent.garantía || contractContent.confidencialidad || contractContent.extras) && (
                  <div className="rounded-xl border border-[#E86A30]/30 bg-gradient-to-br from-[#E86A30]/5 to-transparent p-5 shadow-inner">
                    <Label className="text-base font-semibold flex items-center gap-2 text-[#E86A30] mb-3">
                      <Sparkles className="w-5 h-5" />
                      Refinar Contrato con IA
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Textarea
                          value={correctionText}
                          onChange={(e) => setCorrectionText(e.target.value)}
                          placeholder='Ej: "Agrega en la garantía que el soporte técnico dura 6 meses en lugar de 3"'
                          className="resize-y text-sm min-h-[60px] pr-12 bg-background border-[#E86A30]/20 focus-visible:ring-[#E86A30]/50"
                          rows={2}
                          disabled={correctingAi || (isRecording && recordingTarget === "contractCorrection")}
                          data-testid="textarea-contract-correction"
                        />
                        <div className="absolute top-2 right-2">
                           <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (isRecording && recordingTarget === "contractCorrection") stopRecording();
                                else startRecording("contractCorrection");
                              }}
                              disabled={correctingAi || isTranscribing || (isRecording && recordingTarget !== "contractCorrection")}
                              className="h-8 w-8 hover:bg-[#E86A30]/10"
                            >
                              {isTranscribing && recordingTarget === "contractCorrection" ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#E86A30]" />
                              ) : isRecording && recordingTarget === "contractCorrection" ? (
                                <Square className="w-4 h-4 text-red-500 fill-red-500" />
                              ) : (
                                <Mic className="w-4 h-4 text-[#E86A30]" />
                              )}
                            </Button>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={correctContractWithAI}
                        disabled={correctingAi || !correctionText.trim()}
                        className="sm:self-stretch bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 text-white border-0"
                      >
                        {correctingAi ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando...</> : <><Sparkles className="w-4 h-4 mr-2" /> Refinar</>}
                      </Button>
                    </div>
                  </div>
                )}

                <Collapsible open={contractExpanded} onOpenChange={setContractExpanded} className="border border-border/60 rounded-xl overflow-hidden bg-background">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between h-14 px-6 rounded-none hover:bg-muted/30 font-semibold text-base">
                      <span className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        Editor Manual de Cláusulas
                      </span>
                      {contractExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="p-6 border-t border-border/50">
                    <Tabs defaultValue="alcance" className="w-full space-y-6">
                      <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto gap-2 bg-transparent p-0">
                        <TabsTrigger value="alcance" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Alcance</TabsTrigger>
                        <TabsTrigger value="entregables" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Proceso</TabsTrigger>
                        <TabsTrigger value="plazos" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Plazos</TabsTrigger>
                        <TabsTrigger value="condiciones" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Pago</TabsTrigger>
                      </TabsList>

                      <div className="bg-muted/10 p-1 rounded-xl border border-border/40">
                        <TabsContent value="alcance" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.alcance} onChange={(e) => setContractContent(prev => ({ ...prev, alcance: e.target.value }))} placeholder="Describe el alcance del proyecto, objetivos y funcionalidades principales..." className="min-h-[250px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                        <TabsContent value="entregables" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.entregables} onChange={(e) => setContractContent(prev => ({ ...prev, entregables: e.target.value }))} placeholder="Etapas del proyecto: analisis, diseño, desarrollo, QA, entrega..." className="min-h-[250px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                        <TabsContent value="plazos" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.plazos} onChange={(e) => setContractContent(prev => ({ ...prev, plazos: e.target.value }))} placeholder="Fechas estimadas, hitos y cronograma..." className="min-h-[250px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                        <TabsContent value="condiciones" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.condiciones} onChange={(e) => setContractContent(prev => ({ ...prev, condiciones: e.target.value }))} placeholder="Modalidad de pago, montos, fechas de cobro..." className="min-h-[250px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                      </div>
                    </Tabs>

                    <Tabs defaultValue="garantía" className="w-full space-y-6 mt-8">
                      <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 h-auto gap-2 bg-transparent p-0">
                        <TabsTrigger value="garantía" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Garantía</TabsTrigger>
                        <TabsTrigger value="confidencialidad" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Confidencialidad</TabsTrigger>
                        <TabsTrigger value="extras" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20 py-2.5 rounded-lg">Servicios Extra</TabsTrigger>
                      </TabsList>

                      <div className="bg-muted/10 p-1 rounded-xl border border-border/40">
                        <TabsContent value="garantía" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.garantía} onChange={(e) => setContractContent(prev => ({ ...prev, garantía: e.target.value }))} placeholder="Periodo de garantía, soporte post-entrega, correcciones..." className="min-h-[200px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                        <TabsContent value="confidencialidad" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.confidencialidad} onChange={(e) => setContractContent(prev => ({ ...prev, confidencialidad: e.target.value }))} placeholder="Clausulas de confidencialidad y proteccion de datos..." className="min-h-[200px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                        <TabsContent value="extras" className="m-0 focus-visible:ring-0">
                          <Textarea value={contractContent.extras} onChange={(e) => setContractContent(prev => ({ ...prev, extras: e.target.value }))} placeholder="Detalle de servicios contratados con precios..." className="min-h-[200px] resize-y border-0 focus-visible:ring-0 text-base leading-relaxed bg-transparent" />
                        </TabsContent>
                      </div>
                    </Tabs>
                  </CollapsibleContent>
                </Collapsible>

                {/* Vista previa del contrato — siempre disponible mientras haya contenido */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-[#2E7D32]/10 border border-[#2E7D32]/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#2E7D32]/20 flex items-center justify-center shrink-0">
                      <FileSignature className="w-5 h-5 text-[#2E7D32]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#256b29] dark:text-[#4A7C34]">
                        {existingAgreementToken ? "Contrato Asignado" : "Vista previa del contrato"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {existingAgreementToken
                          ? "Se guardará y enviará junto con el presupuesto."
                          : "Revisa cómo se verá antes de guardarlo."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => setContractPreviewOpen(true)}
                      className="border-[#2E7D32]/30 hover:bg-[#2E7D32]/10 text-[#2E7D32]"
                      data-testid="button-preview-contract"
                    >
                      <Eye className="w-4 h-4 mr-2" /> Vista Previa
                    </Button>
                    {existingAgreementToken && (
                      <Button
                        variant="outline"
                        onClick={() => window.open(`/contrato/${existingAgreementToken}`, "_blank")}
                        className="border-[#2E7D32]/30 hover:bg-[#2E7D32]/10 text-[#2E7D32]"
                        data-testid="button-open-contract-public"
                      >
                        <FileText className="w-4 h-4 mr-2" /> Abrir página pública
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* NOTAS CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 py-4">
              <CardTitle className="text-lg font-display">Notas Adicionales</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condiciones, comentarios o información extra visible para el cliente..."
                className="resize-none min-h-[120px] text-base leading-relaxed border-border/60"
                rows={4}
              />
            </CardContent>
          </Card>
        </div>

        {/* COLUMNA DERECHA: STICKY SUMMARY & OPCIONES */}
        <div className="xl:col-span-1 space-y-8">

          {/* PANEL DE RESUMEN (STICKY) */}
          <Card className="relative rounded-3xl overflow-hidden border border-card-border/70 border-t-4 border-t-[#E86A30] bg-card/70 backdrop-blur-xl shadow-[0_28px_70px_-28px_rgba(0,0,0,0.85)] sticky top-6 z-10">
            <CardHeader className="relative px-6 py-5 border-b border-card-border/50 bg-gradient-to-r from-[#E86A30]/10 via-card/0 to-transparent">
              <CardTitle className="text-xl font-display flex items-center gap-2 text-foreground">
                <Calculator className="w-6 h-6 text-primary" />
                Resumen de Propuesta
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-base">
                  <span className="text-muted-foreground">Subtotal Items ({items.length})</span>
                  <span className="text-foreground font-semibold">{formatCLP(itemsSubtotal)}</span>
                </div>
                {paymentDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#2E7D32] font-medium flex items-center gap-1.5"><Percent className="w-3.5 h-3.5"/> Anticipo (-10%)</span>
                    <span className="text-[#2E7D32] font-bold">-{formatCLP(paymentDiscount)}</span>
                  </div>
                )}
                {couponDiscount > 0 && validatedCoupon && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[#2E7D32] font-medium flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5"/> Cupón {validatedCoupon.code}</span>
                    <span className="text-[#2E7D32] font-bold">-{formatCLP(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-base border-t border-border/50 pt-4">
                  <span className="text-muted-foreground font-medium">Subtotal Neto</span>
                  <span className="text-foreground font-bold">{formatCLP(afterDiscount)}</span>
                </div>
                {hasIva && (
                  <div className="flex justify-between items-center text-base">
                    <span className="text-muted-foreground">IVA ({Math.round(ivaRate * 100)}%)</span>
                    <span className="text-foreground font-medium">{formatCLP(iva)}</span>
                  </div>
                )}

                <div className="relative overflow-hidden rounded-2xl p-5 mt-4 border border-[#E86A30]/30 bg-gradient-to-br from-[#E86A30]/15 via-card/30 to-[#4A7C34]/15 shadow-[0_0_45px_-14px_rgba(232,106,48,0.45)]">
                  <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-[#E86A30]/20 blur-2xl" />
                  <div className="relative flex justify-between items-end">
                    <span className="text-foreground font-bold text-lg mb-1">Total Final</span>
                    <span className="text-4xl font-black font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#E86A30] to-[#4A7C34]" data-testid="text-total">
                      {formatCLP(total)}
                    </span>
                  </div>
                </div>
              </div>

              {effectiveMaintenance > 0 && (
                <div className="p-4 rounded-xl border border-[#E86A30]/30 bg-gradient-to-br from-[#E86A30]/10 to-transparent">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-[#E86A30] flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> Mantenimiento
                    </span>
                    <span className="text-sm font-black text-[#E86A30]">{formatCLP(effectiveMaintenance)}/mes</span>
                  </div>
                  <p className="text-xs text-[#E86A30]/80 leading-relaxed font-medium">
                    Mes 1 gratuito. Desde el mes 2 se cobra este monto recurrente. NO se suma al total de arriba.
                  </p>
                </div>
              )}

              {maintenanceType === "TO_BE_DEFINED" && (
                <div className="p-4 rounded-xl border border-muted-foreground/30 bg-muted/10">
                  <span className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                    <Wrench className="w-4 h-4" /> Mant. Mensual: Por Definir
                  </span>
                  <p className="text-xs text-muted-foreground mt-2">Mes 1 gratuito. El monto se acordará posteriormente.</p>
                </div>
              )}

              <div className="space-y-4 pt-4 border-t border-border/50">
                <Button
                  className="w-full h-14 text-lg font-bold glow-primary rounded-xl"
                  disabled={!canSave || saveMutation.isPending}
                  onClick={() => saveMutation.mutate("DRAFT")}
                >
                  <Save className="w-5 h-5 mr-2" />
                  {saveMutation.isPending ? "Guardando..." : "Guardar Borrador"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14 text-base font-semibold border-primary/20 hover:bg-primary/5 text-primary rounded-xl"
                  disabled={!canSave || saveMutation.isPending}
                  onClick={() => saveMutation.mutate("SENT")}
                >
                  <Send className="w-5 h-5 mr-2" />
                  Guardar y Marcar Enviado
                </Button>
                {!canSave && (
                  <p className="text-sm text-destructive text-center font-medium bg-destructive/10 p-2 rounded-lg">
                    Falta cliente o agregar items.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* OPCIONES DE PAGO CARD */}
          <Card className="relative overflow-hidden rounded-2xl border border-card-border/70 bg-card/60 backdrop-blur-xl shadow-[0_20px_50px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-primary/40">
            <CardHeader className="relative border-b border-card-border/50 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
              <CardTitle className="text-lg font-display flex items-center gap-3">
                <Receipt className="w-5 h-5 text-primary" />
                Configuración Comercial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8">

              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center shadow-sm">
                     <Percent className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                     <Label htmlFor="has-iva" className="text-base font-semibold cursor-pointer">Impuestos</Label>
                     <p className="text-xs text-muted-foreground">Incluir IVA ({Math.round(ivaRate * 100)}%) al total</p>
                  </div>
                </div>
                <Switch id="has-iva" checked={hasIva} onCheckedChange={setHasIva} className="scale-125" />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-foreground">Modalidad de Pago</Label>
                <Select value={paymentModality} onValueChange={(v) => setPaymentModality(v as typeof paymentModality)}>
                  <SelectTrigger className="h-12 bg-muted/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">50% Anticipo / 50% Entrega</SelectItem>
                    <SelectItem value="MILESTONES">40% / 40% / 20% (Por Hitos)</SelectItem>
                    <SelectItem value="FULL_ADVANCE">100% Anticipado (-10% Descuento)</SelectItem>
                    <SelectItem value="INSTALLMENTS">Pago en Cuotas Fijas</SelectItem>
                    <SelectItem value="CUSTOM">Condiciones Personalizadas</SelectItem>
                  </SelectContent>
                </Select>

                {paymentModality === "FULL_ADVANCE" && (
                  <div className="bg-[#2E7D32]/10 border border-[#2E7D32]/30 text-[#2E7D32] p-3 rounded-lg text-sm font-medium flex items-center gap-2">
                    <Check className="w-4 h-4" /> Descuento del 10% automático aplicado al total.
                  </div>
                )}

                {paymentModality === "INSTALLMENTS" && (
                  <div className="space-y-3 pt-3 p-4 bg-muted/10 rounded-xl border border-border/50">
                    <Label className="text-sm font-semibold">Número de Cuotas</Label>
                    <Select value={installmentCount.toString()} onValueChange={(v) => setInstallmentCount(parseInt(v))}>
                      <SelectTrigger className="h-11 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 Cuotas Mensuales</SelectItem>
                        <SelectItem value="3">3 Cuotas Mensuales</SelectItem>
                        <SelectItem value="4">4 Cuotas Mensuales</SelectItem>
                        <SelectItem value="5">5 Cuotas Mensuales</SelectItem>
                        <SelectItem value="6">6 Cuotas Mensuales</SelectItem>
                        <SelectItem value="12">12 Cuotas Mensuales</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="bg-background p-3 rounded-lg border border-border/50 text-center">
                       <span className="text-sm text-muted-foreground block mb-1">Valor referencial por cuota:</span>
                       <span className="text-lg font-bold">{formatCLP(Math.ceil(total / installmentCount))}</span>
                    </div>
                  </div>
                )}

                {paymentModality === "CUSTOM" && (
                  <div className="pt-2">
                    <Textarea
                      value={customPaymentTerms}
                      onChange={(e) => setCustomPaymentTerms(e.target.value)}
                      placeholder="Ej: 30% firma, 30% diseño, 40% paso a producción."
                      className="resize-none min-h-[100px] text-base"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-6 border-t border-border/50">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-primary" /> Cupón de Descuento Promocional
                </Label>
                {validatedCoupon ? (
                  <div className="flex items-center justify-between p-4 bg-[#2E7D32]/10 border border-[#2E7D32]/40 rounded-xl shadow-inner">
                    <div>
                      <p className="font-mono font-bold text-lg text-[#2E7D32] tracking-wider">{validatedCoupon.code}</p>
                      <p className="text-sm text-[#4A7C34] font-medium mt-1">
                        {validatedCoupon.discountPercent}% OFF {validatedCoupon.includesFreeMeeting && " + Asesoría Gratis"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={removeCoupon} className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-white">
                      Remover
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Input
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                      placeholder="Ej: WM-VERANO26"
                      className="font-mono h-12 uppercase"
                    />
                    <Button variant="secondary" onClick={validateCoupon} disabled={couponLoading || !couponCode.trim()} className="h-12 px-6 font-semibold">
                      {couponLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Validar"}
                    </Button>
                  </div>
                )}
                {couponError && <p className="text-sm text-destructive font-medium mt-2">{couponError}</p>}
              </div>

              <div className="space-y-3 pt-6 border-t border-border/50">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-primary" /> Plan de Mantenimiento y Hosting
                </Label>
                <Select value={maintenanceType} onValueChange={(v) => setMaintenanceType(v as typeof maintenanceType)}>
                  <SelectTrigger className="h-12 bg-muted/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sin Mantenimiento (Solo entrega)</SelectItem>
                    <SelectItem value="TO_BE_DEFINED">Monto a definir después</SelectItem>
                    <SelectItem value="CUSTOM">Plan Mensual Fijo</SelectItem>
                  </SelectContent>
                </Select>
                {maintenanceType === "CUSTOM" && (
                  <div className="flex items-center gap-3 pt-2">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                      <Input
                        type="number"
                        value={monthlyMaintenance}
                        onChange={(e) => setMonthlyMaintenance(Math.max(0, parseInt(e.target.value) || 0))}
                        className="pl-8 h-12 text-lg font-bold"
                      />
                    </div>
                    <span className="text-muted-foreground font-medium w-16">/ mes</span>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-6 border-t border-border/50">
                <Label htmlFor="validUntil" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Validez de la Propuesta
                </Label>
                <div className="flex gap-3">
                  <Input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="h-12 flex-1"
                  />
                  {validUntil && (
                    <Button variant="outline" onClick={() => setValidUntil("")} className="h-12 px-4 text-muted-foreground hover:text-destructive">
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>

          {/* HERRAMIENTAS DE MENSAJERÍA (WHATSAPP / EMAIL) */}
          <Card className="border-[#E86A30]/30 shadow-md rounded-2xl overflow-hidden bg-gradient-to-b from-background to-muted/20">
            <CardHeader className="bg-gradient-to-r from-[#E86A30]/10 to-[#4A7C34]/10 border-b border-border/30 px-6 py-5">
              <CardTitle className="text-lg font-display flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#E86A30]" />
                Asistente de Cierre (Ventas)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <Tabs defaultValue="whatsapp" className="w-full">
                  <TabsList className="w-full grid grid-cols-3 rounded-none h-14 border-b border-border/50 bg-transparent p-0">
                    <TabsTrigger value="whatsapp" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#25D366] data-[state=active]:text-[#25D366] data-[state=active]:bg-[#25D366]/5 font-semibold">WhatsApp</TabsTrigger>
                    <TabsTrigger value="cold" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#E86A30] data-[state=active]:text-[#E86A30] data-[state=active]:bg-[#E86A30]/5 font-semibold">En Frío</TabsTrigger>
                    <TabsTrigger value="email" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#4A7C34] data-[state=active]:text-[#4A7C34] data-[state=active]:bg-[#4A7C34]/5 font-semibold">Email Formal</TabsTrigger>
                  </TabsList>

                  {/* WHATSAPP TAB */}
                  <TabsContent value="whatsapp" className="p-6 m-0 space-y-4">
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Agrega items al presupuesto primero.</p>
                    ) : !whatsappGeneratedMsg ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <Textarea value={whatsappMsgText} onChange={(e) => setWhatsappMsgText(e.target.value)} placeholder="Instrucciones: Ej. 'Dile que la propusta está lista y resalta la garantía'" className="resize-y min-h-[100px] bg-background border-border/60" />
                          <Button size="icon" variant="ghost" onClick={() => isRecording && recordingTarget === "whatsappMsg" ? stopRecording() : startRecording("whatsappMsg")} className={`absolute bottom-3 right-3 ${isRecording && recordingTarget === "whatsappMsg" ? 'text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20' : 'text-[#25D366] hover:bg-[#25D366]/10'}`}>
                            {isTranscribing && recordingTarget === "whatsappMsg" ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording && recordingTarget === "whatsappMsg" ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                          </Button>
                        </div>
                        <Button className="w-full h-12 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold text-base rounded-xl" onClick={generateWhatsappMessage} disabled={whatsappMsgLoading}>
                          {whatsappMsgLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />} Generar Mensaje de WhatsApp
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Textarea value={whatsappGeneratedMsg} onChange={(e) => setWhatsappGeneratedMsg(e.target.value)} className="resize-y min-h-[250px] leading-relaxed bg-background" />
                        <div className="flex gap-3">
                          <Button className="flex-1 h-12 font-bold" variant={whatsappMsgCopied ? "default" : "outline"} onClick={copyWhatsappMessage}>
                            {whatsappMsgCopied ? <><Check className="w-5 h-5 mr-2" /> Copiado</> : <><Copy className="w-5 h-5 mr-2" /> Copiar para Enviar</>}
                          </Button>
                          <Button size="icon" variant="outline" className="h-12 w-12" onClick={() => { setWhatsappGeneratedMsg(""); setWhatsappMsgText(""); }}>
                            <RefreshCw className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* COLD EMAIL TAB */}
                  <TabsContent value="cold" className="p-6 m-0 space-y-4">
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Agrega items al presupuesto primero.</p>
                    ) : !coldGeneratedMsg ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <Textarea value={coldMsgText} onChange={(e) => setColdMsgText(e.target.value)} placeholder="Contexto: Ej. 'Su restaurante no tiene web y la competencia sí, vi su IG y tienen buenas fotos'" className="resize-y min-h-[100px] bg-background border-border/60" />
                          <Button size="icon" variant="ghost" onClick={() => isRecording && recordingTarget === "coldMsg" ? stopRecording() : startRecording("coldMsg")} className={`absolute bottom-3 right-3 ${isRecording && recordingTarget === "coldMsg" ? 'text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20' : 'text-[#E86A30] hover:bg-[#E86A30]/10'}`}>
                            {isTranscribing && recordingTarget === "coldMsg" ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording && recordingTarget === "coldMsg" ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                          </Button>
                        </div>
                        <Button className="w-full h-12 bg-gradient-to-r from-[#d45e28] to-[#E86A30] text-white font-bold text-base rounded-xl" onClick={generateColdOutreach} disabled={coldMsgLoading}>
                          {coldMsgLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />} Redactar Prospección en Frío
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Textarea value={coldGeneratedMsg} onChange={(e) => setColdGeneratedMsg(e.target.value)} className="resize-y min-h-[250px] leading-relaxed bg-background" />
                        <div className="flex gap-3">
                          <Button className="flex-1 h-12 font-bold" variant={coldMsgCopied ? "default" : "outline"} onClick={copyColdMessage}>
                            {coldMsgCopied ? <><Check className="w-5 h-5 mr-2" /> Copiado</> : <><Copy className="w-5 h-5 mr-2" /> Copiar Mensaje</>}
                          </Button>
                          <Button size="icon" variant="outline" className="h-12 w-12" onClick={() => { setColdGeneratedMsg(""); setColdMsgText(""); }}>
                            <RefreshCw className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* EMAIL TAB */}
                  <TabsContent value="email" className="p-6 m-0 space-y-4">
                     {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Agrega items al presupuesto primero.</p>
                    ) : !emailGeneratedBody ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <Textarea value={emailMsgText} onChange={(e) => setEmailMsgText(e.target.value)} placeholder="Instrucciones: Ej. 'Email muy formal dirigido al directorio, resaltar tiempos de entrega'" className="resize-y min-h-[100px] bg-background border-border/60" />
                          <Button size="icon" variant="ghost" onClick={() => isRecording && recordingTarget === "emailMsg" ? stopRecording() : startRecording("emailMsg")} className={`absolute bottom-3 right-3 ${isRecording && recordingTarget === "emailMsg" ? 'text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20' : 'text-[#4A7C34] hover:bg-[#4A7C34]/10'}`}>
                            {isTranscribing && recordingTarget === "emailMsg" ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording && recordingTarget === "emailMsg" ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                          </Button>
                        </div>
                        <Button className="w-full h-12 bg-gradient-to-r from-[#4A7C34] to-[#5D9442] text-white font-bold text-base rounded-xl" onClick={generateEmailMessage} disabled={emailMsgLoading}>
                          {emailMsgLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />} Redactar Email Formal
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Asunto</Label>
                          <Input value={emailGeneratedSubject} onChange={(e) => setEmailGeneratedSubject(e.target.value)} className="font-semibold text-base h-11 bg-background" />
                        </div>
                        <div>
                           <Label className="text-xs text-muted-foreground mb-1 block">Cuerpo del correo</Label>
                          <Textarea value={emailGeneratedBody} onChange={(e) => setEmailGeneratedBody(e.target.value)} className="resize-y min-h-[300px] leading-relaxed bg-background" />
                        </div>
                        <div className="flex gap-3">
                          <Button className="flex-1 h-12 font-bold" variant={emailMsgCopied ? "default" : "outline"} onClick={copyEmailMessage}>
                            {emailMsgCopied ? <><Check className="w-5 h-5 mr-2" /> Copiado Completo</> : <><Copy className="w-5 h-5 mr-2" /> Copiar Correo</>}
                          </Button>
                          <Button size="icon" variant="outline" className="h-12 w-12" onClick={() => { setEmailGeneratedBody(""); setEmailGeneratedSubject(""); setEmailMsgText(""); }}>
                            <RefreshCw className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
               </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DIÁLOGOS DE IA (Generar Items y Completar Presupuesto) */}

      {/* DIÁLOGO COMPLETAR CON AUDIO (Zap) */}
      <Dialog open={autoFillOpen} onOpenChange={(open) => {
        setAutoFillOpen(open);
        if (!open) {
          setAutoFillText("");
          cleanupRecording();
          setAutoFillChecklist({ items: false, prices: false, payment: false, maintenance: false, timeline: false, notes: false });
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-3xl font-display flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#E86A30] to-[#E86A30]/80 flex items-center justify-center shadow-lg">
                 <Zap className="w-6 h-6 text-white fill-white" />
              </div>
              Asistente de Cotización Inteligente
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground mt-2">
              Graba un audio narrando lo que conversaste con el cliente o dictando el proyecto completo. La IA extraerá los servicios, calculará precios y configurará todo el panel por ti.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-8">
            <div className="bg-muted/10 p-5 rounded-2xl border border-border/50">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-primary" />
                Primero, selecciona para quién es esto:
              </label>
              <div className="flex gap-3">
                <ClientSearchSelect clients={clients} value={selectedClientId} onChange={setSelectedClientId} />
                <Button variant="outline" className="h-12" onClick={() => setNewClientDialogOpen(true)}>
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-[#E86A30]/20 bg-gradient-to-br from-[#E86A30]/5 to-transparent">
              <div className="flex items-center gap-2 mb-4 border-b border-[#E86A30]/10 pb-3">
                <ListChecks className="w-5 h-5 text-[#E86A30]" />
                <span className="text-base font-semibold text-[#E86A30]">Guía de puntos a dictar/escribir:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                {[
                  { key: "items", label: "Desglose de servicios a entregar" },
                  { key: "prices", label: "Valores o precios acordados" },
                  { key: "payment", label: "Condiciones y forma de pago" },
                  { key: "maintenance", label: "Costo de mantenimiento (si aplica)" },
                  { key: "timeline", label: "Tiempos de ejecución" },
                  { key: "notes", label: "Promesas o notas extra" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-3 text-sm font-medium text-foreground cursor-pointer group">
                    <div className="w-5 h-5 rounded border border-[#E86A30]/40 flex items-center justify-center bg-background group-hover:border-[#E86A30]">
                       <Checkbox
                          checked={autoFillChecklist[item.key as keyof typeof autoFillChecklist]}
                          onCheckedChange={(checked) => setAutoFillChecklist((prev) => ({ ...prev, [item.key]: !!checked }))}
                          className="opacity-0 absolute"
                        />
                        {autoFillChecklist[item.key as keyof typeof autoFillChecklist] && <Check className="w-3.5 h-3.5 text-[#E86A30]" />}
                    </div>
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="relative">
              <Textarea
                value={autoFillText}
                onChange={(e) => setAutoFillText(e.target.value)}
                placeholder="Presiona el micrófono y empieza a hablar... o pega aquí tus apuntes."
                className="resize-y text-base min-h-[200px] p-5 pr-20 bg-background border-border/60 focus-visible:ring-primary shadow-inner rounded-2xl leading-relaxed"
              />
              <div className="absolute bottom-5 right-5">
                {isTranscribing && recordingTarget === "autoFill" ? (
                  <div className="flex items-center gap-2 text-[#E86A30] bg-[#E86A30]/10 px-4 py-2 rounded-full font-medium">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Pensando...</span>
                  </div>
                ) : isRecording && recordingTarget === "autoFill" ? (
                  <Button
                    size="icon"
                    variant="default"
                    onClick={stopRecording}
                    className="bg-red-500 hover:bg-red-600 text-white animate-pulse w-14 h-14 rounded-full shadow-lg"
                  >
                    <Square className="w-6 h-6 fill-white" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => startRecording("autoFill")}
                    className="text-[#E86A30] border-[#E86A30]/30 hover:bg-[#E86A30]/10 w-14 h-14 rounded-full shadow-md hover:scale-105 transition-transform"
                    disabled={autoFillLoading}
                  >
                    <Mic className="w-6 h-6" />
                  </Button>
                )}
              </div>
            </div>

            {isRecording && recordingTarget === "autoFill" && (
              <div className="flex items-center justify-center gap-3 text-base text-red-500 font-medium bg-red-500/10 py-3 rounded-xl border border-red-500/20">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                Grabando audio... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
              </div>
            )}

            <Button
              className="w-full h-16 text-lg font-bold bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 text-white border-0 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all"
              onClick={autoFillFromAudio}
              disabled={autoFillLoading || isTranscribing || !autoFillText.trim()}
            >
              {autoFillLoading ? (
                <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> Procesando información mágica...</>
              ) : (
                <><Zap className="w-6 h-6 mr-3 fill-white" /> Armar Presupuesto Automáticamente</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO GENERAR ITEMS IA */}
      <Dialog open={aiItemsOpen} onOpenChange={(open) => {
        setAiItemsOpen(open);
        if (!open) { setAiGeneratedItems([]); setAiItemsText(""); cleanupRecording(); }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-display flex items-center gap-3 text-[#E86A30]">
              <div className="p-3 bg-[#E86A30]/10 rounded-xl"><Sparkles className="w-6 h-6" /></div>
              Desglosar Proyecto en Items
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              Explica de qué trata el proyecto y la IA armará una lista de items (servicios) con precios referenciales y descripciones vendedoras listos para agregar.
            </DialogDescription>
          </DialogHeader>

          {aiGeneratedItems.length === 0 ? (
            <div className="space-y-6">
              <div className="relative">
                <Textarea
                  value={aiItemsText}
                  onChange={(e) => setAiItemsText(e.target.value)}
                  placeholder="Ej: 'El cliente es una clinica dental. Necesita landing page para agendar horas, integracion con WhatsApp, y SEO básico. El presupuesto maximo es de $1.5M...'"
                  className="resize-y text-base min-h-[200px] p-5 pr-20 bg-background border-border/60 shadow-inner rounded-2xl leading-relaxed focus-visible:ring-[#E86A30]/50"
                  rows={8}
                  disabled={aiItemsLoading || isTranscribing}
                />
                <div className="absolute bottom-5 right-5">
                  {isTranscribing ? (
                     <div className="bg-[#E86A30]/10 text-[#E86A30] px-4 py-2 rounded-full font-medium flex gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Procesando...</div>
                  ) : isRecording ? (
                    <Button size="icon" onClick={stopRecording} className="bg-red-500 hover:bg-red-600 text-white animate-pulse w-14 h-14 rounded-full shadow-lg"><Square className="w-6 h-6 fill-white" /></Button>
                  ) : (
                    <Button size="icon" variant="outline" onClick={() => startRecording("aiItems")} className="text-[#E86A30] border-[#E86A30]/30 hover:bg-[#E86A30]/10 w-14 h-14 rounded-full shadow-md" disabled={aiItemsLoading}><Mic className="w-6 h-6" /></Button>
                  )}
                </div>
              </div>

              {isRecording && (
                <div className="flex items-center justify-center gap-3 text-red-500 font-medium py-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  Grabando... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
                </div>
              )}

              <Button
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 text-white border-0 rounded-xl hover:scale-[1.02] transition-transform"
                onClick={generateItemsWithAI}
                disabled={aiItemsLoading || isTranscribing || !aiItemsText.trim()}
              >
                {aiItemsLoading ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Creando estructura...</> : <><Sparkles className="w-5 h-5 mr-3" /> Generar Lista de Items</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                {aiGeneratedItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-4 p-5 rounded-xl border border-border bg-muted/10 hover:border-[#E86A30]/50 transition-colors">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={(checked) => {
                        const updated = [...aiGeneratedItems];
                        updated[index] = { ...updated[index], selected: !!checked };
                        setAiGeneratedItems(updated);
                      }}
                      className="mt-1.5 scale-125 data-[state=checked]:bg-[#E86A30] data-[state=checked]:border-[#E86A30]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                        <h4 className="font-bold text-base text-foreground">{item.name}</h4>
                        <span className="text-lg font-black text-[#E86A30] bg-[#E86A30]/10 px-3 py-1 rounded-lg whitespace-nowrap self-start">
                          {formatCLP(item.unitPrice)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-border/50">
                <Button variant="outline" className="h-14 flex-1 rounded-xl text-base" onClick={() => setAiGeneratedItems([])}>
                  Rechazar e intentar de nuevo
                </Button>
                <Button
                  className="h-14 flex-1 bg-gradient-to-r from-[#E86A30] to-[#E86A30]/80 text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
                  onClick={addAIItems}
                  disabled={!aiGeneratedItems.some(i => i.selected)}
                >
                  <Check className="w-5 h-5 mr-2" />
                  Agregar {aiGeneratedItems.filter(i => i.selected).length} Items al Presupuesto
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: Crear nuevo cliente */}
      <NewClientDialog
        open={newClientDialogOpen}
        onOpenChange={setNewClientDialogOpen}
        onCreated={(clientId) => {
          setSelectedClientId(clientId);
          toast({ title: "Cliente seleccionado", description: "Listo para presupuestar." });
        }}
      />

      {/* DIALOG: Vista previa del contrato */}
      <Dialog open={contractPreviewOpen} onOpenChange={setContractPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-3">
              <FileSignature className="w-6 h-6 text-[#2E7D32]" />
              Vista previa del contrato
            </DialogTitle>
            <DialogDescription>
              Así se verá el contrato cuando se envíe al cliente. Puedes seguir editando arriba.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sections: { key: keyof typeof contractContent; label: string }[] = [
              { key: "alcance", label: "1. Alcance del proyecto" },
              { key: "entregables", label: "2. Entregables y etapas" },
              { key: "plazos", label: "3. Plazos y cronograma" },
              { key: "condiciones", label: "4. Condiciones de pago" },
              { key: "garantía", label: "5. Garantía y soporte" },
              { key: "confidencialidad", label: "6. Confidencialidad" },
              { key: "extras", label: "7. Servicios contratados" },
            ];
            const hasAny = sections.some((s) => (contractContent[s.key] || "").trim().length > 0);
            const selectedClient = clients?.find((c) => c.id === selectedClientId);
            return (
              <div className="space-y-6 mt-2">
                {/* Encabezado */}
                <div className="bg-gradient-to-br from-[#2E7D32]/10 to-[#4A7C34]/5 border border-[#2E7D32]/20 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Contrato de servicios</p>
                      <h3 className="text-xl font-bold text-foreground">WebMakerChile SpA</h3>
                      <p className="text-xs text-muted-foreground mt-1">RUT 78.042.968-2</p>
                    </div>
                    {selectedClient && (
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cliente</p>
                        <p className="text-base font-bold text-foreground">{selectedClient.companyName}</p>
                        {selectedClient.rut && <p className="text-xs text-muted-foreground mt-1">RUT {selectedClient.rut}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {!hasAny ? (
                  <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border/50">
                    <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">El contrato está vacío</p>
                    <p className="text-xs text-muted-foreground mt-1">Genera el contrato con IA o llena las secciones manualmente.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sections.map((s) => {
                      const text = (contractContent[s.key] || "").trim();
                      if (!text) return null;
                      return (
                        <div key={s.key} className="border-b border-border/40 pb-4 last:border-0">
                          <h4 className="text-base font-bold text-foreground mb-2">{s.label}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pie con monto */}
                {items.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-4 border border-border/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monto total</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{items.length} ítem(s) {hasIva ? "+ IVA 19%" : "exento de IVA"}</p>
                    </div>
                    <p className="text-2xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-[#E86A30] to-[#4A7C34]">
                      {formatCLP(total)}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="flex justify-end pt-4 border-t border-border/30 mt-4">
            <Button onClick={() => setContractPreviewOpen(false)} variant="outline">Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}