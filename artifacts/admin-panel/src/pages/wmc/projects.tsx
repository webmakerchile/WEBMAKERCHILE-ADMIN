import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/wmc/ui/card";
import { Button } from "@/components/wmc/ui/button";
import { Badge } from "@/components/wmc/ui/badge";
import { Skeleton } from "@/components/wmc/ui/skeleton";
import { Input } from "@/components/wmc/ui/input";
import { Progress } from "@/components/wmc/ui/progress";
import {
  Search,
  Briefcase,
  Clock,
  CheckCircle2,
  Code2,
  TestTube,
  Truck,
  Palette,
  Link as LinkIcon,
  Eye,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/wmc/ui/tooltip";
import { useToast } from "@/hooks/wmc/use-toast";
import type { Project, Client } from "@shared/schema";

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
    month: "short",
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

function ProjectTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = statusOrder.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1 mt-4">
      {statusOrder.map((status, index) => {
        const config = statusConfig[status];
        const Icon = config.icon;
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={status} className="flex items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isCompleted || isCurrent
                  ? config.bgColor
                  : "bg-muted"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isCompleted || isCurrent ? config.color : "text-muted-foreground"
                }`}
              />
            </div>
            {index < statusOrder.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 ${
                  isCompleted ? "bg-chart-5" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectCard({ project, client }: { project: Project; client?: Client }) {
  const config = statusConfig[project.status] || statusConfig.MOCKUP;
  const StatusIcon = config.icon;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/portal/login?token=${project.id}`;
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link copiado",
        description: "El link de acceso del cliente ha sido copiado al portapapeles.",
      });
    });
  };

  const handleViewDetails = () => {
    setLocation(`/admin/projects/${project.id}`);
  };

  return (
    <Card 
      className="glass-card overflow-visible cursor-pointer hover-elevate" 
      onClick={handleViewDetails}
      data-testid={`card-project-${project.id}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
              <StatusIcon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate" data-testid={`text-project-name-${project.id}`}>
                {project.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {client?.companyName || "Cliente"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Iniciado: {formatDate(project.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyLink}
                  data-testid={`button-copy-link-${project.id}`}
                >
                  <LinkIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copiar link de acceso cliente</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); handleViewDetails(); }}
                  data-testid={`button-view-details-${project.id}`}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ver detalles del proyecto</p>
              </TooltipContent>
            </Tooltip>
            <Badge className={config.bgColor + " " + config.color} variant="secondary">
              {config.label}
            </Badge>
          </div>
        </div>

        <ProjectTimeline currentStatus={project.status} />

        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Progreso:</span>
              <span className="font-medium text-foreground">{config.progress}%</span>
            </div>
            <p className="font-bold text-foreground">{formatCLP(project.totalValue)}</p>
          </div>
          <Progress value={config.progress} className="mt-2 h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Projects() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/wmc/projects"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/wmc/clients"],
  });

  const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);

  const filteredProjects = projects?.filter((project) => {
    const client = clientMap.get(project.clientId);
    const matchesSearch =
      !search ||
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      client?.companyName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts =
    projects?.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">
            Proyectos
          </h1>
          <p className="text-muted-foreground mt-1">
            Seguimiento de proyectos activos
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proyectos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-projects"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={statusFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(null)}
            data-testid="filter-all-projects"
          >
            Todos ({projects?.length || 0})
          </Button>
          {statusOrder.slice(0, -1).map((status) => {
            const config = statusConfig[status];
            return (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                data-testid={`filter-${status.toLowerCase()}`}
              >
                {config.label} ({statusCounts[status] || 0})
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-8 w-full mt-4" />
                <Skeleton className="h-2 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects && filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              client={clientMap.get(project.clientId)}
            />
          ))}
        </div>
      ) : (
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <Briefcase className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {search || statusFilter
                ? "No se encontraron proyectos"
                : "No hay proyectos aun"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {search || statusFilter
                ? "Intenta con otros filtros"
                : "Los proyectos se crean automaticamente cuando un presupuesto es aprobado"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
