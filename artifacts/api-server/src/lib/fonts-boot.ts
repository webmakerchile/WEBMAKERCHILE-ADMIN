// Módulo de efecto secundario: registra las fuentes del repo ANTES de que
// cualquier otro módulo cargue Sharp/librsvg (routes/community importa sharp a
// nivel de módulo). Debe ser el PRIMER import de src/index.ts — en ESM los
// imports se ejecutan en orden de declaración, así que esto corre antes que
// el resto del árbol de módulos.
import { setupFonts } from "./fonts";

setupFonts();
