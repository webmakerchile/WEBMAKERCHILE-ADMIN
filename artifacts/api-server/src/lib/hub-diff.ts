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
