import { Router, type IRouter, type Request, type Response } from "express";
import { getBrandTone, upsertBrandTone } from "../../lib/brand-tone";

const router: IRouter = Router();

function userId(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return u?.id ?? null;
}

router.get("/settings/brand-tone", async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return void res.status(401).json({ error: "No autenticado" });
  const row = await getBrandTone(id);
  res.json(
    row || {
      voice: "",
      persona: "",
      values: "",
      avoidWords: "",
      examples: "",
    },
  );
});

router.put("/settings/brand-tone", async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return void res.status(401).json({ error: "No autenticado" });
  const body = (req.body || {}) as Record<string, unknown>;
  const row = await upsertBrandTone(id, {
    voice: body.voice as string,
    persona: body.persona as string,
    values: body.values as string,
    avoidWords: body.avoidWords as string,
    examples: body.examples as string,
  });
  res.json(row);
});

export default router;
