---
name: Verificación autenticada en dev
description: Cómo verificar en vivo páginas/endpoints que exigen sesión y rol, cuando la captura de pantalla llega sin autenticar.
---

# Verificación autenticada en dev

La herramienta de captura de pantalla navega **sin cookies**: en esta app solo ve la página de login. Para verificar en vivo algo que exige sesión:

1. **Cuenta de prueba**: el backend expone un login de revisor (dev-only, deshabilitado en prod salvo opt-in). Las credenciales están hardcodeadas en las rutas de auth (buscar `test-login`). Sirve para `curl -c jar` contra el backend (:3001) y para que el tester e2e entre por el formulario "Iniciar con cuenta de prueba".
2. **Flip de rol**: esa cuenta tiene `team_role='tester'`, que muchos gates rechazan. Para ejercitar gates por rol en vivo: `UPDATE users SET team_role='<rol>' WHERE google_id='test-reviewer-account'` en DB dev (passport deserializa fresco por request, aplica de inmediato). **Restaurar a `tester` al terminar.**
3. **Semillas**: si la serie/pantalla necesita datos, sembrar filas en DB dev con valores sintéticos predecibles (p. ej. tendencia lineal exacta → R²=1 verifica la matemática de punta a punta). Verificar antes que la clave de limpieza (p. ej. `user_id` del revisor) no tenga filas previas, y **borrar las semillas al final**.

**Why:** la única vía visual autenticada es el subagente de testing; curl + flip de rol es la vía barata para probar gates y payloads reales sin montar OAuth.

**How to apply:** cualquier verificación en vivo de rutas bajo sesión/rol en esta app (gates 403, catálogos filtrados por rol, páginas nuevas). Siempre dejar DB y rol como estaban.
