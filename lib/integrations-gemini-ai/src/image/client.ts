import { ai } from "../client";
import { toFile } from "openai";

export type ImageSize =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1024x1792"
  | "1792x1024";

type EditApiSize = "1024x1024" | "1024x1536" | "1536x1024";

function toEditApiSize(size: ImageSize): EditApiSize {
  if (size === "1024x1792") return "1024x1536";
  if (size === "1792x1024") return "1536x1024";
  return size;
}

export interface GenerateImageOptions {
  prompt: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  size?: ImageSize;
}

export async function generateImage(
  promptOrOptions: string | GenerateImageOptions
): Promise<{ b64_json: string; mimeType: string }> {
  const options =
    typeof promptOrOptions === "string"
      ? { prompt: promptOrOptions }
      : promptOrOptions;

  const requestedSize: ImageSize = options.size ?? "1024x1536";

  if (options.referenceImageBase64) {
    const mimeType = (options.referenceImageMimeType || "image/png") as string;
    const ext = mimeType.split("/")[1] || "png";
    const refBuf = Buffer.from(options.referenceImageBase64, "base64");
    const imageFile = await toFile(refBuf, `reference.${ext}`, { type: mimeType });
    const editSize = toEditApiSize(requestedSize);
    const response = await ai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: options.prompt,
      size: editSize,
    });
    const b64_json = response.data?.[0]?.b64_json ?? "";
    if (!b64_json) throw new Error("No image data in response");
    return { b64_json, mimeType: "image/png" };
  }

  const response = await ai.images.generate({
    model: "gpt-image-1",
    prompt: options.prompt,
    n: 1,
    size: toEditApiSize(requestedSize),
  });

  const b64_json = response.data?.[0]?.b64_json ?? "";
  if (!b64_json) throw new Error("No image data in response");
  return { b64_json, mimeType: "image/png" };
}

export { ai };
