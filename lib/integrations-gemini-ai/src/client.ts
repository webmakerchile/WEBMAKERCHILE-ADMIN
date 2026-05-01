import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY must be set. Please add your Google Gemini API key as a secret.",
  );
}

export const ai = new GoogleGenAI(
  baseUrl
    ? {
        apiKey,
        httpOptions: {
          apiVersion: "",
          baseUrl,
        },
      }
    : { apiKey },
);
