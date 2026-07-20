import { ai } from "../client";
import { toFile } from "openai";

export interface GenerateImageOptions {
  prompt: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}

export async function generateImage(
  promptOrOptions: string | GenerateImageOptions
): Promise<{ b64_json: string; mimeType: string }> {
  const options =
    typeof promptOrOptions === "string"
      ? { prompt: promptOrOptions }
      : promptOrOptions;

  const size = options.size ?? "1024x1536";

  if (options.referenceImageBase64) {
    const mimeType = (options.referenceImageMimeType || "image/png") as string;
    const ext = mimeType.split("/")[1] || "png";
    const refBuf = Buffer.from(options.referenceImageBase64, "base64");
    const imageFile = await toFile(refBuf, `reference.${ext}`, { type: mimeType });
    const response = await ai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: options.prompt,
      size,
    });
    const b64_json = response.data?.[0]?.b64_json ?? "";
    if (!b64_json) throw new Error("No image data in response");
    return { b64_json, mimeType: "image/png" };
  }

  const response = await ai.images.generate({
    model: "gpt-image-1",
    prompt: options.prompt,
    n: 1,
    size,
  });

  const b64_json = response.data?.[0]?.b64_json ?? "";
  if (!b64_json) throw new Error("No image data in response");
  return { b64_json, mimeType: "image/png" };
}

export { ai };
