---
name: Resend vía conector de Replit
description: Cómo se envía correo en este proyecto y las trampas de la cuenta Resend conectada.
---

# Correo saliente con Resend (conector de Replit)

**Regla:** todo el correo sale por un único módulo de transporte que NUNCA lanza —
devuelve `{ok}` o `{ok:false, motivo:"sin_configurar"|"fallido", detalle}` y quien
llama guarda ese resultado donde el equipo lo vea (panel), jamás solo en logs.
El envío de correo no decide la suerte del flujo que lo dispara (una firma vale
aunque el correo falle).

**Trampas de la cuenta conectada (verificadas):**
- La llave del conector es **solo-envío**: `GET /domains` responde 401
  `restricted_api_key`. No se puede autodetectar el dominio verificado.
- Sin dominio verificado, Resend está en modo prueba: solo entrega al correo del
  DUEÑO de la cuenta Resend (webmakerchile@gmail.com) y rechaza el resto con un
  mensaje claro que ya se guarda y se muestra en el panel.
- `RESEND_FROM` (env compartida) define el remitente; está puesto al remitente de
  pruebas `WebMaker Latam <onboarding@resend.dev>` para que las copias internas
  (dueño de la cuenta) SÍ lleguen mientras el dominio siga sin verificar. OJO: con
  la env definida NO hay auto-sanado — cuando Lucas verifique webmakerlatam.com en
  resend.com/domains hay que RESTAURAR `WebMaker Latam <ventas@webmakerlatam.com>`
  a mano (+ reiniciar ambos backends y republicar).

**Why:** el 401 de /domains hace inútil cualquier lógica de "buscar dominio
verificado"; y un fallback silencioso a otro remitente escondería el problema real.

**How to apply:** para cualquier correo nuevo, reutilizar el transporte único y
persistir el estado por destinatario; el SDK es `@replit/connectors-sdk` con
`connectors.proxy("resend", "/emails", ...)` (devuelve Response tipo fetch).
Enlaces dentro de correos: construir la base SOLO de config/plataforma
(PUBLIC_BASE_URL o REPLIT_DOMAINS), nunca de cabeceras de la petición pública.
