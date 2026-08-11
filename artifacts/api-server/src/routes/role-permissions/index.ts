import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  normalizeRole,
  isTeamRole,
  ROLES,
  SECTION_CATALOG,
  SECTION_GROUPS,
  CONFIGURABLE_ROLES,
  roleHome,
} from "@workspace/roles";
import { getAllEffectiveRoutes, saveRolePermissions } from "../../lib/role-permissions";

const router: IRouter = Router();

/**
 * Ver y editar qué secciones ve cada rol es de dirección — y de desarrollo,
 * que necesita esta tarjeta para tener algo que hacer en /ajustes sin ver las
 * credenciales de las redes (esas siguen siendo solo de dirección).
 */
function soloDireccionODev(req: Request, res: Response, next: NextFunction): void {
  const u = req.user as { role?: string; teamRole?: string } | undefined;
  const role = normalizeRole(u?.teamRole, u?.role === "superadmin");
  if (u?.role === "superadmin" || role === "ceo" || role === "dev") {
    next();
    return;
  }
  res.status(403).json({ error: "Solo dirección o desarrollo pueden ver los permisos por rol" });
}

router.use("/role-permissions", soloDireccionODev);

router.get("/role-permissions", async (_req: Request, res: Response) => {
  const effective = await getAllEffectiveRoutes();
  const roles = CONFIGURABLE_ROLES.map((role) => ({
    role,
    label: ROLES[role].label,
    home: roleHome(role),
    routes: effective[role],
  }));
  res.json({ sections: SECTION_CATALOG, groups: SECTION_GROUPS, roles });
});

router.put("/role-permissions/:role", async (req: Request, res: Response) => {
  const raw = req.params.role;
  if (!isTeamRole(raw) || !(CONFIGURABLE_ROLES as readonly string[]).includes(raw)) {
    res.status(400).json({ error: "Rol inválido o no editable" });
    return;
  }

  const body = req.body as { routes?: unknown };
  if (!Array.isArray(body.routes) || !body.routes.every((r) => typeof r === "string")) {
    res.status(400).json({ error: "routes debe ser un array de strings" });
    return;
  }

  const me = req.user as { email?: string } | undefined;
  const saved = await saveRolePermissions(raw, body.routes as string[], me?.email ?? null);
  res.json({ role: raw, routes: saved });
});

export default router;
