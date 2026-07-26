// ADAPTADOR HONESTO: este módulo expone una interfaz con forma de API Gemini
// (`ai.models.generateContent`) pero SIEMPRE llama a OpenAI por debajo:
// texto → gpt-4.1 / gpt-4.1-mini, imágenes → gpt-image-1. Los nombres de
// modelo "gemini-*" que reciben estas funciones solo se usan para elegir el
// modelo OpenAI equivalente.
import OpenAI, { toFile } from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

if (!apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI integration?",
  );
}

const openai = new OpenAI({ apiKey, baseURL });

// Modelo de imágenes: intercambiable por env para pruebas A/B entre
// generaciones de modelos (p. ej. AI_IMAGE_MODEL=gpt-image-2). Se lee en cada
// llamada — no al cargar el módulo — para que scripts de comparación puedan
// alternarlo en caliente. Sin la variable, el comportamiento es el de siempre.
export const imageModel = (): string => process.env.AI_IMAGE_MODEL || "gpt-image-1";

type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

// Únicos tamaños que soporta gpt-image-1. El llamador debe elegir el más
// cercano al aspecto deseado y recortar después al aspecto exacto (con sharp).
export type SupportedImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type GeminiConfig = {
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseModalities?: string[];
  temperature?: number;
  // Tamaño a pedir a gpt-image-1 cuando se solicita una imagen.
  imageSize?: SupportedImageSize;
  // Fidelidad respecto a la imagen de referencia en edits: "high" preserva
  // rostros/identidad de la foto original (clave para personas reales).
  inputFidelity?: "high" | "low";
};

function contentsToMessages(contents: GeminiContent[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return contents.map((c) => {
    const role = c.role === "model" ? "assistant" : "user";
    const content: OpenAI.Chat.ChatCompletionContentPart[] = c.parts.map((p) => {
      if ("text" in p) {
        return { type: "text", text: p.text };
      } else if ("inlineData" in p) {
        return {
          type: "image_url",
          image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
        } as OpenAI.Chat.ChatCompletionContentPartImage;
      }
      return { type: "text", text: "" };
    });
    if (content.length === 1 && content[0].type === "text") {
      return { role, content: (content[0] as any).text } as OpenAI.Chat.ChatCompletionMessageParam;
    }
    return { role, content } as OpenAI.Chat.ChatCompletionMessageParam;
  });
}

// Detecta el 400 de "parámetro no soportado" del SDK de OpenAI usando campos
// estructurados (status + param) y, solo como último recurso, el mensaje.
function esParametroNoSoportado(err: unknown, param: string): boolean {
  const e = err as {
    status?: number;
    param?: string | null;
    error?: { param?: string | null };
    message?: string;
  } | null;
  if (typeof e?.status === "number" && e.status !== 400) return false;
  const p = e?.param ?? e?.error?.param;
  if (p) return p === param;
  return typeof e?.message === "string" && e.message.toLowerCase().includes(param);
}

function pickTextModel(geminiModel: string): string {
  if (geminiModel.includes("flash")) return "gpt-4.1-mini";
  return "gpt-4.1";
}

async function generateContentImpl(
  model: string,
  contents: GeminiContent[],
  config?: GeminiConfig,
) {
  const wantsImage =
    config?.responseModalities?.some((m) => m.toLowerCase().includes("image")) ?? false;

  if (wantsImage) {
    const textParts = contents.flatMap((c) => c.parts.filter((p): p is { text: string } => "text" in p));
    const imageParts = contents.flatMap((c) =>
      c.parts.filter((p): p is { inlineData: { data: string; mimeType: string } } => "inlineData" in p)
    );
    const prompt = textParts.map((p) => p.text).join("\n");
    // Tamaño configurable: el llamador pide el soportado más cercano al aspecto
    // final deseado y recorta después (antes estaba fijo en 1024x1536).
    const size: SupportedImageSize = config?.imageSize ?? "1024x1536";

    if (imageParts.length > 0) {
      const ref = imageParts[0].inlineData;
      const refBuf = Buffer.from(ref.data, "base64");
      // Respetar el MIME real de la referencia (foto de persona puede ser JPG/WebP).
      const refMime = ref.mimeType || "image/png";
      const ext = refMime.includes("jpeg") ? "jpg" : refMime.includes("webp") ? "webp" : "png";
      const imageFile = await toFile(refBuf, `reference.${ext}`, { type: refMime });
      // "high" hace que gpt-image-1 conserve el rostro/identidad de la foto.
      // Algunos modelos (p. ej. gpt-image-2) rechazan el parámetro con 400:
      // en ese caso se reintenta UNA vez sin él, en vez de fallar toda la
      // generación por un parámetro de afinado.
      const model = imageModel(); // fijado por operación: llamada y reintento usan el mismo modelo
      let resp: OpenAI.Images.ImagesResponse;
      try {
        resp = await openai.images.edit({
          model,
          image: imageFile,
          prompt,
          size,
          input_fidelity: config?.inputFidelity,
        });
      } catch (err) {
        if (config?.inputFidelity && esParametroNoSoportado(err, "input_fidelity")) {
          console.warn(`[gemini-ai] ${model} no soporta input_fidelity; reintento sin el parámetro`);
          resp = await openai.images.edit({
            model,
            image: imageFile,
            prompt,
            size,
          });
        } else {
          throw err;
        }
      }
      const b64 = resp.data?.[0]?.b64_json ?? "";
      return {
        candidates: [{
          content: {
            parts: [{ inlineData: { data: b64, mimeType: "image/png" } }],
          },
        }],
      };
    } else {
      const resp = await openai.images.generate({
        model: imageModel(),
        prompt,
        n: 1,
        size,
      });
      const b64 = resp.data?.[0]?.b64_json ?? "";
      return {
        candidates: [{
          content: {
            parts: [{ inlineData: { data: b64, mimeType: "image/png" } }],
          },
        }],
      };
    }
  }

  const messages = contentsToMessages(contents);
  const textModel = pickTextModel(model);
  const resp = await openai.chat.completions.create({
    model: textModel,
    messages,
    max_completion_tokens: config?.maxOutputTokens ?? 8192,
  });
  const text = resp.choices[0]?.message?.content ?? "";
  return {
    candidates: [{
      content: {
        parts: [{ text }],
      },
    }],
    text,
  };
}

async function* generateContentStreamImpl(
  model: string,
  contents: GeminiContent[],
  config?: GeminiConfig,
) {
  const messages = contentsToMessages(contents);
  const textModel = pickTextModel(model);
  const stream = await openai.chat.completions.create({
    model: textModel,
    messages,
    stream: true,
    max_completion_tokens: config?.maxOutputTokens ?? 8192,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    yield { text, candidates: [{ content: { parts: [{ text }] } }] };
  }
}

export const ai = {
  models: {
    generateContent: (params: { model: string; contents: GeminiContent[]; config?: GeminiConfig }) =>
      generateContentImpl(params.model, params.contents, params.config),
    generateContentStream: (params: { model: string; contents: GeminiContent[]; config?: GeminiConfig }) =>
      generateContentStreamImpl(params.model, params.contents, params.config),
  },
  images: openai.images,
  _openai: openai,
};
