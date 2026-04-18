// backend/server.js
// Servidor Express con todas las rutas de WebMakerLatam
// Integrar esto en tu server.js existente o usar como referencia

import express from "express";
import cors from "cors";
import {
  generarHistoriaHandler,
  listarHistoriasHandler,
} from "./generarHistoria.js";
import {
  generarDescripcionesHandler,
  listarDescripcionesHandler,
  eliminarDescripcionHandler,
} from "./generarDescripciones.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================================
// RUTAS - HISTORIAS
// ============================================
app.post("/api/historias/generar", generarHistoriaHandler);
app.get("/api/historias", listarHistoriasHandler);

// ============================================
// RUTAS - DESCRIPCIONES
// ============================================
app.post("/api/descripciones/generar", generarDescripcionesHandler);
app.get("/api/descripciones", listarDescripcionesHandler);
app.delete("/api/descripciones/:id", eliminarDescripcionHandler);

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🦊 WebMakerLatam API corriendo en puerto ${PORT}`);
});
