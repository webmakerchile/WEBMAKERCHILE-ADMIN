import { resolveBoard, saveBoardSiVersion } from "./hub-board";
import { recordActivity } from "./activity";

/**
 * El contrato del tablero pasa a "activo" cuando el cliente firma.
 *
 * Es la ÚNICA escritura al tablero que puede disparar la ruta pública de
 * firma, y por eso está acotada a propósito:
 *
 *  · solo transiciona borrador → activo; un contrato perdido, cancelado o ya
 *    activo no se toca (revivir un perdido porque alguien abrió un enlace
 *    viejo sería peor que no activar);
 *  · no entra NINGÚN dato del firmante al blob — nombre, correo y firma se
 *    quedan en contract_signatures, que es su casa;
 *  · el guardado va condicionado a la versión leída, con reintentos, para no
 *    pisar ediciones simultáneas del Hub (misma regla que reuniones).
 *
 * Si aun así no se puede guardar, la firma vale igual: el contrato se puede
 * activar a mano en la ficha, y el fallo queda a gritos en el log.
 */
export type ResultadoActivacion = "activado" | "ya_resuelto" | "no_encontrado" | "fallo";

export async function activarContratoFirmado(p: {
  contractId: string;
  fechaFirma: Date;
  /** Quién generó el enlace (para la bitácora). null = sin rastro, no se anota. */
  actorId: number | null;
}): Promise<ResultadoActivacion> {
  const fecha = p.fechaFirma.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  for (let intento = 0; intento < 3; intento++) {
    const board = await resolveBoard().catch(() => null);
    if (!board) return "fallo";
    const contracts = Array.isArray(board.data.contracts)
      ? (board.data.contracts as Record<string, unknown>[])
      : [];
    const idx = contracts.findIndex((c) => String(c?.id ?? "") === p.contractId);
    if (idx === -1) return "no_encontrado";

    const c = contracts[idx];
    if (String(c.status ?? "") !== "borrador") return "ya_resuelto";

    const next = [...contracts];
    next[idx] = {
      ...c,
      status: "activo",
      // La fecha de firma es la prueba de la venta (ver estado-contrato.ts);
      // si ya traía una —contratos importados—, se respeta.
      signedAt: String(c.signedAt ?? "").trim() || fecha,
      updatedAt: Date.now(),
    };

    const guardado = await saveBoardSiVersion(
      board.boardUserId,
      { ...board.data, contracts: next },
      board.version,
    ).catch(() => null);
    if (!guardado) continue; // otro guardado se cruzó: releer y reintentar

    if (p.actorId) {
      recordActivity({
        actorId: p.actorId,
        entityType: "contract",
        entityId: p.contractId,
        entityLabel: `Contrato firmado: ${String(c.client || c.title || p.contractId)} — pasa a activo`,
        action: "status_change",
        detail: { firmado: true, to: "activo" },
      });
    }
    return "activado";
  }
  return "fallo";
}
