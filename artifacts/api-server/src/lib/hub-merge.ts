/**
 * Fusión del tablero compartido.
 *
 * El Hub es un blob JSON que edita todo el equipo. Si cada PATCH sobrescribiera
 * el blob completo, quien guardara último borraría el trabajo de los demás
 * (basta con tener una pestaña abierta un rato). Por eso se fusiona entidad por
 * entidad, usando la versión que el cliente tenía al cargar (`baseVersion`).
 */

export type HubEntity = Record<string, unknown> & { id?: unknown };

const entityId = (e: HubEntity): string => String(e?.id ?? "");

/** Última modificación conocida de la entidad, en ms. */
const entityStamp = (e: HubEntity): number => Number(e?.updatedAt ?? e?.createdAt ?? 0) || 0;

/**
 * Reglas:
 *  - presente en ambos lados → gana la marca de tiempo más reciente (empate: el cliente,
 *    que es quien acaba de actuar);
 *  - solo en el servidor y creada DESPUÉS de `baseVersion` → la creó otra persona
 *    mientras este cliente trabajaba: se conserva;
 *  - solo en el servidor y ya existía cuando el cliente cargó → el cliente la borró:
 *    se elimina;
 *  - solo en el cliente → es nueva: se agrega.
 */
export function mergeCollection(stored: HubEntity[], incoming: HubEntity[], baseVersion: number): HubEntity[] {
  const incomingById = new Map<string, HubEntity>();
  for (const e of incoming) incomingById.set(entityId(e), e);

  const storedIds = new Set(stored.map(entityId));
  const out: HubEntity[] = [];

  for (const s of stored) {
    const id = entityId(s);
    const mine = incomingById.get(id);
    if (mine) {
      out.push(entityStamp(s) > entityStamp(mine) ? s : mine);
      continue;
    }
    const createdAt = Number(s?.createdAt ?? 0) || 0;
    if (createdAt > baseVersion) out.push(s);
  }

  for (const e of incoming) {
    if (!storedIds.has(entityId(e))) out.push(e);
  }

  return out;
}
