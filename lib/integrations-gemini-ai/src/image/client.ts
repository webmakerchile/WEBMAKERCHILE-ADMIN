import { GoogleGenAI, Modality } from "@google/genai";

if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_API_KEY must be set. Did you forget to provision the Gemini AI integration?",
  );
}

export const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export interface GenerateImageOptions {
  prompt: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

export async function generateImage(
  promptOrOptions: string | GenerateImageOptions
): Promise<{ b64_json: string; mimeType: string }> {
  const options = typeof promptOrOptions === "string"
    ? { prompt: promptOrOptions }
    : promptOrOptions;

  const parts: any[] = [];

  if (options.referenceImageBase64) {
    parts.push({
      inlineData: {
        data: options.referenceImageBase64,
        mimeType: options.referenceImageMimeType || "image/jpeg",
      },
    });
  }

  parts.push({ text: options.prompt });

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
