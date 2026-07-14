import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { videoIdeas } from "@workspace/db/schema";
import { eq, desc, isNotNull, isNull } from "drizzle-orm";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { mkdirSync } from "fs";
import { ai } from "@workspace/integrations-gemini-ai";
import { firstText } from "../../lib/gemini-parts";

const router: IRouter = Router();

const VIDEO_CATEGORIES = [
  { key: "corto-viral", label: "Corto Viral", description: "Videos de 25-35 seg que enganchan al instante con una sola idea impactante", icon: "Zap" },
  { key: "problema-solucion", label: "Problema / Solución", description: "Identifica un dolor del emprendedor y muestra la solución directa", icon: "Target" },
  { key: "marketing", label: "Marketing", description: "Videos que posicionan y generan leads con datos concretos", icon: "Megaphone" },
  { key: "storytelling", label: "Historia", description: "Historias emotivas de transformación digital que conectan", icon: "BookOpen" },
  { key: "behind-scenes", label: "Behind the Scenes", description: "Mostrar el proceso real de trabajo para generar confianza", icon: "Wrench" },
  { key: "tutorial", label: "Tutorial / Tips", description: "Enseñar algo útil y accionable que puedan aplicar hoy", icon: "Lightbulb" },
  { key: "tendencia", label: "Tendencia / Hot Take", description: "Opinar sobre tendencias actuales de tech y negocios", icon: "TrendingUp" },
  { key: "pack-del-dia", label: "Pack del Día", description: "1 corto + 1 marketing + 1 historia + 1 problema/solución + 1 tip", icon: "Package", isPack: true },
];

const VALID_CATEGORIES = ["corto-viral", "storytelling", "marketing", "behind-scenes", "tutorial", "tendencia", "problema-solucion", "pack-del-dia"];

router.get("/studio/categories", async (_req, res) => {
  res.json(VIDEO_CATEGORIES);
});

router.get("/studio/ideas", async (_req, res) => {
  try {
    const allIdeas = await db
      .select()
      .from(videoIdeas)
      .orderBy(desc(videoIdeas.createdAt));
    res.json(allIdeas);
  } catch (error) {
    console.error("Error fetching AI video ideas:", error);
    res.status(500).json({ error: "Error al obtener ideas" });
  }
});

router.post("/studio/ideas/generate", async (req, res) => {
  try {
    const today = new Date().toLocaleDateString("es-CL", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const batchDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

    const rawCategory: string = req.body.category || "corto-viral";
    const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "corto-viral";
    const userContext: string = req.body.context || "";

    const BASE_IDENTITY = `Eres un creador de contenido experto que trabaja con WebMakerChile, empresa tecnologica chilena especializada en AUTOMATIZACION y TRANSFORMACION DIGITAL. Tu estilo es NATURAL y VARIADO, como si hablaras con un amigo emprendedor. NUNCA suenas como vendedor agresivo. NUNCA repitas ideas ni enfoques similares.

LA CLAVE DE WEBMAKERCHILE ES: AUTOMATIZACION.
Todo lo que hace WebMakerChile gira en torno a automatizar procesos, eliminar trabajo manual y hacer que los negocios funcionen solos con tecnologia. Esta es la palabra clave que SIEMPRE debe aparecer como concepto central.

AREAS DE WEBMAKERCHILE (varía entre TODAS, no solo webs):
1. AUTOMATIZACION DE PROCESOS: Flujos automaticos, integraciones entre sistemas, eliminar tareas manuales repetitivas, conectar herramientas (CRM + WhatsApp + Facturacion + Email). Robots de software que trabajan 24/7.
2. CHATBOTS CON IA: Asistentes virtuales inteligentes para WhatsApp, sitios web, Instagram. Atienden clientes, agendan citas, responden FAQs, califican leads, procesan pedidos. Sin contratar personal.
3. SOFTWARE A MEDIDA: ERP, CRM, SaaS, POS, dashboards, paneles de control, sistemas de inventario, facturacion electronica, gestion de proyectos. Cada negocio es unico y merece su propio sistema.
4. APPS MOVILES: iOS y Android nativas, apps internas para equipos, apps de delivery, apps de gestion, apps de fidelizacion de clientes.
5. E-COMMERCE Y TIENDAS ONLINE: Tiendas completas con pasarelas de pago chilenas (Webpay, Flow, MercadoPago), carrito, inventario automatizado, notificaciones.
6. LANDING PAGES Y SITIOS WEB: Paginas de venta, sitios corporativos, portafolios, blogs, sitios multilenguaje.
7. INTELIGENCIA ARTIFICIAL APLICADA: Analisis de datos automatico, generacion de reportes con IA, clasificacion de clientes, prediccion de ventas, procesamiento de documentos.
8. INTEGRACIONES: Conectar cualquier sistema con otro (Google Sheets + WhatsApp + banco + inventario + correo). APIs, webhooks, middleware.
9. MARKETING DIGITAL AUTOMATIZADO: Emails automaticos, secuencias de nurturing, remarketing, segmentacion con IA, reportes automaticos.
10. CONSULTORIA TECNOLOGICA: Diagnostico digital de empresas, roadmaps de digitalizacion, capacitacion en herramientas digitales.

PRECIOS REFERENCIALES:
- Landing Pages desde $200.000 + IVA (5-7 dias)
- Sitios Web desde $350.000 + IVA (10-15 dias)
- E-Commerce desde $700.000 + IVA (15-20 dias)
- Software, Apps, Chatbots, Automatizaciones (a cotizar segun complejidad)
- Todos incluyen: 30 dias garantia + 1 mes hosting gratis

IDENTIDAD DE MARCA:
- WebMakerChile NO es solo una "agencia de diseño web". Es una empresa de TECNOLOGIA y AUTOMATIZACION.
- Trabaja con PYMEs y emprendedores reales en Chile y LATAM
- Usa tecnologia moderna (React, IA, Node.js, automatizaciones, integraciones)
- El fundador graba los videos hablando a camara de forma natural y cercana

PUBLICO OBJETIVO: Empresarios, emprendedores, PYMEs, startups y profesionales independientes en Chile y LATAM que quieren automatizar su negocio, vender mas y trabajar menos.

REGLAS UNIVERSALES:
1. Tono CONVERSACIONAL. Como si le hablaras a un emprendedor en un cafe.
2. NUNCA presentes personajes ficticios como clientes reales. Usa escenarios HIPOTETICOS: "Imaginate que Don Carlos tiene una panaderia..."
3. No uses asteriscos (**), ni caracteres especiales decorativos.
4. Hashtags: mezclar tendencias + nicho + #WebMakerChile siempre.
5. CTA suave: "+56 9 5365 7460" o "webmakerchile.com".
6. VARIEDAD OBLIGATORIA: Cada idea debe cubrir un area DIFERENTE de WebMakerChile. No generes 3 ideas seguidas sobre lo mismo. Alterna entre automatizacion, chatbots, apps, software, IA, integraciones, etc.
7. La palabra "automatizacion" o el concepto de automatizar debe aparecer NATURALMENTE en al menos el 70% de las ideas.`;

    const GUION_RULES = `REGLAS DEL GUION (CRITICO - CUMPLIR AL 100%):
El guion es TEXTO PURO para leer frente a camara. El creador LEE TODO DE CORRIDO frente a la camara.
El guion debe fluir como una conversacion natural, SIN separaciones ni secciones.

PROHIBIDO (NUNCA incluir esto en un guion):
- SIN corchetes [asi] → PROHIBIDO
- SIN parentesis con indicaciones (asi) → PROHIBIDO
- SIN "Indicacion visual", "tono de voz", "close-up", "camara frontal" → NADA de meta-instrucciones
- SIN timestamps como "(0:00-0:03)" → PROHIBIDO
- SIN secciones como "INTRO:" "DESARROLLO:" "CIERRE:" → PROHIBIDO
- SIN saltos de seccion ni divisiones → TODO CORRIDO
- SIN asteriscos ** ni caracteres decorativos

ESTILO OBLIGATORIO:
- Frases CORTAS y DIRECTAS. Una oracion por linea.
- Que suene como una persona hablando natural, NO como un robot leyendo instrucciones.
- Ganchos POTENTES en los primeros 2 segundos: "Sabias que...", "El error del 90% de...", "POV: tienes un negocio y...", dato estadistico impactante.
- Siempre terminar con CTA: "Escribenos al +56 9 5365 7460" o "Visita webmakerchile.com"
- El texto se lee TODO DE CORRIDO, de principio a fin, sin pausas artificiales ni secciones.

EJEMPLO CORRECTO:
"Sabes cuantos clientes pierdes por no responder a tiempo?\\nEl 78% de la gente compra al primero que le responde.\\nSi tardas 2 horas en contestar un WhatsApp, tu competencia ya cerro esa venta.\\nLa solucion? Un chatbot con inteligencia artificial que responde en 3 segundos. Las 24 horas. Los 7 dias.\\nSin contratar a nadie. Sin pagar sueldos.\\nAutomatiza tu atencion y deja de perder ventas.\\nEscribenos al +56 9 5365 7460"

EJEMPLO INCORRECTO (NUNCA hacer esto):
"INTRO (0:00-0:03):\\n[Camara frontal, tono energico]\\nHook directo.\\n(pausa dramatica)\\nDESARROLLO (0:03-0:25):\\n[Mostrar pantalla]\\nExplicar beneficios..."`;

    const CATEGORY_PROMPTS: Record<string, { instruction: string; count: number; duration: string }> = {
      "corto-viral": {
        count: 5,
        duration: "25-35 segundos",
        instruction: `CATEGORIA: CORTO VIRAL (25-35 segundos)
Videos ultra-cortos con GANCHO brutal en los primeros 2 segundos.
- UNA sola idea por video. Un dolor, una solucion, un dato impactante.
- Ganchos variados: "Sabias que...", "El error del 90% de...", "POV: tienes un negocio y...", dato estadistico shocking, pregunta directa, afirmacion polermica.
- Frases cortas. Ritmo rapido. Sin relleno. El espectador debe querer compartirlo.
- CADA idea debe cubrir un AREA DIFERENTE. Ejemplos de temas variados:
  * Un video sobre chatbots IA que atienden WhatsApp
  * Un video sobre automatizar la facturacion
  * Un video sobre apps moviles para negocios
  * Un video sobre conectar sistemas (integraciones)
  * Un video sobre dashboards que muestran todo en tiempo real
  * Un video sobre software a medida vs usar Excel
  * Un video sobre marketing automatizado
- PROHIBIDO hacer 2+ videos sobre "tener pagina web". Webmakerchile es MUCHO mas que webs.
- Plataformas: TikTok, Instagram Reels, YouTube Shorts.`,
      },
      "storytelling": {
        count: 3,
        duration: "60-90 segundos",
        instruction: `CATEGORIA: STORYTELLING (60-90 segundos)
Historias con personajes ficticios que conecten emocionalmente.
- Estructura: Problema del personaje -> Lucha -> Descubre la automatizacion -> Transformacion.
- Personajes variados: duena de cafeteria, dentista, dueno de ferreteria, contadora independiente, dueno de gym, veterinaria, arquitecto, importador, duena de salon de belleza, mecanico, agente inmobiliario, restaurantero.
- CADA historia debe girar en torno a un SERVICIO DIFERENTE:
  * Historia sobre automatizar pedidos con chatbot
  * Historia sobre app movil para delivery propio
  * Historia sobre CRM que organizo sus clientes
  * Historia sobre sistema de inventario automatico
  * Historia sobre integraciones que eliminaron trabajo manual
  * Historia sobre IA que analiza sus ventas
- Detalles concretos: numeros, emociones, situaciones del dia a dia chileno.
- El servicio aparece como solucion natural, nunca forzado.
- Final inspirador con resultado tangible.
- Plataformas: Instagram Reels, YouTube, TikTok.`,
      },
      "marketing": {
        count: 4,
        duration: "30-45 segundos",
        instruction: `CATEGORIA: MARKETING Y VENTAS (30-45 segundos)
Videos que posicionen a WebMakerChile como expertos en AUTOMATIZACION, generando LEADS sin parecer publicidad.
- Alternar entre TODOS los servicios, no solo webs:
  * "Un chatbot atiende 24/7 sin sueldo, sin vacaciones, sin errores"
  * "Tu CRM clasifica clientes automaticamente mientras duermes"
  * "Un sistema a medida elimina 20 horas semanales de trabajo manual"
  * "Una app propia vale mas que depender de apps de terceros"
  * "Automatizar tu facturacion ahorra 3 dias al mes"
  * "Un dashboard te muestra en tiempo real como va tu negocio"
- Comparar costos: "Un empleado para datos cuesta $600.000/mes. Un sistema automatizado, una sola vez".
- Responder objeciones: "Es muy caro", "No se de tecnologia", "Mi negocio es chico", "Ya uso Excel".
- Ser TRANSPARENTE con precios y plazos reales.
- La AUTOMATIZACION siempre debe ser el hilo conductor.
- Plataformas: Instagram Reels, TikTok, LinkedIn.`,
      },
      "behind-scenes": {
        count: 3,
        duration: "30-50 segundos",
        instruction: `CATEGORIA: BEHIND THE SCENES (30-50 segundos)
Narrar el proceso de trabajo como si le contaras a un amigo lo que haces.
- Variar entre DIFERENTES proyectos:
  * "Estoy programando un chatbot con IA para una clinica dental..."
  * "Hoy estamos conectando el inventario de una ferreteria con su WhatsApp..."
  * "Le estamos haciendo una app de delivery a un restaurante..."
  * "Estamos automatizando toda la facturacion de una empresa..."
  * "Creamos un dashboard que le muestra las ventas en tiempo real..."
  * "Integramos su calendario con WhatsApp para agendar citas automaticamente..."
- Explicar cosas tecnicas de forma simple y natural.
- Humanizar: mencionar el cafe, la musica, los errores, las victorias pequenas.
- El espectador debe pensar "estos hacen de TODO y saben lo que hacen".
- Plataformas: TikTok, Instagram Reels.`,
      },
      "tutorial": {
        count: 3,
        duration: "35-60 segundos",
        instruction: `CATEGORIA: TUTORIAL / TIPS (35-60 segundos)
UN solo tip practico que el emprendedor pueda aplicar HOY.
- Concreto y accionable. Que despues de verlo pueda hacer algo inmediatamente.
- Temas VARIADOS (NO solo sobre webs):
  * Como automatizar respuestas en WhatsApp Business
  * 3 procesos que todo negocio deberia automatizar YA
  * Como saber si necesitas un software a medida o te basta con Excel
  * Que es un chatbot con IA y como funciona para tu negocio
  * Como conectar tu tienda online con tu inventario automaticamente
  * 3 senales de que tu negocio necesita una app movil
  * Como la IA puede analizar tus datos de ventas
  * Que es un CRM y por que lo necesitas (aunque seas chico)
  * Como automatizar tu facturacion electronica en Chile
  * 3 integraciones que todo emprendedor necesita
- Formato numerado funciona: "3 cosas que deberias automatizar", "El truco que usan las empresas exitosas para...".
- El contenido debe ser tan util que quieran guardarlo y compartirlo.
- Plataformas: Instagram Reels, TikTok, YouTube Shorts.`,
      },
      "tendencia": {
        count: 3,
        duration: "30-45 segundos",
        instruction: `CATEGORIA: TENDENCIA / HOT TAKE (30-45 segundos)
Opinion fuerte sobre tendencias actuales de tecnologia, automatizacion y negocios.
- Temas variados y actuales:
  * "La IA no te va a quitar el trabajo, pero la automatizacion si va a reemplazar a quien no la use"
  * "El 2026 es el ano de los chatbots en LATAM y tu todavia contestas manual"
  * "Las apps no-code estan matando a las empresas... y te explico por que"
  * "Por que las PYMEs que automatizan venden 3x mas que las que no"
  * "Excel esta matando tu negocio y no te has dado cuenta"
  * "El futuro del retail no es una tienda bonita, es un sistema inteligente"
  * "Los negocios que no integren IA en 2026 van a desaparecer"
  * "Tener pagina web ya no es suficiente. Necesitas un ecosistema digital"
- Tomar posicion clara y provocadora.
- Conectar la tendencia con la AUTOMATIZACION y los servicios de WebMakerChile.
- Generar debate: que el espectador quiera comentar su opinion.
- Plataformas: TikTok, LinkedIn, YouTube Shorts.`,
      },
      "problema-solucion": {
        count: 4,
        duration: "25-40 segundos",
        instruction: `CATEGORIA: PROBLEMA-SOLUCION (25-40 segundos)
Identificar un DOLOR especifico del emprendedor y mostrar como la AUTOMATIZACION lo resuelve.
- CADA idea debe abordar un PROBLEMA DIFERENTE:
  * Perder clientes por no responder a tiempo → Chatbot IA 24/7
  * Hacer todo manual en Excel → Software a medida
  * No saber cuanto vende realmente → Dashboard en tiempo real
  * Procesos repetitivos que consumen horas → Automatizacion de flujos
  * Depender de un empleado para atender WhatsApp → Chatbot
  * Inventario desordenado → Sistema de inventario automatizado
  * Facturar a mano → Facturacion electronica automatica
  * No poder vender fuera del horario → E-commerce con chatbot
  * Equipo desorganizado → App interna de gestion
  * Clientes que no vuelven → CRM con seguimiento automatico
- Empezar con el problema que el espectador vive AHORA: "Te pasa que...", "Si tu negocio...".
- Solucion clara, tangible y creible. Sin promesas vacias.
- El espectador debe sentir "esto me pasa a mi, necesito resolverlo".
- Plataformas: TikTok, Instagram Reels, YouTube Shorts.`,
      },
    };

    const generateForCategory = async (cat: string, customContext: string): Promise<any[]> => {
      const config = CATEGORY_PROMPTS[cat] || CATEGORY_PROMPTS["corto-viral"];
      const prompt = `${BASE_IDENTITY}

${config.instruction}

${customContext ? `INSTRUCCION DEL USUARIO (prioridad maxima):\n"${customContext}"\n` : ""}
Fecha: ${today}

${GUION_RULES}

Genera exactamente ${config.count} ideas de video.

RESPONDE SOLO EN JSON valido:
{
  "ideas": [
    {
      "titulo": "Titulo CORTO y directo (5-7 palabras max, sin emojis)",
      "descripcion": "Tendencia actual que respalda esta idea y por que funcionaria (2-3 lineas)",
      "guion": "TEXTO PURO para leer de corrido frente a camara. SIN corchetes, SIN parentesis, SIN timestamps, SIN secciones. Solo frases cortas que voy a DECIR en voz alta, separadas por salto de linea.",
      "plataforma": "TikTok|Instagram Reels|YouTube Shorts|YouTube|LinkedIn",
      "tendencia": "Tendencia especifica de 2025/2026 que respalda esta idea",
      "duracionSugerida": "${config.duration}",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#WebMakerChile"]
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const responseText = firstText(response.candidates?.[0]?.content?.parts);
      const cleanedText = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleanedText);
      if (!parsed.ideas || !Array.isArray(parsed.ideas)) return [];
      return parsed.ideas.slice(0, config.count);
    };

    let allIdeas: { idea: any; cat: string }[] = [];

    if (category === "pack-del-dia") {
      const packCategories = ["corto-viral", "marketing", "storytelling", "problema-solucion", "tutorial"];
      const packPrompt = `${BASE_IDENTITY}

Eres un estratega de contenido. Genera un PACK DIARIO de contenido variado con exactamente 5 ideas, una de cada tipo.
REGLA CRITICA: Cada idea DEBE cubrir un SERVICIO/AREA DIFERENTE de WebMakerChile. No repitas el mismo enfoque.

1. CORTO VIRAL (25-35 seg): Hook brutal sobre AUTOMATIZACION o CHATBOTS o IA. Algo que impacte.
2. MARKETING (30-45 seg): Posicionar un servicio diferente al del punto 1 (ej: si el viral fue de chatbot, este de software a medida o apps).
3. STORYTELLING (60-90 seg): Historia hipotetica de un emprendedor que automatiza su negocio (usar un servicio diferente a los anteriores).
4. PROBLEMA-SOLUCION (25-40 seg): Dolor concreto + solucion con OTRO servicio diferente (ej: integraciones, CRM, dashboard, facturacion).
5. TUTORIAL/TIP (35-60 seg): Tip practico sobre OTRO tema diferente (ej: como elegir entre app propia vs web, que automatizar primero, como funciona un ERP).

${userContext ? `INSTRUCCION DEL USUARIO (prioridad maxima):\n"${userContext}"\n` : ""}
Fecha: ${today}

${GUION_RULES}

RESPONDE SOLO EN JSON valido:
{
  "ideas": [
    {
      "titulo": "Titulo",
      "descripcion": "Descripcion",
      "guion": "TEXTO PURO para leer de corrido frente a camara. SIN corchetes, SIN parentesis, SIN timestamps, SIN secciones. Solo frases cortas separadas por salto de linea.",
      "plataforma": "TikTok|Instagram Reels|YouTube Shorts|YouTube|LinkedIn",
      "tendencia": "Tendencia",
      "duracionSugerida": "XX-XX segundos",
      "hashtags": ["#tag1", "#WebMakerChile"],
      "category": "corto-viral|marketing|storytelling|problema-solucion|tutorial"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: "user", parts: [{ text: packPrompt }] }],
      });
      const responseText = firstText(response.candidates?.[0]?.content?.parts);
      const cleanedText = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleanedText);
      if (parsed.ideas && Array.isArray(parsed.ideas)) {
        parsed.ideas.slice(0, 5).forEach((idea: any, i: number) => {
          const rawCat = idea.category || packCategories[i % packCategories.length];
          const cat = VALID_CATEGORIES.includes(rawCat) && rawCat !== "pack-del-dia" ? rawCat : packCategories[i % packCategories.length];
          allIdeas.push({ idea, cat });
        });
      }
    } else {
      const ideas = await generateForCategory(category, userContext);
      allIdeas = ideas.map(idea => ({ idea, cat: category }));
    }

    const existingIdeas = await db
      .select({ titulo: videoIdeas.titulo })
      .from(videoIdeas);
    const existingTitles = existingIdeas.map(e =>
      e.titulo.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim()
    );
    const isSimilar = (newTitle: string): boolean => {
      const normalized = newTitle.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim();
      const newWords = normalized.split(/\s+/).filter((w: string) => w.length > 3);
      return existingTitles.some(existing => {
        if (normalized === existing) return true;
        const existingWords = existing.split(/\s+/).filter((w: string) => w.length > 3);
        if (existingWords.length === 0 || newWords.length === 0) return false;
        const overlap = newWords.filter((w: string) => existingWords.includes(w)).length;
        const similarity = overlap / Math.max(newWords.length, existingWords.length);
        return similarity >= 0.7;
      });
    };

    const savedIdeas = [];
    let skippedCount = 0;
    for (const { idea, cat } of allIdeas) {
      const titulo = idea.titulo || "Sin titulo";
      if (isSimilar(titulo)) {
        console.log(`[AI Video Ideas] Skipped similar: "${titulo}"`);
        skippedCount++;
        continue;
      }
      const [saved] = await db.insert(videoIdeas).values({
        titulo,
        descripcion: idea.descripcion || "",
        guion: idea.guion || "",
        plataforma: idea.plataforma || "TikTok",
        tendencia: idea.tendencia || null,
        duracionSugerida: idea.duracionSugerida || "30 segundos",
        hashtags: idea.hashtags || [],
        saved: false,
        batchDate,
        category: cat,
      }).returning();
      savedIdeas.push(saved);
      existingTitles.push(titulo.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim());
    }

    const msg = skippedCount > 0
      ? `${savedIdeas.length} ideas generadas (${skippedCount} repetidas descartadas)`
      : `${savedIdeas.length} ideas generadas`;
    res.json({ message: msg, ideas: savedIdeas, category });
  } catch (error) {
    console.error("Error generating AI video ideas:", error);
    res.status(500).json({ error: "Error al generar ideas con IA" });
  }
});

router.patch("/studio/ideas/:id/save", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(videoIdeas)
      .set({ saved: true })
      .where(eq(videoIdeas.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Idea no encontrada" }); return; }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Error al guardar idea" });
  }
});

router.patch("/studio/ideas/:id/unsave", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(videoIdeas)
      .set({ saved: false })
      .where(eq(videoIdeas.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Idea no encontrada" }); return; }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Error al quitar guardado" });
  }
});

router.delete("/studio/ideas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(videoIdeas).where(eq(videoIdeas.id, id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar idea" });
  }
});

router.delete("/studio/ideas", async (req, res) => {
  try {
    const keepRecorded = req.query.keepRecorded === "true";
    if (keepRecorded) {
      await db.delete(videoIdeas).where(isNull(videoIdeas.recordedAt));
    } else {
      await db.delete(videoIdeas);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar ideas" });
  }
});

router.patch("/studio/ideas/:id/record", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(videoIdeas)
      .set({ recordedAt: new Date() })
      .where(eq(videoIdeas.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Error al marcar como grabado" });
  }
});

router.patch("/studio/ideas/:id/unrecord", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(videoIdeas)
      .set({ recordedAt: null })
      .where(eq(videoIdeas.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Error al desmarcar grabación" });
  }
});

router.post("/studio/ideas/:id/generate-cover", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "ID invalido" }); return; }
    const [idea] = await db.select().from(videoIdeas).where(eq(videoIdeas.id, id)).limit(1);
    if (!idea) { res.status(404).json({ error: "Idea no encontrada" }); return; }

    const { generateCoverImage } = await import("./cover-generator");
    const coverUrl = await generateCoverImage(idea.titulo, idea.descripcion || idea.titulo);

    const [updated] = await db
      .update(videoIdeas)
      .set({ coverImageUrl: coverUrl })
      .where(eq(videoIdeas.id, id))
      .returning();

    res.json({ success: true, coverImageUrl: coverUrl, idea: updated });
  } catch (error: any) {
    console.error("[CoverGen] Error:", error.message);
    res.status(500).json({ error: error.message || "Error al generar portada" });
  }
});

router.get("/studio/suggested-day", async (_req, res) => {
  try {
    const { getSuggestedDay } = await import("./google-drive");
    const result = getSuggestedDay();
    res.json(result);
  } catch (err: any) {
    console.error("[Studio] Suggested day error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/studio/recording-stats", async (_req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allRecorded = await db
      .select({ recordedAt: videoIdeas.recordedAt })
      .from(videoIdeas)
      .where(isNotNull(videoIdeas.recordedAt))
      .orderBy(desc(videoIdeas.recordedAt));

    const weeklyCount = allRecorded.filter(
      (r) => r.recordedAt && r.recordedAt >= startOfWeek
    ).length;

    const monthlyCount = allRecorded.filter(
      (r) => r.recordedAt && r.recordedAt >= startOfMonth
    ).length;

    let streak = 0;
    if (allRecorded.length > 0) {
      const recordedDates = new Set(
        allRecorded.map((r) =>
          r.recordedAt!.toLocaleDateString("en-CA", { timeZone: "America/Santiago" })
        )
      );
      const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
      const checkDate = new Date(todayStr + "T12:00:00");

      if (!recordedDates.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (true) {
        const dateStr = checkDate.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
        if (recordedDates.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    res.json({ weeklyCount, monthlyCount, totalCount: allRecorded.length, streak });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

const studioPreviewDir = path.join(process.cwd(), "public", "uploads", "studio-previews");
try { mkdirSync(studioPreviewDir, { recursive: true }); } catch {}

const studioVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "/tmp"),
    filename: (_req, file, cb) => cb(null, `studio-${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post("/studio/temp-preview", (req, res, next) => {
  studioVideoUpload.single("video")(req, res, (err: any) => {
    if (err) {
      console.error("[studio] Multer error (temp-preview):", err.message, "| code:", err.code);
      res.status(400).json({ error: "Error receiving video file" });
      return;
    }
    next();
  });
}, async (req, res) => {
  const ts = Date.now();
  const fixedFilename = `preview-${ts}.mp4`;
  const fixedPath = path.join(studioPreviewDir, fixedFilename);
  try {
    if (!req.file) {
      res.status(400).json({ error: "No video received" });
      return;
    }
    const { rename, unlink: unlinkFile, copyFile } = await import("fs/promises");
    const uploadedPath = (req.file as any).path as string;
    try {
      await rename(uploadedPath, fixedPath);
    } catch {
      await copyFile(uploadedPath, fixedPath);
      await unlinkFile(uploadedPath).catch(() => {});
    }
    console.log(`[studio] Preview saved: ${fixedFilename} (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

    setTimeout(async () => {
      try { const { unlink } = await import("fs/promises"); await unlink(fixedPath); } catch {}
    }, 30 * 60 * 1000);

    const staticUrl = `/uploads/studio-previews/${fixedFilename}`;
    res.json({ url: staticUrl });
  } catch (err: any) {
    console.error("Temp preview error:", err);
    res.status(500).json({ error: "Error processing preview" });
  }
});

router.delete("/studio/temp-preview/:filename", async (req, res) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9\-_.]/g, "");
    const filePath = path.join(studioPreviewDir, filename);
    const { unlink } = await import("fs/promises");
    await unlink(filePath);
  } catch {}
  res.json({ ok: true });
});

const studioChunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

router.post("/studio/upload-chunk", (req, res, next) => {
  studioChunkUpload.single("chunk")(req, res, (err: any) => {
    if (err) {
      console.error("[studio] Multer chunk error:", err.message);
      res.status(400).json({ error: "Error receiving chunk" });
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const { appendFile, writeFile } = await import("fs/promises");
    const uploadId = req.body.uploadId;
    const chunkIndex = parseInt(req.body.chunkIndex);
    const totalChunks = parseInt(req.body.totalChunks);
    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !req.file) {
      res.status(400).json({ error: "Missing chunk data" });
      return;
    }
    const safeId = uploadId.replace(/[^a-zA-Z0-9\-_]/g, "");
    const tempPath = path.join("/tmp", `studio-chunked-${safeId}`);
    if (chunkIndex === 0) {
      await writeFile(tempPath, req.file.buffer);
    } else {
      await appendFile(tempPath, req.file.buffer);
    }
    console.log(`[Studio] Chunk ${chunkIndex + 1}/${totalChunks} received (${(req.file.size / 1024).toFixed(0)}KB) for ${safeId}`);
    res.json({ ok: true, chunkIndex, received: true });
  } catch (err: any) {
    console.error("[Studio] Chunk error:", err);
    res.status(500).json({ error: "Error saving chunk" });
  }
});

router.post("/studio/finalize-upload", async (req, res) => {
  const allTempFiles: string[] = [];
  try {
    const { uploadId, ideaId: rawIdeaId, ideaTitle: rawTitle, ideaGuion: rawGuion, videoMimeType: clientMimeType, segments: rawSegments, targetDay: rawTargetDay, targetTime: rawTargetTime, publishToTiktok: rawPublishToTiktok } = req.body;
    if (!uploadId) { res.status(400).json({ error: "Missing uploadId" }); return; }
    const userId = (req.user as any).id as number;
    const publishToTiktok = rawPublishToTiktok === true || rawPublishToTiktok === "true";

    const safeId = uploadId.replace(/[^a-zA-Z0-9\-_]/g, "");
    const tempPath = path.join("/tmp", `studio-chunked-${safeId}`);
    allTempFiles.push(tempPath);

    const { stat: fsStat } = await import("fs/promises");
    const stats = await fsStat(tempPath).catch(() => null);
    if (!stats || stats.size < 100) {
      res.status(400).json({ error: "No video file found. Upload chunks first." });
      return;
    }
    console.log(`[Studio] Finalizing upload ${safeId}: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

    const ideaId = rawIdeaId ? parseInt(rawIdeaId) : null;
    let ideaTitle = rawTitle || "Video sin titulo";
    let ideaGuion = rawGuion || "";
    let segmentsParam: Array<{start: number, end: number}> | null = null;
    try {
      if (rawSegments) {
        const parsed = typeof rawSegments === "string" ? JSON.parse(rawSegments) : rawSegments;
        if (Array.isArray(parsed)) {
          segmentsParam = parsed.filter((s: any) =>
            typeof s.start === "number" && typeof s.end === "number" &&
            isFinite(s.start) && isFinite(s.end) && s.start >= 0 && s.end > s.start && s.end < 86400
          ).map((s: any) => ({ start: +s.start.toFixed(2), end: +s.end.toFixed(2) }));
          if (segmentsParam.length === 0) segmentsParam = null;
        }
      }
    } catch {}

    if (ideaId) {
      const idea = await db.select().from(videoIdeas).where(eq(videoIdeas.id, ideaId)).limit(1);
      if (idea.length > 0) {
        if (!rawTitle) ideaTitle = idea[0].titulo;
        ideaGuion = idea[0].guion;
      }
    }

    const { exec: execCb } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(execCb);

    let hasFFmpeg = false;
    try { await execAsync("ffmpeg -version", { timeout: 5000 }); hasFFmpeg = true; console.log("[Studio] ffmpeg available"); } catch { console.warn("[Studio] ffmpeg NOT available - video will be uploaded raw (VFR)"); }

    const isMP4 = (clientMimeType || "").includes("mp4");
    const ext = isMP4 ? "mp4" : "webm";
    let finalVideoPath = tempPath;

    async function probeVideo(filePath: string): Promise<{ width: number; height: number; rotation: number }> {
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -show_entries stream_side_data=rotation -of json "${filePath}"`,
          { timeout: 10000 }
        );
        const info = JSON.parse(stdout);
        const stream = info.streams?.[0] || {};
        const w = parseInt(stream.width) || 0;
        const h = parseInt(stream.height) || 0;
        let rot = 0;
        const sideData = stream.side_data_list || [];
        for (const sd of sideData) {
          if (sd.rotation) rot = parseInt(sd.rotation) || 0;
        }
        console.log(`[Studio] Probe: ${w}x${h} rotation=${rot}`);
        return { width: w, height: h, rotation: rot };
      } catch (e: any) {
        console.warn(`[Studio] ffprobe failed: ${e.message}`);
        return { width: 0, height: 0, rotation: 0 };
      }
    }

    function buildVf(w: number, h: number, rotation: number): string {
      const filters: string[] = [];
      const isLandscape = w > h && Math.abs(rotation) !== 90 && Math.abs(rotation) !== 270;
      const isRotated = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
      if (isLandscape && !isRotated) {
        filters.push("transpose=1");
        console.log("[Studio] Video is landscape -> rotating 90° clockwise to portrait");
      }
      filters.push("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
      return filters.join(",");
    }

    if (hasFFmpeg) {
      const ts = Date.now();
      const rawInputPath = path.join("/tmp", `studio-raw-${ts}.${ext}`);
      allTempFiles.push(rawInputPath);
      const { copyFile } = await import("fs/promises");
      await copyFile(tempPath, rawInputPath);

      const probe = await probeVideo(rawInputPath);
      const vfChain = buildVf(probe.width, probe.height, probe.rotation);
      const cfrVideo = `-vf "${vfChain}" -r 30 -c:v libx264 -preset fast -crf 18 -g 30 -pix_fmt yuv420p -profile:v main -level 4.2`;
      const cfrAudio = `-c:a aac -b:a 128k -ar 44100 -ac 2`;

      try {
        if (segmentsParam && Array.isArray(segmentsParam) && segmentsParam.length > 0) {
          const { writeFile: writeFileAsync } = await import("fs/promises");
          if (segmentsParam.length === 1) {
            const seg = segmentsParam[0];
            const outPath = path.join("/tmp", `studio-seg-out-${ts}.mp4`);
            allTempFiles.push(outPath);
            await execAsync(
              `ffmpeg -y -ss ${seg.start} -i "${rawInputPath}" -to ${(seg.end - seg.start).toFixed(3)} ${cfrVideo} ${cfrAudio} -movflags +faststart -avoid_negative_ts make_zero "${outPath}"`,
              { timeout: 240000 }
            );
            finalVideoPath = outPath;
          } else {
            const segPaths: string[] = [];
            for (let i = 0; i < segmentsParam.length; i++) {
              const seg = segmentsParam[i];
              const segPath = path.join("/tmp", `studio-seg-${ts}-${i}.mp4`);
              allTempFiles.push(segPath);
              await execAsync(
                `ffmpeg -y -ss ${seg.start} -i "${rawInputPath}" -to ${(seg.end - seg.start).toFixed(3)} ${cfrVideo} ${cfrAudio} -avoid_negative_ts make_zero -movflags +faststart "${segPath}"`,
                { timeout: 180000 }
              );
              segPaths.push(segPath);
            }
            const concatListPath = path.join("/tmp", `studio-concat-list-${ts}.txt`);
            allTempFiles.push(concatListPath);
            const concatListContent = segPaths.map(p => `file '${p}'`).join("\n");
            await writeFileAsync(concatListPath, concatListContent);
            const outPath = path.join("/tmp", `studio-concat-out-${ts}.mp4`);
            allTempFiles.push(outPath);
            await execAsync(
              `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart "${outPath}"`,
              { timeout: 120000 }
            );
            finalVideoPath = outPath;
          }
        } else {
          const outPath = path.join("/tmp", `studio-cfr-${ts}.mp4`);
          allTempFiles.push(outPath);
          await execAsync(
            `ffmpeg -y -i "${rawInputPath}" ${cfrVideo} ${cfrAudio} -movflags +faststart "${outPath}"`,
            { timeout: 180000 }
          );
          finalVideoPath = outPath;
        }

        const outStats = await fsStat(finalVideoPath);
        if (!outStats.size || outStats.size < 100) throw new Error("Processed video empty");
        const finalProbe = await probeVideo(finalVideoPath);
        console.log(`[Studio] Processed video: ${(outStats.size / 1024 / 1024).toFixed(1)}MB, final=${finalProbe.width}x${finalProbe.height}`);
      } catch (ffErr: any) {
        console.error(`[Studio] ffmpeg FAILED - uploading raw VFR video. Error: ${ffErr.message}`);
        if (ffErr.stderr) console.error(`[Studio] ffmpeg stderr: ${ffErr.stderr}`);
        finalVideoPath = tempPath;
      }
    }

    const finalStats = await fsStat(finalVideoPath);
    console.log(`[Studio] Uploading to Drive: ${ideaTitle} (${(finalStats.size / 1024 / 1024).toFixed(1)}MB) path=${finalVideoPath}`);
    const actualMimeType = finalVideoPath.endsWith(".webm") ? "video/webm" : "video/mp4";

    const targetDay = typeof rawTargetDay === "string" && rawTargetDay.trim() ? rawTargetDay.trim() : undefined;
    const targetTime = typeof rawTargetTime === "string" && /^\d{1,2}:\d{2}$/.test(rawTargetTime.trim()) ? rawTargetTime.trim() : undefined;
    let fileId = "";
    let webViewLink = "";
    let driveFolderId = "";
    let driveVerified = false;
    let backupLink = "";
    let uploadedDayName = "";
    try {
      const { uploadVideoToDriveFromFile, clearFolderCache } = await import("./google-drive");
      clearFolderCache();
      const driveResult = await uploadVideoToDriveFromFile(finalVideoPath, ideaTitle, userId, actualMimeType, targetDay, targetTime);
      fileId = driveResult.fileId;
      webViewLink = driveResult.webViewLink;
      driveFolderId = driveResult.driveFolderId;
      driveVerified = driveResult.verified;
      uploadedDayName = driveResult.dayName;
      console.log(`[Studio] Video VERIFIED in Drive: ${webViewLink} (day: ${uploadedDayName})`);
    } catch (driveErr: any) {
      console.error(`[VideoUpload] Google Drive FAILED: ${driveErr.message}`);
      if (driveErr.driveAuthRequired) {
        res.status(403).json({ driveAuthRequired: true, error: "Reconecta tu cuenta de Google Drive para continuar." });
        return;
      }
      backupLink = finalVideoPath;
    }

    if (ideaId && driveVerified) {
      await db.update(videoIdeas).set({ recordedAt: new Date() }).where(eq(videoIdeas.id, ideaId));
    }

    let coverDriveLink = "";
    if (driveVerified) {
      try {
        const ideaDesc = ideaId
          ? (await db.select().from(videoIdeas).where(eq(videoIdeas.id, ideaId)).limit(1))?.[0]?.descripcion || ideaTitle
          : ideaTitle;
        console.log(`[Studio] Generating cover image for: "${ideaTitle}"`);
        const { generateCoverImage } = await import("./cover-generator");
        const coverResult = await generateCoverImage(ideaTitle, ideaDesc, true);
        if (typeof coverResult !== "string") {
          if (ideaId) {
            await db.update(videoIdeas).set({ coverImageUrl: coverResult.servePath }).where(eq(videoIdeas.id, ideaId));
          }
          try {
            const { uploadCoverToDriveFromBuffer } = await import("./google-drive");
            const coverUpload = await uploadCoverToDriveFromBuffer(coverResult.imageBuffer, ideaTitle, userId, coverResult.mimeType, driveFolderId);
            coverDriveLink = coverUpload.webViewLink;
            console.log(`[Studio] Cover uploaded to Drive: ${coverDriveLink}`);
          } catch (coverDriveErr: any) {
            console.warn(`[Studio] Cover Drive upload failed (saved locally): ${coverDriveErr.message}`);
          }
        }
      } catch (coverErr: any) {
        console.warn(`[Studio] Cover generation failed (non-blocking): ${coverErr.message}`);
      }
    }

    let descDriveLink = "";
    if (driveVerified && driveFolderId) {
      try {
        console.log(`[Studio] Generating social media descriptions for: "${ideaTitle}"`);
        const ideaDataForDesc = ideaId ? (await db.select().from(videoIdeas).where(eq(videoIdeas.id, ideaId)).limit(1))?.[0] : null;
        const vidDescText = ideaDataForDesc?.descripcion || ideaTitle;
        const vidGuionText = ideaDataForDesc?.guion || ideaGuion || "";

        const descPromptText = `Genera descripciones para redes sociales de un video de WebMakerChile (empresa chilena de tecnologia, automatizacion, software a medida, chatbots IA, apps moviles e integraciones).

TITULO DEL VIDEO: "${ideaTitle}"
DESCRIPCION: "${vidDescText}"
${vidGuionText ? `GUION/CONTENIDO: "${vidGuionText.substring(0, 500)}"` : ""}

Genera UN archivo de texto con descripciones para 3 plataformas, separadas claramente.

FORMATO EXACTO:

========================================
TIKTOK
========================================

[Descripcion corta, 1-2 lineas, emojis, 4-6 hashtags + #webmakerchile #automatizacion]

========================================
INSTAGRAM
========================================

[Descripcion 2-3 lineas, emojis, CTA, 10-15 hashtags + #webmakerchile #automatizacion #chile]

========================================
YOUTUBE SHORTS
========================================

[Descripcion 2-3 lineas, emojis, suscribirse, 5-8 hashtags + #webmakerchile #shorts]

REGLAS:
- NO uses markdown. Solo texto plano con emojis
- Hashtags en minusculas sin espacios
- Cada descripcion UNICA y adaptada a cada plataforma`;

        const descResp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: descPromptText }] }],
        });

        const descRaw = firstText(descResp.candidates?.[0]?.content?.parts);
        if (descRaw.trim()) {
          const cleanDescTxt = descRaw.replace(/\*\*/g, "").trim();
          const { uploadDescriptionsToDrive } = await import("./google-drive");
          const descUploadResult = await uploadDescriptionsToDrive(cleanDescTxt, ideaTitle, userId, driveFolderId);
          descDriveLink = descUploadResult.webViewLink;
          console.log(`[Studio] Descriptions uploaded to Drive: ${descDriveLink}`);
        }
      } catch (descGenErr: any) {
        console.warn(`[Studio] Description generation/upload failed (non-blocking): ${descGenErr.message}`);
      }
    }

    let tiktokPublished = false;
    let tiktokError: string | undefined;
    if (driveVerified && publishToTiktok) {
      try {
        console.log(`[Studio] Publishing to TikTok for user ${userId}...`);
        const user = req.user as any;
        if (!user.tiktokAccessToken || !user.tiktokOpenId) {
          tiktokError = "TikTok no conectado";
          console.warn("[Studio] TikTok publish skipped: not connected");
        } else {
          const { publishVideoFileToTikTok } = await import("../tiktok/index");
          const tiktokResult = await publishVideoFileToTikTok(finalVideoPath, user, ideaTitle);
          if (tiktokResult.success) {
            tiktokPublished = true;
            console.log(`[Studio] TikTok published: publishId=${tiktokResult.publishId}`);
          } else {
            tiktokError = tiktokResult.error || "Error al publicar en TikTok";
            console.error(`[Studio] TikTok publish failed: ${tiktokError}`);
          }
        }
      } catch (tiktokErr: any) {
        tiktokError = tiktokErr.message || "Error TikTok";
        console.error(`[Studio] TikTok publish error: ${tiktokError}`);
      }
    }

    const timeLabel = targetTime ? ` (${targetTime})` : "";
    if (driveVerified) {
      res.json({
        success: true,
        fileId,
        driveLink: webViewLink,
        driveVerified: true,
        dayName: uploadedDayName ? `${uploadedDayName}${timeLabel}` : undefined,
        coverDriveLink: coverDriveLink || undefined,
        descriptionsDriveLink: descDriveLink || undefined,
        message: `Video subido a carpeta ${uploadedDayName || "Drive"}${timeLabel}` + (coverDriveLink ? " con portada" : ""),
        tiktokPublished,
        tiktokError: tiktokError || undefined,
      });
    } else {
      res.json({
        success: false,
        driveVerified: false,
        backupLink: backupLink || undefined,
        message: backupLink ? "Drive fallo - video guardado en respaldo" : "ERROR: Drive fallo y no se pudo guardar el video.",
        tiktokPublished: false,
        tiktokError: tiktokError || undefined,
      });
    }
  } catch (error: any) {
    console.error("[Studio] Finalize error:", error);
    res.status(500).json({ error: error.message || "Error al subir el video" });
  } finally {
    const { unlink } = await import("fs/promises");
    for (const f of allTempFiles) { await unlink(f).catch(() => {}); }
  }
});

router.get("/studio/drive-structure", async (req, res) => {
  try {
    const userId = (req.user as any).id as number;
    const { listDriveStudioStructure } = await import("./google-drive");
    const structure = await listDriveStudioStructure(userId);
    res.json(structure);
  } catch (err: any) {
    console.error("[Studio] Drive structure error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/studio/drive-folder/:folderId", async (req, res) => {
  try {
    const userId = (req.user as any).id as number;
    const { listFilesInDriveFolder } = await import("./google-drive");
    const files = await listFilesInDriveFolder(req.params.folderId, userId);
    res.json({ folderId: req.params.folderId, files });
  } catch (err: any) {
    console.error("[Studio] Drive list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/studio/drive-file/:fileId", async (req, res) => {
  try {
    const userId = (req.user as any).id as number;
    const { trashDriveFile } = await import("./google-drive");
    const ok = await trashDriveFile(req.params.fileId, userId);
    res.json({ success: ok, fileId: req.params.fileId });
  } catch (err: any) {
    console.error("[Studio] Drive delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/studio/upload-video", (req, res, next) => {
  studioVideoUpload.single("video")(req, res, (err: any) => {
    if (err) {
      console.error("[studio] Multer error (upload-video):", err.message, "| code:", err.code);
      res.status(400).json({ error: "Error al recibir el archivo de video" });
      return;
    }
    next();
  });
}, async (req, res) => {
  const allTempFiles: string[] = [];
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se recibio ningun video" });
      return;
    }
    const uploadedFilePath = (req.file as any).path as string;
    allTempFiles.push(uploadedFilePath);
    console.log(`[Studio] Received video: ${(req.file.size / 1024 / 1024).toFixed(1)}MB, mime=${req.file.mimetype}, name=${req.file.originalname}`);

    const ideaId = req.body.ideaId ? parseInt(req.body.ideaId) : null;
    let ideaTitle = req.body.ideaTitle || "Video sin titulo";
    let ideaGuion = req.body.ideaGuion || "";
    const targetDay = typeof req.body.targetDay === "string" && req.body.targetDay.trim() ? req.body.targetDay.trim() : undefined;
    const targetTime = typeof req.body.targetTime === "string" && /^\d{1,2}:\d{2}$/.test(req.body.targetTime.trim()) ? req.body.targetTime.trim() : undefined;

    if (ideaId) {
      const idea = await db.select().from(videoIdeas).where(eq(videoIdeas.id, ideaId)).limit(1);
      if (idea.length > 0) {
        if (!req.body.ideaTitle) ideaTitle = idea[0].titulo;
        ideaGuion = idea[0].guion;
      }
    }

    const { exec: execCb } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(execCb);
    const { stat: fsStat } = await import("fs/promises");

    let hasFFmpeg = false;
    try { await execAsync("ffmpeg -version", { timeout: 5000 }); hasFFmpeg = true; } catch {}

    let finalVideoPath = uploadedFilePath;

    async function probeVideoUpload(filePath: string): Promise<{ width: number; height: number; rotation: number }> {
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -show_entries stream_side_data=rotation -of json "${filePath}"`,
          { timeout: 10000 }
        );
        const info = JSON.parse(stdout);
        const stream = info.streams?.[0] || {};
        const w = parseInt(stream.width) || 0;
        const h = parseInt(stream.height) || 0;
        let rot = 0;
        const sideData = stream.side_data_list || [];
        for (const sd of sideData) { if (sd.rotation) rot = parseInt(sd.rotation) || 0; }
        console.log(`[Studio Upload] Probe: ${w}x${h} rotation=${rot}`);
        return { width: w, height: h, rotation: rot };
      } catch { return { width: 0, height: 0, rotation: 0 }; }
    }

    if (hasFFmpeg) {
      const ts = Date.now();
      try {
        const probe = await probeVideoUpload(uploadedFilePath);
        const filters: string[] = [];
        const isLandscape = probe.width > probe.height && Math.abs(probe.rotation) !== 90 && Math.abs(probe.rotation) !== 270;
        if (isLandscape) {
          filters.push("transpose=1");
          console.log("[Studio Upload] Video is landscape -> rotating 90° clockwise");
        }
        filters.push("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
        const vf = filters.join(",");

        const outPath = path.join("/tmp", `studio-cfr-${ts}.mp4`);
        allTempFiles.push(outPath);
        await execAsync(
          `ffmpeg -y -i "${uploadedFilePath}" -vf "${vf}" -r 30 -c:v libx264 -preset fast -crf 18 -g 30 -pix_fmt yuv420p -profile:v main -level 4.2 -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${outPath}"`,
          { timeout: 180000 }
        );
        const outStats = await fsStat(outPath);
        if (!outStats.size || outStats.size < 100) throw new Error("Processed video empty");
        console.log(`[Studio Upload] Processed video: ${(outStats.size / 1024 / 1024).toFixed(1)}MB`);
        finalVideoPath = outPath;
      } catch (ffErr: any) {
        console.warn(`[Studio Upload] ffmpeg failed, uploading raw: ${ffErr.message}`);
        finalVideoPath = uploadedFilePath;
      }
    }

    const actualMimeType = finalVideoPath.endsWith(".webm") ? "video/webm" : "video/mp4";

    let fileId = "";
    let webViewLink = "";
    let driveFolderId = "";
    let driveVerified = false;
    let uploadedDayName = "";
    try {
      const { uploadVideoToDriveFromFile, clearFolderCache } = await import("./google-drive");
      clearFolderCache();
      const uploadUserId = (req.user as any).id as number;
      const driveResult = await uploadVideoToDriveFromFile(finalVideoPath, ideaTitle, uploadUserId, actualMimeType, targetDay, targetTime);
      fileId = driveResult.fileId;
      webViewLink = driveResult.webViewLink;
      driveFolderId = driveResult.driveFolderId;
      driveVerified = driveResult.verified;
      uploadedDayName = driveResult.dayName;
      console.log(`[Studio] Video VERIFIED in Drive: ${webViewLink} (day: ${uploadedDayName})`);
    } catch (driveErr: any) {
      console.error(`[VideoUpload] Google Drive FAILED: ${driveErr.message}`);
    }

    if (ideaId && driveVerified) {
      await db.update(videoIdeas).set({ recordedAt: new Date() }).where(eq(videoIdeas.id, ideaId));
    }

    let coverDriveLink = "";
    if (driveVerified) {
      try {
        const ideaDesc = ideaId
          ? (await db.select().from(videoIdeas).where(eq(videoIdeas.id, ideaId)).limit(1))?.[0]?.descripcion || ideaTitle
          : ideaTitle;
        console.log(`[Studio] Generating cover image for: "${ideaTitle}"`);
        const { generateCoverImage } = await import("./cover-generator");
        const coverResult = await generateCoverImage(ideaTitle, ideaDesc, true);
        if (typeof coverResult !== "string") {
          console.log(`[Studio] Cover generated: ${coverResult.servePath} (${(coverResult.imageBuffer.length / 1024).toFixed(0)}KB)`);
          if (ideaId) {
            await db.update(videoIdeas).set({ coverImageUrl: coverResult.servePath }).where(eq(videoIdeas.id, ideaId));
          }
          try {
            const { uploadCoverToDriveFromBuffer } = await import("./google-drive");
            const coverUpload2UserId = (req.user as any).id as number;
            const coverUpload = await uploadCoverToDriveFromBuffer(coverResult.imageBuffer, ideaTitle, coverUpload2UserId, coverResult.mimeType, driveFolderId);
            coverDriveLink = coverUpload.webViewLink;
            console.log(`[Studio] Cover uploaded to Drive: ${coverDriveLink}`);
          } catch (coverDriveErr: any) {
            console.error(`[Studio] Cover Drive upload failed: ${coverDriveErr.message}`);
          }
        } else {
          console.warn(`[Studio] Cover returned string instead of buffer: ${coverResult}`);
        }
      } catch (coverErr: any) {
        console.error(`[Studio] Cover generation failed: ${coverErr.message}`);
      }
    }

    const timeLabel2 = targetTime ? ` (${targetTime})` : "";
    if (driveVerified) {
      res.json({
        success: true,
        fileId,
        driveLink: webViewLink,
        driveVerified: true,
        dayName: uploadedDayName ? `${uploadedDayName}${timeLabel2}` : undefined,
        coverDriveLink: coverDriveLink || undefined,
        message: `Video subido a carpeta ${uploadedDayName || "Drive"}${timeLabel2}` + (coverDriveLink ? " con portada" : ""),
      });
    } else {
      res.json({
        success: false,
        driveVerified: false,
        message: "ERROR: Drive fallo. Reconectar Google Drive.",
      });
    }
  } catch (error: any) {
    console.error("[Studio] Upload error:", error);
    res.status(500).json({ error: error.message || "Error al subir el video" });
  } finally {
    const { unlink } = await import("fs/promises");
    for (const f of allTempFiles) { await unlink(f).catch(() => {}); }
  }
});

export default router;
