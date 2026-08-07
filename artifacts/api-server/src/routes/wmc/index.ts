import { Router, type Request, type Response } from "express";
import { forwardToWmc } from "../../lib/wmc/cliente";
import { requireWmcAccess } from "../../lib/wmc/access";

/**
 * Generic passthrough for the webmakerlatam.com service API. Whatever
 * sub-path/method/query/body arrives under /api/wmc/* is forwarded
 * unchanged — this router intentionally does not know the origin's route
 * table, so it never needs updating when the origin adds/changes endpoints.
 */
const router = Router();

router.use(requireWmcAccess);

router.use(async (req: Request, res: Response) => {
  const subPath = req.path.replace(/^\/+/, "");
  if (!subPath) {
    res.status(404).json({ error: "Ruta no especificada" });
    return;
  }

  const hasBody =
    !!req.body && typeof req.body === "object" && Object.keys(req.body).length > 0;

  try {
    const result = await forwardToWmc({
      method: req.method,
      subPath,
      query: req.query as Record<string, unknown>,
      body: req.body,
      hasBody,
    });
    if (result.contentType) {
      res.setHeader("Content-Type", result.contentType);
    }
    res.status(result.status).send(result.body);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted
      ? "El servicio de origen no respondió a tiempo"
      : "No se pudo contactar el servicio de origen";
    res.status(502).json({ error: message });
  }
});

export default router;
