// Lo que se prueba aquí es qué entra y con qué nombre. Los dos fallos posibles
// son silenciosos: un adjunto que se acepta y queda colgado de "nada", o uno
// con un nombre que Drive corrige por su cuenta y luego nadie reconoce.

import { describe, it, expect } from "vitest";
import {
  tipoValido,
  idValido,
  motivoRechazo,
  nombreSeguro,
  extensionDe,
  tamanoLegible,
  MAX_BYTES,
} from "./adjuntos";

describe("a qué se puede adjuntar", () => {
  it("acepta las entidades del panel y la bóveda de la empresa", () => {
    for (const t of ["project", "task", "ticket", "contract", "empresa"]) {
      expect(tipoValido(t)).toBe(t);
    }
    expect(tipoValido("PROJECT")).toBe("project");
  });

  it("rechaza cualquier otra cosa", () => {
    expect(tipoValido("usuario")).toBeNull();
    expect(tipoValido("")).toBeNull();
    expect(tipoValido(null)).toBeNull();
  });
});

describe("id de la entidad", () => {
  it("acepta los ids que usa el panel", () => {
    // El blob usa texto ("id1a2b3c"), las tareas y tickets enteros.
    expect(idValido("id1a2b3c")).toBe("id1a2b3c");
    expect(idValido("42")).toBe("42");
    expect(idValido(" c1 ")).toBe("c1");
  });

  // Un id vacío dejaría el adjunto colgado de nada: se sube, se guarda, y no
  // vuelve a aparecer en ninguna ficha.
  it("rechaza lo que dejaría el adjunto colgando", () => {
    expect(idValido("")).toBeNull();
    expect(idValido("   ")).toBeNull();
    expect(idValido(null)).toBeNull();
    expect(idValido("x".repeat(121))).toBeNull();
  });

  it("rechaza caracteres que no son de un id", () => {
    expect(idValido("id con espacios")).toBeNull();
    expect(idValido("id'; drop")).toBeNull();
  });
});

describe("qué archivos se aceptan", () => {
  const archivo = (originalname: string, size = 1024) => ({ originalname, size });

  // El reporte era justo este: solo se aceptaba PDF.
  it("acepta cualquier documento de trabajo, no solo PDF", () => {
    for (const n of ["brief.pdf", "logo.png", "video.mp4", "hoja.xlsx", "diseño.fig", "notas.txt", "carpeta.zip"]) {
      expect(motivoRechazo(archivo(n)), n).toBeNull();
    }
  });

  it("corta los ejecutables", () => {
    for (const n of ["virus.exe", "instalador.msi", "script.sh", "algo.bat", "raro.JS"]) {
      expect(motivoRechazo(archivo(n)), n).toContain("ejecutables");
    }
  });

  it("rechaza lo vacío y lo que no llegó", () => {
    expect(motivoRechazo(null)).toContain("No llegó");
    expect(motivoRechazo(undefined)).toContain("No llegó");
    expect(motivoRechazo(archivo("x.pdf", 0))).toContain("vacío");
  });

  // Se dice el tamaño y qué hacer: "archivo demasiado grande" a secas deja a
  // alguien reintentando la misma subida.
  it("el tope dice cuánto pesa y qué hacer", () => {
    const motivo = motivoRechazo(archivo("video.mp4", MAX_BYTES + 1));
    expect(motivo).toContain("MB");
    expect(motivo).toContain("pega el enlace");
  });

  it("justo en el límite se acepta", () => {
    expect(motivoRechazo(archivo("video.mp4", MAX_BYTES))).toBeNull();
  });
});

describe("nombre con el que se guarda", () => {
  it("quita lo que Drive no admite", () => {
    expect(nombreSeguro('brief: v2 / final?.pdf')).toBe("brief- v2 - final-.pdf");
  });

  // Pasa con archivos subidos desde el móvil: quedaría un archivo sin nombre en
  // la carpeta compartida, imposible de distinguir del resto.
  it("nunca se queda sin nombre", () => {
    expect(nombreSeguro("")).toBe("archivo");
    expect(nombreSeguro("   ")).toBe("archivo");
  });

  // Cortar por el final perdería la extensión y el archivo dejaría de abrirse
  // con su programa.
  it("al acortar conserva la extensión", () => {
    const largo = "x".repeat(300) + ".pdf";
    const salida = nombreSeguro(largo);
    expect(salida.length).toBeLessThanOrEqual(200);
    expect(salida.endsWith(".pdf")).toBe(true);
  });

  it("saca la extensión sin confundirse", () => {
    expect(extensionDe("a.b.tar.gz")).toBe("gz");
    expect(extensionDe("sin_extension")).toBe("");
    expect(extensionDe("Foto.PNG")).toBe("png");
  });
});

describe("tamaño legible", () => {
  it("escala la unidad", () => {
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  // Drive no siempre devuelve el tamaño. Un "0 B" haría pensar que el archivo
  // se subió vacío.
  it("sin dato devuelve null, no cero", () => {
    expect(tamanoLegible(null)).toBeNull();
    expect(tamanoLegible(0)).toBeNull();
    expect(tamanoLegible(undefined)).toBeNull();
  });
});
