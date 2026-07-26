/**
 * Diff de colecciones del Hub (tablero blob).
 *
 * El tablero se guarda como un blob JSON, así que no hay eventos por fila:
 * para la bitácora y los avisos a dirección se compara lo almacenado ANTES
 * del merge con lo que quedó guardado después. Este módulo es puro para que
 * el diff (creados / cambio de estado / eliminados) sea testeable sin DB.
 */
import type { HubEntity } from "./hub-merge";

/** Nombre visible de una entidad del tablero (mismo fallback que la bitácora). */
export function entityLabel(e: HubEntity): string {
  return String(e?.title ?? e?.name ?? e?.nombre ?? e?.client ?? e?.id ?? "").slice(0, 200) || "(sin título)";
}

/** Estado/etapa de una entidad, tolerante a los tres vocabularios usados. */
export function entityState(e: HubEntity): string {
  return String(e?.status ?? e?.stage ?? e?.etapa ?? "");
}

export interface HubCollectionDiff {
  /** Entidades con id que no existían antes del merge. */
  created: HubEntity[];
  /** Entidades cuyo estado/etapa cambió. */
  statusChanged: { entity: HubEntity; from: string; to: string }[];
  /** Entidades que existían antes y ya no están (el merge respetó un borrado). */
  deleted: HubEntity[];
}

/**
 * Compara una colección antes/después del merge. Las entidades sin id se
 * ignoran (no hay forma estable de seguirlas entre versiones del blob).
 */
export function diffHubEntities(before: HubEntity[], after: HubEntity[]): HubCollectionDiff {
  const beforeById = new Map<string, HubEntity>();
  for (const e of before) {
    const id = String(e?.id ?? "");
    if (id) beforeById.set(id, e);
  }
  const afterIds = new Set<string>();

  const created: HubEntity[] = [];
  const statusChanged: { entity: HubEntity; from: string; to: string }[] = [];
  for (const e of after) {
    const id = String(e?.id ?? "");
    if (!id) continue;
    afterIds.add(id);
    const old = beforeById.get(id);
    if (!old) {
      created.push(e);
    } else if (entityState(old) !== entityState(e)) {
      statusChanged.push({ entity: e, from: entityState(old), to: entityState(e) });
    }
  }

  const deleted: HubEntity[] = [];
  for (const [id, e] of beforeById) {
    if (!afterIds.has(id)) deleted.push(e);
  }

  return { created, statusChanged, deleted };
}

/** Colecciones que generan aviso a dirección cuando las toca alguien que no es CEO. */
export type CeoAvisoScope = "contracts" | "projects" | "clients";

const AVISO_WORDS: Record<CeoAvisoScope, { nuevo: string; cambio: string; eliminado: string; notifyStatus: boolean }> = {
  contracts: { nuevo: "Nuevo contrato", cambio: "Contrato", eliminado: "Contrato eliminado", notifyStatus: true },
  projects: { nuevo: "Nuevo proyecto", cambio: "Proyecto", eliminado: "Proyecto eliminado", notifyStatus: true },
  // Los clientes cambian de etapa todo el tiempo (pipeline): solo alta y baja.
  clients: { nuevo: "Nuevo cliente", cambio: "Cliente", eliminado: "Cliente eliminado", notifyStatus: false },
};

/**
 * Construye los avisos a dirección para el diff de una colección. Los títulos
 * usan el nombre de la entidad (nunca montos) y el cuerpo dice quién actuó.
 */
export function buildCeoAvisos(
  scope: CeoAvisoScope,
  diff: HubCollectionDiff,
  actorName: string,
): { title: string; body: string }[] {
  const w = AVISO_WORDS[scope];
  const avisos = [
    ...diff.created.map((e) => ({ title: `${w.nuevo}: ${entityLabel(e)}`, body: `${actorName} lo creó en el Hub.` })),
    ...diff.deleted.map((e) => ({ title: `${w.eliminado}: ${entityLabel(e)}`, body: `${actorName} lo quitó del tablero.` })),
  ];
  if (w.notifyStatus) {
    avisos.push(
      ...diff.statusChanged.map((c) => ({
        title: `${w.cambio} ${entityLabel(c.entity)}: ${c.from || "sin estado"} → ${c.to || "sin estado"}`,
        body: `${actorName} cambió el estado.`,
      })),
    );
  }
  return avisos;
}
