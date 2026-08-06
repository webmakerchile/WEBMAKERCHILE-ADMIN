import { describe, it, expect } from "vitest";
import {
  ROLES, TEAM_ROLES, TICKET_AREAS, canAccessRoute, canManagePeople, canManageTeam, canReview,
  canAssignGoals, canSeeMoney, hubScopesFor, hubWriteScopesFor, isTeamRole, normalizeRole, roleHome, ticketAreasFor,
} from "@workspace/roles";

describe("roles del equipo", () => {
  it("cada rol puede entrar a su propia pantalla de inicio", () => {
    for (const role of TEAM_ROLES) {
      expect(canAccessRoute(role, roleHome(role)), `${role} no puede ver su home`).toBe(true);
    }
  });

  it("el CEO ve todo el panel; solo dirección y RRHH tocan el equipo", () => {
    expect(canManageTeam("ceo")).toBe(true);
    expect(canManageTeam("rrhh")).toBe(true);
    expect(canAccessRoute("ceo", "/cualquier-cosa-nueva")).toBe(true);
    // "tester" es la cuenta de revisión (TikTok review): espejo del CEO a propósito.
    expect(canManageTeam("tester")).toBe(true);
    for (const role of TEAM_ROLES.filter(r => r !== "ceo" && r !== "rrhh" && r !== "tester")) {
      expect(canManageTeam(role), `${role} no debería administrar el equipo`).toBe(false);
      expect(canAccessRoute(role, "/equipo"), `${role} no debería ver /equipo`).toBe(false);
    }
  });

  it("las fichas laborales solo las ven dirección y RRHH", () => {
    expect(canManagePeople("ceo")).toBe(true);
    expect(canManagePeople("rrhh")).toBe(true);
    expect(canManagePeople("tester")).toBe(true); // cuenta de revisión: acceso total
    for (const role of TEAM_ROLES.filter(r => r !== "ceo" && r !== "rrhh" && r !== "tester")) {
      expect(canManagePeople(role), `${role} no debería ver fichas laborales`).toBe(false);
      expect(canAccessRoute(role, "/rrhh"), `${role} no debería ver /rrhh`).toBe(false);
    }
    // RRHH gestiona personas, no contenido ni el tablero ejecutivo.
    expect(canReview("rrhh")).toBe(false);
    expect(hubScopesFor("rrhh")).toEqual([]);
    expect(canAccessRoute("rrhh", "/videos")).toBe(false);
  });

  it("los montos solo los ve quien maneja plata", () => {
    // Dirección cierra tratos, ventas cotiza y el contador declara.
    expect(canSeeMoney("ceo")).toBe(true);
    expect(canSeeMoney("ventas")).toBe(true);
    expect(canSeeMoney("contador")).toBe(true);
    // Quien ejecuta ve el contrato, pero nunca los precios.
    expect(canSeeMoney("dev")).toBe(false);
    expect(canSeeMoney("marketing")).toBe(false);
    expect(canSeeMoney("editora")).toBe(false);
    expect(canSeeMoney("social")).toBe(false);
    expect(canSeeMoney("rrhh")).toBe(false);
  });

  it("quien lee contratos sin ver montos recibe la versión técnica", () => {
    // Invariante del negocio: si un rol tiene contratos en su alcance y no puede
    // ver dinero, es porque necesita los requerimientos, no la cotización.
    for (const role of TEAM_ROLES) {
      const leeContratos = hubScopesFor(role).includes("contracts");
      const escribeContratos = hubWriteScopesFor(role).includes("contracts");
      if (escribeContratos) {
        expect(canSeeMoney(role), `${role} edita contratos pero no ve montos`).toBe(true);
      }
      if (leeContratos && !canSeeMoney(role)) {
        expect(escribeContratos, `${role} no debería poder editar contratos censurados`).toBe(false);
      }
    }
  });

  it("aprobar contenido queda en dirección y marketing", () => {
    expect(canReview("ceo")).toBe(true);
    expect(canReview("marketing")).toBe(true);
    expect(canReview("editora")).toBe(false);
    expect(canReview("social")).toBe(false);
  });

  it("mapea los roles antiguos: reviewer → ceo, editor → editora", () => {
    expect(normalizeRole("reviewer")).toBe("ceo");
    expect(normalizeRole("editor")).toBe("editora");
    expect(normalizeRole("no-existe")).toBe("editora");
    expect(normalizeRole(undefined)).toBe("editora");
    expect(isTeamRole("reviewer")).toBe(false);
  });

  it("un superadministrador siempre es CEO, aunque su team_role diga otra cosa", () => {
    expect(normalizeRole("contador", true)).toBe("ceo");
    expect(canManageTeam("contador", true)).toBe(true);
    expect(canAccessRoute("contador", "/equipo", true)).toBe(true);
  });

  it("las rutas anidadas heredan del prefijo, pero no las que solo comparten texto", () => {
    expect(canAccessRoute("social", "/campanas")).toBe(true);
    expect(canAccessRoute("social", "/campanas/42")).toBe(true);
    expect(canAccessRoute("social", "/campanas-privadas")).toBe(false);
    // "/" no puede actuar como comodín para el resto del panel.
    expect(canAccessRoute("social", "/")).toBe(true);
    expect(canAccessRoute("editora", "/")).toBe(false);
  });

  it("ignora query string y barra final", () => {
    expect(canAccessRoute("editora", "/videos?select=12")).toBe(true);
    expect(canAccessRoute("editora", "/videos/")).toBe(true);
    expect(canAccessRoute("editora", "/schedule")).toBe(false);
  });

  it("el contador solo ve su reporte y la ayuda", () => {
    expect(canAccessRoute("contador", "/reportes")).toBe(true);
    expect(canAccessRoute("contador", "/ayuda")).toBe(true);
    expect(canAccessRoute("contador", "/dashboard-ejecutivo")).toBe(false);
    expect(canAccessRoute("contador", "/videos")).toBe(false);
    expect(hubScopesFor("contador")).toEqual(["contracts"]);
  });

  it("cada rol declara solo los datos del tablero que necesita", () => {
    expect(hubScopesFor("ventas")).toEqual(["contracts", "clients", "meetings", "projects"]);
    expect(hubScopesFor("dev")).toEqual(["projects", "tasks", "notes", "contracts"]);
    expect(hubScopesFor("marketing")).toEqual(["projects", "tasks", "clients", "contracts"]);
    // Los roles puramente de producción no entran al tablero: se conectan por tickets.
    expect(hubScopesFor("editora")).toEqual([]);
    expect(hubScopesFor("social")).toEqual([]);
    expect(hubScopesFor("rrhh")).toEqual([]);
  });

  it("nadie puede escribir una colección del tablero que no puede leer", () => {
    for (const role of TEAM_ROLES) {
      const readable = new Set(hubScopesFor(role));
      for (const scope of hubWriteScopesFor(role)) {
        expect(readable.has(scope), `${role} escribe ${scope} sin poder leerlo`).toBe(true);
      }
    }
  });

  it("los permisos de escritura del tablero reflejan quién hace cada trabajo", () => {
    // Ventas cierra contratos y cartera, pero no mueve el tablero de desarrollo.
    expect(hubWriteScopesFor("ventas")).toEqual(["contracts", "clients", "meetings"]);
    expect(hubWriteScopesFor("dev")).toEqual(["projects", "tasks"]);
    // Marketing coordina tareas, no toca contratos.
    expect(hubWriteScopesFor("marketing")).toEqual(["tasks"]);
    // El contador solo mira.
    expect(hubWriteScopesFor("contador")).toEqual([]);
  });

  it("cada rol atiende un área de tickets y nadie queda sin bandeja", () => {
    const areas = new Set<string>();
    for (const role of TEAM_ROLES) {
      const mine = ticketAreasFor(role);
      expect(mine.length, `${role} no atiende ninguna área`).toBeGreaterThan(0);
      mine.forEach(a => areas.add(a));
    }
    // Toda área a la que se puede dirigir un ticket tiene quien la responda.
    for (const area of TICKET_AREAS) {
      expect(areas.has(area), `nadie atiende el área ${area}`).toBe(true);
    }
  });

  it("toda definición de rol es coherente consigo misma", () => {
    for (const role of TEAM_ROLES) {
      const def = ROLES[role];
      expect(def.id).toBe(role);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.home.startsWith("/")).toBe(true);
      expect(def.routes.length).toBeGreaterThan(0);
    }
  });
});

describe("cada rol tiene su propia pantalla", () => {
  it("ningún rol comparte pantalla de inicio con otro", () => {
    // Cada área escala por su cuenta: si dos roles aterrizaran en la misma
    // pantalla, darle una función específica a uno se la daría al otro.
    // "tester" es un espejo del CEO (cuenta de revisión), así que comparte su home.
    const propios = TEAM_ROLES.filter(r => r !== "tester");
    const homes = propios.map(r => roleHome(r));
    expect(new Set(homes).size, `hay pantallas compartidas: ${homes.join(", ")}`).toBe(propios.length);
    expect(roleHome("tester")).toBe(roleHome("ceo"));
  });

  it("la pantalla de inicio de cada rol le pertenece", () => {
    for (const role of TEAM_ROLES) {
      const home = roleHome(role);
      expect(canAccessRoute(role, home), `${role} no entra a su propia pantalla`).toBe(true);
      // Nadie más debería aterrizar ahí por defecto.
      const otros = TEAM_ROLES.filter(r => r !== role && r !== "ceo" && r !== "tester");
      for (const otro of otros) {
        expect(roleHome(otro), `${otro} aterriza en la pantalla de ${role}`).not.toBe(home);
      }
    }
  });

  it("todos pueden ver su jornada y sus tickets", () => {
    for (const role of TEAM_ROLES) {
      expect(canAccessRoute(role, "/mi-dia"), `${role} no ve su jornada`).toBe(true);
      expect(canAccessRoute(role, "/tickets"), `${role} no ve sus tickets`).toBe(true);
    }
  });
});

describe("qué NO debe ver cada rol", () => {
  it("las credenciales de las redes son solo de dirección", () => {
    // /ajustes guarda claves de API y gestión de usuarios.
    // "tester" (cuenta de revisión TikTok) tiene acceso total a propósito.
    for (const role of TEAM_ROLES.filter(r => r !== "ceo" && r !== "tester")) {
      expect(canAccessRoute(role, "/ajustes"), `${role} no debería ver /ajustes`).toBe(false);
    }
    expect(canAccessRoute("ceo", "/ajustes")).toBe(true);
  });

  it("nadie entra a la pantalla de otra área por accidente", () => {
    const ajenas: [string, string][] = [
      ["editora", "/redes"], ["editora", "/marketing"], ["editora", "/ventas"],
      ["social", "/edicion"], ["social", "/rrhh"], ["social", "/reportes"],
      ["dev", "/edicion"], ["dev", "/redes"], ["dev", "/reportes"],
      ["contador", "/edicion"], ["contador", "/redes"], ["contador", "/marketing"],
      ["rrhh", "/edicion"], ["rrhh", "/redes"], ["rrhh", "/ventas"],
      ["ventas", "/edicion"], ["ventas", "/rrhh"],
    ];
    for (const [role, ruta] of ajenas) {
      expect(canAccessRoute(role, ruta), `${role} no debería entrar a ${ruta}`).toBe(false);
    }
  });
});

describe("metas por período", () => {
  it("solo dirección, ventas y RRHH ponen metas", () => {
    // Son los roles que dirigen a alguien; el resto cumple las suyas.
    expect(canAssignGoals("ceo")).toBe(true);
    expect(canAssignGoals("ventas")).toBe(true);
    expect(canAssignGoals("rrhh")).toBe(true);
    for (const role of ["editora", "social", "dev", "marketing", "contador"] as const) {
      expect(canAssignGoals(role), `${role} no debería asignar metas`).toBe(false);
    }
  });

  it("todos ven la pantalla de metas: también quien solo las cumple", () => {
    for (const role of TEAM_ROLES) {
      expect(canAccessRoute(role, "/metas"), `${role} no ve sus metas`).toBe(true);
    }
  });
});

describe("el Hub Ejecutivo ahora vive en páginas propias del sidebar", () => {
  // Las 13 páginas en las que se partió el antiguo Hub Ejecutivo (ver /App.tsx).
  const HUB_PAGES = [
    "/dashboard-ejecutivo", "/torre-ceo", "/proyectos", "/clientes", "/reuniones",
    "/notas", "/contratos", "/ventas", "/cobros", "/servicios",
    "/equipo-hoy", "/asistencia", "/drive-hub",
  ] as const;

  it("ventas aterriza en el dashboard del Hub y no en una pantalla aparte", () => {
    expect(roleHome("ventas")).toBe("/dashboard-ejecutivo");
    expect(canAccessRoute("ventas", "/dashboard-ejecutivo")).toBe(true);
  });

  it("cada rol con acceso al Hub ve solo las páginas de su alcance", () => {
    const esperado: Record<string, readonly string[]> = {
      ventas: [
        "/dashboard-ejecutivo", "/proyectos", "/clientes", "/reuniones", "/contratos",
        "/ventas", "/cobros", "/servicios", "/equipo-hoy", "/asistencia", "/drive-hub",
      ],
      dev: ["/dashboard-ejecutivo", "/proyectos", "/notas", "/contratos", "/equipo-hoy", "/drive-hub"],
      rrhh: ["/dashboard-ejecutivo", "/equipo-hoy", "/drive-hub", "/asistencia"],
    };
    for (const [role, paginas] of Object.entries(esperado)) {
      for (const pagina of HUB_PAGES) {
        expect(canAccessRoute(role, pagina), `${role} en ${pagina}`).toBe(paginas.includes(pagina));
      }
    }
  });

  it("edición, redes, marketing y contabilidad no entran a ninguna página del Hub", () => {
    for (const role of ["editora", "social", "marketing", "contador"] as const) {
      for (const pagina of HUB_PAGES) {
        expect(canAccessRoute(role, pagina), `${role} no debería ver ${pagina}`).toBe(false);
      }
    }
  });

  it("la Torre CEO es exclusiva de dirección", () => {
    for (const role of ["ceo", "tester"] as const) {
      expect(canAccessRoute(role, "/torre-ceo"), `${role} debería ver la Torre CEO`).toBe(true);
    }
    for (const role of ["ventas", "dev", "rrhh", "editora", "social", "marketing", "contador"] as const) {
      expect(canAccessRoute(role, "/torre-ceo"), `${role} no debería ver la Torre CEO`).toBe(false);
    }
  });

  it("Agencia es exclusiva de dirección: ningún otro rol la ve, ni con vista reducida", () => {
    for (const role of ["ceo", "tester"] as const) {
      expect(canAccessRoute(role, "/agencia"), `${role} debería ver Agencia`).toBe(true);
    }
    for (const role of ["editora", "social", "ventas", "dev", "marketing", "rrhh", "contador"] as const) {
      expect(canAccessRoute(role, "/agencia"), `${role} no debería ver Agencia`).toBe(false);
    }
  });
});
