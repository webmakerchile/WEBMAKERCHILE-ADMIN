import { describe, it, expect } from "vitest";
import {
  explicarErrorPublicacion,
  requiereIntervencion,
  resumirFallos,
} from "./errores-publicacion.js";

// El error real que vio el equipo en pantalla.
const FB_200 =
  "(#200) If posting to a group, requires app being installed in the group, and either publish_to_groups permission with user token, or both pages_read_engagement and pages_manage_posts permission with page token; If posting to a page, requires both pages_read_engagement and pages_manage_posts as an admin with sufficient administrative permission";

describe("explicarErrorPublicacion", () => {
  it("traduce el #200 de Facebook a lo que hay que hacer", () => {
    const m = explicarErrorPublicacion("facebook", FB_200);
    expect(m).toContain("pages_read_engagement");
    expect(m).toContain("administrador");
    expect(m).not.toContain("If posting to a group");
  });

  it("traduce la cuota agotada de X", () => {
    const m = explicarErrorPublicacion("x", "credits depleted");
    expect(m).toContain("cuota");
    expect(m).toContain("No es un fallo del panel");
  });

  it("traduce el token caducado", () => {
    expect(explicarErrorPublicacion("linkedin", "invalid_grant")).toContain("Vuelve a conectarla");
    expect(explicarErrorPublicacion("facebook", "OAuthException #190")).toContain("caducó");
  });

  it("explica el rechazo de formato de Instagram", () => {
    expect(explicarErrorPublicacion("instagram", "Unsupported aspect ratio")).toContain("4:5");
  });

  it("no aplica una regla de una red a otra distinta", () => {
    // El #200 es de Facebook: en LinkedIn ese texto no significa lo mismo.
    expect(explicarErrorPublicacion("linkedin", "(#200) algo de grupos")).toBe("(#200) algo de grupos");
  });

  it("deja el error crudo cuando no lo reconoce", () => {
    // Inventar una explicación mandaría a arreglar lo que no está roto.
    expect(explicarErrorPublicacion("youtube", "algo rarísimo pasó")).toBe("algo rarísimo pasó");
  });

  it("no se cae con un error vacío", () => {
    expect(explicarErrorPublicacion("x", "")).toContain("sin decir por qué");
  });
});

describe("requiereIntervencion", () => {
  it("marca los que no se arreglan reintentando", () => {
    expect(requiereIntervencion("facebook", FB_200)).toBe(true);
    expect(requiereIntervencion("x", "credits depleted")).toBe(true);
    expect(requiereIntervencion("youtube", "quotaExceeded")).toBe(true);
  });

  it("no marca los transitorios", () => {
    expect(requiereIntervencion("instagram", "ETIMEDOUT")).toBe(false);
  });
});

describe("resumirFallos", () => {
  it("nombra la red con su nombre de siempre", () => {
    const r = resumirFallos([
      { red: "x", error: "credits depleted" },
      { red: "facebook", error: FB_200 },
    ]);
    expect(r[0]).toMatch(/^X: /);
    expect(r[1]).toMatch(/^Facebook: /);
  });
});
